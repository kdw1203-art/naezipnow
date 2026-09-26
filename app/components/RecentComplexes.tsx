"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { getSessionLite } from "@/lib/client/session-lite";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { dedupeRecents } from "@/lib/recent-complexes/dedupe";
import { useToast } from "@/app/components/toast/ToastProvider";

/* ============================================================
   최근 본 단지 (호갱노노 벤치마크 — 재방문 동선 단축)
   localStorage nz_recent_complexes · 최대 8개 · 최신순
   - RecentComplexRecorder: /complex/[id] 방문 시 기록 (렌더 없음)
   - RecentComplexChips: /search 등에서 칩 행 노출 (기록 있을 때만)
   [1002] 중복 제거는 id 만이 아니라 지역+이름으로도 한다(lib/recent-complexes/dedupe).
   같은 단지가 옛 이름 id·새 kapt id 로 두 번 기록돼 "공작아파트"가 두 칸 떴었다.
   읽기(readRecents)·기록(Recorder)·서버 병합 세 곳이 같은 함수를 쓴다.
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
    /* [1002] 이미 저장된 중복(옛 id·새 id 한 쌍)도 읽는 자리에서 접는다 — 다시 방문하기
       전까지 두 칸으로 남아 있지 않게. */
    return dedupeRecents(
      arr.filter(
        (v): v is RecentComplex =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentComplex).id === "string" &&
          typeof (v as RecentComplex).name === "string" &&
          typeof (v as RecentComplex).at === "number",
      ),
      MAX,
    );
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
    /* 새 기록이 가장 최근(at)이라 같은 id 든 같은 지역+이름이든 이 한 건만 남는다 */
    const next: RecentComplex[] = dedupeRecents(
      [{ id, name, region, at: Date.now() }, ...readRecents()],
      MAX,
    );
    writeRecents(next);
    // B8 — 로그인 사용자면 서버에도 기록(크로스디바이스). 비로그인은 API가 no-op.
    /* [1007 · V2a-2] 힌트 쿠키(nz_authed)가 없으면 아예 보내지 않는다 — 실측 /api/me/recent-complexes
       203회/일의 대부분이 단지 페이지(8,907회/일, 거의 크롤러)마다 나가던 이 no-op POST 였다. */
    if (!readAuthedHint()) return;
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

/* [1009 · T 리뷰] 지운 칸의 서버 DELETE 는 되돌리기 창(토스트 5초 + 사라지는 0.2초)이 지난 뒤에 보낸다 — 창 안에서 되돌리면
   서버는 건드리지 않아 원래 방문 시각(viewed_at)이 그대로 남는다. 예전엔 지우자마자 DELETE, 되돌리면 POST 였는데
   POST 는 viewed_at 을 "지금"으로 기록해(API 가 시각을 받지 않는다) 다음 병합 때 순서가 바뀌었고, POST 가 DELETE 보다
   먼저 닿으면 지워진 채로 남았다. 페이지를 떠나면(pagehide·언마운트) 미뤄 둔 DELETE 를 keepalive 로 바로 보낸다.
   이 페이지 수명 동안 지운 id 는 서버 병합에서도 빼 둔다(DELETE 가 닿기 전 GET 이 되살리지 않게). */
