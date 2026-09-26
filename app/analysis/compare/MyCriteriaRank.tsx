"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COMPARE_WEIGHTS_KEY,
  CRITERIA,
  DEFAULT_WEIGHTS,
  WEIGHT_LABEL,
  dropReasonText,
  labelOf,
  parseWeights,
  scoreByCriteria,
  winnerLine,
  type CriteriaInput,
  type CriterionKey,
  type Weight,
  type Weights,
} from "@/lib/compare/my-criteria";
import { Segmented } from "@/app/components/ui/Segmented";
import { TweenNumber } from "@/app/components/motion/TweenNumber";

/* [1008 · Q] 후보 비교 "내 기준" 순위 — 결정 순간의 도구. 위 비교표에 **이미 있는 값**만 쓰고
   (추가 조회 없음), 기준마다 중요도(중요 ×2 · 보통 ×1 · 안 봄)를 고르면 담은 후보 사이의
   순위를 다시 매긴다. 중요도는 이 기기의 localStorage 에만(서버 개인화 없음).
   값이 한 곳에만 있거나 모두 같은 기준은 모두에게서 빼고 그 줄에 이유를 적는다(리뷰 C). */

const WEIGHT_ORDER: readonly Weight[] = [2, 1, 0];
/* [1009 · A] 중요도 고르기는 같은 화면 상태 전환 — 공용 Segmented(선택 표시가 미끄러진다)로.
   Segmented 는 문자열 값을 받으므로 "2"·"1"·"0" 으로 넘기고 받는다. */
const WEIGHT_OPTIONS = WEIGHT_ORDER.map((w) => ({ value: String(w) as "0" | "1" | "2", label: WEIGHT_LABEL[w] }));

export function MyCriteriaRank({ items }: { items: CriteriaInput[] }) {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    try {
      setWeights(parseWeights(window.localStorage.getItem(COMPARE_WEIGHTS_KEY)));
    } catch {
      /* 저장소를 못 읽으면 기본값(모두 보통) */
    }
  }, []);

  const pick = (key: CriterionKey, w: Weight) => {
    const next = { ...weights, [key]: w };
    setWeights(next);
    try {
      window.localStorage.setItem(COMPARE_WEIGHTS_KEY, JSON.stringify(next));
    } catch {
      /* 사생활 보호 모드 등 — 이번 화면에서만 유지 */
    }
  };

  const result = useMemo(() => scoreByCriteria(items, weights), [items, weights]);
  const line = winnerLine(result, weights);
  const anyActive = CRITERIA.some((c) => weights[c.key] > 0);
  const dropped = new Map(result.dropped.map((d) => [d.key, d.reason]));
  const inputById = new Map(items.map((i) => [i.id, i]));

  return (
    <section aria-labelledby="my-criteria-title" className="card flex flex-col gap-3 rounded-[14px] p-4">
      <div>
        <h2 id="my-criteria-title" className="t-section text-ink">
          내 기준으로 줄 세우기
        </h2>
        <p className="mt-0.5 t-sub text-text-3">
          위 표의 값만 써요. 기준마다 중요도를 고르면 순위를 바로 다시 매겨요 — 중요는 두 배로 치고, 안 봄은
          계산에서 빼요.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-divider">
        {CRITERIA.map((c) => {
          const why = dropped.get(c.key);
          return (
            <div key={c.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2">
              <div className="min-w-0">
                <div className="t-body font-bold text-ink">{c.label}</div>
                <div className="t-caption text-text-3">{c.hint}</div>
                {why && <div className="t-caption font-bold text-warning">이번 후보들로는 {dropReasonText(why)}</div>}
              </div>
              <Segmented
                options={WEIGHT_OPTIONS}
                value={String(weights[c.key]) as "0" | "1" | "2"}
                onChange={(v) => pick(c.key, Number(v) as Weight)}
                ariaLabel={`${c.label} 중요도`}
                className="shrink-0"
              />
            </div>
          );
        })}
      </div>

      {!anyActive ? (
        <p className="rounded-xl bg-bg px-3 py-2.5 t-sub text-text-2">기준을 하나 이상 &quot;보통&quot;이나 &quot;중요&quot;로 골라 주세요.</p>
      ) : result.used.length === 0 ? (
        <p className="rounded-xl bg-bg px-3 py-2.5 t-sub text-text-2">
          고른 기준으로는 후보를 가를 수 없어요 — 기준마다 값이 한 곳에만 있거나 모두 같아요. 다른 기준을 켜 보세요.
        </p>
      ) : (
        <>
          {line && <p className="rounded-xl bg-primary-soft px-3 py-2.5 t-body font-bold text-primary">{line}</p>}
          <ol className="flex flex-col gap-2">
            {result.ranked.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 w-9 shrink-0 text-center t-body font-extrabold tabular-nums ${
                    s.rank === 1 ? "text-primary" : "text-text-2"
                  }`}
                >
                  {s.rank ? `${s.rank}위` : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="t-sub font-bold break-words text-ink">{s.name}</span>
                    {/* 소수 한 자리 — 정수로 반올림하면 순위가 다른 두 단지가 같은 "60점"으로 보였다.
                        [1009 · A] 중요도를 바꾸면 점수가 이전 값에서 새 값으로 굴러간다(TweenNumber — 무엇이 얼마나 바뀌었는지 보이게) */}
                    <span className="shrink-0 t-sub font-bold tabular-nums text-text-2">
                      {s.score === null ? "순위 제외" : <TweenNumber value={s.score} format="num1" suffix="점" />}
                    </span>
                  </div>
                  {s.score !== null && (
                    <div className="mt-1 h-1.5 rounded-full bg-divider" aria-hidden="true">
                      <div
                        className={`h-1.5 rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${s.rank === 1 ? "bg-primary" : "bg-text-3"}`}
                        style={{ width: `${Math.max(2, s.score)}%` }}
                      />
                    </div>
                  )}
                  {s.score === null ? (
                    <p className="mt-0.5 t-caption text-text-3">
                      {/* 조회 실패와 "거래 없음"은 다른 사실이다(리뷰 C) */}
                      {inputById.get(s.id)?.failed
                        ? "실거래를 불러오지 못해 이번 순위에서 뺐어요 — 잠시 후 다시 열어 보세요"
                        : inputById.get(s.id)?.hasData
                          ? "고른 기준에 쓸 값이 이 단지에는 없어 순위에서 뺐어요"
                          : "최근 12개월 실거래가 없어 순위에서 뺐어요"}
                    </p>
                  ) : s.missing.length > 0 ? (
                    <p className="mt-0.5 t-caption text-text-3">
                      {s.missing.map(labelOf).join("·")} 값이 없어 이 단지는 그 기준을 빼고 계산했어요
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="t-caption text-text-3">
        점수는 담은 후보들 사이의 상대 위치(기준마다 가장 앞선 값 100 · 가장 뒤진 값 0)를 중요도로 평균한 값이에요.
        좋고 나쁨의 판정이 아니고, 중요도는 이 기기에만 저장돼요.
      </p>
    </section>
  );
}
