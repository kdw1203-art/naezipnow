/* [1012 · 규칙 1] 본문 카드 반경 12 → 8px(카드 눈금) */
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * [970 · C-40] 비로그인 안내 카드 — 한 벌.
 *
 * 왜: 마이·포인트 지갑·알림·전문가 프로필·AI 에이전트가 제각각 다섯 모양의
 * "로그인이 필요해요"를 그렸다(네이비 AI 패널 / 흰 카드 / 문장만 / h1 없음 / 가입
 * 링크 없음). 같은 상황이면 같은 얼굴이어야 한다. 제목은 그 화면의 h1 이 된다
 * (게스트 뷰에 h1 이 0개이던 /my·/my/points·/my/expert-profile — C-26 의 h1 몫).
 *
 * 서버·클라이언트 어디서든 렌더된다(훅·브라우저 API 없음). 돌아올 경로는 호출부가
 * pathname 으로 넘긴다 — usePathname 을 여기서 부르면 서버 컴포넌트에서 못 쓴다.
 */
export function GuestGate({
  title,
  desc,
  pathname,
  as: Heading = "h1",
  children,
  className = "",
}: {
  /** 화면 제목 — 기본 h1. 이미 h1 이 있는 화면(알림·에이전트)은 as="h2" */
  title: string;
  desc: string;
  /** 로그인·가입 뒤 돌아올 경로(쿼리 포함 가능) */
  pathname: string;
  as?: "h1" | "h2";
  /** 카드 아래에 이어 붙일 내용(둘러보기 링크 등) */
  children?: ReactNode;
  className?: string;
}) {
  const cb = encodeURIComponent(pathname || "/");
  return (
    /* [v4 · 규칙 7·10] 가운데 정렬 + 자물쇠 아이콘 원 → 왼쪽 정렬 머리(제목 한 줄 + 사실 한 줄) + 버튼 줄.
       채움 파랑은 "로그인" 하나, 가입은 외곽선 */
    <div className={`mx-auto flex w-full max-w-[760px] flex-col gap-3 ${className}`.trim()}>
      <section aria-labelledby="guest-gate-title" className="rise-in flex flex-col gap-2 py-2">
        <Heading id="guest-gate-title" className="t-title text-ink">
          {title}
        </Heading>
        <p className="t-sub text-text-3">{desc}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Link
            href={`/login?callbackUrl=${cb}`}
            className="btn-primary min-h-10 rounded-lg px-5 py-2.5 t-body no-underline"
          >
            로그인
          </Link>
          <Link
            href={`/signup?callbackUrl=${cb}`}
            className="btn-outline min-h-10 rounded-lg px-5 py-2.5 t-body no-underline"
          >
            회원가입
          </Link>
        </div>
      </section>
      {children}
    </div>
  );
}

export default GuestGate;
