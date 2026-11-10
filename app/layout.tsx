import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./components/SwRegister";
import { InstallPrompt } from "./components/InstallPrompt";
import { AdSenseLoader } from "./components/AdSenseLoader";
import { ConditionalIslands } from "./components/ConditionalIslands";
import { BackToTop } from "./components/BackToTop";
import { SideAdRails } from "./components/ads/SideAdRails";
import { OfflineBanner } from "./components/OfflineBanner";
import { BasicInfoGate } from "./components/account/BasicInfoGate";
import { ADSENSE_EXCLUDED_PATH_PREFIXES, getAdSenseClient } from "@/lib/ads/adsense-policy";
import { buildAdSenseBootScript } from "@/lib/ads/adsense-boot";
import { WebVitalsReporter } from "./components/WebVitalsReporter";
import { ClientErrorReporter } from "./components/ClientErrorReporter";
import { TrafficRecorder } from "./components/TrafficRecorder";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeColorMeta } from "./components/ThemeColorMeta";
import { ToastProvider } from "./components/toast/ToastProvider";
import { SoftSignupProvider } from "./components/soft-signup/SoftSignupProvider";
import { UpgradePaywallProvider } from "./components/UpgradePaywallProvider";
import { ReferralRedeem } from "@/components/ReferralRedeem";
import { SiteJsonLd } from "./components/SiteJsonLd";
import { CookieConsentBanner } from "@/components/consent/cookie-consent-banner";
import { Ga4GtagLoader } from "@/components/ga4-gtag-loader";
import { MomentProvider } from "./components/motion/MomentProvider";
import { NavigationProgress } from "./components/motion/NavigationProgress";
import { PageTransition } from "./components/motion/PageTransition";
import { RevealOnScroll } from "./components/motion/RevealOnScroll";
import { Analytics } from "@vercel/analytics/next";
import { BUILD_MARK } from "@/lib/monitoring/build-mark";

export const metadata: Metadata = {
  metadataBase: new URL(DEFAULT_DESKTOP_ORIGIN), /* [947] 도메인 단일 소스 */
  manifest: "/manifest.webmanifest",
  /* S2·S3 — 검색엔진 소유 확인 메타태그 (2026-07-25 소유자 제공 토큰).
     구글: 정식 도메인 속성 인증은 Vercel DNS 의 TXT 레코드로 하고, 이 태그는
     URL 접두어 속성용 폴백. 네이버: 서치어드바이저 HTML 태그 방식(정식).
     검증 토큰은 공개돼도 되는 값이다(시크릿 아님). */
  /* [960] 애드센스 사이트 연결 — 구글이 허용하는 세 방식(코드 스니펫·ads.txt·메타 태그)
     을 전부 갖춘다. 스니펫은 아래 <head>, ads.txt 는 app/ads.txt/route.ts, 메타는 여기. */
  other: { "google-adsense-account": getAdSenseClient() ?? "" },
  verification: {
    /* [1060] 구글 토큰 2개 — 첫 값은 기존 속성, 둘째는 2026-10-12 소유자가 서치콘솔에서 새로 받은 값
       (HTML 태그 방식). 배열이면 meta 가 두 줄 나간다(네이버와 같은 꼴). 토큰은 공개 값이다. */
    google: ["d4jn9bf7SyTraz2EEnn4aNIPemHwz-Bqqflre4DEuXU", "muxrOv7pGSpU13sYIdz_GfOZIgsknd2qbhPCYUidGas"],
    /* [955] 네이버 토큰 2개 — 첫 값은 nuguzip.com 속성(유지), 둘째는 naezipnow.com 속성
       (2026-09-03 도메인 전환 뒤 서치어드바이저가 새로 발급). 배열이면 meta 가 두 줄 나간다. */
    other: {
      "naver-site-verification": [
        "411fe0d67e731e16c96f4994d904f6160e4927af",
        "7d0c6c7a97eea67fa4a5d6eab160e1c6131a51d9",
      ],
    },
  },
  /* 브랜드 포지션(전략 정본 §6): "임장 관리"라는 비어 있는 카테고리의 첫 이름.
     시세를 '보는' 앱이 아니라 현장에 '가는' 사람의 앱 — 문장도 그 대립을 싣는다.

     [1066 · 검색어] 그 문장만 있으면 검색 결과에 걸릴 말이 한 개도 없다 — 사람이 실제로 치는 말
     ("아파트 실거래가 조회", "임장노트")을 **앞에** 둔다. 검색 결과는 앞 30자쯤에서 잘리므로
     순서가 전부다. 브랜드 문장은 뒤에 그대로 남아 탭·방문 기록·공유 카드(openGraph.title 은
     아래에서 바꾸지 않았다)에서는 종전과 같이 보인다. */
  title: "아파트 실거래가 조회·임장노트 — 내집나우 | 시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
  /* [1012 · 규칙 5] "로그인 없이 시작하세요"(금지 문구) → 실제 동작(로그인 없이 쓰고 저장할 때만 로그인)으로 */
  description:
    "내집나우 · 임장노트 3분 기록 → AI 정리 → 실거래가 지도 비교 · 임장 체크리스트 · 지역 분석 리포트 · 로그인 없이 기록, 저장할 때만 로그인", /* [1029 · 20] 낱말 꼴 */
  openGraph: {
    title: "내집나우 — 시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
    description:
      "내집나우 · 임장노트 3분 기록 → AI 정리 → 실거래가 지도 비교",
    siteName: "내집나우",
    locale: "ko_KR",
    type: "website",
    // S4 — 기본 공유 카드(/og-image). 페이지 전용 카드가 있으면 각 페이지가 덮어쓴다.
    images: [{ url: "/og-image", width: 1200, height: 630, alt: "내집나우" }],
  },
};

