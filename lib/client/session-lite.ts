"use client";

/**
 * 최적화 26 — /api/auth/session 클라이언트 호출 수렴.
 *
 * 헤더 아바타·전체 메뉴·홈 미니지도·애드센스 유닛이 각자 fetch 해서 페이지당
 * 같은 요청이 최대 4번 나갔다. 모듈 스코프 공유 프라미스로 1회화한다.
 * - TTL 30초: 같은 페이지 수명 안 재사용이 목적이다. 로그인/로그아웃 직후의
 *   신선도는 전체 리로드(라우트 핸들러 이동)가 보장하므로 짧게 잡아도 안전.
 * - 실패는 캐시하지 않는다 — 실패를 30초 캐시하면 일시 오류가 "비로그인
 *   30초"로 굳는다(시세 스냅샷 빈 성공 캐시와 같은 함정).
 *
 * [1007 · V2a-2] 로그인 힌트 쿠키(nz_authed, lib/auth/authed-hint.ts)가 **없으면 요청 자체를
 * 하지 않고** null(= 비회원)을 준다. 실측 /api/auth/session 1,299회/일 중 사람 몫은 ~17 —
 * 나머지는 JS 를 실행하는 크롤러가 헤더 아바타·전체 메뉴·광고 게이트·홈 개인화 섬을
 * 마운트하며 일으킨 것이다. 이 함수가 그 섬 전부(HeaderAuth·MobileMenu·AdSense*·AdFreeGate·
 * HomeMiniMap·HomeMyRail·HomeWatchlistBrief·RecentComplexes·HomeLevelKpi·SupportContactForm·
 * has-session·home-personal·watchlist-status·compare-tray)의 단일 관문이라 여기서 한 번 막는다.
 * 힌트는 미들웨어가 세션 쿠키 유무와 다를 때만 심고 지우므로(로그인 → 리다이렉트 → 힌트 설정
 * → 헤더 조회), 로그인·로그아웃 직후 화면은 종전과 같이 갱신된다. 힌트 없음은 캐시하지 않는다 —
 * 같은 문서 수명 안에 힌트가 생기면(소프트 내비게이션 응답이 심는 경우) 다음 호출이 조회한다.
 */

import { readAuthedHint } from "@/lib/auth/authed-hint";

export type SessionLite = {
  user?: {
    email?: string | null;
    name?: string | null;
    plan?: string | null;
    role?: string | null;
  } | null;
} | null;

const TTL_MS = 30_000;

let cache: { at: number; promise: Promise<SessionLite> } | null = null;

export function getSessionLite(): Promise<SessionLite> {
  /* [1007 · V2a-2] 힌트 없음 = 세션 쿠키 없음 = 비회원 확정 — 서버에 묻지 않는다 */
  if (!readAuthedHint()) return Promise.resolve(null);
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetch("/api/auth/session")
    .then((r) => (r.ok ? (r.json() as Promise<SessionLite>) : null))
    .catch(() => null)
    .then((s) => {
      // 실패(null)는 캐시에서 제거 — 다음 호출이 다시 시도한다
      if (s === null && cache?.promise === promise) cache = null;
      return s;
    });
  cache = { at: Date.now(), promise };
  return promise;
}
