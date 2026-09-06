/**
 * [968 · 14 · 40] 루트 셸의 조건 판정 — 순수 함수만(브라우저 없이 테스트).
 *
 *  - decideIslands: 루트 레이아웃의 조건부 클라이언트 섬 넷 중 무엇을 마운트할지
 *    (app/components/ConditionalIslands.tsx 가 matchMedia/UA 를 읽어 넘긴다).
 *  - consentBannerBottom: 쿠키 동의 배너(모바일)의 bottom — 탭바 위 / 지도 하단 레인 위.
 */

export type IslandEnv = {
  /** display-mode: standalone 또는 iOS navigator.standalone */
  standalone: boolean;
  /** (hover: hover) and (pointer: fine) — 마우스가 주 입력 */
  finePointer: boolean;
  /** iOS 사파리(인앱 웹뷰·다른 iOS 브라우저 제외) */
  iosSafari: boolean;
};

export type IslandDecision = {
  pullToRefresh: boolean;
  brandSplash: boolean;
  dragScroll: boolean;
  iosInstallHint: boolean;
};

export const FINE_POINTER_MEDIA = "(hover: hover) and (pointer: fine)";

export const NO_ISLANDS: IslandDecision = {
  pullToRefresh: false,
  brandSplash: false,
  dragScroll: false,
  iosInstallHint: false,
};

/**
 *  - PullToRefresh · BrandSplash: 홈 화면에 설치한 앱(standalone)에서만
 *  - DragScroll: 마우스 전용(터치는 네이티브 스크롤이 이미 그 역할)
 *  - IosInstallHint: iOS 사파리(설치 전)에서만 — 설치 앱 안에서는 안내가 무의미하다
 */
export function decideIslands(env: IslandEnv): IslandDecision {
  return {
    pullToRefresh: env.standalone,
    brandSplash: env.standalone,
    dragScroll: env.finePointer,
    iosInstallHint: env.iosSafari && !env.standalone,
  };
}

/**
 * [968 · 40] 모바일 쿠키 배너의 bottom — 탭바 **위**에 선다.
 *  - 보통 화면: --nz-tabbar-offset(탭바 높이 + 여백, globals.css :root). 탭바가 없는
 *    화면(로그인 등)에서도 같은 값 — 조금 떠 있을 뿐 가리는 것이 없다.
 *  - /map: 탭바가 없고 대신 하단 가운데 카테고리 바(bottom 20px · 높이 ~51px)가 있다.
 *    탭바 오프셋(68px)이면 그 바의 윗단(71px)과 겹치므로 지도 하단 레인
 *    (--nz-map-bottom-lane = safe-area + 29 + 바 실측 높이) 위로 올린다.
 */
export function consentBannerBottom(pathname: string): string {
  if (pathname === "/map" || pathname.startsWith("/map/")) {
    return "calc(var(--nz-map-bottom-lane) + 8px)";
  }
  return "var(--nz-tabbar-offset)";
}
