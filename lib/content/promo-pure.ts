/* ============================================================
   [1002] 홍보 킷 — 순수 부분 (server-only 없음 · 유닛테스트가 그대로 읽는다).

   왜 있나: 최근 30일 실측(2026-09-14)에서 랜딩 81건·방문자 ~35명 중 네이버
   유입은 2명이었다. 구글·ChatGPT 는 단지 페이지(단지명 롱테일)로 들어온다.
   즉 "어디에 무엇을 써야 유입이 느는가"의 답은 이미 데이터에 있고, 이 모듈은
   그 답을 사장님이 붙여넣을 수 있는 글로 바꾼다.

   원칙(blog-pack 과 동일):
   - 전 수치 실측 + 기준시점. 없는 수치는 문장째 뺀다(0 으로 위장하지 않는다).
   - 전망·권유·수익 보장류 문구 금지. 체크포인트는 모든 단지 공통 목록이며
     "이 단지가 그렇다"는 서술이 아니다 — 그 사실도 본문에 적는다.
   - 출처 문단과 "투자 권유 아님" 문구는 항상 들어간다.
   ============================================================ */

import { formatKrwManwon } from "@/lib/format/krw";

/* ------------------------------------------------------------------ */
/* 유입 채널 분류                                                        */
/* ------------------------------------------------------------------ */

export type InflowChannel = "search" | "ai" | "social" | "community" | "direct" | "other";

export const CHANNEL_LABEL: Record<InflowChannel, string> = {
  search: "검색",
  ai: "AI 검색",
  social: "소셜",
  community: "커뮤니티",
  direct: "직접/앱",
  other: "기타",
};

/** 배포 미리보기 도메인 — 사장님·개발자 자신의 방문이라 유입 합계에서 뺀다 */
export const PREVIEW_LABEL = "미리보기(무시)";
export const DIRECT_LABEL = "직접/앱";

type Rule = { test: (h: string) => boolean; channel: InflowChannel; label: string };

const RULES: Rule[] = [
  /* AI — 검색 규칙보다 먼저(gemini.google.com · bing.com/chat 이 검색으로 새지 않게) */
  { test: (h) => h.includes("chatgpt.com") || h.includes("chat.openai.com") || h.includes("openai.com"), channel: "ai", label: "ChatGPT" },
  { test: (h) => h.includes("perplexity."), channel: "ai", label: "Perplexity" },
  { test: (h) => h.includes("claude.ai"), channel: "ai", label: "Claude" },
  { test: (h) => h.includes("gemini.google.com"), channel: "ai", label: "Gemini" },
  { test: (h) => h.includes("copilot"), channel: "ai", label: "Copilot" },
  { test: (h) => h.includes("bing.com/chat"), channel: "ai", label: "Bing 챗" },
  /* 커뮤니티 — 네이버 검색 규칙보다 먼저(cafe.naver.com · blog.naver.com) */
  { test: (h) => h.includes("cafe.naver.com"), channel: "community", label: "네이버 카페" },
  { test: (h) => h.includes("blog.naver.com"), channel: "community", label: "네이버 블로그" },
  { test: (h) => h.includes("clien."), channel: "community", label: "클리앙" },
  { test: (h) => h.includes("dcinside."), channel: "community", label: "디시인사이드" },
  { test: (h) => h.includes("ppomppu."), channel: "community", label: "뽐뿌" },
  { test: (h) => h.includes("mlbpark."), channel: "community", label: "엠엘비파크" },
  { test: (h) => h.includes("fmkorea."), channel: "community", label: "에펨코리아" },
  { test: (h) => /^dc\.|\.dc\./.test(h), channel: "community", label: "디시" },
  /* 검색 */
  /* [1002 리뷰] 검색 호스트만 — docs.google/mail.google, band·mail.naver 는 검색이 아니다 */
  { test: (h) => /^(www\.)?google\.[a-z.]+$/.test(h), channel: "search", label: "구글 검색" },
  { test: (h) => /^(www|m|search|m\.search)\.naver\.com$/.test(h), channel: "search", label: "네이버 검색" },
  { test: (h) => /^(www|m|search|m\.search)\.daum\.net$/.test(h), channel: "search", label: "다음 검색" },
  { test: (h) => h.includes("bing.com"), channel: "search", label: "빙 검색" },
  { test: (h) => h.includes("duckduckgo."), channel: "search", label: "덕덕고 검색" },
  { test: (h) => h.includes("yahoo."), channel: "search", label: "야후 검색" },
  /* 소셜 */
  { test: (h) => h.includes("instagram."), channel: "social", label: "인스타그램" },
  { test: (h) => h.includes("facebook.") || h.includes("fb.com"), channel: "social", label: "페이스북" },
  { test: (h) => h.includes("threads."), channel: "social", label: "Threads" },
  { test: (h) => h === "x.com" || h.endsWith(".x.com") || h.includes("twitter.") || h === "t.co", channel: "social", label: "X(트위터)" },
  { test: (h) => h.includes("youtube.") || h === "youtu.be", channel: "social", label: "유튜브" },
  /* 미리보기 도메인 — 합계에서 제외 */
  { test: (h) => h.endsWith("vercel.app") || h.endsWith("vercel.com"), channel: "other", label: PREVIEW_LABEL },
];

