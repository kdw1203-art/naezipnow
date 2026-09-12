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
  if (isMapPath(pathname)) {
    return "calc(var(--nz-map-bottom-lane) + 8px)";
  }
  return "var(--nz-tabbar-offset)";
}

/** /map 세그먼트(지도 루트는 fixed inset-0 라 문서 흐름 밖) — prefix 는 세그먼트 단위 */
export function isMapPath(pathname: string): boolean {
  return pathname === "/map" || pathname.startsWith("/map/");
}

/**
 * [970 · A-39 · A-20] 쿠키 배너가 떠 있는 동안 body 에 다는 클래스.
 *  - nz-consent-open: 늘 — globals.css 가 "맨 위로" FAB 를 숨긴다.
 *  - nz-consent-pad: md+ 에서 body 아래 여백(코너 카드 높이만큼)을 주는 표식. /map 은
 *    지도가 fixed inset-0 라 여백이 빈 스크롤 영역만 만들므로 달지 않는다.
 */
export function consentBodyClasses(pathname: string): readonly string[] {
  return isMapPath(pathname) ? ["nz-consent-open"] : ["nz-consent-open", "nz-consent-pad"];
}

/* ───────────────────────── [970] 셸 경로 판정 ───────────────────────── */

/**
 * [970 · A-15] 헤더·전체 메뉴의 "로그인" 링크 — 지금 보던 화면으로 돌아오게 callbackUrl 을
 * 싣는다(예전엔 늘 `/login` 이라 로그인 뒤 홈으로 떨어졌다). LoginClient 는
 * safeInternalPath 로 내부 경로만 받으므로 여기서는 경로+쿼리를 그대로 넘긴다.
 *  - 인증 화면(로그인·가입·로그아웃·비밀번호) 위에서는 되돌아갈 곳이 아니다 → 맨 `/login`.
 *  - 홈(`/`)은 LoginClient 기본값과 같아 굳이 싣지 않는다.
 */
const AUTH_PATH_PREFIXES = ["/login", "/signup", "/logout", "/forgot-password", "/reset-password"];

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function loginReturnHref(pathname: string, search = ""): string {
  const path = pathname && pathname.startsWith("/") ? pathname : "/";
  if (path === "/" || AUTH_PATH_PREFIXES.some((p) => underPrefix(path, p))) return "/login";
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `/login?callbackUrl=${encodeURIComponent(`${path}${query}`)}`;
}

/**
 * [970 · C-29] 탭바 활성 판정 — "동네" 탭은 동네이야기 카테고리(lib/town/category-links)에
 * 속한 /apply·/auctions·/supply·/redevelopment·/qna 에서도 켜진다(예전엔 /town 만).
 * prefix 는 세그먼트 단위(/map 이 /mapping 을 켜지 않게). 홈은 정확 일치.
 */
/**
 * 탭 활성 판정. `extraPrefixes` 는 **이 탭**을 함께 켜는 추가 경로(세그먼트 prefix).
 * [991] 예전엔 셋째 인자가 "동네 탭 전용 카테고리 목록"이었다 — 탭바에서 '동네'가
 * '분석'으로 바뀌면서(30일 실측: /analysis 62회·251초 vs /town 31회·7초) 특정 탭에
 * 묶인 규칙을 없앴다. 호출자가 탭마다 자기 목록을 넘긴다.
 */
export function tabBarActive(
  tabHref: string,
  pathname: string,
  extraPrefixes: readonly string[] = [],
): boolean {
  if (tabHref === "/") return pathname === "/";
  if (underPrefix(pathname, tabHref)) return true;
  return extraPrefixes.some((h) => underPrefix(pathname, h));
}

/**
 * [970 · B-08 · B-09] "맨 위로" FAB 가 서는 레인(CSS .back-to-top[data-lane]).
 *  - lifted: 같은 자리에 글쓰기 FAB(52px)가 있는 화면 — /notes·/town **정확 일치**만.
 *    예전 `startsWith("/notes")` 는 FAB 가 없는 /notes/[id]·/notes/new 까지 올려
 *    저장 바와 맞닿았다.
 *  - savebar: 하단 저장 바가 있는 작성·수정 폼(/notes/new · /notes/[id]/edit). 탭바가 없는
 *    화면이라 safe-area 기준으로 바 위에 선다. (NoteForm 은 body 클래스를 달지 않으므로
 *    경로로 판정 — 바가 원래 CTA 보임/안 보임에 따라 떴다 사라져도 FAB 자리는 고정.)
 *  - /complex/[id] 액션 바는 MobileActionBar 가 body.nz-has-actionbar 를 달므로 CSS 가 판정.
 */
export type BackToTopLane = "default" | "lifted" | "savebar";

export function backToTopLane(pathname: string): BackToTopLane {
  if (pathname === "/notes" || pathname === "/town") return "lifted";
  if (pathname === "/notes/new" || /^\/notes\/[^/]+\/edit$/.test(pathname)) return "savebar";
  return "default";
}
