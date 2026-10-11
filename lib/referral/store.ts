import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { awardPoints } from "@/lib/points/ledger";
import { readPaged } from "@/lib/supabase/read-paged";
import { logger } from "@/lib/log";

/**
 * 친구 추천(referral) 저장소.
 *
 * - 코드 발급/조회: referral_codes(user_email PK, code UNIQUE)
 * - 리딤 기록:       referral_redemptions(referee_email UNIQUE)
 *
 * 두 테이블 모두 RLS deny-all → service-role 헬퍼로만 접근한다.
 * 읽기는 getReadOnlySupabase(service 우선), 쓰기는 getServiceSupabase().
 * 포인트 지급은 ledger.awardPoints("referral") — refId 로 중복 방어한다.
 */

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // [A-Z0-9]
const CODE_LEN = 6;
/** [1057] 초대 코드는 **새 계정**만 적용 — app_users.created_at 이 이 일수 안이어야 한다 */
export const REFERRAL_NEW_ACCOUNT_DAYS = 7;
/** 추천인 적립 행 합산 상한(원장 reason=referral · ref_id=referee:*) — 닿으면 못 센 것으로 본다 */
const REFERRAL_LEDGER_MAX_ROWS = 20_000;
/** 리더보드 집계 상한 — 닿으면 표본이 잘린 것이므로 null(못 읽음) */
const LEADERBOARD_MAX_ROWS = 50_000;

export type ReferralLookup = { referrerEmail: string };
export type ReferralStats = {
  code: string | null;
  /**
   * 초대 성사 수. **못 셌으면 null 이다.**
   * 예전에는 조회 실패도 `0` 이었는데, "아직 아무도 초대 못 했다"와
   * "지금 셀 수 없다"는 전혀 다른 말이고 화면에는 앞의 것만 보였다.
   */
  invitedCount: number | null;
  /** [1057] 원장(point_ledger · reason=referral · ref_id=referee:*)의 실제 적립 합. 못 읽었으면 null. */
  pointsEarned: number | null;
};
export type RedeemReason = "invalid_code" | "invalid" | "self" | "unavailable" | "already" | "not_new" | "db" | "error";
export type RedeemResult = { ok: boolean; reason?: RedeemReason; awarded?: number };

/** [1057] 가입 시각이 기준 시각으로부터 days 일 안인가 — 순수(단위 시험 대상). 읽을 수 없는 값은 false */
export function isNewAccount(createdAt: string | null | undefined, now: Date = new Date(), days = REFERRAL_NEW_ACCOUNT_DAYS): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= days * 24 * 60 * 60 * 1000;
}

/** 코드 정규화 — 대문자 + [A-Z0-9] 만. 링크·쿠키·수기 입력 모두 안전화. */
function normalizeCode(code: string): string {
  return (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** FNV-1a 32bit — 이메일에서 "대략 결정적인" 코드 시드를 만들 때 사용. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** seed 로부터 6자리 [A-Z0-9] 코드 생성 (각 자리 독립 해시 → 시드가 바뀌면 완전히 달라짐). */
function makeCode(seed: string): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    const n = hash32(`${seed}#${i}`);
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
  }
  return out;
}

async function readCodeFor(
  client: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("referral_codes")
    .select("code")
    .eq("user_email", email)
    .maybeSingle();
  /* 실패를 null 로 흘려보내면 "이 사용자는 아직 코드가 없다"가 되어, 아래
     getOrCreateCode 가 이미 있는 코드를 두고 발급을 시도한다. PK(user_email)
     가 막아 주긴 하지만 그 뒤 재조회도 같은 장애로 실패해 8번을 헛돌고
     결국 null 을 돌려준다 — 사용자에게는 코드가 사라진 것처럼 보인다. */
  if (error) {
    throw new Error(`referral_codes 조회 실패 (${email}): ${error.message ?? "알 수 없는 오류"}`);
  }
  return data?.code ? String(data.code) : null;
}

/**
 * 사용자의 추천 코드를 반환. 없으면 짧은 유니크 코드를 발급 후 반환.
 * 유니크 충돌 시 시드를 바꿔 최대 8회 재시도한다.
 */