/** referrer_host → 채널 + 사람이 읽는 라벨. 모르는 호스트는 호스트 그대로 라벨. */
export function classifyReferrer(
  host: string | null | undefined,
): { channel: InflowChannel; label: string } {
  const raw = (host ?? "").trim();
  const h = raw.toLowerCase();
  if (!h || h === "(직접/앱)" || h === "(direct)" || h === "direct") {
    return { channel: "direct", label: DIRECT_LABEL };
  }
  for (const rule of RULES) {
    if (rule.test(h)) return { channel: rule.channel, label: rule.label };
  }
  return { channel: "other", label: raw };
}

export type InflowSummaryRow = {
  channel: InflowChannel;
  label: string;
  sessions: number;
  landings: number;
  /** 세션 기준 비중(%) — 소수 1자리. 합계 0 이면 0 */
  share: number;
  /** 채널 안의 출처 라벨(세션 많은 순, 최대 3) — 화면 보조 표시용 */
  sources: string[];
};

const CHANNEL_ORDER: InflowChannel[] = ["search", "ai", "social", "community", "direct", "other"];

/**
 * 출처 행(뷰 page_view_referrer_30d 모양) → 채널별 요약. 세션 많은 순.
 * 미리보기 도메인(vercel.app 등)은 행·합계 모두에서 뺀다 — 자기 방문이다.
 */
export function summarizeInflow(
  rows: Array<{ source: string; sessions: number; landings: number }>,
): InflowSummaryRow[] {
  const acc = new Map<
    InflowChannel,
    { sessions: number; landings: number; bySource: Map<string, number> }
  >();
  for (const r of rows) {
    const { channel, label } = classifyReferrer(r.source);
    if (channel === "other" && label === PREVIEW_LABEL) continue;
    const sessions = Number(r.sessions) || 0;
    const landings = Number(r.landings) || 0;
    const cur = acc.get(channel) ?? { sessions: 0, landings: 0, bySource: new Map() };
    cur.sessions += sessions;
    cur.landings += landings;
    cur.bySource.set(label, (cur.bySource.get(label) ?? 0) + sessions);
    acc.set(channel, cur);
  }
  const total = [...acc.values()].reduce((s, v) => s + v.sessions, 0);
  const out: InflowSummaryRow[] = [];
  for (const channel of CHANNEL_ORDER) {
    const v = acc.get(channel);
    if (!v) continue;
    out.push({
      channel,
      label: CHANNEL_LABEL[channel],
      sessions: v.sessions,
      landings: v.landings,
      share: total > 0 ? Math.round((v.sessions / total) * 1000) / 10 : 0,
      sources: [...v.bySource.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, n]) => `${label} ${n}`),
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

/* ------------------------------------------------------------------ */
/* 주차 태그 · UTM                                                       */
/* ------------------------------------------------------------------ */

/** KST 기준 ISO 주차 — "2026w38". 캠페인 이름에 붙여 어느 주 글인지 추적한다. */
export function promoWeekTag(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  /* ISO 8601: 그 주의 목요일이 속한 해가 주차의 해 */
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400_000 + 1) / 7);
  return `${d.getUTCFullYear()}w${String(week).padStart(2, "0")}`;
}

export type UtmParams = { source: string; medium: string; campaign: string };

/**
 * URL 에 utm 세 개를 붙인다. 기존 쿼리·해시는 보존. 이미 utm_source 가 있으면
 * 그대로 돌려준다(멱등) — 같은 링크가 두 번 지나가도 파라미터가 겹치지 않는다.
 */
export function withUtm(url: string, utm: UtmParams): string {
  const hashIdx = url.indexOf("#");
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
  if (/[?&]utm_source=/.test(base)) return url;
  const qs =
    `utm_source=${encodeURIComponent(utm.source)}` +
    `&utm_medium=${encodeURIComponent(utm.medium)}` +
    `&utm_campaign=${encodeURIComponent(utm.campaign)}`;
  let sep: string;
  if (!base.includes("?")) sep = "?";
  else if (base.endsWith("?") || base.endsWith("&")) sep = "";
  else sep = "&";
  return `${base}${sep}${qs}${hash}`;
}

