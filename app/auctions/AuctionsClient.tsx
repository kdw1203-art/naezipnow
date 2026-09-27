"use client";

/* 공매·경매 목록 (2026-08-10 ISR 전환, 사용량 절감 8차)
 *
 * 다른 목록과 다른 제약: 진행 물건 1,130건 > 페치 상한 200 — 전량을 내려보내
 * 클라이언트에서 거르면 필터 결과가 조용히 축소된다(DB 필터는 전체에서 거른다,
 * 실측). 그래서 구조가 셋으로 갈린다:
 *   · 기본 화면(파라미터 없음, 봇이 치는 URL): 서버가 내려준 initialItems —
 *     SSR HTML 에 전부 실린다. 페이지는 ISR(10분).
 *   · 필터(usage·gu): /api/auctions 를 fetch — DB 가 전체에서 거른 결과.
 *     API 는 조합별로 CDN 캐시(s-maxage=600)라 함수 호출이 조합당 10분에 1회.
 *   · (경매 탭은 2026-08-22 폐지 — 개선 #23. ?source=court 구 링크는 온비드로 수렴)
 *
 * 시각 파생값(D-day·진행/마감 분리·캘린더)은 builtAtMs(서버 렌더 시각)로
 * SSR/하이드레이션을 일치시키고, 마운트 후 실제 현재 시각으로 재계산한다 —
 * 예전 force-dynamic 판은 요청 시각, ISR 판은 조회 시각 기준이라 더 신선하다.
 *
 * useSearchParams 금지(프리렌더 HTML 소실 — /town/news 실측). 필터 상태는
 * 마운트 후 location.search + popstate, 칩은 얕은 pushState.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuctionApiItem } from "@/app/api/auctions/route";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ── lib/onbid/store 는 server-only(supabase) 를 끌고 와 값 import 불가.
      아래 둘은 원본(lib/onbid/store.ts)에서 복제 — 의미 변경 금지. ── */
const AUCTION_USAGE_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: "apt", label: "아파트", match: ["아파트"] },
  { key: "officetel", label: "오피스텔", match: ["오피스텔"] },
  { key: "villa", label: "빌라·연립", match: ["다세대", "연립", "빌라"] },
  { key: "house", label: "단독·다가구", match: ["단독", "다가구"] },
  { key: "land", label: "토지", match: ["대지", "토지", "전", "답", "임야"] },
  { key: "comm", label: "상가·업무", match: ["상가", "근린", "業務", "업무", "사무"] },
];
function isPastBidEnd(bidEnd: string | null, now: Date): boolean {
  if (!bidEnd) return false;
  const digits = bidEnd.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return false;
  const end = new Date(y, mo - 1, da);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() < today.getTime();
}

