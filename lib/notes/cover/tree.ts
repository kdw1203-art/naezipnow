/**
 * 썸네일 그림 트리 — next/og(satori)에 넘길 React 요소를 **JSX 없이** 만든다. 순수 함수라 서버 없이
 * node:test 가 트리를 직접 검사한다(렌더 라우트·미리보기 라우트가 같은 함수를 부른다).
 *
 * 변형 3종(+사진) — 같은 테마(브랜드 네이비·한지·주홍 온점·나우블루, Pretendard, 정사각):
 *   navy   네이비 면 + 한지 글자 + 주홍 온점(어두운 면용 #E0563A)
 *   hanji  한지 면 + 남색 글자 + 주홍 온점 + 글 묶음 왼쪽 남색 세로줄
 *   light  연파랑 면 + 남색 제목 + 나우블루 사실 + 주홍 온점 + 위 가장자리 나우블루 띠
 *   photo  사람 노트의 첫 사진 + 아래쪽 네이비 가독 오버레이(그라데이션은 여기에만) + 한지 글자
 * 공통 배치: 위 = 심볼(처마·온점) + "내집나우 임장노트", 아래 = 제목(1~2줄) · 온점 + 사실 · 보조 줄.
 *
 * satori 규칙: 자식이 둘 이상인 div 는 display:flex 를 명시해야 한다. 글자는 전부 텍스트 노드로만 넣는다
 * (사용자 문구가 마크업으로 해석될 길이 없다 — XSS 안전).
 */
import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { COVER_COLORS, COVER_SIZE, type CoverVariant } from "./spec";

export type CoverRenderInput = {
  variant: CoverVariant;
  headline: string;
  fact: string | null;
  sub: string;
  /** photo 변형의 배경 — data: URI 또는 허용된 https 주소. 없으면 photo 는 navy 로 그린다 */
  photoSrc?: string | null;
};

type Palette = {
  bg: string;
  headline: string;
  fact: string;
  sub: string;
  brand: string;
  eave: string;
  dot: string;
};

const rgba = (hex: string, a: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const C = COVER_COLORS;

export const COVER_PALETTES: Record<CoverVariant, Palette> = {
  navy: {
    bg: C.navy,
    headline: C.hanji,
    fact: C.hanji,
    sub: rgba(C.hanji, 0.64),
    brand: rgba(C.hanji, 0.72),
    eave: C.hanji,
    dot: C.redDark,
  },
  hanji: {
    bg: C.hanji,
    headline: C.navy,
    fact: C.navy,
    sub: rgba(C.navy, 0.62),
    brand: rgba(C.navy, 0.64),
    eave: C.navy,
    dot: C.red,
  },
  light: {
    bg: C.blueSoft,
    headline: C.navy,
    fact: C.blue,
    sub: rgba(C.navy, 0.6),
    brand: rgba(C.navy, 0.62),
    eave: C.navy,
    dot: C.red,
  },
  photo: {
    bg: C.navy,
    headline: C.hanji,
    fact: C.hanji,
    sub: rgba(C.hanji, 0.78),
    brand: C.hanji,
    eave: C.hanji,
    dot: C.redDark,
  },
};

/* ── 글자 폭 어림(em) — Pretendard Bold 기준. 한 줄에 들어가는지·몇 px 로 쓸지 정하는 데만 쓴다 ── */
export function visualWidth(text: string): number {
  let w = 0;
  for (const ch of Array.from(text)) {
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ㌀-㏿一-鿿]/.test(ch)) w += 1;
    else if (ch === " ") w += 0.28;
    else if (/[0-9]/.test(ch)) w += 0.6;
    else if (/[A-Z]/.test(ch)) w += 0.66;
    else if (/[a-z]/.test(ch)) w += 0.56;
    else if (ch === "%") w += 0.86;
    else if (/[.,·:;'"()\[\]!?/]/.test(ch)) w += 0.34;
    else if (/[+\-−–~→=]/.test(ch)) w += 0.62;
    else w += 0.9;
  }
  return w;
}

/* 두 줄로 나눌 때 좋은 자리 — 단지명 뒤·브랜드명 앞·숫자 묶음 앞 */
const BREAK_AFTER = ["단지", "마을", "타운", "시티", "역"];
const BREAK_BEFORE = ["푸르지오", "자이", "아이파크", "힐스테이트", "래미안", "롯데캐슬", "센트럴", "더샵", "e편한세상", "캐슬", "파크", "포레온", "그라시엘"];

function splitScore(left: string, right: string): number {
  let cost = Math.max(visualWidth(left), visualWidth(right));
  if (BREAK_AFTER.some((w) => left.endsWith(w)) || BREAK_BEFORE.some((w) => right.startsWith(w))) cost -= 2;
  if (/[가-힣]$/.test(left) && /^\d/.test(right)) cost -= 1.2; // "목동신시가지|13단지"
  if (/\d$/.test(left) && /^[\d가-힣]/.test(right)) cost += 3; // "2|단지" 처럼 숫자와 단위를 가르지 않는다
  if (/^[\s·,)]/.test(right) || /[(]$/.test(left)) cost += 3;
  return cost;
}

/** 제목 줄 나누기 — 한 줄에 들어가면 한 줄, 아니면 공백 기준 두 줄, 공백이 없으면 가장 자연스러운 자리 */
export function headlineLines(text: string, singleMax = 8.2): string[] {
  const t = text.trim();
  if (visualWidth(t) <= singleMax) return [t];
  const words = t.split(" ");
  if (words.length > 1) {
    let best: [string, string] = [t, ""];
    let bestCost = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const l = words.slice(0, i).join(" ");
      const r = words.slice(i).join(" ");
      const cost = Math.max(visualWidth(l), visualWidth(r));
      if (cost < bestCost) {
        bestCost = cost;
        best = [l, r];
      }
    }
    return best[1] ? best : [t];
  }
  const chars = Array.from(t);
  let bestAt = Math.ceil(chars.length / 2);
  let bestCost = Infinity;
  for (let i = 2; i <= chars.length - 2; i += 1) {
    const cost = splitScore(chars.slice(0, i).join(""), chars.slice(i).join(""));
    /* 같으면 앞 줄이 긴 쪽 — "래미안길음|센터피스" */
    if (cost <= bestCost) {
      bestCost = cost;
      bestAt = i;
    }
  }
  return [chars.slice(0, bestAt).join(""), chars.slice(bestAt).join("")];
}

