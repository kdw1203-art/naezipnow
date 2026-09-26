"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import type { HubTrade } from "@/lib/complex/hub-trades";
import type { DealTuple } from "@/lib/complex/hub-price";
import { TradeRow } from "./TradeRow";
import type { MonthDeltaView } from "@/lib/complex/month-delta";
import { DealListLazy as DealList } from "./DealListLazy";
import { primeWatching, readWatching } from "./watchlist-status";
import { canOfferPush, pushResultMessage, subscribeToPush } from "@/lib/push/subscribe-client";

/* [968 · 4] 기본 탭(요약)이 아닌 탭의 본문은 서버 HTML 에 없고 탭을 열 때만 필요하다.
   정적 import 는 첫 로드 JS 에 그대로 실리므로 next/dynamic 으로 뗀다. ssr:false 인
   이유: 첫 하이드레이션은 언제나 기본 탭이라 서버가 이 둘을 그릴 일이 없다(hub-client
   가 "use client" 라 ssr:false 도 허용된다 — MapClientLazy 주석 참고). */
const tabFallback = <div className="skeleton h-[180px] w-full rounded-[14px]" aria-hidden />;
const MyRecordsTab = nextDynamic(
  () => import("./MyRecordsTab").then((m) => m.MyRecordsTab),
  { ssr: false, loading: () => tabFallback },
);
const PriceTab = nextDynamic(() => import("./PriceTab").then((m) => m.PriceTab), {
  ssr: false,
  loading: () => tabFallback,
});

/* 시안 23b — 단지 허브 탭 5개(요약·노트·매물·시세·내 기록) 전환 서브컴포넌트 */

/* [967 · 16] HubTrade 는 lib/complex/hub-trades.ts 로 옮겼다(서버 변환·클라이언트
   필터가 같은 타입을 본다). 기존 임포터(page.tsx)를 위해 재수출한다. */
export type { HubTrade } from "@/lib/complex/hub-trades";

export interface HubNote {
  /** posts.id — React key ([967 · 18]: 제목이 같은 글이 있어도 충돌하지 않게) */
  id: string;
  title: string;
  author: string;
  score: string;
}

export interface HubListing {
  /** 매물 id — React key ([967 · 18]: 같은 가격의 매물이 둘일 수 있다) */
  id: string;
  badge: string;
  urgent: boolean;
  price: string;
  priceNote: string | null;
  meta: string;
  agent: string;
}

/* ===== 비교 담기 버튼 — #412 로 app/components/CompareTrayButton.tsx 분리.
   /map 이 버튼 하나 때문에 이 파일 전체(차트·AI 패널·탭)를 정적으로 끌고
   오던 것을 끊었다. 기존 임포터 호환을 위해 재수출만 남긴다. ===== */
export { CompareTrayButton } from "@/app/components/CompareTrayButton";

/* [967 · 17] 같은 단지의 관심 버튼이 한 화면에 둘(히어로·하단 바) 있다.
   한쪽에서 토글하면 다른 쪽도 같은 상태를 말해야 하므로 window 이벤트로 맞춘다
   (compare-tray·recent-complexes 가 쓰는 "nuguzip:*" 이벤트 관례). */
const WATCHLIST_EVENT = "nuguzip:watchlist";
type WatchlistDetail = { complexId: string; watching: boolean };

/* ===== 관심 단지(팔로우) 버튼 =====
   2026-07-27 이전 단지 홈 제목 옆의 "+ 단지 팔로우" 는 onClick 이 없는
   <button> 이었다. 파란 글씨로 눌러 보라고 말해 놓고 아무 일도 안 했다.
   지도 패널(ComplexInfoPanel)은 같은 기능을 /api/me/watchlist 로 이미
   제대로 쓰고 있었다 — 같은 API 를 붙인다.

   [1009 · C] 액션 반응(토스 관례) — 예전엔 켜도 꺼도 버튼 글자만 바뀌었고(히어로는 10px 한 줄 문구, 하단 바는 토스트),
   실수로 뺀 관심 단지를 되돌릴 길이 없었다. 이제
     · 켤 때: 하트가 한 번 튄다(njn-pop-once — 키를 바꿔 다시 재생, 모션 최소화면 꺼짐) + 토스트,
     · 끌 때: 토스트 "관심 단지에서 뺐어요" + **되돌리기**(onClick 이 실제 API 로 다시 담는다 — 확인 모달 대신),
     · 요청 중: 글자 "저장 중…" + aria-busy, 두 번 눌러도 한 번만 나간다(busyRef),
     · 실패: 원인 + 할 일을 토스트로("…담지 못했어요 — 잠시 후 다시 눌러 주세요").
   히어로·하단 바 두 인스턴스는 [967 · 17] window 이벤트로 같은 상태를 말한다(되돌리기도 같은 길). */
