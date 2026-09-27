"use client";

import { useEffect, useState } from "react";
import { Bars } from "@/app/components/viz/Bars";
// server-only 체인이 있는 모듈이라 값 import 는 불가 — 타입은 컴파일에서 소거되므로 안전.
import type { SupplyItem } from "@/lib/market/supply";
import { Explain } from "@/app/components/explain/Explain";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

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
 *
 * [v4] "한 화면 한 가지" — 가운데 한 줄. 위에서 아래로:
 *   지역 칩 한 줄(예전 오른쪽 "지역별 입주 요약" 버튼 5개 + "지역 전체 보기"/"상위 5개만"/"전국 전체 보기" — 같은 필터)
 *   → 주인공: 월별 입주 물량 막대(합계 · 가장 많은 달 한 줄) → 입주 예정 단지 목록(이번 분기부터, 1px 선 행)
 *   → 지난 입주·월 미정(접힘). 월별 세대수 24줄은 접힘으로(막대와 같은 값).
 * 같은 단지를 세 번 보이던 "이번 분기 입주" 카드 6장 · "다가오는 입주" 카드 6장 · 전체 표를 **한 목록**으로 합쳤다
 * (이번 분기 시작 달 이후 = 입주 예정 목록, 그 전 = 지난 입주). KPI 3칸 → 사실 한 줄, "입주 물량 인사이트"
 * 네이비 패널(AI 결과가 아니다 — 최다 입주 시기·총 세대 + 해설 문장)·"대표 단지만 추린 것" 안내 문장·광고 슬롯은 뺐다.
 */

/** [v4] 입주 예정 목록 첫 장 행 수 — 표(한 줄 행)가 두 줄 행 목록이 되어 200 → 60. 나머지는 "더 보기" */
const TABLE_INITIAL_ROWS = 60;

type MonthBucket = { ym: string; count: number; households: number };

/** [1009 · H] 입주월이 실제 달(01~12)인가 — 적재분에 "202700"(월 00)이 섞여 있어 화면에 "2027.00"·
    "2027년 0분기 입주 예정"이 나왔다(로컬 실측: 2곳 331세대). 형식만 보던 /^\d{6}$/ 검사를 달 범위까지 본다. */
function validYm(ym: string): boolean {
  if (!/^\d{6}$/.test(ym)) return false;
  const m = Number(ym.slice(4, 6));
  return m >= 1 && m <= 12;
}