export const viewport: Viewport = {
  /* 첫 페인트용 기본값(defaultTheme=light)만 여기서 정한다. 켜져 있는 테마에
     맞추는 일은 app/components/ThemeColorMeta.tsx 가 한다 —
     prefers-color-scheme 미디어쿼리로 나누면 **틀린 답이 된다**(defaultTheme 이 light 라
     "시스템" 을 고르지 않은 사람에게는 OS 다크 + 앱 라이트가 정상 상태다 — [992] 주석 교정,
     enableSystem 자체는 [966] 부터 켜져 있다). 사유는 그 파일 주석. */
  themeColor: "#f7f9fc",
  viewportFit: "cover", // 세이프에어리어(env safe-area-inset-*) 활성화
  /* [968 · 30] 안드로이드 크롬 108+ 는 기본이 resizes-visual — 가상 키보드가 뜨면
     레이아웃 뷰포트는 그대로라 `position: fixed` 하단 바(노트 저장 바·단지 액션 바)가
     키보드 뒤에 깔려 눌리지 않았다. resizes-content 로 레이아웃 뷰포트가 키보드
     위까지로 줄어 fixed 요소가 키보드 위로 올라온다(iOS 는 원래 이 동작). */
  interactiveWidget: "resizes-content",
};

/* [968 · 13] 저사양 판정 — 첫 페인트 전에 html 에 표식을 남긴다(글래스 backdrop-filter
   를 CSS 가 즉시 끈다: globals.css html[data-lowend]). deviceMemory 는 크로미움만
   노출(0.25~8 의 2의 거듭제곱)하고 사파리는 undefined → 표식 없음(= 지금과 동일).
   인라인인 이유: 하이드레이션 뒤 붙이면 그 사이 블러가 한 번 그려진다. nonce 불요 —
   CSP script-src 가 'unsafe-inline'(폰트 스왑 인라인 스크립트와 같은 조건). */
/* [1054] 결정한 동의가 있으면 그리기 전에 표식 — CookieConsentBanner 주석 */
const CONSENT_SCRIPT =
  "(function(){try{if(localStorage.getItem('nz_cookie_consent'))document.documentElement.setAttribute('data-cc','1')}catch(e){}})();";
/* [1104 · 속도] 쿠키 배너가 떠 있는 동안의 body 표식(nz-consent-open · nz-consent-pad)도 그리기 전에 단다 — 예전엔 배너가
   하이드레이션 뒤 효과에서 달았고, body class 가 바뀌면 문서 전체 스타일을 다시 계산한다(globals.css 의
   `[class~="divide-y"] > *` 처럼 class 속성을 보는 규칙 탓 — 1103 빌드 실측 · 폰 390 · CPU 4배 · 홈 859개 요소 73~91ms).
   조건은 use-cookie-consent 의 readStored 와 같다(저장값이 analytics 불리언을 가진 JSON 이면 "결정함" → 안 단다 · 저장소가
   막혀도 "결정 전"), 클래스는 lib/client/shell-gates consentBodyClasses 와 같다(/map 은 pad 없음 — tests/unit/perf-1104 가 맞춰 본다).
   body 가 있어야 해서 <head> 의 CONSENT_SCRIPT 와 따로 <body> 맨 앞에 둔다. 결정 뒤 걷는 일은 배너가 종전대로 한다. */
