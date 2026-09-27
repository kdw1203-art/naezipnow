/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 6곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { VerifyOwnershipButton } from "./VerifyOwnershipButton";
import { BoostButton } from "./BoostButton";
import { ListingManageActions } from "./ListingManageActions";
import { RefreshButton } from "@/app/listings/[id]/RefreshButton";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertStatus } from "@/lib/experts/is-verified";
import {
  listMyListings,
  listingStaleStage,
  LISTING_TYPE_LABEL,
  LISTING_STALE_DAYS,
  LISTING_CLOSE_SUGGEST_DAYS,
  type ListingDetail,
  type ListingStatus,
  type ListingStaleStage,
} from "@/lib/listings/store-db";
import { getOwnerInquiryStats } from "@/lib/listings/inquiries";
import { EARN_RULES } from "@/lib/points/catalog";
import { listingPriceLine } from "@/app/listings/price-text";

/* ============================================================
   내 매물 — /my/listings (로그인 필수)
   상태별(검수중·노출중·반려·마감)·조회수·부스트 잔여·노출 부스트 안내.

   I10 — 신선도(끌어올린 지 얼마나 됐는지)를 여기에 넣었다. 예전엔 /listings/[id]
   상세에만 배지가 있었는데, 중개사가 매일 여는 화면은 여기다. 자기 매물이
   몇 건이나 낡았는지 이 화면에서 안 보이면 사실상 아무도 못 보는 것과 같다.

   조건은 크론(app/api/cron/listing-stale-reminders)과 같은 status='approved' 다.
   화면과 알림이 갈리면 "화면엔 멀쩡한데 알림은 오는" 상태가 생기고, 그건 알림을
   끄게 만드는 가장 빠른 길이다.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "내 매물 | 내집나우",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<ListingStatus, { label: string; cls: string }> = {
  pending: { label: "검수중", cls: "bg-[rgba(29,79,216,.1)] text-primary" },
  approved: { label: "노출중", cls: "bg-success-soft text-success" },
  rejected: { label: "반려", cls: "bg-danger-soft text-danger" },
  closed: { label: "마감", cls: "bg-[rgba(0,0,0,.06)] text-text-3" },
};

/* [1009 · T] 내 매물 호가도 정밀 표기("매매 12억 4,500만") — 목록·상세와 같은 app/listings/price-text */
function priceLine(l: ListingDetail): string {
  return listingPriceLine(l);
}