export async function getOrCreateCode(email: string): Promise<string | null> {
  if (!email) return null;

  /* readCodeFor 는 조회 실패를 던진다. 못 읽은 상태에서 발급 루프로 들어가면
     헛도는 8회 insert 만 남기고 결국 null 이므로, 여기서 접고 이유를 남긴다.
     (anon 읽기가 막힌 것뿐일 수도 있으니 아래 service-role 재확인은 해 본다.) */
  // 1) 기존 코드 (읽기 전용 클라이언트)
  const read = getReadOnlySupabase();
  if (read) {
    const existing = await readCodeFor(read, email).catch((e: unknown) => {
      logger.warn("[referral] 기존 코드 조회 실패(anon) — service-role 로 재확인", e);
      return null;
    });
    if (existing) return existing;
  }

  // 2) 발급 (service-role 쓰기)
  const write = getServiceSupabase();
  if (!write) return null;

  // 경합 대비 재확인 (read 가 anon 이라 못 봤을 수도 있음)
  let already: string | null;
  try {
    already = await readCodeFor(write, email);
  } catch (e) {
    logger.error("[referral] 기존 코드 조회 실패 — 새 코드를 발급하지 않습니다.", e);
    return null;
  }
  if (already) return already;

  for (let attempt = 0; attempt < 8; attempt++) {
    const seed =
      attempt < 5 ? `${email}|${attempt}` : `${email}|${attempt}|${Math.random()}`;
    const code = makeCode(seed);
    const { data, error } = await write
      .from("referral_codes")
      .insert({ user_email: email, code })
      .select("code")
      .maybeSingle();
    if (!error && data?.code) return String(data.code);
    if (error?.code === "23505") {
      // PK(user_email) 경합이면 이미 발급된 코드 반환, code 충돌이면 다음 시드로 재시도
      const raced = await readCodeFor(write, email).catch((e: unknown) => {
        logger.error("[referral] 경합 후 코드 재조회 실패", e);
        return null;
      });
      if (raced) return raced;
      continue;
    }
    if (error) {
      logger.error("[referral] getOrCreateCode insert", error);
      return null;
    }
  }
  logger.error("[referral] getOrCreateCode: exhausted retries", { email });
  return null;
}

/** 코드로 추천인 이메일을 조회. 없으면 null. */
export async function getReferralByCode(code: string): Promise<ReferralLookup | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  const read = getReadOnlySupabase();
  if (!read) return null;
  const { data, error } = await read
    .from("referral_codes")
    .select("user_email")
    .eq("code", c)
    .maybeSingle();
  /* error 와 "행 없음"을 갈라 놓는다. 예전에는 둘 다 null 이라, 조회가 밀리는
     동안 멀쩡한 초대 코드가 redeemReferral 에서 `invalid_code` 로 처리됐다 —
     사용자에게는 "없는 코드"라고 말한 셈이다. 이제 실패는 던지고, 바깥의
     try/catch 가 그것을 `error` 로 구분해 돌려준다. */
  if (error) throw new Error(`referral_codes 조회 실패: ${error.message}`);
  if (!data?.user_email) return null;
  return { referrerEmail: String(data.user_email) };
}

/**
 * [1057] 추천인에게 실제로 들어간 초대 적립 합 — point_ledger(reason=referral · ref_id like 'referee:%').
 * 예전엔 성사 수 × 300 이었는데, 하루 5명 상한(EARN_RULES.referral.dailyCap)·일 500P 상한에 걸린 성사는 추천인 적립이
 * 건너뛰어지므로 실제보다 많게 보였다. 못 읽었으면 null.
 */
async function referrerPointsFromLedger(email: string): Promise<number | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { rows, truncated } = await readPaged<{ delta: unknown }>(
      (from, to) =>
        sb
          .from("point_ledger")
          .select("delta")
          .eq("user_email", email)
          .eq("reason", "referral")
          .like("ref_id", "referee:%")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      REFERRAL_LEDGER_MAX_ROWS,
    );
    if (truncated) throw new Error(`point_ledger 초대 적립 행이 상한(${REFERRAL_LEDGER_MAX_ROWS})에 닿음`);
    return rows.reduce((s, r) => s + (Number(r.delta) || 0), 0);
  } catch (e) {
    logger.error("[referral] 초대 적립 합 조회 실패", e);
    return null;
  }
}

/** 내 코드 + 초대 성사 수 + 적립 포인트(원장 실제 합). */
export async function getReferralStats(email: string): Promise<ReferralStats> {
  const code = await getOrCreateCode(email);
  const read = getReadOnlySupabase();
  if (!read || !email) {
    return { code, invitedCount: null, pointsEarned: null };
  }
  const [{ count, error }, pointsEarned] = await Promise.all([
    read.from("referral_redemptions").select("id", { count: "exact", head: true }).eq("referrer_email", email),
    referrerPointsFromLedger(email),
  ]);
  /* 여기서 던지지 않는 것은 코드·초대 링크가 이 조회와 무관하게 이미 있기
     때문이다. 화면은 링크를 계속 보여 주되, 못 센 숫자는 null 로 넘겨
     "0명"이 아니라 "—"로 그린다. */
  if (error || typeof count !== "number") {
    if (error) logger.error("[referral] 초대 성사 수 조회 실패", error);
    return { code, invitedCount: null, pointsEarned };
  }
  return { code, invitedCount: count, pointsEarned };
}

/** [1057] 피추천인의 가입 시각(app_users.created_at · 이메일 소문자). 행이 없거나 못 읽으면 null(= 모름) */
async function readAccountCreatedAt(
  client: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("app_users")
    .select("created_at")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`app_users 조회 실패: ${error.message}`);
  const v = data?.created_at;
  return typeof v === "string" && v ? v : null;
}

