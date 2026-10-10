/**
 * [1053 · 방문 집계] 동의와 무관한 익명 하루 집계 — 순수 규칙(tests/unit/count-1053.test.ts).
 *
 * 소유자 답(2026-10-10) "방문 집계·가입 단계·단지/지도 손질".
 * 운영 실측: 1st-party 방문 기록(page_view_events)은 분석 동의 뒤에만 남아 방문의 약 7%만 보였다.
 * 그래서 "수"만 따로 센다 — (한국 날짜 · 화면 묶음 · 첫 화면 여부 · 들어온 호스트 · utm_source · 기기 종류) → n.
 * 쿠키·브라우저 저장소·식별자·IP·주소 원문을 쓰지 않는다. 사람을 이을 수 있는 값이 없다.
 * 쓰기는 public.bump_page_view_agg(service_role 전용 · 마이그레이션 20261009221208).
 */
import { inAppKind } from "@/lib/client/in-app-browser";

/** 사람이 아닌 요청 — 검색 로봇 · 미리보기 · 성능 측정 · 스크립트 */
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|chrome-lighthouse|gtmetrix|preview|facebookexternalhit|embedly|python|curl\/|wget|node-fetch|undici|axios|go-http|java\/|okhttp|vercel|uptime|monitor|scan/i;

export function isBotAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "");
  if (ua.length < 20) return true;
  return BOT_RE.test(ua);
}

/** 기기 종류 — d(컴퓨터) · m(폰) · t(태블릿) · 앱 안 브라우저면 뒤에 이름(m:naver). 로봇은 null */
export function deviceClass(userAgent: string | null | undefined): string | null {
  const ua = String(userAgent ?? "");
  if (isBotAgent(ua)) return null;
  const base = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "t" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "m" : "d";
  const app = inAppKind(ua);
  return app ? `${base}:${app}` : base;
}

/** 한국 날짜(YYYY-MM-DD) — 집계 하루의 경계는 한국 자정 */
export function kstDay(nowMs: number): string {
  return new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
}

const HOST_RE = /^[a-z0-9.-]{1,120}$/;
/** 우리 사이트 · 옛 주소 · 배포 미리보기는 "들어온 곳"이 아니다 */
const SELF_HOST_RE = /(^|\.)(naezipnow\.com|nuguzip\.com)$|\.vercel\.app$|^localhost$|^127\.0\.0\.1$/;

/** 들어온 호스트 — 호스트 문자열만(주소 · 검색어 금지) · 우리 주소면 빈 값 */
export function cleanRefHost(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const h = raw.trim().toLowerCase().replace(/:\d+$/, "");
  if (!HOST_RE.test(h) || !h.includes(".") && h !== "localhost") return "";
  if (SELF_HOST_RE.test(h)) return "";
  return h;
}

/** utm_source — 우리가 발행하는 형식만(영숫자 · -_.) 80자 */
export function cleanUtmSource(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 80);
  return /^[\w.-]{1,80}$/.test(s) ? s.toLowerCase() : "";
}

export type CountFacts = {
  landing?: unknown;
  referrerHost?: unknown;
  utmSource?: unknown;
};

export type CountRow = {
  p_day: string;
  p_route: string;
  p_landing: boolean;
  p_ref_host: string;
  p_utm_source: string;
  p_device: string;
};

/** 한 번 셀 줄 — 들어온 곳 · utm 은 첫 화면에만 싣는다(다음 화면의 수가 들어온 곳별로 흩어지지 않게) */
export function countRow(route: string, facts: CountFacts, userAgent: string | null | undefined, nowMs: number): CountRow | null {
  const device = deviceClass(userAgent);
  if (!device) return null;
  if (!route.startsWith("/") || route.length > 120) return null;
  /* 관리 화면은 방문이 아니다 */
  if (route === "/admin" || route.startsWith("/admin/")) return null;
  const landing = facts.landing === true;
  return {
    p_day: kstDay(nowMs),
    p_route: route,
    p_landing: landing,
    p_ref_host: landing ? cleanRefHost(facts.referrerHost) : "",
    p_utm_source: landing ? cleanUtmSource(facts.utmSource) : "",
    p_device: device,
  };
}

/** 다른 사이트에서 보낸 요청은 세지 않는다(브라우저가 붙이는 Sec-Fetch-Site · 없으면 통과 — 옛 브라우저) */
export function isCrossSite(secFetchSite: string | null | undefined): boolean {
  const v = String(secFetchSite ?? "").toLowerCase();
  return v !== "" && v !== "same-origin";
}

/**
 * 가입 단계 — 관리 › 방문 화면의 "가입 단계" 줄. 화면 묶음 이름(normalizeRoute 결과)과 같아야 한다.
 * 가입 화면 → 인증 메일 확인(자동 로그인 · /auth/confirm) → 관심 지역 고르기(/welcome).
 */
export const SIGNUP_STEPS: ReadonlyArray<{ route: string; label: string }> = [
  { route: "/signup", label: "가입 화면" },
  { route: "/auth/confirm", label: "인증 메일 누름" },
  { route: "/welcome", label: "가입 뒤 첫 화면" },
];

/**
 * 경로 → 집계 화면 묶음. 동적 칸을 패턴으로 접어 묶음 수가 폭발하지 않게 한다. 모르는 경로는 1·2단계만 남긴다.
 * (app/api/metrics/pageview 의 예전 지역 함수를 그대로 옮겼다 — 동의 표본과 익명 수가 같은 묶음을 쓴다)
 */
