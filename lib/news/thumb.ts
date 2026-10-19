/**
 * [1079] 뉴스 썸네일 주소 — 의존성 0 인 모듈(클라이언트 목록과 서버 라우트가 같이 쓴다).
 *
 * 운영 실측 2026-10-18(폰 390 · /town/news 1회): 이미지 36장 8,544KB — 매체 원본(1200px · 3.3MB PNG 포함)을
 * 64×48 칸에 그대로 받고 있었다. 매체 호스트는 /_next/image 허용 밖(오픈 프록시 금지)이라 srcset 도 못 만들었다.
 * 수집(ingest_daily_news · DB 함수)은 코드 밖이라, 표시단이 **글 id 로** 작은 그림을 받는 길을 둔다:
 *   /api/town/news/thumb/<id> → 그 글의 automation_meta 이미지 원본을 서버가 받아 176×132 webp 로 줄여 돌려주고
 *   CDN 이 30일 캐시한다. URL 을 받지 않고 id 만 받으므로 임의 주소를 대신 받아 주는 프록시가 되지 않는다.
 * 176×132 = 목록 칸(88×66 · 4:3) 의 2배(레티나) — 홈·"많이 본" 레일(72×52)도 같은 그림을 쓴다.
 */

/** 썸네일 픽셀 — 4:3 · 2배 */
export const NEWS_THUMB_W = 176;
export const NEWS_THUMB_H = 132;

/** 글 id 꼴(uuid·숫자·슬러그) — 라우트 매개변수 검증 */
export const NEWS_THUMB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 표시단이 <img src> 에 넣는 경로 */
export function newsThumbPath(id: string): string {
  return `/api/town/news/thumb/${encodeURIComponent(id)}`;
}

/**
 * 서버가 받아도 되는 원본 주소인지 — http(s) · 호스트 이름(IP 리터럴·localhost·사설 접미사 제외).
 * 원본 주소는 수집기가 적은 값이지 사용자 입력이 아니지만, 내부망을 향한 주소는 받지 않는다.
 */
export function isFetchableImageOrigin(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":")) return false;
  return h.includes(".");
}
