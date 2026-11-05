import { cache } from "react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { readPosts } from "@/lib/posts-store";
import { kstDayStartIso } from "@/lib/format/kst";
import { isLabAuthor } from "@/lib/notes/author-label";
import { readPaged } from "@/lib/supabase/read-paged";
import { vitalRowUsable } from "@/lib/metrics/vitals-scope";
import { isLegacyProbeSample } from "@/lib/client/probe";

/** 30일 가입 추이 조회 상한(#32) — 닿으면 잘린 그래프 대신 실패로 알린다 */
const SIGNUP_TREND_LIMIT = 50_000;

/**
 * 관리자 대시보드용 집계.
 * - Supabase 가 설정돼 있으면 app_users / posts / content_reports / notification_outbox 로부터 카운트
 * - 미설정 시 파일 기반 posts, market_requests 만 반환
 * 어떤 경우에도 throw 하지 않고 안전한 기본값을 반환합니다.
 */

export type AdminKpi = {
  totalUsers: number;
  totalAdmins: number;
  newUsers7d: number;
  newUsers30d: number;
  newUsersToday: number;
  planCounts: Record<string, number>;
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  openReports: number;
  totalReports: number;
  pendingOutbox: number;
  totalOutbox: number;
  marketOpen: number;
  marketTotal: number;
  pendingExpertRequests: number;
  pendingMeetingRequests: number;
  totalExperts: number;
  totalMeetings: number;
  meetingsToday: number;
  /** [1106] 사람이 쓴 임장노트(운영진 예시 "내집나우 Lab" 글 제외 — lib/notes/author-label isLabAuthor) */
  totalInspections: number;
  inspectionsThisWeek: number;
  /** [1106] 운영진 예시(Lab) 노트 — 하루 몇 건씩 자동으로 올라와 "사용자 활동"처럼 보였다 */
  labInspections: number;
  totalReportDocs: number;
  reportDocsToday: number;
  /** 최근 7일 글·임장노트를 쓴 사람(이메일 또는 author_label 기준 유니크 · Lab 제외) — 방문자 수가 아니다 */
  activeUsers7d: number;
  /** Supabase payments 확정 건수(30일, paid_at 기준) */
  paymentsCompleted30d: number;
  paymentsRevenue30dKrw: number;
  totalBookmarks: number;
  totalInboxNotifications: number;
  /** [992] 결제 연동 여부 — 토스 시크릿·클라이언트 키 기준(Stripe 제거) */
  paymentsConfigured: boolean;
  supabaseConfigured: boolean;
  /**
   * public.ai_analysis_runs 최근 7일 건수. 테이블·권한 없으면 null.
   */
  aiAnalysisRuns7d: number | null;
  /**
   * public.platform_activity_events 최근 7일 건수. 테이블·권한 없으면 null.
   */
  platformActivityEvents7d: number | null;
};

export type VitalKey = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
export type VitalStat = {
  metric: VitalKey;
  p75: number | null;
  samples: number;
  good: number;
  needsImprovement: number;
  poor: number;
};

/**
 * Web Vitals 임계값(웹 표준) - 측정값이 이 이하면 "좋음".
 * https://web.dev/articles/vitals
 */
const VITAL_THRESHOLDS: Record<VitalKey, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

