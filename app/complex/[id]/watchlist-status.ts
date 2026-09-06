import { getSessionLite, type SessionLite } from "@/lib/client/session-lite";

/* [968 · 3] 관심 단지 여부 조회 — 세션 게이트 + 단지별 공유 프라미스.

   왜: WatchlistButton 이 마운트마다 /api/me/watchlist?complexId= 를 불렀다.
   같은 단지 페이지에 이 버튼이 둘(히어로·모바일 하단 바) 있고, 하단 바는 상단
   CTA 가 화면을 벗어날 때마다 다시 마운트되므로 스크롤할 때마다 요청이 또 나갔다.
   게다가 비로그인에게는 언제나 401 이다 — 답이 정해진 요청이었다.

   여기서 두 가지를 접는다:
   ① getSessionLite(헤더 아바타가 이미 매 페이지 부르는 공유 프라미스)가 비면
      요청 없이 false. 비로그인 방문자에게는 watchlist 요청이 0건이 된다.
   ② 단지 id 별로 진행 중/완료된 프라미스를 30초 재사용 — 히어로와 하단 바가
      같은 왕복 하나를 나눠 받는다(session-lite 와 같은 TTL·같은 실패 정책).
   실패는 캐시하지 않는다(일시 오류가 30초짜리 "관심 아님"으로 굳지 않게). */

const TTL_MS = 30_000;

type Deps = {
  session: () => Promise<SessionLite>;
  fetchImpl: (input: string) => Promise<Response>;
  now: () => number;
};

const defaultDeps: Deps = {
  session: getSessionLite,
  fetchImpl: (input) => fetch(input),
  now: () => Date.now(),
};

const cache = new Map<string, { at: number; promise: Promise<boolean> }>();

/** 이 단지를 관심 등록했는가. 비로그인이면 요청 없이 false. */
export function readWatching(complexId: string, deps: Deps = defaultDeps): Promise<boolean> {
  const hit = cache.get(complexId);
  if (hit && deps.now() - hit.at < TTL_MS) return hit.promise;

  const promise: Promise<boolean> = deps
    .session()
    .then(async (s) => {
      // 비로그인 — 서버에 물어도 401 이다. "모름"이 아니라 "아직 없음"으로 시작한다.
      if (!s?.user?.email) return false;
      const res = await deps.fetchImpl(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`);
      if (!res.ok) throw new Error(`watchlist ${res.status}`);
      const j = (await res.json()) as { watching?: boolean };
      return Boolean(j.watching);
    })
    .catch(() => {
      // 실패는 캐시에서 제거 — 다음 마운트가 다시 시도한다
      if (cache.get(complexId)?.promise === promise) cache.delete(complexId);
      return false;
    });
  cache.set(complexId, { at: deps.now(), promise });
  return promise;
}

/** 토글 직후 — 다음 마운트(하단 바 재등장 등)가 방금 바꾼 값을 요청 없이 읽게 한다. */
export function primeWatching(complexId: string, watching: boolean, now: () => number = () => Date.now()): void {
  cache.set(complexId, { at: now(), promise: Promise.resolve(watching) });
}

/** 테스트 전용 — 모듈 캐시 비우기 */
export function resetWatchlistStatusCache(): void {
  cache.clear();
}
