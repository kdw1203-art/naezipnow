"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEokMan } from "@/lib/format/eok-man";
import { TweenNumber } from "@/app/components/motion/TweenNumber";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";
import { readAreaUnitCookie } from "@/lib/prefs/area-unit";
import type { AreaUnit } from "@/lib/prefs/ui-prefs";
import {
  ASKING_MIN_TRADES,
  askingBandOptions,
  askingGapLabel,
  askingHeadline,
  askingPosition,
  askingWindow,
  barScale,
  defaultBandSlug,
  kstYm,
  medianOf,
  nearestTrades,
  readAskingPrice,
  tradesFromTuples,
  type AskingTrade,
} from "@/lib/complex/asking-check";

/* [1009 · C] 표기 표준 점검 — 한 건 값·최저·중앙값·최고는 이미 formatEokMan("12억 4,500만")·tabular-nums 였다.
   이번에 면적대 칩에 눌림(press)을, "중앙"을 "중앙값"으로(허브·지도의 다른 중앙값 표기와 같은 말). 무엇을 계산하는지는
   섹션 머리(page.tsx)의 ⓘ 가 asking-check.ts 와 같은 말로 적는다.

   [1008 · Q] 호가 점검 본체 — 펼칠 때만 받는 청크(next/dynamic, AskingCheckToggle).
   재료는 GET /api/complex/[id]/trades(최근 24개월 매매·해제 제외, CDN 1시간) 한 번.
   말하는 것: 같은 면적대 실거래의 최저·중앙·최고와 그 위에서 호가의 위치, 가장 가까운 실거래 몇 건.
   말하지 않는 것: 적정가·목표가·추정가 — 지어낸 기준선이다(소유자 원칙 "가짜 데이터 금지"). */

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; trades: AskingTrade[]; nowYm: string };

