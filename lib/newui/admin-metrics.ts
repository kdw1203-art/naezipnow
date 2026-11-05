/**
 * 관리자 대시보드(`app/admin/page.tsx`) 실집계 로더 (#83).
 *
 * - [1106] 오늘 방문: `page_view_daily_agg` 오늘(한국 날짜) 첫 화면 수 — 예전 "DAU(24h)"는 드문 UI 이벤트 표
 *   (platform_activity_events · 하루 0~20건)를 세어 방문이 수백인 날에도 0 이었다
 * - 신규 임장노트: `inspection_notes` 오늘(한국) 사람이 쓴 건수(운영진 예시 Lab 제외)
 * - 가입: `profiles` 최근 24h 건수 (테이블 없으면 `app_users` 폴백)
 * - 전환율: 오늘 신규 노트 ÷ 오늘 방문 (계산 불가 시 null → "—")
 * - 구독 매출: 승인된(`approved_at` 있는) `payment_orders.amount_krw` 합.
 *   못 읽으면 구 `payments` paid 합으로 한 번 폴백하고, 그마저 실패하면
 *   null 을 돌려 "—"가 뜨게 한다 — 조회 실패를 "0원"이라고 말하지 않는다.
 * - 처리 대기: `content_reports` 최근 5건 (open 우선)
 *
 * 모든 조회는 읽기 전용(lib/newui/supabase-read)이며 실패 시 null/빈 배열을
 * 반환하고, 페이지 쪽에서 "—" 또는 기존 목업으로 폴백한다.
 */
import "server-only";
import { getReadOnlySupabase, readOnlyClientHasServiceRole } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { DEFAULT_ADMIN_EMAIL } from "@/lib/brand/business-info";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import { kstDayStartIso } from "@/lib/format/kst";
import { isLabAuthor } from "@/lib/notes/author-label";
import { kstDay as kstDayOf } from "@/lib/metrics/page-count";

export interface AdminKpiCard {
  label: string;
  /** 실집계 실패 시 "—" */
  value: string;
  /** 보조 라벨 (전일 대비 등) — 없으면 null */
  delta: string | null;
  accent: boolean;
  /** [1106] 값 아래 한 줄(무엇을 셌는지 · 어제 값) — 없으면 생략 */
  note?: string | null;
}

export interface AdminPendingItem {
  text: string;
  status: string;
  color: string;
}

export interface AdminDashboardMetrics {
  kpis: AdminKpiCard[];
  /** content_reports 실데이터 — 비어 있으면 페이지 쪽 목업 폴백 */
  pending: AdminPendingItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** [1106] 오늘 · 어제(한국 날짜) 첫 화면 수 — 익명 하루 수(page_view_daily_agg · 동의와 무관). 실패 시 null */
async function loadVisits(): Promise<{ today: number; yesterday: number } | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const now = Date.now();
  const today = kstDayOf(now);
  const yesterday = kstDayOf(now - DAY_MS);
  const { data, error } = await sb
    .from("page_view_daily_agg")
    .select("day, n")
    .eq("is_landing", true)
    .in("day", [today, yesterday])
    .limit(1000);
  if (error || !Array.isArray(data)) return null;
  let t = 0;
  let y = 0;
  for (const r of data as Array<{ day: string; n: number | string | null }>) {
    const n = Number(r.n ?? 0) || 0;
    if (r.day === today) t += n;
    else if (r.day === yesterday) y += n;
  }
  /* 하루 첫 화면 줄은 100~150 남짓 — 1,000줄(응답 상한)에 닿으면 합이 모자라므로 모른다고 한다 */
  if (data.length >= 1000) return null;
  return { today: t, yesterday: y };
}

/** [1106] 오늘(한국 자정부터) 사람이 쓴 임장노트 수 — 운영진 예시(Lab) 글은 하루 3건씩 자동으로 올라와 뺀다. 실패 시 null */
async function countHumanNotesToday(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("inspection_notes")
    .select("author_label")
    .gte("created_at", kstDayStartIso())
    .limit(1000);
  if (error || !Array.isArray(data)) return null;
  return (data as Array<{ author_label: string | null }>).filter((r) => !isLabAuthor(r.author_label)).length;
}

/** 테이블 count(created_at 최근 24h) — 실패 시 null */
async function count24h(table: string): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const sinceIso = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error || typeof count !== "number") return null;
  return count;
}

/** 가입 수: profiles 24h → 실패 시 app_users 24h 폴백 */
async function loadSignups24h(): Promise<number | null> {
  const fromProfiles = await count24h("profiles").catch(() => null);
  if (fromProfiles !== null) return fromProfiles;
  return count24h("app_users").catch(() => null);
}

