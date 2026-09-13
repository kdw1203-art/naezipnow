/**
 * [995-4] 개인 주간 다이제스트 — **순수 포맷터**.
 *
 * server-only·React·환경변수를 import 하지 않는다. 데이터는 lib/digest/personal.ts
 * (서버 전용)가 행에서 읽어 오고, 여기는 그 값을 수신함 한 건·푸시 한 건·메일 한 통의
 * 문자열로만 바꾼다. 그래서 node:test 에서 픽스처만으로 검증할 수 있다.
 *
 * 규칙:
 *  - 섹션이 없으면(undefined) 그 줄은 아예 없다 — "0곳"·"소식 없음"을 지어내지 않는다.
 *  - 모든 숫자 옆에 근거를 붙인다: 시세는 기준월, 실거래는 계약월·신고일, 청약은 접수일.
 *  - 수신함 본문은 600자 이내 — 넘치면 줄 단위로 자르고 잘렸음을 적는다.
 */

import { formatKrwWon } from "@/lib/format/krw";
import { emailLayout, escapeHtml } from "@/lib/email/templates";

/* ── 타입 ─────────────────────────────────────────────────────────────── */

export type PersonalDigestRegion = {
  /** 사용자가 적은 이름 ("서울 마포구") */
  name: string;
  /** /region/[id] 허브 id — 못 풀면 null → /map?region= */
  regionId: string | null;
  /** 스냅샷의 지역명 ("마포구") */
  regionName: string;
  /** 평균 매매가(원) — 0 이하는 애초에 싣지 않는다 */
  avgSaleWon: number;
  /** 전월 대비 변동률(%) — 스냅샷에 없으면 null(모름은 모름으로) */
  changeMonthlyPct: number | null;
  /** 기준월 "yyyymm" */
  period: string | null;
  /** 기준월 거래 건수(스냅샷) — 없으면 null */
  tradeCount: number | null;
};

export type PersonalDigestComplex = {
  complexId: string;
  name: string;
  /** 이번 주(신고 기준) 새 매매 신고 건수 */
  txCount: number;
  /** 가장 최근 신고의 금액(원) */
  latestPriceWon: number | null;
  /** 가장 최근 신고의 계약월 "yyyymm" */
  latestContractYm: string | null;
  /** 가장 최근 신고의 적재(신고 확인) 시각 ISO */
  latestReportedAt: string | null;
  areaM2: number | null;
  floor: number | null;
};

export type PersonalDigestNoteComplex = PersonalDigestComplex & {
  /** 가장 최근 임장노트 id */
  noteId: string;
};

export type PersonalDigestApply = {
  houseNm: string;
  /** 청약홈 공급지역(시/도) */
  region: string | null;
  address: string | null;
  totSupply: number | null;
  /** 접수 시작·마감 "YYYY-MM-DD" */
  rceptBgnde: string;
  rceptEndde: string | null;
  url: string | null;
};

export type PersonalDigest = {
  /** "9월 2주차" — 사이트 다이제스트와 같은 규칙 */
  weekLabel: string;
  /** 집계 창(KST 날짜) — 실거래 신고 기준 */
  windowFrom: string;
  windowTo: string;
  regions?: PersonalDigestRegion[];
  watchlist?: { complexCount: number; txCount: number; items: PersonalDigestComplex[] };
  myNotes?: { complexCount: number; items: PersonalDigestNoteComplex[] };
  apply?: { count: number; items: PersonalDigestApply[] };
};

/* ── 상한 ─────────────────────────────────────────────────────────────── */

export const INBOX_BODY_MAX = 600;
/** 웹푸시 본문 — 알림 센터 한 줄 분량 */
export const PUSH_BODY_MAX = 160;

/* ── 작은 포맷 도우미(순수) ────────────────────────────────────────────── */

/** "202608" → "2026.08" · 형식이 아니면 null */
export function ymLabel(ym: string | null | undefined): string | null {
  const s = (ym ?? "").trim();
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4)}` : null;
}

/** "2026-09-15" → "09.15" · 형식이 아니면 원문 */
export function mdLabel(ymd: string | null | undefined): string {
  const s = (ymd ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}.${m[3]}` : s;
}

