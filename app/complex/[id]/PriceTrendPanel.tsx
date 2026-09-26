"use client";

import { useState } from "react";
import { ScrubLine, type ScrubRange } from "@/app/components/viz/ScrubLine";
import { Explain } from "@/app/components/explain/Explain";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";
import { useAreaUnit, unitAreaLabel } from "./AreaText";

/* [1009 · C] 단지 허브 "실거래가 추이" — 평형 탭(네이버 부동산) + 누르고 끌면 그 달 값(토스증권).

   왜(운영 DB 실측, 헬리오시티 2026.01~08 매매 134건 · 평형 8개): 예전 차트(PriceTrendChart, 서버 SVG)는
   ① 평형을 섞은 월평균 한 줄이라 그 달 팔린 평형 구성만 바뀌어도 출렁였고(84㎡ 3건 + 110㎡ 1건 달 = 30.9억 ↔ 84㎡만
      보면 29.6억), ② 거래 1건짜리 달과 24건짜리 달이 같은 무게로 그려졌고, ③ 색이 #1d4fd8 등 raw hex 라 다크 모드에서도
      그대로였고, ④ 포인터 반응이 없어 그 달 값을 읽으려면 아래 표를 따로 찾아야 했다.
   지금: 대표 평형(허브 첫 화면 대표가와 같은 평형)이 첫 탭, 거래 많은 평형 최대 4탭. 달마다 거래 수를 싣고 1~2건 달은
   속 빈 점(fewBelow 3). 색은 기간 등락(상승 빨강·하락 파랑, 토큰). 기간 탭은 12개월을 넘을 때만(ScrubLine 이 판정).
   이 파일은 PriceTrendLazy 가 따로 받는 청크다 — 라우트 번들(472/480KB)에 잡히지 않는다. */

export type PriceTrendTab = {
  key: string;
  unitM2: number | null;
  bandLabel: string | null;
  values: (number | null)[];
  counts: number[];
  total: number;
};

export type PriceTrendRep = { key: string; basis: "unit" | "band"; sampleSize: number; compare: boolean };

