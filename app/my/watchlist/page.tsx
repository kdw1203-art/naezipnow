import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { safeAuth } from "@/lib/safe-auth";
import { listWatchlist, type WatchlistItem } from "@/lib/watchlist/store-db";
import { resolveComplexPrice, type ComplexPriceResult } from "@/lib/market/complex-price";
import { countRecentPublicNotesByComplex } from "@/lib/inspection/store-db";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { WishlistSection } from "./WishlistSection";
import { SavedSearchesSection } from "./SavedSearchesSection";
import { WatchlistRows, type WatchRow } from "./WatchlistRows";
import { pctChange } from "@/lib/format/delta";

/* ============================================================
   웹17 — 관심 단지 대시보드 (/my/watchlist, 로그인 필수)

   단지별 현재가·기준가 대비 변동·최근 30일 새 공개 노트 수를 한 표로.
   전부 기존 로더 조합이다:
   - 현재가: resolveComplexPrice (price-alerts 크론과 같은 산출 — 거래가 가장
     많은 전용면적 구간의 최근 6건 평균, 최소 3건)
   - 변동 기준: user_watchlist.last_price_krw (크론이 세운 기준가). 대표
     면적대(band)가 바뀌었으면 비교하지 않는다 — 59㎡ 평균과 84㎡ 평균의
     차이는 가격 변동이 아니다(크론과 같은 판정).
   - 새 노트: 최근 30일 공개 노트 수(단지 일괄 1쿼리)

   사실 우선: 시세 산출 불가(표본 부족·거래 없음)는 그 사유를 적고, 노트
   수 조회 실패는 "0개"가 아니라 "조회 실패"로 말한다.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "관심 | 내집나우",
  robots: { index: false, follow: false },
};

/* [994] /my 17 → 7 — 관심 단지·관심 매물(옛 /my/wishlist)·저장 검색(옛 /my/saved-searches)을
   한 화면의 탭으로. 옛 URL 은 redirect-map 이 ?tab= 으로 보낸다. */
