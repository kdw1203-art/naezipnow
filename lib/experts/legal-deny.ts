/**
 * [1052] 법률 서비스 직업군 차단(LEGAL_DENY) — 서버 라우트가 같이 읽는 순수 모듈.
 *
 * 정책 경계(변경 금지): 법률 서비스는 토스페이먼츠 상점 심사 정책상 유료 입점 불가라 2026-08-12 에 제거됐고,
 * 소유자 선택(2026-10-09)으로 계속 받지 않는다. 분류 체계(lib/experts/taxonomy)에 그 유형이 없어서
 * 화면 양식으로는 고를 수 없지만, 서버는 화면을 믿지 않는다 — 등록(/api/experts/register) ·
 * 프로필 수정(PATCH /api/experts/[id]) · 관리자 생성(POST /api/experts)이 이 목록으로 한 번 더 막는다.
 * 자유 입력(직함 · 전문 분야 · 상호)에 들어와 유형처럼 읽히는 길도 같이 막는다.
 *
 * 이 파일은 등록 양식(ApplyForm)에서 부르지 않는다 — 양식 소스에는 이 낱말이 없어야 한다
 * (scripts/check-toss-review-freeze.mjs).
 */

export const LEGAL_DENY: readonly string[] = ["변호사", "법무사", "법무법인", "법률사무소", "lawyer", "attorney"];

/** 사용자에게 보이는 거절 문구 — 낱말 자체는 화면에 다시 적지 않는다 */
export const LEGAL_DENY_MESSAGE = "법률 서비스 직업군은 정책상 받지 않음";

function squash(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 문자열 하나가 법률 서비스 유형·명칭을 담고 있는가 */
export function isLegalServiceText(v: unknown): boolean {
  const s = squash(v);
  if (!s) return false;
  return LEGAL_DENY.some((w) => s.includes(w.toLowerCase()));
}

/** 여러 칸(문자열 · 문자열 배열) 중 하나라도 걸리면 true */
export function hasLegalServiceText(...values: unknown[]): boolean {
  for (const v of values) {
    if (Array.isArray(v)) {
      if (v.some((x) => isLegalServiceText(x))) return true;
    } else if (isLegalServiceText(v)) {
      return true;
    }
  }
  return false;
}
