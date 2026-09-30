/* [1026b · 노트 쓰기] 1단계 "이 단지 한눈에" · "내 지난 노트" 띠의 재료 — 순수 함수 + 지연 조각이 부르는 조회(캐시).
 *
 * 왜: 단지를 골라도 작성 폼은 구 단위 조회(/api/inspection/public-data-context) 하나만 불러, 그 단지의 사실(준공·세대·실거래·
 * 전세가율·공개 노트)도, 내가 이 단지에 남긴 노트도 몰랐다. 두 조회는 이미 있다 —
 *   · GET /api/complex/[id]/detail (공개 · 로그인 불필요)   → 단지 사실
 *   · GET /api/me/complex-records?complexId= (로그인)        → 내 노트(방문일 · 축 평균 점수)
 * 규칙: 응답에 있는 값만 쓴다(새 수치를 만들지 않는다). 없는 칸은 빠진다("—" 로 채우지 않는다). 실거래만 있는 숫자에
 * "시세" 라는 말을 쓰지 않는다. 조회 실패·단지 없음이면 null(카드 없음).
 *
 * 이 모듈은 지연 조각(ComplexGlance · 레일)만 부른다 — /notes/new 첫 로드에 싣지 않는다. */

import { formatKrwManwon } from "@/lib/format/krw";
import { formatVisitDate } from "@/lib/complex/my-records";
import { readAuthedHint } from "@/lib/auth/authed-hint";

export type GlanceChip = { key: "latest" | "trades" | "ratio"; text: string };

export type ComplexGlanceView = {
  /** 한 줄 결론 — "공작아파트 · 1996년 · 1,200세대"(있는 것만) */
  headline: string;
  /** 사실 칩 — 최근 실거래(금액 · 연월 · 면적대) · 12개월 매매 N건 · 전세가율(6개월). 있는 것만 */
  chips: GlanceChip[];
  /** 공개 임장노트 수(>0 일 때만) — 링크 글자에 쓴다 */
  notesCount: number | null;
  /** 단지 상세 */
  href: string;
  /** 단지 좌표(응답에 있을 때만) — 폼 좌표가 비었으면 방문 인증 카드의 기준이 된다 */
  lat: number | null;
  lng: number | null;
};

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "202608" → "2026.08" (형식이 아니면 null) */
export function ymLabel(ym: string): string | null {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : null;
}

/**
 * 면적대별 최근 실거래(응답 areaBands 의 latestManwon · latestYm · label) 중 가장 최근 계약월 한 건.
 * 같은 달이면 거래가 많은 면적대. 없으면 null.
 * 예) "최근 실거래 5.2억 · 2026.08 · 60~85㎡"
 */
export function latestTradeChip(bands: unknown): string | null {
  if (!Array.isArray(bands)) return null;
  let best: { label: string; manwon: number; ym: string; n: number } | null = null;
  for (const b of bands) {
    const o = rec(b);
    if (!o) continue;
    const label = str(o.label);
    const manwon = num(o.latestManwon);
    const ym = str(o.latestYm);
    if (!label || manwon == null || manwon <= 0 || !ymLabel(ym)) continue;
    const n = num(o.count) ?? 0;
    if (!best || ym > best.ym || (ym === best.ym && n > best.n)) best = { label, manwon, ym, n };
  }
  if (!best) return null;
  return `최근 실거래 ${formatKrwManwon(best.manwon, { style: "eok1" })} · ${ymLabel(best.ym)} · ${best.label}`;
}

/**
 * /api/complex/[id]/detail 응답 → 카드. 단지가 없거나(not_found · 실패) 이름 말고는 아무 사실도 없으면 null —
 * 이름만 있는 카드는 바로 위 위치 카드와 같은 말이다.
 */