/** 구독 매출: 승인된 payment_orders 합 — 못 읽었으면 null(0 이 아니다) */
async function loadSubscriptionRevenue(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  /* 결제 원장은 anon 에 GRANT 자체가 없다(맞는 설계). anon 폴백 상태에서
     던지는 조회는 100% permission denied 라 프로덕션 DB 로그에 소음만 쌓는다 —
     CI 링크 점검 서버가 /admin 을 긁을 때마다 정확히 그랬다. 시도하지 않고
     "못 읽음"(null → 화면 "—")으로 답한다. */
  if (!readOnlyClientHasServiceRole()) return null;
  const sum = (rows: Array<{ amount_krw?: unknown }> | null): number => {
    let total = 0;
    for (const r of rows ?? []) {
      const v = Number(r.amount_krw);
      if (Number.isFinite(v)) total += v;
    }
    return total;
  };

  /* 예전 코드는 payment_orders 에 없는 컬럼(amount)을 골라 매번 error 를 냈고,
     그러면 0행짜리 구 payments 로 흘러가 합계 0 을 돌려줬다. 화면에는 "0원"이
     사실처럼 찍힌다 — 조회 실패를 매출 0 으로 바꿔 말한 셈이다.
     실제 컬럼은 amount_krw 이고, 못 읽었으면 null 로 답해 "—"가 뜨게 한다. */
  const { data, error } = await sb
    .from("payment_orders")
    .select("amount_krw")
    .not("approved_at", "is", null)
    .limit(5000);

  if (!error) return sum(data);
  logger.warn("[admin-metrics] payment_orders 조회 실패 — payments 폴백", error.message);

  /* 폴백: 구 payments 테이블 (paid, 최근 30일 — lib/admin/stats.ts 방식).
     여기서도 실패하면 null 이다. 폴백이 "행이 없어서 0"인지 구분할 수 없으므로
     폴백 성공은 값이 있을 때만 인정한다. */
  const legacy = await sb
    .from("payments")
    .select("amount")
    .eq("status", "paid")
    .gte("paid_at", new Date(Date.now() - 30 * DAY_MS).toISOString())
    .not("paid_at", "is", null)
    .limit(5000);
  if (legacy.error || !legacy.data?.length) return null;
  let total = 0;
  for (const r of legacy.data as Array<{ amount?: unknown }>) {
    const v = Number(r.amount);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

/* ---------- 처리 대기 (content_reports 최근 5건) ---------- */

interface ContentReportRowLite {
  reason: string | null;
  report_category: string | null;
  status: string | null;
  created_at: string | null;
}

/** [967 · 32] 관리자 지표의 상대시각 — 분→시→일 반올림("0분 전" 가능), 날짜 폴백 없음, 시각 없으면 "대기".
 *  본체는 lib/format/relative-time.ts (round 모드) */
function relativeLabel(iso: string | null): string {
  return relativeTimeLabel(iso ?? NaN, Date.now(), { round: true, maxDays: Infinity, invalid: "대기" });
}

async function loadPendingReports(): Promise<AdminPendingItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    // open(미처리) 우선, 부족하면 전체 최근순
    let { data, error } = await sb
      .from("content_reports")
      .select("reason, report_category, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error || !Array.isArray(data) || data.length === 0) {
      ({ data, error } = await sb
        .from("content_reports")
        .select("reason, report_category, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5));
    }
    if (error || !Array.isArray(data)) return [];
    return (data as ContentReportRowLite[]).map((r) => {
      const category = r.report_category?.trim() || "커뮤니티";
      const reason = (r.reason ?? "").trim() || "사유 미기재";
      const short = reason.length > 28 ? `${reason.slice(0, 28)}…` : reason;
      const open = (r.status ?? "open") === "open";
      const urgent =
        open &&
        Number.isFinite(Date.parse(r.created_at ?? "")) &&
        Date.now() - Date.parse(r.created_at ?? "") < DAY_MS;
      return {
        text: `신고: ${category} — “${short}” · ${relativeLabel(r.created_at)}`,
        status: urgent ? "긴급" : open ? "대기" : "처리됨",
        color: urgent ? "#c62828" : open ? "#f2c94c" : "#9aa6b8",
      };
    });
  } catch (e) {
    logger.error("[admin-metrics] content_reports", e);
    return [];
  }
}

/* ---------- 회원 관리 (P2-12: 목업 대체 — profiles 최근 가입 실데이터) ---------- */

export interface AdminMemberRow {
  name: string;
  /** 가입 상대 시각 ("10분 전" 등) */
  joined: string;
}

export interface AdminMembersData {
  /** 전체 회원 수 — 조회 실패 시 null */
  total: number | null;
  /** 최근 가입 회원 — 실패·빈 데이터 시 빈 배열 (페이지 쪽 빈 상태 렌더) */
  members: AdminMemberRow[];
}

export async function loadRecentMembers(limit = 5): Promise<AdminMembersData> {
  const sb = getReadOnlySupabase();
  if (!sb) return { total: null, members: [] };
  try {
    const { count } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });
    const total = typeof count === "number" ? count : null;
    const { data, error } = await sb
      .from("profiles")
      .select("full_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return { total, members: [] };
    const members = (
      data as Array<{ full_name?: string | null; email?: string | null; created_at?: string | null }>
    ).map((r) => ({
      name: r.full_name?.trim() || r.email?.split("@")[0] || "이름 미입력",
      joined: relativeLabel(r.created_at ?? null),
    }));
    return { total, members };
  } catch (e) {
    logger.error("[admin-metrics] profiles 최근 가입 조회", e);
    return { total: null, members: [] };
  }
}

/* ---------- 조립 ---------- */

function formatKrw(total: number): string {
  if (total >= 10_000) {
    const man = total / 10_000;
    return `${(man >= 100 ? Math.round(man) : Math.round(man * 10) / 10).toLocaleString("ko-KR")}만원`;
  }
  return `${Math.round(total).toLocaleString("ko-KR")}원`;
}

/* [G005 2026-08-31] 북극성 — 주간 "첫 노트" 사용자 수.
 *
 * 지금 단계(가입 14명·유료 0건)의 성공은 매출도 DAU 도 아니고, "처음으로
 * 임장노트를 써 본 사람이 이번 주 몇 명 생겼나"다. 홈 카피(3분이면 첫 노트),
 * 온보딩, 유입 — 전부 이 숫자를 움직이려고 있는 것들이라 대시보드 첫 카드로
 * 올린다.
 *
 * 구현 노트: author 별 최초 작성 시각이 필요해 전 노트의 (author, created_at)
 * 을 읽고 JS 로 접는다. 노트 22개 규모라 문제없고, 수천 개가 되면 RPC 로
 * 옮긴다 — 그때가 오면 이 지표는 이미 제 역할을 다한 뒤다. */
async function loadWeeklyFirstNoteUsers(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  /* [1106] 예전엔 없는 열(author_id)을 읽어 조회가 늘 실패했다 → 첫 카드가 배포 뒤 한 번도 숫자를 못 냈다("—").
     작성자 = user_id(로그인 노트) 또는 작성 이메일. 운영진 예시(Lab) 글은 사람이 아니다. */
  const { data, error } = await sb
    .from("inspection_notes")
    .select("user_id, author_email, author_label, created_at")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error || !Array.isArray(data)) return null;
  /* 응답 상한(1,000줄)에 닿으면 "처음 쓴 날"을 잘못 짚을 수 있다 — 모른다고 한다 */
  if (data.length >= 1000) return null;
  const firstByAuthor = new Map<string, string>();
  for (const r of data as Array<{
    user_id: string | null;
    author_email: string | null;
    author_label: string | null;
    created_at: string;
  }>) {
    if (isLabAuthor(r.author_label)) continue;
    const a = r.user_id || String(r.author_email ?? "").trim().toLowerCase();
    if (!a || firstByAuthor.has(a)) continue;
    firstByAuthor.set(a, r.created_at);
  }
  const weekAgo = Date.now() - 7 * 86_400_000;
  let n = 0;
  for (const at of firstByAuthor.values()) {
    if (new Date(at).getTime() >= weekAgo) n += 1;
  }
  return n;
}

