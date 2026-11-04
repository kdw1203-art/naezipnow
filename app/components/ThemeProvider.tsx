"use client";

import { useEffect, useLayoutEffect } from "react";
import { ThemeProvider as NextThemeProvider, useTheme, type Attribute } from "next-themes";
/* [1104 · 속도] disableTransitionOnChange 는 걷었다 — 끄기는 실제로 바꾸는 경로에서만(theme-transition.ts 주석 · 실측) */
import { suppressThemeTransitions, THEME_STORAGE_KEY } from "./theme-transition";
import { applyThemeClass } from "./ThemeProviderClass";

/* [1105 · 속도] next-themes 에는 <html> class 를 맡기지 않는다 — 마운트 때 같은 class 를 뗐다 붙이던 쓰기를 없앤다(사유 · 실측은
   ThemeProviderClass.ts 머리 주석). 첫 그림은 app/layout.tsx THEME_CLASS_SCRIPT, 바뀔 때는 아래 ThemeClassSync · OS 리스너가 단다.
   빈 배열이면 next-themes 의 인라인 스크립트와 효과 둘 다 class 를 건드리지 않고 color-scheme 만 종전대로 쓴다(next-themes 0.4). */
const NO_THEME_ATTRIBUTE: Attribute[] = [];

/** #16 다크 모드 — next-themes 래퍼.
 *  [1105] <html class="dark"> 토글은 ThemeClassSync(아래) — globals.css .dark 토큰 오버라이드와 연동(종전 attribute="class" 와 같은 class).
 *
 *  [966] enableSystem — 설정(/my/settings 계정 탭)에서 "시스템" 을 고를 수 있게 켠다.
 *  기본값은 여전히 light 다: 전체 메뉴의 ThemeToggle 은 resolvedTheme 기준으로
 *  light↔dark 만 오가므로 기본을 system 으로 바꾸면 OS 가 다크인 사용자가 첫 방문부터
 *  다크를 보게 되고(표면 감사 전), 토글 한 번이 "시스템 따르기" 를 조용히 해제한다.
 *  시스템 추종은 사용자가 설정에서 명시적으로 고른 경우에만 적용한다. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /* [1104] OS 테마 변경(시스템 따르기일 때만 class 가 바뀐다) · 다른 탭의 변경도 전에 끄던 대로 끈다.
     레이아웃 효과라 자식 NextThemeProvider 의 리스너(일반 효과에서 붙는다)보다 먼저 등록되고, 같은 이벤트에서 먼저 불린다 —
     next-themes 는 OS 변경 때 class 를 그 리스너 안에서 바로 바꿨으므로 순서가 중요하다.
     [1105] 이제 그 class 는 여기서 바로 단다 — 같은 순간 · 같은 값(이벤트의 matches). next-themes 리스너는 뒤이어 color-scheme 만 바꾼다. */
  useLayoutEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onScheme = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY) !== "system") return;
      } catch {
        return;
      }
      suppressThemeTransitions();
      applyThemeClass(mq?.matches ? "dark" : "light");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) suppressThemeTransitions();
    };
    /* addListener 는 addEventListener("change") 와 같은 목록이다(next-themes 는 addListener) — 옛 사파리(14 미만) 대비로만 남긴다 */
    if (mq?.addEventListener) mq.addEventListener("change", onScheme);
    else mq?.addListener?.(onScheme);
    window.addEventListener("storage", onStorage);
    return () => {
      if (mq?.removeEventListener) mq.removeEventListener("change", onScheme);
      else mq?.removeListener?.(onScheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <NextThemeProvider attribute={NO_THEME_ATTRIBUTE} defaultTheme="light" enableSystem>
      <ThemeClassSync />
      {children}
    </NextThemeProvider>
  );
}

/** [1105] 테마 상태(resolvedTheme)가 바뀌면 <html> class 를 단다 — 토글 · 설정 · 다른 탭 · 시스템 따르기 전부 이 상태를 거친다.
 *  next-themes 가 class 를 달던 효과(같은 커밋 · 일반 효과)와 같은 자리다. 첫 렌더 값은 인라인 스크립트가 단 class 와 같아 쓰지 않는다. */
function ThemeClassSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme) applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);
  return null;
}
