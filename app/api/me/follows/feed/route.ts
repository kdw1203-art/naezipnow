/**
 * GET /api/me/follows/feed — 팔로우한 작성자의 공개 임장노트 피드 (authed)
 *
 * 응답: { items: [{ id, title, authorLabel, authorHandle|null, regionLabel, createdAt, href:"/notes/<id>" }], followingCount }
 *
 * [1057 · C1] 세 가지를 고쳤다 — 조회는 lib/follows/feed-db, 조립은 lib/follows/feed(순수).
 *  · `saves` 가 "평균 점수 × 40 + 체크 수"로 지어낸 값이었다 — 저장 수 자료가 없으므로 필드를 뺀다.
 *  · 사이트 전체 최신 공개 노트 100건만 긁어 팔로우한 사람 것을 걸렀다 — 팔로우한 작성자의 오래된 노트는 영영 안 보였다.
 *    이제 inspection_notes 를 `author_email in (팔로우 목록)` 으로 직접 읽는다(최신순 30건).
 *  · 작성자 라벨이 이 파일 안의 maskAuthor(이메일 앞 두 글자)였다 — 노트 author_label → 프로필 이름 → 공용 maskNoteAuthor.
 * 팔로우 목록·노트 조회 실패는 503(빈 배열로 접으면 "새 노트 없음"이 되고, 그건 거짓이다).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listFollowedAuthorsNotes } from "@/lib/follows/feed-db";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const feed = await listFollowedAuthorsNotes(session.user.email);
    return NextResponse.json(feed, { headers: NO_STORE });
  } catch (e) {
    return dbUnavailable("follows-feed", e, "새 노트 불러오기 실패 · 잠시 후 다시");
  }
}
