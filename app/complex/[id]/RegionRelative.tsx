import { Delta } from "@/app/components/num/Delta";
import { ExplainLazy as Explain } from "./ExplainLazy";
import { deltaDir } from "@/lib/format/delta";
import type { RegionRelative as RegionRelativeData } from "@/lib/complex/complex-store";
import { loadRegionRelative, logSectionFailure, withSectionBudget } from "./section-loaders";

/* D6 — 지역 대비 상대 위치. 단지 ㎡당 시세를 소재 구 평균(REB 실집계)과 비교.
   데이터 없으면 렌더 생략(사실 우선).

   조회 실패는 "데이터 없음"이 아니다. 예전엔 .catch(() => null) 로 둘을 같게 그렸다.

   [1009 · C] 등락색이 뒤집혀 있었다 — "구 시세 변동"을 상승=파랑(text-primary)·하락=빨강(text-danger)으로 칠해
   바로 위 허브 차트(상승=빨강)와 한 화면에서 반대로 읽혔다. 이제 <Delta>(상승 ▲ 빨강 · 하락 ▼ 파랑 · 보합, 토큰 --up/--down)
   이고, 기준 없는 %("구 시세 변동 +1.03%")에 기준을 붙였다: "{구} 매매가격 전월 대비 · {기준월} 한국부동산원".
   계산 방법은 ⓘ 시트에 코드(getRegionRelative)와 같은 말로 적는다. 보기(RegionRelativeView)는 데이터만 받는다. */

function ymLabel(s: string | null): string {
  if (!s || s.length < 6) return "";
  return `${s.slice(0, 4)}.${s.slice(4)}`;
}

export function RegionRelativeView({ r, compact = false }: { r: RegionRelativeData; compact?: boolean }) {
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  const dir = deltaDir(r.deltaPct);
  const verdict = dir === "up" ? "높아요" : "낮아요";
  const maxV = Math.max(r.complexPerM2Manwon, r.districtPerM2Manwon, 1);
  const complexW = Math.min(100, Math.round((r.complexPerM2Manwon / maxV) * 100));
  const districtW = Math.min(100, Math.round((r.districtPerM2Manwon / maxV) * 100));
  const period = ymLabel(r.period);

  return (
    <section className={wrap}>
      <h2 className="mb-1.5 flex flex-wrap items-center gap-x-1 px-0.5 t-section text-ink">
        이 동네 대비
        <span className="t-sub font-medium text-text-3">{r.district} · ㎡당</span>
        <Explain
          term="pyeongdanga"
          title="이 동네 대비(㎡당)"
          how={[
            "면적이 다른 집끼리 견주려고 평당가 대신 ㎡당 가격을 써요(㎡당 × 3.3058 = 평당).",
            "이 단지: 최근 매매 60건(전용면적이 있는 거래)마다 거래금액 ÷ 전용면적을 구해 평균했어요.",
            `${r.district} 평균: 한국부동산원 ${period || "최근"} 아파트 ㎡당 평균 매매가격이에요.`,
            `차이 = (이 단지 − ${r.district} 평균) ÷ ${r.district} 평균 × 100. 층·향·연식은 반영하지 않아요.`,
          ]}
          source={`국토교통부 실거래가 · 한국부동산원${period ? ` ${period}` : ""}`}
        />
      </h2>
      <div className={`card flex flex-col gap-2.5 rounded-2xl ${compact ? "px-4 py-3.5" : "p-5"}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          {dir === "up" || dir === "down" ? (
            <>
              <Delta pct={r.deltaPct} className="t-title" srContext={`${r.district} 평균보다`} />
              <span className="t-sub text-text-2">
                {r.district} 평균보다 {verdict}
              </span>
            </>
          ) : (
            <span className="t-section text-ink">{r.district} 평균과 비슷해요</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <div className="mb-0.5 flex justify-between t-sub">
              <span className="font-bold text-ink">이 단지</span>
              <span className="tabular-nums text-ink">{r.complexPerM2Manwon.toLocaleString("ko-KR")}만/㎡</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${complexW}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-0.5 flex justify-between t-sub">
              <span className="text-text-3">{r.district} 평균</span>
              <span className="tabular-nums text-text-3">{r.districtPerM2Manwon.toLocaleString("ko-KR")}만/㎡</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-line-strong" style={{ width: `${districtW}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-sub text-text-3">
          {r.saleChangePct != null && (
            <span className="inline-flex flex-wrap items-center gap-x-1">
              {r.district} 매매가격
              <Delta pct={r.saleChangePct} srContext="전월보다" />
              전월 대비
              <Explain
                term="maemae-gagyeok-jisu"
                how={`한국부동산원이 매달 발표하는 ${r.district} 아파트 매매가격 변동률(전월 대비)이에요 — 이 단지가 아니라 ${r.district} 전체의 흐름이에요.`}
                source={`한국부동산원${period ? ` · ${period}` : ""}`}
              />
            </span>
          )}
          {r.jeonseRatio != null && (
            <span>
              {r.district} 전세가율 <b className="tabular-nums text-text-2">{r.jeonseRatio}%</b>
            </span>
          )}
          {period && <span>{period} 기준 · 한국부동산원</span>}
        </div>
      </div>
    </section>
  );
}

export async function RegionRelative({
  complexId,
  compact = false,
}: {
  complexId: string;
  compact?: boolean;
}) {
  /* [968 · 1] 공유 예산 3초 — 넘기면 아래 실패 갈래로 간다 */
  const res = await withSectionBudget(loadRegionRelative(complexId)).then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => {
      logSectionFailure("지역 대비 시세", e);
      return { ok: false as const };
    },
  );
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  if (!res.ok) {
    return (
      <section className={wrap}>
        <h2 className="mb-1.5 px-0.5 t-section text-ink">이 동네 대비</h2>
        <p className="card rounded-2xl px-4 py-3.5 t-body text-text-3">
          지금은 동네 평균과 비교하지 못했어요. 비교할 자료가 없는 게 아니라 조회에
          실패한 것이라, 잠시 후 다시 보면 나올 수 있어요.
        </p>
      </section>
    );
  }
  const r = res.data;
  if (!r) return null;
  return <RegionRelativeView r={r} compact={compact} />;
}