export function PriceTrendPanel({
  tabs,
  defaultKey,
  labels,
  fullLabels,
  ranges,
  complexName,
  truncated = false,
  rep = null,
}: {
  tabs: readonly PriceTrendTab[];
  defaultKey: string;
  /** "26.01" — 달력으로 이은 달 */
  labels: readonly string[];
  /** "2026년 1월" */
  fullLabels: readonly string[];
  ranges: readonly ScrubRange[];
  complexName: string;
  /** 읽기 상한에 걸려 가장 이른 달을 버렸는가 */
  truncated?: boolean;
  /** [1009 · C 리뷰] 첫 화면 대표가와 같은 평형(면적대)의 탭(hubSeries.rep) — 없으면 null */
  rep?: PriceTrendRep | null;
}) {
  const unit = useAreaUnit();
  const [key, setKey] = useState(defaultKey);
  const tab = tabs.find((t) => t.key === key) ?? tabs[0];
  if (!tab) return null;
  const label = (t: PriceTrendTab) =>
    t.unitM2 != null ? unitAreaLabel(t.unitM2, unit) : t.bandLabel ? areaBandLabelByUnit(t.bandLabel, unit) : "";
  const caption = tab.unitM2 != null ? `전용 ${label(tab)}` : label(tab);
  /* 마지막 값 있는 달이 1~2건이면 그래프 끝 점이 그 한두 건이다. 하네스 실측: 송도더샵퍼스트파크F15BL 59㎡ 26.08 은
     거래 1건(5.9억)이라 머리가 "▼ 32.2%" — 같은 평형 최근 6건 평균(첫 화면 대표가)은 오히려 0.4% 올랐다.
     ([1009 · 리뷰] ScrubLine 머리는 이제 거래 3건 이상인 달끼리 비교한다 — 끝 점이 한두 건이라는 안내는 그대로 둔다.) */
  let lastI = -1;
  for (let i = tab.values.length - 1; i >= 0; i--) {
    if (tab.values[i] != null) {
      lastI = i;
      break;
    }
  }
  const lastFew = lastI >= 0 && (tab.counts[lastI] ?? 0) < 3 ? { label: labels[lastI], n: tab.counts[lastI] ?? 0 } : null;
  /* [1009 · C 리뷰] "맨 위 대표가와 함께 보세요"는 대표가와 **같은 평형** 탭에서만 참이다(헬리오시티 99·110㎡ 탭에서 대표가는
     84㎡였다). 그리고 첫 화면이 "비교할 거래가 아직 적어요"라고 말한 평형이면 이 그래프도 기간 등락을 보이지 않는다 —
     머리(title)를 빼면 ScrubLine 은 등락을 그리지 않고, 훑을 때 말풍선에 그 달 값을 싣는다. */
  const isRep = rep != null && rep.key === tab.key;
  const noCompare = isRep && rep != null && !rep.compare;
  const isBand = tab.unitM2 == null;

  return (
    <section aria-label="실거래가 추이" className="card flex flex-col gap-2.5 rounded-[14px] px-[15px] py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-0.5 t-body font-extrabold text-ink">
          실거래가 추이
          <Explain
            term="silgeoraega"
            title="실거래가 추이"
            how={[
              isBand
                ? "고른 면적대(예: 60~85㎡)에 든 매매 거래의 그 달 평균이에요. 평형마다 거래가 적어 면적대로 묶었어요 — 그 달 팔린 평형 구성에 따라 조금 출렁일 수 있어요."
                : "고른 평형(전용면적을 정수로 내림 — 84.99㎡는 84㎡)의 그 달 매매 거래 평균이에요. 평형을 섞지 않아요 — 섞은 평균은 그 달 팔린 평형 구성에 따라 출렁여요.",
              "거래가 1~2건인 달은 속 빈 점으로 그리고 실선에서 빼요 — 한두 건이 평균을 크게 움직일 수 있어요. 평형 탭은 거래 3건 이상인 달이 둘 이상일 때만 만들어요.",
              "거래가 없는 달은 비워 두고 점선으로 건너뛰어요. 없는 값을 채워 넣지 않아요.",
              "맨 위 대표가의 등락은 한 건 단위 거래 평균(최근 N건 ↔ 기간 첫 거래들)끼리, 이 그래프 머리는 달 평균끼리 비교라 숫자가 조금 다를 수 있어요.",
              "해제 신고된 거래는 빼요. 신고 기한이 계약 후 30일이라 최근 1~2개월은 덜 들어와 있을 수 있어요.",
            ]}
            source="국토교통부 실거래가 공개시스템"
          />
        </h3>
        {tabs.length > 1 && <span className="t-caption text-text-3">평형 {tabs.length}개</span>}
      </div>

      {tabs.length > 1 && (
        <div
          role="group"
          aria-label="평형"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => {
            const on = t.key === tab.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setKey(t.key)}
                className={`chip press shrink-0 px-3 py-1.5 t-sub tabular-nums ${
                  on ? "chip-active" : "border border-line bg-surface text-text-2"
                }`}
              >
                {label(t)}
                <span className="ml-1 font-normal">{t.total}건</span>
              </button>
            );
          })}
        </div>
      )}

      {lastFew && (
        <p className="-mb-1 rounded-lg bg-bg px-2.5 py-1.5 t-caption text-text-2">
          최근 달({lastFew.label})은 거래 {lastFew.n}건이라 그 {lastFew.n === 1 ? "한 건" : "두 건"} 값에 크게 흔들려요
          {isRep && rep
            ? ` — 맨 위 대표가(같은 ${rep.basis === "band" ? "면적대" : "평형"} 최근 ${rep.sampleSize}건 평균)와 함께 보세요.`
            : "."}
        </p>
      )}

      {noCompare && (
        <p className="-mb-1 t-caption text-text-3">
          월평균 실거래가 · {caption} — 맨 위 대표가처럼 거래가 적어 기간 등락은 적지 않아요. 누르고 끌면 그 달 값을 봐요.
        </p>
      )}

      <ScrubLine
        values={tab.values}
        labels={labels}
        fullLabels={fullLabels}
        counts={tab.counts}
        countLabel="거래"
        fewBelow={3}
        format="eok1"
        tone="primary"
        title={noCompare ? undefined : "월평균 실거래가"}
        caption={caption}
        ranges={ranges}
        defaultRange="all"
        ariaLabel={`${complexName} ${caption} 월평균 실거래가 추이`}
        footnote={`국토교통부 실거래가(해제 신고 제외) · ${caption} 월평균 · 속 빈 점은 그 달 거래 1~2건 · 최근 1~2개월은 신고 중일 수 있어요${
          /* [1009 · C 리뷰] 예전 문구 "가장 오래된 달은 일부만 읽었어요"는 사실과 달랐다 — 그 달은 그래프에서 뺀다(대표가 비교 기준도 같이) */
          truncated ? " · 읽기 상한에 걸려 일부만 읽힌 가장 이른 달은 뺐어요" : ""
        }`}
      />
    </section>
  );
}

export default PriceTrendPanel;