/** 신선도 기준시각(refreshed_at, 없으면 created_at) 이후 경과일 */
function staleAgeDays(l: ListingDetail): number {
  const t = Date.parse(l.refreshedAt ?? l.createdAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const STALE_META: Record<
  Exclude<ListingStaleStage, 0>,
  { label: string; cls: string; noticeCls: string }
> = {
  1: {
    label: "확인 필요",
    cls: "bg-[rgba(245,158,11,.14)] text-warning",
    noticeCls: "bg-[rgba(245,158,11,.08)] text-warning",
  },
  2: {
    label: "마감 검토",
    cls: "bg-danger-soft text-danger",
    noticeCls: "bg-danger-soft text-danger",
  },
};

/** 부스트 잔여 — 만료 전이면 "D-일" / "N시간", 아니면 null */
function boostRemaining(boostUntil: string | null): string | null {
  if (!boostUntil) return null;
  const t = Date.parse(boostUntil);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `부스트 ${days}일 남음`;
  const hours = Math.max(1, Math.floor(diff / 3_600_000));
  return `부스트 ${hours}시간 남음`;
}

export default async function MyListingsPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/listings");
  }

  // 매물 등록·관리는 공인중개사 인증(isBroker) 사용자만 (item 11)
  const expert = await getExpertStatus(session.user.email);
  if (!expert.isBroker) {
    return (
      /* [v4 · 규칙 1·7·10] 아이콘 + 가운데 정렬 카드 → 제목 한 줄 + 사실 한 줄 + 버튼(760px 줄 왼쪽) */
      <PageShell>
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-3">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">내 매물</h1>
            {/* [992 · A1] 전문가 인증 신청(/town/experts)은 보관(비노출) — 신청 입구를
                약속하지 않고, 인증 회원 전용이라는 사실과 문의처만 말한다. */}
            <p className="t-sub text-text-3">
              매물 등록·검수·노출 관리는 개업공인중개사 인증 회원 전용 · 인증 신청은 지금 받지 않음
            </p>
          </header>
          <Link href="/support" className="btn-soft btn-md no-underline">
            고객센터 문의
          </Link>
          <Link href="/my" className="inline-flex min-h-10 items-center t-sub font-bold text-text-3 no-underline">
            마이로 돌아가기 ›
          </Link>
          <div className="mt-4 border-t border-line pt-3 t-sub text-text-3">
            내집나우는 광고 매체로서 매물 정보를 게재할 뿐 중개 당사자가 아니며, 매물
            등록·중개 행위는 개업공인중개사가 수행합니다.
          </div>
        </div>
      </PageShell>
    );
  }

  const [items, inquiry] = await Promise.all([
    listMyListings(session.user.email),
    getOwnerInquiryStats(session.user.email),
  ]);
  const counts = items.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalViews = items.reduce((s, l) => s + (l.viewCount || 0), 0);
  const activeCount = counts.approved ?? 0;
  /* 노출중 매물만 신선도를 따진다 — 크론과 같은 조건. */
  const staleCount = items.filter(
    (l) => l.status === "approved" && listingStaleStage(l) >= 1,
  ).length;

  return (
    /* [v4 · 한 화면 한 가지] 가운데 한 줄(760px): 제목 + 사실 한 줄(상태별 건수) · 등록 버튼(채움 1개) →
       실적 1px 선 행(노출중·총 조회·받은 문의 — 오른쪽 숫자) → 매물 목록 → 끝 캡션. 실적 칸 격자·주황 상자 → 행·한 줄 */
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
      <header className="mb-4 flex flex-col gap-0.5">
        <h1 className="t-title text-ink">내 매물</h1>
        <p className="t-sub text-text-3">
          검수중 {counts.pending ?? 0} · 노출중 {counts.approved ?? 0} · 반려 {counts.rejected ?? 0} · 마감{" "}
          {counts.closed ?? 0}
        </p>
      </header>

      {/* 실적 요약 — 실집계(노출중·총 조회·받은 문의) */}
      {items.length > 0 && (
        <ul data-tone="blue" className="rise-in mb-4 divide-y divide-line border-y border-line">
          <li className="flex min-h-12 items-center justify-between gap-3 py-2.5">
            <span className="t-body font-bold text-ink">노출중 매물</span>
            <span className="t-body t-num text-ink">{activeCount}</span>
          </li>
          <li className="flex min-h-12 items-center justify-between gap-3 py-2.5">
            <span className="t-body font-bold text-ink">총 조회</span>
            <span className="t-body t-num text-ink">{totalViews.toLocaleString("ko-KR")}</span>
          </li>
          <li>
            <Link href="/my/leads" className="press flex min-h-12 items-center justify-between gap-3 py-2.5 no-underline">
              <span className="t-body font-bold text-ink">받은 문의</span>
              <span className="flex items-center gap-1.5">
                {inquiry.unread > 0 && <span className="t-sub font-bold text-primary">새 {inquiry.unread}</span>}
                <span className="t-body t-num text-ink">{inquiry.total}</span>
                <span aria-hidden="true" className="t-body text-text-3">
                  ›
                </span>
              </span>
            </Link>
          </li>
        </ul>
      )}

      {/* I10 — 낡은 매물이 있을 때만 뜨는 안내. 없으면 아무 말도 하지 않는다. [v4] 주황 상자 + 세 문장 → 한 줄 */}
      {staleCount > 0 && (
        <p className="rise-in mb-4 t-sub font-bold text-warning">
          노출중 {staleCount}건 {LISTING_STALE_DAYS}일 넘게 미갱신 · 거래 중이면 끌어올리기, 끝났으면 거래완료 마감
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex gap-2">
          <Link href="/my/leads" className="btn-outline btn-md no-underline">
            받은 문의{inquiry.unread > 0 ? ` · 새 ${inquiry.unread}` : ""}
          </Link>
          <Link href="/listings/new" className="btn-primary btn-md">
            지도에서 매물 등록
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        /* [966] 빈 상태 정본화 · [v4 · 규칙 8] 그림 카드 → 한 줄(등록 버튼은 바로 위에 있다)
           [1012] 규칙 6·7 — 실제 적립 규칙 숫자(listing_approved) */
        <p className="rise-in border-y border-line py-3 t-sub text-text-3">
          등록한 매물 없음 · 지도에서 위치를 찍어 등록 → 운영진 승인 뒤 실매물 목록 · {EARN_RULES.listing_approved.points}P 적립
        </p>
      ) : (
        /* [v4 · 규칙 10] 높이가 다른 카드 2열(엇갈림) → 한 열 1px 선 목록 */
        <div data-tone="hanji" className="rise-in flex flex-col divide-y divide-line border-y border-line">
          {items.map((l) => {
            const meta = STATUS_META[l.status];
            const boost = boostRemaining(l.boostUntil);
            const staleStage = l.status === "approved" ? listingStaleStage(l) : 0;
            const staleMeta = staleStage === 0 ? null : STALE_META[staleStage];
            return (
              <div key={l.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-md chip-pad text-[12px] font-bold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-md bg-success-soft chip-pad t-sub font-bold text-success">
                      집주인 확인
                    </span>
                  )}
                  {boost && (
                    <span className="rounded-md bg-[rgba(245,158,11,.14)] chip-pad t-sub font-bold text-warning">
                      {boost}
                    </span>
                  )}
                  {staleMeta && (
                    <span
                      className={`rounded-md chip-pad text-[12px] font-bold ${staleMeta.cls}`}
                    >
                      {staleMeta.label}
                    </span>
                  )}
                </div>

                <Link
                  href={`/listings/${l.id}`}
                  className="t-section text-ink hover:underline"
                >
                  {l.complexName}
                </Link>
                <div className="t-section text-primary">{priceLine(l)}</div>
                <div className="t-sub text-text-3">
                  {[
                    l.regionName,
                    l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                    l.floor !== null ? `${l.floor}층` : null,
                    `조회 ${l.viewCount.toLocaleString("ko-KR")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>

                {l.status === "rejected" && l.rejectReason && (
                  <div className="rounded-lg bg-danger-soft px-3 py-2 t-sub text-danger">
                    반려 사유 · {l.rejectReason}
                  </div>
                )}

                {l.status !== "rejected" && l.flagReason && (
                  <div className="rounded-lg bg-[rgba(245,158,11,.08)] px-3 py-2 t-sub text-warning">
                    확인 필요 · {l.flagReason}
                  </div>
                )}

                {staleMeta && (
                  <div
                    className={`rounded-lg px-3 py-2 text-[12px] leading-[1.6] ${staleMeta.noticeCls}`}
                  >
                    {staleAgeDays(l)}일째 갱신되지 않았어요.{" "}
                    {staleStage === 2
                      ? `${LISTING_CLOSE_SUGGEST_DAYS}일이 넘었으니 끝난 거래라면 거래완료로 마감해 주세요.`
                      : "아직 거래 중이면 끌어올려 주세요."}
                  </div>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Link href={`/listings/${l.id}`} className="btn-outline btn-sm">
                    상세 보기
                  </Link>
                  {staleStage >= 1 && (
                    <RefreshButton listingId={l.id} callbackUrl="/my/listings" />
                  )}
                  {l.status === "approved" && (
                    <BoostButton listingId={l.id} active={Boolean(boost)} />
                  )}
                  {!l.ownerVerified &&
                    l.status !== "rejected" &&
                    l.status !== "closed" && (
                      <VerifyOwnershipButton listingId={l.id} />
                    )}
                  {l.status !== "closed" && (
                    <ListingManageActions
                      listingId={l.id}
                      listingType={l.listingType}
                      priceKrw={l.priceKrw}
                      depositKrw={l.depositKrw}
                      monthlyKrw={l.monthlyKrw}
                      areaM2={l.areaM2}
                      floor={l.floor}
                      description={l.description}
                      contact={l.contact}
                      status={l.status}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 법적 고지 — [v4] 회색 상자 → 끝 캡션 */}
      <div className="mt-8 border-t border-line pt-3 t-sub text-text-3">
        내집나우는 광고 매체로서 매물 정보를 게재할 뿐 중개 당사자가 아니며, 매물 정보의
        정확성에 대한 책임은 등록자에게 있습니다.
      </div>
      </div>
    </PageShell>
  );
}
