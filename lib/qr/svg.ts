/**
 * [997] QR 모듈 → SVG. **순수 함수(React 없음)** — 인라인 `<svg>`(JSX)와 data URI 둘 다 만든다.
 *
 * 경로 하나(`<path>`)로 그린다: 한 행에서 이어진 어두운 모듈을 사각형 하나로 합쳐
 * 노드 수를 줄인다(29×29 카드 QR 도 rect 수백 개 대신 path 한 줄). viewBox 는 모듈 단위,
 * width/height 는 moduleSize 배 — html-to-image 가 명시 크기를 그대로 굽는다.
 */

export type QrSvgOptions = {
  /** 모듈 한 칸의 px — width/height 계산에만 쓴다(viewBox 는 모듈 단위) */
  moduleSize?: number;
  /** 사방 여백(모듈 단위). 규격 권장 4 — 흰 패널 위라면 2~3 도 판독된다 */
  quietZone?: number;
  fg?: string;
  bg?: string;
};

export type QrSvgProps = {
  viewBox: string;
  width: number;
  height: number;
  /** 어두운 모듈 전체를 담은 path d — `<path d fill={fg}>` */
  path: string;
  fg: string;
  bg: string;
};

const DEFAULTS = { moduleSize: 4, quietZone: 4, fg: "#0B1220", bg: "#FFFFFF" };

/** 행마다 연속 구간을 하나의 `M x y h w v1 h-w z` 로 합친 path d */
export function qrPathData(modules: boolean[][], quietZone: number): string {
  const parts: string[] = [];
  for (let y = 0; y < modules.length; y++) {
    const row = modules[y];
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      parts.push(`M${x + quietZone} ${y + quietZone}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return parts.join("");
}

/** JSX 용 속성 묶음 — `<svg viewBox width height><rect .../><path d .../></svg>` */
export function qrSvgProps(modules: boolean[][], opts: QrSvgOptions = {}): QrSvgProps {
  const { moduleSize, quietZone, fg, bg } = { ...DEFAULTS, ...opts };
  const units = modules.length + quietZone * 2;
  return {
    viewBox: `0 0 ${units} ${units}`,
    width: units * moduleSize,
    height: units * moduleSize,
    path: qrPathData(modules, quietZone),
    fg,
    bg,
  };
}

/** 독립 SVG 문자열 — `<path>` 하나 */
export function qrSvgString(modules: boolean[][], opts: QrSvgOptions = {}): string {
  const p = qrSvgProps(modules, opts);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox}" width="${p.width}" height="${p.height}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${p.bg}"/>` +
    `<path d="${p.path}" fill="${p.fg}"/>` +
    `</svg>`
  );
}

/** `<img src>` 용 data URI */
export function qrDataUri(modules: boolean[][], opts: QrSvgOptions = {}): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvgString(modules, opts))}`;
}
