/**
 * [1052] PATCH /api/admin/talk — 관리자 전용. 실시간 토론(1051 region_talks) 신고·숨김 글 처리.
 * body: { id: uuid, action: "restore" | "delete" }
 *  · restore — 숨김을 풀고 신고 누적을 0 으로(잘못 숨겨진 글)
 *  · delete  — 지우기(deleted_at · 지우지 않고 표시만 — 운영 규칙: 하드 삭제 없음)
 * 목록은 /admin/moderation 서버 화면이 직접 읽는다(lib/talk/store listFlaggedTalks).
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { restoreRegionTalk, softDeleteRegionTalk } from "@/lib/talk/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email || !isAdmin(session)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const id = String(b.id ?? "").trim();
  const action = String(b.action ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  try {
    if (action === "restore") {
      const ok = await restoreRegionTalk(id);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "글을 찾을 수 없어요." }, { status: 404 });
    }
    if (action === "delete") {
      const r = await softDeleteRegionTalk(id, { email, isAdmin: true });
      return r === true ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "글을 찾을 수 없어요." }, { status: 404 });
    }
    return NextResponse.json({ error: "action 은 restore 또는 delete" }, { status: 400 });
  } catch (e) {
    logger.error("[admin/talk] 처리 실패", { id, action, message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "처리 실패 · 잠시 후 다시" }, { status: 503 });
  }
}
