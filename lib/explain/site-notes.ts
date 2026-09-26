/**
 * [1009] 사이트 공통 읽는 법 — 용어사전(lib/seo/glossary-terms.ts)에 없는, **이 사이트가 정한 표기 규칙**의 설명.
 * 규칙 자체가 코드(lib/format/delta.ts)에 있으므로 문장이 코드와 어긋날 수 없게 같은 상수를 쓴다.
 * 화면마다 다른 계산("이 차트는 월평균")은 여기 넣지 않는다 — 그 화면이 <Explain how=…> 로 직접 적는다.
 */
import { FLAT_PCT } from "@/lib/format/delta";

export type SiteNote = { title: string; body: string[] };

export const SITE_NOTES = {
  delta: {
    title: "올랐다·내렸다 표시 읽는 법",
    body: [
      "▲ 빨간색은 올랐다는 뜻, ▼ 파란색은 내렸다는 뜻이에요. 증권·부동산 앱과 같은 관례예요.",
      "변동률 = (지금 값 − 비교 기준 값) ÷ 비교 기준 값 × 100. 비교 기준(지난달·1년 전 등)은 숫자 옆에 함께 적어요.",
      `±${FLAT_PCT}% 미만의 변화는 '보합'(거의 그대로)으로 적어요. 값을 알 수 없으면 '변동 미상'이라 적고, 숫자를 지어내지 않아요.`,
    ],
  },
} as const satisfies Record<string, SiteNote>;

export type SiteNoteKey = keyof typeof SITE_NOTES;