export function classifyVital(metric: VitalKey, value: number): "good" | "ni" | "poor" {
  const t = VITAL_THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export function formatVital(metric: VitalKey, value: number | null): string {
  if (value == null) return "—";
  if (metric === "CLS") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

export async function loadVitalsLast7d(): Promise<VitalStat[]> {
  const sb = getServiceSupabase();
  const metrics: VitalKey[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];
  const empty: VitalStat[] = metrics.map((m) => ({
    metric: m,
    p75: null,
    samples: 0,
    good: 0,
    needsImprovement: 0,
    poor: 0,
  }));
  if (!sb) return empty;

  const since = new Date(Date.now() - 7 * 86_400_000);
  /* [1106] 관리 › 성능과 같은 자 — 쪽으로 끝까지 읽고(응답 상한 1,000행) · 점검 로봇 표본 · 단위가 맞지 않는 줄을 뺀다 */
  let data: Array<{ metric: string; value: number; scope: string | null; user_agent: string | null; created_at: string | null }>;
  try {
    const paged = await readPaged<{ metric: string; value: number; scope: string | null; user_agent: string | null; created_at: string | null }>(
      (from, to) =>
        sb
          .from("web_vitals")
          .select("metric, value, scope, user_agent, created_at")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      20_000,
    );
    data = paged.rows.filter((r) => !isLegacyProbeSample(r.user_agent, r.created_at) && vitalRowUsable(r.metric, r.scope));
  } catch {
    return empty;
  }

  const buckets = new Map<VitalKey, number[]>();
  for (const m of metrics) buckets.set(m, []);
  for (const row of data) {
    const key = row.metric as VitalKey;
    const bucket = buckets.get(key);
    if (bucket && Number.isFinite(row.value)) {
      bucket.push(Number(row.value));
    }
  }

  return metrics.map((m) => {
    const arr = (buckets.get(m) ?? []).slice().sort((a, b) => a - b);
    if (arr.length === 0) {
      return { metric: m, p75: null, samples: 0, good: 0, needsImprovement: 0, poor: 0 };
    }
    const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.75));
    let good = 0;
    let ni = 0;
    let poor = 0;
    for (const v of arr) {
      const c = classifyVital(m, v);
      if (c === "good") good += 1;
      else if (c === "ni") ni += 1;
      else poor += 1;
    }
    return {
      metric: m,
      p75: arr[idx],
      samples: arr.length,
      good,
      needsImprovement: ni,
      poor,
    };
  });
}

export type AdminRecent = {
  recentPosts: Array<{
    id: string;
    title: string;
    city: string;
    district: string;
    createdAt: string;
    authorLabel: string;
  }>;
  recentReports: Array<{
    id: string;
    postId: string;
    reason: string;
    status: string;
    createdAt: string;
  }>;
  recentOutbox: Array<{
    id: string;
    toEmail: string;
    subject: string;
    status: string;
    createdAt: string;
  }>;
};

/* [1106] 날의 경계는 한국 자정 — 서버(Vercel)는 UTC 라 예전 setHours(0) 은 한국 09:00 이었다
   ("오늘 가입 · 오늘 글 · 오늘 리포트"가 아침 9시에 넘어가고 0~9시 일은 전날로 셌다). */
function startOfDay(d: Date): Date {
  return new Date(kstDayStartIso(d.getTime()));
}

function daysAgo(n: number): Date {
  return new Date(kstDayStartIso(Date.now(), -n));
}

async function safeCountSinceTable(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  table: string,
  sinceIso: string,
): Promise<number | null> {
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error) return null;
  return typeof count === "number" ? count : null;
}

/* [1097 · 성능] 요청 안에서 한 번만 — /admin/ops 는 직접 + getOperatingMetrics 경유로 두 번 불렀고(28개 조회 × 2), 대시보드 계열도
   같은 렌더에서 겹쳐 부른다. React cache() 는 같은 요청의 같은 인자 호출을 하나로 접는다(요청 밖 캐시 없음). */
export const loadAdminKpi = cache(loadAdminKpiUncached);

