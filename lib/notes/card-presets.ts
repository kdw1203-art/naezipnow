/**
 * 임장노트 공유 카드 — **완성본 3종**.
 *
 * ── 왜 (소유자 지시, 2026-09-09) ───────────────────────────────────────────
 * "개인 사용자가 임장노트에 따른 이미지 파일을 제공할 때 2~3가지 버전으로 제공하는
 *  디자인 양식이 있으면 좋겠다."
 *
 * 지금 카드 스튜디오(app/notes/[id]/card)는 **테마 10종 × 장 13종을 사용자가 직접
 * 조합하는 빌더**다. 조합이 130가지라 고르는 것 자체가 일이고, 실제로 만들어진 카드는
 * 0건이다. 요청은 "빌더"가 아니라 "완성본 몇 벌"이다.
 *
 * 그래서 **성격이 뚜렷한 세 벌**을 미리 짜 둔다. 사용자는 셋 중 하나를 고르고 끝내거나,
 * 원하면 지금처럼 직접 조합할 수 있다(빌더는 없애지 않는다 — 이미 만든 것을 버리지 않는다).
 *
 * ── 세 벌을 고른 기준 ──────────────────────────────────────────────────────
 * 사람이 임장 결과를 남에게 보낼 때 하는 말은 대체로 셋 중 하나다:
 *   ① "가서 이랬어"      → 현장 그대로 (본 것·느낀 것)
 *   ② "결론만 말하면"     → 한 장 요약 (점수·판정)
 *   ③ "숫자로 보면"       → 데이터로 보기 (시세·전세가율 등 관련 정보)
 *
 * ③ 은 노트 밖의 값(실거래·전세가율)을 함께 얹는다 — 소유자 지시의
 * "기타 관련 정보를 추가로 넣어서" 에 해당한다. 다만 **없으면 안 넣는다**:
 * 값이 없는 카드에 숫자를 지어내면 그 카드가 곧 거짓말이 된다.
 */

import type { CardConfig } from "@/lib/notes/card-config";

export type CardPresetId = "field" | "digest" | "figures";

export type CardPreset = {
  id: CardPresetId;
  /** 고를 때 보이는 이름 */
  label: string;
  /** 이 카드가 하는 말 — 한 줄 */
  premise: string;
  themeId: string;
  /** 장 순서 — card-frames 의 id. 재료가 없는 장은 렌더 단계에서 자동으로 빠진다. */
  frameIds: string[];
  /**
   * 노트 밖의 값을 얹는가. true 면 시세·전세가율 장을 붙일 수 있다.
   * 값이 없으면 그 장은 빠진다 — 빈 숫자를 그리지 않는다.
   */
  withMarket: boolean;
};

export const CARD_PRESETS: readonly CardPreset[] = [
  {
    id: "field",
    label: "현장 그대로",
    premise: "가서 본 것과 느낀 것을 순서대로",
    /* 종이 계열 — 현장 기록은 밝은 바탕이 어울린다(분석 화면의 네이비와 일부러 다르게) */
    themeId: "sand",
    frameIds: ["cover", "visit-context", "checklist", "pros", "cons", "cta"],
    withMarket: false,
  },
  {
    id: "digest",
    label: "한 장 요약",
    premise: "결론과 점수만 빠르게",
    /* 브랜드 네이비 — 남에게 보낼 때 가장 무난하다 */
    themeId: "midnight",
    frameIds: ["cover", "score-ring", "summary", "verdict", "cta"],
    withMarket: false,
  },
  {
    id: "figures",
    label: "데이터로 보기",
    premise: "내 기록 옆에 실거래 숫자를 나란히",
    themeId: "ocean",
    frameIds: ["cover", "score-bars", "market", "tags", "cta"],
    withMarket: true,
  },
];

const BY_ID = new Map(CARD_PRESETS.map((p) => [p.id, p]));

export function getCardPreset(id: string): CardPreset | null {
  return BY_ID.get(id as CardPresetId) ?? null;
}

export function isCardPresetId(v: string): v is CardPresetId {
  return BY_ID.has(v as CardPresetId);
}

/** 프리셋 → 스튜디오가 쓰는 설정. 고른 뒤에도 직접 손볼 수 있게 같은 형태로 준다. */
export function presetToConfig(preset: CardPreset): CardConfig {
  return { themeId: preset.themeId, frameIds: [...preset.frameIds] };
}

/**
 * 내보낼 이미지 크기 — 4:5.
 *
 * 카카오톡·인스타그램에서 세로 4:5 가 잘리지 않고 가장 크게 보인다(1:1 보다 면적이
 * 넓고, 9:16 은 피드에서 잘린다). OG 링크 미리보기(1200×630)와는 쓰임이 달라
 * 크기를 따로 둔다 — 그쪽은 app/api/og/note 가 계속 담당한다.
 */
export const CARD_IMAGE_SIZE = { width: 1080, height: 1350 } as const;
