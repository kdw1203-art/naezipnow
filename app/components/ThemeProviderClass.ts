/* [1105 · 속도] <html> 의 테마 class(light/dark) — next-themes 대신 여기서 단다.
 *
 * next-themes 는 마운트 때 테마가 그대로여도 class 를 뗐다(remove light,dark) 다시 붙였다(add) — 인라인 스크립트가 이미 똑같이
 * 달아 둔 값이다. 다크(또는 시스템 다크)면 .dark 가 빠졌다 붙는 사이 문서 전체를 다시 계산했고(`.dark ::selection` 같은 자손 규칙),
 * ThemeColorMeta 의 MutationObserver 가 그 자리에서 getComputedStyle 로 강제했다(1104 빌드 실측 · 폰 390 · CPU 4배 · 홈 870개 요소
 * 12~94ms · 라이트도 class 쓰기 2번 + 강제 스타일 읽기 1번). 그래서
 *   · 첫 그림 전: app/layout.tsx THEME_CLASS_SCRIPT 가 next-themes 스크립트와 같은 규칙으로 단다(tests/unit/perf-1105 가 둘을 실행해 맞춰 본다).
 *   · 바뀔 때만: ThemeProvider 가 이 함수로 단다 — 테마 상태가 바뀔 때(토글 · 설정 · 다른 탭) · OS 테마가 바뀔 때(시스템 따르기).
 *     이미 그 테마 class 만 달려 있으면 아무것도 쓰지 않는다(첫 로드의 마운트가 여기에 해당).
 * next-themes 는 attribute=[] 로 class 를 건드리지 않고, 테마 상태 · 저장 · 시스템 판정 · color-scheme 은 종전대로 맡는다.
 * 순수 함수로 따로 둔 이유: 유닛 테스트가 .tsx 를 불러올 수 없다. */

/** next-themes 기본 themes — 종전 attribute="class" 일 때 떼던 목록과 같다 */
export const THEME_CLASSES = ["light", "dark"] as const;

type ClassListLike = Pick<DOMTokenList, "contains" | "add" | "remove">;

/** 테마 class 를 단다. 이미 그 class 만 달려 있으면 쓰지 않고 false — 썼으면 true. 순서는 next-themes 와 같다(둘 다 떼고 붙이기).
 *  저장소에 손으로 넣은 엉뚱한 값("a b" 처럼 class 로 못 쓰는 글자)은 인라인 스크립트처럼 조용히 넘긴다(효과에서 던지지 않게). */
export function applyThemeClass(theme: string, classList: ClassListLike = document.documentElement.classList): boolean {
  try {
    if (classList.contains(theme) && THEME_CLASSES.every((c) => c === theme || !classList.contains(c))) return false;
    classList.remove(...THEME_CLASSES);
    classList.add(theme);
    return true;
  } catch {
    return false;
  }
}
