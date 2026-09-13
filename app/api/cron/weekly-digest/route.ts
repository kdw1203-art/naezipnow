import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import { getWeeklyDigest } from "@/lib/newui/digest";
import { captureException } from "@/lib/monitoring/capture";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { weeklyDigestEmail } from "@/lib/email/templates";
import { SITE_ORIGIN } from "@/lib/seo/complex-url";
import {
  buildPersonalDigest,
  loadPersonalDigestShared,
  PersonalDigestBudgetExceeded,
  type PersonalDigestProfile,
  type PersonalDigestShared,
} from "@/lib/digest/personal";
import {
  formatPersonalDigestEmail,
  formatPersonalDigestInbox,
  formatPersonalDigestPush,
  personalDigestPrimaryHref,
  type PersonalDigest,
} from "@/lib/digest/personal-format";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 주간 다이제스트 발송 크론.
 *
 * 왜 만들었나: `/digest` 화면이 "알림 설정에서 주간 다이제스트 알림을 켜면 매주
 * 요약을 보내드려요"라고 안내하고 있었는데, 켤 설정 항목도 보내는 경로도 없었다.
 * 사용자에게 지킬 수 없는 약속이 떠 있는 상태였다. 문구를 지우는 대신 약속을
 * 지키는 쪽으로 채운다.
 *
 * 대상([995] 수정): app_users 전원 중 notification_preferences.push_weekly_digest 가
 *       **명시적으로 false** 인 사람만 뺀다(= coalesce(push_weekly_digest, true)).
 *       예전엔 prefs 행에서 true 만 골랐는데, 코드 기본값은 true(설정 화면도 켜짐으로
 *       그림)이고 DB 기본값은 false 라 행이 없는 사람은 한 번도 뽑히지 않았다.
 *
 * 내용([995] 개인화): 사람마다 lib/digest/personal.ts 가 **그 사람의 행**으로 만든
 *       요약(관심 지역 시세 · 관심단지 새 실거래 · 임장 단지 · 관심 지역 청약).
 *       개인 요약이 비면(네 섹션 전부 0) 예전처럼 사이트 공통 요약(getWeeklyDigest)
 *       으로 폴백하되, 그것마저 비면 아무것도 보내지 않는다 — 보낼 내용이 없는데
 *       "요약이 왔어요"라고 알리는 것은 그 자체로 거짓이다.
 *
 * 채널: 인앱 수신함(항상) + 웹푸시(구독이 있을 때만) + 이메일.
 *       이메일은 RESEND_API_KEY 가 있고 **email_marketing = true(명시 옵트인)** 인
 *       사람에게만 — prefs 행이 없는 사람에게는 메일이 가지 않는다. 건너뛴 수는
 *       emailSkippedNoConsent 로 응답에 남는다(안 보낸 걸 보냈다고 착각하지 않게).
 *
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 월요일에만 호출한다(주 1회).
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * dryRun: ?dry=1 이면 만들기만 하고 보내지 않는다 — 수·첫 3명 미리보기를 돌려준다.
 * fail-soft: hard-throw 하지 않고 JSON 요약을 반환한다.
 */

const BATCH = 500;
/** app_users 페이지 상한 — 이 위는 적재 이상이므로 멈추고 응답에 남긴다 */
const MAX_PAGES = 20;
/** prefs 표 한 번에 읽는 상한 — 닿으면 잘렸을 수 있어 경고 */
const PREFS_LIMIT = 10_000;
/** 사용자당 개인 요약 예산 */
const PERSONAL_BUDGET_MS = 4_000;
/** 배치 전체 벽시계 예산 — maxDuration(120s) 안에 응답까지 남기려면 여기서 멈춘다 */
const RUN_BUDGET_MS = 95_000;
/** 동시에 처리하는 사용자 수 — DB 를 밀지 않는 선에서 순차보다 조금 빠르게 */
const CONCURRENCY = 4;
/** dry-run 미리보기 수 */
const PREVIEWS = 3;

