/**
 * 매물 수정/삭제 — /api/listings/[id]
 *   PATCH  : 소유자 본인 매물의 편집 가능 필드 갱신(승인·반려건은 재검수 pending 전환)
 *   DELETE : 소유자 본인 매물 소프트 삭제(deleted_at)
 * 로그인 필수 + 소유권은 store(updateListing/deleteListing)에서 강제.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  updateListing,
  deleteListing,
  getListingById,
  isListingType,
  type ListingEditPatch,
} from "@/lib/listings/store-db";
import { invalidateComplexByNames } from "@/lib/complex/complex-invalidate";
import { invalidateListingsIndex } from "@/lib/listings/invalidate-listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** undefined=미지정(변경 안 함), null/빈문자=비움, 그 외=숫자(무효값은 null) */
function numOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function errorStatus(msg: string | undefined): number {
  if (!msg) return 500;
  if (msg.includes("본인")) return 403;
  if (msg.includes("찾을 수 없")) return 404;
  if (msg.includes("마감") || msg.includes("삭제")) return 409;
  return 400;
}

/**
 * [1010] 단지 허브(/complex/[id], 7일 ISR)의 매물 카드·"매물 N" 을 비운다.
 *
 * 허브는 승인·미숨김 매물만 서버 렌더로 그리므로, 수정(가격·유형·면적)·삭제가 그 화면을
 * 바꾼다. 조회는 id 한 건(getListingById)뿐이고, 삭제는 소프트 삭제(deleted_at)라
 * **지우기 전에** 읽어야 한다. 못 읽으면 비우지 않는다 — 모르는 단지를 찍지 않는다.
 */
async function invalidateListingComplexHub(listingId: string): Promise<void> {
  try {
    const row = await getListingById(listingId);
    if (!row) return;
    invalidateComplexByNames(row.regionName ?? null, row.complexName ?? null);
  } catch {
    /* 재검증 실패가 수정·삭제 결과를 되돌리면 안 된다 — 7일 TTL 이 안전망 */
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const patch: ListingEditPatch = {};
  if (body.listingType !== undefined) {
    const t = String(body.listingType);
    if (!isListingType(t)) {
      return NextResponse.json({ error: "거래 유형이 올바르지 않아요." }, { status: 400 });
    }
    patch.listingType = t;
  }
  const price = numOrNull(body.priceKrw);
  if (price !== undefined) patch.priceKrw = price;
  const deposit = numOrNull(body.depositKrw);
  if (deposit !== undefined) patch.depositKrw = deposit;
  const monthly = numOrNull(body.monthlyKrw);
  if (monthly !== undefined) patch.monthlyKrw = monthly;
  const area = numOrNull(body.areaM2);
  if (area !== undefined) patch.areaM2 = area;
  const floor = numOrNull(body.floor);
  if (floor !== undefined) patch.floor = floor;
  if (body.description !== undefined) {
    patch.description =
      body.description === null ? null : String(body.description).slice(0, 2000);
  }
  if (body.contact !== undefined) {
    patch.contact = body.contact === null ? null : String(body.contact).slice(0, 100);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없어요." }, { status: 400 });
  }

  const res = await updateListing(listingId, email, patch);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: errorStatus(res.error) });
  }
  await invalidateListingComplexHub(listingId);
  /* [1010] 승인 매물 목록(/listings, ISR 30분)도 이 쓰기로 바뀐다 — 같이 비운다 */
  invalidateListingsIndex();
  return NextResponse.json({ ok: true, status: res.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  /* 소프트 삭제 뒤에는 getListingById 가 null 이므로 **먼저** 단지를 알아 둔다. */
  const before = await getListingById(listingId).catch(() => null);
  const res = await deleteListing(listingId, email);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: errorStatus(res.error) });
  }
  if (before) invalidateComplexByNames(before.regionName ?? null, before.complexName ?? null);
  /* [1010] 승인 매물 목록(/listings, ISR 30분)도 이 쓰기로 바뀐다 — 같이 비운다 */
  invalidateListingsIndex();
  return NextResponse.json({ ok: true });
}
