import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { safeAuth } from "@/lib/safe-auth";
import { adoptComment, getPost } from "@/lib/posts-store";
import { awardPoints } from "@/lib/points/ledger";
import { logger } from "@/lib/log";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

/* [#65] 답변 채택.
 * POST { commentId } — 글쓴이만. 글당 1개(교체 가능). 채택된 댓글 작성자에게
 * comment_adopted 포인트(원장 규칙이 상한·중복 방어, refId=post:comment).
 * GET — 뷰어가 이 글의 채택 권한자(글쓴이)인지만 알려준다. 상세 페이지가
 * 공유 캐시(ISR)라 서버 렌더에서는 뷰어를 알 수 없어, 클라이언트가 이걸로
 * 채택 버튼 노출 여부를 정한다(권한 판정 자체는 항상 POST 에서 다시 한다). */

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ isAuthor: false, ownCommentIds: [] });
  const post = await getPost(id);
  if (!post) return NextResponse.json({ isAuthor: false, ownCommentIds: [] });
  const owner = post.notifyEmail?.trim().toLowerCase() ?? null;
  /* [967 · 25] 뷰어가 쓴 댓글 id — 스레드가 "삭제" 버튼을 그릴 근거. 이메일은 절대
     내려보내지 않고 id 목록만 준다(권한 판정의 진실은 DELETE 가 다시 한다).
     getPost 는 응답용이라 comments 의 authorEmail 을 일부러 벗긴다(rowToPost 주석) —
     Supabase 백엔드에서는 comments jsonb 를 직접 읽는다(softDeleteCommentSb 와 같은 이유).
     실패는 빈 목록 — 버튼이 안 보일 뿐 삭제 자체는 서버가 지킨다. */
  let ownCommentIds: string[] = [];
  try {
    const sb = getServiceSupabase();
    let raw: Array<{ id?: unknown; authorEmail?: unknown; deletedAt?: unknown }> = [];
    if (sb) {
      const { data } = await sb.from("posts").select("comments").eq("id", id).maybeSingle();
      raw = Array.isArray(data?.comments) ? data.comments : [];
    } else {
      raw = post.comments;
    }
    ownCommentIds = raw
      .filter(
        (c) =>
          !c.deletedAt &&
          typeof c.authorEmail === "string" &&
          c.authorEmail.trim().toLowerCase() === email,
      )
      .map((c) => String(c.id));
  } catch (e) {
    logger.warn("[comment-adopt] ownCommentIds 조회 실패", e);
  }
  return NextResponse.json({ isAuthor: owner !== null && owner === email, ownCommentIds });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const commentId = String((body as Record<string, unknown>).commentId ?? "").trim();
  if (!commentId) {
    return NextResponse.json({ error: "commentId가 필요합니다." }, { status: 400 });
  }

  const result = await adoptComment(id, commentId, email);
  if (result === "forbidden") {
    return NextResponse.json({ error: "글쓴이만 채택할 수 있어요." }, { status: 403 });
  }
  if (result === "self") {
    return NextResponse.json({ error: "내 댓글은 채택할 수 없어요." }, { status: 400 });
  }
  if (!result) {
    return NextResponse.json({ error: "글 또는 댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  /* 채택 포인트 — fail-soft: 지급 실패가 채택 자체를 되돌리지 않는다 */
  let pointsAwarded = 0;
  if (result.adoptedAuthorEmail) {
    try {
      const award = await awardPoints(
        result.adoptedAuthorEmail,
        "comment_adopted",
        `${id}:${commentId}`,
      );
      if (award.ok) pointsAwarded = award.awarded;
    } catch (e) {
      logger.error("[comment-adopt-points]", e);
    }
  }

  revalidatePath(`/town/news/${id}`);
  return NextResponse.json({ ok: true, pointsAwarded });
}
