/**
 * [992 · A1] 보관(비노출) 경로 — 단일 출처.
 *
 * "보관" 은 삭제가 아니다: 라우트·데이터·코드는 그대로 두고 **입구만 닫는다** —
 * 내비·홈·카테고리·사이트맵에서 빼고, 응답에 `X-Robots-Tag: noindex, follow` 를 붙인다.
 * 30일 관찰 뒤 삭제 여부를 정한다(docs/proposal-991.md §A1).
 *
 * 왜 보관인가(2026-09-12 실측): 전문가 프로필 0 · 모임 참여 0 · 개발물건 협력업체 0 ·
 * 사람 글 0 · Q&A·자료실 체류 1~3초. 정체성(임장노트 × AI 분석)이 아닌 영역이다.
 *
 * 규칙은 **세그먼트 prefix** 다: "/town/experts" 는 "/town/experts/abc" 를 덮지만
 * "/town/expertsx" 는 덮지 않는다. 미들웨어(엣지)에서도 읽으므로 순수 상수만 둔다.
 */
export const ARCHIVED_PREFIXES: readonly string[] = [
  /* [1047] "/town/experts" · "/my/expert-profile" · "/my/consultations" 보관 해제 — 소유자 지시(2026-10-09)
     "전문가 등록하기 · 전문가 카테고리 · 숨고처럼 전문가 홍보". 받은 문의(/my/leads)·제휴(/partners)·쪽지(/messages)는 그대로 보관. */
  "/town/groups",
  "/town/library",
  "/town/prompt",
  "/qna",
  "/dev-deals",
  "/listings/compare",
  "/notes/market",
  "/notes/templates",
  /* [1000] /my/assets 는 보관이 아니라 삭제 — 예시 숫자만 그리던 목업 화면이었다 */
  "/my/leads",
  "/widget",
  "/partners",
  "/messages",
];

/**
 * [1040 · 운영 경보 seo.indexable_unsubmitted] 보관 화면의 메타 robots.
 * 미들웨어가 응답 머리에 `X-Robots-Tag: noindex, follow` 를 붙이는데, 화면의 <meta name="robots"> 는 `index, follow` 로
 * 남아 있어 두 신호가 어긋났다(검색엔진은 더 엄한 쪽을 따르지만, 색인 점검은 메타만 읽어 "색인 대상인데 사이트맵에 없음"으로
 * 세었다). 보관 화면의 metadata.robots 는 이 상수를 쓴다 — 보관을 풀 때는 ARCHIVED_PREFIXES 에서 빼고 이 줄도 같이 뺀다.
 */
export const ARCHIVED_ROBOTS = { index: false, follow: true } as const;

/** /notes/<id>/deck · /notes/<id>/print — 노트 출력 3종 중 card 만 남긴다 */
const ARCHIVED_PATTERNS: readonly RegExp[] = [/^\/notes\/[^/]+\/(deck|print)(\/|$)/];

export function isArchivedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  for (const prefix of ARCHIVED_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }
  return ARCHIVED_PATTERNS.some((re) => re.test(p));
}
