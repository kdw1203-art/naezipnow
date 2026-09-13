import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * [995] 공유 유입 — 카드·공유 링크로 들어온 세션이 그 뒤에 무엇을 했는가.
 *
 * 서버 전용(관리자 페이지가 서비스 클라이언트를 넘겨 부른다). `server-only` 표식을 여기
 * 직접 두지 않는 이유: 집계(aggregateShareInflow)는 순수라 유닛 테스트가 이 모듈을 그대로
 * 읽는다. DB 접근은 넘겨받은 클라이언트로만 하므로 브라우저 번들에 들어갈 길이 없다.
 *
 * 모집단: page_view_events — **분석 동의 표본**이다(화면에 명기). 랜딩의 utm_source 가
 * card(카드에 인쇄된 /n 링크) · share(노트 상세 공유 버튼) · kakao 인 세션만 본다.
 * 뷰를 새로 만들지 않고 30일 창의 select 두 번으로 TS 에서 접는다 — 지금 30일 페이지뷰가
 * 수백 건이라 그걸로 충분하고, 5,000행에 닿으면 `capped` 로 "하한선"임을 밝힌다.
 */

export const SHARE_INFLOW_SOURCES = ["card", "share", "kakao"] as const;
export type ShareInflowSource = (typeof SHARE_INFLOW_SOURCES)[number];

export type ShareInflowRow = {
  source: string;
  /** 랜딩 뷰 수(같은 세션이 두 번 랜딩하면 2) */
  landings: number;
  /** 랜딩한 순 세션 */
  sessions: number;
  /** 랜딩 **뒤에** /complex/… 를 연 세션 */
  complexSessions: number;
  /** 랜딩 뒤에 /signup 또는 /login 에 들어간 세션 */
  authSessions: number;
};

export type ShareInflow = {
  days: number;
  rows: ShareInflowRow[];
  /** 어느 select 든 상한(5,000행)에 닿았다 — 숫자는 하한선 */
  capped: boolean;
};

export type LandingView = { session_key: string; utm_source: string | null; occurred_at: string };
export type FollowView = { session_key: string; path: string; occurred_at: string };

const ROW_CAP = 5000;

export function isComplexPath(path: string): boolean {
  return path.startsWith("/complex/");
}

export function isAuthPath(path: string): boolean {
  return path === "/signup" || path === "/login";
}

/**
 * 순수 집계. 랜딩(utm 붙은 세션 첫 뷰) × 그 뒤 뷰 → 출처별 한 줄.
 * "뒤"는 같은 session_key 에서 occurred_at 이 랜딩보다 늦은 뷰 — 랜딩 자체가
 * /complex/ 인 경우는 세지 않는다(그건 유입이지 다음 행동이 아니다).
 * 출처는 SHARE_INFLOW_SOURCES 순서로, 랜딩이 0 인 출처는 줄을 만들지 않는다.
 */
export function aggregateShareInflow(landings: LandingView[], follows: FollowView[]): ShareInflowRow[] {
  /* 세션별 첫 랜딩 시각 — 같은 세션이 두 번 랜딩해도 "뒤"의 기준은 가장 이른 랜딩 */
  const firstLanding = new Map<string, number>();
  for (const l of landings) {
    const t = Date.parse(l.occurred_at);
    if (!Number.isFinite(t)) continue;
    const cur = firstLanding.get(l.session_key);
    if (cur === undefined || t < cur) firstLanding.set(l.session_key, t);
  }

  const complexAfter = new Set<string>();
  const authAfter = new Set<string>();
  for (const f of follows) {
    const landedAt = firstLanding.get(f.session_key);
    if (landedAt === undefined) continue;
    const t = Date.parse(f.occurred_at);
    if (!Number.isFinite(t) || t <= landedAt) continue;
    if (isComplexPath(f.path)) complexAfter.add(f.session_key);
    else if (isAuthPath(f.path)) authAfter.add(f.session_key);
  }

  const bySource = new Map<string, { landings: number; sessions: Set<string> }>();
  for (const l of landings) {
    const src = (l.utm_source ?? "").trim();
    if (!src) continue;
    const acc = bySource.get(src) ?? { landings: 0, sessions: new Set<string>() };
    acc.landings += 1;
    acc.sessions.add(l.session_key);
    bySource.set(src, acc);
  }

  const order = [...SHARE_INFLOW_SOURCES, ...[...bySource.keys()].filter((k) => !(SHARE_INFLOW_SOURCES as readonly string[]).includes(k)).sort()];
  const rows: ShareInflowRow[] = [];
  for (const src of order) {
    const acc = bySource.get(src);
    if (!acc) continue;
    let complexSessions = 0;
    let authSessions = 0;
    for (const s of acc.sessions) {
      if (complexAfter.has(s)) complexSessions += 1;
      if (authAfter.has(s)) authSessions += 1;
    }
    rows.push({ source: src, landings: acc.landings, sessions: acc.sessions.size, complexSessions, authSessions });
  }
  return rows;
}

/** 최근 `days` 일 공유 유입. 조회 실패는 throw — 호출부가 "실패"로 표기한다(0건으로 위장하지 않는다). */
export async function loadShareInflow(sb: SupabaseClient, days = 30): Promise<ShareInflow> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const landingR = await sb
    .from("page_view_events")
    .select("session_key,utm_source,occurred_at")
    .eq("is_landing", true)
    .in("utm_source", [...SHARE_INFLOW_SOURCES])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(ROW_CAP);
  if (landingR.error) throw new Error(landingR.error.message);
  const landings = (landingR.data ?? []) as LandingView[];
  if (landings.length === 0) return { days, rows: [], capped: false };

  /* 두 번째 select 는 세션 키로 좁히지 않는다 — 키 수천 개를 URL 에 싣는 대신 30일 창의
     단지·가입·로그인 뷰를 통째로 받아 TS 에서 교집합을 낸다(지금 규모에서 수백 행). */
  const followR = await sb
    .from("page_view_events")
    .select("session_key,path,occurred_at")
    .gte("occurred_at", since)
    /* PostgREST 의 like 는 `*` 를 `%` 로 읽는다 — URL 인코딩에 `%` 를 맡기지 않는다 */
    .or("path.like./complex/*,path.eq./signup,path.eq./login")
    .order("occurred_at", { ascending: true })
    .limit(ROW_CAP);
  if (followR.error) throw new Error(followR.error.message);
  const follows = (followR.data ?? []) as FollowView[];

  return {
    days,
    rows: aggregateShareInflow(landings, follows),
    capped: landings.length >= ROW_CAP || follows.length >= ROW_CAP,
  };
}
