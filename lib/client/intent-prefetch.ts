/**
 * [1088 · 비용] 링크 미리 받기 규칙(순수) — app/components/IntentLink 가 쓴다.
 * 같은 사이트 경로("/…")만 미리 받는다. 바깥 주소("https://…" · "//…") · mailto · tel · 해시만("#…") · 상대 경로("?tab=")는
 * 받지 않는다(next/link 도 바깥 주소는 원래 받지 않는다 · 나머지는 쓸 일이 없다).
 */
export function intentPrefetchHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}
