/**
 * H3 — 자체 하우스 광고.
 *
 * 광고 슬롯을 외부 네트워크(AdSense) 없이도 채우기 위한 내부 배너 카탈로그.
 * 외부 계정·키가 필요 없다는 게 요점이라, 여기 문구는 전부 코드에서 확인 가능한
 * 사실만 쓴다. 다음은 금지:
 *  - 하지 않는 행사·할인 (예: "이번 주말 임장 모임", "첫 달 무료")
 *  - 없는 경로로 보내는 CTA (404)
 *  - 수치 주장 (사용자 수·만족도 등) — 셀 수 있는 값이라도 여기 박아두면 곧 낡는다
 *
 * href 는 반드시 실제 라우트여야 한다. 아래 5개는 app/ 아래 page.tsx 존재를 확인함:
 *   /notes/new · /map · /subscription · /town/experts · /town/experts/join
 */

import type { AdPlacement } from "@/lib/ads/adsense-policy";
import { PLAN_FEATURE_MATRIX } from "@/lib/subscriptions/plans";

/** 요금제 비교표(PLAN_FEATURE_MATRIX)의 무료 칸 — 카드가 표와 다른 숫자를 말하지 않게 표에서 읽는다 */
function freeLimitLine(features: readonly string[]): string {
  return features
    .map((f) => {
      const v = PLAN_FEATURE_MATRIX.find((r) => r.feature === f)?.free;
      return v ? `${f} ${v}` : null;
    })
    .filter((x): x is string => x !== null)
    .join(" · ");
}

export type HouseAd = {
  id: string;
  /** 어느 슬롯에 쓸 수 있는지. 비면 전 슬롯 공용. */
  placements?: AdPlacement[];
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  /** 로그인 사용자에게는 의미 없는 문구면 false */
  showWhenSignedIn: boolean;
};

/**
 * 문구 근거
 *  - 임장노트: app/notes/new 존재. 항목별 점수(현장 체크) · 사진 · 메모는 작성 화면의 실제 입력 칸.
 *  - 지도 실거래: 지도 금액은 국토부 실거래가 기준 (C8 가격 표기 범례와 같은 기준).
 *  [1028 · 제안 1] 세 장 모두 사실 한 줄로 — 물음·권유("기억나세요?"·"비교해 보세요")를 걷었다.
 *    카드 머리는 "내집나우 안내 · {eyebrow}" 라 eyebrow 에 "내집나우"를 또 적지 않는다.
 *  - 구독: 요금제 비교표(PLAN_FEATURE_MATRIX)의 무료 칸을 그대로 읽는다(freeLimitLine).
 *    [1028 · 제안 11] 예전 문구 "AI 동네 분석 요약 월 3회"는 틀린 설명이었다 — 그 한도는 실제로 걸리지 않아
 *    [1004]에 비교표에서 빠졌는데(/api/ai/chat 에는 요금제 문이 없고 전 요금제 시간당 10회뿐) 이 카드에만 남아 있었다.
 *  - 전문가: app/town/experts 존재, 상담 신청 → 답변 흐름 구현됨.
 */
export const HOUSE_ADS: HouseAd[] = [
  {
    id: "house_note_start",
    eyebrow: "임장노트",
    title: "다녀온 집 기록",
    body: "항목별 점수 · 사진 · 메모를 단지별로 저장해요.",
    ctaLabel: "임장노트 쓰기",
    href: "/notes/new",
    showWhenSignedIn: true,
  },
  {
    id: "house_map_real_price",
    eyebrow: "지도",
    title: "실거래가 지도",
    body: "지도 금액은 국토교통부 실거래가 평균이에요. 호가는 들어 있지 않아요.",
    ctaLabel: "지도 열기",
    href: "/map",
    showWhenSignedIn: true,
  },
  {
    id: "house_subscription",
    eyebrow: "요금제",
    /* [970 · B-29] /analysis 허브의 "단지 분석 월 2회"(AI 임장노트 자동정리)와 다른 한도라
       어느 기능의 숫자인지 적는다 — 둘 다 PLAN_FEATURE_MATRIX(plans.ts)의 실제 값이다. */
    title: "무료 요금제 한도",
    body: freeLimitLine(["AI 분석 도구", "AI 임장노트 자동정리"]),
    ctaLabel: "요금제 비교",
    href: "/subscription",
    showWhenSignedIn: true,
  },
  /* [992 · A1] house_expert · house_expert_join 배너 제거 — 전문가(/town/experts)는 보관(비노출).
     community_feed · report_free_body 슬롯은 남은 배너(구독 안내 등)로 채워진다. */
];

/**
 * 슬롯에 맞는 하우스 광고 하나를 고른다.
 *
 * 무작위(Math.random)를 쓰지 않는다 — 서버·클라이언트 렌더가 어긋나면
 * hydration 이 깨지고, 스크롤할 때마다 광고가 바뀌면 사용자가 방금 본 걸 못 찾는다.
 * 대신 슬롯 위치(seed)로 결정한다: 같은 자리엔 늘 같은 배너.
 */
export function pickHouseAd(
  placement: AdPlacement,
  seed = 0,
  opts: { signedIn?: boolean } = {},
): HouseAd | null {
  const pool = HOUSE_ADS.filter((ad) => {
    if (ad.placements && !ad.placements.includes(placement)) return false;
    if (!ad.showWhenSignedIn && opts.signedIn) return false;
    return true;
  });
  if (pool.length === 0) return null;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx] ?? null;
}