/** 사실 줄 나누기 — 11em 이 넘으면 공백 기준 두 줄(공백이 없으면 한 줄로 두고 글자를 줄인다) */
export function factLines(text: string): string[] {
  const t = text.trim();
  if (visualWidth(t) <= 11) return [t];
  const words = t.split(" ");
  if (words.length < 2) return [t];
  let best: [string, string] = [t, ""];
  let bestCost = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const l = words.slice(0, i).join(" ");
    const r = words.slice(i).join(" ");
    const cost = Math.max(visualWidth(l), visualWidth(r));
    if (cost < bestCost) {
      bestCost = cost;
      best = [l, r];
    }
  }
  return best[1] ? best : [t];
}

/** 주어진 폭(px)에 가장 긴 줄이 들어가는 글자 크기(px) — 상한·하한 안에서 */
export function fitFontSize(lines: string[], widthPx: number, maxPx: number, minPx: number, extraEm = 0): number {
  const widest = Math.max(...lines.map(visualWidth), 1) + extraEm;
  return Math.max(minPx, Math.min(maxPx, Math.floor(widthPx / widest)));
}

type Child = ReactNode;
const el = (type: string, props: Record<string, unknown> | null, ...children: Child[]): ReactElement =>
  createElement(type, props, ...children);
const box = (style: CSSProperties, ...children: Child[]) => el("div", { style: { display: "flex", ...style } }, ...children);

/** 브랜드 심볼 — 처마 곡선 + 용마루 짧은 선 + 주홍 온점(app/api/og 명함 뒷면과 같은 도형) */
function symbol(size: number, eave: string, dot: string): ReactElement {
  return el(
    "svg",
    { width: size, height: size, viewBox: "0 0 120 120" },
    el("path", { d: "M52 28 L68 28", fill: "none", stroke: eave, strokeWidth: 8, strokeLinecap: "round" }),
    el("path", { d: "M14 46 C 38 64, 82 64, 106 46", fill: "none", stroke: eave, strokeWidth: 8, strokeLinecap: "round" }),
    el("circle", { cx: 60, cy: 86, r: 10, fill: dot }),
  );
}

export type CoverTreeOptions = {
  /** 한 변(px) — 기본 720 */
  size?: number;
  /** satori 에 등록한 글꼴 이름 */
  fontFamily?: string;
  /** [1015] 넓은 판(1200×630) — 카드 커버(3:2·16:9)처럼 가로로 넓은 자리용. 정사각 판을 잘라 쓰면
   *  제목이 잘렸다(소유자: "썸네일 비율이 이상해서 화면에 제대로 안 나온다"). 배치는 같고 폭만 넓다. */
  shape?: "square" | "wide";
};

/** 넓은 판 크기 — OG 표준(1200×630) */
export const COVER_WIDE = { width: 1200, height: 630 } as const;

/**
 * 썸네일 한 장의 요소 트리. 크기를 바꿔도 비율이 같게 모든 치수를 size/720 로 늘인다.
 */
