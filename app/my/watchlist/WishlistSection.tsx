/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 3곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { listBookmarks } from "@/lib/bookmarks/store";
import { formatEokMan } from "@/lib/format/eok-man";
import {
  getListingById,
  LISTING_TYPE_LABEL,
  isListingStale,
  type ListingDetail,
} from "@/lib/listings/store-db";

/* ============================================================
   관심 매물 — /my/wishlist (로그인 필수)
   bookmarks(target_type='listing') → 매물 데이터 조인. 숨김·삭제 매물은 자연 제외.
   ============================================================ */



/* [1009 · H] 매물 한 건의 호가 = 정밀 표기(표기 표준 · 네이버 부동산 관례) — "12억 4,500만".
   예전 짧은 표기("12.5억")는 12억 4,500만과 12억 5,000만을 같은 얼굴로 보여 줬다. 값은 원 단위 → 만원으로. */
function won(krw: number | null | undefined): string {
  return krw == null ? "—" : formatEokMan(krw / 10_000);
}

function priceLine(l: ListingDetail): string {
  if (l.listingType === "sale") return `매매 ${won(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${won(l.depositKrw)}`;
  return `월세 ${won(l.depositKrw)} / ${won(l.monthlyKrw)}`;
}

type SavedListingsResult =
  | { ok: true; items: ListingDetail[]; failedCount: number }
  | { ok: false };

/* 실패를 빈 배열로 누르면 "아직 저장한 매물이 없어요"가 된다 — 조회 실패와
   "없음"은 다른 사실이다. 목록 전체 실패는 ok:false 로, 개별 매물 해석 실패는
   failedCount 로 세어 화면이 "N건은 불러오지 못했어요"를 말할 수 있게 한다.
   (개별 실패에서 숨김·삭제 매물의 정상 null 과 조회 오류를 구분한다.) */
async function loadSavedListings(email: string): Promise<SavedListingsResult> {
  let bms;
  try {
    bms = await listBookmarks(email, "listing");
  } catch (e) {
    /* [970 · C-09] 원인 원문은 로그로만 — 화면엔 고정 문구 */
    logger.error("[my/wishlist] 관심 매물 조회 실패", e);
    return { ok: false };
  }
  const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 100);
  let failedCount = 0;
  const resolved = await Promise.all(
    ids.map((id) =>
      getListingById(id).catch(() => {
        failedCount += 1;
        return null;
      }),
    ),
  );
  // 숨김(신고 누적 등)·삭제·비공개 매물은 관심 목록에서 제외 (표시 전용)
  const items = resolved.filter(
    (l): l is ListingDetail => l !== null && !l.isHidden && l.status !== "rejected",
  );
  return { ok: true, items, failedCount };
}

export async function WishlistSection({ email }: { email: string }) {
  const loaded = await loadSavedListings(email);
  const items = loaded.ok ? loaded.items : [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-sub text-text-3">저장한 매물 {items.length}개</p>
        <Link href="/listings" className="inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline">
          매물 둘러보기 ›
        </Link>
      </div>

      {!loaded.ok ? (
        <ErrorState
          title="관심 매물을 지금 불러오지 못했어요"
          /* [970 · C-20] 해요체 통일 */
          desc="저장한 매물이 0개인 게 아니라 조회가 실패했어요. 잠시 후 새로고침해 주세요."
        />
      ) : items.length === 0 ? (
        /* [966] 빈 상태 정본화 · [v4 · 규칙 8] 그림 카드 → 한 줄(목록 링크는 바로 위에 있다) */
        <p className="rise-in border-y border-line py-3 t-sub text-text-3">
          저장한 매물 없음 · 매물 화면의 관심(♥) 버튼 → 여기에 모임 · 실거래가와 나란히 비교
        </p>
      ) : (
        <>
          {loaded.ok && loaded.failedCount > 0 && (
            <p className="mb-3 t-caption text-text-3">
              {loaded.failedCount}건 조회 실패 — 삭제된 게 아닐 수 있음 · 잠시 후 새로고침
            </p>
          )}
          {/* [v4 · 규칙 5·10] 높이가 다른 카드 2열 → 1px 선 행(왼쪽 단지·가격·메타 / 오른쪽 ›). 행 전체가 상세 링크 */}
          <ul data-tone="blue" className="rise-in flex flex-col divide-y divide-line border-y border-line">
            {items.map((l) => {
              const stale = isListingStale(l);
              return (
                <li key={l.id}>
                  <Link href={`/listings/${l.id}`} className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate t-body font-bold text-ink">{l.complexName}</span>
                        {/* 검증·경과 사실 배지만 — "집주인 확인"(기준 사이트 표기) · "확인 필요" */}
                        {l.ownerVerified && (
                          <span className="shrink-0 rounded-sm bg-success-soft chip-pad t-caption font-medium text-success">
                            집주인 확인
                          </span>
                        )}
                        {stale && (
                          <span className="shrink-0 rounded-sm bg-warning-soft chip-pad t-caption font-medium text-warning">
                            확인 필요
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {[
                          LISTING_TYPE_LABEL[l.listingType],
                          l.regionName,
                          l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                          l.floor !== null ? `${l.floor}층` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="t-body t-num text-ink">{priceLine(l)}</span>
                      <span aria-hidden="true" className="t-body text-text-3">
                        ›
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
