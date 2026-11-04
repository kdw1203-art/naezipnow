"use client";
/* [1104 · 속도] 전환 애니메이션 끄기는 테마를 **실제로 바꾸는 순간**에만 한다.
   예전엔 next-themes 의 disableTransitionOnChange 를 켜 두었는데, next-themes 는 마운트 때도(테마가 그대로여도)
   <html> class 를 다시 붙이며 그때마다 `*{transition:none}` 스타일을 head 에 넣고 1ms 뒤 걷는다 — 첫 로드마다
   스타일시트가 두 번 바뀌어 문서 전체 스타일을 두 번 다시 계산했다(1103 빌드 실측 · 폰 390 · CPU 4배 · 홈:
   644·688개 요소, 넣을 때 22~52ms + 걷을 때 35~88ms · 데스크톱 23~40ms). 마운트 때는 바뀌는 색이 없어 끌 전환도 없다.
   그래서 끄기는 바꾸는 경로에서만 — 전체 메뉴 토글(ThemeToggle) · 설정의 테마 줄(ThemeRow)은 setTheme 앞에서,
   OS 테마(시스템 따르기) · 다른 탭은 ThemeProvider 의 리스너가 부른다. 스타일 문자열은 next-themes 0.4 와 같다.
   공급자(ThemeProvider.tsx)와 따로 둔 이유: 토글 · 설정 화면 청크에 공급자 본체가 딸려 가지 않게(토스트 use-toast 와 같은 분리). */
export const THEME_STORAGE_KEY = "theme"; // next-themes 기본 storageKey
const NO_TRANSITION_CSS =
  "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";

export function suppressThemeTransitions(): void {
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.appendChild(document.createTextNode(NO_TRANSITION_CSS));
  document.head.appendChild(style);
  const done = () => {
    /* 새 테마 색을 전환 없이 한 번 계산해 둔 뒤 걷는다(next-themes 와 같은 순서) — 걷은 뒤엔 값이 안 바뀌어 전환이 시작되지 않는다 */
    void window.getComputedStyle(document.body).opacity;
    style.remove();
  };
  /* class 교체는 React 커밋 뒤 next-themes 효과에서 일어난다 — 두 프레임 뒤면 끝나 있다 */
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.requestAnimationFrame(done));
  } else {
    window.setTimeout(done, 50);
  }
}
