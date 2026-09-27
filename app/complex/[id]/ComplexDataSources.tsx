import Link from "next/link";
import type { ComplexFacts } from "@/lib/complex/complex-facts";
import { complexInfoCells, type ComplexInfoFacts } from "@/lib/complex/info-cells";
import { embedSnippet } from "@/lib/embed/snippet";
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { MarketFreshnessLine } from "@/app/components/MarketFreshnessLine";

/* ============================================================
   [v4 · 규칙 3] 단지 허브 맨 끝 — `<details>` "데이터 출처" 하나.

   예전엔 같은 성격의 글이 화면 곳곳에 따로 있었다: 단지 정보 카드(격자 + 출처 줄) · 전세가율·자료 완성도 카드
   (10개 항목 칩 + 빠진 이유 목록) · 인용 요약 카드("국토교통부 실거래 단순 평균이에요 …") · 신선도 캡션 · Q&A 카드 ·
   "이 단지 실거래가를 블로그에 붙이기" 카드 · 섹션마다의 출처 문장. 사실(값)은 머리 사실 줄·요약 목록으로 올리고,
   **출처·기준·빠진 이유·방법**은 여기 한 곳에 접어 둔다. 서버 조각(JS 없음).

   접혀 있어도 HTML 에는 있다 — 인용 요약(data-ai-summary · WebPage speakable 이 가리키는 자리)·FAQPage JSON-LD 의
   질문·답은 펼치면 보이는 본문이라 구조화 데이터 규칙(보이는 내용과 일치)을 지킨다.

   "빈 상자" 조사(v4 브리프 9): 예전 모바일 캡처의 ≈450px 흰 상자는 EmbedSnippet 카드였다 — 루트에 `cv-auto`
   (content-visibility:auto · contain-intrinsic-size 420px)가 걸려 화면 밖일 때 내용 없이 420px + 패딩 + 테두리로
   그려졌고, 그 위 ≈500px 빈 띠는 같은 규칙의 ComplexNotesNewsAi(테두리 없음)였다. 퍼가기 코드는 실거래가 있는
   단지에만(없는 단지의 위젯은 보여 줄 숫자가 없다) 여기 안으로 옮겼고, 이 화면의 섹션에서는 cv-auto 를 뗐다.
   ============================================================ */

/** 머리 사실 줄에 이미 있는 칸(세대수·준공)은 되풀이하지 않는다 */
const HEAD_LABELS = new Set(["세대수", "준공"]);

/* FACT_LABELS 의 화면용 짧은 이름(예전 ComplexFactsCard 와 같은 표) */
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
function groupGaps(missing: ComplexFacts["completeness"]["missing"]): Array<{ labels: string[]; note: string }> {
  const out: Array<{ labels: string[]; note: string }> = [];
  for (const g of missing) {
    const label = FACT_LABEL[g.key] ?? g.label;
    const same = out.find((o) => o.note === g.note);
    if (same) same.labels.push(label);
    else out.push({ labels: [label], note: g.note });
  }
  return out;
}

