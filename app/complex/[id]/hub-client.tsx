"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { AIPanel } from "../../components/AIPanel";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import type { HubTrade } from "@/lib/complex/hub-trades";
import { TradeRow } from "./TradeRow";
import { primeWatching, readWatching } from "./watchlist-status";
import { canOfferPush, pushResultMessage, subscribeToPush } from "@/lib/push/subscribe-client";

/* [968 · 4] 기본 탭(요약)이 아닌 탭의 본문은 서버 HTML 에 없고 탭을 열 때만 필요하다.
   정적 import 는 첫 로드 JS 에 그대로 실리므로 next/dynamic 으로 뗀다. ssr:false 인
   이유: 첫 하이드레이션은 언제나 기본 탭이라 서버가 이 둘을 그릴 일이 없다(hub-client
   가 "use client" 라 ssr:false 도 허용된다 — MapClientLazy 주석 참고). */
const tabFallback = <div className="sk h-[180px] w-full rounded-[14px]" aria-hidden />;
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
   그쪽 토글은 Toast·SoftSignup 프로바이더에 묶여 있어 그대로 못 옮기므로,
   여기서는 버튼 안에서 상태를 그대로 말하는 자립형으로 만든다. */
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
  /** [967 · 17] "bar" = 모바일 하단 액션 바의 아이콘+라벨 칸. 결과는 토스트로 말한다
   *  (칸이 좁아 인라인 문구가 들어갈 자리가 없다). */
  variant?: "default" | "bar";
}) {
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const { showToast } = useToast();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  /* 모바일24 — 실패만 빨간 글씨로 말하고 성공은 침묵했다. 저장이 무엇을 의미하는지
     (시세 변동 알림 — price-alerts 크론이 ±1% 변동 시 실제로 보낸다) 성공 시에도
     한 줄로 말한다. tone 으로 색만 가른다. */
  const [message, setMessage] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

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

  function say(text: string, kind: "error" | "ok") {
    if (variant === "bar") showToast(text);
    else setMessage({ text, tone: kind });
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = watching
        ? await fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`, {
            method: "DELETE",
          })
        : await fetch("/api/me/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complexId, complexName }),
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
        say(j.error ?? "관심 단지 한도에 도달했어요", "error");
        return;
      }
      if (!res.ok) {
        say(j.error ?? "저장하지 못했어요", "error");
        return;
      }
      const next = !watching;
      if (next) {
        /* [968 · 46] 관심 등록의 뜻이 "시세 변동 알림"인데 그 자리에서 푸시를 권하지
           않았다(옵트인은 전체 메뉴 안에만). 아직 묻지 않은(default) 브라우저에만 토스트
           액션으로 권한다 — 권한 프롬프트는 액션 탭 핸들러 안(사용자 제스처)에서만 열리고,
           자동으로 묻는 일은 없다. 이미 허용·차단했거나 미지원이면 예전 문구 그대로. */
        if (canOfferPush()) {
          if (variant !== "bar") setMessage({ text: "저장했어요 · 시세 변동 시 알림을 받아요", tone: "ok" });
          showToast("저장했어요 · 시세 변동을 푸시로도 받을 수 있어요", {
            label: "푸시로 받기",
            onClick: () => {
              void subscribeToPush().then((r) => {
                const m = pushResultMessage(r);
                if (m) showToast(m);
              });
            },
          });
        } else {
          say("저장했어요 · 시세 변동 시 알림을 받아요", "ok");
        }
      } else if (variant === "bar") showToast("관심 단지에서 뺐어요");
      setWatching(next);
      primeWatching(complexId, next);
      window.dispatchEvent(
        new CustomEvent<WatchlistDetail>(WATCHLIST_EVENT, { detail: { complexId, watching: next } }),
      );
    } catch {
      say("네트워크 오류가 발생했어요", "error");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "bar") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching === true}
        aria-label={watching ? "관심 단지에서 빼기" : "관심 단지로 저장"}
        className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 t-caption font-bold disabled:opacity-50 ${
          watching ? "text-brand-red" : "text-text-1"
        }`}
      >
        <Icon name="heart" size={18} />
        {busy ? "저장 중…" : watching ? "관심 단지" : "관심 등록"}
      </button>
    );
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching === true}
        className={`text-xs font-bold disabled:opacity-50 ${
          tone === "dark"
            ? watching
              ? "brand-photo-chip rounded-full px-2.5 py-1"
              : "rounded-full bg-brand-hanji px-2.5 py-1 text-brand-hanji-ink"
            : watching
              ? "text-ink"
              : "text-primary"
        }`}
      >
        {busy ? "저장 중…" : watching ? "✓ 관심 단지" : "+ 단지 팔로우"}
      </button>
      {message && (
        <span
          className={`mt-0.5 text-[10px] ${
            message.tone === "ok"
              ? tone === "dark"
                ? "text-on-dark-muted"
                : "text-text-3"
              : tone === "dark"
                ? "text-brand-red-dark"
                : "text-danger"
          }`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}

/* [970 · B-17] "노트" 탭의 내용은 동네이야기(board_posts) 글이라 라벨을 "이야기"로 —
   임장노트는 아래 ComplexNotesNewsAi 섹션이 따로 그린다. ?tab= id(notes)는 그대로
   둔다(공유·북마크 호환). */
const TABS = ["요약", "이야기", "매물", "시세", "내 기록"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "요약";

/* [967 · 14] ?tab= 값 — 주소에 실리는 건 한글 라벨이 아니라 이 id 다(공유·북마크에
   퍼센트 인코딩된 한글이 실리지 않게). 모르는 값·없음 → 기본 탭. */
const TAB_IDS: Record<Tab, string> = {
  요약: "summary",
  이야기: "notes",
  매물: "listings",
  시세: "price",
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
      className="card tile flex w-full items-center justify-between rounded-[14px] px-[15px] py-3.5 text-left"
    >
      <span className="t-body text-text-1">
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
          <AIPanel title={aiTitle}>{aiBody}</AIPanel>
          {priceChart}
          {myRecordCard}
          {trades.length > 0 ? (
            <div className="card flex flex-col rounded-[14px] px-3.5 py-2">
              <div className="flex items-baseline justify-between px-0.5 py-1.5">
                <span className="t-sub font-bold text-text-2">
                  최근 실거래 · {Math.min(trades.length, 18)}개월
                </span>
                <span className="t-caption text-text-3">시세 탭에서 전체</span>
              </div>
              <div className="overflow-hidden rounded-xl bg-bg">
                {/* [967 · 18] key = yyyymm — 월별 집계라 목록 안에서 유일하다 */}
                {trades.slice(0, 18).map((t, i) => (
                  <TradeRow key={t.ym} t={t} divider={i > 0 ? "top" : "none"} />
                ))}
              </div>
            </div>
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              아직 수집된 국토교통부 실거래가 없어요
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
              className="card tile flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3"
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
              className={`card tile flex flex-col gap-1.5 rounded-2xl px-[15px] py-3.5 ${
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
      {tab === "시세" && (
        <div className="rise-in-3 flex flex-col gap-2.5" role="tabpanel">
          <PriceTab
            trades={trades}
            latestAvgManwon={latestAvgManwon}
            complexName={complexName}
            priceChart={priceChart}
            region={priceRegion}
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
