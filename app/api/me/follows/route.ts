/**
 * GET  /api/me/follows                    — 내 팔로잉 목록(handle·name·since) + 팔로워 수
 * POST /api/me/follows                    — { followedEmail } 또는 { handle } 팔로우
 * DELETE /api/me/follows                  — { followedEmail } 또는 { handle } 언팔로우
 * GET  /api/me/follows?checkHandle=handle — 핸들(닉네임) 기준 확인 (이메일 비노출) · 본인이면 self:true
 *
 * [1057] `?check=<email>` 분기는 지웠다 — 아무 이메일이나 넣어 팔로우 여부를 되묻는 이메일 오라클이었다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  followUser,
  unfollowUser,
  listFollowingPublic,
  isFollowing,
  followCounts,
  resolveEmailByHandle,
  AMBIGUOUS_HANDLE,
} from "@/lib/follows/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { scheduleProfileInvalidation } from "@/lib/town/invalidate-town";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { notifyNewFollower } from "@/lib/notifications/engagement-notify";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/** 못 읽은 팔로우 상태를 "팔로우 안 함"·"0명"으로 답하지 않기 위한 안내. */
const FOLLOWS_UNAVAILABLE = "지금은 팔로우 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
const FOLLOW_WRITE_FAILED = "팔로우 저장 실패 · 잠시 후 다시";
/* [1058] 같은 이름이 여럿 — resolveEmailByHandle 이 "ambiguous" 를 돌려주면 아무도 팔로우하지 않는다(예전엔 첫 사람) */
const FOLLOW_AMBIGUOUS = "같은 이름 여러 명 · 핸들 주소(/u/핸들)로 구분";

const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const myEmail = session.user.email;

  // 핸들(닉네임) 기준 확인 — 클라이언트에 이메일 노출 없이 상태 조회
  const checkHandle = req.nextUrl.searchParams.get("checkHandle");
  if (checkHandle) {
    try {
      const email = await resolveEmailByHandle(checkHandle);
      /* 핸들이 안 풀린 것(email 없음)은 "그런 사용자가 없다"라서 false 가 맞다. */
      if (!email) return NextResponse.json({ following: false });
      /* [1058] 같은 이름 여럿 — 누구인지 모르므로 false + ambiguous */
      if (email === AMBIGUOUS_HANDLE) return NextResponse.json({ following: false, ambiguous: true });
      /* [1057] 내 프로필이면 self:true — 버튼은 자기 자신에게 그려지지 않는다 */
      if (sameUser(email, myEmail)) return NextResponse.json({ following: false, self: true });
      const following = await isFollowing(myEmail, email);
      return NextResponse.json({ following });
    } catch (err) {
      return dbUnavailable("팔로우 여부 조회 실패 (handle)", err, FOLLOWS_UNAVAILABLE);
    }
  }

  try {
    /* [1057] 팔로잉 목록이 followedEmail 을 그대로 내려보냈다 — handle·name·since 만 */
    const [list, counts] = await Promise.all([listFollowingPublic(myEmail), followCounts(myEmail)]);
    return NextResponse.json({
      following: list,
      followingCount: counts.following,
      followerCount: counts.followers,
    });
  } catch (err) {
    return dbUnavailable("팔로잉 목록·팔로워 수 조회 실패", err, FOLLOWS_UNAVAILABLE);
  }
}

