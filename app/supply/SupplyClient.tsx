"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SUPPLY_WINDOW_MONTHS, inSupplyWindow, shownMonths, supplyWindow, validYm, type SupplyWindow } from "@/lib/supply/window";
import { Bars } from "@/app/components/viz/Bars";
// server-only 체인이 있는 모듈이라 값 import 는 불가 — 타입은 컴파일에서 소거되므로 안전.
import type { SupplyItem } from "@/lib/market/supply";
import { AIPanel } from "@/app/components/AIPanel";
import { Explain } from "@/app/components/explain/Explain";

/**
 * /supply 클라이언트 셸 (사용량 절감 9차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 전국 전량(실측 675행)을 그대로 SSR 로 그린다 — 크롤러 HTML 이
 * 온전히 남는다. 지역 필터는 마운트 후 location.search 에서 읽고, 칩은
 * history.pushState 를 하는 버튼이다 (useSearchParams 는 프리렌더 HTML 에서
 * 그 서브트리를 지운다 — /town/news 에서 실측으로 배운 것).
 *
 * 필터 동치성: 예전 서버는 지역을 DB .eq 로 걸었다. 전량(675행)이 페치 상한
 * (SUPPLY_FETCH_CAP=2000) 안에 들어오므로 메모리 필터가 서버 필터와 동치다.
 * 상한에 도달한 적재가 생기면 truncated 로 내려와 화면에 그대로 알린다.
 *
 * 조용한 상한 정정: 예전 페이지는 getSupplyList(region, 200) 이라 전국 보기가
 * 675곳 중 200곳만 그리면서 "· 200곳" 이라고 적었다 (경기 209곳도 잘렸다).
 * 이제 곳수는 전량 기준으로 적고, 표는 200행에서 시작하되 "더 보기"로 나머지를
 * 펼친다 — 상한을 가리지 않는다.
 */

const TABLE_INITIAL_ROWS = 200;

type MonthBucket = { ym: string; count: number; households: number };

type Group = {
  key: string;
  label: string;
  items: SupplyItem[];
  households: number;
};

/** [1009 · H] 입주월이 실제 달(01~12)인가 — 적재분에 "202700"(월 00)이 섞여 있어 화면에 "2027.00"·
    "2027년 0분기 입주 예정"이 나왔다(로컬 실측: 2곳 331세대). 형식만 보던 /^\d{6}$/ 검사를 달 범위까지 본다. */
