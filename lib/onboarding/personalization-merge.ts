/**
 * [1058] 온보딩 개인화 **부분 갱신** 규칙 — 순수 함수(node:test 대상). `server-only` 없음.
 *
 * 왜: /welcome 은 가입 뒤 한 번만 쓰는 화면이 아니다 — 홈 미니맵의 "관심지역 수정"·참여 카드가 같은 화면으로 보낸다.
 * 그 화면은 `{ regions, budget: null, purpose: null, persona: null, profile: {} }` 를 POST 하고,
 * 저장소는 그 본문으로 jsonb 전체를 **덮어썼다** — 설정에서 고른 예산·목적·페르소나·기본 정보가 관심 지역을
 * 고칠 때마다 지워졌다. 요청에 **있고 null 이 아닌** 키만 바꾼다. 나머지는 지금 값 그대로.
 */
import type { OnboardingPersonalization } from "@/lib/onboarding/personalization";

/** 키마다 `null`·`undefined` = 손대지 않음. 값이 있으면 그 값으로(이미 검증·정규화된 값이어야 한다) */
export type PersonalizationPatch = {
  [K in Exclude<keyof OnboardingPersonalization, "updatedAt">]?: OnboardingPersonalization[K] | null;
};

export const EMPTY_PERSONALIZATION: OnboardingPersonalization = {
  regions: [],
  budget: null,
  purpose: null,
  persona: null,
  profile: null,
  updatedAt: null,
};

/** 지금 값(없으면 빈 값) 위에 patch 의 non-null 키만 얹는다. updatedAt 은 호출부가 준 시각. */
export function mergePersonalization(
  existing: OnboardingPersonalization | null | undefined,
  patch: PersonalizationPatch,
  updatedAt: string,
): OnboardingPersonalization {
  const base = existing ?? EMPTY_PERSONALIZATION;
  return {
    regions: patch.regions != null ? patch.regions : base.regions,
    budget: patch.budget != null ? patch.budget : base.budget,
    purpose: patch.purpose != null ? patch.purpose : base.purpose,
    persona: patch.persona != null ? patch.persona : base.persona,
    profile: patch.profile != null ? patch.profile : base.profile,
    updatedAt,
  };
}
