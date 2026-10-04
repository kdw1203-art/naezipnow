/**
 * [1006 · B] 면적대 라벨("60~85㎡" · "~59㎡" · "135㎡~")을 면적 단위 설정에 맞춰 바꾼다 — 순수, 클라이언트 안전.
 *
 * 왜 라벨을 파싱하나: API(getAreaBands·facts.tradeSummary.band)는 AREA_BANDS 의 ㎡ 라벨만
 * 준다. 서버 렌더를 개인화하지 않는 규칙(lib/prefs/area-unit.ts) 때문에 단위 변환은
 * 클라이언트 몫이고, 경계 숫자를 다시 정의하지 않으려면 라벨 안의 숫자만 바꾸는 게 맞다.
 *   areaBandLabelByUnit("60~85㎡", "pyeong") → "18.1~25.7평"
 *   areaBandLabelByUnit("~59㎡", "pyeong")   → "~17.8평"
 *   areaBandLabelByUnit("60~85㎡", "m2")     → "60~85㎡" (그대로)
 */
import type { AreaUnit } from "@/lib/prefs/ui-prefs";
import { m2ToPyeong } from "@/lib/prefs/area-unit";

/**
 * [1030 · G3] 열린 구간의 화면 이름 — "~59㎡" → "60㎡ 미만", "135㎡~" → "135㎡ 이상".
 * "~59㎡ 평균 6.9억 · 최저 2억 9,600만"이 59㎡ 타입(월 중앙 8~10억)으로 읽혔다(2026-10-04 운영 실측) —
 * 실제는 60㎡ 미만(39㎡ 포함). 지역 화면 평형대 표("60㎡ 미만 (~24평)")와 같은 말로 맞춘다.
 * 데이터 라벨(AREA_BANDS·슬러그·OG 칩·정렬)은 그대로 — 화면에 그릴 때만 바꾼다.
 */
export function areaBandDisplayLabel<T extends string | null | undefined>(label: T): T {
  if (label === "~59㎡") return "60㎡ 미만" as T;
  if (label === "135㎡~") return "135㎡ 이상" as T;
  return label;
}

export function areaBandLabelByUnit(rawLabel: string, unit: AreaUnit): string {
  const label = areaBandDisplayLabel(rawLabel);
  if (unit !== "pyeong" || !label.includes("㎡")) return label;
  return label
    .replace(/\d+(?:\.\d+)?/g, (n) => {
      const p = Math.round(m2ToPyeong(Number(n)) * 10) / 10;
      return p.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
    })
    .replace(/㎡/g, "평");
}
