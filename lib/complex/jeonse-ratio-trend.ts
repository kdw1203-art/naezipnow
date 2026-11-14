/* [1179] 단지 전세가율 추이 — 전세가율 카드와 같은 규칙을 달마다 굴린다.
   그 달까지 최근 6개월의 전세 보증금 표본 중앙 ÷ 같은 기간 매매 거래가 중앙 × 100, 전세 · 매매 각 3건 이상일 때만.
   조건을 못 채운 달은 값을 만들지 않는다(null). 면적 미가중 — 카드와 같은 한계를 그대로 갖는다. */

export type RatioPoint = { ym: string; pct: number | null; tradeCount: number; jeonseCount: number };

const WINDOW = 6;
const MIN_EACH = 3;

function ymIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(4, 6)) - 1);
}
function ymOf(idx: number): string {
  return `${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, "0")}`;
}
function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * @param trades 매매(해제 제외) — ym(YYYYMM) · man(만원)
 * @param jeonse 전세 표본 — ym · depositKrw(월세 0원인 신고만 넘긴다)
 * @param months 마지막 달부터 거슬러 몇 달을 그릴지(기본 12)
 */
export function jeonseRatioTrend(
  trades: readonly { ym: string; man: number }[],
  jeonse: readonly { ym: string; depositKrw: number }[],
  months = 12,
): RatioPoint[] {
  const ok = (ym: string) => /^\d{6}$/.test(ym);
  const t = trades.filter((d) => ok(d.ym) && d.man > 0);
  const j = jeonse.filter((d) => ok(d.ym) && d.depositKrw > 0);
  if (t.length === 0 || j.length === 0) return [];
  const last = Math.max(...t.map((d) => ymIndex(d.ym)), ...j.map((d) => ymIndex(d.ym)));
  const out: RatioPoint[] = [];
  for (let end = last - months + 1; end <= last; end += 1) {
    const from = end - WINDOW + 1;
    const inWin = (ym: string) => {
      const i = ymIndex(ym);
      return i >= from && i <= end;
    };
    const tv = t.filter((d) => inWin(d.ym)).map((d) => d.man * 10_000).sort((a, b) => a - b);
    const jv = j.filter((d) => inWin(d.ym)).map((d) => d.depositKrw).sort((a, b) => a - b);
    const tm = median(tv);
    const jm = median(jv);
    const pct = tv.length >= MIN_EACH && jv.length >= MIN_EACH && tm && jm ? Math.round((jm / tm) * 1000) / 10 : null;
    out.push({ ym: ymOf(end), pct, tradeCount: tv.length, jeonseCount: jv.length });
  }
  return out;
}

/** 추이 한 줄 — 값이 있는 첫 달과 마지막 달("25.12 58.3% → 26.11 61.2% · +2.9%p"). 값 있는 달이 2개 미만이면 null */
export function ratioTrendLine(points: readonly RatioPoint[]): string | null {
  const have = points.filter((p): p is RatioPoint & { pct: number } => p.pct !== null);
  if (have.length < 2) return null;
  const a = have[0];
  const b = have[have.length - 1];
  const d = Math.round((b.pct - a.pct) * 10) / 10;
  const short = (ym: string) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
  return `${short(a.ym)} ${a.pct}% → ${short(b.ym)} ${b.pct}% · ${d > 0 ? "+" : ""}${d}%p`;
}
