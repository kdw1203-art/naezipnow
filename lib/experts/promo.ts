/* [1144 · 전문가 홍보] 소유자 2026-11-11 "등록하면 배너나 홍보 칸을 통해 홍보도 할 수 있게 · 첫 등록 100일은 무료 · 이후부터는 구독제".
   결정(같은 날 소유자 답): 구독 = 기존 프로 요금제(가격 그대로) · 무료가 끝나고 구독하지 않으면 프로필은 유지하고 홍보만 중단 ·
   노출 = 지역·단지 화면 / 전문가 찾기 상단 / 홈 / 임장노트·동네 글 목록.
   순수 규칙(server-only 없음) — 화면 · API · node:test 가 같이 쓴다. */

/* [1167] 100일 → 365일(소유자 2026-11-12 "전문가 등록하면 1년 무료") */
export const PROMO_FREE_DAYS = 365;
export const PROMO_HEADLINE_MAX = 28;
export const PROMO_BODY_MAX = 80;
/** 홍보를 켜 주는 요금제(lib/subscriptions — 프로 = expert) */
export const PROMO_PLAN = "expert";

const DAY_MS = 86_400_000;

export type PromoMode = "free" | "subscribed" | "ended";
export type PromoState = {
  /** 지금 홍보가 나가나(인증 · 켬 · 글 있음은 호출부가 따로 본다) */
  active: boolean;
  mode: PromoMode;
  /** 무료 기간 남은 날(끝났으면 0) */
  freeDaysLeft: number;
  /** 무료 기간 마지막 날(KST yyyy-mm-dd) */
  freeUntil: string | null;
};

/** 등록일(= 프로필이 만들어진 날 · 승인 때 만든다)부터 100일 무료, 그 뒤로는 프로 구독 중일 때만 */
export function promoState(input: { createdAt: string | null; plan: string | null; planExpiresAt: string | null; now: string }): PromoState {
  const now = Date.parse(input.now);
  const start = input.createdAt ? Date.parse(input.createdAt) : NaN;
  const end = Number.isFinite(start) ? start + PROMO_FREE_DAYS * DAY_MS : NaN;
  const freeDaysLeft = Number.isFinite(end) && end > now ? Math.ceil((end - now) / DAY_MS) : 0;
  const freeUntil = Number.isFinite(end) ? new Date(end - 1 + 9 * 3_600_000).toISOString().slice(0, 10) : null;
  const exp = input.planExpiresAt ? Date.parse(input.planExpiresAt) : NaN;
  const subscribed = input.plan === PROMO_PLAN && (!input.planExpiresAt || (Number.isFinite(exp) && exp > now));
  if (subscribed) return { active: true, mode: "subscribed", freeDaysLeft, freeUntil };
  if (freeDaysLeft > 0) return { active: true, mode: "free", freeDaysLeft, freeUntil };
  return { active: false, mode: "ended", freeDaysLeft: 0, freeUntil };
}

/* 홍보 글에 쓸 수 없는 말 — 수익 보장 · 단정 · 최상급(표시·광고 규정의 기본선). 화면 문구 규칙(느낌표 없음)도 같이 지킨다 */
const PROMO_DENY = /(수익\s*보장|원금\s*보장|확정\s*수익|무조건|100\s*%|최고|최저가|1\s*위|유일|보장합니다|급매\s*보장)/;

export type PromoInput = { headline: string | null; body: string | null; on: boolean };

export function sanitizePromo(raw: { headline?: unknown; body?: unknown; on?: unknown }): { ok: true; value: PromoInput } | { ok: false; error: string } {
  const clean = (v: unknown) => String(typeof v === "string" ? v : "").replace(/[!！]+/g, "").replace(/\s+/g, " ").trim();
  const headline = clean(raw.headline);
  const body = clean(raw.body);
  if (headline.length > PROMO_HEADLINE_MAX) return { ok: false, error: `홍보 한 줄은 ${PROMO_HEADLINE_MAX}자 이내` };
  if (body.length > PROMO_BODY_MAX) return { ok: false, error: `홍보 설명은 ${PROMO_BODY_MAX}자 이내` };
  if (PROMO_DENY.test(`${headline} ${body}`)) return { ok: false, error: "수익 보장 · 최고 · 유일 같은 단정 표현은 쓸 수 없음" };
  if (/https?:\/\/|www\./i.test(`${headline} ${body}`)) return { ok: false, error: "홍보 글에는 주소(링크)를 넣을 수 없음" };
  return { ok: true, value: { headline: headline || null, body: body || null, on: raw.on !== false } };
}

export type PromoCandidate = {
  id: string;
  isVerified?: boolean;
  createdAt: string | null;
  plan: string | null;
  planExpiresAt: string | null;
  promoOn: boolean;
  promoHeadline: string | null;
};

/** 지금 홍보 칸에 나갈 수 있나 — 켬 · 한 줄 있음 · 무료 기간 또는 구독 */
export function isPromoLive(c: PromoCandidate, now: string): boolean {
  return c.promoOn && Boolean(c.promoHeadline) && promoState({ createdAt: c.createdAt, plan: c.plan, planExpiresAt: c.planExpiresAt, now }).active;
}

/** 지역과 무관한 자리(홈 · 목록)에서 고르기 — 날마다 차례가 돌아간다(같은 날 같은 자리는 같은 사람 · 자리마다 다른 사람) */
export function rotatePromo<T extends { id: string }>(live: T[], now: string, slot: number, count = 1): T[] {
  if (live.length === 0) return [];
  const sorted = [...live].sort((a, b) => a.id.localeCompare(b.id));
  const day = Math.floor((Date.parse(now) + 9 * 3_600_000) / DAY_MS);
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, sorted.length); i++) out.push(sorted[(day + slot + i) % sorted.length]);
  return out;
}
