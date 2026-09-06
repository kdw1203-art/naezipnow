import { Header } from "./Header";
import { TabBar } from "./TabBar";
import { Footer } from "./Footer";

/** 공통 페이지 셸 — 글래스 헤더 + 본문 컨테이너 + 공통 푸터 + 모바일 탭바 */
export function PageShell({
  children,
  title,
  breadcrumb,
  wide = false,
}: {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: string;
  wide?: boolean;
}) {
  return (
    <>
      <Header />
      {/* 모바일 화면 패딩 14px — 2026-08-03 2차 축소(요소 ~90%·글자 유지) */}
      {/* data-autotrim — 내용이 없어진 블록이 자리를 차지하지 않게 한다.
          규칙은 globals.css 3.5 절. */}
      {/* [970 · A-29] 모바일 pb-32 → pb-6. 탭바 여유는 바로 아래 Footer(pb-28) 한 곳이 이미
          갖고 있어, 본문 끝과 푸터 사이에 ~130px 빈 띠가 모든 페이지에 생겼다. 고정 바
          (액션 바·저장 바·맨 위로)는 푸터 높이(≥200px)와 body.nz-has-actionbar 여백이
          받는다 — 본문 마지막 요소가 바에 가려지는 경우는 없다. 홈(app/page.tsx)의 직접
          그린 <main> 도 같은 값. */}
      <main
        id="main-content"
        data-autotrim=""
        className={`mx-auto w-full flex-1 px-3.5 pb-6 pt-3.5 md:px-5 md:pb-16 md:pt-5 ${
          wide ? "max-w-[1400px]" : "max-w-[1240px]"
        }`}
      >
        {/* [970 · A-40] 브레드크럼은 랜드마크로 — 문자열 prop 렌더링은 그대로(API 변경 없음).
            @media print 의 `nav{display:none}` 에 같이 걸려 인쇄에서는 빠진다(크롬이니 맞다). */}
        {breadcrumb && (
          <nav aria-label="브레드크럼" className="mb-2 t-sub text-text-3">
            {breadcrumb}
          </nav>
        )}
        {title && (
          <h1 className="rise-in mb-3.5 t-title text-ink md:mb-4">
            {title}
          </h1>
        )}
        {children}
      </main>
      <Footer />
      <TabBar />
    </>
  );
}
