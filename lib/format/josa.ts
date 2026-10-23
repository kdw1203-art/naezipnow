/**
 * [1084] 조사 붙이기 — "도곡렉슬이(가) 411건으로"처럼 템플릿 그대로 나가던 자리(운영 실측: 임장 가이드 Q&A · 월간 리포트 Q&A 등 6곳).
 * 마지막 글자의 받침으로 고른다. 한글이 아니면 숫자·영문 글자 이름의 받침으로(0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 · L 엘 · M 엠 · N 엔 · R 알).
 * 끝의 괄호·따옴표·공백은 건너뛰고 본다("리센츠(잠실)" → "잠실" 아니라 ")" 앞 글자). 판단할 글자가 없으면 받침 없음으로 본다.
 */
export type JosaPair = "이/가" | "을/를" | "은/는" | "와/과" | "으로/로" | "이라/라";

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** ㄹ 받침(종성 인덱스 8) — "으로/로"는 ㄹ 받침에 "로" */
const JONG_RIEUL = 8;

const DIGIT_JONG: Record<string, number> = { "0": 21, "1": 8, "2": 0, "3": 16, "4": 0, "5": 0, "6": 1, "7": 8, "8": 8, "9": 0 };
const LATIN_JONG: Record<string, number> = { l: 8, m: 16, n: 4, r: 8 };

/** 마지막 의미 글자의 종성 인덱스(0 = 받침 없음) */
export function finalJong(word: string): number {
  const s = word.trim();
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_FIRST && code <= HANGUL_LAST) return (code - HANGUL_FIRST) % 28;
    if (ch in DIGIT_JONG) return DIGIT_JONG[ch];
    const lower = ch.toLowerCase();
    if (lower >= "a" && lower <= "z") return LATIN_JONG[lower] ?? 0;
    /* 괄호·따옴표·마침표·공백 등은 건너뛴다 */
  }
  return 0;
}

export function josa(word: string, pair: JosaPair): string {
  const jong = finalJong(word);
  const has = jong !== 0;
  switch (pair) {
    case "이/가":
      return has ? "이" : "가";
    case "을/를":
      return has ? "을" : "를";
    case "은/는":
      return has ? "은" : "는";
    case "와/과":
      return has ? "과" : "와";
    case "으로/로":
      return has && jong !== JONG_RIEUL ? "으로" : "로";
    case "이라/라":
      return has ? "이라" : "라";
  }
}

/** 단어 + 조사 */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
