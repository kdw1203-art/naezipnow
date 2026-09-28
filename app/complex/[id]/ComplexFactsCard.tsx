import Link from "next/link";
import type { ComplexFacts } from "@/lib/complex/complex-facts";
import type { ComplexInfoFacts } from "@/lib/complex/info-cells";
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { EmbedSnippet } from "@/app/components/EmbedSnippet";

/* ============================================================
   [1015 · 규칙 J] 단지 상세 맨 끝 — `<details>` "데이터 출처" 하나(서버 조각, JS 없음).

   1007 의 "전세가율 · 자료 완성도" 카드(이 파일)가 하던 일 가운데 **값**(전세가율)은 위 단지 정보 목록의 한 행으로
   올라갔고, 여기에는 **출처 · 빠진 항목과 이유 · 지번 주소·단지코드 · 자주 묻는 질문(FAQPage) · 위젯 퍼가기**만
   접어 둔다. 예전엔 같은 성격의 글이 화면 곳곳(단지 정보 카드 출처 줄 · 완성도 칩 · Q&A 카드 · 퍼가기 카드)에
   따로 있었다. 접혀 있어도 HTML 에는 있으므로 FAQPage JSON-LD 는 보이는 질문·답과 같은 배열이다.

   규칙은 그대로: 계산·조회가 안 된 항목은 **이유**(표본 부족·대장 미연결·조회 실패)를 그대로 적는다. "—" 나열 금지.
   ============================================================ */

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

export function ComplexFactsCard({
  facts,
  noteHref,
  spec,
  faq,
  sources,
  embedId = null,
}: {
  facts: ComplexFacts;
  /** "임장노트" 가 비었을 때의 행동 — 이 단지 프리필 작성 주소 */
  noteHref: string;
  /** 단지 정보 원본 — 지번 주소·단지코드처럼 위 목록에 안 실은 것만 여기 */
  spec: ComplexInfoFacts;
  /** 실데이터 Q&A(FAQPage) — 비면 절 자체가 없다 */
  faq: FaqItem[];
  /** 이 화면이 실제로 보여 준 자료의 원천(중복 없이) */
  sources: string[];
  /** 매매 실거래가 한 건이라도 있을 때만 위젯 퍼가기(순수 단지 id) */
  embedId?: string | null;
}) {
  const { have, missing } = facts.completeness;
  const gaps = dedupeGaps(missing);
  const road = spec.roadAddress?.trim() || null;
  const jibun = spec.address?.trim() || null;
  const extraRows: Array<{ label: string; value: string }> = [
    ...(road && jibun && road !== jibun ? [{ label: "지번 주소", value: jibun }] : []),
    ...(spec.kaptCode ? [{ label: "단지코드", value: spec.kaptCode }] : []),
  ];

  return (
    <details
      className="group mt-6 border-t border-line pt-1 max-md:mt-3"
      aria-label="데이터 출처와 빈 자료"
      data-complex-facts=""
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
        데이터 출처
        <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="flex flex-col gap-5 pb-3 pt-1 max-md:gap-3">
        {sources.length > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-2">출처</h3>
            <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
              {sources.map((s) => (
                <li key={s} className="t-caption text-text-3">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {extraRows.length > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-2">단지 정보</h3>
            <dl className="mt-1 flex flex-col gap-0.5">
              {extraRows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 t-caption text-text-3">{r.label}</dt>
                  <dd className="min-w-0 break-words text-right t-caption text-text-2 tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* 자료 완성도 — 없는 항목과 **이유**(대장 미연결·신고 없음·조회 실패)를 그대로. "—" 나열 금지. */}
        {(gaps.length > 0 || (!facts.jeonseRatio && facts.jeonseRatioReason)) && (
          <div>
            <h3 className="t-sub font-bold text-text-2">
              비어 있는 자료{" "}
              <span className="font-medium text-text-3 tabular-nums">
                {have.length}/{have.length + missing.length}
              </span>
            </h3>
            <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
              {gaps.map((g) => (
                <li key={g.labels.join("·")} className="t-caption leading-[1.6] text-text-3">
                  <span className="font-bold text-text-2">{g.labels.join(" · ")}</span> · {g.note}
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
              {/* 전세가율을 계산하지 않은 이유 — 위 목록에 행이 없을 때 여기서 말한다 */}
              {!facts.jeonseRatio && facts.jeonseRatioReason && (
                <li className="t-caption leading-[1.6] text-text-3">
                  <span className="font-bold text-text-2">전세가율</span> · 아직 계산하지 않아요 · {facts.jeonseRatioReason}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* G5+G13 — 실데이터 Q&A + FAQPage 스키마(보이는 질문·답과 같은 배열) */}
        {faq.length > 0 && (
          <div>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }} />
            <h3 className="t-sub font-bold text-text-2">자주 묻는 질문</h3>
            <dl className="mt-1 flex flex-col gap-2">
              {faq.map((it) => (
                <div key={it.q}>
                  <dt className="t-sub font-bold text-ink">{it.q}</dt>
                  <dd className="mt-0.5 t-sub text-text-2">{it.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* N17 — 위젯 퍼가기(출처 링크가 박힌 iframe 한 줄). 실거래가 있는 단지만 */}
        {embedId && (
          <EmbedSnippet
            kind="complex"
            id={embedId}
            heading="실거래가 카드 퍼가기"
            desc="iframe 한 줄 · 새 실거래가 신고되면 붙여 둔 카드도 함께 바뀐다"
          />
        )}
      </div>
    </details>
  );
}

export default ComplexFactsCard;
