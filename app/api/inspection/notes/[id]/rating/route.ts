import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getNote } from "@/lib/inspection/store-db";
import { getNoteRating, rateNote } from "@/lib/inspection/note-ratings";
import { parseStars } from "@/lib/inspection/note-rating-math";
import { invalidateNoteCache } from "@/lib/inspection/note-cache";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { applyRateLimit, rateLimit, tooManyRequests, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/* [1043 · 임장노트 참여] POST /api/inspection/notes/[id]/rating — 공개 임장노트 독자 평가(별점 1~5).
 * body: { stars: 1..5 }
 *
 * 규칙: 로그인한 사람만 · 공개 노트에만 · **내 노트는 평가할 수 없다**(작성자의 항목 점수는 노트 안에 이미 있다) ·
 * 한 사람 한 노트 한 번(다시 누르면 점수가 바뀐다). 응답은 새 요약(인원·평균)과 내 점수뿐 — 다른 사람의 점수는 나가지 않는다.
 * 보호: IP 한도(WRITE_RATE_LIMIT) + 계정당 분당 20회. 첫 평가일 때만 작성자에게 인앱 알림(점수는 싣지 않는다). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const rlUser = rateLimit(`note-rating:${email}`, { limit: 20, windowMs: 60_000 });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }
  const stars = parseStars(body.stars);
  if (stars == null) return NextResponse.json({ error: "별점 1~5" }, { status: 400 });

  const { id } = await params;
  let note: Awaited<ReturnType<typeof getNote>>;
  try {
    note = await getNote(id);
  } catch (e) {
    return dbUnavailable("inspection-note", e);
  }
  /* 비공개 노트는 있는지조차 알리지 않는다 — 없는 노트와 같은 답 */
  if (!note || !note.isPublic) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (note.authorEmail && note.authorEmail.toLowerCase() === email) {
    return NextResponse.json({ error: "내 노트 · 평가 불가", code: "own_note" }, { status: 403 });
  }

  try {
    const { created } = await rateNote({ noteId: id, raterEmail: email, stars });
    invalidateNoteCache(id, "rating");
    if (created && note.authorEmail) {
      const title = (note.aptName?.trim() || note.title).slice(0, 30);
      void appendInboxNotification({
        userEmail: note.authorEmail,
        title: "임장노트에 평가가 달렸어요",
        body: `"${title}" · 독자 평가 1건`,
        actionUrl: `/notes/${id}#rating`,
      }).catch((e) => logger.error("[note-rating-notify]", e));
    }
    const summary = await getNoteRating(id, email);
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return dbUnavailable("note-rating", e);
  }
}
