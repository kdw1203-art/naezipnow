/* [1133 · 사칭 금지어] 소유자 2026-11-10 "금지어 admin, naezipnow 등 키워드" — 이름 · 핸들에 운영자 · 서비스 이름을 쓰지 못하게.
   가입 이름 · 이름 변경 · 핸들 세 곳이 같은 규칙을 쓴다(순수 함수 · 테스트 대상). 관리자 계정은 부르는 쪽에서 면제한다.
   판정은 "들어 있나"다 — 대소문자 · 공백 · 기호 · 전각 문자를 걷어 낸 뒤 본다("A d m i n", "naezip-now", "ＡＤＭＩＮ" 도 걸린다). */

export const RESERVED_NAME_KEYWORDS: readonly string[] = [
  "admin",
  "administrator",
  "naezipnow",
  "naezip",
  "nuguzip",
  "official",
  "staff",
  "moderator",
  "support",
  "system",
  "내집나우",
  "누구집",
  "관리자",
  "운영자",
  "운영진",
  "운영팀",
  "공식",
  "고객센터",
  "시스템",
];

/** 견줄 꼴 — NFKC(전각 → 반각) · 소문자 · 글자와 숫자만 */
export function normalizeNameForCheck(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

/** 걸린 금지어(없으면 null) */
export function reservedKeywordIn(raw: string | null | undefined): string | null {
  const n = normalizeNameForCheck(raw);
  if (!n) return null;
  return RESERVED_NAME_KEYWORDS.find((k) => n.includes(k)) ?? null;
}

export function isReservedName(raw: string | null | undefined): boolean {
  return reservedKeywordIn(raw) !== null;
}

export const RESERVED_NAME_ERROR = "쓸 수 없는 이름 · 운영자 · 서비스 이름이 들어 있음";
