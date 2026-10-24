/**
 * [1088 · 비용] 화면 주소(페이지)를 페이지 안 스크립트가 불러온 요청인가 — 순수 함수(미들웨어 · tests/unit/review-1088).
 *
 * 링크 미리 받기(prefetch)와 화면 안 이동은 Next 앱 라우터가 fetch 로 그 화면의 RSC 를 받는다. 그런데 미들웨어에는
 * RSC 표식 헤더(RSC · Next-Router-Prefetch · Next-Router-State-Tree …)와 `_rsc` 쿼리가 지워진 채로 온다
 * (next/dist/server/web/adapter — FLIGHT_HEADERS "Headers should only be stripped for middleware"). 그래서 남는 두 표식으로 가른다:
 *  - `Next-Url` — 앱 라우터가 RSC 요청에 붙이는 지금 화면 경로(지워지지 않는다).
 *  - `Sec-Fetch-Dest: empty` — 브라우저가 붙인다. 주소창 이동 · 새로고침 · 링크 열기(문서)는 "document", 스크립트 fetch 는 "empty".
 * GET·HEAD 만(서버 액션은 POST) · /api · /_next 는 제외(화면 주소가 아니다).
 */
export type PageFetchProbe = {
  method: string;
  pathname: string;
  get: (name: string) => string | null;
};

export function isScriptPageFetch(req: PageFetchProbe): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (req.pathname.startsWith("/api/") || req.pathname === "/api" || req.pathname.startsWith("/_next/")) return false;
  return req.get("next-url") != null || req.get("sec-fetch-dest") === "empty";
}
