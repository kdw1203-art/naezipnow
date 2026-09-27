import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNote, type InspectionNote } from "@/lib/inspection/store-db";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/**
 * 썸네일 API 의 소유자 확인 — 기존 노트 수정 API(app/api/inspection/notes/[id] PATCH)와 같은 방식:
 * 세션 이메일(소문자) === 노트 author_email(소문자). 로그인 없음 401 · 조회 실패 503 · 없음 404 · 남의 노트 403.
 */
export async function loadOwnedNote(
  id: string,
): Promise<{ ok: true; note: InspectionNote; email: string } | { ok: false; res: NextResponse }> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? "";
  if (!email) return { ok: false, res: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  let note: InspectionNote | null;
  try {
    note = await getNote(id);
  } catch (e) {
    return { ok: false, res: dbUnavailable("note-cover", e) };
  }
  if (!note) return { ok: false, res: NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 }) };
  if (note.authorEmail.toLowerCase() !== email) {
    return { ok: false, res: NextResponse.json({ error: "본인 노트만 바꿀 수 있어요." }, { status: 403 }) };
  }
  return { ok: true, note, email };
}
