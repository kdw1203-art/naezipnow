"use client";
/* [1026b · 시나리오·비교] 대표 그림 — 단지별 실거래 비교표(레이더 + 표). page.tsx 의 ComplexCompareTable 본문을 옮겼다:
   조회(POST /api/analysis/complex-compare)는 결론이 같은 값을 써야 해서 page.tsx 에 남고, 여기는 그리기만 한다.
   next/dynamic(ssr:false · CompareLazy.tsx) — 레이더 · ⓘ 설명 사전이 /analysis/compare 첫 묶음에서 빠진다.
   바뀐 모양: 폰(md 미만)은 10칸 가로 스크롤 표 대신 단지 카드 목록(같은 값 · 같은 배지), 데스크톱은 표 그대로.
   배지(최저·최다)는 결론과 같은 함수(lib/market/compare-conclusion compareWinners → bestOf)로 고른다. 흰 카드 한 모양 · 섹션 제목 h2. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { Radar } from "@/app/components/viz/Radar";
import { SkTable } from "@/app/components/ui/Skeleton";
import { Explain } from "@/app/components/explain/Explain";
import { formatKrwManwon } from "@/lib/format/krw";
import { compareWinners } from "@/lib/market/compare-conclusion";
import { fmtDeal, fmtEok, fmtPyeong, fmtYm, type CompareItem } from "./compare-format";

function WinBadge({ label }: { label: string }) {
  return <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-bold text-success">{label}</span>;
}

function ratio(v: number | null, max: number): number {
  if (v === null || !Number.isFinite(v) || max <= 0) return 0;
  return Math.min(1, Math.max(0.06, v / max));
}

function pctOf(v: number | null, max: number): string {
  if (v === null || !Number.isFinite(v) || max <= 0) return "0%";
  return `${Math.round((v / max) * 100)}%`;
}

/** 최근 거래가 얼마나 최근인지 0~1 (12개월 전=0, 이번 달=1). 없으면 0. */
function recencyRatio(ym: string | null): number {
  if (!ym || !/^\d{6}$/.test(ym)) return 0;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4));
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.min(1, Math.max(0, 1 - months / 12));
}

/** [1009 · A · 리뷰] 서버가 센 기간을 말로 — from="202603", n=6 → "2026.03부터 이번 달까지(이번 달 포함 달력 7개월)". */
function windowText(from: string | undefined, n: number): string {
  return from && /^\d{6}$/.test(from)
    ? `${from.slice(0, 4)}.${from.slice(4)}부터 이번 달까지(이번 달 포함 달력 ${n + 1}개월)`
    : `${n}개월 전 달부터 이번 달까지(달력 ${n + 1}개월)`;
}

function latestText(it: CompareItem): string {
  return it.latest
    ? `${fmtYm(it.latest.ym)} · ${fmtDeal(it.latest.amountKrw)}${it.latest.areaM2 ? ` · ${Math.round(it.latest.areaM2)}㎡` : ""}${
        it.latest.floor ? ` · ${it.latest.floor}층` : ""
      }`
    : "—";
}

/** [1008 · Q] 조회 실패와 거래 없음을 가른다(리뷰 C) */
function noDataText(it: CompareItem): string {
  return it.failed ? "실거래를 불러오지 못했어요 · 잠시 후 다시" : "최근 12개월 실거래 없음";
}

const RADAR_TONES = ["text-primary", "text-success", "text-warning"] as const;

