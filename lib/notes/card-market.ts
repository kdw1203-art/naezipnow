import "server-only";
import { getRegionSnapshot } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";
import type { CardMarketFacts } from "@/lib/notes/card-source";

/**
 * 공유 카드에 얹을 **노트 밖의 숫자** — 소유자 지시("기타 관련 정보를 추가로 넣어서").
 *
 * 사용자가 현장에서 볼 수 없는 값(평단가·월간 변동·전세가율·거래량)을 자기 기록
 * 옆에 나란히 놓는다. 그래야 카드가 "내가 본 것"에서 "내가 본 것 + 시장이 말하는 것"이 된다.
 *
 * ── 지키는 것 ──────────────────────────────────────────────────────────────
 * ① **못 읽으면 null.** 그러면 market 장이 통째로 빠진다(card-frames 의 available).
 *    카드는 공유되는 이미지다 — 한 번 나가면 되돌릴 수 없어서, 빈 숫자를 그리는 순간
 *    그 카드가 곧 거짓 주장이 된다.
 * ② **기준 시점을 값마다 붙인다.** 지역 통계는 공표 주기가 달라 "지금"이 아니다.
 * ③ **출처를 카드 안에 찍는다.** 숫자만 남고 근거가 빠지면 그때부터 주장이다.
 * ④ 지역 단위 통계임을 숨기지 않는다 — 단지 값이 아니다.
 */
export async function loadCardMarketFacts(region: string | null | undefined): Promise<CardMarketFacts | null> {
  const name = (region ?? "").trim();
  if (!name) return null;
  try {
    const matched = matchRegionByName(name);
    if (!matched) return null;
    const snap = await getRegionSnapshot(matched.id);
    if (!snap) return null;

    const period = snap.period ? String(snap.period) : null;
    const rows: CardMarketFacts["rows"] = [];

    if (typeof snap.perM2Sale === "number" && snap.perM2Sale > 0) {
      rows.push({
        label: "㎡당 매매",
        value: `${Math.round(snap.perM2Sale / 10_000).toLocaleString("ko-KR")}만원`,
        note: period,
      });
    }
    if (typeof snap.saleChangeMonthly === "number") {
      const v = snap.saleChangeMonthly;
      rows.push({
        label: "월간 변동",
        value: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
        note: period,
      });
    }
    if (typeof snap.jeonseRatio === "number") {
      rows.push({ label: "전세가율", value: `${snap.jeonseRatio.toFixed(1)}%`, note: period });
    }
    if (typeof snap.tradeCount === "number" && snap.tradeCount > 0) {
      rows.push({
        label: "월 거래",
        value: `${Math.round(snap.tradeCount).toLocaleString("ko-KR")}건`,
        note: period,
      });
    }

    if (rows.length === 0) return null;

    /* 지역 단위임을 출처 줄에 적는다 — 단지 값으로 오해되면 카드가 사실을 왜곡한다 */
    const src = snap.source ? String(snap.source) : "공표 통계";
    return { rows, source: `${matched.city} ${matched.name} 기준 · ${src}` };
  } catch {
    /* 조회 실패를 빈 값으로 바꾸지 않는다 — null 이면 장이 빠질 뿐이다 */
    return null;
  }
}
