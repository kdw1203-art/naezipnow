"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import type { HubTrade } from "@/lib/complex/hub-trades";
import type { DealTuple } from "@/lib/complex/hub-price";
/* [v4] 요약 탭 본문(한눈에 요약 카드·최근 실거래 8건·월별 줄·내 기록 카드·이야기 미리보기)을 걷고 서버가 그린
   요약 목록(summary)을 받는다 — TradeRow·DealListLazy·MonthDeltaView 는 이제 실거래 탭 청크(PriceTab)만 쓴다.
   첫 로드 JS 에서 두 모듈과 요약 마크업이 빠진다(/complex/[id] 478/480KB). */
import { primeWatching, readWatching } from "./watchlist-status";
import { canOfferPush, pushResultMessage, subscribeToPush } from "@/lib/push/subscribe-client";

/* [968 · 4] 기본 탭(요약)이 아닌 탭의 본문은 서버 HTML 에 없고 탭을 열 때만 필요하다.
   정적 import 는 첫 로드 JS 에 그대로 실리므로 next/dynamic 으로 뗀다. ssr:false 인
   이유: 첫 하이드레이션은 언제나 기본 탭이라 서버가 이 둘을 그릴 일이 없다(hub-client
   가 "use client" 라 ssr:false 도 허용된다 — MapClientLazy 주석 참고). */
