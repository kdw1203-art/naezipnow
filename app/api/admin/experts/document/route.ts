/**
 * [1047] 관리자 — 전문가 신청 첨부 열기. GET ?id=<신청 id>&i=<첨부 순번> → 5분짜리 서명 주소로 보낸다(302).
 * 신청서에 붙은 경로만 연다(임의 경로를 받지 않는다). 열람은 감사 기록에 남긴다.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { docViewUrl } from "@/lib/experts/documents";
import { writeAuditLog } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const i = Number(url.searchParams.get("i") ?? "-1");
  const sb = getServiceSupabase();
  if (!sb || !id || !Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: "id 와 i 가 필요합니다." }, { status: 400 });
  }
  const { data, error } = await sb.from("expert_verification_requests").select("document_files").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "신청을 찾지 못했어요." }, { status: 404 });
  const files = Array.isArray((data as { document_files?: unknown }).document_files)
    ? ((data as { document_files: Array<{ path?: unknown }> }).document_files)
    : [];
  const path = typeof files[i]?.path === "string" ? (files[i].path as string) : "";
  if (!path) return NextResponse.json({ error: "첨부를 찾지 못했어요." }, { status: 404 });
  try {
    const signed = await docViewUrl(path);
    const session = await safeAuth();
    void writeAuditLog({
      actorEmail: session?.user?.email?.trim().toLowerCase() || "admin",
      action: "expert.doc_view",
      targetType: "expert_verification_request",
      targetId: id,
      detail: { index: i },
      ip: null,
    });
    return NextResponse.redirect(signed, 302);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "열람 실패" }, { status: 500 });
  }
}
