/* [1007] 반복 로그 샘플링 — 순수 판정(테스트: tests/unit/cache-1007.test.ts).
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────
 * 실측(2026-09-17~19, 24h): error 1,338 · warn 1,517 건인데 그 대부분이 **같은 문장의
 * 반복**이다 — `[db-unavailable] …`(DB 포화 시 요청마다), `[complex] 대장 매칭 보류`
 * (같은 단지가 크롤될 때마다), 축 조회 실패 등. Observability Events 는 건수로 과금되고
 * ($0.51~0.95/일), 사람이 읽는 쪽에서도 같은 줄 300개는 정보가 아니라 소음이다.
 *
 * ── 규칙(오류를 숨기지 않는다) ──────────────────────────────────────────────
 *  · 키(같은 종류의 로그)마다 창(기본 60초)을 둔다. 창 안 **첫 발생은 반드시 찍는다.**
 *  · 창 안의 나머지는 세기만 한다. 다음 창의 첫 발생이 "(이전 60초 동안 같은 로그 n회
 *    생략)" 을 달고 나간다 — 생략된 사실과 규모가 로그에 남는다.
 *  · 프로세스(Fluid 인스턴스)마다 따로 센다. 정밀 집계가 아니라 소음 상한이다.
 *
 * 이 모듈은 시계·전역 상태를 갖지 않는다 — `decideSample(prev, now)` 가 다음 상태를
 * 돌려주고, 상태를 어디에 두는지는 호출자(lib/log.ts)가 정한다. */

export type SampleEntry = {
  /** 현재 창이 열린 시각(ms) */
  windowStart: number;
  /** 현재 창에서 생략한 건수 */
  suppressed: number;
};

export type SampleDecision = {
  /** 이번 건을 실제로 찍는가 */
  emit: boolean;
  /** 찍는 경우, 직전 창에서 생략된 건수(메시지에 붙인다). 첫 발생이면 0 */
  suppressedBefore: number;
  /** 갱신된 상태 — 호출자가 저장한다 */
  next: SampleEntry;
};

/** 기본 창 — 1분에 1건 */
export const DEFAULT_SAMPLE_WINDOW_MS = 60_000;

export function decideSample(
  prev: SampleEntry | undefined,
  now: number,
  windowMs: number = DEFAULT_SAMPLE_WINDOW_MS,
): SampleDecision {
  if (!prev || now - prev.windowStart >= windowMs || now < prev.windowStart) {
    /* 새 창(또는 시계 역행) — 찍고, 직전 창의 생략 건수를 함께 보고한다 */
    return {
      emit: true,
      suppressedBefore: prev?.suppressed ?? 0,
      next: { windowStart: now, suppressed: 0 },
    };
  }
  return {
    emit: false,
    suppressedBefore: 0,
    next: { windowStart: prev.windowStart, suppressed: prev.suppressed + 1 },
  };
}

/** 생략 안내 문구 — 찍는 줄 끝에 붙는다(0 이면 빈 문자열) */
export function suppressedSuffix(suppressedBefore: number, windowMs: number = DEFAULT_SAMPLE_WINDOW_MS): string {
  if (suppressedBefore <= 0) return "";
  const sec = Math.round(windowMs / 1000);
  return ` (이전 ${sec}초 동안 같은 로그 ${suppressedBefore}회 생략)`;
}

/**
 * 키 → 상태 표. 무한히 자라지 않게 상한을 둔다 — 상한을 넘으면 **가장 오래된 창**부터
 * 비운다(Map 은 삽입 순서를 지키므로 앞에서부터 지우면 대략 오래된 순이다).
 */
export const SAMPLE_TABLE_MAX_KEYS = 512;

export function pruneSampleTable(table: Map<string, SampleEntry>, max: number = SAMPLE_TABLE_MAX_KEYS): void {
  if (table.size <= max) return;
  const drop = table.size - max;
  let i = 0;
  for (const k of table.keys()) {
    if (i++ >= drop) break;
    table.delete(k);
  }
}

/**
 * 표를 쓰는 편의 함수 — decideSample 을 적용해 표를 갱신하고 "찍을지 + 접미"를 돌려준다.
 * lib/log.ts 의 errorSampled/warnSampled 가 쓴다. 순수 함수는 아니지만(표를 바꾼다)
 * 시계는 인자로 받으므로 테스트가 시간을 흉내 낼 수 있다.
 */
export function sampleWithTable(
  table: Map<string, SampleEntry>,
  key: string,
  now: number,
  windowMs: number = DEFAULT_SAMPLE_WINDOW_MS,
): { emit: boolean; suffix: string } {
  const d = decideSample(table.get(key), now, windowMs);
  /* 갱신된 키를 뒤로 보내 삽입 순서가 "최근 사용" 순서에 가깝게 유지되게 한다 */
  table.delete(key);
  table.set(key, d.next);
  pruneSampleTable(table);
  return { emit: d.emit, suffix: d.emit ? suppressedSuffix(d.suppressedBefore, windowMs) : "" };
}
