import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { safeAuth } from "@/lib/safe-auth";
import { listWatchlistPage, type WatchlistItem } from "@/lib/watchlist/store-db";
import { alertRangeLabel } from "@/lib/watchlist/alert-range";
import { resolveComplexPrice, type ComplexPriceResult } from "@/lib/market/complex-price";
import { countRecentPublicNotesByComplex } from "@/lib/inspection/store-db";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { WishlistSection } from "./WishlistSection";
import { SavedSearchesSection } from "./SavedSearchesSection";
import { SavedPostsSection } from "./SavedPostsSection";
import { SavedNotesSection } from "./SavedNotesSection";
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
/* [1056 · C2] "저장한 글" 탭 — 동네 글의 저장(북마크 type=post)이 어디에도 모이지 않았다. */
type WatchTab = "complex" | "listings" | "searches" | "saved";
const TABS: { key: WatchTab; label: string }[] = [
  { key: "complex", label: "관심 단지" },
  { key: "listings", label: "관심 매물" },
  { key: "searches", label: "저장 검색" },
  { key: "saved", label: "저장" },
];
const TAB_LABEL: Record<WatchTab, string> = Object.fromEntries(TABS.map((t) => [t.key, t.label])) as Record<
  WatchTab,
  string
>;
function WatchTabs({ active }: { active: WatchTab }) {
  return (
    <nav aria-label="관심 종류" className="mb-4 flex flex-wrap gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "complex" ? "/my/watchlist" : `/my/watchlist?tab=${t.key}`}
          aria-current={t.key === active ? "page" : undefined}
          className={`inline-flex min-h-[40px] items-center rounded-full border px-4 t-body font-bold no-underline ${
            /* [1015 · 규칙 9] 활성 탭 = 한지 + 남색(chip-active), 채움 파랑은 CTA 전용 */
            t.key === active ? "chip-active" : "border-line bg-surface text-text-1"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/* [1057 · B2] 한 쪽 30곳 — 예전엔 전체를 읽어 앞 30곳만 보여 주고 머리 수도 30으로 잘렸다(플랜 한도 100·무제한).
   ?page=N 으로 다음 30곳(서버 링크 — 행 목록 컴포넌트 구조를 바꾸지 않는다). */
const PAGE_SIZE = 30;

function pageHref(page: number): string {
  return page <= 1 ? "/my/watchlist" : `/my/watchlist?page=${page}`;
}

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
      /* [1028] 이 칸의 값은 실거래 평균이다 — "시세" 대신 "실거래" */
      return "실거래 조회 실패";
  }
}

export default async function WatchlistDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/watchlist");
  }
  const email = session.user.email;
  const { tab: rawTab, page: rawPage } = await searchParams;
  const tab: WatchTab =
    rawTab === "listings" || rawTab === "searches" || rawTab === "saved" ? rawTab : "complex";
  if (tab !== "complex") {
    return (
      <PageShell breadcrumb={`마이 › 관심 › ${TAB_LABEL[tab]}`} title="관심">
        <WatchTabs active={tab} />
        {tab === "listings" ? (
          <WishlistSection email={email} />
        ) : tab === "saved" ? (
          <>
            <SavedPostsSection email={email} />
            {/* [1059] 저장한 노트 — 노트 저장이 생겨 같은 탭 둘째 묶음 */}
            <SavedNotesSection email={email} />
          </>
        ) : (
          <SavedSearchesSection email={email} />
        )}
      </PageShell>
    );
  }

  const pageNum = Math.max(1, Math.floor(Number(rawPage)) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  let items: WatchlistItem[] = [];
  let total = 0;
  let listFailed = false;
  try {
    const page = await listWatchlistPage(email, { offset, limit: PAGE_SIZE });
    items = page.items;
    total = page.total;
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
      /* [1057 · B10] 저장 직후 클라이언트가 같은 글자를 만든다 — 한 함수(lib/watchlist/alert-range) */
      alertLabel: alertRangeLabel(w.alertPriceMin, w.alertPriceMax),
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
          title="관심 단지 불러오기 실패"
          /* [970 · C-20] 해요체 통일 · [1028 · 제안 3] 오류 문구 표준("0곳인 게 아니라 조회 실패" 구문 제거) */
          desc="잠시 후 다시 시도해 주세요."
        />
      ) : total === 0 ? (
        /* [966] 빈 상태 정본화 · [1009 · H] 무엇을 하면 채워지는지 + 채우면 무엇을 받는지 */
        <EmptyState
          icon="pin"
          className="rise-in"
          title="담아 둔 단지 없음"
          /* [1015 · 규칙 B] 빈 화면의 긴 권유문(사용법 두 문장) → 한 줄 */
          desc="단지 화면의 “단지 팔로우”나 지도의 “관심 단지 담기”로 담은 단지가 여기에 모여요."
          action={{ label: "지도에서 단지 찾기", href: "/map" }}
        />
      ) : items.length === 0 ? (
        /* [1057 · B2] 범위 밖 쪽(?page=) — "없음"이 아니라 쪽이 비었다 */
        <div className="card rounded-lg px-[15px] py-6 text-center t-body text-text-3">
          이 쪽에 관심 단지 없음 · 전체 {total}곳 ·{" "}
          <Link href={pageHref(1)} className="tap-line font-bold text-primary">
            첫 쪽 ›
          </Link>
        </div>
      ) : (
        <>
          {!notesR.ok && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
새 노트 수 불러오기 실패 · 잠시 후 다시
            </p>
          )}
          <div className="rise-in">
            <WatchlistRows initial={rows} total={total} offset={offset} />
          </div>
          {total > PAGE_SIZE && (
            <nav aria-label="관심 단지 쪽" className="mt-3 flex items-center justify-between gap-2 t-body">
              {pageNum > 1 ? (
                <Link href={pageHref(pageNum - 1)} className="tap-line font-bold text-primary no-underline">
                  ‹ 이전 {PAGE_SIZE}곳
                </Link>
              ) : (
                <span />
              )}
              <span className="t-sub tabular-nums text-text-3">
                {pageNum} / {Math.ceil(total / PAGE_SIZE)}쪽
              </span>
              {offset + items.length < total ? (
                <Link href={pageHref(pageNum + 1)} className="tap-line font-bold text-primary no-underline">
                  다음 {Math.min(PAGE_SIZE, total - offset - items.length)}곳 ›
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </PageShell>
  );
}