export function normalizeRoute(path: string): string {
  const p = path.split("?")[0].split("#")[0];
  const rules: [RegExp, string][] = [
    [/^\/complex\/browse/, "/complex/browse"],
    [/^\/complex\/compare/, "/complex/compare"],
    [/^\/complex\/[^/]+\/tx/, "/complex/[id]/tx"],
    [/^\/complex\/[^/]+/, "/complex/[id]"],
    [/^\/region\/[^/]+/, "/region/[id]"],
    [/^\/tx\/[^/]+\/(area|price)\/[^/]+/, "/tx/[region]/[band]"],
    [/^\/tx\/[^/]+/, "/tx/[region]"],
    [/^\/notes\/new/, "/notes/new"],
    [/^\/notes\/best/, "/notes/best"],
    [/^\/notes\/templates/, "/notes/templates"],
    [/^\/notes\/[^/]+\/deck/, "/notes/[id]/deck"],
    [/^\/notes\/[^/]+/, "/notes/[id]"],
    [/^\/town\/news\/[^/]+/, "/town/news/[id]"],
    [/^\/town\/groups\/[^/]+\/chat/, "/town/groups/[id]/chat"],
    [/^\/town\/groups\/[^/]+/, "/town/groups/[id]"],
    [/^\/listings\/[^/]+/, "/listings/[id]"],
    [/^\/reports\/season\/[^/]+/, "/reports/season/[slug]"],
    [/^\/reports\/[0-9]{6}/, "/reports/[ym]"],
    [/^\/analysis\/temperature\/[^/]+/, "/analysis/temperature/[region]"],
    [/^\/glossary\/[^/]+/, "/glossary/[term]"],
    [/^\/qna\/[^/]+/, "/qna/[id]"],
    [/^\/invite\/[^/]+/, "/invite/[code]"],
    [/^\/digest\/[^/]+/, "/digest/[week]"],
    /* [1053] 개수가 끝없는 두 단계 주소도 접는다(익명 수의 묶음이 폭발하지 않게 · 프로필 주소 이름을 남기지 않게) */
    [/^\/redevelopment\/[^/]+/, "/redevelopment/[id]"],
    [/^\/dev-deals\/[^/]+/, "/dev-deals/[id]"],
    [/^\/n\/[^/]+/, "/n/[code]"],
    [/^\/u\/[^/]+/, "/u/[handle]"],
  ];
  for (const [re, route] of rules) if (re.test(p)) return route;
  const segs = p.split("/").filter(Boolean);
  if (segs.length <= 2) return `/${segs.join("/")}` || "/";
  return `/${segs[0]}/${segs[1]}/*`;
}

/* ── 관리 › 트래픽 "전체 방문 수" 카드 ─────────────────────────────────────── */

export type AggRow = {
  day: string;
  route: string;
  is_landing: boolean;
  ref_host: string;
  utm_source: string;
  device: string;
  n: number;
};

export type CountSummary = {
  days: Array<{ day: string; n: number }>;
  last7: number;
  prev7: number;
  landings7: number;
  topRoutes: Array<{ route: string; n: number }>;
  topRefs: Array<{ host: string; n: number }>;
  devices: Array<{ device: string; n: number }>;
  inAppShare: number | null;
  signup: Array<{ route: string; label: string; n: number }>;
};

function addDays(day: string, delta: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function topOf(map: Map<string, number>, k: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k);
}

/** 기기 이름 — 관리 화면 표기 */
export function deviceLabel(device: string): string {
  const [base, app] = device.split(":");
  const b = base === "m" ? "폰" : base === "t" ? "태블릿" : base === "d" ? "컴퓨터" : "알 수 없음";
  return app ? `${b} · 앱 안(${app})` : b;
}

/**
 * 14일 줄 → 카드 숫자. today = 한국 날짜. 최근 7일 = today 포함 7일, 그 앞 7일과 비교.
 * 들어온 곳은 첫 화면 줄만(빈 호스트 = 직접 · 알 수 없음). 가입 단계는 최근 7일 수.
 */
export function summarizeCounts(rows: AggRow[], today: string): CountSummary {
  const start7 = addDays(today, -6);
  const start14 = addDays(today, -13);
  const byDay = new Map<string, number>();
  const routes = new Map<string, number>();
  const refs = new Map<string, number>();
  const devices = new Map<string, number>();
  let last7 = 0;
  let prev7 = 0;
  let landings7 = 0;
  let inApp7 = 0;
  for (const r of rows) {
    const n = Number.isFinite(r.n) && r.n > 0 ? r.n : 0;
    if (!n || r.day < start14 || r.day > today) continue;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + n);
    if (r.day < start7) {
      prev7 += n;
      continue;
    }
    last7 += n;
    routes.set(r.route, (routes.get(r.route) ?? 0) + n);
    devices.set(r.device, (devices.get(r.device) ?? 0) + n);
    if (r.device.includes(":")) inApp7 += n;
    if (r.is_landing) {
      landings7 += n;
      const host = r.ref_host || "";
      refs.set(host, (refs.get(host) ?? 0) + n);
    }
  }
  const days: Array<{ day: string; n: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    days.push({ day: d, n: byDay.get(d) ?? 0 });
  }
  return {
    days,
    last7,
    prev7,
    landings7,
    topRoutes: topOf(routes, 10).map(([route, n]) => ({ route, n })),
    topRefs: topOf(refs, 8).map(([host, n]) => ({ host, n })),
    devices: topOf(devices, 8).map(([device, n]) => ({ device, n })),
    inAppShare: last7 > 0 ? inApp7 / last7 : null,
    signup: SIGNUP_STEPS.map((s) => ({ ...s, n: routes.get(s.route) ?? 0 })),
  };
}