type WatchTab = "complex" | "listings" | "searches";
const TABS: { key: WatchTab; label: string }[] = [
  { key: "complex", label: "관심 단지" },
  { key: "listings", label: "관심 매물" },
  { key: "searches", label: "저장 검색" },
];
function WatchTabs({ active }: { active: WatchTab }) {
  return (
    <nav aria-label="관심 종류" className="mb-4 flex flex-wrap gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "complex" ? "/my/watchlist" : `/my/watchlist?tab=${t.key}`}
          aria-current={t.key === active ? "page" : undefined}
          className={`inline-flex min-h-[40px] items-center rounded-full border px-4 t-body font-bold no-underline ${
            t.key === active ? "border-primary bg-primary text-white" : "border-line bg-surface text-text-1"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const MAX_ROWS = 30;

function ymLabel(s: string): string {
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

function skipLabel(r: Extract<ComplexPriceResult, { ok: false }>["reason"]): string {
  switch (r) {
    case "no-trades":
      return "신고된 매매 실거래 없음";
    case "thin-sample":
      return "표본 부족 (3건 미만)";
    case "unresolvable-id":
      return "단지 식별 불가";
    default:
      return "시세 조회 실패";
  }
}

export default async function WatchlistDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/watchlist");
  }
  const email = session.user.email;
  const { tab: rawTab } = await searchParams;
  const tab: WatchTab = rawTab === "listings" || rawTab === "searches" ? rawTab : "complex";
  if (tab !== "complex") {
    return (
      <PageShell breadcrumb={`마이 › 관심 › ${tab === "listings" ? "관심 매물" : "저장 검색"}`} title="관심">
        <WatchTabs active={tab} />
        {tab === "listings" ? <WishlistSection email={email} /> : <SavedSearchesSection email={email} />}
      </PageShell>
    );
  }

  let items: WatchlistItem[] = [];
  let listFailed = false;
  try {
    items = (await listWatchlist(email)).slice(0, MAX_ROWS);
  } catch (e) {
    /* [970 · C-09] 원인 원문은 로그로만 — 화면엔 고정 문구 */
    logger.error("[my/watchlist] 관심 단지 조회 실패", e);
    listFailed = true;
  }

  const [prices, notesR] = await Promise.all([
    Promise.all(
      items.map((w) =>
        resolveComplexPrice(w.complexId).catch(
          (): ComplexPriceResult => ({ ok: false, reason: "query-failed" }),
        ),
      ),
    ),
    countRecentPublicNotesByComplex(items.map((w) => w.complexId), 30).then(
      (m) => ({ ok: true as const, map: m }),
      (e: unknown) => {
        logger.error("[my/watchlist] 노트 수 조회 실패", e);
        return { ok: false as const };
      },
    ),
  ]);

  /* [1009 · H] 행 데이터 — 서버에서 표기까지 만들어 클라이언트 목록(WatchlistRows: 빼기·되돌리기)에 넘긴다.
     현재가는 최근 최대 6건의 **평균**이라 표기 표준대로 짧은 표기("12.5억")를 쓰고, 바로 아래에 "최근 N건 평균"과
     면적대·기준월을 적는다(한 건 값으로 읽히지 않게). */
  const rows: WatchRow[] = items.map((w, i) => {
    const p = prices[i];
    /* 변동 — 크론 기준가와 같은 면적대일 때만 비교한다 */
    let deltaPct: number | null = null;
    let deltaNote: string | null = null;
    if (p.ok && w.lastPriceKrw != null && w.lastPriceKrw > 0) {
      if (w.lastPriceBand && w.lastPriceBand !== p.price.bandSlug) deltaNote = "면적대 변경 · 비교 불가";
      else deltaPct = pctChange(p.price.priceKrw, w.lastPriceKrw);
    } else if (p.ok) {
      deltaNote = "기준가는 다음 점검 때 잡혀요";
    }
    return {
      id: w.id,
      complexId: w.complexId,
      complexName: w.complexName,
      href: complexHrefFromId(w.complexId),
      alertPriceMin: w.alertPriceMin,
      alertPriceMax: w.alertPriceMax,
      alertLabel:
        w.alertPriceMin != null || w.alertPriceMax != null
          ? `알림 범위 ${w.alertPriceMin != null ? formatKrwShort(w.alertPriceMin) : ""}~${
              w.alertPriceMax != null ? formatKrwShort(w.alertPriceMax) : ""
            }`
          : null,
      priceText: p.ok ? formatKrwShort(p.price.priceKrw) : null,
      priceSub: p.ok
        ? `${p.price.bandLabel} · 최근 ${p.price.sampleSize}건 평균 · ${ymLabel(p.price.latestYm)}까지`
        : skipLabel(p.reason),
      deltaPct,
      deltaNote,
      noteCount: notesR.ok ? (notesR.map.get(w.complexId.trim()) ?? 0) : null,
    };
  });

  return (
    <PageShell breadcrumb="마이 › 관심 › 관심 단지" title="관심">
      <WatchTabs active="complex" />

      {listFailed ? (
        <ErrorState
          title="관심 단지를 지금 불러오지 못했어요"
          /* [970 · C-20] 해요체 통일 */
          desc="담아 둔 단지가 0곳인 게 아니라 조회가 실패했어요. 잠시 후 새로고침해 주세요."
        />
      ) : items.length === 0 ? (
        /* [966] 빈 상태 정본화 · [1009 · H] 무엇을 하면 채워지는지 + 채우면 무엇을 받는지 */
        <EmptyState
          icon="pin"
          className="rise-in"
          title="아직 담아 둔 단지가 없어요"
          desc="단지 화면의 “단지 팔로우”나 지도의 “관심 단지 담기”를 누르면 여기에 모여요. 담아 두면 현재가와 지난 점검 대비 등락을 한 번에 보고, 시세가 ±1% 이상 움직이면 알림을 받아요."
          action={{ label: "지도에서 단지 찾기", href: "/map" }}
        />
      ) : (
        <>
          {!notesR.ok && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
              새 노트 수를 지금 불러오지 못했어요 — 노트가 없는 게 아니라 조회가 실패했습니다.
            </p>
          )}
          <div className="rise-in">
            <WatchlistRows initial={rows} max={MAX_ROWS} />
          </div>
        </>
      )}
    </PageShell>
  );
}