/* ------------------------------------------------------------------ */
/* 단지 글                                                               */
/* ------------------------------------------------------------------ */

export interface PromoTradeRow {
  /** "202608" */
  ym: string;
  /** 전용면적(㎡). 모르면 null → areaLabel 또는 "전체" 로 묶인다 */
  areaM2: number | null;
  /** 면적대 라벨("60~85㎡") — 개별 면적은 없고 구간만 아는 집계(허브와 같은 구간) */
  areaLabel?: string | null;
  /** 만원 */
  avgManwon: number;
  dealCount: number;
}

export interface ComplexPostInput {
  name: string;
  region: string;
  /** 이미 utm 이 붙은 절대 URL */
  url: string;
  /** "2026년 8월 신고분까지" */
  asOfLabel: string;
  trades: PromoTradeRow[];
  noteCount: number | null;
  tradeCount12m: number | null;
}

const PYEONG_M2 = 3.3058;

/** 만원 → "12.3억"·"9,800만원" (lib/format/krw 의 short 규칙) */
export function formatManwonLabel(manwon: number): string {
  return formatKrwManwon(manwon, { manUnit: "만원" });
}

function areaKey(t: PromoTradeRow): { key: string; sort: number; label: string } {
  if (t.areaM2 !== null && Number.isFinite(t.areaM2) && t.areaM2 > 0) {
    const m2 = Math.round(t.areaM2);
    const py = Math.round(t.areaM2 / PYEONG_M2);
    return { key: `m2:${m2}`, sort: m2, label: `${m2}㎡(${py}평)` };
  }
  const label = (t.areaLabel ?? "").trim();
  if (label) {
    /* 구간 라벨의 첫 숫자로 정렬("~59㎡" → 0, "60~85㎡" → 60) */
    const m = label.match(/\d+/);
    return { key: `band:${label}`, sort: m ? Number(m[0]) : 0, label };
  }
  return { key: "all", sort: Number.POSITIVE_INFINITY, label: "전체" };
}

export type AreaSummaryLine = { label: string; avgManwon: number; dealCount: number };

