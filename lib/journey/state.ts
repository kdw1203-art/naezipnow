/**
 * [1008 · J] 내 집 마련 여정 — 진행 상태(순수 스키마·정규화·병합).
 *
 * 왜 있나(실측, 2026-09 30일): 도구는 이미 흩어져 있는데(지도·예산 칩·계산기·임장노트·AI 분석·
 * 비교·가이드) "지금 어느 단계이고 다음에 뭘 하면 되는지"를 말해 주는 곳이 없었다 —
 * /calculator·/guides/contract 30일 조회 0, 단지 페이지 착지의 48%(13/27)가 다음 페이지 없이 이탈.
 * /journey(6단계)와 /journey/contract(계약·잔금 일정표)가 같은 상태 하나를 읽고 쓴다.
 *
 * 저장 위치
 *  - 비회원: localStorage(lib/journey/local.ts) — 이 기기에만.
 *  - 로그인: user_preferences.journey_state(jsonb, 마이그레이션 20260921002000) — 서버가 읽고 쓸 때마다
 *    normalizeJourneyState 를 거친다(모르는 키·틀린 값·너무 큰 값은 버린다). 로그인 뒤 처음 열 때
 *    로컬 진행분을 서버로 한 번 합친다(mergeJourneyStates).
 *
 * 이 파일은 의존성이 없다 — 브라우저·라우트 핸들러·node:test 가 같은 규칙을 본다.
 */

export const JOURNEY_STAGE_IDS = ["market", "budget", "shortlist", "visit", "decide", "contract"] as const;
export type JourneyStageId = (typeof JOURNEY_STAGE_IDS)[number];

export const JOURNEY_STATE_VERSION = 1 as const;
/** 정규화한 상태(JSON)의 상한 — 체크 6개 + 일정 4개 + 항목 id 64개면 2KB 안쪽이다. 넘으면 저장하지 않는다. */
export const JOURNEY_STATE_MAX_BYTES = 4096;
/** 요청 본문 상한 — 정규화 전 원문. 이보다 크면 파싱도 하지 않는다(413). */
export const JOURNEY_BODY_MAX_BYTES = 8192;
/** 일정표 체크 항목 수 상한(현재 목록 19개 — 늘어나도 넉넉하게) */
export const CONTRACT_CHECKED_MAX = 64;
/** 매매가 상한(만원) — 1,000억. 입력 실수로 0 이 여러 개 붙은 값을 막는다. */
export const PRICE_MANWON_MAX = 10_000_000;

export type ContractPlan = {
  /** 계약일 YYYY-MM-DD */
  contractDate: string | null;
  /** 중도금일(선택) */
  midDate: string | null;
  /** 잔금일 */
  balanceDate: string | null;
  /** 입주일(선택) — 없으면 잔금일로 본다(전입신고 기한 계산) */
  moveInDate: string | null;
  /** 매매가(만원, 선택) — 계산기 링크와 잔금 계산에 쓴다 */
  priceManwon: number | null;
  /** [1009 · T] 계약금(만원, 선택) — 넣으면 계약일 칸에 금액을, 매매가와 함께면 잔금(= 매매가 − 계약금 − 중도금)을 적는다.
      선택 칸이라 **값이 있을 때만** 키가 생긴다(1008 에 저장된 상태·테스트의 모양은 그대로). */
  depositManwon?: number | null;
  /** [1009 · T] 중도금(만원, 선택) — 여러 번 나눠 내도 합계 하나 */
  midManwon?: number | null;
  /** 체크한 일정표 항목 id(lib/journey/contract.ts CONTRACT_ITEMS) */
  checked: string[];
  /** 마지막으로 바꾼 시각(ISO) — 로컬·서버 병합 때 새 쪽을 고른다 */
  updatedAt: string | null;
};

export type JourneyState = {
  v: typeof JOURNEY_STATE_VERSION;
  /** 끝낸 단계 → 체크한 시각(ISO). 자동 신호로는 절대 채우지 않는다(사람이 누른 것만). */
  done: Partial<Record<JourneyStageId, string>>;
  contract: ContractPlan | null;
  updatedAt: string | null;
};

export function emptyJourneyState(): JourneyState {
  return { v: JOURNEY_STATE_VERSION, done: {}, contract: null, updatedAt: null };
}