interface RunSummary {
  ok: boolean;
  dryRun: boolean;
  /** 대상(옵트아웃 제외) 수 */
  optedIn: number;
  /** 실제 수신함에 남긴 수 */
  notified: number;
  /** 그중 웹푸시가 나간 구독 수 */
  pushSent: number;
  /** 이메일 발송 성공 수 ([D002]) */
  emailSent: number;
  /** 이메일을 건너뛴 이유 (미설정 등, 있을 때만) */
  emailSkipped?: string;
  /** [995] 마케팅 수신 동의가 없어 메일을 건너뛴 사람 수 */
  emailSkippedNoConsent: number;
  /** [995] 개인 요약 집계 */
  personal: { built: number; empty: number; budgetExceeded: number; failed: number };
  /** [995] 개인 요약이 비어 사이트 공통 요약으로 폴백한 수 */
  fallback: number;
  /** [995] 벽시계 예산으로 처리하지 못하고 남긴 수(있을 때만) */
  remaining?: number;
  /** dry-run 전용 — 실제로 돌렸다면 수신함에 남았을 수(notified 는 dry-run 에서 0 을 유지) */
  wouldNotify?: number;
  /** dry-run 미리보기(있을 때만) */
  previews?: Array<{ to: string; kind: "personal" | "fallback"; title: string; body: string; email: boolean }>;
  /** 보내지 않은 이유 (있을 때만) */
  skipped?: string;
}

type Sb = NonNullable<ReturnType<typeof getServiceSupabase>>;

async function pushToEmail(sb: Sb, email: string, payload: PushPayload): Promise<number> {
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_email", email)
      .limit(20);
    /* 못 읽은 것과 "구독 없음"은 다른 사실이다. 발송은 best-effort 라 계속하되
       못 읽었다는 것만은 로그에 남긴다(안 그러면 0건으로만 보인다). */
    if (error) {
      logger.warn(`[cron/weekly-digest] push_subscriptions 조회 실패 (${email})`, error);
      return 0;
    }
    const subs = (data ?? []) as Array<Record<string, unknown>>;
    let sent = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          const r = await sendPush(
            {
              endpoint: String(s.endpoint),
              keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
            },
            payload,
          );
          if (r.ok) sent += 1;
        } catch {
          // 개별 구독 실패는 무시 — 수신함에는 이미 남았다
        }
      }),
    );
    return sent;
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest:push", email });
    return 0;
  }
}

/* ── 대상 ──────────────────────────────────────────────────────────────── */

type Recipient = { email: string; profile: PersonalDigestProfile };

/** [995] prefs 에서 한 값만 가진 이메일 집합 — 옵트아웃(push_weekly_digest=false)·메일 동의(email_marketing=true) */
async function prefsEmailSet(sb: Sb, column: "push_weekly_digest" | "email_marketing", value: boolean): Promise<Set<string>> {
  const { data, error } = await sb
    .from("notification_preferences")
    .select("user_email")
    .eq(column, value)
    .limit(PREFS_LIMIT);
  if (error) throw new Error(`notification_preferences(${column}) 조회 실패: ${error.message}`);
  const rows = data ?? [];
  if (rows.length >= PREFS_LIMIT) {
    logger.error(`[cron/weekly-digest] notification_preferences.${column} 가 상한(${PREFS_LIMIT})에 닿음 — 잘렸을 수 있다`);
  }
  return new Set(rows.map((r) => String((r as { user_email?: unknown }).user_email ?? "").trim().toLowerCase()).filter(Boolean));
}

/** [995] app_users 한 페이지(BATCH) — 이메일 순, 프로필(관심 지역)까지 함께 읽어 사용자당 왕복을 하나 줄인다 */
async function readUsersPage(sb: Sb, page: number): Promise<Recipient[]> {
  const from = page * BATCH;
  const { data, error } = await sb
    .from("app_users")
    .select("email, watch_regions, primary_region")
    .order("email", { ascending: true })
    .range(from, from + BATCH - 1);
  if (error) throw new Error(`app_users 조회 실패: ${error.message}`);
  const out: Recipient[] = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    out.push({
      email,
      profile: { watchRegions: r.watch_regions, primaryRegion: r.primary_region ? String(r.primary_region) : null },
    });
  }
  return out;
}

/* ── 사이트 공통 폴백 ───────────────────────────────────────────────────── */

type SiteFallback = {
  title: string;
  body: string;
  payload: PushPayload;
  emailContent: { subject: string; html: string; text: string } | null;
} | null;