const CONSENT_BODY_SCRIPT =
  "(function(){try{var v=null,ok=false;try{v=localStorage.getItem('nz_cookie_consent')}catch(e){}if(v){try{ok=typeof JSON.parse(v).analytics==='boolean'}catch(e){}}if(ok)return;var p=location.pathname,b=document.body.classList;b.add('nz-consent-open');if(!(p==='/map'||p.indexOf('/map/')===0))b.add('nz-consent-pad')}catch(e){}})();";
/* [1104 · 속도] 입력 중(키보드 열림) 표식 — 하단 탭바·저장 바·단지 액션 바를 숨기던 `body:has(input:focus-visible)` 규칙을
   html[data-nz-typing] 으로 바꿨다(globals.css). body 를 :has() 앵커로 두면 body 아래 DOM 이 바뀔 때마다 브라우저가 그 :has 를
   다시 판정해 body 밑 전체를 훑는다(1103 빌드 실측: 노드 넣고 빼기 300번 데스크톱 92~122ms → 규칙을 걷으면 20~27ms · 폰 CPU 4배
   637~745ms → 77~119ms). 판정은 예전과 같다 — 지금 포커스가 `input:focus-visible, textarea:focus-visible` 에 맞는가.
     · focusin 에서 바로, focusout 은 다음 틱에(칸 → 칸 이동 사이에 탭바가 한 번 깜박이지 않게), keydown 에서도(마우스로 누른
       체크박스에 키를 치면 크롬이 그때 focus-visible 로 바꾼다 — :has 는 그것도 따라갔다).
     · 포커스된 칸이 DOM 에서 빠지면 사파리는 focusout 을 안 쏜다 — 켜져 있는 동안만 body 를 MutationObserver 로 지켜 다시 판정한다.
     · :has 를 모르는 브라우저(크롬 105·사파리 15.4·파이어폭스 121 미만)에서는 예전 규칙도 안 먹었으므로 달지 않는다.
   class 가 아니라 data 속성인 이유: html/body 의 class 가 바뀌면 위 CONSENT_BODY_SCRIPT 주석의 규칙 탓에 문서 전체를 다시 계산한다. */
const TYPING_SCRIPT =
  "(function(){try{if(!(window.CSS&&CSS.supports&&CSS.supports('selector(:has(a))')))return;var d=document,r=d.documentElement,S='input:focus-visible,textarea:focus-visible',on=false,mo=null;function sync(){var a=d.activeElement,v=false;try{v=!!(a&&a.matches&&a.matches(S))}catch(e){}if(v===on)return;on=v;if(v){r.setAttribute('data-nz-typing','');if(window.MutationObserver&&d.body){mo=mo||new MutationObserver(sync);mo.observe(d.body,{childList:true,subtree:true})}}else{r.removeAttribute('data-nz-typing');if(mo)mo.disconnect()}}d.addEventListener('focusin',sync,true);d.addEventListener('focusout',function(){setTimeout(sync,0)},true);d.addEventListener('keydown',sync,true)}catch(e){}})();";
/* [1098 · 깜박임] 광고 제거 판정(lib/client/ad-free-flag)이 기억돼 있으면 그리기 전에 광고 자리를 숨긴다(globals.css html[data-ad-free="1"]) */
const AD_FREE_SCRIPT =
  "(function(){try{if(localStorage.getItem('nz_ad_free')==='1')document.documentElement.setAttribute('data-ad-free','1')}catch(e){}})();";
const LOWEND_SCRIPT =
  "(function(){try{var m=navigator.deviceMemory;if(typeof m==='number'&&m<=4)document.documentElement.setAttribute('data-lowend','1');}catch(e){}})();";
/* [1105 · 속도] <html> 테마 class(light/dark)를 그리기 전에 — 예전엔 next-themes 의 인라인 스크립트가 달았고, 이제 next-themes 는
   class 를 맡지 않는다(attribute=[] · 사유는 app/components/ThemeProviderClass.ts). 규칙은 그 스크립트(attribute="class" ·
   storageKey "theme" · defaultTheme "light" · enableSystem)와 같다: 저장값(없으면 light) · system 이면 OS 를 보고 · 둘 다 떼고 붙이기 ·
   저장소가 막히면 아무것도 안 단다(tests/unit/perf-1105 가 next-themes 스크립트와 나란히 실행해 맞춰 본다). color-scheme 은
   next-themes 스크립트가 종전대로 쓴다. 바뀔 때는 ThemeProvider 가 단다. */
