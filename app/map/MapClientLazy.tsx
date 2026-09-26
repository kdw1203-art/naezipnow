"use client";

/* [OPT-06·26] 지도 클라이언트(5,300줄) 지연 로드 경계.
   서버 컴포넌트에서는 next/dynamic 의 ssr:false 를 쓸 수 없어서, 이 얇은
   클라이언트 파일이 경계가 된다. 효과 두 가지:
   ① /map 첫 페인트가 지도 JS 다운로드·파싱을 기다리지 않는다(스켈레톤 즉시).
   ② 트리의 서버 렌더(SSR) 비용이 사라진다 — HTML 도 가벼워진다.

   [1007] **진입값 해석도 여기서 한다.** 예전 page.tsx 는 `auth()` 와 `searchParams` 를 서버에서
   읽어 force-dynamic 이었고 24h 실측 함수 호출 911회 중 사람 방문은 한 자릿수였다. 페이지는
   공유분(좌표·시세·세대수 — 모두에게 같은 값)만 ISR(10분)에 싣고, 세션·주소에 달린 초기값은
   마운트 뒤 여기서 만들어 MapClient 에 **예전과 같은 props** 로 넘긴다(map-client.tsx 는 손대지
   않았다 — 초기 props 의 출처만 바뀌었다). MapClient 는 어차피 ssr:false 라 하이드레이션 걱정이
   없고, 해석(세션 프로브·지역 좌표·노트/단지 해석)은 청크 다운로드와 **동시에** 돈다.
     · ?region/?district/?q → /api/regions/search(CDN 24h)   (예전 resolveRegionFocus = 같은 RPC)
     · ?complexId           → 패널이 상세를 받으며 좌표·이름을 채운다(onLoaded, 예전에도 그랬다)
     · ?noteId              → /api/inspection/notes/{id} → 노트의 단지·지역
     · ?apt                 → /api/search/suggest(단지명 → id·좌표)
     · 로그인               → 내 노트 레이어 기본 ON · 내 노트 수 덧입힘(/api/inspection/notes) ·
                              URL 에 가격이 없으면 온보딩 예산 프리필(/api/me/preferences)
   판정 규칙은 lib/map/entry-params(순수·테스트). */
import nextDynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import type { MapClient } from "./map-client";
import { getSessionLite } from "@/lib/client/session-lite";
import {
  budgetFromEntry,
  countNotesByName,
  listingTypeFromEntry,
  overlayMyNoteCounts,
  parseMapEntryParams,
  regionForFocus,
  type MapEntryBudget,
  type MapEntryParams,
} from "@/lib/map/entry-params";

const LazyInner = nextDynamic(() => import("./map-client").then((m) => m.MapClient), {
  ssr: false,
  /* 자리표시자는 **실제 지도와 같은 상자**여야 한다.
     예전에는 h-[70vh] 였는데 진짜 지도는 `fixed inset-0 h-[100dvh]` 다. 그래서 /map 을 열면
     라우트 스켈레톤(100dvh) → 이 자리표시자(70vh) → 실제 지도(fixed 100dvh) 로 **두 번**
     크게 튀었다. 게다가 fixed 로 바뀌는 순간 문서 흐름에서 빠져 아래 것들이 통째로 딸려
     올라간다. 프로덕션 CLS p75 0.825 의 주범이다 — 같은 상자로 맞춰 이동을 0 으로 만든다. */
  loading: () => <MapPlaceholder />,
});

function MapPlaceholder() {
  return (
    <div
      className="fixed inset-0 h-[100dvh] w-full animate-pulse bg-gradient-to-br from-line to-line-strong"
      aria-busy="true"
      aria-label="지도 불러오는 중"
    >
      <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 t-sub font-semibold text-white">
        지도를 불러오는 중…
      </p>
    </div>
  );
}

type MapClientProps = ComponentProps<typeof MapClient>;

/** 서버(ISR)가 주는 공유분 — 세션·주소에 달린 초기값은 받지 않는다 */
type SharedProps = Pick<
  MapClientProps,
  "danji" | "regionLabel" | "regionMarkers" | "danjiLoadFailed" | "regionMarkersLoadFailed" | "ncpKeyId"
>;

type Focus = NonNullable<MapClientProps["initialFocus"]>;
type ComplexFocus = NonNullable<MapClientProps["initialComplexFocus"]>;