export function buildCoverTree(input: CoverRenderInput, opts: CoverTreeOptions = {}): ReactElement {
  const wide = opts.shape === "wide";
  const size = opts.size ?? (wide ? COVER_WIDE.height : COVER_SIZE);
  const width = wide ? Math.round(size * (COVER_WIDE.width / COVER_WIDE.height)) : size;
  const k = size / COVER_SIZE;
  const px = (n: number) => Math.round(n * k);
  const photo = input.variant === "photo" && input.photoSrc ? input.photoSrc : null;
  const variant: CoverVariant = input.variant === "photo" && !photo ? "navy" : input.variant;
  const p = COVER_PALETTES[variant];
  const pad = px(56);
  const inner = width - pad * 2;
  const leftRule = variant === "hanji" ? px(8) + px(28) : 0;
  const textWidth = inner - leftRule;

  /* 넓은 판은 제목이 한 줄에 들어가는 폭이 넓다 — 한 줄 상한을 폭에 비례해 올린다 */
  const hLines = headlineLines(input.headline, wide ? 8.2 * (width / size) * 0.85 : undefined);
  const hSize = fitFontSize(hLines, textWidth, px(hLines.length > 1 ? 92 : 100), px(48));
  const fLines = input.fact ? factLines(input.fact) : [];
  const dotSize = px(16);
  const fSize = input.fact ? fitFontSize(fLines, textWidth - dotSize - px(16), px(54), px(30)) : 0;
  const sSize = input.sub ? fitFontSize([input.sub], textWidth, px(28), px(18)) : 0;

  const layers: ReactElement[] = [];
  if (photo) {
    layers.push(
      el("img", {
        src: photo,
        width,
        height: size,
        style: { position: "absolute", top: 0, left: 0, width, height: size, objectFit: "cover" },
      }),
    );
    /* 사진 위 글자 가독 오버레이 — 그라데이션은 이 변형(사진 위)에만 쓴다 */
    layers.push(
      box({
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: Math.round(size * 0.68),
        backgroundImage: `linear-gradient(180deg, ${rgba(C.navy, 0)} 0%, ${rgba(C.navy, 0.55)} 38%, ${rgba(C.navy, 0.92)} 100%)`,
      }),
    );
    /* 위쪽 브랜드 줄 뒤 옅은 네이비 → 투명(밝은 하늘 사진에서도 브랜드 줄이 읽히게) — 같은 가독 오버레이 */
    layers.push(
      box({
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: px(180),
        backgroundImage: `linear-gradient(180deg, ${rgba(C.navy, 0.5)} 0%, ${rgba(C.navy, 0)} 100%)`,
      }),
    );
  }
  if (variant === "light") {
    layers.push(box({ position: "absolute", left: 0, right: 0, top: 0, height: px(12), backgroundColor: C.blue }));
  }

  const brandRow = box(
    { alignItems: "center", gap: px(12), position: "relative" },
    symbol(px(40), p.eave, p.dot),
    el("div", { style: { display: "flex", fontSize: px(24), color: p.brand, letterSpacing: px(1) } }, "내집나우 임장노트"),
  );

  const headline = box(
    { flexDirection: "column" },
    ...hLines.map((line) =>
      el(
        "div",
        {
          style: {
            display: "flex",
            fontSize: hSize,
            lineHeight: 1.12,
            letterSpacing: -Math.round(hSize * 0.03),
            color: p.headline,
            whiteSpace: "nowrap",
          },
        },
        line,
      ),
    ),
  );

  const fact = input.fact
    ? box(
        { alignItems: fLines.length > 1 ? "flex-start" : "center", gap: px(16) },
        el("div", {
          style: {
            display: "flex",
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize,
            backgroundColor: p.dot,
            flexShrink: 0,
            marginTop: fLines.length > 1 ? Math.round(fSize * 0.45) : 0,
          },
        }),
        box(
          { flexDirection: "column" },
          ...fLines.map((line) =>
            el(
              "div",
              { style: { display: "flex", fontSize: fSize, lineHeight: 1.2, color: p.fact, whiteSpace: "nowrap", letterSpacing: -Math.round(fSize * 0.02) } },
              line,
            ),
          ),
        ),
      )
    : null;

  const sub = input.sub
    ? el("div", { style: { display: "flex", fontSize: sSize, color: p.sub, whiteSpace: "nowrap" } }, input.sub)
    : null;

  const textBlock = box(
    {
      flexDirection: "column",
      gap: px(22),
      position: "relative",
      ...(variant === "hanji" ? { borderLeft: `${px(8)}px solid ${C.navy}`, paddingLeft: px(28) } : {}),
    },
    headline,
    ...(fact ? [fact] : []),
    ...(sub ? [sub] : []),
  );

  return el(
    "div",
    {
      style: {
        width,
        height: size,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: pad,
        backgroundColor: p.bg,
        fontFamily: opts.fontFamily ?? "Pretendard",
        fontWeight: 700,
        position: "relative",
        overflow: "hidden",
      },
    },
    ...layers,
    brandRow,
    textBlock,
  );
}

/** 테스트·로그용 — 트리 안의 모든 글자를 순서대로 */
export function treeTexts(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n === "object" && "props" in (n as Record<string, unknown>)) {
      walk(((n as { props?: { children?: unknown } }).props ?? {}).children);
    }
  };
  walk(node);
  return out;
}

/** 테스트용 — 트리 안의 style 값 중 그라데이션이 몇 개인가 */
export function treeGradientCount(node: unknown): number {
  let count = 0;
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const props = (n as { props?: Record<string, unknown> }).props;
    if (!props) return;
    const style = props.style as Record<string, unknown> | undefined;
    if (style) for (const v of Object.values(style)) if (typeof v === "string" && /gradient\(/.test(v)) count += 1;
    walk(props.children);
  };
  walk(node);
  return count;
}
