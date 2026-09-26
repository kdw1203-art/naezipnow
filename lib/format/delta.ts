/**
 * [1009] 등락 표기 공통 규칙 — 순수 함수(서버·클라이언트·테스트 어디서든).
 *
 * 왜 만들었나(2026-09-22 실측): 같은 "올랐다/내렸다"를 화면마다 따로 칠하고 따로 적었다.
 *   · 색 뒤집힘 — 단지 허브의 "지역 대비"(RegionRelative)와 지도 단지 패널 두 곳은 **상승=파랑·하락=빨강**,
 *     나머지(허브 차트·지도 말풍선·관심 단지·보고서)는 상승=빨강·하락=파랑. 한 화면 안에서 섞여 보였다.
 *   · 하락색이 테마를 탄다 — `.delta-down` 이 `--primary` 를 써서 /supply(초록)·/dev-deals(앰버)·
 *     /auctions(보라)·AI 도구 테마 안에서는 "하락"이 초록·주황·보라로 칠해졌다.
 *   · 0 근처 — 한 곳은 "0.0%", 한 곳은 "— 0.0%", 한 곳은 "▲ 0.0%".
 * 한국 증권·부동산 관례(토스증권·네이버 부동산 동일)를 한 곳에 적는다:
 *   상승 = 빨강 ▲ · 하락 = 파랑 ▼ · |변동| < 0.05% = "보합"(회색) · 모르면 "변동 미상"(지어내지 않는다).
 * 색은 여기서 다루지 않는다 — 방향(dir)만 돌려주고, 색은 CSS 토큰(--up/--down, .delta-up/.delta-down)이 정한다.
 */
import { formatEokMan } from "@/lib/format/eok-man";

export type DeltaDir = "up" | "down" | "flat";

/** 이 절댓값(%) 미만의 변동은 "보합" — 소수 첫째 자리에서 0.0 으로 보이는 구간과 같다 */
export const FLAT_PCT = 0.05;

export const DELTA_ARROW: Record<DeltaDir, string> = { up: "▲", down: "▼", flat: "" };
/** 스크린리더·문장용 방향 낱말 */
export const DELTA_WORD: Record<DeltaDir, string> = { up: "상승", down: "하락", flat: "보합" };
/** CSS 클래스(색) — globals.css `.delta-up/.delta-down/.delta-flat` */
export const DELTA_CLASS: Record<DeltaDir, string> = { up: "delta-up", down: "delta-down", flat: "delta-flat" };
/** 배지형(연한 면) — globals.css `.delta-up-b/...` */
export const DELTA_BADGE_CLASS: Record<DeltaDir, string> = { up: "delta-up-b", down: "delta-down-b", flat: "delta-flat-b" };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** (curr − base) ÷ base × 100. base 가 0 이하이거나 값이 없으면 null(모른다) */
export function pctChange(curr: number | null | undefined, base: number | null | undefined): number | null {
  if (!finite(curr) || !finite(base) || base <= 0) return null;
  return ((curr - base) / base) * 100;
}

/** 변동률(%) → 방향. 모르면 null */
export function deltaDir(pct: number | null | undefined, flat: number = FLAT_PCT): DeltaDir | null {
  if (!finite(pct)) return null;
  if (Math.abs(pct) < flat) return "flat";
  return pct > 0 ? "up" : "down";
}

/** 차이값(%p·건수·만원 등, 기준 없는 차이) → 방향. |diff| < eps(또는 정확히 0)면 flat —
    경계는 deltaDir 과 같게 "미만"이다(예전엔 %p 만 "이하"라 0.05 가 한쪽은 보합, 한쪽은 상승이었다 · 1009 리뷰 RA) */
export function diffDir(diff: number | null | undefined, eps = 0): DeltaDir | null {
  if (!finite(diff)) return null;
  if (diff === 0 || Math.abs(diff) < eps) return "flat";
  return diff > 0 ? "up" : "down";
}