type Entry = {
  initialFocus: Focus | null;
  initialComplexFocus: ComplexFocus | null;
  initialBudget: MapEntryBudget | null;
  initialListingType: string | null;
  initialLevel: number | null;
  initialMyNotes: boolean;
  myNoteCounts: Map<string, number>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return null;
    return (await r.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** ?region= 같은 이름 → legal_regions 좌표. 못 찾거나 좌표가 없으면 null(지도는 기본 화면) */
async function resolveRegionFocus(name: string | null): Promise<Focus | null> {
  const q = name?.trim();
  if (!q) return null;
  const j = await fetchJson<{ items?: { name: string; lat: number | null; lng: number | null }[] }>(
    `/api/regions/search?q=${encodeURIComponent(q)}&limit=1`,
  );
  const row = j?.items?.[0];
  if (!row || row.lat == null || row.lng == null) return null;
  return { name: row.name, lat: Number(row.lat), lng: Number(row.lng) };
}

/** 단지명(+지역) → 단지 id·좌표. 예전 resolveComplexHref 의 자리 — 같은 지역의 첫 후보를 고른다.
 *  [1008 · S · 리뷰 B] '비슷한 이름'(fuzzy — 오타 추정)은 고르지 않는다. 예전엔 첫 후보(list[0])를 그대로 골라
 *  "광교 호수공원" 이 호수공원(대림1)@안산 단원구(비슷한 이름 1건)로 지도를 옮겼다. 확실한 일치가 없으면
 *  단지 포커스 없이 연다(지도는 기본 화면 — 틀린 단지를 가리키는 것보다 낫다). */
async function resolveComplexByName(
  apt: string,
  region: string | null,
  noteId: string | null,
): Promise<ComplexFocus | null> {
  const j = await fetchJson<{
    suggestions?: {
      id: string;
      name: string;
      region: string;
      lat?: number | null;
      lng?: number | null;
      fuzzy?: boolean;
    }[];
  }>(`/api/search/suggest?q=${encodeURIComponent(apt)}`);
  const list = (j?.suggestions ?? []).filter((s) => !s.fuzzy);
  if (list.length === 0) return null;
  const regionKey = (region ?? "").replace(/\s+/g, "");
  const hit =
    (regionKey && list.find((s) => (s.region ?? "").replace(/\s+/g, "").includes(regionKey))) ||
    list[0];
  return {
    id: hit.id,
    name: hit.name || apt,
    noteId,
    lat: hit.lat ?? null,
    lng: hit.lng ?? null,
  };
}

/** 노트→지도 핸드오프: complexId 우선, 없으면 noteId/apt 로 단지 해석(예전 page.tsx 와 같은 순서) */
async function resolveComplexFocus(
  p: MapEntryParams,
): Promise<{ focus: ComplexFocus | null; regionFromNote: string | null }> {
  if (p.complexId) {
    /* 좌표·정식 이름은 단지 패널이 상세(/api/complex/{id}/detail)를 받으며 채운다(onLoaded).
       여기서 같은 상세를 한 번 더 부르면 함수 호출만 는다. */
    return {
      focus: { id: p.complexId, name: p.apt ?? "단지", noteId: p.noteId, lat: null, lng: null },
      regionFromNote: null,
    };
  }
  if (p.noteId) {
    const j = await fetchJson<{
      note?: {
        region?: string;
        aptName?: string | null;
        metadata?: { complexId?: unknown; lat?: unknown; lng?: unknown } | null;
      } | null;
    }>(`/api/inspection/notes/${encodeURIComponent(p.noteId)}`, { cache: "no-store" });
    const note = j?.note;
    if (note) {
      const regionFromNote = note.region?.trim() || null;
      const meta = note.metadata ?? null;
      const cid = typeof meta?.complexId === "string" && meta.complexId.trim() ? meta.complexId.trim() : null;
      const lat = Number(meta?.lat);
      const lng = Number(meta?.lng);
      if (cid) {
        return {
          focus: {
            id: cid,
            name: note.aptName?.trim() || cid,
            noteId: p.noteId,
            lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
            lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
          },
          regionFromNote,
        };
      }
      if (note.aptName?.trim()) {
        return {
          focus: await resolveComplexByName(note.aptName.trim(), regionFromNote, p.noteId),
          regionFromNote,
        };
      }
      return { focus: null, regionFromNote };
    }
  }
  if (p.apt) {
    return { focus: await resolveComplexByName(p.apt, p.region, p.noteId), regionFromNote: null };
  }
  return { focus: null, regionFromNote: null };
}

/** 로그인 사용자의 개인분 — 내 노트 수·온보딩 예산. 실패는 조용히 빈 값(레이어는 손으로 켤 수 있다) */
async function resolvePersonal(
  needBudget: boolean,
): Promise<{ signedIn: boolean; counts: Map<string, number>; budget: MapEntryBudget | null }> {
  const s = await getSessionLite();
  if (!s?.user?.email) return { signedIn: false, counts: new Map(), budget: null };
  const [notes, prefs] = await Promise.all([
    fetchJson<{ items?: { aptName?: string | null }[] }>("/api/inspection/notes", { cache: "no-store" }),
    needBudget
      ? fetchJson<{ budget?: { type?: string; min?: number | null; max?: number | null; label?: string | null } | null }>(
          "/api/me/preferences",
          { cache: "no-store" },
        )
      : Promise.resolve(null),
  ]);
  const counts = countNotesByName((notes?.items ?? []).map((n) => n.aptName));
  const b = prefs?.budget;
  const budget: MapEntryBudget | null = b
    ? {
        type: b.type === "jeonse" ? "jeonse" : "sale",
        minEok: typeof b.min === "number" ? b.min : null,
        maxEok: typeof b.max === "number" ? b.max : null,
        label: typeof b.label === "string" ? b.label : null,
      }
    : null;
  return { signedIn: true, counts, budget };
}

async function resolveEntry(search: string): Promise<Entry> {
  const p = parseMapEntryParams(search);
  const urlBudget = budgetFromEntry(p);
  const [personal, complex] = await Promise.all([
    resolvePersonal(urlBudget === null),
    resolveComplexFocus(p).catch(() => ({ focus: null, regionFromNote: null })),
  ]);
  const regionName = regionForFocus(p, complex.regionFromNote);
  const resolvedFocus = await resolveRegionFocus(regionName);
  /* 이름 해석이 이긴다(정규화된 display_name). 못 풀렸을 때만 넘겨받은 좌표를 쓴다 —
     좌표 단독(?lat&lng 만) 진입도 허용(idle 이 써 둔 공유 URL 은 지역명이 없다). */
  const initialFocus =
    resolvedFocus ??
    (p.coordFocus ? { name: regionName ?? "", lat: p.coordFocus.lat, lng: p.coordFocus.lng } : null);
  const initialBudget = urlBudget ?? personal.budget;
  return {
    initialFocus,
    initialComplexFocus: complex.focus,
    initialBudget,
    initialListingType: listingTypeFromEntry(p, initialBudget),
    initialLevel: p.initialLevel,
    initialMyNotes: personal.signedIn,
    myNoteCounts: personal.counts,
  };
}

export function MapClientLazy(props: SharedProps) {
  const [entry, setEntry] = useState<Entry | null>(null);
  useEffect(() => {
    let cancelled = false;
    /* 청크는 해석과 동시에 받는다 — 해석이 끝날 때쯤 대개 이미 와 있다 */
    void import("./map-client");
    let search = "";
    try {
      search = window.location.search;
    } catch {
      search = "";
    }
    resolveEntry(search)
      .catch(() => ({
        initialFocus: null,
        initialComplexFocus: null,
        initialBudget: null,
        initialListingType: null,
        initialLevel: null,
        initialMyNotes: false,
        myNoteCounts: new Map<string, number>(),
      }))
      .then((e) => {
        if (!cancelled) setEntry(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 덧입힌 목록은 한 번만 만든다 — 렌더마다 새 배열이면 MapClient 의 danji 의존 효과가 다시 돈다 */
  const danji = useMemo(
    () => (entry ? overlayMyNoteCounts(props.danji, entry.myNoteCounts) : props.danji),
    [entry, props.danji],
  );

  if (!entry) return <MapPlaceholder />;
  return (
    <LazyInner
      {...props}
      danji={danji}
      initialLevel={entry.initialLevel}
      initialMyNotes={entry.initialMyNotes}
      initialFocus={entry.initialFocus}
      initialComplexFocus={entry.initialComplexFocus}
      initialBudget={entry.initialBudget}
      initialListingType={entry.initialListingType}
    />
  );
}