async function loadSiteFallback(emailReady: boolean): Promise<{ fallback: SiteFallback; failed: boolean }> {
  let digest: Awaited<ReturnType<typeof getWeeklyDigest>>;
  try {
    digest = await getWeeklyDigest();
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest" });
    return { fallback: null, failed: true };
  }
  const parts: string[] = [];
  if (digest.news.length > 0) parts.push(`뉴스 ${digest.news.length}건`);
  if (digest.market.length > 0) parts.push(`주요 지역 시세 ${digest.market.length}곳`);
  if (digest.community.count > 0) parts.push(`이웃 글 ${digest.community.count}건`);
  if (parts.length === 0) {
    const anyFailed = digest.failed.news || digest.failed.market || digest.failed.community;
    return { fallback: null, failed: anyFailed };
  }
  const title = `${digest.weekLabel} 주간 다이제스트`;
  const body = `이번 주 ${parts.join(" · ")}`;
  return {
    failed: false,
    fallback: {
      title,
      body,
      payload: { title, body, url: "/digest", tag: `weekly-digest-${digest.weekLabel}`, eventType: "generic" },
      /* [D002] 공통 요약 메일은 한 번만 렌더 — 수신자 개인화가 없다 */
      emailContent: emailReady
        ? weeklyDigestEmail({
            weekLabel: digest.weekLabel,
            market: digest.market.map((m) => ({ name: m.name, price: m.price, delta: m.delta, tone: m.tone })),
            news: digest.news.map((n) => ({ title: n.title, sourceName: n.sourceName })),
            communityCount: digest.community.count,
          })
        : null,
    },
  };
}

/* ── 실행 ──────────────────────────────────────────────────────────────── */