/** ISO 시각 → KST 날짜 "09.12" · 못 읽으면 null */
export function kstMd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`;
}

/** 시세 얼굴 — 사이트 다이제스트(lib/newui/digest.ts)와 같은 "short" 규칙 */
export function priceLabel(won: number | null | undefined): string {
  return formatKrwWon(won, { style: "short" });
}

/** 전월 대비 — 모르면 null(문자열로 "0.0%" 를 만들지 않는다) */
export function deltaLabel(pct: number | null | undefined): string | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "—";
  return `${arrow} ${Math.abs(pct).toFixed(1)}%`;
}

function deltaTone(pct: number | null | undefined): "up" | "down" | "flat" {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return "flat";
  return pct > 0.1 ? "up" : pct < -0.1 ? "down" : "flat";
}

/* ── 섹션 판정 ─────────────────────────────────────────────────────────── */

export function isPersonalDigestEmpty(d: PersonalDigest | null | undefined): boolean {
  if (!d) return true;
  return (
    !(d.regions && d.regions.length > 0) &&
    !(d.watchlist && d.watchlist.complexCount > 0) &&
    !(d.myNotes && d.myNotes.complexCount > 0) &&
    !(d.apply && d.apply.count > 0)
  );
}

/** 제목 조각 — 있는 섹션만. 순서: 지역 · 실거래 · 임장 · 청약 */
export function personalDigestTitleParts(d: PersonalDigest): string[] {
  const parts: string[] = [];
  if (d.regions && d.regions.length > 0) parts.push(`관심 지역 ${d.regions.length}곳`);
  if (d.watchlist && d.watchlist.complexCount > 0) parts.push(`새 실거래 ${d.watchlist.complexCount}단지`);
  if (d.myNotes && d.myNotes.complexCount > 0) parts.push(`임장 단지 ${d.myNotes.complexCount}곳`);
  if (d.apply && d.apply.count > 0) parts.push(`청약 ${d.apply.count}건`);
  return parts;
}

/** 수신함 카드가 열 곳 — 가장 행동 가능한 섹션 순 */
export function personalDigestPrimaryHref(d: PersonalDigest): string {
  if ((d.watchlist && d.watchlist.complexCount > 0) || (d.myNotes && d.myNotes.complexCount > 0)) {
    return "/my/watchlist";
  }
  if (d.regions && d.regions.length > 0) return regionHref(d.regions[0]);
  if (d.apply && d.apply.count > 0) return "/apply";
  return "/digest";
}

export function regionHref(r: PersonalDigestRegion): string {
  return r.regionId ? `/region/${encodeURIComponent(r.regionId)}` : `/map?region=${encodeURIComponent(r.name)}`;
}

/* ── 줄 만들기(수신함·메일 텍스트 공용) ───────────────────────────────── */

function regionLine(r: PersonalDigestRegion): string {
  const bits = [`${r.regionName} 평균 매매 ${priceLabel(r.avgSaleWon)}`];
  const delta = deltaLabel(r.changeMonthlyPct);
  if (delta) bits.push(`전월 대비 ${delta}`);
  if (r.tradeCount != null && r.tradeCount > 0) bits.push(`거래 ${r.tradeCount.toLocaleString("ko-KR")}건`);
  const ym = ymLabel(r.period);
  return `${bits.join(" · ")}${ym ? ` (${ym} 기준)` : ""}`;
}

function complexBasis(c: PersonalDigestComplex): string {
  const bits: string[] = [];
  const ym = ymLabel(c.latestContractYm);
  if (ym) bits.push(`${ym} 계약`);
  const md = kstMd(c.latestReportedAt);
  if (md) bits.push(`${md} 신고`);
  return bits.length ? ` (${bits.join(" · ")})` : "";
}

function complexLine(c: PersonalDigestComplex, prefix = ""): string {
  const latest = c.latestPriceWon ? ` · 최근 ${priceLabel(c.latestPriceWon)}` : "";
  return `${prefix}${c.name} 새 실거래 ${c.txCount}건${latest}${complexBasis(c)}`;
}

function applyLine(a: PersonalDigestApply): string {
  const region = a.region ? `(${a.region})` : "";
  const supply = a.totSupply ? ` ${a.totSupply.toLocaleString("ko-KR")}세대` : "";
  const end = a.rceptEndde ? `~${mdLabel(a.rceptEndde)}` : "";
  return `청약 ${a.houseNm}${region}${supply} · 접수 ${mdLabel(a.rceptBgnde)}${end}`;
}

/** 섹션별 줄 목록 — 수신함 본문과 메일 텍스트가 같은 줄을 쓴다 */
export function personalDigestLines(d: PersonalDigest): string[] {
  const lines: string[] = [];
  for (const r of d.regions ?? []) lines.push(regionLine(r));
  if (d.watchlist && d.watchlist.complexCount > 0) {
    for (const c of d.watchlist.items.slice(0, 3)) lines.push(complexLine(c));
    const rest = d.watchlist.complexCount - Math.min(3, d.watchlist.items.length);
    if (rest > 0) lines.push(`외 ${rest}개 단지에도 새 실거래 (${mdLabel(d.windowFrom)}~${mdLabel(d.windowTo)} 신고)`);
  }
  for (const c of d.myNotes?.items ?? []) lines.push(complexLine(c, "임장 다녀온 "));
  for (const a of d.apply?.items ?? []) lines.push(applyLine(a));
  return lines;
}

/** 줄 단위로 상한에 맞춘다 — 잘렸으면 마지막 줄에 그 사실을 적는다 */
export function clampLines(lines: string[], max: number): string {
  const out: string[] = [];
  let len = 0;
  for (const line of lines) {
    const add = (out.length ? 1 : 0) + line.length;
    if (len + add > max) break;
    out.push(line);
    len += add;
  }
  const dropped = lines.length - out.length;
  if (dropped > 0) {
    const tail = `… 외 ${dropped}줄`;
    while (out.length && len + 1 + tail.length > max) {
      len -= out[out.length - 1].length + (out.length > 1 ? 1 : 0);
      out.pop();
    }
    out.push(tail);
  }
  return out.join("\n");
}

/* ── 수신함 · 푸시 ─────────────────────────────────────────────────────── */

export function formatPersonalDigestInbox(d: PersonalDigest): { title: string; body: string } {
  const parts = personalDigestTitleParts(d);
  const title = parts.length ? `이번 주 내 요약 — ${parts.join(" · ")}` : `${d.weekLabel} 내 주간 요약`;
  return { title, body: clampLines(personalDigestLines(d), INBOX_BODY_MAX) };
}

/** 웹푸시 — 제목은 수신함과 같고 본문은 첫 줄들만 */
export function formatPersonalDigestPush(d: PersonalDigest): { title: string; body: string } {
  const { title } = formatPersonalDigestInbox(d);
  return { title, body: clampLines(personalDigestLines(d), PUSH_BODY_MAX) };
}

/* ── 이메일 ────────────────────────────────────────────────────────────── */

const TXT = "#191f28";
const MUTED = "#8a94a6";
const SUB = "#4a5568";
const ACCENT = "#1d4fd8";

function h2(text: string): string {
  return `<h2 style="margin:18px 0 6px;font-size:14px;color:${TXT};">${escapeHtml(text)}</h2>`;
}
function p(text: string, color = SUB): string {
  return `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${color};">${text}</p>`;
}
function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${ACCENT};text-decoration:none;font-weight:700;">${escapeHtml(label)}</a>`;
}

