/* [1062 · 글 줄이기] 접힌 FAQ — 질문 한 줄 + 핵심 낱말 칩, 답은 눌러야 펼쳐진다.
 *
 * 왜: 소유자 지시 "글씨가 많이 나온 페이지들을 표·요약·키워드 형식으로 심플하게"(10-12 · 요금제 FAQ 캡처).
 * 글은 지우지 않는다 — 답은 DOM 에 그대로(JSON-LD · 검색 발췌 · 심사 문구 유지) 접어 둘 뿐이다. JS 없음(native details).
 * 칩(keys)은 호출부가 답에서 뽑은 사실 낱말이다 — 답에 없는 말을 칩에 쓰지 않는다. 폰: summary 40px 탭 면(.faq-compact, globals.css). */
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";

export type FaqCompactItem = FaqItem & {
  /** 답의 핵심 낱말 2~4개 — 접힌 상태에서 답을 대신 보여 준다 */
  keys?: string[];
};

export function FaqCompact({
  title = "자주 묻는 질문",
  items,
  jsonLd = true,
  className = "",
  headingLevel = 2,
}: {
  title?: string;
  items: FaqCompactItem[];
  /** FAQPage JSON-LD 를 여기서 낼지(화면에 보이는 배열 그대로). 호출부가 따로 내면 false */
  jsonLd?: boolean;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  if (items.length === 0) return null;
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={`card p-[var(--pad-card)] ${className}`} aria-label={title}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(items.map(({ q, a }) => ({ q, a })))) }}
        />
      )}
      <H className="t-section font-bold text-ink">{title}</H>
      <ul className="m-0 mt-2 flex list-none flex-col divide-y divide-line p-0">
        {items.map((it) => (
          <li key={it.q}>
            <details className="faq-compact">
              <summary className="t-body font-bold text-ink">
                <span className="min-w-0 flex-1">{it.q}</span>
                {it.keys && it.keys.length > 0 && (
                  <span className="faq-keys flex flex-wrap gap-1" aria-label="핵심">
                    {it.keys.slice(0, 4).map((k) => (
                      <span key={k} className="rounded-full border border-line bg-bg px-2 py-0.5 t-caption font-medium text-text-2">
                        {k}
                      </span>
                    ))}
                  </span>
                )}
              </summary>
              <p className="measure m-0 pb-3 t-sub leading-[1.7] text-text-2">{it.a}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