const UNDO_WINDOW_MS = 5_500;
const removedIds = new Set<string>();
let serverRecentsCache: { at: number; promise: Promise<{ items?: RecentComplex[] } | null> } | null = null;
function fetchServerRecents(): Promise<{ items?: RecentComplex[] } | null> {
  if (serverRecentsCache && Date.now() - serverRecentsCache.at < SERVER_RECENTS_TTL_MS) {
    return serverRecentsCache.promise;
  }
  /* [968 · 8] 세션을 먼저 본다 — 비로그인에게 서버는 어차피 `{ items: [] }` 를 돌려주므로
     요청 자체가 낭비였다(게스트 홈마다 1회). 세션 조회는 헤더가 이미 하고 모듈 캐시를
     공유하니 요청이 늘지 않는다. 비로그인 결과(null)는 캐시하지 않는다 — 로그인 직후
     같은 페이지 수명 안에서 다시 시도할 수 있게. */
  const promise = getSessionLite()
    .then((s) => {
      if (!s?.user?.email) return null;
      return fetch("/api/me/recent-complexes", { cache: "no-store" }).then((r) =>
        r.ok ? (r.json() as Promise<{ items?: RecentComplex[] }>) : null,
      );
    })
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
export function useRecentComplexes(
  /** [968 · 8] false 면 읽기·병합을 시작하지 않는다 — 홈의 안 보이는 벌(모바일/데스크톱
      섹션 중 뷰포트에 없는 쪽)이 로컬 읽기·서버 조회를 반복하지 않게. 기본 true. */
  enabled = true,
): {
  items: RecentComplex[];
  /** 서버 병합 응답 전인지 — 빈 목록과 "아직 못 불러옴"을 구분하기 위함 */
  loading: boolean;
  remove: (id: string) => void;
  /** [1009 · T] 방금 지운 칸을 되살린다(토스트 "되돌리기") — 원래 자리(시각)로 */
  restore: (item: RecentComplex) => void;
} {
  const [items, setItems] = useState<RecentComplex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const local = readRecents();
    setItems(local);
    // B8 — 로그인 사용자는 서버 기록과 병합(크로스디바이스). 최신순·id/지역+이름 중복 제거.
    let cancelled = false;
    fetchServerRecents()
      .then((j: { items?: RecentComplex[] } | null) => {
        if (cancelled) return;
        if (!j || !Array.isArray(j.items) || j.items.length === 0) return;
        const server = j.items.filter((r) => !removedIds.has(r.id));
        const list = dedupeRecents([...server, ...local], MAX);
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
  }, [enabled]);

  /* 미뤄 둔 서버 DELETE(id → 타이머)와 보낸 DELETE(id → 응답 약속) — 되돌리기가 순서를 지키게 */
  const pendingDeletes = useRef(new Map<string, number>());
  const sentDeletes = useRef(new Map<string, Promise<unknown>>());
  const sendDelete = useCallback((id: string) => {
    const t = pendingDeletes.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    pendingDeletes.current.delete(id);
    const req = fetch("/api/me/recent-complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
    sentDeletes.current.set(id, req);
  }, []);
  useEffect(() => {
    const flush = () => {
      for (const id of [...pendingDeletes.current.keys()]) sendDelete(id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [sendDelete]);

  const remove = (id: string) => {
    serverRecentsCache = null; // [967 · 27] 지운 항목이 캐시에서 되살아나지 않게
    removedIds.add(id);
    /* 상태 갱신 함수 밖에서 쓴다 — 토스트의 되돌리기는 이 컴포넌트가 사라진 뒤(다른 화면)에도 눌릴 수 있다 */
    const next = readRecents().filter((r) => r.id !== id);
    writeRecents(next);
    setItems(next);
    // B8 — 서버에서도 제거(로그인 시). [1007] 힌트 없으면 보내지 않는다. 되돌리기 창이 지난 뒤에 보낸다(위 주석).
    if (!readAuthedHint()) return;
    const prev = pendingDeletes.current.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
    pendingDeletes.current.set(
      id,
      window.setTimeout(() => sendDelete(id), UNDO_WINDOW_MS),
    );
  };

  const restore = (item: RecentComplex) => {
    serverRecentsCache = null;
    removedIds.delete(item.id);
    const next = dedupeRecents([...readRecents(), item].sort((a, b) => b.at - a.at), MAX);
    writeRecents(next);
    setItems(next);
    if (!readAuthedHint()) return;
    const t = pendingDeletes.current.get(item.id);
    if (t !== undefined) {
      /* 창 안에서 되돌림 — 서버는 아직 그대로라 보낼 것이 없다(원래 viewed_at 유지) */
      window.clearTimeout(t);
      pendingDeletes.current.delete(item.id);
      return;
    }
    /* 창이 지난 뒤(이미 DELETE 를 보냄) — 그 응답을 기다린 뒤 POST. 서버 viewed_at 은 지금으로 잡힌다(API 한계) */
    const wait = sentDeletes.current.get(item.id) ?? Promise.resolve();
    void wait.then(() =>
      fetch("/api/me/recent-complexes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, name: item.name, region: item.region }),
      }).catch(() => {}),
    );
  };

  return { items, loading, remove, restore };
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
  const { items, loading, remove, restore } = useRecentComplexes();
  const { showToast } = useToast();
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
              className="press font-semibold text-text-1"
            >
              {r.name}
              {r.region ? <span className="ml-1 text-text-3">{r.region}</span> : null}
            </Link>
            {/* [1009 · T] 지우면 토스트 "되돌리기" — 확인 없이 지우는 대신 되살릴 길을 준다. ✕ 는 글 속 단추 기준 24px */}
            <button
              type="button"
              onClick={() => {
                remove(r.id);
                showToast("최근 본 단지에서 지웠어요", { label: "되돌리기", onClick: () => restore(r) });
              }}
              aria-label={`최근 본 단지 ${r.name} 삭제`}
              className="-my-1 -mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-3"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
