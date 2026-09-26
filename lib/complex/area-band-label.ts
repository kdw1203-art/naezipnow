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

export function areaBandLabelByUnit(label: string, unit: AreaUnit): string {
  if (unit !== "pyeong" || !label.includes("㎡")) return label;
  return label
    .replace(/\d+(?:\.\d+)?/g, (n) => {
      const p = Math.round(m2ToPyeong(Number(n)) * 10) / 10;
      return p.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
    })
    .replace(/㎡/g, "평");
}
