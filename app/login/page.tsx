import { LoginClient } from "./LoginClient";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";

/**
 * [1007] 정적 페이지로 전환 — 하루 796회(24h 실측) 서버리스 함수 호출 중 사람 방문은
 * 한 자릿수였다(7일 페이지뷰 ~120건 전체). 나머지는 크롤러가 `/login?callbackUrl=…` 을
 * 페이지마다 따라 들어온 것이다. 이 화면이 요청마다 렌더되던 유일한 이유는 아래
 * `getConfiguredSocialProviders()` 를 "요청 시점 env" 로 읽으려던 예전 판단이었는데,
 * Vercel 은 환경변수를 **배포 단위**로 굳힌다 — env 를 바꾸면 어차피 재배포해야 함수도
 * 새 값을 본다. 즉 빌드 시점 판정과 요청 시점 판정은 같은 배포 안에서 항상 같다.
 * `?callbackUrl=`·`?error=` 는 LoginClient 가 마운트 뒤 window.location 에서 읽는다
 * (원래부터 그랬다 — 서버는 searchParams 를 읽지 않았다).
 */
export const dynamic = "force-static";

/* 항목 46b — 로그인 화면은 개별 제목 + noindex (계정 흐름은 색인 대상이 아니다). */
export const metadata = {
  title: "로그인 | 내집나우",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginClient social={getConfiguredSocialProviders()} />;
}