export async function loadAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const [firstNotes, visits, notes, signups, revenue, pending] = await Promise.all([
    loadWeeklyFirstNoteUsers().catch((): number | null => null),
    loadVisits().catch((e) => {
      logger.error("[admin-metrics] visits", e);
      return null;
    }),
    countHumanNotesToday().catch((): number | null => null),
    loadSignups24h().catch((): number | null => null),
    loadSubscriptionRevenue().catch((): number | null => null),
    loadPendingReports().catch((): AdminPendingItem[] => []),
  ]);

  // 노트 작성 전환율 = 오늘 사람 노트 ÷ 오늘 방문(첫 화면) — 어느 한쪽이라도 없으면 "—"
  const conversion =
    visits && visits.today > 0 && notes !== null
      ? `${((notes / visits.today) * 100).toFixed(1)}%`
      : null;

  const kpis: AdminKpiCard[] = [
    {
      /* 북극성 카드 — 항상 맨 앞. 목표(주 3명)는 현 규모의 현실적 계단이고,
         넘기 시작하면 상수를 올린다(트래픽 콘솔의 주간 PV 목표와 같은 규칙). */
      label: "주간 첫 노트 사용자 (목표 3)",
      value: firstNotes !== null ? `${firstNotes}명` : "—",
      delta: null,
      accent: true,
      note: "처음 노트를 쓴 사람 · 7일 · 예시 글 제외",
    },
    {
      label: "오늘 방문 (첫 화면)",
      value: visits ? visits.today.toLocaleString("ko-KR") : "—",
      delta: null,
      accent: false,
      note: visits ? `어제 ${visits.yesterday.toLocaleString("ko-KR")} · 사람 수 아님 · 한국 날짜` : "방문 수 불러오기 실패",
    },
    {
      label: "신규 임장노트 (오늘)",
      value: notes !== null ? notes.toLocaleString("ko-KR") : "—",
      delta: signups !== null ? `가입 +${signups.toLocaleString("ko-KR")}` : null,
      accent: false,
      note: "사람이 쓴 노트 · 가입은 24시간",
    },
    {
      label: "노트 작성 전환율",
      value: conversion ?? "—",
      delta: null,
      accent: true,
      note: "오늘 노트 ÷ 오늘 방문",
    },
    {
      label: "구독 매출",
      value: revenue !== null && revenue > 0 ? formatKrw(revenue) : revenue === 0 ? "0원" : "—",
      delta: null,
      accent: false,
    },
  ];

  return { kpis, pending };
}

