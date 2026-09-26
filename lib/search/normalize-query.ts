/**
 * [개선 #31 lite] 검색어 정규화 — 0건 원인 1·2위(띄어쓰기 차이, 통용 약칭)를
 * 쿼리 단계에서 흡수한다.
 *
 * - normalizeSearchQuery: 통용 약칭을 정식 명칭으로 확장(확실한 것만 — 틀린
 *   확장은 0건보다 나쁘다), 꼬리의 "아파트" 제거("래미안아파트"→"래미안").
 *   통합 검색의 매물·노트·이야기·뉴스 그룹이 쓴다(ILIKE 패턴용).
 * - expandComplexAlias: [1008 · S] 단지 검색 전용 — 약칭만 펼치고 '아파트' 꼬리는 **떼지 않는다**.
 *   꼬리는 단지 순위(lib/search/complex-match · search_complexes_preview v2)가 원문 일치를 먼저 본 뒤
 *   다룬다. 먼저 떼면 "공작아파트" 가 "공작" 이 되어 공작@영등포가 공작아파트@안양 동안구(6개월 120건)
 *   위에 섰다(2026-09-21 실측).
 * - ilike 패턴의 공백 처리는 호출부에서 공백→% 로 (이 모듈은 문자열만 다룬다).
 *
 * 순수 함수 모듈 — 서버·클라이언트 겸용이라 server-only 를 두지 않는다.
 */

/** 통용 약칭 → 정식 단지명. 확신 있는 항목만 유지한다(추측 확장 금지). 키는 공백을 뺀 형. */
const COMPLEX_ALIASES: Record<string, string> = {
  마래푸: "마포래미안푸르지오",
  래대팰: "래미안대치팰리스",
  /* [1008 · S] 예전 대상 "잠실주공5단지" 는 실거래 단지명에 없다 — 국토부 표기는 "주공아파트 5단지"
     (서울 송파구 잠실동 27). 그래서 주공5단지@증평군이 1위였다. 동 이름·단지 번호 토큰으로 펼쳐
     토큰 매칭(잠실=주소 · 주공·5=이름)이 잠실동의 그 단지를 고르게 한다(운영 재현 1위 확인). */
  잠실주공: "잠실 주공 5단지",
  잠실주공5단지: "잠실 주공 5단지",
};

/** 약칭이면 정식 명칭, 아니면 공백만 정리한 원문 */
export function expandComplexAlias(raw: string): string {
  const q = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!q) return q;
  return COMPLEX_ALIASES[q.replace(/\s+/g, "")] ?? q;
}

export function normalizeSearchQuery(raw: string): string {
  let q = raw.trim();
  if (!q) return q;

  const compact = q.replace(/\s+/g, "");
  const alias = COMPLEX_ALIASES[compact];
  if (alias) return alias;

  // "○○아파트" → "○○" (단지명 표기가 대부분 "아파트" 없이 저장됨).
  // 두 글자 이하만 남으면 오히려 광범위해지므로 그대로 둔다.
  const noApt = q.replace(/아파트$/u, "").trim();
  if (noApt.length >= 2 && noApt !== q) q = noApt;

  return q;
}
