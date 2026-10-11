import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invalidateTownFeed } from "@/lib/cache/invalidate";
import { invalidateComplexById } from "@/lib/complex/complex-invalidate";
import { safeAuth } from "@/lib/safe-auth";
import { togglePostLike } from "@/lib/posts-store";
import { lookupPost, postLookupErrorResponse } from "@/lib/community/post-lookup";
import { postHref } from "@/lib/town/post-href";
import { likeMilestone, notifyPostLikeMilestone } from "@/lib/notifications/engagement-notify";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await ctx.params;
  const found = await lookupPost(postId);
  if (found.state !== "ok") {
    return postLookupErrorResponse(found, "글을 찾을 수 없습니다.");
  }

  let guestId = "";
  try {
    const b = (await req.json()) as { guestId?: string };
    guestId = String(b?.guestId ?? "").trim();
  } catch {
    /* empty body ok */
  }

  const session = await safeAuth();
  const userKey = session?.user?.email?.trim()
    ? `user:${session.user.email.trim()}`
    : guestId
      ? `guest:${guestId}`
      : "";

  if (!userKey) {
    return NextResponse.json(
      {
        error:
          "로그인하거나, 비로그인 시 브라우저에 저장된 guestId가 필요합니다.",
      },
      { status: 401 },
    );
  }

  const result = await togglePostLike(postId, userKey);
  if (!result) {
    return NextResponse.json(
      { error: "공감 처리에 실패했습니다. Supabase에 post_likes 테이블이 있는지 확인하세요." },
      { status: 503 },
    );
  }

  /* [1056 · B1] 좋아요가 작성자에게 조용했다 — 카운트만 올랐다. 경계(1·5·10·25·50·100)에 닿을 때,
     누른 사람이 작성자 본인이 아닐 때만 인앱(+설정 켜진 사람은 푸시). 수신 주소는 Post 에 실리는
     notifyEmail(authorEmail 은 rowToPost 가 응답용 Post 에 싣지 않는다). fail-soft. */
  const authorEmail = found.post.notifyEmail?.trim().toLowerCase() ?? "";
  const likerEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  if (result.liked && authorEmail && authorEmail !== likerEmail && likeMilestone(result.likeCount)) {
    void notifyPostLikeMilestone({
      authorEmail,
      postId,
      postTitle: found.post.title,
      likeCount: result.likeCount,
      postPath: postHref(found.post),
    }).catch((e) => logger.error("[post-like-notify]", e));
  }

  revalidatePath(`/town/story/${postId}`); // ISR 이야기 상세의 공감 수 즉시 재생성 [1006]
  revalidatePath(`/town/news/${postId}`);
  invalidateTownFeed(); // [1007] 피드 카드·동네 홈에도 공감 수가 실린다(ISR 600초·6시간)
  /* [1010] 단지 허브(7일 ISR)의 이야기 카드는 "공감 N · 댓글 N"을 서버 렌더로 싣는다 */
  invalidateComplexById(found.post.complexId);

  return NextResponse.json(result);
}