/* ==========================================================================
   운영 패널 보강 — 신고 상태별 카운트 · 최근 문의 · 가입 추이(14일) · ETL 상태
   모두 읽기 전용, 실패 시 빈 배열 폴백 (페이지 쪽 빈 상태/목업 렌더).
   ========================================================================== */

export interface AdminStatusCount {
  status: string;
  count: number;
}

export interface AdminInquiryRow {
  /** "[문의:결제·환불] 제목" 에서 파싱한 표시 텍스트 */
  title: string;
  /** 보낸이 이메일 — 파싱 실패 시 null */
  from: string | null;
  when: string;
}

export interface AdminSignupDay {
  /** "MM.DD" (KST) */
  label: string;
  count: number;
}

export interface AdminEtlRow {
  name: string;
  status: string;
  color: string;
  /** [1040] 실패 사유 한 줄(로그의 첫오류) — 정상·빈 실행이면 null */
  reason: string | null;
}

export interface AdminOpsPanels {
  /** content_reports 상태별 카운트 — 실패 시 빈 배열 */
  reportCounts: AdminStatusCount[];
  /** 최근 문의(support → 관리자 인박스 user_inbox_notifications) 최신 5 */
  inquiries: AdminInquiryRow[];
  /** profiles created_at 일별 최근 14일 (빈 날 0 포함) */
  signupTrend: AdminSignupDay[];
  /** market_ingest_log 최신 3 */
  etl: AdminEtlRow[];
}