/** 거래 행 → 면적별 (건수 가중 평균 · 합계 건수). 면적 오름차순, "전체" 는 마지막. */
export function summarizeByArea(trades: PromoTradeRow[]): AreaSummaryLine[] {
  const acc = new Map<string, { sort: number; label: string; sum: number; n: number }>();
  for (const t of trades) {
    const n = Number(t.dealCount) || 0;
    const avg = Number(t.avgManwon);
    if (n <= 0 || !Number.isFinite(avg) || avg <= 0) continue;
    const k = areaKey(t);
    const cur = acc.get(k.key) ?? { sort: k.sort, label: k.label, sum: 0, n: 0 };
    cur.sum += avg * n;
    cur.n += n;
    acc.set(k.key, cur);
  }
  return [...acc.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((v) => ({ label: v.label, avgManwon: Math.round(v.sum / v.n), dealCount: v.n }));
}

function areaLine(l: AreaSummaryLine): string {
  return `${l.label} 평균 ${formatManwonLabel(l.avgManwon)} · ${l.dealCount}건`;
}

function ymLabel(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function monthSpan(trades: PromoTradeRow[]): { months: number; from: string; to: string } | null {
  const yms = [...new Set(trades.map((t) => t.ym).filter(Boolean))].sort();
  if (yms.length === 0) return null;
  return { months: yms.length, from: ymLabel(yms[0]), to: ymLabel(yms[yms.length - 1]) };
}

/** 모든 단지 공통 — 이 단지의 상태를 서술한 것이 아니다(본문에도 그렇게 적는다) */
export const INSPECTION_CHECKPOINTS: readonly string[] = [
  "주차: 세대당 주차 대수, 저녁 시간대 이중주차 여부",
  "소음: 대로변·철로·항공 소음, 창 방향에 따른 체감 차이",
  "일조: 동·호수별 향과 앞동 간격, 오후 일조 시간",
  "학교 도보: 초등학교까지 실제 도보 경로와 횡단보도 수",
  "관리 상태: 외벽·승강기·주차장 바닥, 장기수선충당금 적립 현황",
];

export const SOURCE_LINE =
  "국토교통부 실거래가 공개시스템 신고분, 취소 거래 제외, 신고 지연 최대 30일. 최근 1~2개월 수치는 이후 갱신될 수 있습니다.";

export const NOT_ADVICE_LINE =
  "본 글은 투자 권유가 아니며 공개 데이터의 산술 요약입니다. 판단과 책임은 각자에게 있습니다.";

export interface ComplexBlogPost {
  titles: string[];
  body: string;
}

/** 네이버 블로그용 본문 — 순수 텍스트, 문단은 빈 줄로 구분 */
export function renderComplexBlogPost(input: ComplexPostInput): ComplexBlogPost {
  const { name, region, url, asOfLabel } = input;
  const areas = summarizeByArea(input.trades);
  const span = monthSpan(input.trades);
  const parts: string[] = [];

  parts.push(
    `${region} ${name} 아파트 실거래가를 국토교통부 신고분으로만 정리했습니다 (${asOfLabel}). 호가·추정치는 넣지 않았고, 아래 숫자는 전부 신고된 계약의 산술 평균입니다.`,
  );

  if (areas.length > 0 && span) {
    parts.push(
      [
        `■ 최근 거래 요약 (${span.from}~${span.to}, 면적별)`,
        "",
        ...areas.map((l) => `· ${areaLine(l)}`),
      ].join("\n"),
    );
  } else {
    parts.push(
      "■ 최근 거래 요약\n\n최근 6개월 신고분 집계에 매매 거래가 없습니다 (신고 기한 30일 안의 계약은 아직 반영 전일 수 있습니다).",
    );
  }

  const countLines: string[] = [];
  if (input.tradeCount12m !== null && Number.isFinite(input.tradeCount12m)) {
    countLines.push(`최근 12개월 신고된 매매 거래는 ${input.tradeCount12m.toLocaleString("ko-KR")}건입니다.`);
  }
  if (input.noteCount !== null && Number.isFinite(input.noteCount) && input.noteCount > 0) {
    countLines.push(`내집나우에 공개된 이 단지 임장노트는 ${input.noteCount}건입니다.`);
  }
  if (countLines.length > 0) parts.push(["■ 거래 건수", "", ...countLines].join("\n"));

  parts.push(
    [
      "■ 임장 체크포인트 (현장에서 직접 확인할 것)",
      "",
      ...INSPECTION_CHECKPOINTS.map((c) => `· ${c}`),
      "",
      "위 항목은 모든 단지에 공통으로 적용하는 점검 목록이며, 이 단지의 상태를 서술한 것이 아닙니다. 현장에서 확인한 내용은 임장노트에 남겨 두면 다음 방문과 비교할 수 있습니다.",
    ].join("\n"),
  );

  parts.push(["■ 출처", "", SOURCE_LINE].join("\n"));
  parts.push(NOT_ADVICE_LINE);
  parts.push(`${name} 실거래 이력·면적대 시세·임장노트 → ${url}`);

  const total = areas.reduce((s, l) => s + l.dealCount, 0);
  const titles = [
    `${region} ${name} 실거래가 정리 — ${asOfLabel}, 면적별 평균과 거래 건수`,
    total > 0
      ? `${name} 아파트 최근 거래 ${total}건 요약 (${asOfLabel}) — 국토교통부 신고 기준`
      : `${name} 아파트 실거래 신고 현황 (${asOfLabel}) — 국토교통부 신고 기준`,
  ];

  return { titles, body: parts.join("\n\n") };
}

/** 카페·커뮤니티용 짧은 글 — 5줄 이하, 사실만, 마지막 줄은 링크 */
export function renderComplexShortPost(input: ComplexPostInput): string {
  const { name, region, url, asOfLabel } = input;
  const areas = summarizeByArea(input.trades);
  const lines: string[] = [];
  lines.push(`${region} ${name} 실거래 정리 (${asOfLabel}, 국토교통부 신고분·취소 제외)`);
  if (areas.length > 0) {
    lines.push(areas.slice(0, 2).map(areaLine).join(" / "));
  } else {
    lines.push("최근 6개월 신고분 집계에 매매 거래 없음 (신고 지연 가능)");
  }
  const facts: string[] = [];
  if (input.tradeCount12m !== null && Number.isFinite(input.tradeCount12m)) {
    facts.push(`최근 12개월 거래 ${input.tradeCount12m.toLocaleString("ko-KR")}건`);
  }
  facts.push("신고 지연 최대 30일이라 최근 수치는 바뀔 수 있음");
  lines.push(facts.join(" · "));
  lines.push("투자 권유 아님 · 면적대별 이력과 임장노트는 링크에서");
  lines.push(url);
  return lines.join("\n");
}

/** 해시태그 — 공백 제거, 중복 제거, 최대 8개 */
export function hashtagsFor(name: string, region: string): string[] {
  const clean = (s: string) => s.replace(/[\s#]/g, "").trim();
  const regionTokens = region.split(/\s+/).map(clean).filter(Boolean);
  const raw = [clean(name), ...regionTokens, "실거래가", "임장", "아파트", "아파트시세", "임장노트", "내집나우"];
  const out: string[] = [];
  for (const t of raw) {
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 8);
}
