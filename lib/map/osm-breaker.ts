/**
 * [1085] OpenStreetMap(Overpass) 차단기 — 순수 규칙.
 *
 * 왜: 단지 화면 "관공서"를 공개 Overpass 서버 세 곳에 묻는데, 운영 로그(2026-10-22 · 23시간)에서
 * /api/complex/area?part=osm 이 101번 모두 "OpenStreetMap 조회 실패(9001ms) · 시간 초과"였다.
 * 실패할 때마다 함수가 9초를 기다렸다(비용) · 화면은 9초 뒤에야 "관공서 불러오기 실패"를 그렸다.
 * 성공은 30일 캐시라 실패만 반복된다 — 실패 응답은 CDN 5분이라 단지마다 5분에 한 번씩 다시 9초.
 *
 * 규칙: 10분 창 안에 3번 연속 실패하면 15분 동안 묻지 않는다(바로 실패 → 화면은 곧바로 "관공서 불러오기 실패").
 * 한 번이라도 성공하면 실패 수를 지운다. 공유 KV(lib/kv/rest)가 있으면 인스턴스끼리 같은 상태를 보고,
 * 없으면 인스턴스 메모리만 쓴다(그래도 같은 람다 안의 반복은 막는다).
 */
export const OSM_BREAKER_FAILS = 3;
export const OSM_BREAKER_WINDOW_SEC = 600;
export const OSM_BREAKER_OPEN_SEC = 900;
export const OSM_BREAKER_FAIL_KEY = "nz:osm-area:fail";
export const OSM_BREAKER_OPEN_KEY = "nz:osm-area:open";

/** 창 안 실패 수 → 차단할지 */
export function shouldOpenBreaker(failCount: number | null | undefined): boolean {
  return typeof failCount === "number" && Number.isFinite(failCount) && failCount >= OSM_BREAKER_FAILS;
}

/** 인스턴스 메모리 차단기 — KV 가 없거나 느릴 때의 하한 */
export type MemoryBreaker = { fails: number; windowStart: number; openUntil: number };

export function newMemoryBreaker(): MemoryBreaker {
  return { fails: 0, windowStart: 0, openUntil: 0 };
}

export function memoryBreakerOpen(b: MemoryBreaker, now: number): boolean {
  return now < b.openUntil;
}

/** 실패 1회 기록 — 차단을 새로 열었으면 true */
export function memoryBreakerFail(b: MemoryBreaker, now: number): boolean {
  if (now - b.windowStart > OSM_BREAKER_WINDOW_SEC * 1000) {
    b.windowStart = now;
    b.fails = 0;
  }
  b.fails += 1;
  if (shouldOpenBreaker(b.fails) && !memoryBreakerOpen(b, now)) {
    b.openUntil = now + OSM_BREAKER_OPEN_SEC * 1000;
    return true;
  }
  return false;
}

export function memoryBreakerOk(b: MemoryBreaker): void {
  b.fails = 0;
  b.windowStart = 0;
  b.openUntil = 0;
}

/** 차단 중일 때 던지는 오류 문장 — 화면·로그가 시간 초과와 구분한다 */
export const OSM_BREAKER_MESSAGE = "OpenStreetMap 조회 일시 중단(연속 실패) — 15분 뒤 다시";