/** content_reports 상태별 카운트 (최근 1000건 기준) */
async function loadReportStatusCounts(): Promise<AdminStatusCount[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("content_reports")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error || !Array.isArray(data)) return [];
    const counts = new Map<string, number>();
    for (const r of data as Array<{ status?: string | null }>) {
      const s = (r.status ?? "open").trim() || "open";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

/**
 * 최근 문의 — app/api/support 는 문의를 관리자 인박스
 * (user_inbox_notifications, title "[문의:카테고리] 제목") 로 전달한다.
 * 해당 행을 읽어 최신 5건 반환. 테이블·데이터 없으면 빈 배열(정직한 빈 상태).
 */
async function loadRecentInquiries(limit = 5): Promise<AdminInquiryRow[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const adminEmail = (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  try {
    const { data, error } = await sb
      .from("user_inbox_notifications")
      .select("title, body, created_at")
      .eq("user_email", adminEmail)
      .like("title", "[문의%")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (
      data as Array<{ title?: string | null; body?: string | null; created_at?: string | null }>
    ).map((r) => {
      const title = (r.title ?? "").replace(/^\[문의:?/, "[").trim() || "제목 없음";
      const m = /^보낸이:\s*(\S+)/.exec(r.body ?? "");
      return {
        title: title.length > 48 ? `${title.slice(0, 48)}…` : title,
        from: m ? m[1] : null,
        when: relativeLabel(r.created_at ?? null),
      };
    });
  } catch {
    return [];
  }
}

/** profiles 가입 추이 — 일별(KST) 최근 14일, 빈 날 0 포함 */
async function loadSignupTrend(days = 14): Promise<AdminSignupDay[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const sinceMs = Date.now() - days * DAY_MS;
  const kstDay = (ms: number): string => {
    const d = new Date(ms + 9 * 60 * 60 * 1000);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const loadCreated = async (table: string): Promise<string[] | null> => {
    const { data, error } = await sb
      .from(table)
      .select("created_at")
      .gte("created_at", new Date(sinceMs).toISOString())
      .limit(10000);
    if (error || !Array.isArray(data)) return null;
    return (data as Array<{ created_at?: string | null }>)
      .map((r) => r.created_at ?? "")
      .filter(Boolean);
  };
  try {
    const created =
      (await loadCreated("profiles").catch(() => null)) ??
      (await loadCreated("app_users").catch(() => null));
    if (created === null) return [];
    const counts = new Map<string, number>();
    for (const iso of created) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) continue;
      const key = kstDay(t);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: AdminSignupDay[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const label = kstDay(Date.now() - i * DAY_MS);
      out.push({ label, count: counts.get(label) ?? 0 });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * ETL 상태 — market_ingest_log 최신 3 (lib/market/store 읽기 로더 재사용)
 *
 * status 문자열만 보고 정상/건너뜀/오류 셋으로 나누던 걸 rows 와 함께 보도록 고쳤다(#148).
 * `status=error rows=2096` 인 실행 — 2,096행은 들어왔는데 조각 일부가 실패한 경우 —
 * 을 그냥 "오류" 라고 쓰면 읽는 사람은 아무것도 안 들어온 줄 안다. 판정은
 * lib/market/ingest-outcome 한 곳에서 가져다 쓴다.
 *
 * 잘린 message 를 붙이던 자리에는 파싱된 집계("16곳 중 13곳 실패")를 우선 쓴다.
 * 40자에서 잘린 원문은 대개 문장 중간에서 끊겨 오히려 오해를 만들었다.
 */
async function loadEtlStatus(limit = 3): Promise<AdminEtlRow[]> {
  try {
    const { listIngestLog } = await import("@/lib/market/store");
    const {
      classifyIngestRun,
      parseRunTally,
      tallyText,
      firstErrorOf,
      failureReasonLabel,
      needsServiceApproval,
      OUTCOME_LABEL,
      OUTCOME_COLOR,
      OUTCOME_MARK,
    } = await import("@/lib/market/ingest-outcome");
    const rows = await listIngestLog(limit);
    return rows.map((r) => {
      const outcome = classifyIngestRun(r.status, r.rows);
      const detail = tallyText(parseRunTally(r.message)) ?? r.message?.slice(0, 40) ?? null;
      const showDetail = outcome !== "ok" && outcome !== "noop" && detail;
      return {
        name: `${r.source.toUpperCase()} · ${r.dataset} (${r.origin})`,
        status: `${OUTCOME_MARK[outcome]} ${OUTCOME_LABEL[outcome]} · ${r.rows.toLocaleString(
          "ko-KR",
        )}행 · ${relativeLabel(r.createdAt)}${showDetail ? ` · ${detail}` : ""}`,
        color: OUTCOME_COLOR[outcome],
        /* [1040] 집계("22곳 중 1곳 실패") 옆에 사유를 붙인다 — 원인을 보려고 DB 를 열지 않게 */
        reason:
          outcome === "partial" || outcome === "failed"
            ? failureReasonLabel(firstErrorOf(r.message) ?? (tallyText(parseRunTally(r.message)) ? null : r.message))
            : outcome === "skipped" && needsServiceApproval(r.message)
              ? "공공데이터포털 활용신청 필요"
              : null,
      };
    });
  } catch (e) {
    logger.info("[admin-metrics] market_ingest_log 조회 불가", e);
    return [];
  }
}

export async function loadAdminOpsPanels(): Promise<AdminOpsPanels> {
  const [reportCounts, inquiries, signupTrend, etl] = await Promise.all([
    loadReportStatusCounts().catch((): AdminStatusCount[] => []),
    loadRecentInquiries(5).catch((): AdminInquiryRow[] => []),
    loadSignupTrend(14).catch((): AdminSignupDay[] => []),
    loadEtlStatus(3).catch((): AdminEtlRow[] => []),
  ]);
  return { reportCounts, inquiries, signupTrend, etl };
}