const THEME_CLASS_SCRIPT =
  "(function(){try{var d=document.documentElement,t=localStorage.getItem('theme')||'light';if(t==='system')t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.classList.remove('light','dark');d.classList.add(t)}catch(e){}})();";

/* [1012 · 모바일 60%] 소유자(2026-09-27): 모바일 화면을 "지금의 60~70% 수준으로" → 실측 시안(지금·80·70·60%)을
   보고 **60%** 를 골랐다(본문 13px 이 폰에서 약 8px 로 보인다는 점, 버튼 40px 이 24px 로 준다는 점을 알리고 받은 답).
   CSS 로 글자·여백을 하나씩 줄이는 대신 **뷰포트 배율**로 줄인다 — 브라우저가 화면 전체를 한 비율로 그리므로
   px 로 적은 크기(아이콘·지도·임의값 805곳)까지 빠짐없이 같은 비율이 되고, 지도 터치 좌표도 어긋나지 않는다.
     · 폰만: 화면의 짧은 변이 600px 미만일 때(태블릿·데스크톱은 그대로 — 데스크톱은 viewport 메타를 무시한다).
     · 레이아웃 폭 = 짧은 변 ÷ 0.6(390폰 → 650px). 768 미만이라 모바일 배치는 그대로다.
     · iOS 는 글자가 화면에서 16px 보다 작게 보이는 입력칸에 포커스하면 화면을 확대하고 돌아오지 않는다 —
       iOS 에서만 maximum-scale 로 그 확대를 막는다(iOS 10+ 는 손가락 확대는 이 값과 무관하게 허용한다).
       안드로이드는 포커스 확대가 없어 maximum-scale 을 두지 않는다(손가락 확대 유지 · Lighthouse meta-viewport 통과).
     · html[data-mscale] 표식 — 하단 탭바는 85% 로 보이게 되돌린다(globals.css).
   첫 페인트 전에 바뀌어야 깜빡임이 없다: Next 가 <head> 맨 앞에 viewport 메타를 쓰고, 이 스크립트가 그 뒤에서
   파싱 중에 즉시 고친다. 그런데 하이드레이션 뒤 Next 가 클라이언트에서 viewport 메타를 **한 장 더** 꽂는다
   (실측: 로드 직후 innerWidth 650 → 네트워크 유휴 뒤 390, 메타 2장 — 브라우저는 마지막 장을 쓴다). 그래서
   <head> 를 지켜보다(MutationObserver) 새로 들어오거나 바뀐 viewport 메타를 같은 값으로 되돌린다.
   화면 전환 때 다시 꽂혀도 같다. 콜백은 렌더 전에 도는 마이크로태스크라 깜빡임이 없다. */
/* [1012 · 글씨 75%] 소유자(60% 적용 뒤): "글씨 크기는 75% 수준을 유지하고 최대한 한 줄로" → 배율을 0.75 로 올리고
   (글자가 원래의 75%), 여백·간격은 globals.css html[data-mscale] 에서 0.8 배로 더 조여 60% 를 지킨다. */
/* [1026c · 폰 글자·상자 90%] 소유자(2026-09-30, 네이버 모바일과 같은 폰에서 나란히 찍은 캡처): "글씨 크기나 박스 크기가 조금 작은 것
   같아 네이버의 90% 수준으로". 실측(iPhone 16 Pro 402pt · 글자 높이): 목록 제목 9.0~10.0pt · 보조 7.3pt 로 네이버(14.3 · 12.3)의
   60~70% 였다. 배율을 0.75 → 1 로 돌려 글자·상자·아이콘·간격을 한 비율(×1.33)로 키우고, 글자 단계만 globals.css
   [1026c] 블록에서 맞춰(제목은 줄이고 보조는 올려) 네이버의 약 90% 에 둔다. data-mscale 표식·한 줄 규칙·iOS 확대 막기는 그대로. */
