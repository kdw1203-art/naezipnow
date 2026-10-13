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
import { HScroll } from "@/app/components/HScroll";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AIPanel } from "@/app/components/AIPanel";
import { Explain } from "@/app/components/explain/Explain";
import { MiniBar } from "@/app/components/compact/MiniBar";
import { Fineprint } from "@/app/components/Fineprint";
import type { AuctionApiItem } from "@/app/api/auctions/route";
import { sigunguDistribution } from "@/lib/onbid/region-summary";

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

function usageDistribution(
  items: { usage: string | null }[],
): { label: string; count: number }[] {
  return AUCTION_USAGE_FILTERS.map((f) => ({
    label: f.label,
    count: items.filter((it) => {
      const u = it.usage;
      if (!u || f.match.length === 0) return false;
      const lower = u.toLowerCase();
      /* 서버(lib/onbid/store.ts)와 동일 규칙: 한 글자("전"·"답")는 정확일치 —
         %전% 부분일치는 "전시장"류를 토지로 세는 과매칭이었다(2026-08-22). */
      return f.match.some((m) =>
        m.length === 1 ? u.trim() === m : lower.includes(m.toLowerCase()),
      );
    }).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
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
  /** [1038 · 19] 최저입찰가 ÷ 감정가(%) — 둘 다 있을 때만 */
  bidRatio: number | null;
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
    bidRatio: a.minBidKrw && a.appraisalKrw && a.appraisalKrw > 0 ? Math.round((a.minBidKrw / a.appraisalKrw) * 100) : null,
    dateValue: fmtDt(a.bidEnd),
  };
}

/* [개선 #23] SourceTabs·CourtAuctionPlaceholder 제거 — 경매 탭 폐지(위 주석). */

/* [1063 · 표·그래프] 물건 한 줄 — 예전에는 묶음마다 테두리 카드가 4~6장 쌓였다(장마다 3줄 + 오른쪽 버튼).
   이제 한 판 안 머리카락 선 줄이고, 줄 전체가 온비드 검색 링크다(폰 탭 면 40px).
   왼쪽: D-day · 물건 이름(굵게) · 용도 / 보조 줄: 소재지 · 감정가 · 감정가 대비 % · 입찰마감.
   오른쪽: 최저입찰가 숫자. 카드에 있던 값은 하나도 빼지 않았다 — 자리만 한 줄로 모았다. */
function AuctionLine({ c }: { c: AuctionCardData }) {
  return (
    <a
      href={c.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${c.name} 온비드 검색`}
      className="flex min-h-[40px] items-center justify-between gap-3 py-2 no-underline"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {c.dday && (
            /* [970 · B-35] 좁은 카드에서 "D-17"이 두 줄로 꺾였다 — 줄바꿈·수축 금지 */
            <span
              className={`shrink-0 whitespace-nowrap rounded-md chip-pad t-caption font-bold text-white ${
                c.dday.urgent ? "bg-danger" : "bg-primary"
              }`}
            >
              {c.dday.label}
            </span>
          )}
          <span className="truncate t-body font-bold text-ink">{c.name}</span>
          {c.usage && (
            <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 t-caption font-bold text-primary">
              {c.usage}
            </span>
          )}
        </span>
        {/* 보조 줄은 말줄임하지 않는다 — 390px 에서 두 줄로 접히더라도 감정가·%·마감일이 잘리지 않아야 한다 */}
        <span className="t-caption text-text-3">
          {c.region || "—"} · 감정가 {c.appraisalValue}
          {/* [1038 · 19] 감정가 대비 최저입찰가 % — 낮을수록 유찰이 쌓인 물건(70% 미만 빨강 · 90% 미만 노랑) */}
          {c.bidRatio != null && (
            <>
              {" · 감정가 대비 "}
              <b
                className={`t-num ${
                  c.bidRatio < 70 ? "text-danger" : c.bidRatio < 90 ? "text-warning" : "text-text-2"
                }`}
              >
                {c.bidRatio}%
              </b>
            </>
          )}
          {` · 입찰마감 ${c.dateValue}`}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right">
        <b className="block t-num t-sub text-primary">{c.minBidValue}</b>
        <span className="block t-caption font-medium text-text-3">최저입찰가 ↗</span>
      </span>
    </a>
  );
}

/* [1030 · G6] 시도 칩 — 값은 온비드 소재지 시도 원문(DB sido 열과 같은 글자). 2026-10-04 진행 물건이 있는 시도 7곳. */
const AUCTION_SIDO_CHIPS: readonly { value: string; label: string }[] = [
  { value: "서울특별시", label: "서울" },
  { value: "경기도", label: "경기" },
  { value: "인천광역시", label: "인천" },
  { value: "부산광역시", label: "부산" },
  { value: "대구광역시", label: "대구" },
  { value: "울산광역시", label: "울산" },
  { value: "대전광역시", label: "대전" },
];

/* 필터 상태 — source 필드는 구 딥링크 호환용으로 남긴다(값은 이제 "onbid" 고정) */
type Filter = { usage: string | null; gu: string | null; sido: string | null; source: "onbid" | "court" };

function pushFilterUrl(f: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (f.usage) sp.set("usage", f.usage);
  else sp.delete("usage");
  if (f.gu) sp.set("gu", f.gu);
  else sp.delete("gu");
  /* [1030 · G6] 시도는 시군구 없이도 선다(시도 칩 줄) */
  if (f.sido) sp.set("sido", f.sido);
  else sp.delete("sido");
  sp.delete("source"); // 경매 탭 폐지(#23) — 구 파라미터는 지운다
  window.history.pushState(null, "", url);
}

type Fetched =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; items: AuctionApiItem[]; activeTotal: number; matchTotal: number }
  | { state: "error" };

export function AuctionsClient({
  initialItems,
  initialActiveTotal,
  builtAtMs,
  adSlot,
}: {
  initialItems: AuctionApiItem[];
  initialActiveTotal: number;
  /** 서버 렌더 시각 — SSR/하이드레이션의 시간 파생값을 일치시키는 기준 */
  builtAtMs: number;
  /** 서버 조각 — AdSlot 은 server-only 의존이라 여기서 못 그린다 */
  adSlot: ReactNode;
}) {
  const [f, setF] = useState<Filter>({ usage: null, gu: null, sido: null, source: "onbid" });
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
      const sd = (p.get("sido") ?? "").trim();
      const gu = /^[가-힣]{1,10}( [가-힣]{1,10})?$/.test(g) ? g : null; // [941] "성남시 분당구" 공백 1칸 허용
      setF({
        usage: AUCTION_USAGE_FILTERS.some((x) => x.key === u) ? u : null,
        gu,
        sido: /^[가-힣]{2,10}$/.test(sd) ? sd : null, // [1028] 한글 2~10자 · [1030] 시군구 없이도 받는다(시도 칩)
        source: "onbid", // 경매 탭 폐지(#23)
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* 필터가 걸리면 DB 필터 결과를 API 로 받아온다(전체 1,130건 대상 — 축소 없음) */
  const filterKey = f.usage || f.gu || f.sido ? `${f.usage ?? ""}|${f.gu ?? ""}|${f.sido ?? ""}` : null;
  useEffect(() => {
    if (!filterKey) {
      setFetched({ state: "idle" });
      return;
    }
    let alive = true;
    setFetched({ state: "loading" });
    const sp = new URLSearchParams();
    const [u, g, sd] = filterKey.split("|");
    if (u) sp.set("usage", u);
    if (g) sp.set("gu", g);
    if (sd) sp.set("sido", sd);
    fetch(`/api/auctions?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { ok: boolean; items?: AuctionApiItem[]; activeTotal?: number; matchTotal?: number }) => {
        if (!alive) return;
        if (d.ok && Array.isArray(d.items)) {
          setFetched({ state: "ok", items: d.items, activeTotal: d.activeTotal ?? 0, matchTotal: d.matchTotal ?? d.items.length });
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
  /* [1028] 조건에 맞는 진행·예정 건수(DB 집계) — 목록은 마감 임박순 200건까지만 온다 */
  const matchTotal = usingFetched ? fetched.matchTotal : null;
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
    const dist = usageDistribution(activeItems);
    const guDist = sigunguDistribution(activeItems);
    const withDday = cards.filter((c) => c.dday !== null);
    const imminent = withDday.filter((c) => c.dday?.urgent).slice(0, 4);
    const ongoing = withDday.filter((c) => !c.dday?.urgent).slice(0, 6);
    /* [1063 · 표·그래프] 머리 숫자 — 지금 보이는 목록에서 **직접 센** 값만. 임박 건수는 묶음에 그리는 4장이 아니라 전체이고,
       마감 범위는 가진 입찰마감일의 처음·끝이다(없는 날짜를 만들지 않는다). */
    const urgentCount = withDday.filter((c) => c.dday?.urgent).length;
    const endDigits = cards
      .map((c) => (c.targetDate ?? "").replace(/\D/g, ""))
      .filter((d) => d.length >= 8)
      .sort();
    const endRange =
      endDigits.length > 0
        ? `${fmtDt(endDigits[0])}~${fmtDt(endDigits[endDigits.length - 1])}`
        : null;
    const { monthLabel, cells } = buildCalendar(cards.map((c) => c.targetDate), now);
    return { cards, pastCards, dist, guDist, imminent, ongoing, urgentCount, endRange, monthLabel, cells };
  }, [items, nowMs]);

  const { cards, pastCards, dist, guDist, imminent, ongoing, urgentCount, endRange, monthLabel, cells } = derived;
  /* [1028] 요약 칸(지역별·용도별)의 기준 — 받은 목록이 전체(또는 조건 전체)보다 적을 때만 적는다 */
  const listTotal = f.usage || f.gu || f.sido ? matchTotal : activeTotal;
  const basisNote = listTotal != null && cards.length > 0 && cards.length < listTotal ? `표시 중 ${cards.length.toLocaleString()}건 기준` : null;
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

  const chip = (on: boolean) =>
    on
      ? "chip-active px-3 py-1.5 text-xs"
      : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2";

  /* [개선 #23, 2026-08-22] 경매(법원) 탭 제거 — 결정 근거:
     대법원 법원경매정보는 공개 API 를 제공하지 않고, 동기화 코드는 소스 키
     미설정 스텁 상태였다(court_auctions 1행 실측). 상시 "준비 중" 탭은
     신뢰만 깎는다 — 탭을 내리고 아래 외부 링크 한 줄로 대체한다. 백엔드
     (store·sync·크론)는 소스가 생기는 날을 위해 남겨 둔다.
     구 딥링크(?source=court)는 온비드 화면으로 자연 수렴한다. */
  return (
    <>
      {/* [1030 · G6] 시도 칩 줄 — 기본 목록(마감 임박순 200건)이 전부 대전·대구라 서울·경기 이용자에게 보이는 물건이
          없었다(2026-10-04 운영 실측 · 진행 8,351건 중 서울 2,465). 시도만 고르면 /api/auctions?sido= 로 그 시도 전체에서
          마감 임박순 200건 · 지역별 요약도 그 시도 기준. 시군구를 고르면 시도는 그대로 두고 좁힌다. */}
      <div className="rise-in mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="시도">
        <button
          type="button"
          onClick={() => set({ sido: null, gu: null })}
          className={chip(!f.sido)}
        >
          전국
        </button>
        {AUCTION_SIDO_CHIPS.map((x) => (
          <button
            key={x.value}
            type="button"
            onClick={() => set({ sido: f.sido === x.value ? null : x.value, gu: null })}
            className={chip(f.sido === x.value)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {/* 상단 필 행: 용도 필터 + CTA */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => set({ usage: null })}
            /* [975] 예전엔 여기 style={{color:"#fff"}} 가 있었다. 962 에서 chip-active
               배경이 잉크 채움 → 한지(#F6F1E7)로 바뀌었는데 이 인라인만 남아서
               크림 위 흰 글자, 1.13:1 이 됐다. 색은 클래스가 정한다. */
            className={
              !f.usage
                ? "chip-active px-3 py-1.5 text-xs"
                : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2"
            }
          >
            전체
          </button>
          {AUCTION_USAGE_FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => set({ usage: f.usage === x.key ? null : x.key })}
              /* [1030 · G6] 인라인 흰 글자 삭제 — chip-active 는 한지(크림) 바탕이라 고른 용도 칩 글자가 안 보였다("전체" 칩은 [975]에서 이미 뺐다) */
              className={chip(f.usage === x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* [1063] 이 화면의 주 액션 하나 — 채움 파랑은 "저장 검색으로 알림 받기"뿐이고(필터를 걸어 둔 채 알림),
            AI 요약 칸의 같은 링크는 패널 기본 꼴(cta)로 내렸다. 폰 탭 면 40px. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="https://www.onbid.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="press glass inline-flex min-h-[40px] items-center rounded-full px-3.5 t-sub font-bold text-primary no-underline md:min-h-9"
          >
            온비드 바로가기 ↗
          </a>
          <Link
            href="/my/watchlist?tab=searches"
            className="btn-primary press inline-flex min-h-[40px] items-center rounded-full px-4 t-sub no-underline md:min-h-9"
          >
            저장 검색으로 알림 받기
          </Link>
        </div>
      </div>

      {fetchFailed ? (
        /* 필터 조회 실패 — "0건"이 아니라 실패라고 말한다 */
        <div className="rise-in-1 card p-[var(--pad-card)]">
          <div className="rounded-lg border border-line bg-surface px-4 py-12 text-center t-body text-text-3 max-md:py-6">
이 조건의 목록 불러오기 실패 · 잠시 후 다시{" "}
            <button
              type="button"
              onClick={() => set({ usage: null, gu: null, sido: null })}
              className="font-bold text-primary underline"
            >
              전체 목록 보기
            </button>
          </div>
        </div>
      ) : fetchLoading ? (
        <div className="rise-in-1 card p-[var(--pad-card)]">
          <div className="rounded-lg border border-line bg-surface px-4 py-12 text-center t-body text-text-3">
            조건에 맞는 물건을 불러오는 중…
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-3">
            {/* a) [1063 · 표·그래프] 숫자 넉 칸 + 용도 막대 + 접기 한 판.
                예전에 이 자리는 42칸 달력이었고, 건수 문장은 그 위 한 줄, 용도 막대는 오른쪽 레일 맨 아래였다 —
                폰 첫 화면이 날짜 격자로 덮여 "지금 몇 건이 어떤 용도로 떠 있나"를 스크롤해야 알았다.
                달력은 표 아래로 내렸고(날짜 표시는 그대로), 숫자는 전부 받은 목록에서 센 값이다. */}
            <section className="rise-in-1 card p-[var(--pad-card)]" aria-label="공매 물건 요약">
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {[
                  { k: "입찰 중·예정", v: `${activeTotal.toLocaleString()}건` },
                  { k: "표시 중", v: `${cards.length.toLocaleString()}건` },
                  { k: "마감 임박 · D-3 이내", v: `${urgentCount.toLocaleString()}건` },
                  ...(endRange ? [{ k: "입찰마감", v: endRange }] : []),
                ].map((f) => (
                  <div
                    key={f.k}
                    className="flex min-w-0 flex-col-reverse gap-0.5 sm:border-l sm:border-line sm:pl-3 sm:first:border-l-0 sm:first:pl-0"
                  >
                    <dt className="t-caption text-text-3">{f.k}</dt>
                    <dd className="m-0 t-num t-section text-ink">{f.v}</dd>
                  </div>
                ))}
              </dl>

              {/* 용도별 요약 — 한 그래프에 한 단위(건)만. 값은 지금 받은 목록에서 센 수다 */}
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <h2 className="m-0 t-section font-bold text-ink">용도별 요약</h2>
                  {/* [1028] 이 건수는 지금 받은 목록(마감 임박순 최대 200건)에서 센 값이다 — 전체 건수로 읽히지 않게 기준을 적는다 */}
                  {basisNote && <span className="t-caption font-medium tabular-nums text-text-3">{basisNote}</span>}
                </div>
                {dist.length > 0 ? (
                  <MiniBar
                    className="mt-2"
                    rows={dist.map((d) => ({ label: d.label, value: d.count }))}
                    unit="건"
                    label="용도별 물건 수"
                  />
                ) : (
                  <p className="mt-2 t-caption text-text-3">표시할 용도 분포 없음</p>
                )}
              </div>

              {/* 요약 한 줄 — 사실만(숫자·출처). [1015] 아래에 있던 안내 띠("…기준이며 매일 자동 갱신됩니다. …반드시
                  확인하세요")는 걷고 ⓘ 하나로 접었다(브리프 규칙 B). 갱신 주기·원문 우선 원칙은 시트 안에 그대로.
                  [1063] 그 한 줄도 접기 뒤로 — 같은 건수를 위 숫자 칸이 먼저 말한다(문장은 그대로 둔다). */}
              <Fineprint className="mt-3" label="기준 · 출처">
                <span className="flex flex-wrap items-center gap-x-1">
                  <span>
                    온비드 입찰 중·예정 물건{" "}
                    <strong className="text-ink">{activeTotal.toLocaleString()}건</strong> · 한국자산관리공사 공공데이터
                  </span>
                  <Explain
                    title="공매 물건 자료"
                    body={[
                      "감정가·최저입찰가·입찰일정은 한국자산관리공사 온비드 공공데이터 기준이고 매일 갱신됩니다.",
                      "갱신 사이에 변경·취소될 수 있어 실제 입찰·명도 조건은 온비드(onbid.co.kr) 공고 원문이 우선합니다.",
                    ]}
                    how={[
                      "진행·예정 = 입찰 마감일이 오늘 이후인 물건. 마감 임박 = D-3 이내.",
                      "용도 분류(아파트·오피스텔·빌라·단독·토지·상가)는 온비드 용도 문자열을 그대로 묶은 것입니다.",
                    ]}
                    source="한국자산관리공사 온비드(공공데이터포털) · 매일 갱신"
                  />
                </span>
              </Fineprint>
            </section>

            {/* b) 진행 중 물건 — [1063] 테두리 카드 6장 → 한 판 안 머리카락 선 6줄(줄 전체가 온비드 검색 링크) */}
            {ongoing.length > 0 && (
              <section className="rise-in-2 card p-[var(--pad-card)]">
                {/* [1028] 괄호 건수를 뺐다 — 이 묶음에 보이는 카드 수(최대 6)라 전체 건수(위 "입찰 중·예정 N건")와 다르게 읽혔다 */}
                <h2 className="m-0 t-section font-bold text-primary">진행 중 물건</h2>
                <div data-tone="plain" className="mt-1.5 flex flex-col divide-y divide-line">
                  {ongoing.map((c) => (
                    <AuctionLine key={c.key} c={c} />
                  ))}
                </div>
              </section>
            )}

            {/* c) 마감 임박 / 예정 */}
            {imminent.length > 0 && (
              <section className="rise-in-3 card p-[var(--pad-card)]">
                <h2 className="m-0 t-section font-bold text-danger">마감 임박 · D-3 이내</h2>
                <div data-tone="plain" className="mt-1.5 flex flex-col divide-y divide-line">
                  {imminent.map((c) => (
                    <AuctionLine key={c.key} c={c} />
                  ))}
                </div>
              </section>
            )}

            {/* d) 진행·예정 물건 표 */}
            <div className="rise-in-4 px-1 pt-1.5 text-xs font-bold text-text-3">
              {/* [1028] 목록은 마감이 가까운 순으로 최대 200건만 읽는다 — 전체 건수와 지금 보이는 건수를 같이 적는다 */}
              진행·예정 물건 {activeTotal.toLocaleString()}건
              {f.usage || f.gu ? (
                <>
                  {" "}
                  · 현재 조건 {(matchTotal ?? cards.length).toLocaleString()}건
                  {matchTotal != null && cards.length < matchTotal ? <> · 마감 임박순 {cards.length.toLocaleString()}건 표시</> : null}
                </>
              ) : cards.length < activeTotal ? (
                <> · 마감 임박순 {cards.length.toLocaleString()}건 표시</>
              ) : null}
            </div>
            {cards.length === 0 ? (
              <div className="rise-in-4 card p-[var(--pad-card)]">
                <div className="rounded-lg border border-line bg-surface px-4 py-12 text-center t-body text-text-3 max-md:py-6">
현재 조건의 진행·예정 공매 물건 없음
                </div>
              </div>
            ) : (
              /* [1015] 표 껍데기 = 리퀴드 판(sand — 공매 톤, 브리프 규칙 I) */
              <div data-tone="sand"><HScroll className="rise-in-4 lq-panel py-1">
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                    <span>물건 · 소재지</span>
                    <span className="text-center">용도</span>
                    <span className="text-center">감정가</span>
                    <span className="text-center">최저가</span>
                    <span className="text-center">입찰마감</span>
                  </div>
                  {cards.slice(0, rowCap).map((c, i, arr) => (
                    <div
                      key={c.key}
                      className={`grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs ${
                        i < arr.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="truncate-1 font-bold text-ink">
                        {c.name}
                        {c.region ? (
                          <span className="ml-1 t-caption font-medium text-text-3">{c.region}</span>
                        ) : null}
                      </span>
                      <span className="truncate-1 text-center font-bold text-text-1">
                        {c.usage ?? "—"}
                      </span>
                      <span className="text-center font-bold text-text-1">{c.appraisalValue}</span>
                      {/* [1038 · 19] 최저가 아래 감정가 대비 % 막대 — 짧을수록 유찰이 쌓인 물건(70% 미만 빨강 · 90% 미만 노랑) */}
                      <span className="flex flex-col items-stretch gap-0.5 text-center font-bold text-primary">
                        {c.minBidValue}
                        {c.bidRatio != null && (
                          <span className="flex items-center gap-1" aria-label={`감정가 대비 ${c.bidRatio}%`}>
                            <span className="relative h-1.5 flex-1 rounded bg-bg">
                              <span className={`absolute left-0 h-1.5 rounded ${c.bidRatio < 70 ? "bg-danger" : c.bidRatio < 90 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(100, c.bidRatio)}%` }} />
                            </span>
                            <span className={`t-caption t-num font-medium ${c.bidRatio < 70 ? "text-danger" : c.bidRatio < 90 ? "text-warning" : "text-text-3"}`}>{c.bidRatio}%</span>
                          </span>
                        )}
                      </span>
                      <span className="text-center font-bold text-text-1">{c.dateValue}</span>
                    </div>
                  ))}
                  {cards.length > rowCap && (
                    <button
                      type="button"
                      onClick={() => setRowCap((n) => n + 48)}
                      className="press my-2 min-h-10 w-full rounded-xl bg-bg py-2.5 text-center t-sub font-bold text-primary"
                    >
                      더보기 ({Math.min(rowCap, cards.length).toLocaleString()} /{" "}
                      {cards.length.toLocaleString()}건)
                    </button>
                  )}
                  <div className="pb-2 pt-1 t-caption text-text-3">
                    마감 임박순 · 출처: 한국자산관리공사 온비드(공공데이터포털) · 매일 자동
                    갱신
                  </div>
                </div>
              </HScroll></div>
            )}

            {/* d-2) 입찰 캘린더 — [1063] 첫 화면의 42칸 격자를 표 아래로 내렸다(값·표시 규칙은 그대로).
                이 달에 마감이 걸린 날을 한 장으로 보는 자리이고, 날짜 자체는 위 표의 "입찰마감" 칸이 먼저 말한다. */}
            <details className="rise-in-4 card rounded-2xl px-[18px] py-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-2 t-sub font-bold text-text-2">
                <span>{monthLabel} 입찰 캘린더</span>
                <span className="flex items-center gap-1 t-caption font-medium text-text-3">
                  <span className="h-2 w-2 rounded-sm bg-primary" />
                  입찰마감일
                </span>
              </summary>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center t-caption text-text-3">
                {weekdays.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((c, i) => (
                  <div
                    key={i}
                    className={`h-11 rounded-lg px-1.5 py-1 t-caption ${
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
            </details>

            {/* e) 지난 공고 */}
            {pastCards.length > 0 && (
              <details className="rise-in-4 card rounded-2xl px-[18px] py-3">
                <summary className="cursor-pointer text-xs font-bold text-text-3">
                  지난 공고 (최근 마감 {pastCards.length}건 보기)
                </summary>
                <HScroll className="mt-2">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                      <span>물건 · 소재지</span>
                      <span className="text-center">용도</span>
                      <span className="text-center">감정가</span>
                      <span className="text-center">최저가</span>
                      <span className="text-center">입찰마감</span>
                    </div>
                    {pastCards.map((c, i, arr) => (
                      <div
                        key={c.key}
                        className={`grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs opacity-70 ${
                          i < arr.length - 1 ? "border-b border-divider" : ""
                        }`}
                      >
                        <span className="truncate-1 font-bold text-ink">
                          {c.name}
                          {c.region ? (
                            <span className="ml-1 t-caption font-medium text-text-3">
                              {c.region}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate-1 text-center font-bold text-text-1">
                          {c.usage ?? "—"}
                        </span>
                        <span className="text-center font-bold text-text-1">{c.appraisalValue}</span>
                        <span className="text-center font-bold text-text-1">{c.minBidValue}</span>
                        <span className="text-center font-bold text-text-1">{c.dateValue}</span>
                      </div>
                    ))}
                    <div className="pb-1 pt-1 t-caption text-text-3">
                      입찰 마감 공고 · 결과·재공고 여부는 온비드 원문 기준
                    </div>
                  </div>
                </HScroll>
              </details>
            )}

            {/* [1063] 출처·면책 문장은 한 자도 바꾸지 않고 접기 뒤로 */}
            <Fineprint className="rise-in-4 mt-1 px-1" label="출처 · 면책">
              출처: 한국자산관리공사 온비드(공공데이터포털) · 참고용 정보이며 권리분석·명도·정확한
              입찰조건은 온비드 공고 원문과 전문가 확인이 필요합니다.
            </Fineprint>
          </div>

          {/* 우측 사이드 */}
          <aside className="flex flex-col gap-3.5 max-md:gap-3">
            <div className="rise-in-2">
              {/* [1028] 건수·최다 용도를 센 값이다(AI 결과 아님) — "AI" 배지와 "인사이트"를 뗐다 */}
              {/* [1063] 채움 파랑은 화면당 하나 — 같은 링크를 위 머리 줄이 채움 파랑으로 들고 있으므로
                  여기서는 패널 기본 액션 꼴(cta)로 둔다(링크·문구는 그대로). */}
              <AIPanel
                title="공매 요약"
                ai={false}
                className="rounded-3xl"
                cta={{ href: "/my/watchlist?tab=searches", label: "저장 검색으로 알림 받기" }}
              >
                <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                  <span className="text-ai-muted">입찰 중·예정</span>
                  <span className="font-bold text-white">
                    {activeTotal.toLocaleString()}건
                  </span>
                </div>
                <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                  <span className="text-ai-muted">현재 목록 표시</span>
                  <span className="font-bold text-ai-accent">
                    {cards.length.toLocaleString()}건
                  </span>
                </div>
                {/* [1015] 문장 대신 사실 한 줄(브리프 규칙 D) — 권리·명도 원문 확인 원칙은 위 ⓘ와 아래 각주에 있다 */}
                {dist.length > 0 ? (
                  <>
                    현재 목록 최다 용도 <b className="text-ai-accent">{dist[0].label}</b> {dist[0].count}건.
                  </>
                ) : (
                  <>현재 조건에 표시할 물건 없음</>
                )}
              </AIPanel>
            </div>

            {/* 지역(자치구)별 요약 — 버튼이 gu 필터를 세팅한다 */}
            <div className="rise-in-3 card flex flex-col gap-2 p-[18px]">
              <div className="flex items-center justify-between gap-2 t-body font-bold text-ink">
                <span>
                  지역별 요약
                  {/* [1028] 아래 건수는 지금 받은 목록(마감 임박순 최대 200건)에서 센 값이다 — 전체 건수로 읽히지 않게 기준을 적는다 */}
                  {basisNote && <span className="ml-1.5 t-caption font-medium text-text-3 tabular-nums">{basisNote}</span>}
                </span>
                {f.gu && (
                  <button
                    type="button"
                    onClick={() => set({ gu: null })}
                    className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
                  >
                    {/* [1030] 시군구만 푼다 — 시도 칩은 그대로(시도 전체 목록으로 돌아간다) */}
                    {f.gu} 해제 ×
                  </button>
                )}
              </div>
              {/* [1015] 자치구 행 목록 = 리퀴드 판(blue — 이웃 표(sand)와 다른 톤, 브리프 규칙 I).
                  "지역을 선택하면 …볼 수 있어요" 사용법 문장은 걷었다(규칙 B). */}
              {guDist.length > 0 ? (
                <div className="lq-panel flex flex-col" data-tone="blue">
                  {guDist.map((g) => {
                    /* 옛 링크(?gu=동구 — 시도 없음)는 이름이 같은 줄을 모두 고른 것으로 본다 */
                    const on = f.gu === g.gu && (f.sido == null || f.sido === g.sido);
                    return (
                    <button
                      key={`${g.sido ?? ""}|${g.gu}`}
                      type="button"
                      onClick={() => set(on ? { gu: null } : { gu: g.gu, sido: g.sido })}
                      aria-current={on ? "page" : undefined}
                      className={`press flex min-h-10 items-center justify-between border-b py-2 text-xs last:border-b-0 ${
                        on ? "font-bold" : ""
                      }`}
                    >
                      <span className="font-bold text-ink">{g.name}</span>
                      <span className="t-num text-text-2">{g.count}건</span>
                    </button>
                    );
                  })}
                </div>
              ) : (
                <p className="t-caption text-text-3">표시할 지역 분포 없음</p>
              )}
            </div>

            {/* [1063] 용도별 요약은 본문 머리 판으로 올렸다(공용 비율 막대 MiniBar) — 레일 맨 아래에 있어
                폰에서는 목록을 다 지나야 보이던 분포다. 손으로 그린 막대와 값은 같고, 단위도 "건" 하나뿐이다. */}

            {/* 광고 — 서버 조각 */}
            <div className="rise-in-4">{adSlot}</div>
          </aside>
        </div>
      )}
    </>
  );
}

export default AuctionsClient;