export function CompareTable({
  items,
  loading,
  count,
  win,
}: {
  items: CompareItem[] | null;
  loading: boolean;
  /** 담은 단지 수(불러오는 동안 자리 틀 줄 수) */
  count: number;
  /** 서버가 실제로 센 기간 — ⓘ 가 그 기간을 그대로 말한다 */
  win: { from6m: string; from12m: string } | null;
}) {
  /* 표의 셀 배경 막대와 "최저·최다" 배지를 위한 파생값. 값이 있는 단지가 2곳 미만이면 배지도 안 붙는다. */
  const withData = useMemo(() => (items ?? []).filter((i) => i.hasData), [items]);
  const maxAvg = Math.max(0, ...withData.map((i) => i.avg6mKrw ?? 0));
  const maxPyeong = Math.max(0, ...withData.map((i) => i.avgPyeong6mKrw ?? 0));
  const maxCount = Math.max(0, ...withData.map((i) => i.count12m));
  const w = compareWinners(items ?? []);

  /* [1009 · A] 축마다 그 단지의 실제 값(표와 같은 표기) — 레이더 초점 단지의 값을 축 이름 아래에 적는다 */
  const radar = useMemo(
    () =>
      withData.slice(0, 3).map((it, i) => ({
        name: it.name,
        toneClass: RADAR_TONES[i] ?? "text-primary",
        axes: [
          { key: "avg", label: "평균가", ratio: ratio(it.avg6mKrw, maxAvg), display: fmtEok(it.avg6mKrw) },
          /* 차트 라벨은 짧은 표기(표준) — "1억 4,838만" 은 390px 레이더 오른쪽 끝에서 잘렸다(실측) */
          {
            key: "pyeong",
            label: "평당가",
            ratio: ratio(it.avgPyeong6mKrw, maxPyeong),
            display: it.avgPyeong6mKrw === null ? "—" : formatKrwManwon(it.avgPyeong6mKrw / 10_000, { style: "eok1" }),
          },
          { key: "c12", label: "12개월 거래", ratio: ratio(it.count12m, maxCount), display: `${it.count12m.toLocaleString("ko-KR")}건` },
          {
            key: "c6",
            label: "최근 6개월",
            ratio: ratio(it.count6m, Math.max(1, ...withData.map((x) => x.count6m))),
            display: `${it.count6m.toLocaleString("ko-KR")}건`,
          },
          { key: "recent", label: "최근성", ratio: recencyRatio(it.latest?.ym ?? null), display: it.latest ? fmtYm(it.latest.ym) : "—" },
        ],
      })),
    [withData, maxAvg, maxPyeong, maxCount],
  );
  const [focus, setFocus] = useState(0);
  const focusAt = Math.min(focus, Math.max(0, radar.length - 1));

  return (
    <section className="card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5" aria-label="단지별 실거래 비교표">
      <h2 className="t-section text-ink">단지별 실거래 비교표</h2>
      {loading && !items ? (
        /* 예전엔 "집계하는 중…" 한 줄이라 표가 나타날 때 화면이 통째로 튀었다 */
        <SkTable rows={Math.max(2, Math.min(4, count))} />
      ) : items ? (
        <>
          {/* 성격 비교 — 값이 있는 단지가 2곳 이상일 때만(한 곳짜리 레이더는 의미 없다) */}
          {radar.length >= 2 && (
            <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg bg-bg p-3">
              <Radar series={radar} size={236} focus={focusAt} className="max-w-full overflow-visible" />
              <div className="flex flex-col gap-1.5">
                {/* [1009 · A] 단지를 누르면 그 단지 모양이 진해지고 축에 실제 값이 나온다 */}
                <div role="group" aria-label="레이더에서 볼 단지" className="flex flex-col gap-1">
                  {radar.map((r, i) => (
                    <button
                      key={r.name}
                      type="button"
                      aria-pressed={i === focusAt}
                      onClick={() => setFocus(i)}
                      className={`press flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 text-left ${i === focusAt ? "bg-surface shadow-sm" : ""}`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.toneClass}`} style={{ background: "currentColor" }} />
                      <span className={`t-sub break-words font-bold ${i === focusAt ? "text-ink" : "text-text-2"}`}>{r.name}</span>
                    </button>
                  ))}
                </div>
                <p className="m-0 t-caption max-w-[230px] text-text-3">담긴 단지 사이 상대 위치 · 클수록 바깥 · 가격은 비쌀수록 바깥</p>
              </div>
            </div>
          )}

          {/* 데스크톱(md+) — 표. relative: 칸 안 sr-only 가 가로 스크롤 상자를 벗어나 문서 폭을 늘리지 않게 */}
          <div className="relative overflow-x-auto max-md:hidden">
            <div className="min-w-[620px]">
              <div className="t-sub grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] gap-2 border-b border-divider pb-2 font-bold text-text-3">
                <span>단지</span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  6개월 평균가
                  <Explain
                    term="silgeoraega"
                    title="6개월 평균가"
                    how={[
                      `${windowText(win?.from6m, 6)} 계약된 매매 실거래 금액을 면적 구분 없이 단순 평균했어요.`,
                      "해제(취소) 신고된 거래는 빼요. 이번 달·지난달 계약은 아직 신고 중이라 덜 잡혀요.",
                    ]}
                    source="국토교통부 실거래가"
                    size={12}
                  />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  평당가 평균
                  <Explain
                    term="pyeongdanga"
                    how={[`${windowText(win?.from6m, 6)} 계약된 거래마다 금액 ÷ (전용면적 ÷ 3.3058)로 평당가를 내고 평균했어요.`]}
                    source="국토교통부 실거래가"
                    size={12}
                  />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  거래 6/12개월
                  <Explain
                    term="geoRae-ryang"
                    how={[
                      `앞 숫자: ${windowText(win?.from6m, 6)} 매매 신고 건수 · 뒤 숫자: ${windowText(win?.from12m, 12)} 건수.`,
                      "이번 달·지난달 계약은 아직 신고 중이라 덜 잡힌다. 뒤 숫자는 단지마다 최근 300건까지.",
                    ]}
                    size={12}
                  />
                </span>
                <span className="text-center">최근 거래(1건)</span>
              </div>
              {items.map((it, idx) => (
                <div key={it.id} className="row-hl grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] items-center gap-2 border-b border-divider py-2.5">
                  <span className="t-sub font-bold text-ink">
                    <Link href={complexHrefFromId(it.id)} className="no-underline">
                      {it.name}
                    </Link>
                    <span className="t-caption ml-1 font-semibold text-text-3">{it.region}</span>
                  </span>
                  {it.hasData ? (
                    <>
                      <span className="cell-bar t-sub t-num text-center text-primary" style={{ ["--w" as string]: pctOf(it.avg6mKrw, maxAvg) }}>
                        {fmtEok(it.avg6mKrw)}
                        {w.avg.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span
                        className="cell-bar t-sub t-num text-center text-primary"
                        style={{ ["--w" as string]: pctOf(it.avgPyeong6mKrw, maxPyeong) }}
                      >
                        {fmtPyeong(it.avgPyeong6mKrw)}
                        {w.pyeong.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span className="cell-bar t-sub t-num text-center text-success" style={{ ["--w" as string]: pctOf(it.count12m, maxCount) }}>
                        {it.count6m}/{it.count12m}건
                        {w.count.has(idx) && <WinBadge label="최다" />}
                      </span>
                      <span className="t-sub text-center text-text-2">{latestText(it)}</span>
                    </>
                  ) : (
                    <span className="t-sub col-span-4 text-center text-text-3">{noDataText(it)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 폰(md 미만) — 단지 카드 목록(표와 같은 값 · 같은 배지) */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden" aria-label="단지별 실거래">
            {items.map((it, idx) => (
              <li key={it.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <Link href={complexHrefFromId(it.id)} className="inline-flex min-h-10 items-center t-sub font-bold text-ink no-underline">
                    {it.name}
                  </Link>
                  <span className="t-caption text-text-3">{it.region}</span>
                </div>
                {it.hasData ? (
                  <dl className="m-0 mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <dt className="t-caption text-text-3">6개월 평균가</dt>
                      <dd className="m-0 t-sub t-num font-bold text-ink">
                        {fmtEok(it.avg6mKrw)}
                        {w.avg.has(idx) && <WinBadge label="최저" />}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="t-caption text-text-3">평당가 평균</dt>
                      <dd className="m-0 t-sub t-num font-bold text-ink">
                        {fmtPyeong(it.avgPyeong6mKrw)}
                        {w.pyeong.has(idx) && <WinBadge label="최저" />}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="t-caption text-text-3">거래 6/12개월</dt>
                      <dd className="m-0 t-sub t-num font-bold text-ink">
                        {it.count6m}/{it.count12m}건
                        {w.count.has(idx) && <WinBadge label="최다" />}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="t-caption text-text-3">최근 거래(1건)</dt>
                      <dd className="m-0 t-sub text-text-2 break-words">{latestText(it)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="m-0 mt-1 t-sub text-text-3">{noDataText(it)}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="m-0 t-caption text-text-3 md:hidden">
            6개월 = {windowText(win?.from6m, 6)} · 12개월 = {windowText(win?.from12m, 12)}
          </p>
          <p className="m-0 t-caption text-text-3">
            국토교통부 실거래 기준(해제 신고분 제외) · 면적·타입 구분 없는 단순 평균이므로 같은 단지라도 평형 구성에 따라 체감과 다를 수 있어요.
            &ldquo;최저·최다&rdquo; 배지는 담긴 단지들 사이의 비교일 뿐 좋고 나쁨의 판정이 아닙니다.
          </p>
        </>
      ) : (
        <p className="m-0 t-sub text-text-3">집계에 실패했어요. 잠시 후 다시 시도해 주세요.</p>
      )}
    </section>
  );
}

export default CompareTable;