export function ComplexDataSources({
  complexId,
  spec,
  nowYear,
  facts,
  citable,
  freshness,
  faq,
  hasTrades,
  sources,
}: {
  complexId: string;
  spec: ComplexInfoFacts;
  nowYear: number;
  facts: ComplexFacts;
  /** 인용 요약 문단(lib/seo/citable-summary) — 실거래가 없거나 조회 실패면 null(섹션 없음) */
  citable: string | null;
  /** 실거래 마지막 반영일("YYYY.MM.DD") — 없으면 줄을 그리지 않는다 */
  freshness: string | null;
  faq: FaqItem[];
  /** 매매 실거래가 한 건이라도 있는가 — 퍼가기 위젯은 그때만 */
  hasTrades: boolean;
  /** 이 화면이 실제로 보여 준 자료의 원천(중복 없이) */
  sources: string[];
}) {
  const cells = complexInfoCells(spec, nowYear).filter((c) => !HEAD_LABELS.has(c.label));
  const road = spec.roadAddress?.trim() || null;
  const jibun = spec.address?.trim() || null;
  /* 머리 사실 줄은 도로명(없으면 지번)을 쓴다 — 여기는 나머지 하나와 단지코드 */
  const infoRows: Array<{ label: string; value: string }> = [
    ...cells.map((c) => ({ label: c.label, value: c.sub ? `${c.value} · ${c.sub}` : c.value })),
    ...(road && jibun && road !== jibun ? [{ label: "지번 주소", value: jibun }] : []),
    ...(spec.kaptCode ? [{ label: "단지코드", value: spec.kaptCode }] : []),
  ];
  const gaps = groupGaps(facts.completeness.missing);
  const code = hasTrades ? embedSnippet("complex", complexId) : null;
  /* 경로를 리터럴로 적는다 — route-links 게이트가 정적 세그먼트로 대조할 수 있게(EmbedSnippet 과 같은 이유) */
  const previewHref = `/embed/complex/${encodeURIComponent(complexId)}`;

  return (
    <details className="group border-t border-line pt-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
        데이터 출처
        <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="flex flex-col gap-5 pb-3 pt-1">
        {/* 출처 — 이 화면이 보여 준 자료만 */}
        <div>
          <h3 className="t-sub font-bold text-text-2">출처</h3>
          <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
            {sources.map((s) => (
              <li key={s} className="t-caption text-text-3">
                {s}
              </li>
            ))}
          </ul>
          {/* [1007 · P2] 지역 허브와 같은 조각 — "실거래 마지막 반영 YYYY-MM-DD · 신고 지연 최대 30일 · 국토교통부" */}
          <MarketFreshnessLine label={freshness} className="mt-0.5" />
        </div>

        {/* [1006 · E] 인용 가능한 요약(GEO) — WebPage JSON-LD speakable.cssSelector 가 가리키는 자리 */}
        {citable && (
          <section data-ai-summary="" id="ai-summary" aria-label="실거래 요약 문장">
            <h3 className="t-sub font-bold text-text-2">요약 문장</h3>
            <p className="mt-1 t-sub text-text-2">{citable}</p>
            <p className="mt-0.5 t-caption text-text-3">
              국토교통부 실거래 단순 평균 · 매물 호가 아님 · 최근 1~2개월은 신고 지연(계약 후 30일)으로 늘 수 있음
            </p>
          </section>
        )}

        {infoRows.length > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-2">단지 정보</h3>
            <dl data-tone="hanji" className="mt-1 divide-y divide-line">
              {infoRows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="shrink-0 t-sub text-text-3">{r.label}</dt>
                  <dd className="min-w-0 break-words text-right t-sub text-ink tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* 자료 완성도 — 없는 항목과 **이유**(대장 미연결·신고 없음·조회 실패)를 그대로. "—" 나열 금지. */}
        {gaps.length > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-2">
              비어 있는 자료{" "}
              <span className="font-medium text-text-3 tabular-nums">
                {facts.completeness.have.length}/{facts.completeness.have.length + facts.completeness.missing.length}
              </span>
            </h3>
            <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
              {gaps.map((g) => (
                <li key={g.labels.join("·")} className="t-caption leading-[1.6] text-text-3">
                  <span className="font-bold text-text-2">{g.labels.join(" · ")}</span> — {g.note}
                </li>
              ))}
            </ul>
            {/* 전세가율을 계산하지 않은 이유 — 요약 목록에 행이 없을 때 여기서 말한다 */}
            {!facts.jeonseRatio && facts.jeonseRatioReason && (
              <p className="mt-0.5 t-caption text-text-3">
                <span className="font-bold text-text-2">전세가율</span> — 아직 계산하지 않아요 · {facts.jeonseRatioReason}
              </p>
            )}
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
        {code && (
          <div>
            <h3 className="t-sub font-bold text-text-2">이 단지 실거래가 블로그에 붙이기</h3>
            <pre
              className="mt-1 max-w-full overflow-x-auto rounded-lg bg-surface px-3 py-2.5 text-[12px] leading-[1.6] text-text-1 [user-select:all]"
              tabIndex={0}
              aria-label="위젯 삽입 코드"
            >
              <code>{code}</code>
            </pre>
            <Link
              href={previewHref}
              target="_blank"
              rel="noopener"
              className="mt-0.5 inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline"
            >
              위젯 미리보기 ›
            </Link>
          </div>
        )}
      </div>
    </details>
  );
}

export default ComplexDataSources;