/**
 * 리딤: 코드의 추천인을 찾아 방어(존재·자기추천 금지·중복 금지) 후
 * 리딤을 기록하고 추천인·피추천인 양쪽에 포인트를 지급한다.
 * unique-violation(23505)은 이미 리딤한 것으로 처리한다.
 */
export async function redeemReferral(
  code: string,
  refereeEmail: string,
): Promise<RedeemResult> {
  try {
    const c = normalizeCode(code);
    if (!c) return { ok: false, reason: "invalid_code" };
    if (!refereeEmail) return { ok: false, reason: "invalid" };

    const ref = await getReferralByCode(c);
    if (!ref) return { ok: false, reason: "invalid_code" };
    const referrerEmail = ref.referrerEmail;

    // 자기 자신 추천 금지
    if (referrerEmail === refereeEmail) return { ok: false, reason: "self" };

    const write = getServiceSupabase();
    if (!write) return { ok: false, reason: "unavailable" };

    // 이미 리딤한 피추천인인지 (referee 당 1회)
    const { data: existing } = await write
      .from("referral_redemptions")
      .select("id")
      .eq("referee_email", refereeEmail)
      .maybeSingle();
    if (existing) return { ok: false, reason: "already" };

    /* [1057] 피추천인이 새 계정인지 보지 않았다 — 기존 회원이 아무 초대 링크나 열면 하이드레이션에서 리딤돼
       기존 계정 둘이 서로 초대해 1,200P 를 만들 수 있었다. app_users.created_at 이 7일 안일 때만 적용.
       가입 시각을 못 읽으면(행 없음·조회 실패) 판정 보류 — "db"(재시도 가능) 로 돌려 쿠키를 남긴다. */
    let createdAt: string | null;
    try {
      createdAt = await readAccountCreatedAt(write, refereeEmail);
    } catch (e) {
      logger.error("[referral] 피추천인 가입 시각 조회 실패", e);
      return { ok: false, reason: "db" };
    }
    if (!createdAt) return { ok: false, reason: "db" };
    if (!isNewAccount(createdAt)) return { ok: false, reason: "not_new" };

    const { error: insErr } = await write.from("referral_redemptions").insert({
      code: c,
      referrer_email: referrerEmail,
      referee_email: refereeEmail,
    });
    if (insErr) {
      // referee_email UNIQUE 위반 = 동시 리딤 → 이미 처리됨
      if (insErr.code === "23505") return { ok: false, reason: "already" };
      logger.error("[referral] redeem insert", insErr);
      return { ok: false, reason: "db" };
    }

    // 양쪽 지급 — refId 로 원장에서 중복 방어
    const [referrerAward, refereeAward] = await Promise.all([
      awardPoints(referrerEmail, "referral", `referee:${refereeEmail}`),
      awardPoints(refereeEmail, "referral", `welcome:${refereeEmail}`),
    ]);
    if (!referrerAward.ok) {
      logger.warn("[referral] referrer award skipped", { reason: referrerAward.reason });
    }
    return { ok: true, awarded: refereeAward.awarded };
  } catch (e) {
    logger.error("[referral] redeemReferral", e);
    return { ok: false, reason: "error" };
  }
}

/* ── [#100] 추천 리더보드 ─────────────────────────────────────────
 * referral_redemptions 를 추천인별로 집계한 상위 목록. 이메일은 화면에 그대로
 * 내보내지 않는다 — 마스킹 라벨만 만든다(개인정보 최소 노출). 실패는 빈 배열이
 * 아니라 null 로 돌려 "아직 없음"과 "못 읽음"을 화면에서 구분하게 한다. */

export type ReferralLeaderRow = { label: string; count: number; isMe: boolean };

function maskEmailLabel(email: string): string {
  const local = email.split("@")[0] ?? "";
  const head = local.slice(0, 2) || "이웃";
  return `${head}**`;
}

export async function getReferralLeaderboard(
  viewerEmail: string,
  limit = 10,
): Promise<ReferralLeaderRow[] | null> {
  const read = getReadOnlySupabase();
  if (!read) return null;
  /* [1057] `.limit(3000)` 은 정렬 없이 1,000행에서 조용히 잘렸다(PostgREST 상한) — 유일 정렬(created_at, id)로 쪽을 나눠 끝까지 읽는다 */
  let data: Array<Record<string, unknown>>;
  try {
    const { rows, truncated } = await readPaged<Record<string, unknown>>(
      (from, to) =>
        read
          .from("referral_redemptions")
          .select("referrer_email")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      LEADERBOARD_MAX_ROWS,
    );
    if (truncated) throw new Error(`referral_redemptions 가 상한(${LEADERBOARD_MAX_ROWS})에 닿음`);
    data = rows;
  } catch (e) {
    logger.error("[referral] 리더보드 조회 실패", e);
    return null;
  }
  const counts = new Map<string, number>();
  for (const r of data) {
    const em = String(r.referrer_email ?? "").toLowerCase();
    if (!em) continue;
    counts.set(em, (counts.get(em) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([em, count]) => ({
      label: maskEmailLabel(em),
      count,
      isMe: em === viewerEmail.toLowerCase(),
    }));
}