export function isJourneyStageId(v: unknown): v is JourneyStageId {
  return typeof v === "string" && (JOURNEY_STAGE_IDS as readonly string[]).includes(v);
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD 이고 실제 달력에 있는 날(2000~2100)인가 */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DAY_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** ISO 일시 문자열(Date.parse 가능, 40자 이하) */
function isIsoTime(v: unknown): v is string {
  return typeof v === "string" && v.length >= 10 && v.length <= 40 && Number.isFinite(Date.parse(v));
}

const ITEM_ID_RE = /^[a-z0-9-]{1,40}$/;

function day(v: unknown): string | null {
  return isIsoDay(v) ? v : null;
}

/** 일정표 입력을 스키마에 맞춘다. 날짜·금액·체크가 하나도 없으면 null(= 일정표 없음). */
/** 금액 칸 — 정수 만원 · 양수 · 상한(1,000억) 안쪽만 */
function amount(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= PRICE_MANWON_MAX ? v : null;
}

export function normalizeContractPlan(input: unknown): ContractPlan | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const price = amount(o.priceManwon);
  const deposit = amount(o.depositManwon);
  const mid = amount(o.midManwon);
  const checked: string[] = [];
  if (Array.isArray(o.checked)) {
    for (const id of o.checked) {
      if (typeof id !== "string" || !ITEM_ID_RE.test(id) || checked.includes(id)) continue;
      checked.push(id);
      if (checked.length >= CONTRACT_CHECKED_MAX) break;
    }
  }
  const plan: ContractPlan = {
    contractDate: day(o.contractDate),
    midDate: day(o.midDate),
    balanceDate: day(o.balanceDate),
    moveInDate: day(o.moveInDate),
    priceManwon: price,
    ...(deposit !== null ? { depositManwon: deposit } : {}),
    ...(mid !== null ? { midManwon: mid } : {}),
    checked,
    updatedAt: isIsoTime(o.updatedAt) ? o.updatedAt : null,
  };
  const empty =
    !plan.contractDate &&
    !plan.midDate &&
    !plan.balanceDate &&
    !plan.moveInDate &&
    plan.priceManwon == null &&
    deposit === null &&
    mid === null &&
    checked.length === 0;
  return empty ? null : plan;
}

/** 저장된 jsonb·요청 본문·localStorage 원문을 스키마에 맞춘다. 모르는 키는 버린다. */
export function normalizeJourneyState(input: unknown): JourneyState {
  const o = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const done: Partial<Record<JourneyStageId, string>> = {};
  const rawDone = o.done;
  if (rawDone && typeof rawDone === "object" && !Array.isArray(rawDone)) {
    for (const id of JOURNEY_STAGE_IDS) {
      const at = (rawDone as Record<string, unknown>)[id];
      if (isIsoTime(at)) done[id] = at;
    }
  }
  return {
    v: JOURNEY_STATE_VERSION,
    done,
    contract: normalizeContractPlan(o.contract),
    updatedAt: isIsoTime(o.updatedAt) ? o.updatedAt : null,
  };
}

/** 정규화한 상태의 UTF-8 바이트 수 — 상한 판정용 */
export function journeyStateBytes(s: JourneyState): number {
  return new TextEncoder().encode(JSON.stringify(s)).length;
}

export function isJourneyEmpty(s: JourneyState): boolean {
  return Object.keys(s.done).length === 0 && s.contract === null;
}

export function countDone(s: JourneyState): number {
  return JOURNEY_STAGE_IDS.filter((id) => Boolean(s.done[id])).length;
}

/** 지금 단계 = 아직 체크하지 않은 첫 단계. 전부 끝났으면 null. */
export function currentStageId(s: JourneyState): JourneyStageId | null {
  return JOURNEY_STAGE_IDS.find((id) => !s.done[id]) ?? null;
}

export function toggleStageDone(s: JourneyState, id: JourneyStageId, nowIso: string): JourneyState {
  const done = { ...s.done };
  if (done[id]) delete done[id];
  else done[id] = nowIso;
  return { ...s, done, updatedAt: nowIso };
}

/** 일정표를 통째로 바꾼다(정규화 포함). plan 이 비면 일정표를 지운다. */
export function withContractPlan(s: JourneyState, plan: unknown, nowIso: string): JourneyState {
  const next = normalizeContractPlan(plan);
  return {
    ...s,
    contract: next ? { ...next, updatedAt: nowIso } : null,
    updatedAt: nowIso,
  };
}

