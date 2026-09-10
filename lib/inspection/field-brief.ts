/**
 * [985 · 17] 현장 브리핑 — **이미 받아 온 데이터**를 작성 화면에서 쓴다.
 *
 * 무엇이 문제였나: 위치를 고르면 폼이 `/api/inspection/public-data-context` 를
 * 부른다. 그 응답에는 시세 한 줄(marketHint)·구조화 시세(market)·공기질·
 * 지역별 체크 힌트(checklistHints)·개발계획 슬라이스(plans)가 **전부** 들어
 * 있는데, 폼은 `weatherHint` 하나만 읽고 나머지를 버렸다. 요청은 이미 나가고
 * 캐시까지 쓰고 있었으니 비용은 그대로 내면서 화면에만 안 쓴 셈이다.
 * (981에서 겪은 것과 같은 모양이다 — 엔진이 읽는 입력을 UI 가 안 물어봤다.)
 *
 * 왜 순수 모듈인가: 무엇을 몇 줄까지 보여줄지, 어떤 값을 믿을지가 판단이다.
 * NoteForm.tsx 는 테스트를 붙일 수 없으므로 그 판단만 여기로 내린다.
 * `server-only` 를 import 하지 않는다(tests/unit 러너가 못 읽는다).
 */

export type FieldBriefLine = {
  key: string;
  /** 무엇에 대한 말인지 — 왼쪽 라벨 */
  label: string;
  text: string;
};

export type FieldBrief = {
  lines: FieldBriefLine[];
  /** 이 지역에서 특히 볼 것 — 실데이터에서 파생된 힌트 */
  checks: string[];
  /** 참고 슬라이스(개발계획 등) — 제목과 건수만 */
  plans: { title: string; count: number }[];
  /** 언제 받은 값인지 — 화면에 밝힌다 */
  fetchedAt: string | null;
};

/** 세 줄까지. 더 늘리면 현장에서 읽지 않고 넘긴다. */
export const MAX_BRIEF_LINES = 3;
export const MAX_BRIEF_CHECKS = 4;
export const MAX_BRIEF_PLANS = 3;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * API 응답 → 화면에 그릴 것. 아무것도 없으면 **null** 이다 —
 * 빈 카드를 그려서 "조회했는데 아무것도 없다"를 "볼 게 없다"로 보이게 하지 않는다.
 *
 * 날씨(weatherHint)는 일부러 뺀다. 방문 정보 칸에 이미 "제안 · …(탭하여 적용)"
 * 버튼으로 나와 있어서, 여기 또 적으면 같은 말이 한 화면에 두 번 읽힌다.
 */
export function buildFieldBrief(raw: unknown): FieldBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const lines: FieldBriefLine[] = [];
  const market = cleanText(o.marketHint);
  if (market) lines.push({ key: "market", label: "시세", text: market });
  const air = cleanText(o.airQualityHint);
  if (air) lines.push({ key: "air", label: "공기질", text: air });

  /* marketHint 가 없어도 구조화 값(market)이 있으면 그걸로 한 줄 만든다 —
     문장 조립에 실패한 경우까지 화면을 비워 둘 이유가 없다. */
  if (!market && o.market && typeof o.market === "object") {
    const m = o.market as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof m.perM2Sale === "number" && Number.isFinite(m.perM2Sale)) {
      parts.push(`㎡당 매매 ${Math.round(m.perM2Sale).toLocaleString("ko-KR")}만원`);
    }
    if (typeof m.jeonseRatio === "number" && Number.isFinite(m.jeonseRatio)) {
      parts.push(`전세가율 ${m.jeonseRatio.toFixed(1)}%`);
    }
    if (typeof m.tradeCount === "number" && Number.isFinite(m.tradeCount)) {
      parts.push(`거래 ${m.tradeCount.toLocaleString("ko-KR")}건`);
    }
    if (parts.length > 0) {
      const src = cleanText(m.source);
      const period = cleanText(m.period);
      const tail = [src, period].filter(Boolean).join(" ");
      lines.push({
        key: "market-struct",
        label: "시세",
        text: tail ? `${parts.join(" · ")} (${tail})` : parts.join(" · "),
      });
    }
  }

  const checks: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.checklistHints)) {
    for (const h of o.checklistHints) {
      const t = cleanText(h);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      checks.push(t);
      if (checks.length >= MAX_BRIEF_CHECKS) break;
    }
  }

  const plans: { title: string; count: number }[] = [];
  if (Array.isArray(o.plans)) {
    for (const p of o.plans) {
      if (!p || typeof p !== "object") continue;
      const slice = p as Record<string, unknown>;
      const title = cleanText(slice.title);
      const items = Array.isArray(slice.items) ? slice.items.length : 0;
      /* 건수 0 인 슬라이스는 싣지 않는다 — "조회했지만 없음"을 항목처럼 보이게 하면
         화면이 실제보다 풍부해 보인다. */
      if (!title || items === 0) continue;
      plans.push({ title, count: items });
      if (plans.length >= MAX_BRIEF_PLANS) break;
    }
  }

  if (lines.length === 0 && checks.length === 0 && plans.length === 0) return null;

  const fetchedAt = cleanText(o.fetchedAt) || null;
  return { lines: lines.slice(0, MAX_BRIEF_LINES), checks, plans, fetchedAt };
}

/** "9월 10일 조회" — 언제 받은 값인지 밝힌다. 못 읽으면 null(문구를 빼는 편이 낫다). */
export function briefFetchedLabel(fetchedAt: string | null): string | null {
  if (!fetchedAt) return null;
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 조회`;
}
