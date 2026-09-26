import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { deletePost, updatePost } from "@/lib/posts-store";
import { lookupPost, postLookupErrorResponse } from "@/lib/community/post-lookup";
import type { Post } from "@/lib/types/post";
import { revalidatePath } from "next/cache";
import { invalidateTownFeed, invalidateHomeData } from "@/lib/cache/invalidate";
import { invalidateComplexById } from "@/lib/complex/complex-invalidate";
import { invalidatePromptThreads, invalidateTownDataCaches } from "@/lib/town/invalidate-town";

export const runtime = "nodejs";

/**
 * 작성자 판정은 **이메일로만** 한다.
 *
 * 예전에는 `post.authorLabel === session.user.name` 도 작성자로 쳤다. 표시 이름은
 * 사용자가 직접 고르는 값이고 유일하지도 않아서, 남의 글에 적힌 이름으로 프로필을
 * 바꾸기만 하면 그 글의 수정·삭제 권한을 그대로 가져올 수 있었다. 이름은 신원이 아니다.
 */
function isAuthor(post: Post, session: { user?: { email?: string | null } } | null) {
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  return Boolean(post.notifyEmail && post.notifyEmail.trim().toLowerCase() === email);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  /* notifyEmail·authorEmail 은 서버 전용 — 익명 응답에서 벗긴다(목록 GET 과 동일 판단). */
  const { notifyEmail: _drop, authorEmail: _drop2, ...publicPost } = post;
  return NextResponse.json({ post: publicPost });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  if (!isAuthor(post, session) && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const patch: Partial<Post> = {};
  if (b.title !== undefined) patch.title = String(b.title).trim();
  if (b.body !== undefined) patch.body = String(b.body).trim();
  if (b.category !== undefined) patch.category = String(b.category).trim();
  if (b.city !== undefined) patch.city = String(b.city).trim();
  if (b.district !== undefined) patch.district = String(b.district).trim();
  if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean);
  if (b.ugcPostType !== undefined) {
    const u = String(b.ugcPostType).trim();
    if (u === "question" || u === "review" || u === "tip" || u === "general") {
      patch.ugcPostType = u;
    }
  }
  const next = await updatePost(id, patch);
  if (!next) {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
  /* [1007 · 리뷰 M2] 상세·피드가 6시간 ISR 이 됐다 — 고친 글이 그 시간 동안 옛 본문으로 남지 않게 */
  revalidateStory(id, [...(post.tags ?? []), ...(next.tags ?? [])]);
  /* [1010] 단지 허브(7일 ISR)의 "단지 이야기" 카드에 제목이 그대로 실린다 —
     고친 제목이 일주일 동안 옛 제목으로 남지 않게. 단지가 바뀌는 수정은 없지만
     둘 다(옛·새) 비워도 해가 없으므로 결과 행 기준으로 비운다. */
  invalidateComplexById(next.complexId ?? post.complexId);
  /* 서버 전용 값 제거 — GET 과 같은 규칙(작성자 본인 응답이라도 굳이 싣지 않는다) */
  const { notifyEmail: _n, authorEmail: _a, ...publicNext } = next;
  return NextResponse.json({ post: publicNext });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  if (!isAuthor(post, session) && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const ok = await deletePost(id);
  if (!ok) {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
  /* [1007 · 리뷰 M2] 지운 글이 상세·피드·동네 홈·홈 스냅샷에 최대 6시간 남지 않게 */
  revalidateStory(id, post.tags ?? []);
  /* [1010] 단지 허브(7일 ISR)의 이야기 목록·개수에서도 바로 빠져야 한다 */
  invalidateComplexById(post.complexId);
  invalidateHomeData();
  return NextResponse.json({ ok: true });
}

/** 이웃 글 하나의 상세(새 주소·옛 주소) + 피드·동네 홈 */
function revalidateStory(id: string, tags?: string[] | null): void {
  try {
    revalidatePath(`/town/story/${id}`);
    revalidatePath(`/town/news/${id}`);
  } catch {
    /* 요청 밖에서는 던질 수 있다 — TTL 이 안전망 */
  }
  invalidateTownFeed();
  /* [1010 · 동네축] 글감 스레드(/town/prompt/{idx}, TTL 1일)에 이 글이 쌓여 있다면 그 한 장만.
     태그가 없으면 아무것도 하지 않는다(14장을 통째로 비우지 않는다). */
  invalidatePromptThreads(tags ?? []);
  /* [1010 · 동네축] 동네 글 병합 목록(related-town-posts-v1)·주간 다이제스트의 "이웃 글 N건" —
     그 데이터 캐시 TTL 을 1일로 올렸으므로 태그로 같이 비운다(lib/town/cache-tags.ts). */
  invalidateTownDataCaches();
}
