import { SignupClient } from "./SignupClient";
import { turnstileSiteKey } from "@/lib/auth/turnstile-site-key";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";

export const dynamic = "force-dynamic";

/* 항목 46b — 가입 화면도 개별 제목 + noindex. */
export const metadata = {
  title: "회원가입 | 내집나우",
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  /* [1080] 캡차 사이트 키는 서버가 읽어 넘긴다 — 키를 넣으면 재배포만으로 켜진다 */
  return <SignupClient social={getConfiguredSocialProviders()} captchaSiteKey={turnstileSiteKey()} />;
}
