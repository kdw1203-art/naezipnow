/**
 * [1206] XML 글자 참조 풀기 — 공공데이터 XML 을 정규식으로 읽는 곳(molit-api · buildhub-api · seoul openapi-client)이
 * `&amp;` 를 그대로 저장했다. 2026-11-10(새 DB) 이후 실거래 1,839행의 단지명이 "철산역롯데캐슬&amp;SKVIEW클래스티지"
 * 처럼 들어가 검색·단지 화면에서 같은 단지를 못 찾았다. 순수 함수 — 서버·테스트 겸용.
 */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(s: string): string {
  if (!s || s.indexOf("&") < 0) return s;
  /* 한 번만 푼다 — "&amp;lt;" 는 "&lt;" 로 남는다(원천이 실제로 그렇게 보낸 글자다) */
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent] ?? m;
  });
}

/** 풀린 이름을 원천 XML 표기로 되돌린다 — 실거래 external_key(sha1)가 수정 전 행과 같은 값을 내게(중복 적재 방지) */
export function encodeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
