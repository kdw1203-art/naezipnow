import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listNotes } from "@/lib/inspection/store-db";
import { listAlertSubscriptions } from "@/lib/alerts/subscriptions";
import { buildFeedNotes } from "@/lib/notes/feed-note";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [1007] GET /api/inspection/notes/mine — /notes 의 "내 노트" 탭(?tab=mine · ?mine=1) 자료.
 *
 * 왜: /notes 는 ?mine 분기와 세션(관심 지역 칩·세그먼트 표시) 때문에 force-dynamic 이었고,
 * 24h 실측 함수 호출 398회 중 사람 방문은 한 자릿수였다. 공개 피드는 ISR(5분)로 굳히고,
 * 세션이 갈랐던 내 노트 뷰는 여기서 받는다 — 응답은 페이지가 그리던 것과 **같은 카드 모양**
 * (FeedNote, lib/notes/feed-note — 단지 링크·관심 지역·상대시각·AI 상태는 서버만 만들 수 있다).
 * 정적 세그먼트 `mine` 은 `[id]` 보다 먼저 매치된다(노트 id 는 uuid 뿐이라 충돌도 없다).
 * 비로그인 401 — 클라이언트가 예전 서버 redirect 와 같은 목적지(/login?callbackUrl=)로 보낸다.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  /* "내 관심 지역" 필터의 판정 근거 — 지역 알림 구독. 조회 실패는 칩을 숨긴다(항상 빈 결과인
     필터를 남겨 두면 "노트가 없다"는 거짓말이 된다) */
  let interestRegions: string[] = [];
  try {
    interestRegions = (await listAlertSubscriptions(email))
      .filter((s) => s.type === "region")
      .map((s) => s.value);
  } catch {
    interestRegions = [];
  }
  /* 실패를 items: [] 로 내보내면 "작성한 노트가 없어요"가 그려진다 — 내 기록이 사라진 화면만큼
     사용자를 놀라게 하는 거짓말이 없다. 503 으로 말한다. */
  let rows: Awaited<ReturnType<typeof listNotes>>;
  try {
    rows = await listNotes(email);
  } catch (e) {
    return dbUnavailable("inspection-notes-mine", e);
  }
  const items = await buildFeedNotes(rows, { mine: true, interestRegions });
  return NextResponse.json(
    { items, interestRegions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
