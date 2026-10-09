/**
 * [1046 · 성장] 1년 1만 회원 계획 — 매주 볼 숫자의 순수 규칙(단위 시험 대상).
 *
 * 계획 문서: "1년 1만 회원 — 시간 압축 성장 계획"(Claude Docs, 2026-10-08). 이 파일은 그 문서의
 * 월별 가입 목표와 "멈출 기준"이 화면에서 같은 숫자로 읽히게 하는 곳이다. 목표를 바꾸면 여기와 문서를 같이 고친다.
 */

/** 월별 신규 가입 목표(합계 10,000) — 계획 문서 '목표의 산수' 차트와 같은 값 */
export const GROWTH_MONTHLY_TARGETS: Readonly<Record<string, number>> = {
  "2026-10": 30,
  "2026-11": 80,
  "2026-12": 160,
  "2027-01": 300,
  "2027-02": 480,
  "2027-03": 680,
  "2027-04": 880,
  "2027-05": 1080,
  "2027-06": 1250,
  "2027-07": 1450,
  "2027-08": 1700,
  "2027-09": 1910,
};

/** 계획의 방문 대비 가입 전환 가정(3%) · 멈출 기준(2주 연속 2% 미만) */
export const PLAN_CONVERSION = 0.03;
export const STOP_CONVERSION = 0.02;

/** TrafficRecorder 의 방문자 키 꼴과 같다(무작위 16바이트 hex) */
export function isVisitorKey(v: string): boolean {
  return /^[a-f0-9]{16,64}$/.test(v);
}

/** link_signup_attribution 이 돌려주는 값 중 "다시 묻지 않아도 되는" 것 */
export const ATTRIBUTION_DONE_STATUSES: ReadonlySet<string> = new Set([
  "linked",
  "linked_no_events",
  "exists",
  "too_old",
  "no_user",
]);

export type ChannelInput = { utmSource: string | null; referrerHost: string | null; attributed: boolean };

/**
 * 가입 한 건의 유입 채널 이름. 화면에 그대로 쓰는 말이라 사람이 아는 이름으로 적는다.
 * 순서가 뜻이다: 우리가 붙인 UTM 이 리퍼러보다 먼저(카드·카톡 공유는 리퍼러가 비거나 카카오다).
 */
export function classifyChannel(c: ChannelInput): string {
  if (!c.attributed) return "기록 없음";
  const utm = (c.utmSource ?? "").trim().toLowerCase();
  if (utm) {
    if (utm === "share" || utm === "card" || utm === "kakao") return "공유 링크";
    if (utm === "naver_blog" || utm === "blog") return "네이버 블로그";
    if (utm === "cafe" || utm === "naver_cafe") return "네이버 카페";
    if (utm === "instagram" || utm === "youtube" || utm === "shorts" || utm === "reels") return "숏폼·SNS";
    if (utm === "embed" || utm === "widget" || utm === "partner") return "파트너 위젯";
    if (utm === "email" || utm === "digest") return "메일";
    return `캠페인 · ${utm}`;
  }
  const host = (c.referrerHost ?? "").trim().toLowerCase();
  if (!host) return "직접 · 북마크";
  if (/(^|\.)google\./.test(host)) return "구글 검색";
  if (/^(m\.)?search\.naver\.com$/.test(host)) return "네이버 검색";
  if (/(^|\.)blog\.naver\.com$/.test(host)) return "네이버 블로그";
  if (/(^|\.)cafe\.naver\.com$/.test(host)) return "네이버 카페";
  if (/(^|\.)(search\.)?daum\.net$/.test(host) || /(^|\.)bing\.com$/.test(host)) return "기타 검색";
  if (/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai)$/.test(host)) {
    return "AI 검색";
  }
  if (/(^|\.)(kakao\.com|kakaocdn\.net)$/.test(host)) return "공유 링크";
  if (/(^|\.)(youtube\.com|instagram\.com|tiktok\.com|threads\.net|facebook\.com)$/.test(host)) return "숏폼·SNS";
  return `기타 · ${host}`;
}

export type ChannelRow = ChannelInput & { signups: number };

/** 채널별로 합치고 많은 순. "기록 없음"은 늘 맨 끝(측정 공백이지 채널이 아니다) */
export function mergeChannels(rows: ChannelRow[]): Array<{ channel: string; signups: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const n = Number.isFinite(r.signups) ? Math.max(0, Math.floor(r.signups)) : 0;
    if (n === 0) continue;
    const k = classifyChannel(r);
    m.set(k, (m.get(k) ?? 0) + n);
  }
  return [...m.entries()]
    .map(([channel, signups]) => ({ channel, signups }))
    .sort((a, b) => {
      if (a.channel === "기록 없음") return 1;
      if (b.channel === "기록 없음") return -1;
      return b.signups - a.signups || a.channel.localeCompare(b.channel, "ko");
    });
}

export type GrowthWeek = {
  weekStart: string;
  visitors: number;
  sessions: number;
  searchLandings: number;
  signups: number;
  newWatchers: number;
};

/** 성장 주간표 한 장의 재료(lib/admin/growth-weekly 가 채운다) */
export type GrowthWeeklyData = {
  weeks: GrowthWeek[];
  channels28d: Array<{ channel: string; signups: number }>;
  monthSignups: number;
};

/** 방문 대비 가입 — 방문자 0 이면 null(0% 로 꾸미지 않는다) */
export function conversionRate(w: Pick<GrowthWeek, "visitors" | "signups">): number | null {
  return w.visitors > 0 ? w.signups / w.visitors : null;
}

/**
 * 멈출 기준 — 직전 완결 2주 연속 전환 2% 미만이면 경고. weeks 는 최신 주가 앞(이번 주는 진행 중이라 뺀다).
 * 표본이 너무 작으면(주 방문자 50 미만) 판단하지 않는다 — 방문자 40명에 가입 0명은 신호가 아니다.
 */
export function conversionStopSignal(weeks: GrowthWeek[], minVisitors = 50): boolean {
  const done = weeks.slice(1, 3);
  if (done.length < 2) return false;
  return done.every((w) => {
    const r = conversionRate(w);
    return w.visitors >= minVisitors && r !== null && r < STOP_CONVERSION;
  });
}

/** KST 기준 'YYYY-MM' */
export function kstMonthKey(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** KST 기준 이번 달 1일 00:00 의 UTC 시각(ISO) */
export function kstMonthStartIso(nowMs: number = Date.now()): string {
  const k = new Date(nowMs + 9 * 3_600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3_600_000).toISOString();
}

/** 이번 달 목표(계획 밖 달이면 null) */
export function monthTarget(monthKey: string): number | null {
  return GROWTH_MONTHLY_TARGETS[monthKey] ?? null;
}
