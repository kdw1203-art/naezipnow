/* [1012 · 규칙 10] 직접 그린 선 일러스트 이름표 — JSX 없는 순수 데이터 모듈(nav-data.ts 와 같은 이유: 테스트가
   .tsx 를 그대로 못 부른다). 파일은 public/illust/<name>.svg, 그리는 컴포넌트는 Illust.tsx. */
export const ILLUST_NAMES = [
  "empty-notes",
  "map-pin",
  "key-door",
  "calendar",
  "search",
  "offline",
  "bell",
  "chart",
] as const;

export type IllustName = (typeof ILLUST_NAMES)[number];

export function illustSrc(name: IllustName): string {
  return `/illust/${name}.svg`;
}