export function WatchlistButton({
  complexId,
  complexName,
  tone = "light",
  variant = "default",
}: {
  complexId: string;
  complexName: string;
  /** [962] 네이비 히어로 위에서는 한지 글자 */
  tone?: "light" | "dark";
  /** [967 · 17] "bar" = 모바일 하단 액션 바의 아이콘+라벨 칸. */
  variant?: "default" | "bar";
}) {
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const { showToast } = useToast();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  /* 켤 때마다 1씩 — 하트를 감싼 span 의 key 라 바뀌면 애니메이션이 처음부터 다시 붙는다 */
  const [pop, setPop] = useState(0);
  const busyRef = useRef(false);

  /* [968 · 3] 세션이 비면 요청 없이 false, 있으면 단지별 공유 프라미스(30초) —
     히어로 버튼과 하단 바가 같은 왕복 하나를 나눠 받고, 하단 바가 스크롤마다
     다시 마운트돼도 요청이 또 나가지 않는다(watchlist-status.ts). */
  useEffect(() => {
    let cancelled = false;
    readWatching(complexId).then((w) => {
      if (!cancelled) setWatching(w);
    });
    return () => {
      cancelled = true;
    };
  }, [complexId]);

  /* [967 · 17] 다른 인스턴스(히어로 ↔ 하단 바)의 토글을 받아 같은 상태로 */
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<WatchlistDetail>).detail;
      if (d && d.complexId === complexId) setWatching(d.watching);
    };
    window.addEventListener(WATCHLIST_EVENT, onChange);
    return () => window.removeEventListener(WATCHLIST_EVENT, onChange);
  }, [complexId]);

  /** 서버를 target 상태로 맞춘다 — 버튼과 토스트의 "되돌리기"가 같은 길을 탄다 */
  async function apply(target: boolean, opts: { undo?: boolean } = {}) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = target
        ? await fetch("/api/me/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complexId, complexName }),
          })
        : await fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`, {
            method: "DELETE",
          });
      if (res.status === 401) {
        promptSignup({
          action: "watchlist_add",
          title: "관심 단지로 저장할까요?",
          benefit: "가입하면 이 단지의 실거래·임장 기록을 모아볼 수 있어요.",
          callbackUrl: `/complex/${complexId}`,
        });
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (handleUpgradeResponse(res.status, j)) {
        showToast(j.error ?? "관심 단지 한도에 도달했어요 — 다른 단지를 빼면 담을 수 있어요");
        return;
      }
      if (!res.ok) {
        showToast(
          j.error ??
            (target
              ? "관심 단지에 담지 못했어요 — 잠시 후 다시 눌러 주세요"
              : "관심 단지에서 빼지 못했어요 — 잠시 후 다시 눌러 주세요"),
        );
        return;
      }
      setWatching(target);
      primeWatching(complexId, target);
      window.dispatchEvent(
        new CustomEvent<WatchlistDetail>(WATCHLIST_EVENT, { detail: { complexId, watching: target } }),
      );
      if (!target) {
        showToast("관심 단지에서 뺐어요", {
          label: "되돌리기",
          onClick: () => {
            void apply(true, { undo: true });
          },
        });
        return;
      }
      setPop((n) => n + 1);
      if (opts.undo) {
        showToast("다시 관심 단지에 담았어요");
      } else if (canOfferPush()) {
        /* [968 · 46] 관심 등록의 뜻이 "시세 변동 알림"인데 그 자리에서 푸시를 권하지 않았다. 아직 묻지 않은
           (default) 브라우저에만 토스트 액션으로 권한다 — 권한 프롬프트는 액션 탭(사용자 제스처)에서만 열린다. */
        showToast("관심 단지에 담았어요 · 실거래가 변동을 푸시로도 받을 수 있어요", {
          label: "푸시로 받기",
          onClick: () => {
            void subscribeToPush().then((r) => {
              const m = pushResultMessage(r);
              if (m) showToast(m);
            });
          },
        });
      } else {
        showToast("관심 단지에 담았어요 · 실거래가 변동을 알려 드려요");
      }
    } catch {
      showToast("네트워크 오류로 저장하지 못했어요 — 연결을 확인하고 다시 눌러 주세요");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const heart = (size: number) => (
    <span key={pop} className={`inline-flex ${pop > 0 ? "njn-pop-once" : ""}`} aria-hidden="true">
      <Icon name="heart" size={size} className={watching ? "fill-current" : ""} />
    </span>
  );
  const label = busy ? "저장 중…" : watching ? "관심 단지" : "관심 등록";

  if (variant === "bar") {
    return (
      <button
        type="button"
        onClick={() => void apply(!watching)}
        disabled={busy}
        aria-pressed={watching === true}
        aria-busy={busy}
        aria-label={watching ? "관심 단지에서 빼기" : "관심 단지로 저장"}
        className={`press flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 t-caption font-bold disabled:opacity-60 ${
          watching ? "text-brand-red" : "text-text-1"
        }`}
      >
        {heart(18)}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void apply(!watching)}
      disabled={busy}
      aria-pressed={watching === true}
      aria-busy={busy}
      aria-label={watching ? "관심 단지에서 빼기" : "관심 단지로 저장"}
      className={`press inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold disabled:opacity-60 ${
        tone === "dark"
          ? watching
            ? "brand-photo-chip"
            : "bg-brand-hanji text-brand-hanji-ink"
          : watching
            ? "border border-line bg-surface text-ink"
            : "border border-primary/30 bg-primary-soft text-primary"
      }`}
    >
      {heart(14)}
      {label}
    </button>
  );
}

/* [970 · B-17] "노트" 탭의 내용은 동네이야기(board_posts) 글이라 라벨을 "이야기"로 —
   임장노트는 아래 ComplexNotesNewsAi 섹션이 따로 그린다. ?tab= id(notes)는 그대로
   둔다(공유·북마크 호환). */
/* [1009 · C] "시세" → "실거래" — 이 탭의 숫자는 전부 국토부 실거래 신고분이다(단지 단위 시세 원천 없음, 표기 표준).
   주소 id(price)는 그대로라 공유·북마크(?tab=price)는 계속 이 탭을 연다. */
const TABS = ["요약", "이야기", "매물", "실거래", "내 기록"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "요약";

/* [967 · 14] ?tab= 값 — 주소에 실리는 건 한글 라벨이 아니라 이 id 다(공유·북마크에
   퍼센트 인코딩된 한글이 실리지 않게). 모르는 값·없음 → 기본 탭. */
const TAB_IDS: Record<Tab, string> = {
  요약: "summary",
  이야기: "notes",
  매물: "listings",
  실거래: "price",
  "내 기록": "mine",
};

function tabFromId(id: string | null): Tab {
  if (!id) return DEFAULT_TAB;
  return TABS.find((t) => TAB_IDS[t] === id) ?? DEFAULT_TAB;
}

/** 현재 주소의 ?tab= 을 읽는다 — 마운트 뒤에만 부른다(프리렌더 HTML 은 기본 탭) */
function readTabFromLocation(): Tab {
  try {
    return tabFromId(new URLSearchParams(window.location.search).get("tab"));
  } catch {
    return DEFAULT_TAB;
  }
}

/** ?tab= 만 바꾼 주소(다른 파라미터·해시는 보존). 기본 탭이면 파라미터를 지운다. */
function hrefWithTab(tab: Tab): string {
  const usp = new URLSearchParams(window.location.search);
  if (tab === DEFAULT_TAB) usp.delete("tab");
  else usp.set("tab", TAB_IDS[tab]);
  const s = usp.toString();
  return `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

