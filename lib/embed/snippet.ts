/* [992 · A1] 시세 위젯 iframe 한 줄 — 순수 함수(서버·클라이언트·테스트 공용).
   위젯 본체는 app/embed/complex/[id] · app/embed/region/[id]. 옛 생성기 화면(/widget, 보관)의
   snippetFor() 와 같은 형식이다 — 이미 블로그에 붙은 코드와 모양이 달라지지 않게. */

export const EMBED_SITE = "https://naezipnow.com";

export type EmbedKind = "complex" | "region";

export function embedSrc(kind: EmbedKind, id: string): string {
  return `${EMBED_SITE}/embed/${kind}/${encodeURIComponent(id)}`;
}

export function embedSnippet(kind: EmbedKind, id: string, height = 260): string {
  const title = kind === "region" ? "내집나우 지역 시세 위젯" : "내집나우 실거래 시세 위젯";
  return `<iframe src="${embedSrc(kind, id)}" width="100%" height="${height}" style="border:0;max-width:400px" loading="lazy" title="${title}"></iframe>`;
}