async function run(dryRun: boolean): Promise<RunSummary> {
  /* 누적 카운터 — 아래 handleUser 가 직접 올린다 */
  const counters: RunSummary = {
    ok: true,
    dryRun,
    optedIn: 0,
    notified: 0,
    pushSent: 0,
    emailSent: 0,
    emailSkippedNoConsent: 0,
    personal: { built: 0, empty: 0, budgetExceeded: 0, failed: 0 },
    fallback: 0,
  };

  const sb = getServiceSupabase();
  if (!sb) return { ...counters, skipped: "supabase-unconfigured" };

  const startedAt = Date.now();
  const now = new Date();
  const emailReady = isEmailConfigured();

  let optOut: Set<string>;
  let emailConsent: Set<string>;
  try {
    [optOut, emailConsent] = await Promise.all([
      prefsEmailSet(sb, "push_weekly_digest", false),
      prefsEmailSet(sb, "email_marketing", true),
    ]);
  } catch (e) {
    return { ...counters, ok: false, skipped: e instanceof Error ? e.message : String(e) };
  }

  /* 공통 재료는 한 번만: 사이트 폴백 요약 · 지역 스냅샷 · 청약 공고 창 */
  const [{ fallback: site, failed: siteFailed }, shared] = await Promise.all([
    loadSiteFallback(emailReady),
    loadPersonalDigestShared(now, 7),
  ]);

  const previews: NonNullable<RunSummary["previews"]> = [];
  let wouldNotify = 0;

  /* 함수 선언(호이스팅)이면 위 `if (!sb)` 좁힘이 안으로 안 들어온다 — 식으로 둔다 */
  const handleUser = async (r: Recipient, sharedCtx: PersonalDigestShared): Promise<void> => {
    let personal: PersonalDigest | null = null;
    try {
      personal = await buildPersonalDigest(r.email, {
        now,
        days: 7,
        budgetMs: PERSONAL_BUDGET_MS,
        profile: r.profile,
        shared: sharedCtx,
      });
      if (personal) counters.personal.built += 1;
      else counters.personal.empty += 1;
    } catch (e) {
      if (e instanceof PersonalDigestBudgetExceeded) {
        counters.personal.budgetExceeded += 1;
        logger.warn(`[cron/weekly-digest] ${e.message}`);
      } else {
        counters.personal.failed += 1;
        captureException(e, { where: "cron/weekly-digest:personal", email: r.email });
      }
    }

    /* 개인 요약이 없으면 공통 요약으로 — 그것도 없으면 이 사람에겐 아무것도 안 보낸다 */
    let inbox: { title: string; body: string; actionUrl: string };
    let payload: PushPayload;
    let emailContent: { subject: string; html: string; text: string } | null = null;
    let kind: "personal" | "fallback";
    if (personal) {
      kind = "personal";
      const f = formatPersonalDigestInbox(personal);
      const href = personalDigestPrimaryHref(personal);
      inbox = { ...f, actionUrl: href };
      const push = formatPersonalDigestPush(personal);
      payload = { ...push, url: href, tag: `weekly-digest-${personal.weekLabel}`, eventType: "generic" };
      if (emailReady) emailContent = formatPersonalDigestEmail(personal, { siteUrl: SITE_ORIGIN });
    } else if (site) {
      kind = "fallback";
      counters.fallback += 1;
      inbox = { title: site.title, body: site.body, actionUrl: "/digest" };
      payload = site.payload;
      emailContent = site.emailContent;
    } else {
      return;
    }

    const emailAllowed = emailConsent.has(r.email);
    if (emailContent && !emailAllowed) counters.emailSkippedNoConsent += 1;

    if (dryRun) {
      if (previews.length < PREVIEWS) {
        previews.push({ to: r.email, kind, title: inbox.title, body: inbox.body, email: Boolean(emailContent && emailAllowed) });
      }
      wouldNotify += 1;
      return;
    }

    try {
      await appendInboxNotification({ userEmail: r.email, ...inbox });
      counters.notified += 1;
      counters.pushSent += await pushToEmail(sb, r.email, payload);
    } catch (e) {
      captureException(e, { where: "cron/weekly-digest", email: r.email });
    }
    /* 메일은 명시 동의자에게만 — prefs 행이 없는 사람은 여기서 걸린다 */
    if (emailContent && emailAllowed) {
      try {
        const res = await sendEmail({ to: r.email, ...emailContent });
        if (res.sent) counters.emailSent += 1;
      } catch (e) {
        captureException(e, { where: "cron/weekly-digest:email", email: r.email });
      }
    }
  };

  /* app_users 를 BATCH 씩 페이지로 읽고, 페이지 안에서는 CONCURRENCY 명씩 처리한다.
     벽시계 예산을 넘기면 남은 수를 세어 응답에 남기고 멈춘다(조용히 잘리지 않게). */
  let optedIn = 0;
  let remaining = 0;
  let outOfTime = false;
  for (let page = 0; page < MAX_PAGES && !outOfTime; page += 1) {
    let users: Recipient[];
    try {
      users = await readUsersPage(sb, page);
    } catch (e) {
      captureException(e, { where: "cron/weekly-digest:audience" });
      return { ...counters, ok: false, optedIn, skipped: e instanceof Error ? e.message : String(e) };
    }
    const targets = users.filter((u) => !optOut.has(u.email));
    optedIn += targets.length;

    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        if (Date.now() - startedAt > RUN_BUDGET_MS) {
          outOfTime = true;
          return;
        }
        const r = targets[cursor++];
        await handleUser(r, shared);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    if (outOfTime) remaining += targets.length - cursor;
    if (users.length < BATCH) break;
    if (page === MAX_PAGES - 1) logger.error(`[cron/weekly-digest] app_users 페이지 상한(${MAX_PAGES}×${BATCH}) 도달 — 대상이 잘렸을 수 있다`);
  }

  if (optedIn === 0) return { ...counters, optedIn, skipped: "no-subscribers" };

  logger.info(
    `[cron/weekly-digest] 대상 ${optedIn} · 개인 ${counters.personal.built} · 빈 요약 ${counters.personal.empty} · 예산 초과 ${counters.personal.budgetExceeded} · 폴백 ${counters.fallback} · 수신함 ${dryRun ? wouldNotify : counters.notified} · 푸시 ${counters.pushSent} · 메일 ${counters.emailSent}(동의 없음 ${counters.emailSkippedNoConsent})${dryRun ? " · dry-run" : ""}`,
  );

  /* 아무에게도 남기지 못했다면 이유를 예전과 같은 어휘로 — 빈 주와 조회 실패를 섞지 않는다 */
  const nothing = (dryRun ? wouldNotify : counters.notified) === 0;
  return {
    ...counters,
    optedIn,
    ...(emailReady ? {} : { emailSkipped: "RESEND_API_KEY 미설정" }),
    ...(remaining > 0 ? { remaining } : {}),
    ...(dryRun ? { wouldNotify, previews, skipped: "dry-run" } : {}),
    ...(nothing ? { skipped: siteFailed ? "digest-read-failed" : "empty" } : {}),
  };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    return NextResponse.json(await run(dryRun));
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest:handle" });
    logger.error("[cron/weekly-digest] 실패", e);
    return NextResponse.json({
      ok: false,
      dryRun,
      optedIn: 0,
      notified: 0,
      pushSent: 0,
      emailSent: 0,
      emailSkippedNoConsent: 0,
      personal: { built: 0, empty: 0, budgetExceeded: 0, failed: 0 },
      fallback: 0,
      skipped: "exception",
    });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