function fmtYm(ym: string): string {
  if (/^\d{6}$/.test(ym) && !validYm(ym)) return `${ym.slice(0, 4)}년 월 미정`;
  if (!ym) return "월 미정";
  if (!validYm(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** 지역 묶음 키 — 예전 getSupplyRegions 의 String(row.region ?? "기타") 와 동일 규칙 */
function regionKey(s: SupplyItem): string {
  return s.region || "기타";
}

/** 예전 lib getSupplyRegions 와 동일: 지역별 집계, 세대수 내림차순 */
function deriveRegions(
  items: SupplyItem[],
): { region: string; count: number; households: number }[] {
  const map = new Map<string, { count: number; households: number }>();
  for (const s of items) {
    const key = regionKey(s);
    const e = map.get(key) ?? { count: 0, households: 0 };
    e.count += 1;
    e.households += Number(s.households ?? 0) || 0;
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

/** 이번 분기 첫 달 "YYYYMM" — 이 달 이후 입주 = 예정, 그 전 = 지난 입주 */
function quarterStartYm(d: Date): string {
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}${String((q - 1) * 3 + 1).padStart(2, "0")}`;
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
}: {
  items: SupplyItem[];
  truncated: boolean;
  asOfLabel: string | null;
  builtAtMs: number;
}) {
  // SSR/첫 하이드레이션은 전국(null) — 프리렌더 HTML 과 정확히 일치.
  const [region, setRegion] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);
  /* [v4] 지난 입주·월 미정 접힘도 첫 장만 그린다(HTML 을 늘리지 않게) — 나머지는 "더 보기" */
  const [pastExpanded, setPastExpanded] = useState(false);
  // ISR 페이지의 시각 파생값(이번 분기 판정)은 서버 시각으로 하이드레이션을
  // 일치시킨 뒤 마운트에서 실제 시각으로 재계산한다 (auctions 선례).
  const [nowMs, setNowMs] = useState(builtAtMs);

  useEffect(() => {
    setNowMs(Date.now());
    setRegion(readRegionFromLocation());
    const onPop = () => {
      setRegion(readRegionFromLocation());
      setTableExpanded(false);
      setPastExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectRegion = (next: string | null) => {
    setRegion(next);
    setTableExpanded(false);
    setPastExpanded(false);
    const url = next ? `/supply?region=${encodeURIComponent(next)}` : "/supply";
    window.history.pushState(null, "", url);
  };

  // ── 파생 (675행 규모라 렌더마다 계산해도 무시할 수준) ──────────────────────
  const regions = deriveRegions(items); // 항상 전량 기준 (예전 getSupplyRegions() 와 동일)
  const filtered = region ? items.filter((s) => regionKey(s) === region) : items;
  const monthly = deriveMonthly(filtered);
  const list = filtered; // 서버 정렬(move_in_ym asc)이 필터로 보존됨

  const totalHouseholds = monthly.reduce((s, m) => s + m.households, 0);
  const peak =
    monthly.length > 0
      ? monthly.reduce((a, b) => (b.households > a.households ? b : a))
      : null;
  const scope = region ? `${region} ` : "전국 ";

  /* [v4] 한 목록 — 이번 분기 첫 달 이후 입주 = 예정(입주월 오름차순), 그 전 = 지난 입주(최근 먼저), 달 미상 = 월 미정 */
  const startYm = quarterStartYm(new Date(nowMs));
  const upcoming = list.filter((s) => validYm(s.moveInYm) && s.moveInYm >= startYm);
  const past = list.filter((s) => validYm(s.moveInYm) && s.moveInYm < startYm).reverse();
  const noMonth = list.filter((s) => !validYm(s.moveInYm));

  const monthlyShown = monthly.slice(-24);
  /* [1009 · H] 입주월이 없거나 달이 잘못 적힌 단지 — 월별 합계에서 빠진다는 사실을 적는다(숨기지 않는다) */
  const noMonthHouseholds = noMonth.reduce((a, s) => a + (Number(s.households ?? 0) || 0), 0);
  const monthlyMax = monthlyShown.reduce((m, b) => Math.max(m, b.households), 0);

  const tableRows = tableExpanded ? upcoming : upcoming.slice(0, TABLE_INITIAL_ROWS);
  const tableHiddenCount = upcoming.length - tableRows.length;
  const pastAll = [...past, ...noMonth];
  const pastRows = pastExpanded ? pastAll : pastAll.slice(0, TABLE_INITIAL_ROWS);
  const pastHiddenCount = pastAll.length - pastRows.length;

  /* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 */
  const chip = (on: boolean) =>
    `press chip shrink-0 px-3 py-1.5 t-sub font-bold ${on ? "chip-active border" : "border border-line bg-surface text-text-2"}`;

  const row = (s: SupplyItem, key: string) => (
    <li key={key} className="flex min-h-14 items-center justify-between gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-bold text-ink">{s.aptName ?? "미정"}</span>
        <span className="mt-0.5 block truncate t-sub text-text-3">
          {[s.address ?? s.region, s.bizType].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="t-body t-num font-bold text-ink">{fmtYm(s.moveInYm)}</span>
        {s.households ? (
          <span className="t-caption t-num text-text-3">{s.households.toLocaleString("ko-KR")}세대</span>
        ) : null}
      </span>
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* 지역 필터 — [v4] 오른쪽 사이드 "지역별 입주 요약"(상위 5 + 전체 보기 토글 + 전국 보기 버튼)의 같은 필터를
          한 줄 가로 스크롤 칩으로. 얕은 pushState 라 서버 왕복이 없고, 켜진 칩을 다시 누르면 전국으로 돌아온다.
          칩 숫자 = 그 지역 단지 수(누르면 목록에 보이는 수) */}
      {regions.length > 0 && (
        <div className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0" role="group" aria-label="지역">
          <button type="button" onClick={() => selectRegion(null)} aria-pressed={region === null} className={chip(region === null)}>
            전국
          </button>
          {regions.map((r) => {
            const on = region === r.region;
            return (
              <button
                key={r.region}
                type="button"
                onClick={() => selectRegion(on ? null : r.region)}
                aria-pressed={on}
                className={chip(on)}
              >
                {r.region}
                <span className="ml-1 font-normal tabular-nums">{r.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {truncated && (
        <p className="t-sub text-text-3">
          조회 상한 도달 — 일부가 잘렸을 수 있어 지역별 곳수·세대수 합계가 실제보다 적게 보일 수 있음
        </p>
      )}

      {/* ── 주인공: 월별 입주 물량 — apartment_supply 실집계(월·세대수) ──────────────────
          예전에 이 자리에는 날짜 셀 42칸짜리 월 캘린더가 있었고, 매달 8·15·22·29일에 막대가 찍혀 있었다.
          그 네 날짜는 데이터가 아니라 코드에 박아 둔 상수였다 — apartment_supply 는 move_in_ym(입주 **월**)까지만
          가진 자료라 특정 일자를 알 방법이 아예 없다. 실제로 가진 축(월별 세대수)만 그린다 — 지어낼 값이 하나도 없다. */}
      <section aria-labelledby="supply-monthly-title" className="flex flex-col gap-2 text-primary">
        <div className="flex items-baseline justify-between gap-3">
          {/* [970 · B-44] 섹션 제목은 h2 */}
          <span className="flex items-center gap-0.5">
            <h2 id="supply-monthly-title" className="t-section text-ink">
              월별 입주 물량
            </h2>
            {/* [1009 · H] 입주 물량의 뜻과 이 화면의 집계 — 아래 월별 합계 계산 그대로.
                [1009 · H 리뷰] 출처를 사실대로: 청약홈 분양공고 입주예정월(매일 자동) + 2026년 2월 수동 업로드분.
                [1012] 규칙 6 — 화면 문구의 "적재"(내부 말)는 "갱신"으로 바꿨다. */}
            <Explain
              term="ipju-mulryang"
              how={[
                "청약홈 분양공고의 입주예정월(매일 갱신)과 공공데이터 입주예정물량(2026년 2월분)의 단지별 세대수를 입주월로 묶어 더했어요(입주월 순 마지막 24개월까지 표시).",
                "입주는 월 단위로만 공개돼 날짜는 알 수 없어요. 세대수가 비어 있는 단지는 0으로 더해져요.",
                "지역을 고르면 그 시·도 단지만 더해요.",
              ]}
              source={`청약홈 분양공고(공공데이터포털 API · 매일 갱신) · 공공데이터 입주예정물량(2026년 2월)${
                asOfLabel ? ` · ${asOfLabel} 기준` : ""
              }`}
            />
          </span>
          <span className="shrink-0 t-caption text-text-3">{scope}· 세대수</span>
        </div>

        {/* 24개월을 세로 막대 한 장으로 — "물량이 언제 몰리는가"의 모양 */}
        {monthlyShown.length > 2 && (
          <Bars
            values={monthlyShown.map((b) => b.households)}
            labels={monthlyShown.map((b) => fmtYm(b.ym))}
            height={110}
            valueSuffix="세대"
            ariaLabel="월별 입주 세대수"
          />
        )}
        {monthlyShown.length > 0 ? (
          /* [v4] KPI 3칸 → 사실 한 줄(합계 · 가장 많은 달). 단지 수는 아래 목록 머리가 말한다 */
          <p className="t-sub text-text-2">
            합계 <b className="t-num text-ink">{totalHouseholds.toLocaleString("ko-KR")}</b>세대 · {monthlyShown.length}개월
            {peak && (
              <>
                {" · "}가장 많은 달 <b className="t-num text-ink">{fmtYm(peak.ym)}</b>{" "}
                <span className="t-num">{peak.households.toLocaleString("ko-KR")}</span>세대
              </>
            )}
          </p>
        ) : (
          /* [1012] 규칙 6 — 어디서(지역)·무엇(월별 입주 물량). [v4] 빈 상태는 한 줄 */
          <p className="py-3 t-sub text-text-3">{region ?? "전국"} 월별 입주 물량 없음</p>
        )}
        {noMonth.length > 0 && (
          <p className="t-caption text-text-3">
            입주월이 비었거나 달이 잘못 적힌 {noMonth.length.toLocaleString("ko-KR")}곳(
            {noMonthHouseholds.toLocaleString("ko-KR")}세대)은 월별 합계에서 제외 — 아래 “지난 입주·월 미정”에 있음
          </p>
        )}
        {/* 월별 세대수 — 막대와 같은 값을 정확한 숫자로. [v4] 24줄 가로 막대 → 접힘(같은 사실은 한 번 — 펼치면 숫자) */}
        {monthlyShown.length > 0 && (
          <details className="group">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 t-sub font-bold text-text-2 [&::-webkit-details-marker]:hidden">
              월별 세대수 {monthlyShown.length}개월
              <span aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-1.5 pb-2">
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
                    <span className={`shrink-0 ${isPeak ? "font-bold text-primary" : "text-text-3"}`}>
                      {fmtYm(b.ym)}
                    </span>
                    <span className="rank-track text-primary">
                      <span className="rank-fill" style={{ width: `${pct}%`, opacity: isPeak ? 1 : 0.45 }} />
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-text-2">
                      {b.households.toLocaleString("ko-KR")}세대
                      <span className="ml-1 text-text-3">· {b.count}곳</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>

      {/* 입주 예정 단지 — 이번 분기부터(입주월 순). 곳수는 전량 기준(조용한 200 상한 정정), 목록은 첫 장에서 시작하고
          "더 보기"로 펼친다 (상한을 가리지 않는다). [v4] 카드 12장 + 5열 표 → 1px 선 행: 단지명 + 주소 · 사업유형 / 입주월 + 세대 */}
      <section aria-labelledby="supply-list-title" className="flex flex-col gap-1">
        <h2 id="supply-list-title" className="t-section text-ink">
          입주 예정 단지
          {upcoming.length > 0 && (
            <span className="ml-1.5 t-sub font-medium text-text-3">{upcoming.length.toLocaleString("ko-KR")}곳</span>
          )}
        </h2>
        {upcoming.length === 0 ? (
          /* [1012] 규칙 6 — 어디서·무엇. [v4] 빈 상태는 한 줄(출처는 페이지 끝 "데이터 출처") */
          <p className="py-3 t-sub text-text-3">{region ?? "전국"} 이번 분기 이후 입주 예정 단지 없음</p>
        ) : (
          <ul data-tone="sand" className="divide-y divide-line">{tableRows.map((s, i) => row(s, `u-${s.aptName ?? "미정"}-${i}`))}</ul>
        )}
        {tableHiddenCount > 0 && (
          <button type="button" onClick={() => setTableExpanded(true)} className="btn-ghost btn-md mt-2 w-full">
            {/* 글을 span 으로 — 40px 버튼 높이를 12px 글자 줄 수로 읽어 "3줄"로 오판하던 narrow-text 검사가 글 상자만 잰다 */}
            <span>나머지 {tableHiddenCount.toLocaleString()}곳 더 보기</span>
          </button>
        )}
      </section>

      {/* 지난 입주 · 월 미정 — [v4] 표의 앞머리(지난 달들)를 접힘으로. 최근 입주가 먼저 */}
      {pastAll.length > 0 && (
        <details className="group border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            <span>
              지난 입주 · 월 미정{" "}
              <span className="t-sub font-normal text-text-3">{pastAll.length.toLocaleString("ko-KR")}곳</span>
            </span>
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul data-tone="hanji" className="divide-y divide-line">{pastRows.map((s, i) => row(s, `p-${s.aptName ?? "미정"}-${i}`))}</ul>
          {pastHiddenCount > 0 && (
            <button type="button" onClick={() => setPastExpanded(true)} className="btn-ghost btn-md mb-2 w-full">
              <span>나머지 {pastHiddenCount.toLocaleString()}곳 더 보기</span>
            </button>
          )}
        </details>
      )}
    </div>
  );
}