function laterIso(a: string | null, b: string | null): number {
  const ta = a ? Date.parse(a) : Number.NaN;
  const tb = b ? Date.parse(b) : Number.NaN;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return -1;
  if (!Number.isFinite(tb)) return 1;
  return ta === tb ? 0 : ta > tb ? 1 : -1;
}

const PLAN_DATE_KEYS = ["contractDate", "midDate", "balanceDate", "moveInDate"] as const;

/**
 * 두 일정표를 같은 거래로 볼 수 있는가 — 양쪽에 다 적힌 날짜가 서로 같다(한쪽에만 있는 날짜는 충돌이 아니다).
 * 예: 한쪽은 매매가만, 다른 쪽은 계약일·잔금일·체크 → 같은 거래(합친다). 계약일이 서로 다르면 다른 거래.
 */
export function sameDealPlans(a: ContractPlan, b: ContractPlan): boolean {
  return PLAN_DATE_KEYS.every((k) => a[k] === null || b[k] === null || a[k] === b[k]);
}

/**
 * 두 진행 상태를 합친다 — 로그인 뒤 이 기기(비회원 때 쌓은) 진행을 계정 것과, 또는 저장 못 한 계정 사본을
 * 그 사이 다른 기기가 바꾼 계정 것과. **잃지 않는 쪽**이 원칙이다.
 *  - 끝낸 단계: 합집합. 양쪽에 다 있으면 먼저 체크한 시각을 남긴다.
 *  - 일정표: 한쪽에만 있으면 그것. 둘 다 있고 같은 거래(sameDealPlans)면 **칸마다** 합친다 — 더 최근에 바꾼 쪽의 값이
 *    이기되 그쪽이 비운 칸은 다른 쪽 값으로 채우고, 체크는 합집합.
 *    [리뷰 C] 예전엔 더 최근 일정표를 통째로 골라서, 계정을 불러오는 사이 매매가만 적은 사본이 계정의 계약일·잔금일·
 *    체크를 지웠다.
 *    다른 거래(같은 칸의 날짜가 서로 다름)면 더 최근 쪽을 통째로(같거나 모르면 계정 쪽) — 두 거래의 날짜·체크를 섞지 않는다.
 */
export function mergeJourneyStates(local: JourneyState, server: JourneyState, nowIso: string): JourneyState {
  const done: Partial<Record<JourneyStageId, string>> = {};
  for (const id of JOURNEY_STAGE_IDS) {
    const a = local.done[id];
    const b = server.done[id];
    if (a && b) done[id] = laterIso(a, b) <= 0 ? a : b;
    else if (a || b) done[id] = (a ?? b) as string;
  }
  let contract: ContractPlan | null = server.contract ?? local.contract ?? null;
  if (local.contract && server.contract) {
    const localNewer = laterIso(local.contract.updatedAt, server.contract.updatedAt) > 0;
    const base = localNewer ? local.contract : server.contract;
    const other = localNewer ? server.contract : local.contract;
    contract = sameDealPlans(base, other)
      ? {
          contractDate: base.contractDate ?? other.contractDate,
          midDate: base.midDate ?? other.midDate,
          balanceDate: base.balanceDate ?? other.balanceDate,
          moveInDate: base.moveInDate ?? other.moveInDate,
          priceManwon: base.priceManwon ?? other.priceManwon,
          depositManwon: base.depositManwon ?? other.depositManwon ?? null,
          midManwon: base.midManwon ?? other.midManwon ?? null,
          checked: [...new Set([...base.checked, ...other.checked])].slice(0, CONTRACT_CHECKED_MAX),
          updatedAt: base.updatedAt ?? other.updatedAt,
        }
      : base;
  }
  return normalizeJourneyState({ v: JOURNEY_STATE_VERSION, done, contract, updatedAt: nowIso });
}

/** 두 상태의 내용이 같은가(updatedAt 은 보지 않는다) — 병합 뒤 서버에 다시 쓸 필요가 있는지 판정 */
export function sameJourneyContent(a: JourneyState, b: JourneyState): boolean {
  const strip = (s: JourneyState) =>
    JSON.stringify({
      done: JOURNEY_STAGE_IDS.map((id) => s.done[id] ?? null),
      contract: s.contract ? { ...s.contract, updatedAt: null, checked: [...s.contract.checked].sort() } : null,
    });
  return strip(a) === strip(b);
}
