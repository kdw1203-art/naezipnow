import Link from "next/link";
import type { ComplexFacts } from "@/lib/complex/complex-facts";
import { formatKrwWon } from "@/lib/format/krw";
import { ExplainLazy as Explain } from "./ExplainLazy";

/* ============================================================
   [1007 · P2] 단지 허브 — 전세가율 · 자료 완성도 카드(서버 조각, JS 없음).

   왜: 1006 지도 패널(GET /api/complex/[id]/detail)은 buildComplexFacts 로 단지 전세가율
   (최근 6개월, 전세·매매 각 표본 ≥3, 면적 미가중)과 자료 완성도(없는 이유)를 말하는데,
   같은 단지의 허브(/complex/[id])에는 둘 다 없었다 — 지도에서 "전세가율 39.2%" 를 보고
   허브로 넘어오면 그 숫자가 사라졌다. 같은 순수 모듈·같은 규칙으로 여기서도 그린다.

   규칙: 계산됐으면 숫자, 아니면 **이유**(표본 부족·조회 실패)를 그대로 적는다. "—" 나열 금지.
   ============================================================ */

function eok(krw: number): string {
  return formatKrwWon(krw, { style: "eok1" });
}

function ymLabel(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

export function ComplexFactsCard({
  facts,
  noteHref,
}: {
  facts: ComplexFacts;
  /** "임장노트" 가 비었을 때의 행동 — 이 단지 프리필 작성 주소 */
  noteHref: string;
}) {
  const ratio = facts.jeonseRatio;
  const { have, missing } = facts.completeness;
  const haveLabels = have.map((k) => FACT_LABEL[k]).filter(Boolean);
  return (
    <section
      className="rise-in-1 card mt-3 rounded-2xl px-4 py-3"
      aria-label="전세가율과 자료 완성도"
      data-complex-facts=""
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* ── 전세가율 ───────────────────────────────────────────── */}
        <div>
          {/* [1009 · C] 어려운 말 옆 ⓘ — 계산은 lib/complex/complex-facts computeJeonseRatio 와 같은 말로 */}
          <div className="inline-flex items-center gap-0.5 t-caption font-bold text-text-3">
            단지 전세가율
            <Explain
              term="jeonse-garyul"
              how={[
                "최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 거래가 중앙값 × 100이에요.",
                "전세·매매가 각각 3건 이상일 때만 계산해요 — 한두 건의 중앙값은 그 거래 자체라서요.",
                "면적을 가중하지 않아요. 전세와 매매의 평형 구성이 다르면 실제보다 높거나 낮게 나올 수 있어요.",
              ]}
              source="국토교통부 매매·전월세 실거래 신고"
            />
          </div>
          {ratio ? (
            <>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="t-title leading-none text-ink tabular-nums">{ratio.pct}%</span>
                <span className="t-caption text-text-3">최근 {ratio.windowMonths}개월</span>
              </div>
              <p className="mt-1 t-caption text-text-3 tabular-nums">
                전세 중앙 {eok(ratio.jeonseMedianKrw)}({ratio.jeonseCount}건) ÷ 매매 중앙{" "}
                {eok(ratio.tradeMedianKrw)}({ratio.tradeCount}건) · {ymLabel(ratio.fromYm)}~
                {ymLabel(ratio.toYm)} · 면적 미가중
              </p>
            </>
          ) : (
            <>
              <div className="mt-0.5 t-body font-bold text-ink">아직 계산하지 않아요</div>
              {/* 계산하지 않은 **이유** — 표본 부족과 조회 실패를 같은 말로 뭉개지 않는다 */}
              {facts.jeonseRatioReason && (
                <p className="mt-1 t-caption text-text-3">{facts.jeonseRatioReason}</p>
              )}
            </>
          )}
        </div>

        {/* ── 자료 완성도 ─────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="t-caption font-bold text-text-3">자료 완성도</div>
            <div className="t-caption text-text-3 tabular-nums">
              {haveLabels.length}/{haveLabels.length + missing.length}
            </div>
          </div>
          {haveLabels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {haveLabels.map((l) => (
                <span
                  key={l}
                  className="rounded-md bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <ul className="mt-1.5 flex list-none flex-col gap-0.5 p-0">
              {dedupeGaps(missing).map((g) => (
                <li key={g.labels.join("·")} className="t-caption leading-[1.6] text-text-3">
                  <span className="font-bold text-text-2">{g.labels.join(" · ")}</span> — {g.note}
                  {/* "첫 노트 쓰기" 는 정말 0건일 때만 — 조회 실패에 쓰기를 권하면 실패를 없음으로 위장한다 */}
                  {g.key === "notes" && g.reason === "no_notes" && (
                    <>
                      {" "}
                      <Link
                        href={noteHref}
                        className="inline-flex min-h-[24px] items-center font-bold text-primary underline"
                      >
                        첫 노트 쓰기
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* FACT_LABELS 와 같은 표(순수 모듈 값) — 화면 라벨만 여기서 짧게 */
const FACT_LABEL: Record<string, string> = {
  build_year: "준공",
  households: "세대수",
  building_count: "동 수",
  parking: "주차",
  builder: "시공사",
  heating: "난방",
  road: "도로명",
  trades: "매매 실거래",
  rent: "전월세 실거래",
  notes: "임장노트",
};

/** 같은 이유(대장 미연결 등)로 빠진 항목은 한 줄로 묶는다 — 여섯 줄이 같은 문장을 반복하지 않게 */
function dedupeGaps(missing: ComplexFacts["completeness"]["missing"]): Array<{
  key: string;
  reason: string;
  labels: string[];
  note: string;
}> {
  const out: Array<{ key: string; reason: string; labels: string[]; note: string }> = [];
  for (const g of missing) {
    const label = FACT_LABEL[g.key] ?? g.label;
    const same = out.find((o) => o.note === g.note);
    if (same) same.labels.push(label);
    else out.push({ key: g.key, reason: g.reason, labels: [label], note: g.note });
  }
  return out;
}
