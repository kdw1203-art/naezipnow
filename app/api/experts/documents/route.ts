/**
 * [1047] 전문가 신청 첨부 — POST(올리기 · multipart: file, kind) / DELETE(?path= · 신청 전에 뺀 파일 지우기).
 * 로그인 필요 · 계정당 1시간 30건. 저장은 비공개 버킷(expert-docs)의 신청자 폴더, 응답은 경로·종류·이름·크기뿐.
 * 실제 신청(POST /api/experts/register)이 이 경로들을 들고 와서 신청서에 붙인다.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isDocKind } from "@/lib/experts/document-rules";
import { ExpertDocError, removeExpertDocument, uploadExpertDocument } from "@/lib/experts/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const rl = rateLimit(`expert-doc:${email}`, { limit: 30, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일을 골라 주세요." }, { status: 400 });
  if (!isDocKind(kind)) return NextResponse.json({ error: "서류 종류를 골라 주세요." }, { status: 400 });
  try {
    const doc = await uploadExpertDocument(file, email, kind);
    return NextResponse.json({ file: doc });
  } catch (e) {
    const msg = e instanceof ExpertDocError ? e.message : "파일 저장 실패 · 잠시 후 다시";
    return NextResponse.json({ error: msg }, { status: e instanceof ExpertDocError ? 400 : 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  try {
    await removeExpertDocument(path, email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "삭제 실패" }, { status: 400 });
  }
}
