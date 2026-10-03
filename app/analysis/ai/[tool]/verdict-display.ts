/**
 * [1009 · A] 결과 요약(VerdictCard)의 표시 규칙 — 순수 함수(서버·클라이언트·테스트 공용).
 *
 * 왜(2026-09-22, 1008 픽스처 실측): 결과 머리의 숫자 칸 4개가 전부 같은 글자였다 — "5.1억"(최근 실거래가)과
 * "+18.3%"(지역 1년 변화)가 같은 잉크색·같은 굵기라 **무엇이 가격이고 무엇이 등락인지**가 안 읽혔고,
 * 등락에는 ▲▼도 빨강·파랑도 비교 기준도 없었다(12종 도구 × 4칸 = 48칸 중 등락 칸 9칸 — regionYoy 6 · regionMom 3 — 모두).
 * 칸마다 "표시 방법"을 여기서 정한다:
 *  · won   → <Won> 큰 가격("5억 833만원" — 숫자 굵게·단위 작게, 평균이면 칸 설명에 "평균"이 이미 있다)
 *  · delta → <Delta> "▲ 18.3%"(상승 빨강·하락 파랑·보합 회색) + 비교 기준("1년 전(2025.08) 대비")
 *  · 그 밖 → 예전처럼 value 문자열(숫자·단위 나눠 그리기)
 * 서버가 준 display 가 먼저다. 옛 스냅샷(공유 페이지 — display 없음)은 등락 칸만 value 문자열에서 읽는다
 * (그 문자열은 lib/ai/price-scenarios.ts signedPct 가 만든 "+18.3%"·"−1.5%" 꼴이라 모양이 정해져 있다).
 */
import type { Verdict, VerdictDisplay, VerdictTile } from "@/lib/ai/verdict";

/** 등락 칸 — 옛 스냅샷의 기본 비교 기준 */
const LEGACY_DELTA: Record<string, { digits: 1 | 2; base: string }> = {
  regionYoy: { digits: 1, base: "1년 전 대비" },
  regionMom: { digits: 2, base: "지난달 대비" },
};

/** "+18.3%" · "−1.5%" · "-0.12%" · "0%" → 숫자(%) — 모양이 다르면 null(지어내지 않는다) */
export function parseSignedPct(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^([+\-−])?(\d+(?:\.\d+)?)%$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" || m[1] === "−" ? -n : n;
}

export function tileDisplay(t: VerdictTile): VerdictDisplay | null {
  if (t.value == null) return null;
  if (t.display) return t.display;
  const legacy = LEGACY_DELTA[t.key];
  if (legacy) {
    const pct = parseSignedPct(t.value);
    if (pct !== null) return { kind: "delta", pct, digits: legacy.digits, base: legacy.base };
  }
  return null;
}

/** 대표 수치 — 서버 display 만(옛 스냅샷은 문자열 그대로) */
export function metricDisplay(m: Verdict["metric"]): VerdictDisplay | null {
  return m?.display ?? null;
}

/**
 * 출처 한 줄 — 값이 있는 칸의 출처를 중복 없이, 칸 순서대로. 값이 하나도 없으면 null.
 * (칸마다 "· 국토부 실거래"를 되풀이하던 것을 카드 아래 한 줄로 모은다 — 1008 캡처에서 타일 설명이 3줄로 접혔다)
 */
export function verdictSources(v: Pick<Verdict, "tiles" | "numbers">): string | null {
  const tiles = v.tiles?.length ? v.tiles : v.numbers.map((n) => ({ ...n, note: null }));
  const seen: string[] = [];
  for (const t of tiles) {
    if (t.value == null || !t.source) continue;
    if (!seen.includes(t.source)) seen.push(t.source);
  }
  return seen.length ? seen.join(" · ") : null;
}

/**
 * [1012 · R2 · complex A6] 칸에 값이 하나도 없을 때의 출처 한 줄 — 데이터 출처(evidence)의 원천을 중복 없이.
 * 예전엔 verdictSources 가 null 이면 출처가 접힌 "데이터 출처 N곳" 안에만 있었다(리뷰 −1) — 표 아래 한 줄에 늘 보이게.
 * 원천이 하나도 없으면 null(지어내지 않는다).
 */
export function evidenceSources(evidence: readonly { source: string }[]): string | null {
  const seen: string[] = [];
  for (const e of evidence) {
    const s = (e.source ?? "").trim();
    if (!s || seen.includes(s)) continue;
    seen.push(s);
  }
  return seen.length ? seen.join(" · ") : null;
}

/**
 * [1028] 칸 줄에 세울 칸 — 대표 수치와 같은 숫자를 한 번 더 말하는 칸은 뺀다.
 * 경제지표 모니터는 "기준금리 3%" 가 결론 문장·알약 이유 줄·대표 수치·첫 칸에 네 번 섰다 — 결론 1 + 대표 수치 1 만 남긴다
 * (이유 줄은 lib/ai/verdict.ts 가 점수만 적는다). 대표 수치가 없을 때(금리를 못 읽음)는 "기준금리 — 자료 없음" 칸을 그대로 둔다.
 * verdict.tiles 자체는 건드리지 않는다: 출처 한 줄(verdictSources)과 메모·저장 요약(numbers)은 뺀 칸도 센다 —
 * 칸을 데이터에서 지우면 출처 줄에서 "한국은행"이 사라지고 기준일(한국은행 날짜)만 남는다.
 */
export function tilesBesideMetric(v: Pick<Verdict, "tool" | "metric">, tiles: readonly VerdictTile[]): VerdictTile[] {
  if (v.tool === "ai-economy" && v.metric) return tiles.filter((t) => t.key !== "baseRate");
  return [...tiles];
}

/** 칸 아래 작은 설명 — 값이 있으면 "설명 · 기준 달", 없으면 "자료 없음 · 이유"(출처는 카드 아래 한 줄로) */
export function tileCaption(t: VerdictTile, when: string | null): string {
  if (t.value == null) return t.note ? `자료 없음 · ${t.note}` : "자료 없음";
  return [t.note, when].filter(Boolean).join(" · ");
}
