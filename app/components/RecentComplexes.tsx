"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

/* ============================================================
   최근 본 단지 (호갱노노 벤치마크 — 재방문 동선 단축)
   localStorage nz_recent_complexes · 최대 8개 · 최신순
   - RecentComplexRecorder: /complex/[id] 방문 시 기록 (렌더 없음)
   - RecentComplexChips: /search 등에서 칩 행 노출 (기록 있을 때만)
   ============================================================ */

const KEY = "nz_recent_complexes";
const MAX = 8;

export interface RecentComplex {
  id: string;
  name: string;
  region?: string;
  /** 마지막 방문 시각 (epoch ms) */
  at: number;
}

function readRecents(): RecentComplex[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (v): v is RecentComplex =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentComplex).id === "string" &&
          typeof (v as RecentComplex).name === "string" &&
          typeof (v as RecentComplex).at === "number",
      )
      .slice(0, MAX);
  } catch {
    return []; // 파싱 실패·프라이빗 모드 — 조용히 무시
  }
}

function writeRecents(list: RecentComplex[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장 불가 환경 — no-op
  }
}

/** /complex/[id] 방문 기록 — 목업 폴백(id가 mock-*)은 기록하지 않음 */
export function RecentComplexRecorder({
  id,
  name,
  region,
}: {
  id: string;
  name: string;
  region?: string;
}) {
  useEffect(() => {
    if (!id || id.startsWith("mock")) return;
    const next: RecentComplex[] = [
      { id, name, region, at: Date.now() },
      ...readRecents().filter((r) => r.id !== id),
    ];
    writeRecents(next);
    // B8 — 로그인 사용자면 서버에도 기록(크로스디바이스). 비로그인은 API가 no-op.
    void fetch("/api/me/recent-complexes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, region }),
      keepalive: true,
    }).catch(() => {});
  }, [id, name, region]);
  return null;
}

/* [967 · 27] 이 훅은 홈에서 히어로 검색(모바일·데스크톱)과 "내 관심" 레일이 같이 쓴다 —
   한 페이지에서 네 번 마운트된다. 서버 기록 조회는 한 번이면 되므로 같은 페이지 수명
   안의 짧은 공유 캐시로 접는다(getSessionLite 와 같은 방식). 실패는 캐시하지 않는다.
   삭제(remove)는 캐시를 비워 다음 마운트가 서버를 다시 본다. */
const SERVER_RECENTS_TTL_MS = 30_000;
let serverRecentsCache: { at: number; promise: Promise<{ items?: RecentComplex[] } | null> } | null = null;
function fetchServerRecents(): Promise<{ items?: RecentComplex[] } | null> {
  if (serverRecentsCache && Date.now() - serverRecentsCache.at < SERVER_RECENTS_TTL_MS) {
    return serverRecentsCache.promise;
  }
  const promise = fetch("/api/me/recent-complexes", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ items?: RecentComplex[] }>) : null))
    .catch(() => null)
    .then((j) => {
      if (j === null && serverRecentsCache?.promise === promise) serverRecentsCache = null;
      return j;
    });
  serverRecentsCache = { at: Date.now(), promise };
  return promise;
}

/**
 * 최근 본 단지 목록 훅 — localStorage 즉시 표시 후 서버 기록과 병합.
 *
 * 원래 이 로직은 `RecentComplexChips` 안에만 있었다. 그런데 그 컴포넌트를 쓰는 곳이
 * 한 군데도 없어서(importer 0), 방문 기록은 서버에 쌓이는데 그걸 보여주는 화면이
 * 레포 어디에도 없는 상태였다. 홈 "이어서 보기" 패널이 같은 데이터를 쓰도록
 * 훅으로 빼서, 읽기 경로를 실제로 사용자에게 연결한다.
 */
export function useRecentComplexes(): {
  items: RecentComplex[];
  /** 서버 병합 응답 전인지 — 빈 목록과 "아직 못 불러옴"을 구분하기 위함 */
  loading: boolean;
  remove: (id: string) => void;
} {
  const [items, setItems] = useState<RecentComplex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const local = readRecents();
    setItems(local);
    // B8 — 로그인 사용자는 서버 기록과 병합(크로스디바이스). 최신순·id 중복 제거.
    let cancelled = false;
    fetchServerRecents()
      .then((j: { items?: RecentComplex[] } | null) => {
        if (cancelled) return;
        if (!j || !Array.isArray(j.items) || j.items.length === 0) return;
        const merged = new Map<string, RecentComplex>();
        for (const r of [...j.items, ...local]) {
          const prev = merged.get(r.id);
          if (!prev || (r.at ?? 0) > (prev.at ?? 0)) merged.set(r.id, r);
        }
        const list = [...merged.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, MAX);
        setItems(list);
        writeRecents(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = (id: string) => {
    serverRecentsCache = null; // [967 · 27] 지운 항목이 캐시에서 되살아나지 않게
    setItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeRecents(next);
      return next;
    });
    // B8 — 서버에서도 제거(로그인 시). 비로그인은 no-op.
    void fetch("/api/me/recent-complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  return { items, loading, remove };
}

/** 최근 본 단지 칩 행 — 기록이 있을 때만 렌더 */
export function RecentComplexChips({
  className,
  onResolved,
}: {
  className?: string;
  /** [967 · 27] 목록이 확정될 때마다(로컬 즉시 → 서버 병합 뒤) 비었는지 알린다 —
      홈 "내 관심" 레일이 자식이 모두 비면 레일째 숨기기 위해. */
  onResolved?: (hasContent: boolean) => void;
}) {
  const { items, loading, remove } = useRecentComplexes();
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  useEffect(() => {
    /* 로컬 기록은 마운트 직후 items 에 들어오고, 서버 병합은 loading 이 끝나며 확정된다.
       둘 중 어느 시점이든 "있음"은 곧바로, "없음"은 병합이 끝난 뒤에만 말한다 —
       서버 기록이 오기 전에 없다고 단정하면 레일이 깜빡인다. */
    if (items.length > 0) onResolvedRef.current?.(true);
    else if (!loading) onResolvedRef.current?.(false);
  }, [items, loading]);

  if (items.length === 0) return null;

  return (
    <div className={`rise-in flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="px-1 text-xs font-extrabold text-text-3">최근 본 단지</div>
      <div className="flex flex-wrap gap-[5px]">
        {items.map((r) => (
          <span
            key={r.id}
            className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 text-[12px] text-text-2"
          >
            <Link
              href={complexHrefFromId(r.id)}
              className="font-semibold text-text-1"
            >
              {r.name}
              {r.region ? <span className="ml-1 text-text-3">{r.region}</span> : null}
            </Link>
            <button
              type="button"
              onClick={() => remove(r.id)}
              aria-label={`최근 본 단지 ${r.name} 삭제`}
              className="text-text-3"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