async function loadAdminKpiUncached(): Promise<AdminKpi> {
  const sb = getServiceSupabase();
  const today = startOfDay(new Date()).toISOString();
  const weekAgo = daysAgo(7).toISOString();

  const base: AdminKpi = {
    totalUsers: 0,
    totalAdmins: 0,
    newUsers7d: 0,
    newUsers30d: 0,
    newUsersToday: 0,
    planCounts: {},
    totalPosts: 0,
    postsToday: 0,
    postsThisWeek: 0,
    openReports: 0,
    totalReports: 0,
    pendingOutbox: 0,
    totalOutbox: 0,
    marketOpen: 0,
    marketTotal: 0,
    pendingExpertRequests: 0,
    pendingMeetingRequests: 0,
    totalExperts: 0,
    totalMeetings: 0,
    meetingsToday: 0,
    totalInspections: 0,
    inspectionsThisWeek: 0,
    labInspections: 0,
    totalReportDocs: 0,
    reportDocsToday: 0,
    activeUsers7d: 0,
    paymentsCompleted30d: 0,
    paymentsRevenue30dKrw: 0,
    totalBookmarks: 0,
    totalInboxNotifications: 0,
    paymentsConfigured: Boolean(process.env.TOSS_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim()),
    supabaseConfigured: Boolean(sb),
    aiAnalysisRuns7d: null,
    platformActivityEvents7d: null,
  };

  /* 파일 기반 fallback 집계.
     Supabase 가 붙어 있을 때는 아래에서 count 질의로 정확히 다시 구하므로,
     여기서 글 전체를 읽는 건 순수한 낭비였다(그리고 readPosts 에 상한이
     생긴 뒤로는 length 로 총계를 세는 것 자체가 틀린 답이 된다). */
  if (!sb) {
    try {
      const posts = await readPosts();
      base.totalPosts = posts.length;
      base.postsToday = posts.filter((p) => p.createdAt >= today).length;
      base.postsThisWeek = posts.filter((p) => p.createdAt >= weekAgo).length;
    } catch {
      /* ignore */
    }
  }
  /* [1106] 의뢰는 market_requests 표에 쌓인다(lib/market/store-db). 예전 집계는 서버리스에 없는 로컬 파일
     (data/market_requests.json)을 읽어 운영에서 늘 0 이었다(실측 2026-11-05: 표 1건 · 진행 중 1건). */
  if (!sb) return base;

  const thirtyAgo = daysAgo(30).toISOString();

  const [
    usersRes,
    adminsRes,
    new7Res,
    new30Res,
    postsCountRes,
    openReportsRes,
    totalReportsRes,
    pendingOutboxRes,
    totalOutboxRes,
    plans,
    expertPendingRes,
    meetingPendingRes,
    newTodayRes,
    expertsTotalRes,
    meetingsTotalRes,
    meetingsTodayRes,
    notesRes,
    marketTotalRes,
    marketOpenRes,
    reportDocsTotalRes,
    reportDocsTodayRes,
    bookmarksTotalRes,
    paymentsPaid30Res,
    inboxTotalRes,
    postsWeekRes,
    postsTodayCountRes,
    postsWeekCountRes,
  ] = await Promise.all([
    /* [1106] 회원 수는 profiles(가입 계정마다 한 줄 = auth.users) — app_users 는 비밀번호·역할 보조 표라 일부만 있다
       (실측 2026-11-05: profiles 15 · auth.users 15 · app_users 5). 대시보드 "회원 관리 총 15명"과 같은 자. */
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("app_users").select("*", { count: "exact", head: true }).eq("role", "admin"),
    sb.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", thirtyAgo),
    sb.from("posts").select("*", { count: "exact", head: true }),
    sb.from("content_reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    sb.from("content_reports").select("*", { count: "exact", head: true }),
    sb
      .from("notification_outbox")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("notification_outbox").select("*", { count: "exact", head: true }),
    sb.from("app_users").select("plan"),
    sb
      .from("expert_verification_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb
      .from("meeting_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", today),
    sb.from("expert_profiles").select("*", { count: "exact", head: true }),
    sb.from("meetings").select("*", { count: "exact", head: true }),
    sb.from("meetings").select("*", { count: "exact", head: true }).gte("created_at", today),
    /* [1106] 노트는 작성자 라벨까지 읽어 Lab(운영진 예시) 글을 가른다 — 머리 count 로는 거를 수 없다(정규식 단어 경계) */
    readPaged<{ author_label: string | null; author_email: string | null; user_id: string | null; created_at: string }>(
      (from, to) =>
        sb
          .from("inspection_notes")
          .select("author_label, author_email, user_id, created_at")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      20_000,
    ).catch(() => null),
    sb.from("market_requests").select("*", { count: "exact", head: true }),
    sb.from("market_requests").select("*", { count: "exact", head: true }).eq("status", "open"),
    sb.from("reports").select("*", { count: "exact", head: true }),
    /* reports 에는 created_at 이 없다(published_at·updated_at 뿐). 없는 컬럼으로
       거르면 이 count 는 매번 error 라 "오늘 0건"이 사실처럼 남았다. */
    sb.from("reports").select("*", { count: "exact", head: true }).gte("published_at", today),
    sb.from("bookmarks").select("*", { count: "exact", head: true }),
    sb
      .from("payments")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", thirtyAgo)
      .not("paid_at", "is", null)
      .limit(5000),
    sb.from("user_inbox_notifications").select("*", { count: "exact", head: true }),
    sb
      .from("posts")
      .select("author_label, notify_email")
      .gte("created_at", weekAgo)
      .limit(4000),
    /* 오늘·이번 주 글 수 — 예전엔 글 전체를 받아 와 자바스크립트에서 셌다.
       count 질의는 행을 하나도 실어 보내지 않으면서 정확하다. */
    sb
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today),
    sb
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo),
  ]);

  if (typeof usersRes.count === "number") base.totalUsers = usersRes.count;
  if (typeof adminsRes.count === "number") base.totalAdmins = adminsRes.count;
  if (typeof new7Res.count === "number") base.newUsers7d = new7Res.count;
  if (typeof new30Res.count === "number") base.newUsers30d = new30Res.count;
  if (typeof postsCountRes.count === "number") base.totalPosts = postsCountRes.count;
  if (typeof postsTodayCountRes.count === "number") base.postsToday = postsTodayCountRes.count;
  if (typeof postsWeekCountRes.count === "number") base.postsThisWeek = postsWeekCountRes.count;
  if (typeof openReportsRes.count === "number") base.openReports = openReportsRes.count;
  if (typeof totalReportsRes.count === "number") base.totalReports = totalReportsRes.count;
  if (typeof pendingOutboxRes.count === "number") base.pendingOutbox = pendingOutboxRes.count;
  if (typeof totalOutboxRes.count === "number") base.totalOutbox = totalOutboxRes.count;
  if (typeof expertPendingRes.count === "number") base.pendingExpertRequests = expertPendingRes.count;
  if (typeof meetingPendingRes.count === "number") base.pendingMeetingRequests = meetingPendingRes.count;
  if (typeof newTodayRes.count === "number") base.newUsersToday = newTodayRes.count;
  if (typeof expertsTotalRes.count === "number") base.totalExperts = expertsTotalRes.count;
  if (typeof meetingsTotalRes.count === "number") base.totalMeetings = meetingsTotalRes.count;
  if (typeof meetingsTodayRes.count === "number") base.meetingsToday = meetingsTodayRes.count;
  if (typeof marketTotalRes.count === "number") base.marketTotal = marketTotalRes.count;
  if (typeof marketOpenRes.count === "number") base.marketOpen = marketOpenRes.count;
  const noteAuthors7d = new Set<string>();
  if (notesRes) {
    for (const n of notesRes.rows) {
      if (isLabAuthor(n.author_label)) {
        base.labInspections += 1;
        continue;
      }
      base.totalInspections += 1;
      if (Date.parse(n.created_at) >= Date.parse(weekAgo)) {
        base.inspectionsThisWeek += 1;
        const key = n.user_id || String(n.author_email ?? "").trim().toLowerCase();
        if (key) noteAuthors7d.add(`note:${key}`);
      }
    }
  }
  if (typeof reportDocsTotalRes.count === "number") base.totalReportDocs = reportDocsTotalRes.count;
  if (typeof reportDocsTodayRes.count === "number") base.reportDocsToday = reportDocsTodayRes.count;
  if (typeof bookmarksTotalRes.count === "number") base.totalBookmarks = bookmarksTotalRes.count;
  if (typeof inboxTotalRes.count === "number") {
    base.totalInboxNotifications = inboxTotalRes.count;
  }
  if (Array.isArray(paymentsPaid30Res.data)) {
    const rows = paymentsPaid30Res.data as Array<{ amount?: number | string | null }>;
    base.paymentsCompleted30d = rows.length;
    base.paymentsRevenue30dKrw = rows.reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
  }
  if (Array.isArray(postsWeekRes.data)) {
    const uniq = new Set<string>();
    for (const row of postsWeekRes.data as Array<{
      author_label?: string | null;
      notify_email?: string | null;
    }>) {
      const email = String(row.notify_email ?? "")
        .trim()
        .toLowerCase();
      const label = String(row.author_label ?? "")
        .trim()
        .toLowerCase();
      const key = email || label;
      if (key && !isLabAuthor(label)) uniq.add(key);
    }
    /* [1106] 노트 작성자도 활동한 사람이다(예전엔 글만 세어 노트만 쓴 사람이 0 으로 보였다). 같은 사람이 둘 다 쓰면 두 번 셀 수 있다 — 근사 */
    for (const k of noteAuthors7d) uniq.add(k);
    base.activeUsers7d = uniq.size;
  } else {
    base.activeUsers7d = noteAuthors7d.size;
  }

  const pc: Record<string, number> = {};
  if (Array.isArray(plans.data)) {
    for (const row of plans.data as Array<{ plan?: string | null }>) {
      const key = (row.plan ?? "free").toLowerCase();
      pc[key] = (pc[key] ?? 0) + 1;
    }
  }
  base.planCounts = pc;
  base.paymentsConfigured = Boolean(process.env.TOSS_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim());

  const [ai7, pe7] = await Promise.all([
    safeCountSinceTable(sb, "ai_analysis_runs", weekAgo),
    safeCountSinceTable(sb, "platform_activity_events", weekAgo),
  ]);
  base.aiAnalysisRuns7d = ai7;
  base.platformActivityEvents7d = pe7;

  return base;
}