function ymDot(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function tradeLine(t: AskingTrade): string {
  return `${ymDot(t.ym)} · ${t.floor ? `${t.floor}층 · ` : ""}${formatEokMan(t.priceManwon)}`;
}

function DistributionBar({ prices, asking }: { prices: readonly number[]; asking: number | null }) {
  const x = barScale(asking === null ? prices : [...prices, asking]);
  const ax = asking === null ? null : x(asking);
  return (
    <div className="relative mt-2 h-12" aria-hidden="true">
      {ax !== null && (
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded bg-brand-red px-1.5 t-caption font-extrabold text-on-dark"
          style={{ left: `${Math.min(88, Math.max(12, ax))}%` }}
        >
          내 호가
        </span>
      )}
      <div className="absolute inset-x-0 top-[30px] h-1.5 rounded-full bg-divider" />
      {prices.map((p, i) => (
        <span
          key={i}
          className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary opacity-50"
          style={{ left: `${x(p)}%`, top: `${26 + ((i % 3) - 1) * 5}px` }}
        />
      ))}
      {ax !== null && (
        <span className="absolute top-[18px] h-[26px] w-[3px] -translate-x-1/2 rounded-full bg-brand-red" style={{ left: `${ax}%` }} />
      )}
    </div>
  );
}

export function AskingCheckPanel({ apiId }: { apiId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [band, setBand] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [unit, setUnit] = useState<AreaUnit>("m2");

  useEffect(() => {
    setUnit(readAreaUnitCookie());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });
    fetch(`/api/complex/${encodeURIComponent(apiId)}/trades`)
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as { toYm?: unknown; trades?: unknown } | null;
        if (!res.ok || !j) throw new Error(String(res.status));
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        const nowYm = typeof j.toYm === "string" && /^\d{6}$/.test(j.toYm) ? j.toYm : kstYm(Date.now());
        setLoad({ kind: "ok", trades: tradesFromTuples(j.trades), nowYm });
      })
      .catch(() => {
        if (!cancelled) setLoad({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [apiId, attempt]);

  const options = useMemo(
    () => (load.kind === "ok" ? askingBandOptions(load.trades, load.nowYm) : []),
    [load],
  );
  const bandSlug = band && options.some((o) => o.slug === band) ? band : defaultBandSlug(options);
  const win = useMemo(
    () => (load.kind === "ok" && bandSlug ? askingWindow(load.trades, bandSlug, load.nowYm) : null),
    [load, bandSlug],
  );
  const read = readAskingPrice(raw);
  const asking = read.ok ? read.manwon : null;
  const prices = win ? win.trades.map((t) => t.priceManwon) : [];
  const enough = prices.length >= ASKING_MIN_TRADES;
  const pos = asking !== null && enough ? askingPosition(prices, asking) : null;
  /* 순위 칩 — 거래 사이면 "상위 22%", 모든 거래 밖이면 차이. 최저·최고와 같거나 모두 같은 값이면
     한 줄 요약이 이미 말하므로 칩을 그리지 않는다(빈 알약 금지) */
  const chip = pos && asking !== null ? (pos.rankLabel ?? askingGapLabel(pos, asking)) : null;
  const stats = enough
    ? { n: prices.length, min: Math.min(...prices), median: medianOf(prices), max: Math.max(...prices) }
    : null;

  if (load.kind === "loading") {
    return <div className="skeleton mt-3 h-[160px] w-full rounded-xl" aria-hidden />;
  }
  if (load.kind === "error") {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2.5">
        <p className="t-sub font-bold text-danger">
          실거래를 불러오지 못했어요. 거래가 없는 게 아니라 조회에 실패한 거예요.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="btn-secondary inline-flex min-h-10 items-center rounded-xl px-3 t-sub font-bold"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-bg px-3 py-3 t-sub text-text-2">
        최근 24개월에 이 단지의 매매 실거래 신고가 없어요 — 비교할 거래가 없어 위치를 말할 수 없어요.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div role="group" aria-label="면적대" className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.slug === bandSlug;
          return (
            <button
              key={o.slug}
              type="button"
              aria-pressed={on}
              onClick={() => setBand(o.slug)}
              className={`press inline-flex min-h-10 items-center gap-1 rounded-full border px-3 t-sub font-bold tabular-nums ${
                on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"
              }`}
            >
              {areaBandLabelByUnit(o.label, unit)}
              <span className="font-medium text-text-3">{o.count24}건</span>
            </button>
          );
        })}
      </div>

      <div className="sm:max-w-[380px]">
        <label htmlFor="asking-price" className="t-sub font-bold text-text-2">
          매물 호가
        </label>
        <input
          id="asking-price"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="예: 12억 5천 · 12.5억 · 125000"
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 t-body text-ink"
          aria-describedby="asking-price-read"
        />
        <p id="asking-price-read" className="mt-1 t-sub text-text-3" aria-live="polite">
          {read.ok
            ? `${formatEokMan(read.manwon)}원으로 볼게요.`
            : read.reason === "empty"
              ? "억·만원 모두 알아들어요(숫자만 적으면 1,000 미만은 억, 그 이상은 만원)."
              : read.reason === "after-eok"
                ? "억 뒤 숫자가 천 단위인지 만 단위인지 모호해요 — 12억 5천처럼 적어 주세요."
                : "숫자로 적어 주세요 — 예: 12억 5천, 125000"}
        </p>
      </div>

      {win && !enough ? (
        <div className="rounded-xl bg-bg px-3 py-3">
          <p className="t-body font-bold text-ink">거래가 적어 비교하기 어려워요</p>
          <p className="mt-0.5 t-sub text-text-3">
            최근 {win.months}개월 이 면적대 실거래 {win.trades.length}건 — {ASKING_MIN_TRADES}건은 있어야 위치를 말할 수
            있어요.
          </p>
          {win.trades.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {win.trades.map((t, i) => (
                <li key={`${t.ym}-${t.priceManwon}-${i}`} className="t-sub text-text-2 tabular-nums">
                  {tradeLine(t)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : win && stats ? (
        <div className="rounded-xl bg-bg px-3 py-3">
          {pos ? (
            <p className="t-body font-bold text-ink">
              {askingHeadline(pos, win.months)}
              {chip && (
                <>
                  {" "}
                  <span className="ml-0.5 inline-block rounded-full bg-primary-soft px-2 py-px t-sub font-extrabold text-primary">
                    {chip}
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="t-body font-bold text-ink">
              최근 {win.months}개월 이 면적대 실거래 {stats.n}건 — 호가를 넣으면 이 사이 어디쯤인지 보여 드려요
            </p>
          )}
          <DistributionBar prices={prices} asking={pos ? asking : null} />
          {/* [1009 · C] 면적대 칩을 바꾸면 세 값이 이전 값에서 새 값으로 굴러간다(TweenNumber — 320ms, 모션 최소화면 즉시,
              스크린리더는 최종 값만) — 무엇이 얼마나 바뀌었는지 눈이 따라간다 */}
          <dl className="mt-1 grid grid-cols-3 gap-1 text-center">
            <div>
              <dt className="t-caption text-text-3">최저</dt>
              <dd className="t-sub font-bold tabular-nums text-text-1">
                <TweenNumber value={stats.min} format="eokman" />
              </dd>
            </div>
            <div>
              <dt className="t-caption text-text-3">중앙값</dt>
              <dd className="t-sub font-bold tabular-nums text-text-1">
                <TweenNumber value={stats.median} format="eokman" />
              </dd>
            </div>
            <div>
              <dt className="t-caption text-text-3">최고</dt>
              <dd className="t-sub font-bold tabular-nums text-text-1">
                <TweenNumber value={stats.max} format="eokman" />
              </dd>
            </div>
          </dl>
          {pos && asking !== null && (
            <div className="mt-2.5 border-t border-divider pt-2">
              <p className="t-sub font-bold text-text-2">호가와 가장 가까운 실거래</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {nearestTrades(win.trades, asking, 3).map((t, i) => (
                  <li key={`${t.ym}-${t.priceManwon}-${i}`} className="t-sub text-text-1 tabular-nums">
                    {tradeLine(t)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 t-caption leading-relaxed text-text-3">
            {ymDot(win.trades[win.trades.length - 1].ym)}~{ymDot(win.trades[0].ym)} 계약 {win.trades.length}건 · 국토교통부
            실거래(해제 신고 제외) · 적정가나 목표가가 아니라 지난 거래 사이에서의 위치예요. 층·향·수리 상태는 반영되지
            않아요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
