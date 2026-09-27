import type { Metadata } from "next";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = {
  /* [1012 · 규칙 5] "시작하기"(금지 문구) → 이 화면이 실제로 묻는 것 */
  title: "관심 지역 고르기 | 내집나우",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <WelcomeClient />;
}