export type PopularPost = {
  id: string;
  title: string;
  city: string;
  district: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

/**
 * 인기 글·지역 분포가 훑는 표본 크기.
 *
 * 예전에는 "전체 글"을 훑었지만, 전체를 훑는 질의는 상한이 없어 매일 조금씩
 * 무거워졌다. 지금은 **최신 이만큼**을 표본으로 쓴다 — 그래서 아래 두 값은
 * "전체 기준"이 아니라 "최근 {@link ADMIN_POST_SAMPLE} 건 기준"이다.
 * 이 구분은 CSV 내려받기에도 그대로 적어 둔다(app/api/admin/report).
 */
export const ADMIN_POST_SAMPLE = 500;

/** 인기 글 상위 8 — 최근 {@link ADMIN_POST_SAMPLE} 건 표본 기준. */
export async function loadPopularPosts(): Promise<PopularPost[]> {
  const posts = await readPosts(ADMIN_POST_SAMPLE);
  return posts
    .slice()
    .sort((a, b) => b.viewCount * 2 + b.likeCount * 5 - (a.viewCount * 2 + a.likeCount * 5))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      district: p.district,
      viewCount: p.viewCount,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
    }));
}

export type RegionShare = { region: string; count: number; pct: number };

/** 지역 분포 상위 10 — 최근 {@link ADMIN_POST_SAMPLE} 건 표본 기준(전체 아님). */
export async function loadRegionDistribution(): Promise<RegionShare[]> {
  const posts = await readPosts(ADMIN_POST_SAMPLE);
  const bucket = new Map<string, number>();
  for (const p of posts) {
    const key = p.city || "미상";
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const total = posts.length || 1;
  return Array.from(bucket.entries())
    .map(([region, count]) => ({ region, count, pct: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export type SignupTrendPoint = { date: string; count: number };

/**
 * 최근 30일 가입 추이.
 *
 * 여기서 0 을 만들어 내지 않는다. 이 함수가 돌려주는 30개의 점은 관리자
 * 화면에서 "요즘 가입이 없다"로 읽히고, 그건 사업 판단이 걸리는 주장이다.
 * 못 읽었을 뿐인데 0 이 30일치 그려지면 있지도 않은 침체를 보고하는 셈이다.
 * 그래서 읽을 수단이 없거나 조회가 실패하면 던진다 — 부르는 쪽이 "가입이
 * 없다"와 "못 읽었다"를 구분해서 화면에 다르게 그려야 한다.
 */
export async function loadSignupTrend30d(): Promise<SignupTrendPoint[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "app_users 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.",
    );
  }
  const since = daysAgo(29).toISOString();
  /* #32 — 상한을 명시한다. PostgREST 는 max-rows 에 걸리면 잘린 배열을 그냥
     주므로, 상한을 안 적으면 "30일 가입이 딱 그만큼"으로 보인다. 닿으면
     조용히 줄어든 그래프를 그리는 대신 던진다(위 주석의 원칙과 같다). */
  const { data, error } = await sb
    .from("app_users")
    .select("created_at")
    .gte("created_at", since)
    .limit(SIGNUP_TREND_LIMIT);
  if (error) {
    throw new Error(
      `app_users 조회 실패 (최근 30일 가입 추이) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}`,
    );
  }
  if ((data?.length ?? 0) >= SIGNUP_TREND_LIMIT) {
    throw new Error(
      `app_users 30일 가입 조회가 상한(${SIGNUP_TREND_LIMIT}행)에 도달했습니다 — ` +
        "잘린 값으로 추이를 그리면 실제보다 적게 보입니다. 일자별 SQL 집계로 옮겨야 합니다.",
    );
  }
  const daily = new Map<string, number>();
  for (let i = 0; i < 30; i += 1) {
    const d = daysAgo(29 - i);
    daily.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of (data ?? []) as Array<{ created_at: string }>) {
    const key = row.created_at.slice(0, 10);
    if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
  }
  return Array.from(daily.entries()).map(([date, count]) => ({ date, count }));
}

export async function loadAdminRecent(): Promise<AdminRecent> {
  const sb = getServiceSupabase();
  const out: AdminRecent = {
    recentPosts: [],
    recentReports: [],
    recentOutbox: [],
  };

  // 최근 글 (파일/Supabase 공통 경로) — 10건만 쓰므로 10건만 읽는다.
  try {
    const posts = await readPosts(10);
    out.recentPosts = posts.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      district: p.district,
      createdAt: p.createdAt,
      authorLabel: p.authorLabel,
    }));
  } catch {
    /* ignore */
  }

  if (!sb) return out;

  const [reportsRes, outboxRes] = await Promise.all([
    sb
      .from("content_reports")
      .select("id, post_id, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("notification_outbox")
      .select("id, to_email, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (Array.isArray(reportsRes.data)) {
    out.recentReports = reportsRes.data.map((r) => ({
      id: r.id as string,
      postId: r.post_id as string,
      reason: r.reason as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }
  if (Array.isArray(outboxRes.data)) {
    out.recentOutbox = outboxRes.data.map((r) => ({
      id: r.id as string,
      toEmail: r.to_email as string,
      subject: r.subject as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }

  return out;
}

/* ── 고도화 31 — 사전 등록(결제 오픈 대기) 수요 집계 ─────────────────────────
   /subscription 의 "오픈 알림 받기"가 platform_activity_events 에
   plan_preorder_interest 로 쌓이는데, 이를 보여 주는 화면이 없어 결제를
   언제 열지 판단할 근거가 어드민에 없었다. 실패는 null — 0건(사실)과
   "못 읽음"을 섞지 않는다. */
export async function loadPreorderInterest(): Promise<{
  total: number;
  /** 식별 가능한(로그인) 신청자 수 — 비로그인 신청은 total 에만 포함 */
  users: number;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("platform_activity_events")
    .select("user_email")
    .eq("event_name", "plan_preorder_interest")
    .limit(10000);
  if (error || !Array.isArray(data)) return null;
  const emails = new Set<string>();
  for (const r of data as Array<{ user_email: string | null }>) {
    const e = (r.user_email ?? "").trim().toLowerCase();
    if (e) emails.add(e);
  }
  return { total: data.length, users: emails.size };
}
