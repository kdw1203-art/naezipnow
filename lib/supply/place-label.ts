/* [1107] 입주물량 표의 "위치" 칸 — 긴 주소("경기도 안양시 동안구 관양동 521번지 일원 (안양 관양고 주변 도시개발사업 내 A1BL)")를
 * 동(읍·면·리·가) 하나로. 같은 시·군·구 안의 목록이라 시·도 · 구 · 번지는 반복이다(머리에 지역이 이미 있다).
 * 동을 못 찾으면 괄호 · 번지를 뗀 주소 끝 두 낱말 → 그마저 없으면 빈 값(지역 이름으로 대신하지 않는다 — 없는 위치를 지어내지 않는다).
 * 순수 함수 — 단위 시험 대상. */
const DONG_RE = /^[가-힣][가-힣0-9]*(동|읍|면|리|가)$/;
const LOT_RE = /^(산\s?)?\d+(-\d+)?(번지)?$|^일원$|^일대$/;

export function supplyPlaceLabel(address: string | null | undefined): string {
  const raw = String(address ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const tokens = raw.split(" ");
  /* 시 · 군 · 구 뒤에 오는 첫 동 — "광역시" · "특별시" 같은 앞 낱말의 "…동" 오인을 피하려고 구역 낱말 뒤부터 찾는다 */
  let afterDistrict = tokens.findIndex((t) => /(시|군|구)$/.test(t));
  if (afterDistrict < 0) afterDistrict = -1;
  for (let i = afterDistrict + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (DONG_RE.test(t) && !/(시|군|구)$/.test(t)) return t;
  }
  const rest = tokens.filter((t) => !LOT_RE.test(t) && !/(도|시|군|구)$/.test(t));
  return rest.slice(-2).join(" ");
}