/** body 의 followedEmail 또는 handle → 대상 이메일. 조회 실패는 던진다(503). 없으면 null. [1058] 같은 이름 여럿이면 "ambiguous" */
async function resolveTarget(body: Record<string, unknown>): Promise<string | null | typeof AMBIGUOUS_HANDLE> {
  const direct = String(body.followedEmail ?? "").trim();
  if (direct) return direct;
  const handle = String(body.handle ?? "").trim();
  if (!handle) return null;
  return resolveEmailByHandle(handle);
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }
  if (!String(body.followedEmail ?? "").trim() && !String(body.handle ?? "").trim()) {
    return NextResponse.json({ error: "followedEmail 또는 handle이 필요합니다." }, { status: 400 });
  }

  let followedEmail: string | null | typeof AMBIGUOUS_HANDLE;
  try {
    followedEmail = await resolveTarget(body);
  } catch (err) {
    /* [1057] 핸들 조회 실패가 "사용자를 찾을 수 없습니다"(404)로 나갔다 — 503 */
    return dbUnavailable("팔로우 대상 조회 실패", err, FOLLOWS_UNAVAILABLE);
  }
  if (!followedEmail) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }
  if (followedEmail === AMBIGUOUS_HANDLE) {
    return NextResponse.json({ error: FOLLOW_AMBIGUOUS }, { status: 409 });
  }
  if (sameUser(followedEmail, session.user.email)) {
    return NextResponse.json({ error: "자기 자신은 팔로우할 수 없습니다." }, { status: 400 });
  }

  /* [1056 · B4] 팔로우가 상대에게 조용했다 — 팔로워 수만 바뀌었다. followUser 는 upsert 라
     이미 팔로우 중인 사람이 다시 눌러도 조용히 지나가므로, 그 전에 상태를 봐 **새 팔로우일 때만**
     알린다(조회 실패는 "모름" — 알리지 않는다). 알림 실패는 팔로우를 되돌리지 않는다. */
  const wasFollowing = await isFollowing(session.user.email, followedEmail).catch(
    (): boolean | null => null,
  );
  try {
    await followUser(session.user.email, followedEmail);
  } catch (err) {
    /* [1057] 저장 실패가 200 으로 돌아가며 알림까지 나갔다 — 503 · 알리지 않는다 */
    return dbUnavailable("팔로우 저장 실패", err, FOLLOW_WRITE_FAILED);
  }
  /* [1010 · 동네축] 공개 프로필(/u/{handle}, TTL 900초 → 1일)이 팔로워 수를 서버에서 그린다 —
     늘린 TTL 만큼 숫자가 굳지 않게 그 사람 프로필만 비운다. 실패는 헬퍼가 삼킨다. */
  scheduleProfileInvalidation(followedEmail);
  /* [1057] 내 프로필(/u)의 "팔로잉 N" 도 ISR 이라 비운다 */
  scheduleProfileInvalidation(session.user.email);
  if (wasFollowing === false) {
    void notifyNewFollower({
      followedEmail,
      followerEmail: session.user.email,
    }).catch((e) => logger.error("[follow-notify]", e));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }
  if (!String(body.followedEmail ?? "").trim() && !String(body.handle ?? "").trim()) {
    return NextResponse.json({ error: "followedEmail 또는 handle이 필요합니다." }, { status: 400 });
  }

  let followedEmail: string | null | typeof AMBIGUOUS_HANDLE;
  try {
    followedEmail = await resolveTarget(body);
  } catch (err) {
    return dbUnavailable("팔로우 대상 조회 실패", err, FOLLOWS_UNAVAILABLE);
  }
  if (!followedEmail) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }
  if (followedEmail === AMBIGUOUS_HANDLE) {
    return NextResponse.json({ error: FOLLOW_AMBIGUOUS }, { status: 409 });
  }

  try {
    await unfollowUser(session.user.email, followedEmail);
  } catch (err) {
    /* [1057] 삭제 실패도 200 이었다 — 503 */
    return dbUnavailable("팔로우 취소 실패", err, FOLLOW_WRITE_FAILED);
  }
  /* [1010 · 동네축] 팔로우와 같은 이유 — 줄어든 팔로워 수도 즉시 보여야 한다 */
  scheduleProfileInvalidation(followedEmail);
  /* [1057] 내 프로필(/u)의 "팔로잉 N" 도 ISR 이라 비운다 */
  scheduleProfileInvalidation(session.user.email);
  return NextResponse.json({ ok: true });
}