const MOBILE_SCALE = 1;
const MSCALE_SCRIPT =
  "(function(){try{var S=" +
  MOBILE_SCALE +
  ",n=Math.min(screen.width,screen.height);if(!(n>0&&n<600))return;" +
  "var w=Math.round(n/S),ua=navigator.userAgent||'',ios=/iP(hone|od|ad)/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);" +
  "var C='width='+w+(ios?', initial-scale='+S+', minimum-scale='+S+', maximum-scale='+S:'')+', viewport-fit=cover, interactive-widget=resizes-content';" +
  "function fix(){var m=document.querySelectorAll('meta[name=\"viewport\"]');for(var i=0;i<m.length;i++){if(m[i].getAttribute('content')!==C)m[i].setAttribute('content',C);}}" +
  "fix();document.documentElement.setAttribute('data-mscale',String(S));" +
  "if(window.MutationObserver)new MutationObserver(fix).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content']});" +
  "}catch(e){}})();";

/**
 * 페이지 함수 실행 상한(초) — 이 레이아웃 아래 **모든 페이지**에 적용된다.
 * (app/api 의 Route Handler 는 각자 route.ts 에서 따로 지정한다 — 35곳.)
 *
 * 2026-08-01 감사: app/api 밖에는 maxDuration 이 한 곳도 없어 모든 페이지가
 * Vercel 기본 300초를 상속했고, 최근 6주 런타임 오류 1,624건 중 802건이
 * "Task timed out after 300 seconds" 였다 — 페이지 하나가 5분씩 컴퓨트를
 * 태우고 사용자는 빈 화면을 봤다. 조회 한 건의 총 예산이 45초(supabase-read·
 * service.ts)이므로, 120초면 직렬 실패 2건 + 렌더까지 "조회 실패" 화면을
 * 정직하게 그릴 시간이 되고, 그 밖의 것은 장애다 — 5분을 태울 이유가 없다.
 */
export const maxDuration = 120;

/* [1053] 본문 웹글꼴(Pretendard dynamic subset) 링크는 걷었다 — 아래 <head> 의 [1053 · 속도] 주석 */

