/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
/**
 * G5+G12+G13 — Q&A 블록 (GEO 표준 컴포넌트).
 *
 * AI 검색엔진은 "질문 + 한 문장 완결 답" 구조를 가장 잘 발췌·인용한다.
 * 규칙:
 *  - 답은 실데이터 수치 + 기준 시점을 포함한 완결 문장이어야 한다 (호출부 책임)
 *  - items 가 비어 있으면 아무것도 렌더하지 않는다 — 데이터 없이 껍데기 금지
 *  - FAQPage JSON-LD 는 화면에 보이는 items 와 같은 배열에서 생성한다
 */
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";

export function QaBlock({ title = "자주 묻는 질문", items }: { title?: string; items: FaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card mb-6 p-[var(--pad-card)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(items)) }}
      />
      <h2 className="t-section font-bold text-ink">{title}</h2>
      <dl className="mt-3 flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.q} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
            <dt className="t-body font-bold text-ink">{it.q}</dt>
            <dd className="mt-1 t-body leading-[1.7] text-text-2">{it.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