function fmtYm(ym: string): string {
  if (/^\d{6}$/.test(ym) && !validYm(ym)) return `${ym.slice(0, 4)}년 월 미정`;
  if (!ym) return "월 미정";
  if (!validYm(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function monthLabel(ym: string): string {
  if (!validYm(ym)) return "미정";
  return `${Number(ym.slice(4, 6))}월`;
}

/** 지역 묶음 키 — 예전 getSupplyRegions 의 String(row.region ?? "기타") 와 동일 규칙 */
function regionKey(s: SupplyItem): string {
  return s.region || "기타";
}

/** 예전 lib getSupplyRegions 와 동일: 지역별 집계, 세대수 내림차순 */
function deriveRegions(
  items: SupplyItem[],
  /** [1028] 주면 그 창 안의 물량만 더한다 — 지역 줄 자체는 모두 남긴다(창 안 물량이 0인 지역도 고를 수 있어야 한다) */
  w: SupplyWindow | null = null,
): { region: string; count: number; households: number }[] {
  const map = new Map<string, { count: number; households: number }>();
  for (const s of items) {
    const key = regionKey(s);
    const e = map.get(key) ?? { count: 0, households: 0 };
    if (!w || inSupplyWindow(s.moveInYm, w)) {
      e.count += 1;
      e.households += Number(s.households ?? 0) || 0;
    }
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([region, v]) => ({ region, ...v }))
    .sort((a, b) => b.households - a.households);
}

/** 예전 lib getSupplyMonthly 와 동일: 월별 집계 (유효 YYYYMM 만), ym 오름차순 */
function deriveMonthly(items: SupplyItem[]): MonthBucket[] {
  const map = new Map<string, { count: number; households: number }>();
  for (const s of items) {
    if (!validYm(s.moveInYm)) continue;
    const e = map.get(s.moveInYm) ?? { count: 0, households: 0 };
    e.count += 1;
    e.households += Number(s.households ?? 0) || 0;
    map.set(s.moveInYm, e);
  }
  return [...map.entries()]
    .map(([ym, v]) => ({ ym, ...v }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

/** 입주월 기준 분기 그룹화 — 예전 서버 페이지의 groupByQuarter 그대로 */
function groupByQuarter(list: SupplyItem[]): Group[] {
  const groups: Group[] = [];
  const map = new Map<string, Group>();
  for (const s of list) {
    const ym = s.moveInYm;
    const valid = validYm(ym);
    const year = valid ? ym.slice(0, 4) : "";
    const mo = valid ? Number(ym.slice(4, 6)) : 0;
    const q = mo >= 1 && mo <= 12 ? Math.ceil(mo / 3) : 0;
    const key = valid ? `${year}-${q}` : "unknown";
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label: valid ? `${year}년 ${q}분기 입주 예정` : "입주 시기 미정",
        items: [],
        households: 0,
      };
      map.set(key, g);
      groups.push(g);
    }
    g.items.push(s);
    g.households += s.households ?? 0;
  }
  return groups;
}

/** [1028] 한국 시간의 이번 달 "YYYYMM" — 월별 그래프의 시작 달 */
function kstYm(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(d: Date): string {
  return `${d.getFullYear()}-${Math.ceil((d.getMonth() + 1) / 3)}`;
}

function readRegionFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get("region");
  const v = (raw ?? "").trim();
  return v || null;
}

export function SupplyClient({
  items,
  truncated,
  asOfLabel,
  builtAtMs,
  adSlot,
}: {
  items: SupplyItem[];
  truncated: boolean;
  asOfLabel: string | null;
  builtAtMs: number;
  adSlot: ReactNode;
}) {
  // SSR/첫 하이드레이션은 전국(null) — 프리렌더 HTML 과 정확히 일치.
  const [region, setRegion] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);
  /* [2026-08-22] 지역 목록이 상위 5개에서 잘려 6위 이하 시도는 URL 을 손으로
     고치지 않으면 선택 자체가 불가능했다 — 전체 보기 토글로 연다. */
  const [regionsOpen, setRegionsOpen] = useState(false);
  // ISR 페이지의 시각 파생값(이번 분기 판정)은 서버 시각으로 하이드레이션을
  // 일치시킨 뒤 마운트에서 실제 시각으로 재계산한다 (auctions 선례).
  const [nowMs, setNowMs] = useState(builtAtMs);

  useEffect(() => {
    setNowMs(Date.now());
    setRegion(readRegionFromLocation());
    const onPop = () => {
      setRegion(readRegionFromLocation());
      setTableExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectRegion = (next: string | null) => {
    setRegion(next);
    setTableExpanded(false);
    const url = next ? `/supply?region=${encodeURIComponent(next)}` : "/supply";
    window.history.pushState(null, "", url);
  };

  // ── 파생 (675행 규모라 렌더마다 계산해도 무시할 수준) ──────────────────────
  /* [1028] 지역별 요약도 그래프·합계와 같은 창(이번 달부터 24개월)에서 센다. 예전처럼 전량으로 세면 합계(24개월)와
     지역 줄(전 기간)이 다른 기준이라 "전국 합계 38만 세대"인데 "경기 27만 세대"처럼 어긋난다. 창 안 자료가 전국에 하나도 없으면 전량. */
  const win = supplyWindow(kstYm(nowMs));
  const regionsWindowed = items.some((s) => inSupplyWindow(s.moveInYm, win));
  const regions = deriveRegions(items, regionsWindowed ? win : null);
  const filtered = region ? items.filter((s) => regionKey(s) === region) : items;
  const monthly = deriveMonthly(filtered);
  const list = filtered; // 서버 정렬(move_in_ym asc)이 필터로 보존됨

  const groups = groupByQuarter(list);
  const scope = region ? `${region} ` : "전국 ";

  const nowKey = quarterKey(new Date(nowMs));
  let currentIdx = groups.findIndex((g) => g.key === nowKey);
  if (currentIdx < 0) currentIdx = groups.findIndex((g) => g.key !== "unknown");
  const thisQuarter = currentIdx >= 0 ? groups[currentIdx] : null;
  const upcomingItems =
    currentIdx >= 0
      ? groups
          .slice(currentIdx + 1)
          .filter((g) => g.key !== "unknown")
          .flatMap((g) => g.items)
      : [];

  const featured = thisQuarter ? thisQuarter.items.slice(0, 6) : [];
  const featuredMore = thisQuarter
    ? Math.max(0, thisQuarter.items.length - featured.length)
    : 0;
  const upcomingShown = upcomingItems.slice(0, 6);
  const upcomingMore = Math.max(0, upcomingItems.length - upcomingShown.length);

  /* [1028] 그래프·합계는 **이번 달부터 24개월**(달력 기준 · lib/supply/window.ts). 예전에는 입주월 순 "마지막 24개월"(slice(-24))이라,
     자료가 2032년까지 늘어난 뒤로는 2029.04~2032.03 만 그려졌다(오늘 기준 3년 뒤부터). 합계·가장 많은 달은 전체 달로 세어,
     "24개월"이라 적힌 합계가 전체 합(71만 세대)이었고 가장 많은 달(2027.12)은 그래프에 없었다. 이제 그래프 · 합계 · 가장 많은 달 ·
     단지 수 · 지역별 요약이 모두 같은 창에서 센다. 고른 지역의 물량이 전부 창 밖이면 가진 달의 마지막 24개를 보이고 "24개월"이라 적지 않는다. */
  const { months: monthlyShown, windowed } = shownMonths(monthly, win);
  /* 창 안이면 "24개월", 아니면(그 지역 물량이 전부 창 밖) 실제 범위만 적는다 */
  const spanLabel = windowed ? `${SUPPLY_WINDOW_MONTHS}개월` : "";
  const totalHouseholds = monthlyShown.reduce((s, m) => s + m.households, 0);
  const shownCount = monthlyShown.reduce((s, m) => s + m.count, 0);
  const peak =
    monthlyShown.length > 0
      ? monthlyShown.reduce((a, b) => (b.households > a.households ? b : a))
      : null;
  const shownRange =
    monthlyShown.length > 0
      ? `${fmtYm(monthlyShown[0].ym)}~${fmtYm(monthlyShown[monthlyShown.length - 1].ym)}`
      : "";
  /* [1009 · H] 입주월이 없거나 달이 잘못 적힌 단지 — 월별 합계에서 빠진다는 사실을 적는다(숨기지 않는다) */
  const noMonth = filtered.filter((s) => !validYm(s.moveInYm));
  const noMonthHouseholds = noMonth.reduce((a, s) => a + (Number(s.households ?? 0) || 0), 0);
  const monthlyMax = monthlyShown.reduce((m, b) => Math.max(m, b.households), 0);

  const tableRows = tableExpanded ? list : list.slice(0, TABLE_INITIAL_ROWS);
  const tableHiddenCount = list.length - tableRows.length;

  return (
    <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── 본문 ── */}
      <div className="flex flex-col gap-3">
        {truncated && (
          <div className="rounded-lg border border-line bg-surface px-4 py-3 t-sub text-text-3">
            데이터가 조회 상한에 도달해 일부가 잘렸을 수 있어요. 지역별 곳수·
            세대수 합계가 실제보다 적게 보일 수 있습니다.
          </div>
        )}

        {/* ── 입주 캘린더(월 그리드)가 아니라 월별 막대인 이유 ──────────────────
            예전에 이 자리에는 날짜 셀 42칸짜리 월 캘린더가 있었고, 매달
            8·15·22·29일에 막대가 찍혀 있었다. 그 네 날짜는 데이터가 아니라 코드에
            박아 둔 상수였다 — apartment_supply 는 move_in_ym(입주 **월**)까지만
            가진 자료라 특정 일자를 알 방법이 아예 없다. "예시" 배지로는 없는
            일정이 있는 것처럼 보이는 걸 막을 수 없어 지웠다. 실제로 가진 축
            (월별 세대수)만 그린다 — 지어낼 값이 하나도 없다. */}
        {/* 월별 입주 물량 — apartment_supply 실집계(월·세대수) */}
        <div className="chart-card text-primary" data-reveal="">
          <div className="chart-head">
            {/* [970 · B-44] 섹션 제목은 h2 — div/span 이라 문서 개요에 섹션이 없었다 */}
            <span className="flex items-center gap-0.5">
              <h2 className="t-section text-ink">월별 입주 물량</h2>
              {/* [1009 · H] 입주 물량의 뜻과 이 화면의 집계 — 아래 월별 합계·KPI 계산 그대로.
                  [1009 · H 리뷰] 출처를 사실대로: apartment_supply 1,338행 중 983행(73%)은 청약홈 분양공고 입주예정월을 매일
                  자동 적재한 것(lib/market/supply-ingest.ts · 마지막 적재 2026-09-20), 나머지 355행이 2026년 2월 수동 업로드분이다.
                  예전 문구 "공공데이터 입주예정물량 · 수동 적재"·"자동 갱신 없음"은 자동 경로가 생기기 전 이야기였다. */}
              {/* [1015] 시트 문구에서 "적재" 같은 내부 낱말을 걷고(1011 지시와 같은 줄기) 어미를 줄였다(브리프 규칙 D).
                  페이지 위 안내 띠를 걷었으므로 월 단위·두 원천·기준 시점은 여기 한 곳이 말한다. */}
              <Explain
                term="ipju-mulryang"
                body="청약홈 분양공고의 입주예정월(매일 갱신)과 2026년 2월에 받은 공공데이터 입주예정물량을 합친 자료입니다. 사업 진행·일정 변경에 따라 실제와 다를 수 있습니다."
                how={[
                  "두 원천의 단지별 세대수를 입주월로 묶어 더합니다(이번 달부터 24개월 표시).",
                  "입주는 월 단위로만 공개되어 날짜는 없습니다. 세대수가 빈 단지는 0으로 더합니다.",
                  "지역을 고르면 그 시·도 단지만 더합니다.",
                ]}
                source={`청약홈 분양공고(공공데이터포털 · 매일) · 공공데이터 입주예정물량(2026년 2월)${
                  asOfLabel ? ` · ${asOfLabel} 기준` : ""
                }`}
              />
            </span>
            <span className="t-caption ml-auto text-text-3">{scope}· 세대수 기준</span>
          </div>

          {/* 24개월을 세로 막대 한 장으로 먼저 보인다 — 아래 가로 막대 24줄은
              값을 정확히 읽는 자리지만, "물량이 언제 몰리는가"라는 모양은
              스크롤하며 읽어야 했다. 같은 데이터, 다른 축이다. */}
          {monthlyShown.length > 2 && (
            <Bars
              values={monthlyShown.map((b) => b.households)}
              labels={monthlyShown.map((b) => fmtYm(b.ym))}
              height={110}
              valueSuffix="세대"
              ariaLabel="월별 입주 세대수"
            />
          )}
          {monthlyShown.length > 0 && (
            <div className="kpi-row">
              <div className="kpi">
                <span className="kpi-k">합계</span>
                <span className="kpi-v">{totalHouseholds.toLocaleString("ko-KR")}세대</span>
                <span className="kpi-d">{scope}· {shownRange}</span>
              </div>
              {peak && (
                <div className="kpi">
                  <span className="kpi-k">가장 많은 달</span>
                  <span className="kpi-v">{fmtYm(peak.ym)}</span>
                  <span className="kpi-d">
                    {peak.households.toLocaleString("ko-KR")}세대 · {peak.count}곳
                  </span>
                </div>
              )}
              <div className="kpi">
                <span className="kpi-k">단지 수</span>
                <span className="kpi-v">{shownCount.toLocaleString("ko-KR")}곳</span>
                <span className="kpi-d">{windowed ? `${spanLabel} 안 입주` : shownRange}</span>
              </div>
            </div>
          )}
          {monthlyShown.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {monthlyShown.map((b) => {
                const pct =
                  monthlyMax > 0
                    ? Math.max(2, Math.round((b.households / monthlyMax) * 100))
                    : 0;
                const isPeak = peak !== null && b.ym === peak.ym;
                return (
                  <div
                    key={b.ym}
                    className="row-hl grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 t-sub"
                  >
                    <span
                      className={`shrink-0 ${isPeak ? "font-bold text-primary" : "text-text-3"}`}
                    >
                      {fmtYm(b.ym)}
                    </span>
                    <span className="rank-track text-primary">
                      <span
                        className="rank-fill"
                        style={{ width: `${pct}%`, opacity: isPeak ? 1 : 0.45 }}
                      />
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-text-2">
                      {b.households.toLocaleString("ko-KR")}세대
                      <span className="ml-1 text-text-3">· {b.count}곳</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface px-4 py-8 text-center t-body text-text-3">
표시할 월별 입주 물량 데이터 없음
            </div>
          )}
          {/* [1029 · 13] 낱말 꼴 */}
          {noMonth.length > 0 && (
            <p className="m-0 t-caption text-text-3">
              월 미정 {noMonth.length.toLocaleString("ko-KR")}곳({noMonthHouseholds.toLocaleString("ko-KR")}세대) · 월별 합계 제외 · 아래 표 “월 미정”
            </p>
          )}
        </div>

        {/* 이번 분기 입주 (청약 센터 접수중 카드 — 초록 강조) */}
        {featured.length > 0 && (
          <>
            <div className="rise-in-2 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-bold text-primary">
                이번 분기 입주 · {thisQuarter?.items.length ?? 0}곳
              </h2>
              {thisQuarter && (
                <span className="t-sub text-text-3">
                  {thisQuarter.label} · {thisQuarter.households.toLocaleString()}세대
                </span>
              )}
            </div>
            {/* [1038 · 17] 단지마다 3줄 카드 → 한 줄 표(입주월 · 단지 · 세대 막대) — 같은 값, 높이 1/3 */}
            {featured.length > 0 && (() => {
              const maxHh = featured.reduce((m, s) => Math.max(m, s.households ?? 0), 0);
              return (
                <div className="rise-in-2 overflow-x-auto rounded-2xl border-[1.5px] border-primary bg-surface px-3 py-2">
                  <table className="w-full min-w-[320px] border-collapse t-sub">
                    <thead>
                      <tr className="text-left t-caption text-text-3">
                        <th className="border-b border-line py-1.5 pr-2 font-semibold">입주</th>
                        <th className="border-b border-line py-1.5 pr-2 font-semibold">단지</th>
                        <th className="border-b border-line py-1.5 font-semibold">세대</th>
                      </tr>
                    </thead>
                    <tbody>
                      {featured.map((s, i) => (
                        <tr key={`now-${s.aptName ?? "미정"}-${i}`}>
                          <td className="whitespace-nowrap border-b border-divider py-2 pr-2 t-num font-bold text-primary">{fmtYm(s.moveInYm)}</td>
                          <td className="min-w-0 border-b border-divider py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-bold text-ink">{s.aptName ?? "미정"}</span>
                              {s.bizType && <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 t-caption font-bold text-primary">{s.bizType}</span>}
                            </div>
                            <div className="truncate t-caption text-text-3">{s.address ?? s.region}</div>
                          </td>
                          <td className="w-[38%] border-b border-divider py-2">
                            <div className="flex items-center gap-2">
                              <div className="relative h-2 flex-1 rounded bg-bg">
                                {s.households ? <div className="absolute left-0 h-2 rounded bg-primary" style={{ width: `${Math.max(3, Math.round(((s.households ?? 0) / Math.max(1, maxHh)) * 100))}%` }} /> : null}
                              </div>
                              <b className="w-14 shrink-0 text-right t-num text-ink">{s.households ? s.households.toLocaleString() : "—"}</b>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {featuredMore > 0 && (
              <p className="rise-in-2 px-1 t-sub text-text-3">
                외 {featuredMore.toLocaleString()}곳 · 아래 표
              </p>
            )}
          </>
        )}

        {/* 다가오는 입주 (예정) — 청약 센터 예정 카드 */}
        {upcomingShown.length > 0 && (
          <>
            <h2 className="rise-in-3 px-1 pt-1.5 text-xs font-bold text-text-3">
              다가오는 입주 (예정) · {upcomingItems.length.toLocaleString()}곳
            </h2>
            {upcomingShown.map((s, i) => (
              <div
                key={`next-${s.aptName ?? "미정"}-${i}`}
                className="rise-in-3 card flex items-center justify-between gap-3 rounded-2xl px-[18px] py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 rounded-md bg-bg chip-pad t-sub font-bold text-text-2">
                    {monthLabel(s.moveInYm)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <span className="truncate">{s.aptName ?? "미정"}</span>
                      {s.bizType && (
                        <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 t-caption font-bold text-primary">
                          {s.bizType}
                        </span>
                      )}
                    </div>
                    <div className="truncate t-sub text-text-3">
                      {s.households
                        ? `${s.households.toLocaleString()}세대 · `
                        : ""}
                      {s.address ?? s.region} · 입주 {fmtYm(s.moveInYm)}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 t-sub font-bold text-primary">
                  입주 {fmtYm(s.moveInYm)}
                </span>
              </div>
            ))}
            {/* [1015] 설명문("…추려 보여드려요 — …확인하세요") → 숫자 한 줄(브리프 규칙 D) */}
            <p className="rise-in-3 px-1 t-sub text-text-3">
              {upcomingMore > 0
                ? `대표 ${upcomingShown.length}곳 · 나머지 ${upcomingMore.toLocaleString()}곳 아래 표`
                : `대표 ${upcomingShown.length}곳 · 전체 목록 아래 표`}
            </p>
          </>
        )}

        {/* 지난·전체 입주 예정 단지 — 곳수는 전량 기준(조용한 200 상한 정정),
            표는 200행에서 시작하고 "더 보기"로 펼친다 (상한을 가리지 않는다). */}
        <h2 className="rise-in-4 px-1 pt-1.5 text-xs font-bold text-text-3">
          {list.length > 0
            ? `지난·전체 입주 예정 단지 · ${list.length.toLocaleString()}곳`
            : "지난·전체 입주 예정 단지"}
        </h2>
        {list.length === 0 ? (
          <div className="rise-in-4 card rounded-2xl px-4 py-8 text-center t-body text-text-3">
해당 지역 입주 예정 물량 데이터 없음
          </div>
        ) : (
          /* [1015] 표 껍데기 = 리퀴드 판(sand — 입주 일정 톤, 브리프 규칙 I) */
          <div className="rise-in-4 lq-panel overflow-x-auto py-1" data-tone="sand">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                <span>단지 · 지역</span>
                <span className="text-center">입주월</span>
                <span className="text-center">세대수</span>
                <span className="text-center">사업유형</span>
              </div>
              {tableRows.map((item, i, arr) => (
                <div
                  key={`row-${item.aptName ?? "미정"}-${i}`}
                  className={`grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] items-center gap-2 py-2.5 text-xs ${
                    i < arr.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span className="truncate font-bold text-ink">
                    {item.aptName ?? "미정"}
                    <span className="ml-1 t-caption font-medium text-text-3">
                      {item.region}
                    </span>
                  </span>
                  <span className="text-center font-bold text-text-1">
                    {fmtYm(item.moveInYm)}
                  </span>
                  <span className="text-center font-bold tabular-nums text-text-1">
                    {item.households ? item.households.toLocaleString("ko-KR") : "—"}
                  </span>
                  <span className="text-center font-bold text-primary">
                    {item.bizType ?? "—"}
                  </span>
                </div>
              ))}
              {tableHiddenCount > 0 && (
                <div className="py-2">
                  <button
                    type="button"
                    onClick={() => setTableExpanded(true)}
                    className="press inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-line bg-surface py-2 text-xs font-bold text-text-1"
                  >
                    {/* 글을 span 으로 — 40px 버튼 높이를 12px 글자 줄 수로 읽어 "3줄"로 오판하던 narrow-text 검사가 글 상자만 잰다 */}
                    <span>나머지 {tableHiddenCount.toLocaleString()}곳 더 보기</span>
                  </button>
                </div>
              )}
              <div className="pb-2 pt-1 t-caption text-text-3">
                출처 청약홈 분양공고(매일 갱신) · 공공데이터 입주예정물량(2026년 2월)
                {asOfLabel ? ` · ${asOfLabel} 기준` : ""}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 우측 사이드 (청약 센터 aside 구성) ── */}
      <aside className="flex flex-col gap-3.5 max-md:gap-3">
        {/* AI 인사이트 패널 (실 수치 — 최다 입주 시기·총 세대수)
            [1015] 폰에서는 숨긴다 — 위 KPI 줄과 같은 숫자라 한 화면에 두 번 나온다(브리프 규칙 E). 데스크톱 레일은 그대로. */}
        <div className="rise-in-2 max-md:hidden">
          {/* [1015] 위 KPI 줄(합계·가장 많은 달)과 같은 숫자를 다시 적던 두 칸과 "…유리할 수 있어요" 조언 문장을 걷고
              사실 한 줄만(브리프 규칙 D·J — 같은 사실 두 곳 금지). */}
          {/* [1028] 월별 합계를 센 값이다(AI 결과 아님) — "AI" 배지와 "인사이트"를 뗐다 */}
          <AIPanel title="입주 물량 요약" ai={false} className="rounded-3xl">
            {monthly.length === 0 ? (
              <>표시할 입주 물량 데이터 없음</>
            ) : (
              <>
                {scope}기준 최다 입주 <b className="text-ai-accent">{peak ? fmtYm(peak.ym) : "—"}</b>
                {peak ? ` · ${peak.households.toLocaleString()}세대 · ${peak.count}곳` : ""}
                {" · "}
                {windowed ? spanLabel : shownRange} 합계 {totalHouseholds.toLocaleString()}세대
              </>
            )}
          </AIPanel>
        </div>

        {/* 지역별 입주 요약 — 예전엔 ?region= 링크(서버 재렌더)였다. 이제 얕은
            pushState 버튼이라 서버 왕복이 없고, 활성 지역을 다시 누르면 전국으로
            돌아온다 (예전엔 전국으로 돌아갈 컨트롤 자체가 없었다). */}
        <div className="rise-in-3 card flex flex-col gap-1 p-[18px]">
          <h2 className="mb-1 t-body font-bold text-ink">
            지역별 입주 요약
            {/* [1028] 아래 세대수의 기준 — 그래프·합계와 같은 창 */}
            {regionsWindowed && (
              <span className="ml-1.5 t-caption font-medium text-text-3">이번 달부터 {SUPPLY_WINDOW_MONTHS}개월</span>
            )}
          </h2>
          {regions.length === 0 ? (
            <p className="t-caption text-text-3">
표시할 지역 데이터 없음
            </p>
          ) : (
            <>
              {/* [1015] 지역 행 목록 = 리퀴드 판(blue — 본문 표(sand)와 다른 톤, 브리프 규칙 I) */}
              <div className="lq-panel flex flex-col" data-tone="blue">
              {regions.slice(0, regionsOpen ? regions.length : 5).map((r, i) => {
                const on = region === r.region;
                return (
                  <button
                    key={r.region}
                    type="button"
                    onClick={() => selectRegion(on ? null : r.region)}
                    aria-pressed={on}
                    className={`press flex min-h-[40px] w-full items-center justify-between border-b py-[7px] text-left text-xs last:border-b-0 ${
                      on ? "font-bold" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 font-bold text-ink">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft t-caption font-bold text-primary">
                        {i + 1}
                      </span>
                      {r.region}
                    </span>
                    <span className="t-num text-text-2">
                      {r.households.toLocaleString("ko-KR")}세대 · {r.count}곳
                    </span>
                  </button>
                );
              })}
              </div>
              {regions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setRegionsOpen((v) => !v)}
                  aria-expanded={regionsOpen}
                  className="press mt-0.5 min-h-[40px] rounded-lg bg-bg py-1.5 text-center t-sub font-bold text-primary"
                >
                  {regionsOpen ? "상위 5개만 보기" : `지역 전체 보기 (${regions.length}곳)`}
                </button>
              )}
              {region !== null && (
                <button
                  type="button"
                  onClick={() => selectRegion(null)}
                  className="press mt-1 min-h-[40px] rounded-lg border border-line bg-surface py-1.5 t-sub font-bold text-text-1"
                >
                  전국 전체 보기
                </button>
              )}
              {/* [1015] "지역을 선택하면 …볼 수 있어요" 사용법 문장은 걷었다(브리프 규칙 B) */}
            </>
          )}
        </div>

        {/* AD 슬롯 — AdSlot 은 server-only 의존이 있어 서버 조각(prop)으로 받는다.
            유료 플랜 광고 제거는 plan={null} + AdFreeGate 클라이언트 게이트가 맡는다. */}
        <div className="rise-in-4">{adSlot}</div>
      </aside>
    </div>
  );
}