/* ── 포맷·파생 헬퍼 (page.tsx 에서 이동, now 를 인자로 받게만 바꿈) ── */
function fmtKrw(won: number | null): string {
  if (!won || won <= 0) return "—";
  const eok = won / 100_000_000;
  if (eok >= 1) return `${eok >= 10 ? eok.toFixed(1) : eok.toFixed(2)}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}
function fmtDt(v: string | null): string {
  if (!v || v.length < 8) return "—";
  return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}`;
}
function parseDigitsDate(v: string | null): Date | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return null;
  const d = new Date(y, mo - 1, da);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ddayFrom(v: string | null, now: Date): { label: string; urgent: boolean } | null {
  const target = parseDigitsDate(v);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return { label: "D-DAY", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

function sigunguDistribution(
  items: { sigungu: string | null }[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const s = it.sigungu?.trim();
    if (!s) continue;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

type CalCell = { day: number; muted: boolean; mark: boolean };
function buildCalendar(
  dates: (string | null)[],
  now: Date,
): { monthLabel: string; cells: CalCell[] } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsed = dates.map(parseDigitsDate).filter((d): d is Date => d !== null);
  const future = parsed
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const anchor = future.length > 0 ? future[0] : today;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const marked = new Set<number>();
  for (const d of parsed) {
    if (d.getFullYear() === year && d.getMonth() === month) marked.add(d.getDate());
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: CalCell[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    cells.push({ day: prevMonthDays - i + 1, muted: true, mark: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false, mark: marked.has(d) });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) cells.push({ day: trail++, muted: true, mark: false });
  /* 연도 포함(2026-08-22) — 앵커가 내년 첫 마감월일 수 있는데 "3월"만 적으면
     올해 3월로 읽힌다. 올해가 아닐 때만 연도를 붙여 소음을 줄인다. */
  const yearPrefix = year === now.getFullYear() ? "" : `${year}년 `;
  return { monthLabel: `${yearPrefix}${month + 1}월`, cells };
}

type AuctionCardData = {
  key: string;
  href: string;
  name: string;
  region: string;
  usage: string | null;
  status: string | null;
  targetDate: string | null;
  dday: { label: string; urgent: boolean } | null;
  minBidValue: string;
  appraisalValue: string;
  dateValue: string;
};

const ONBID_SEARCH_URL =
  "https://www.onbid.co.kr/op/cltrpbancinf/toppagemng/unfsrch/UnfSrchController/mvmnUnfSrchClg.do";
function onbidSearchHref(a: AuctionApiItem): string {
  const keyword = a.cltrMngNo ?? a.onbidCltrno;
  if (!keyword) return "https://www.onbid.co.kr";
  const params = new URLSearchParams({ swd: keyword, srvcDiv: "search", bfhdDiv: "Y" });
  return `${ONBID_SEARCH_URL}?${params.toString()}`;
}

function onbidToCard(a: AuctionApiItem, now: Date): AuctionCardData {
  return {
    key: a.externalKey,
    href: onbidSearchHref(a),
    name: a.name ?? "물건",
    region: [a.sido, a.sigungu, a.emd].filter(Boolean).join(" "),
    usage: a.usage,
    status: a.status,
    targetDate: a.bidEnd,
    dday: ddayFrom(a.bidEnd, now),
    minBidValue: fmtKrw(a.minBidKrw),
    appraisalValue: fmtKrw(a.appraisalKrw),
    dateValue: fmtDt(a.bidEnd),
  };
}

/* [개선 #23] SourceTabs·CourtAuctionPlaceholder 제거 — 경매 탭 폐지(위 주석). */

/* 필터 상태 — source 필드는 구 딥링크 호환용으로 남긴다(값은 이제 "onbid" 고정) */
type Filter = { usage: string | null; gu: string | null; source: "onbid" | "court" };

function pushFilterUrl(f: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (f.usage) sp.set("usage", f.usage);
  else sp.delete("usage");
  if (f.gu) sp.set("gu", f.gu);
  else sp.delete("gu");
  sp.delete("source"); // 경매 탭 폐지(#23) — 구 파라미터는 지운다
  window.history.pushState(null, "", url);
}

type Fetched =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; items: AuctionApiItem[]; activeTotal: number }
  | { state: "error" };

export function AuctionsClient({
  initialItems,
  initialActiveTotal,
  builtAtMs,
}: {
  initialItems: AuctionApiItem[];
  initialActiveTotal: number;
  /** 서버 렌더 시각 — SSR/하이드레이션의 시간 파생값을 일치시키는 기준 */
  builtAtMs: number;
}) {
  const [f, setF] = useState<Filter>({ usage: null, gu: null, source: "onbid" });
  const [fetched, setFetched] = useState<Fetched>({ state: "idle" });
  const [nowMs, setNowMs] = useState(builtAtMs);
  /* 표 표시 상한(2026-08-22) — "실데이터 1,130건" 헤더 아래 24행에서 뚝 끊기고
     끝이었다(페이지네이션 없음). 더보기로 48행씩 연다. 필터를 바꾸면 목록이
     새로 오므로 상한도 처음으로 되돌린다. */
  const [rowCap, setRowCap] = useState(24);

  useEffect(() => {
    setNowMs(Date.now());
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const u = (p.get("usage") ?? "").trim();
      const g = (p.get("gu") ?? "").trim();
      setF({
        usage: AUCTION_USAGE_FILTERS.some((x) => x.key === u) ? u : null,
        gu: /^[가-힣]{1,10}( [가-힣]{1,10})?$/.test(g) ? g : null, // [941] "성남시 분당구" 공백 1칸 허용
        source: "onbid", // 경매 탭 폐지(#23)
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* 필터가 걸리면 DB 필터 결과를 API 로 받아온다(전체 1,130건 대상 — 축소 없음) */
  const filterKey = f.usage || f.gu ? `${f.usage ?? ""}|${f.gu ?? ""}` : null;
  useEffect(() => {
    if (!filterKey) {
      setFetched({ state: "idle" });
      return;
    }
    let alive = true;
    setFetched({ state: "loading" });
    const sp = new URLSearchParams();
    const [u, g] = filterKey.split("|");
    if (u) sp.set("usage", u);
    if (g) sp.set("gu", g);
    fetch(`/api/auctions?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { ok: boolean; items?: AuctionApiItem[]; activeTotal?: number }) => {
        if (!alive) return;
        if (d.ok && Array.isArray(d.items)) {
          setFetched({ state: "ok", items: d.items, activeTotal: d.activeTotal ?? 0 });
          setNowMs(Date.now());
        } else setFetched({ state: "error" });
      })
      .catch(() => {
        if (alive) setFetched({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [filterKey]);

  const set = (patch: Partial<Filter>) => {
    const next = { ...f, ...patch };
    setF(next);
    setRowCap(24); // 새 조건 = 새 목록 — 표 상한도 처음부터
    pushFilterUrl(next);
  };

  const usingFetched = filterKey !== null && fetched.state === "ok";
  const items = usingFetched ? fetched.items : initialItems;
  const activeTotal = usingFetched ? fetched.activeTotal : initialActiveTotal;
  const fetchFailed = filterKey !== null && fetched.state === "error";
  const fetchLoading = filterKey !== null && (fetched.state === "loading" || fetched.state === "idle");

  const derived = useMemo(() => {
    const now = new Date(nowMs);
    const activeItems = items.filter((it) => !isPastBidEnd(it.bidEnd, now));
    const pastItems = items
      .filter((it) => isPastBidEnd(it.bidEnd, now))
      .sort((a, b) => (b.bidEnd ?? "").localeCompare(a.bidEnd ?? ""))
      .slice(0, 8);
    const cards = activeItems.map((a) => onbidToCard(a, now));
    const pastCards = pastItems.map((a) => onbidToCard(a, now));
    const guDist = sigunguDistribution(activeItems);
    const { monthLabel, cells } = buildCalendar(cards.map((c) => c.targetDate), now);
    return { cards, pastCards, guDist, monthLabel, cells };
  }, [items, nowMs]);

  const { cards, pastCards, guDist, monthLabel, cells } = derived;
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

  /* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 — 한 줄 가로 스크롤 필터 칩 */
  const chip = (on: boolean) =>
    `press chip shrink-0 px-3 py-1.5 t-sub font-bold ${on ? "chip-active border" : "border border-line bg-surface text-text-2"}`;
  const filtered = Boolean(f.usage || f.gu);
  /* 조건 이름 — 용도는 키("apt")가 아니라 라벨("아파트")로 적는다 */
  const conditionLabel = [f.gu, AUCTION_USAGE_FILTERS.find((x) => x.key === f.usage)?.label].filter(Boolean).join(" · ");

  /* [개선 #23, 2026-08-22] 경매(법원) 탭 제거 — 결정 근거:
     대법원 법원경매정보는 공개 API 를 제공하지 않고, 동기화 코드는 소스 키
     미설정 스텁 상태였다(court_auctions 1행 실측). 상시 "준비 중" 탭은
     신뢰만 깎는다 — 탭을 내리고 아래 외부 링크 한 줄로 대체한다. 백엔드
     (store·sync·크론)는 소스가 생기는 날을 위해 남겨 둔다.
     구 딥링크(?source=court)는 온비드 화면으로 자연 수렴한다.

     [v4] "한 화면 한 가지" — 주인공은 **물건 목록 하나**(1px 선 행). 위에서 아래로:
       용도 칩 한 줄 → 지역 칩 한 줄(예전 사이드 "지역별 요약" 버튼 — 같은 gu 필터) → 목록(마감 임박순) → 더 보기 →
       채움 파랑 "저장 검색으로 알림 받기"(하나) → 입찰 캘린더·지난 공고(접힘).
     같은 물건을 세 번 보이던 "진행 중 물건" 카드 6장 · "마감 임박/예정" 카드 4장 · 표를 **한 목록**으로 합쳤다
     (행 = 물건명 + 소재지 · 용도 · 감정가 / 최저입찰가 + D-day). 요약 문장·파랑 안내 상자·"공매 인사이트"
     네이비 패널(AI 결과가 아니다 — 입찰 중 건수·현재 목록 수·최다 용도 문장)·용도별 막대(불러온 200건 기준 분포)·
     광고 슬롯은 뺐다. 출처·면책·온비드 링크는 페이지 끝 "데이터 출처"(page.tsx)로. */
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* 용도 필터 — 한 줄 가로 스크롤 */}
        <div className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0" role="group" aria-label="용도">
          <button
            type="button"
            onClick={() => set({ usage: null })}
            aria-pressed={!f.usage}
            /* [975] 예전엔 여기 style={{color:"#fff"}} 가 있었다. 962 에서 chip-active
               배경이 잉크 채움 → 한지(#F6F1E7)로 바뀌었는데 이 인라인만 남아서
               크림 위 흰 글자, 1.13:1 이 됐다. 색은 클래스가 정한다. */
            className={chip(!f.usage)}
          >
            전체
          </button>
          {AUCTION_USAGE_FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={f.usage === x.key}
              onClick={() => set({ usage: f.usage === x.key ? null : x.key })}
              className={chip(f.usage === x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>

        {/* 지역(자치구) 필터 — 예전 오른쪽 "지역별 요약" 카드의 버튼과 같은 gu 필터. 숫자는 붙이지 않는다
            (불러온 목록 기준 수라, 누르면 전체에서 거른 결과와 달라질 수 있다) */}
        {(guDist.length > 0 || f.gu) && (
          <div className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0" role="group" aria-label="지역">
            <button type="button" onClick={() => set({ gu: null })} aria-pressed={!f.gu} className={chip(!f.gu)}>
              전 지역
            </button>
            {guDist
              .filter((g) => g.name !== f.gu)
              .concat(f.gu ? [{ name: f.gu, count: 0 }] : [])
              .sort((a, b) => (a.name === f.gu ? -1 : b.name === f.gu ? 1 : 0))
              .map((g) => (
                <button
                  key={g.name}
                  type="button"
                  aria-pressed={f.gu === g.name}
                  onClick={() => set({ gu: f.gu === g.name ? null : g.name })}
                  className={chip(f.gu === g.name)}
                >
                  {g.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {fetchFailed ? (
        /* 필터 조회 실패 — "0건"이 아니라 실패라고 말한다. [v4] 빈 상자 → 한 줄 + 버튼 */
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="t-body text-text-2">이 조건의 목록을 지금 불러오지 못했어요 — 물건이 0건인 게 아니라 조회 실패</p>
          <button type="button" onClick={() => set({ usage: null, gu: null })} className="btn-outline btn-md">
            {/* [1012] 규칙 5 — 동사 + 구체 대상 */}
            전체 {activeTotal.toLocaleString()}건 보기
          </button>
        </div>
      ) : fetchLoading ? (
        <p className="py-12 text-center t-body text-text-3">조건에 맞는 물건을 불러오는 중…</p>
      ) : (
        <>
          {/* 주인공 — 진행·예정 물건 목록(마감 임박순). 행 전체가 온비드 검색(새 탭)으로 간다 */}
          <section aria-labelledby="auction-list-title" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="auction-list-title" className="t-section text-ink">
                진행·예정 물건
              </h2>
              <span className="shrink-0 t-sub text-text-3">
                {filtered ? (
                  <>
                    {conditionLabel}{" "}
                    <span className="t-num">{cards.length.toLocaleString()}</span>건
                  </>
                ) : (
                  "마감 임박순"
                )}
              </span>
            </div>
            {cards.length === 0 ? (
              /* [1012] 규칙 6 — 어디서(조건)·전체 건수. [v4] 빈 상태는 한 줄 */
              <p className="py-6 t-sub text-text-3">
                {conditionLabel || "현재 조건"} 진행·예정 공매 물건 0건 · 온비드 전체{" "}
                {activeTotal.toLocaleString()}건
              </p>
            ) : (
              <ul data-tone="sand" className="divide-y divide-line">
                {cards.slice(0, rowCap).map((c) => (
                  <li key={c.key}>
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="온비드에서 보기"
                      className="flex min-h-14 items-center gap-3 py-3 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate t-body font-bold text-ink">{c.name}</span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">
                          {[c.region, c.usage, c.appraisalValue !== "—" ? `감정 ${c.appraisalValue}` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="t-body font-bold text-ink">
                          <span className="t-caption font-normal text-text-3">최저 </span>
                          <span className="t-num">{c.minBidValue}</span>
                        </span>
                        {/* [970 · B-35] "D-17" 줄바꿈 금지 · 임박(3일 안)은 위험색 글자 */}
                        <span
                          className={`whitespace-nowrap t-caption t-num ${
                            c.dday?.urgent ? "font-bold text-danger" : "text-text-3"
                          }`}
                        >
                          {c.dday ? c.dday.label : c.dateValue}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {cards.length > rowCap && (
              <button
                type="button"
                onClick={() => setRowCap((n) => n + 48)}
                className="btn-ghost btn-md mt-2 w-full"
              >
                {/* [1012] 규칙 5 — 동사 + 대상 */}
                물건 더 보기 ({Math.min(rowCap, cards.length).toLocaleString()} / {cards.length.toLocaleString()}건)
              </button>
            )}
          </section>

          {/* [1012] 규칙 9 — 이 화면의 채움 파랑 1개. [v4] 목록 위 알약 · 네이비 패널 안 한지 칩 두 곳 → 목록 끝 하나 */}
          <Link href="/my/watchlist?tab=searches" className="btn-primary btn-md w-full no-underline">
            저장 검색으로 알림 받기
          </Link>

          {/* 곁가지 둘 — 접힘(1px 선으로 이어진 행) */}
          <div className="flex flex-col border-b border-line">
          {/* 입찰 캘린더 — [v4] 카드 → 접힘(곁가지). 달력 칸 자체는 그대로(마감일이 있는 날 표시) */}
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              {monthLabel} 입찰 캘린더
              <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-2 pb-3">
              <div className="grid grid-cols-7 gap-1 text-center t-caption text-text-3">
                {weekdays.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c, i) => (
                  <div
                    key={i}
                    className={`h-11 rounded-lg px-1.5 py-1 text-[10px] ${
                      c.mark
                        ? "border border-line bg-primary-soft text-text-1"
                        : c.muted
                          /* [975] on-dark-* 는 어두운 면 위 글자용이다. 밝은 칸에
                             얹혀서 1.05:1 이었다. 흐린 날은 색 단계로 낮춘다. */
                          ? "bg-bg text-text-3"
                          : "bg-bg text-text-2"
                    }`}
                  >
                    {c.day}
                    {c.mark && <div className="mt-0.5 h-1.5 rounded-sm bg-primary" />}
                  </div>
                ))}
              </div>
              <p className="t-caption text-text-3">파랑 칸 = 입찰 마감일이 있는 날</p>
            </div>
          </details>

          {/* 지난 공고 — 입찰이 마감된 최근 물건. [v4] 카드 안 표 → 접힘 안 1px 선 행 */}
          {pastCards.length > 0 && (
            <details className="group border-t border-line pt-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
                <span>
                  지난 공고 <span className="t-sub font-normal text-text-3">최근 마감 {pastCards.length}건</span>
                </span>
                <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <ul data-tone="hanji" className="divide-y divide-line pb-2">
                {pastCards.map((c) => (
                  <li key={c.key} className="flex min-h-14 items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-text-2">{c.name}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {[c.region, c.usage].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="t-body t-num text-text-2">{c.minBidValue}</span>
                      <span className="t-caption t-num text-text-3">{c.dateValue} 마감</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="pb-3 t-caption text-text-3">결과·재공고 여부는 온비드 공고 원문</p>
            </details>
          )}
          </div>
        </>
      )}
    </div>
  );
}

export default AuctionsClient;
