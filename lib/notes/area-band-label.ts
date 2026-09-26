/**
 * [1006] 면적 구간 라벨 두 벌 — "60~85㎡" 와 "18~26평". 순수 함수.
 *
 * 상세 판단 카드의 대표 실거래가 아래 "60~85㎡ · 기준 2026.08 · 국토부"는 서버가 그린다.
 * 설정(면적 단위, lib/prefs/area-unit — 쿠키)은 클라이언트에서만 읽기로 했으므로(서버
 * 렌더를 개인화하지 않는다) 서버는 두 표기를 **모두** 만들어 넘기고, 작은 클라이언트
 * 섬(app/notes/[id]/AreaBandText)이 쿠키를 보고 하나를 고른다.
 *
 * 구간 경계는 lib/market/bands(단일 진실 공급원)에서 읽는다 — 라벨 문자열을 파싱하지 않는다.
 * 평 경계는 ㎡ 경계를 환산해 정수로 내림/올림 — "~59㎡" → "~18평", "135㎡~" → "41평~".
 */
import { findAreaBand } from "@/lib/market/bands";
import { m2ToPyeong } from "@/lib/prefs/area-unit";

export type AreaBandLabels = { m2: string; pyeong: string };

export function areaBandLabels(bandSlug: string, fallbackLabel: string): AreaBandLabels {
  const band = findAreaBand(bandSlug);
  if (!band) return { m2: fallbackLabel, pyeong: fallbackLabel };
  const lo = band.min > 0 ? Math.round(m2ToPyeong(band.min)) : null;
  const hi = Number.isFinite(band.max) ? Math.round(m2ToPyeong(band.max)) : null;
  let pyeong: string;
  if (lo == null && hi != null) pyeong = `~${hi - 1}평`;
  else if (lo != null && hi == null) pyeong = `${lo}평~`;
  else if (lo != null && hi != null) pyeong = `${lo}~${hi}평`;
  else pyeong = fallbackLabel;
  return { m2: band.label, pyeong };
}
