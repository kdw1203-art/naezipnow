/**
 * [1086 · 서울 3D] 화면 토큰(CSS 변수) → 지도 색. 지도 엔진(WebGL)은 CSS 변수를 못 읽어서 계산한 색 문자열을 넘긴다.
 * 토큰을 섞어 단계를 만든다(raw 색을 새로 정하지 않는다) — 다크 모드면 토큰이 바뀌어 지도 색도 따라간다.
 */
export type Rgb = { r: number; g: number; b: number };

export function parseColor(input: string | null | undefined): Rgb | null {
  const s = (input ?? "").trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return { r: Math.round(Number(m[1])), g: Math.round(Number(m[2])), b: Math.round(Number(m[3])) };
  return null;
}

export function rgbString(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/** a 를 t(0~1)만큼, 나머지를 b 로 */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return a || b;
  const k = Math.min(1, Math.max(0, t));
  return rgbString({
    r: Math.round(x.r * k + y.r * (1 - k)),
    g: Math.round(x.g * k + y.g * (1 - k)),
    b: Math.round(x.b * k + y.b * (1 - k)),
  });
}

/** 가격 단계(0~4) 색 — 주 색을 바탕과 섞어 옅은 쪽(싼 단계) → 진한 쪽(비싼 단계) */
export function bandColors(primary: string, surface: string): string[] {
  return [0.32, 0.48, 0.64, 0.8, 1].map((t) => mix(primary, surface, t));
}