const tabFallback = <div className="skeleton h-[180px] w-full rounded-lg" aria-hidden />;
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
  variant = "default",
}: {
  complexId: string;
  complexName: string;
  /** [967 · 17] "bar" = 모바일 하단 액션 바의 아이콘+라벨 칸.
      [v4] "default" = 단지명 오른쪽 40px 하트 아이콘 버튼(네이비 히어로가 없어져 tone 을 걷었다). */
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

  /* [v4 · 규칙 7] 아이콘은 조작 버튼에만 — 관심은 40px 아이콘 버튼(.icon-btn). 글자 라벨은 title·aria 로.
     담겨 있으면 하트를 주홍으로 채운다(선택 = 주홍, 나우블루는 CTA 전용). */
  return (
    <button
      type="button"
      onClick={() => void apply(!watching)}
      disabled={busy}
      aria-pressed={watching === true}
      aria-busy={busy}
      aria-label={watching ? "관심 단지에서 빼기" : "관심 단지로 저장"}
      title={label}
      className={`icon-btn press shrink-0 ${watching ? "text-brand-red" : "text-text-1"}`}
    >
      {heart(18)}
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


/* [v4 · 한 화면 한 가지] 탭 본문 규칙
   · 요약 = 서버가 그린 목록(summary) 하나 — 라벨 왼쪽 · 값 오른쪽 · 1px 구분선 행. 이 파일에는 마크업이 없다.
   · 이야기·매물·실거래 = 서버 조각(storyExtras·priceExtras)을 **늘 그려 두고 hidden 으로만 숨긴다** — 면적대 표·후기·
     임장노트·기사가 ISR HTML 에 그대로 남는다(검색 색인). 클라이언트 전용 본문(PriceTab·MyRecordsTab)만 열 때 받는다.
   · 서버 목록의 행이 다른 탭으로 보낼 때는 `<a href="?tab=price" data-hub-tab="price">` — 여기서 가로채 탭만 바꾼다
     (JS 가 없거나 새 탭으로 열면 주소의 ?tab= 이 같은 탭을 연다). */
const TAB_BTN = "press min-h-11 flex-1 border-b-2 px-1 t-body transition-colors";

export function ComplexHubTabs({
  summary,
  storyExtras,
  priceExtras,
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
}: {
  /** [v4] 요약 탭 본문 — 서버가 그린 행 목록(page.tsx) */
  summary: ReactNode;
  /** [v4] 이야기 탭 아래 서버 조각 — 거주민 후기 · 이 단지 임장노트 · 관련 기사 */
  storyExtras?: ReactNode;
  /** [v4] 실거래 탭 아래 서버 조각 — 면적대별 실거래가 · 이 동네 대비 · 전월세 · 국토부 이력 링크 */
  priceExtras?: ReactNode;
  /** 매물이 없을 때의 한 줄 — "아직 없어요"와 "못 불러왔어요"를 서버가 골라 준다 */
  listingsLabel: string;
  trades: HubTrade[];
  notes: HubNote[];
  /** 조회 자체가 실패했는지 — "아직 없어요"와 "지금 못 불러왔어요"는 다른 말이다. */
  notesFailed?: boolean;
  /** 이 단지에 연결된 글을 쓰러 가는 주소 (/town/write?complex=…) */
  notesWriteHref?: string;
  listings: HubListing[];
  /** [968 · 4] 서버(page.tsx)가 그린 PriceTrendChart — 실거래 탭이 쓴다. 시계열이 2개월 미만이면 null. */
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
  /** [970 · B-39] 실거래 탭 "AI 시세 분석 보기"에 실을 지역("서울 중랑구") — 없으면 지역 없이 */
  priceRegion?: string;
  /** [1008] 계산기 지역(regulated·capital·other) — 서버가 lib/finance/loan-rules 로 정한 값. 없으면 사용자가 고른다 */
  loanRegion?: string;
  /** [1009 · C] 최근 실거래 한 건 단위(최신순, 최대 60) — [계약월, 일, 만원, 전용㎡, 층] */
  deals?: readonly DealTuple[];
}) {
  /* SSR·첫 하이드레이션은 언제나 기본 탭 — 프리렌더 HTML 과 정확히 일치해야 한다.
     주소의 ?tab= 은 마운트 뒤에 읽는다([967 · 14]). useSearchParams 를 쓰지 않는 이유:
     프리렌더 페이지에서는 가장 가까운 Suspense 경계까지 서버 HTML 을 비운다
     (/town/news 실측 — ListingsListClient·QnaListClient 주석 참고). */
  const [tab, setTabState] = useState<Tab>(DEFAULT_TAB);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTabState(readTabFromLocation());
    /* 뒤로/앞으로 — ?tab= 이 다른 항목으로 돌아오면 그 탭을 편다 */
    const onPop = () => setTabState(readTabFromLocation());
    /* [v4] 호가 점검은 요약 목록의 한 행(#asking-check)이다 — 하단 바의 "호가 점검"이 다른 탭에서 눌려도 보이게 요약으로 */
    const onHash = () => {
      if (window.location.hash !== "#asking-check") return;
      setTabState("요약");
      /* 닫힌 탭 안의 행으로는 브라우저가 스크롤하지 못한다 — 탭이 그려진 다음 프레임에 한 번 더 */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById("asking-check")?.scrollIntoView({ block: "start" })),
      );
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
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

  /* [v4] 서버 목록 행의 탭 이동(data-hub-tab) — 새 탭·수정키 클릭은 브라우저에 맡긴다 */
  const onPanelClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[data-hub-tab]");
    if (!a) return;
    e.preventDefault();
    setTab(tabFromId(a.getAttribute("data-hub-tab")));
    rootRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    /* [968 · 2] fold — 767px 이하에서 이 안의 rise-in-* 리빌을 끈다. scroll-mt — 행에서 탭을 바꿀 때 탭 줄이 헤더 아래에 선다 */
    <div ref={rootRef} className="fold flex scroll-mt-12 flex-col gap-4 md:scroll-mt-14" onClick={onPanelClick}>
      {/* 탭 5개 — [967 · 14] tablist/tab 의미론 + 선택 상태.
          [v4] 네이비 채움 칩 → 밑줄 탭(네이비 면은 AI 결과 패널에만) · 헤더(모바일 48+1px · md 56+1px · 설치 앱은
          + safe-area 윗여백 — Header.tsx 와 같은 env) 아래에 붙는다.
          배경을 깔고 좌우를 본문 여백만큼 넓혀 스크롤되는 글자가 비치지 않게 한다. */}
      <div
        className="sticky top-[calc(49px+env(safe-area-inset-top,0px))] z-20 -mx-3.5 flex border-b border-line bg-bg px-3.5 md:top-[calc(57px+env(safe-area-inset-top,0px))] md:-mx-5 md:px-5"
        role="tablist"
        aria-label="단지 정보 탭"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`${TAB_BTN} ${tab === t ? "border-ink font-bold text-ink" : "border-transparent text-text-3"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ===== 요약 ===== [v4] 서버 목록 */}
      <div role="tabpanel" aria-label="요약" hidden={tab !== "요약"}>
        {summary}
      </div>

      {/* ===== 이야기 (동네이야기 글 · 거주민 후기 · 임장노트 · 기사) ===== */}
      <div role="tabpanel" aria-label="이야기" hidden={tab !== "이야기"} className="flex flex-col gap-8">
        <section aria-labelledby="hub-story-title">
          <h2 id="hub-story-title" className="t-section text-ink">
            {complexName ?? "이 단지"} 이야기
            {notes.length > 0 && <span className="ml-1 t-sub font-medium text-text-3">{notes.length}건</span>}
          </h2>
          {notes.length === 0 ? (
            /* [v4 · 규칙 8] 빈 상태 한 줄 — 실패는 실패라고 */
            <p className="mt-2 t-sub text-text-3">
              {notesFailed
                ? "이야기 목록을 지금 불러오지 못했어요 — 글이 없다는 뜻이 아니에요"
                : `${complexName ?? "이 단지"} 이야기가 아직 없어요`}
            </p>
          ) : (
            <ul data-tone="hanji" className="mt-1 divide-y divide-line">
              {notes.map((n) => (
                /* [1009 · C] 누를 수 없는 행 — 눌림 효과 없음 */
                <li key={n.id} className="py-3">
                  <div className="t-body font-bold text-ink">{n.title}</div>
                  <div className="mt-0.5 flex justify-between gap-2 t-sub text-text-3">
                    <span className="truncate">{n.author}</span>
                    <span className="shrink-0 tabular-nums">{n.score}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {notesWriteHref && !notesFailed && (
              /* [v4 · 규칙 2] 채움 파랑은 머리의 "이 단지 임장노트 쓰기" 하나 — 여기는 아웃라인 */
              <Link href={notesWriteHref} className="btn-outline inline-flex min-h-10 items-center px-3.5 t-sub">
                {complexName ?? "이 단지"} 이야기 쓰기
              </Link>
            )}
            {/* [970 · B-17] 탭 내용(동네이야기)과 같은 곳으로 */}
            <Link href="/town" className="btn-ghost inline-flex min-h-10 items-center px-3.5 t-sub">
              동네이야기 모두 보기
            </Link>
          </div>
        </section>
        {storyExtras}
      </div>

      {/* ===== 매물 ===== */}
      <div role="tabpanel" aria-label="매물" hidden={tab !== "매물"}>
        <h2 className="t-section text-ink">
          등록 매물
          {listings.length > 0 && <span className="ml-1 t-sub font-medium text-text-3">{listings.length}건</span>}
        </h2>
        {listings.length === 0 ? (
          /* listingsLabel = 빈 상태 한 줄(page.tsx — 없음과 조회 실패를 다른 문장으로) */
          <p className="mt-2 t-sub text-text-3">{listingsLabel}</p>
        ) : (
          <ul data-tone="mint" className="mt-1 divide-y divide-line">
            {listings.map((l) => (
              /* [1012 · 규칙 9] 끌어올림은 정렬 순서로만 드러난다(배지·파란 테두리 없음) */
              <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="t-body font-bold text-ink">{l.meta}</div>
                  <div className="mt-0.5 truncate t-sub text-text-3">
                    {l.agent}
                    {l.priceNote ? ` · ${l.priceNote}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right t-body t-num text-ink">{l.price}</div>
              </li>
            ))}
          </ul>
        )}
        {/* 예전엔 맨 /map — 단지 맥락이 통째로 사라져 전국 지도가 떴다 */}
        <Link
          href={complexId ? `/map?complexId=${encodeURIComponent(complexId)}` : "/map"}
          className="btn-ghost mt-3 inline-flex min-h-10 items-center px-3.5 t-sub"
        >
          {complexName ?? "이 단지"} 주변 매물 지도에서 보기
        </Link>
      </div>

      {/* ===== 실거래 ===== [968 · 4] 본문은 PriceTab.tsx(동적 청크) — 필터·정렬·전체 표. 아래 서버 조각은 늘 HTML 에 */}
      <div role="tabpanel" aria-label="실거래" hidden={tab !== "실거래"} className="flex flex-col gap-8">
        {tab === "실거래" && (
          <div className="flex flex-col gap-2.5">
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
        {priceExtras}
      </div>

      {/* ===== 내 기록 ===== [967 · 15] 실데이터 — 탭이 열릴 때 클라이언트가 읽는다 */}
      {tab === "내 기록" && (
        <div role="tabpanel" aria-label="내 기록" className="flex flex-col gap-2.5">
          {complexId ? (
            <MyRecordsTab
              complexId={complexId}
              altComplexId={altComplexId}
              complexName={complexName ?? "이 단지"}
              noteHref={noteHref ?? "/notes/new"}
            />
          ) : (
            <p className="t-sub text-text-3">이 단지의 기록은 단지 id 가 있어야 찾을 수 있어요</p>
          )}
        </div>
      )}
    </div>
  );
}