export function glanceFromDetail(raw: unknown, id: string, fallbackName = ""): ComplexGlanceView | null {
  const o = rec(raw);
  const c = rec(o?.complex);
  if (!o || !c) return null;
  const name = str(c.name) || fallbackName.trim();
  const year = num(c.build_year);
  const hh = num(c.households);
  const facts = [year != null && year > 0 ? `${year}년` : "", hh != null && hh > 0 ? `${hh.toLocaleString("ko-KR")}세대` : ""].filter(
    Boolean,
  );

  const chips: GlanceChip[] = [];
  const latest = latestTradeChip(o.areaBands);
  if (latest) chips.push({ key: "latest", text: latest });
  const f = rec(o.facts);
  const ts = rec(f?.tradeSummary);
  const tc = num(ts?.count);
  if (tc != null && tc > 0) {
    const wm = num(ts?.windowMonths);
    chips.push({ key: "trades", text: `${wm != null ? `${wm}개월 ` : ""}매매 ${tc.toLocaleString("ko-KR")}건` });
  }
  const jr = rec(f?.jeonseRatio);
  const pct = num(jr?.pct);
  if (pct != null && pct > 0) {
    const wm = num(jr?.windowMonths);
    chips.push({ key: "ratio", text: `전세가율 ${pct}%${wm != null ? `(${wm}개월)` : ""}` });
  }
  const nb = rec(o.notes);
  const nc = num(nb?.count);
  const notesCount = nc != null && nc > 0 ? nc : null;

  if (facts.length === 0 && chips.length === 0 && notesCount == null) return null;
  const lat = num(c.lat);
  const lng = num(c.lng);
  /* 0,0 은 좌표가 아니라 "없음"(폼의 URL 프리필과 같은 판정) */
  const hasXY = lat != null && lng != null && lat !== 0 && lng !== 0;
  return {
    headline: [name, ...facts].filter(Boolean).join(" · "),
    chips,
    notesCount,
    href: `/complex/${encodeURIComponent(id)}`,
    lat: hasXY ? lat : null,
    lng: hasXY ? lng : null,
  };
}

/* ── 내 지난 노트 ──────────────────────────────────────────────────────── */

export type MyNotesLine = {
  count: number;
  /** 가장 최근 방문 노트 — "지난 체크 불러오기" · "지난 노트 보기" 의 대상 */
  latestId: string;
  /** 내 노트 축 평균 점수(avgScore)들의 평균(소수 1자리) — 점수 있는 노트가 없으면 null */
  score: number | null;
  /** "이 단지 내 노트 2개 · 마지막 2026.09.01 · 점수 3.8/5" */
  text: string;
};

/**
 * /api/me/complex-records 응답 → 띠 한 줄. 수정 화면이면 지금 노트(excludeId)를 뺀다. 0개면 null.
 * 평균은 AI 분석 "내 임장노트" 칩(VerdictBoard)과 같은 계산 — 응답의 avgScore 만 쓴다.
 */
export function myNotesLine(raw: unknown, excludeId: string | null): MyNotesLine | null {
  const list = rec(raw)?.notes;
  if (!Array.isArray(list)) return null;
  const rows = list
    .map(rec)
    .filter((n): n is Record<string, unknown> => Boolean(n && str(n.id) && str(n.visitDate) && str(n.id) !== excludeId))
    .map((n) => ({ id: str(n.id), visitDate: str(n.visitDate), avgScore: num(n.avgScore) }));
  if (rows.length === 0) return null;
  /* 응답은 방문일 오름차순 — 그래도 한 번 더(같은 날이면 응답 순서 그대로: 안정 정렬) */
  const sorted = [...rows].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  const last = sorted[sorted.length - 1];
  const scored = rows.map((r) => r.avgScore).filter((s): s is number => s != null && s > 0);
  const score = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;
  const parts = [`이 단지 내 노트 ${rows.length}개`, `마지막 ${formatVisitDate(last.visitDate)}`];
  if (score != null) parts.push(`점수 ${score}/5`);
  return { count: rows.length, latestId: last.id, score, text: parts.join(" · ") };
}

/* ── 조회(클라이언트) ──────────────────────────────────────────────────── */

/* 같은 단지를 폼 카드와 데스크톱 레일이 함께 그린다 — 요청은 한 번(단지 id 별 프라미스). 실패는 캐시하지 않는다. */
const detailCache = new Map<string, Promise<unknown>>();

export function loadComplexDetail(id: string): Promise<unknown> {
  const hit = detailCache.get(id);
  if (hit) return hit;
  const p: Promise<unknown> = fetch(`/api/complex/${encodeURIComponent(id)}/detail`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  detailCache.set(id, p);
  void p.then((v) => {
    if (v == null) detailCache.delete(id);
  });
  return p;
}

/** 내 노트 — 로그인 힌트가 없으면(비회원 확정) 부르지 않는다. 실패는 null(띠 없음) */
export async function loadMyComplexNotes(id: string): Promise<unknown> {
  if (!readAuthedHint()) return null;
  try {
    const r = await fetch(`/api/me/complex-records?complexId=${encodeURIComponent(id)}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
