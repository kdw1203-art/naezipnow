/**
 * 조회 시간 초과가 몰릴 때 **재시도를 멈추는** 아주 작은 차단기.
 *
 * ── 왜 (2026-09-07 사고) ────────────────────────────────────────────────
 * /complex/[id] 의 대표행 조회는 평시 15.8ms 다. 그런데 DB 가 포화되면
 * 이 조회가 상한(10초)까지 늘어졌고, 코드는 350ms 뒤에 **한 번 더** 물었다.
 * 문제는 두 가지였다.
 *   1) Promise.race 로 건 상한은 약속을 버릴 뿐 **질의를 취소하지 않는다.**
 *      버려진 질의는 Postgres 안에서 계속 돌고 있었다.
 *   2) 그 위에 재시도가 또 하나를 얹었다.
 * 즉 포화가 시작되면 요청 하나가 살아 있는 질의 두 개를 만들었고, 그게 포화를
 * 더 키웠다. 실측: 그날 한 시간에 "단지 정보 조회 시간 초과" 271건 ·
 * Supabase 503 14건 · 그 라우트 오류율 43.1%.
 *
 * 재시도는 **일시적 오류**를 위한 장치다. 지금 DB 가 밀려서 난 시간 초과에
 * 재시도는 약이 아니라 독이다. 그래서 최근에 시간 초과가 연달아 나면 잠깐
 * 재시도를 끈다 — 조회 자체는 여전히 한 번 해 본다(차단기가 화면을 끄지는
 * 않는다). 포화가 지나가면 성공 한 번으로 바로 원상복귀한다.
 *
 * ── 범위 ────────────────────────────────────────────────────────────────
 * 서버리스 인스턴스 메모리다. 인스턴스가 여러 개면 각자 센다 — 전역 합의가
 * 아니라서 완벽하지 않지만, 부하를 많이 받는 인스턴스일수록 빨리 닫히므로
 * 필요한 곳에서 먼저 듣는다. 외부 저장소를 하나 더 두는 값(왕복·장애면적)이
 * 이 문제에 비해 비싸다.
 *
 * 시각은 인자로 받는다 — 그래야 단위검증이 시계를 흔들 수 있다.
 */

export interface TimeoutBreaker {
  /** 최근 연속 시간 초과 횟수 */
  strikes: number;
  /** 마지막 시간 초과 시각(ms epoch). 0 이면 없음 */
  lastAt: number;
}

/** 이만큼 연속으로 시간 초과가 나면 재시도를 끈다. */
export const BREAKER_STRIKES = 3;
/** 마지막 시간 초과가 이보다 오래됐으면 연속으로 안 본다(포화는 지나간다). */
export const BREAKER_WINDOW_MS = 20_000;

export function createTimeoutBreaker(): TimeoutBreaker {
  return { strikes: 0, lastAt: 0 };
}

/**
 * 지금 재시도를 건너뛸 것인가.
 * "최근 창 안에서 연속 N회 시간 초과" 일 때만 true.
 */
export function shouldSkipRetry(b: TimeoutBreaker, now: number): boolean {
  if (b.strikes < BREAKER_STRIKES) return false;
  return now - b.lastAt <= BREAKER_WINDOW_MS;
}

/** 시간 초과 1회 기록. 창을 벗어난 뒤의 첫 실패는 연속의 시작으로 본다. */
export function recordTimeout(b: TimeoutBreaker, now: number): void {
  b.strikes = now - b.lastAt <= BREAKER_WINDOW_MS ? b.strikes + 1 : 1;
  b.lastAt = now;
}

/** 성공 1회 — 연속이 끊겼다. 포화가 지나갔다는 뜻이므로 즉시 원상복귀. */
export function recordSuccess(b: TimeoutBreaker): void {
  b.strikes = 0;
  b.lastAt = 0;
}