/**
 * 메일 한 통 — 표(table) 없이 제목·문단·링크만. 링크는 실재하는 화면만
 * (/my/watchlist · /apply · /region/[id] · /map?region=). 마케팅 동의자에게만
 * 나가므로 제목에 (광고) 를 붙인다(정보통신망법 광고성 정보 표기 — reengageEmail 과 같은 규칙).
 */
export function formatPersonalDigestEmail(
  d: PersonalDigest,
  opts: { siteUrl: string },
): { subject: string; html: string; text: string } {
  const site = opts.siteUrl.replace(/\/+$/, "");
  const abs = (path: string) => `${site}${path}`;
  const parts = personalDigestTitleParts(d);
  const subject = `(광고) [내집나우] ${d.weekLabel} 내 주간 요약${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
  const toneColor = (t: "up" | "down" | "flat") =>
    t === "up" ? "#c62828" : t === "down" ? "#1565c0" : MUTED;

  const blocks: string[] = [];
  if (d.regions && d.regions.length > 0) {
    blocks.push(h2("관심 지역 시세"));
    for (const r of d.regions) {
      const delta = deltaLabel(r.changeMonthlyPct);
      const ym = ymLabel(r.period);
      blocks.push(
        p(
          `${link(abs(regionHref(r)), r.regionName)} 평균 매매 <strong style="color:${TXT};">${escapeHtml(priceLabel(r.avgSaleWon))}</strong>` +
            (delta ? ` <span style="color:${toneColor(deltaTone(r.changeMonthlyPct))};font-weight:700;">${escapeHtml(delta)}</span>` : "") +
            (r.tradeCount != null && r.tradeCount > 0 ? ` · 거래 ${r.tradeCount.toLocaleString("ko-KR")}건` : "") +
            (ym ? ` <span style="color:${MUTED};font-size:12px;">(${ym} 기준)</span>` : ""),
        ),
      );
    }
  }
  if (d.watchlist && d.watchlist.complexCount > 0) {
    blocks.push(h2(`관심 단지 새 실거래 ${d.watchlist.txCount}건 · ${d.watchlist.complexCount}개 단지`));
    for (const c of d.watchlist.items.slice(0, 3)) {
      blocks.push(
        p(
          `<strong style="color:${TXT};">${escapeHtml(c.name)}</strong> ${c.txCount}건` +
            (c.latestPriceWon ? ` · 최근 ${escapeHtml(priceLabel(c.latestPriceWon))}` : "") +
            `<span style="color:${MUTED};font-size:12px;">${escapeHtml(complexBasis(c))}</span>`,
        ),
      );
    }
    blocks.push(p(link(abs("/my/watchlist"), "관심 단지 전체 보기 ›")));
  }
  if (d.myNotes && d.myNotes.complexCount > 0) {
    blocks.push(h2(`임장 다녀온 단지 ${d.myNotes.complexCount}곳에 새 실거래`));
    for (const c of d.myNotes.items) {
      blocks.push(
        p(
          `${link(abs(`/notes/${encodeURIComponent(c.noteId)}`), c.name)} ${c.txCount}건` +
            (c.latestPriceWon ? ` · 최근 ${escapeHtml(priceLabel(c.latestPriceWon))}` : "") +
            `<span style="color:${MUTED};font-size:12px;">${escapeHtml(complexBasis(c))}</span>`,
        ),
      );
    }
  }
  if (d.apply && d.apply.count > 0) {
    blocks.push(h2(`관심 지역 청약 접수 ${d.apply.count}건`));
    for (const a of d.apply.items) {
      blocks.push(
        p(
          `<strong style="color:${TXT};">${escapeHtml(a.houseNm)}</strong>` +
            (a.region ? ` <span style="color:${MUTED};">(${escapeHtml(a.region)})</span>` : "") +
            (a.totSupply ? ` ${a.totSupply.toLocaleString("ko-KR")}세대` : "") +
            ` · 접수 ${escapeHtml(mdLabel(a.rceptBgnde))}${a.rceptEndde ? `~${escapeHtml(mdLabel(a.rceptEndde))}` : ""}`,
        ),
      );
    }
    blocks.push(p(link(abs("/apply"), "청약 일정 보기 ›")));
  }

  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:19px;color:${TXT};">${escapeHtml(d.weekLabel)} 내 주간 요약</h1>
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${escapeHtml(mdLabel(d.windowFrom))}~${escapeHtml(mdLabel(d.windowTo))} 신고분 · 국토교통부 실거래·한국부동산원 공표·청약홈 공고 기준 · 매물 호가가 아닙니다</p>
    ${blocks.join("\n    ")}
    <a href="${escapeHtml(abs(personalDigestPrimaryHref(d)))}" style="display:inline-block;margin-top:18px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">내집나우에서 보기</a>
  `);

  const text = [
    `${d.weekLabel} 내 주간 요약`,
    `${mdLabel(d.windowFrom)}~${mdLabel(d.windowTo)} 신고분 · 국토교통부 실거래·한국부동산원 공표·청약홈 공고 기준`,
    "",
    ...personalDigestLines(d),
    "",
    `보기: ${abs(personalDigestPrimaryHref(d))}`,
  ].join("\n");

  return { subject, html, text };
}