/* TradeRow·deltaClass 는 [968 · 4] 에서 ./TradeRow.tsx 로 옮겼다(시세 탭과 공유). */

export function ComplexHubTabs({
  aiTitle,
  aiBody,
  listingsLabel,
  trades,
  notes,
  notesFailed = false,
  notesWriteHref,
  listings,
  priceChart,
  latestAvgManwon,
  complexId,
  complexName,
  noteHref,
  altComplexId,
  priceRegion,
  loanRegion,
  deals = [],
  dealsFailed = false,
  tradeDeltas,
}: {
  aiTitle: string;
  aiBody: string;
  listingsLabel: string;
  trades: HubTrade[];
  notes: HubNote[];
  /** 조회 자체가 실패했는지 — "아직 없어요"와 "지금 못 불러왔어요"는 다른 말이다. */
  notesFailed?: boolean;
  /** 이 단지에 연결된 글을 쓰러 가는 주소 (/town/write?complex=…) */
  notesWriteHref?: string;
  listings: HubListing[];
  /** [968 · 4] 서버(page.tsx)가 그린 PriceTrendChart — 요약·시세 탭이 같은 엘리먼트를 쓴다.
   *  시계열이 2개월 미만이면 null. 클라이언트로 점 배열·차트 코드를 보내지 않는다. */
  priceChart: ReactNode;
  /** 가장 최근 달 평균 매매가(만원) — 계산기 프리필용. 없으면 0. */
  latestAvgManwon: number;
  /** 순수 단지 id — 내 기록 API 조회 키·지도 딥링크(/map?complexId=) */
  complexId?: string;
  /** 계산기 프리필의 출처 표기용 단지명 (D69) */
  complexName?: string;
  /** [967 · 15] 임장노트 프리필 주소 — 페이지의 다른 CTA 와 같은 값 */
  noteHref?: string;
  /** [967 · 15] 같은 단지의 다른 표기 id(대장 매칭 시 kapt.…) — 내 기록 조회에 함께 쓴다 */
  altComplexId?: string;
  /** [970 · B-39] 시세 탭 "AI 시세 분석 보기"에 실을 지역("서울 중랑구") — 없으면 지역 없이 */
  priceRegion?: string;
  /** [1008] 계산기 지역(regulated·capital·other) — 서버가 lib/finance/loan-rules 로 정한 값. 없으면 사용자가 고른다 */
  loanRegion?: string;
  /** [1009 · C] 최근 실거래 한 건 단위(최신순, 최대 60) — [계약월, 일, 만원, 전용㎡, 층] */
  deals?: readonly DealTuple[];
  /** [1009 · C] 실거래 조회 실패 — "없음"과 다른 문장으로 */
  dealsFailed?: boolean;
  /** [1009 · C 리뷰] 월별 줄(전체)의 등락 기준 — 서버가 month-delta 로 센 값(요약 탭 미리보기 줄). 라우트 번들에 계산 코드를 싣지 않는다 */
  tradeDeltas?: Record<string, MonthDeltaView>;
}) {
  /* SSR·첫 하이드레이션은 언제나 기본 탭 — 프리렌더 HTML 과 정확히 일치해야 한다.
     주소의 ?tab= 은 마운트 뒤에 읽는다([967 · 14]). useSearchParams 를 쓰지 않는 이유:
     프리렌더 페이지에서는 가장 가까운 Suspense 경계까지 서버 HTML 을 비운다
     (/town/news 실측 — ListingsListClient·QnaListClient 주석 참고). */
  const [tab, setTabState] = useState<Tab>(DEFAULT_TAB);

  useEffect(() => {
    setTabState(readTabFromLocation());
    /* 뒤로/앞으로 — ?tab= 이 다른 항목으로 돌아오면 그 탭을 편다 */
    const onPop = () => setTabState(readTabFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* 탭 전환은 replaceState — router.replace 는 같은 경로라도 RSC 페이로드를 다시
     받고(ISR 페이지라도 왕복 하나) loading.tsx 가 끼어들 수 있다. 검색 페이지
     (search-client.tsx)와 같은 방식. Next 14.1+ 는 history API 호출을 라우터와
     동기화하므로 usePathname/useSearchParams 를 쓰는 다른 컴포넌트도 새 값을 본다. */
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      window.history.replaceState(null, "", hrefWithTab(next));
    } catch {
      /* history 접근이 막힌 환경(iframe 등) — 탭은 바뀌고 주소만 못 바꾼다 */
    }
  };

  /* latestAvgManwon 은 서버(page.tsx)가 계산해 넘긴다 — 시세 탭 필터·정렬 상태는
     [968 · 4] PriceTab.tsx 로 옮겼다(탭이 열릴 때만 내려받는 청크). */

  /* [967 · 15] 요약 탭의 "내 기록" 카드 — 예전엔 서버가 넘긴 고정 문구("로그인하면…")
     였다. 방문자 공용 HTML 에 개인 상태를 단정하는 문장은 못 싣는다. 탭으로 보내는
     안내만 남긴다(실데이터는 그 탭이 마운트되며 읽는다). */
  const myRecordCard = (
    <button
      type="button"
      onClick={() => setTab("내 기록")}
      /* [1009 · C 리뷰] 문장과 "열기 ›"가 390px 에서 붙어 보였다("봐요열기 ›") — 간격. 누를 수 있는 카드라 눌림(press) */
      className="card tile press flex w-full items-center justify-between gap-3 rounded-[14px] px-[15px] py-3.5 text-left"
    >
      <span className="min-w-0 t-body text-text-1">
        <b className="text-ink">내 기록</b> — 이 단지에 남긴 임장노트를 회차별로 모아 봐요
      </span>
      <span className="shrink-0 text-xs font-extrabold text-primary">열기 ›</span>
    </button>
  );

  return (
    /* [968 · 2] fold — 767px 이하에서 이 안의 rise-in-* 리빌을 끈다(globals.css 의
       `.fold [class^="rise-in"]`). 탭 줄·기본 탭 본문은 첫 화면 안에 있어 지연 리빌이
       LCP 후보의 표시를 늦추기만 한다. 다른 탭 본문도 같은 자리에 뜨므로 함께 끈다. */
    <div className="fold flex flex-col gap-3">
      {/* 탭 칩 5개 — [967 · 14] tablist/tab 의미론 + 선택 상태.
          [968 · 34] `chip` — 보이는 높이(≈37px)는 그대로 두고 터치 기기에서만 히트 영역을
          44px 로 넓힌다(globals.css `button.chip::after`, pointer: coarse). `.chip` 이
          font-weight 600 을 강제하므로 선택 탭의 700 은 `font-bold!` 로 지킨다. */}
      <div className="rise-in-2 flex flex-wrap gap-1.5 t-body" role="tablist" aria-label="단지 정보 탭">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`chip px-3.5 py-2 transition-colors ${
              /* [970 · B-06] 네이비 탭 글자 text-surface → text-on-dark(다크에서 안 보였다) */
              tab === t
                ? "bg-brand-navy font-bold! text-on-dark"
                : "border border-line bg-surface text-text-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ===== 요약 ===== */}
      {tab === "요약" && (
        <div className="rise-in-3 flex flex-col gap-3" role="tabpanel">
          {/* [1009 · C] 예전엔 "AI" 표식이 붙은 패널(AIPanel)이었는데 AI 가 쓴 글이 아니라 공공데이터를 규칙으로 이은
              문장이다 — AI 분석 결과 요약과 같은 이름("공공데이터 자동 계산")으로 적는다. */}
          <div className="card flex flex-col gap-1.5 rounded-[14px] px-[15px] py-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-body font-extrabold text-ink">{aiTitle}</span>
              <span className="shrink-0 t-caption text-text-3">공공데이터 자동 계산</span>
            </div>
            <p className="break-words t-body leading-[1.6] text-text-1">{aiBody}</p>
          </div>
          {priceChart}
          {myRecordCard}
          {deals.length > 0 ? (
            /* [1009 · C] 월별 평균 줄(8.4억 · N건 · 최저~최고) → 한 건 단위(계약일 · 전용 · 층 · 거래가, 네이버 관례).
               "전체 보기"는 실거래 탭(면적대 필터·월별 평균 표)으로 — 예전엔 누를 수 없는 글자("시세 탭에서 전체")였다. */
            <div className="card flex flex-col gap-2 rounded-[14px] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="t-sub font-bold text-text-2">
                  최근 실거래 <span className="tabular-nums">{Math.min(deals.length, 8)}건</span>
                </span>
                {/* [1009 · C 리뷰] 문장 속 링크가 아니라 혼자 서 있는 조작 — 40px(주요 조작). 줄 높이는 -my 로 그대로 */}
                <button
                  type="button"
                  onClick={() => setTab("실거래")}
                  className="press -my-2 inline-flex min-h-10 items-center px-1 t-sub font-bold text-primary"
                >
                  전체 보기 ›
                </button>
              </div>
              <DealList deals={deals.slice(0, 8)} />
              <p className="px-0.5 t-caption text-text-3">국토교통부 실거래가 · 해제 신고 제외 · 한 건 금액 그대로</p>
            </div>
          ) : trades.length > 0 ? (
            <div className="card flex flex-col rounded-[14px] px-3.5 py-2">
              <div className="flex items-baseline justify-between px-0.5 py-1.5">
                {/* [1009 · C 리뷰] 줄 수("N개월")는 거래 있는 달 수라 기간처럼 읽혔다 — 무엇의 평균인지(면적 혼합)와 등락 기준만 적는다.
                    기준은 앞 줄 — 모든 앞 줄이 전달이면 "전월 대비", 아니면 "앞 거래 달 대비"(빈 달 다음 줄엔 기준 달이 붙는다) */}
                <span className="min-w-0 t-sub font-bold text-text-2">
                  월평균 · 면적 혼합 ·{" "}
                  {trades
                    .slice(0, 18)
                    .every((t) => !tradeDeltas?.[t.ym]?.basis || tradeDeltas?.[t.ym]?.adjacent)
                    ? "전월 대비"
                    : "앞 거래 달 대비"}
                </span>
                <button
                  type="button"
                  onClick={() => setTab("실거래")}
                  className="press -my-2 inline-flex min-h-10 items-center px-1 t-caption font-bold text-primary"
                >
                  실거래 탭에서 전체 ›
                </button>
              </div>
              <div className="overflow-hidden rounded-xl bg-bg">
                {/* [967 · 18] key = yyyymm — 월별 집계라 목록 안에서 유일하다 */}
                {trades.slice(0, 18).map((t, i) => (
                  <TradeRow key={t.ym} t={t} dv={tradeDeltas?.[t.ym]} divider={i > 0 ? "top" : "none"} />
                ))}
              </div>
            </div>
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              {dealsFailed
                ? "실거래를 지금 불러오지 못했어요 — 거래가 없다는 뜻이 아니에요"
                : "아직 수집된 국토교통부 실거래가 없어요"}
            </div>
          )}
          {notes.length > 0 && (
            <div className="card flex flex-col gap-1.5 rounded-[14px] px-3.5 py-2.5">
              <div className="px-0.5 t-sub font-bold text-text-2">
                단지 이야기 미리보기 · {notes.length}건
              </div>
              {notes.slice(0, 4).map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl bg-bg px-3 py-2"
                >
                  <div className="truncate t-sub font-bold text-ink">{n.title}</div>
                  <div className="mt-0.5 flex justify-between gap-2 t-caption text-text-3">
                    <span className="truncate">{n.author}</span>
                    <span className="shrink-0 font-bold text-primary">{n.score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 이야기 (동네이야기 글) ===== */}
      {tab === "이야기" && (
        <div className="rise-in-3 flex flex-col gap-2.5" role="tabpanel">
          {notes.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              {notesFailed ? (
                <>
                  <b className="text-ink">지금은 불러올 수 없어요</b>
                  <div className="mt-1">
                    노트가 없는 게 아니라 목록을 읽어 오지 못했어요. 잠시 후 다시 열어
                    주세요.
                  </div>
                </>
              ) : (
                /* [970 · B-17] 이 목록은 동네이야기 글 — "임장노트가 없다"고 적으면 아래
                   임장노트 섹션과 어긋난다 */
                "아직 이 단지 이야기가 없어요"
              )}
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              /* [1009 · C] 누를 수 없는 카드라 .tile(호버 들림·눌림)을 뺐다 — 눌리는 척하면 죽은 컨트롤처럼 읽힌다 */
              className="card flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3"
            >
              <div className="t-body font-bold text-ink">{n.title}</div>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span className="t-sub text-text-3">{n.author}</span>
                <span className="t-sub font-extrabold text-primary">{n.score}</span>
              </div>
            </div>
          ))}
          {notesWriteHref && !notesFailed && (
            <Link
              href={notesWriteHref}
              className="btn-primary rounded-xl p-3 text-center t-body"
            >
              이 단지 이야기 쓰기
            </Link>
          )}
          {/* [970 · B-17] 탭 내용(동네이야기)과 같은 곳으로 — 예전엔 /notes(임장노트)로 보냈다 */}
          <Link href="/town" className="btn-soft rounded-xl p-3 text-center t-body">
            동네이야기 모두 보기
          </Link>
        </div>
      )}

      {/* ===== 매물 ===== */}
      {tab === "매물" && (
        <div className="rise-in-3 flex flex-col gap-2.5" role="tabpanel">
          <div className="px-1 text-xs font-extrabold text-text-3">{listingsLabel}</div>
          {listings.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              등록된 실매물이 아직 없어요 · 지도에서 주변 매물을 확인해 보세요
            </div>
          )}
          {listings.map((l) => (
            <div
              key={l.id}
              className={`card flex flex-col gap-1.5 rounded-2xl px-[15px] py-3.5 ${
                l.urgent ? "border-[1.5px] border-primary" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-md chip-pad text-[12px] font-extrabold ${
                    l.urgent ? "bg-danger-soft text-danger" : "bg-bg font-bold text-text-2"
                  }`}
                >
                  {l.badge}
                </span>
                <span className="text-[13px] font-extrabold text-ink">{l.price}</span>
                {l.priceNote && (
                  <span className="text-xs font-bold text-primary">{l.priceNote}</span>
                )}
              </div>
              <div className="text-xs text-text-2">{l.meta}</div>
              <div className="t-sub text-text-3">{l.agent}</div>
            </div>
          ))}
          {/* 예전엔 맨 /map — 단지 맥락이 통째로 사라져 전국 지도가 떴다 */}
          <Link
            href={complexId ? `/map?complexId=${encodeURIComponent(complexId)}` : "/map"}
            className="btn-soft rounded-xl p-3 text-center t-body"
          >
            지도에서 매물 전체 보기
          </Link>
        </div>
      )}

      {/* ===== 시세 ===== [968 · 4] 본문은 PriceTab.tsx(동적 청크) — 필터·정렬·전체 표 */}
      {tab === "실거래" && (
        <div className="rise-in-3 flex flex-col gap-2.5" role="tabpanel">
          <PriceTab
            trades={trades}
            deals={deals}
            latestAvgManwon={latestAvgManwon}
            complexName={complexName}
            priceChart={priceChart}
            region={priceRegion}
            loanRegion={loanRegion}
          />
        </div>
      )}

      {/* ===== 내 기록 ===== [967 · 15] 실데이터 — 탭이 열릴 때 클라이언트가 읽는다 */}
      {tab === "내 기록" && (
        <div className="rise-in-3 flex flex-col gap-2.5" role="tabpanel">
          {complexId ? (
            <MyRecordsTab
              complexId={complexId}
              altComplexId={altComplexId}
              complexName={complexName ?? "이 단지"}
              noteHref={noteHref ?? "/notes/new"}
            />
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              이 단지의 기록은 단지 id 가 있어야 찾을 수 있어요
            </div>
          )}
        </div>
      )}
    </div>
  );
}