function fixed(n: number, digits: number): string {
  return n.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 절댓값 % — "3.2%" */
export function absPctText(pct: number, digits = 1): string {
  return `${fixed(Math.abs(pct), digits)}%`;
}

/** 부호 붙은 % — "+3.2%" · "-1.1%" · 보합 구간은 "0.0%" */
export function signedPctText(pct: number, digits = 1, flat: number = FLAT_PCT): string {
  if (Math.abs(pct) < flat) return `${fixed(0, digits)}%`;
  return `${pct > 0 ? "+" : "-"}${fixed(Math.abs(pct), digits)}%`;
}

/**
 * 화면 표준 한 토막 — "▲ 3.2%" · "▼ 1.1%" · "보합" · 모르면 unknown("변동 미상").
 * (lib/newui/delta-label.ts 의 DELTA_UNKNOWN 과 같은 낱말)
 */
export function deltaText(
  pct: number | null | undefined,
  opts: { digits?: number; flatLabel?: string; unknown?: string; compact?: boolean } = {},
): string {
  const dir = deltaDir(pct);
  if (dir === null) return opts.unknown ?? "변동 미상";
  if (dir === "flat") return opts.flatLabel ?? "보합";
  const sep = opts.compact ? "" : " ";
  return `${DELTA_ARROW[dir]}${sep}${absPctText(pct as number, opts.digits ?? 1)}`;
}

/** 만원 차이의 절댓값 — "1억 2,000만원" · "800만원" (0 이면 "0원") */
export function absManwonText(diffManwon: number, unit: "만" | "만원" = "만원"): string {
  const a = Math.abs(Math.round(diffManwon));
  if (a === 0) return unit === "만원" ? "0원" : "0";
  return formatEokMan(a, { unit });
}

/** 문장 끝 — 올랐어요 / 내렸어요 / 그대로예요 */
export function deltaVerb(dir: DeltaDir): string {
  return dir === "up" ? "올랐어요" : dir === "down" ? "내렸어요" : "거의 그대로예요";
}

/**
 * 결론 한 줄(토스 관례: 숫자보다 문장이 먼저) — 모르면 null(문장을 지어내지 않는다).
 *   changeSentence({ curr: 84000, base: 81500, since: "1년 전보다", unit: "manwon" })
 *     → "1년 전보다 2,500만원(3.1%) 올랐어요"
 *   unit "pct"   : 값이 이미 %(전세가율 등) → 차이를 %p 로 — "지난달보다 1.2%p 올랐어요"
 *   unit "count" : 건수 → "지난달보다 12건(15.0%) 늘었어요"
 *   unit "index" : 지수 → "지난달보다 0.8% 올랐어요"
 */
export function changeSentence(input: {
  curr: number | null | undefined;
  base: number | null | undefined;
  since: string;
  unit: "manwon" | "pct" | "count" | "index";
  digits?: number;
}): string | null {
  const { curr, base, since } = input;
  if (!finite(curr) || !finite(base)) return null;
  const digits = input.digits ?? 1;
  if (input.unit === "pct") {
    const d = curr - base;
    const dir = diffDir(d, 0.05);
    if (!dir) return null;
    if (dir === "flat") return `${since} ${deltaVerb("flat")}`;
    return `${since} ${fixed(Math.abs(d), digits)}%p ${deltaVerb(dir)}`;
  }
  const pct = pctChange(curr, base);
  const dir = deltaDir(pct);
  if (pct === null || !dir) return null;
  if (dir === "flat") return `${since} ${deltaVerb("flat")}`;
  if (input.unit === "manwon") {
    return `${since} ${absManwonText(curr - base)}(${absPctText(pct, digits)}) ${deltaVerb(dir)}`;
  }
  if (input.unit === "count") {
    const n = Math.abs(Math.round(curr - base)).toLocaleString("ko-KR");
    return `${since} ${n}건(${absPctText(pct, digits)}) ${dir === "up" ? "늘었어요" : "줄었어요"}`;
  }
  return `${since} ${absPctText(pct, digits)} ${deltaVerb(dir)}`;
}