/* [1027 · 제안 28] 이 HTML 을 만든 빌드의 표식(BUILD_MARK — 빌드 때 박힌 커밋 해시 앞 7자)을 메타로 심는다.
   오류 경계가 보고에 실어 보낸다(lib/client/error-report). 배포 뒤에도 옛 화면을 들고 있던 탭의 오류인지
   가릴 때 쓴다. 값이 없으면(로컬) 메타를 그리지 않는다. */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* [1105 · 속도] 테마 class — 위 THEME_CLASS_SCRIPT 주석. <html> 의 suppressHydrationWarning 이 이 class 때문이다(종전 next-themes 스크립트와 같은 이유) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_CLASS_SCRIPT }} />
        {/* [968 · 13] 저사양(deviceMemory ≤ 4GB) 표식 — 위 LOWEND_SCRIPT 주석 참고.
            <html> 은 suppressHydrationWarning 이라(테마 class 와 같은 이유) 속성이 붙어도
            하이드레이션 경고가 없다. */}
        <script dangerouslySetInnerHTML={{ __html: LOWEND_SCRIPT }} />
        {/* [1012 · 모바일 60%] 폰에서만 뷰포트 배율 0.6 — 위 MSCALE_SCRIPT 주석 참고 */}
        <script dangerouslySetInnerHTML={{ __html: MSCALE_SCRIPT }} />
        {/* [1054 · 속도] 쿠키 동의 배너를 서버 HTML 에 넣고(첫 그림에 바로 보이게), 이미 결정한 브라우저는 그리기 전에
            html[data-cc] 로 숨긴다(globals.css). 예전엔 배너가 하이드레이션 뒤에야 나타나 운영 Lighthouse 에서 /town/강남구 의
            가장 큰 요소(LCP)가 이 배너 글이었고 4.1초였다(TTFB 0.7초 + 그리기 지연 3.4초). 결정 뒤엔 컴포넌트가 스스로 내린다. */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_SCRIPT }} />
        {/* [1098 · 깜박임] 유료 플랜의 광고 자리 — 공유 캐시 화면도 첫 그림부터 비워 둔다 */}
        <script dangerouslySetInnerHTML={{ __html: AD_FREE_SCRIPT }} />
        {/* [1104 · 속도] 입력 중 표식(html[data-nz-typing]) — 위 TYPING_SCRIPT 주석. 첫 포커스보다 먼저 리스너가 있어야 해서 head 에 둔다 */}
        <script dangerouslySetInnerHTML={{ __html: TYPING_SCRIPT }} />
        {/* [969 · 16] 폰트 원점 3 → 0. 여기 있던 G7 preconnect/dns-prefetch(cdn.jsdelivr.net)
            와 아래 [949] preconnect(fonts.gstatic.com)를 지웠다 — 폰트 CSS·woff2 가 전부
            same-origin(/fonts/) 이 되어 미리 열 연결이 없다. 예전에는 폰트 때문에
            cdn.jsdelivr.net · fonts.googleapis.com · fonts.gstatic.com 세 원점에 각각
            DNS→TCP→TLS 를 열어야 했고(preconnect 는 그 왕복을 HTML 파싱과 겹칠 뿐
            없애지는 못한다), 모바일 4G 에서는 원점 하나당 왕복 3~4회가 든다. 이제 HTML 을
            받은 연결(HTTP/2 재사용)로 폰트까지 받는다 — 핸드셰이크 0회, 요청 수도
            구글 CSS 1건이 준다(@font-face 가 globals.css 안으로 들어갔다).
            CSP(style-src/font-src)에서도 세 도메인을 뺐다(lib/security/content-security-policy). */}
        {/* N3 — RSS 자동 발견. 리더·크롤러는 이 태그로 피드를 찾는다. 메타데이터
            규약(alternates.types)에 두지 않은 이유는, 페이지가 canonical 을
            지정하면 alternates 객체가 통째로 덮여 피드 링크가 사라지기 때문이다.
            여기 두면 모든 페이지에 남는다. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="내집나우 — 실거래 리포트·임장노트"
          href={`${DEFAULT_DESKTOP_ORIGIN}/feed.xml`}
        />
        {/* [1053 · 속도] Pretendard 웹글꼴(dynamic subset · @font-face 92조각)을 걷고 기기 기본 글꼴로 — 소유자 답 "폰·윈도우도 기본 글꼴".
            운영 실측(2026-10-10 · 폰 · CPU 4배 감속): 92조각이 하나씩 도착할 때마다 글자 배치를 처음부터 다시 해
            레이아웃 계산이 단지 화면 5.2초 · 홈 3.3~5.8초 · 노트 2.7초 — 웹글꼴을 빼면 1.4 · 0.7 · 1.1초.
            1051 의 "글꼴 아님" 결론은 woff2 파일만 막은 실험이라 틀렸다(@font-face 선언 자체가 비용).
            아이폰·맥은 원래 애플 시스템 글꼴이 먼저였다(변화 없음). 안드로이드 = 본고딕(Noto Sans CJK)·삼성 글꼴,
            윈도우 = 맑은 고딕. 글꼴 순서는 globals.css 끝 [1053] 블록. 파일(public/fonts/pretendard)은 지우지 않았다 —
            예전 배포의 캐시된 HTML 이 아직 찾을 수 있다. 공유 이미지(OG)는 자기 글꼴(lib/og/fonts)을 그대로 쓴다.
            로고 워드마크 네 글자만 824바이트 조각(globals.css .nz-wordmark)을 미리 받는다. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/wordmark/naezipnow-wordmark.woff2" crossOrigin="" />
        {/* [946] 브랜드 슬로건 세리프 — text= 파라미터로 슬로건 글자만 서브셋.
            통짜 Noto Serif KR(수백 KB)을 문장 하나 때문에 싣지 않는다.
            [949] 946 에서는 이 링크가 **렌더 차단** stylesheet 였다 — 모든 페이지가
            첫 페인트 전에 fonts.googleapis.com 으로 DNS·TCP·TLS 를 새로 열고 CSS 를
            받아야 했다(슬로건이 없는 단지 페이지까지). 실사용 web_vitals 14일:
            /complex FCP p75 2.3s 중 TTFB 를 뺀 0.9s 가 이런 차단 자원 몫이다.
            → preload → media=print→all 스왑으로 비차단화했었다.
            [969 · 16] 여기 있던 링크 세트(preconnect gstatic · preload · stylesheet
            media=print · 스왑 스크립트 · noscript)를 전부 지웠다. 구글이 text= 로 돌려준
            woff2(51,372 bytes) 를 public/fonts/noto-serif-kr/ 에 두고 @font-face 는
            globals.css 끝에 있다(font-display: swap · unicode-range 동일). 이제 이 폰트는
            원점 둘(googleapis + gstatic)·요청 둘이 아니라 same-origin 요청 하나이고,
            슬로건이 없는 페이지는 unicode-range 덕에 파일을 받지도 않는다. */}
        {/* #19 PWA — iOS 홈 화면 아이콘 · 웹앱 메타
            G9: .svg → .png 로 교체했다. Safari 는 apple-touch-icon 으로 SVG 를
            받지 않는다 — 지금까지 iOS 에서 홈 화면에 추가하면 아이콘이 아니라
            페이지 스크린샷 축소판이 박혔다는 뜻이다(조용히 실패해서 티가 안 났다).
            [946 리브랜딩] 내집나우 아이콘 세트로 교체 — 180px 전용 파일 사용. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        {/* [960] 구글 애드센스 — 광고 **요청**은 pauseAdRequests=1 로 잠근 채 시작하고,
            AdSenseLoader 가 제외 경로(/payment·/my…)·광고 없는 플랜(pro/expert/enterprise)
            판정을 마친 뒤에만 푼다. 사이트 연결 확인은 메타(google-adsense-account, 위
            metadata.other)와 ads.txt 가 정적으로 담당한다.
            [968 · 15] 스크립트 태그는 정적 async 태그 대신 <head> 인라인 부트
            (lib/ads/adsense-boot)가 넣는다 — 뷰포트 ≥1024px 은 지금처럼 head 파싱 중 즉시
            (fetchpriority=low 만 추가), <1024px 은 load 뒤 idle 에, 제외 경로는 생략.
            모바일에서 수동 유닛은 `hidden lg:block` 이라 그려지지도 않는데 스크립트가
            LCP 자원과 대역폭을 나누던 것을 없앤다(요청 1건이 LCP 뒤로 밀린다).
            판정에 뷰포트가 필요해 서버(ISR 캐시)에서는 결정할 수 없다 — 그래서 인라인. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.adsbygoogle=window.adsbygoogle||[];window.adsbygoogle.pauseAdRequests=1;",
          }}
        />
        {getAdSenseClient() && (
          <script
            dangerouslySetInnerHTML={{
              __html: buildAdSenseBootScript(
                getAdSenseClient() ?? "",
                ADSENSE_EXCLUDED_PATH_PREFIXES,
              ),
            }}
          />
        )}
        {/* S16/G16 — Organization·WebSite JSON-LD (정적 값만, 데이터 페칭 없음) */}
        <SiteJsonLd />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* [988a] default → black-translucent.
            `default` 은 iOS 가 상태바 자리를 **불투명한 띠로 예약**한다 — 홈 화면에
            추가해 연 앱에서도 화면 맨 위가 페이지가 아니라 시스템 띠였다.
            `black-translucent` 면 웹뷰가 화면 전체를 차지하고 상태바가 그 위에 겹친다
            (카메라 섬 자리까지 페이지가 올라간다).

            이 모드의 시스템 글자는 **항상 흰색**이다. 그래서 그 자리에 어두운 면을
            깔지 않으면 시각·배터리가 안 보인다 — globals.css 의
            `@media (display-mode: standalone)` 이 세이프에어리어 높이만큼
            브랜드 남색 띠를 그린다. manifest 도 이미 남색을 쓰고 있어(theme_color
            #0B2545) 앱의 정체성과 어긋나지 않는다.

            사파리(브라우저)에서는 이 메타가 무시된다 — 주소창·상태바는 사파리
            소유라 웹 페이지가 그릴 수 없다. 그 경로는 IosInstallHint 가 안내한다. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="내집나우" />
        {BUILD_MARK ? <meta name="nz-build" content={BUILD_MARK} /> : null}
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* [1104 · 속도] 쿠키 배너 body 표식을 그리기 전에 — 위 CONSENT_BODY_SCRIPT 주석. body 맨 앞이어야 document.body 가 있다.
            body 의 suppressHydrationWarning 은 이 스크립트가 하이드레이션 전에 class 를 더하기 때문(<html> 의 테마 class 와 같은 이유 · 이 요소 하나만) */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_BODY_SCRIPT }} />
        {/* #18 a11y — 본문 바로가기 (키보드 첫 Tab). sr-only 로만 두면 포커스가
            와도 안 보여서 반쪽짜리다 — 포커스 시 화면에 나타나야 한다(고도화 47). */}
        <a
          href="#main-content"
          className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2.5 focus:t-body focus:font-bold focus:text-white focus:shadow-lg"
        >
          본문 바로가기
        </a>
        <ThemeProvider>
          {/* 시스템 바 색을 지금 테마에 맞춘다 — 다크로 켜면 화면만 어두워지고
              상태바는 밝은 회색으로 남아 있었다. useTheme 이 아니라 html 의
              class 를 직접 보는 방식이라(이유는 컴포넌트 주석) ThemeProvider
              안팎 어디에 둬도 동작한다. 굳이 여기 두는 건 테마와 같이 읽히게
              하려는 것뿐이다. */}
          <ThemeColorMeta />
          <ToastProvider>
            {/* 저장·로그인처럼 "성사"가 중요한 순간의 1.5초 장면. 루트에 두는
                이유는 연출 도중 화면이 바뀌어도 끊기지 않게 하기 위해서다. */}
            <MomentProvider>
              {/* A3 비로그인 액션 → 소프트 가입 프롬프트 (401 즉시 리다이렉트 대체) */}
              <SoftSignupProvider>
                {/* 402/쿼터 — SoftSignup(401)과 짝인 전역 페이월 */}
                <UpgradePaywallProvider>
                  {/* [1124] 본문 바깥 좌우 광고 띠 — 넓은 PC 화면의 빈 여백에만(제외 경로 · 관리자 · 광고 없는 플랜은 안 나간다) */}
                  <SideAdRails />
                  {children}
                  {/* 이동 중 상단 진행바 · 경로 전환 페이드 · 스크롤 리빌.
                      셋 다 렌더하는 마크업이 없거나(null) 화면 위 얇은 한 줄이라
                      본문 레이아웃에는 영향을 주지 않는다. */}
                  <NavigationProgress />
                  <PageTransition />
                  <RevealOnScroll />
                  {/* 친구 추천 리딤 트리거 (ref_code 쿠키 → 리딤, 렌더 없음) */}
                  <ReferralRedeem />
                  <SwRegister />
                  {/* G9 — 설치 프롬프트. 브라우저가 beforeinstallprompt 를 보낼 때만 뜬다
                      (안 오면 아무것도 렌더하지 않는다). SwRegister 바로 뒤에 둔 건
                      순서 의존이 아니라 읽는 사람 편의 — 둘 다 PWA 관련이다. */}
                  <InstallPrompt />
                  <AdSenseLoader />
                  {/* [968 · 14] 조건부 섬 넷 — DragScroll(마우스) · IosInstallHint(iOS 사파리) ·
                      BrandSplash·PullToRefresh(설치 앱) — 은 환경을 한 번 판정한 뒤 맞는 것만
                      next/dynamic 으로 받아 마운트한다. 모바일 브라우저는 넷 다 안 받는다. */}
                  <ConditionalIslands />
                  {/* [966] 800px 넘게 내려가면 우하단에 "맨 위로" — /town·/notes 는 글쓰기 FAB 위로 비킨다 */}
                  <BackToTop />
                  {/* [966] 끊기면 탭바 위 알약으로 알리고, 돌아오면 2.5초 뒤 접는다 */}
                  <OfflineBanner />
                  {/* [1138] 로그인했는데 필수 기본 정보가 비었으면 완성 화면으로 */}
                  <BasicInfoGate />
                  <WebVitalsReporter />
                  <ClientErrorReporter />
                  {/* 어드민 트래픽 대시보드용 1st-party 페이지뷰·체류 기록 —
                      GA4 와 같은 분석 동의 게이트 뒤에서만 동작한다. */}
                  <TrafficRecorder />
                  {/* S22 — 쿠키 동의 배너 + 동의 게이트 GA4 (동의 전에는 스크립트
                      로드 자체가 없다). NEXT_PUBLIC_GA4_ID 미설정 시 GA4는 무동작. */}
                  <CookieConsentBanner />
                  <Ga4GtagLoader />
                  {/* [991] ViewportGroupTracker(viewport_group_change 계측) 삭제.
                      30일 5,198건이 6명에게서 나왔다 — 세션당 수백 번. iOS 사파리는
                      주소창이 접히고 펴질 때마다 resize 를 쏘고, 그때마다 핸들러가
                      돌며 fetch 를 보냈다(홈 INP p75 1,296ms 의 한 조각). 기기 분포는
                      web_vitals.user_agent 로 이미 알 수 있다. */}
                  {/* Vercel Web Analytics — 프로덕션(Vercel 배포)에서만 수집,
                      로컬에서는 아무것도 전송하지 않는다. */}
                  <Analytics />
                </UpgradePaywallProvider>
              </SoftSignupProvider>
            </MomentProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
