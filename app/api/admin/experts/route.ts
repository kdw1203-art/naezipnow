/**
 * 어드민 전문가 인증 심사 — PATCH /api/admin/experts
 * body: { id, action: "approve" | "reject", note? }
 *   - approve: expert_verification_requests 승인 → expert_profiles 생성/인증(J1 브리지)
 *   - reject:  접수 상태 반려(사유 필수)
 * 관리자 게이트: isAdminApiRequest. 결과는 신청자 인박스 알림 + 감사로그(best-effort).
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import {
  approveExpertVerification,
  rejectExpertVerification,
} from "@/lib/experts/verification-store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { writeAuditLog } from "@/lib/audit/log";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const actorEmail = session?.user?.email?.trim().toLowerCase() || "admin";

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const note = String(body.note ?? body.reason ?? "").trim().slice(0, 500);
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "id와 action(approve|reject)이 필요합니다." },
      { status: 400 },
    );
  }

  if (action === "approve") {
    const res = await approveExpertVerification(id, actorEmail, note || null);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    if (res.applicantEmail) {
      void appendInboxNotification({
        userEmail: res.applicantEmail,
        title: "전문가 인증이 승인되었어요",
        body: "승인됐어요. 이름 옆과 글 머리에 인증 마크가 붙고 분야별 전문가 목록에 실려요. 프로필 화면에서 소개·연락처·홍보 링크를 확인해 주세요.",
        actionUrl: "/my/expert-profile",
      });
    }
    void writeAuditLog({
      actorEmail,
      action: "expert.verify",
      targetType: "expert_verification_request",
      targetId: id,
      detail: { expertId: res.expertId, applicant: res.applicantEmail },
      ip: null,
    });
    /* [953] 승인 즉시 목록·상세 ISR 을 무효화 — 승인된 전문가가 5분 뒤에야 보이면
       "승인이 안 됐다"는 문의가 온다. */
    revalidatePath("/town/experts");
    if (res.expertId) revalidatePath(`/town/experts/${res.expertId}`);
    /* [1047] 분야별 목록(정적 8장)도 — 승인된 사람이 어느 분야로 갔는지 몰라도 다 비운다(8장뿐이다) */
    for (const t of EXPERT_TYPES) revalidatePath(`/town/experts/c/${t.id}`);
    /* [1047] 단지 화면 "이 지역 인증 전문가"의 한 시간 캐시(lib/experts/nearby) */
    revalidateTag("verified-experts");
    return NextResponse.json({ ok: true, expertId: res.expertId });
  }

  // reject
  if (!note) {
    return NextResponse.json({ error: "반려 사유를 입력해 주세요." }, { status: 400 });
  }
  const res = await rejectExpertVerification(id, actorEmail, note);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  if (res.applicantEmail) {
    void appendInboxNotification({
      userEmail: res.applicantEmail,
      title: "전문가 인증이 반려되었어요",
      body: `제출하신 인증 신청이 반려되었어요. 사유: ${note} — 보완해서 다시 신청할 수 있어요.`,
      actionUrl: "/my/expert-profile",
    });
  }
  void writeAuditLog({
    actorEmail,
    action: "expert.reject",
    targetType: "expert_verification_request",
    targetId: id,
    detail: { note },
    ip: null,
  });
  return NextResponse.json({ ok: true });
}
