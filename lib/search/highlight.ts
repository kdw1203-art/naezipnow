/**
 * [1008 · S] 검색어 강조 — 단지 이름에서 질의와 맞은 글자만 표시한다(괄호·띄어쓰기를 건너뛰고 맞춘다).
 *
 * 왜: 검색이 이제 "한가람삼성" 으로 한가람(삼성)을, "동탄 롯데캐슬" 로 롯데캐슬@화성 동탄구를 찾는다.
 * 이름 그대로의 부분 문자열 강조(예전 /search 의 indexOf)로는 이런 결과에 아무것도 칠하지 못해
 * "왜 이게 나왔지?" 가 된다. 정규화한 글자열에서 찾고 원래 글자 자리에 되돌려 칠한다.
 *   1) 질의 전체(한글·영숫자만) → 2) 못 찾으면 토큰마다('아파트'·'N단지' 꼬리 뗌) 첫 자리.
 *
 * 클라이언트 번들에 실린다(단지 선택기·헤더·홈·지도·/search) — 작게 유지할 것. 브랜드 표기 펼침
 * (이편한세상↔e편한세상)은 서버 순위(lib/search/complex-match)의 몫이라 여기엔 없다 — 못 찾으면 안 칠할 뿐이다.
 */
export type HighlightPart = { text: string; hit: boolean };

const KEEP = /[0-9a-z가-힣]/;

export function highlightParts(text: string, query: string): HighlightPart[] {
  const src = text ?? "";
  const map: number[] = [];
  let norm = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i].toLowerCase();
    if (KEEP.test(c)) {
      norm += c;
      map.push(i);
    }
  }
  const hit = new Array<boolean>(src.length).fill(false);
  const mark = (needle: string): boolean => {
    const at = needle ? norm.indexOf(needle) : -1;
    if (at < 0) return false;
    for (let k = at; k < at + needle.length; k++) hit[map[k]] = true;
    return true;
  };
  const q = (query ?? "").toLowerCase();
  if (!mark(q.replace(/[^0-9a-z가-힣]/g, ""))) {
    for (const t0 of q.replace(/([^0-9])([0-9])/g, "$1 $2").split(/[^0-9a-z가-힣]+/)) {
      const t = t0.replace(/^([0-9]+)단지$/, "$1").replace(/(.{2,})아파트$/, "$1");
      if (t && t !== "아파트") mark(t);
    }
  }
  const parts: HighlightPart[] = [];
  for (let i = 0; i < src.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[i]) last.text += src[i];
    else parts.push({ text: src[i], hit: hit[i] });
  }
  return parts;
}
