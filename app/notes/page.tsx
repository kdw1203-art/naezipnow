import { redirect } from "next/navigation";
import { listNotes, listPublicNotesPage } from "@/lib/inspection/store-db";
import { listPublicNotesWithFallback } from "@/lib/inspection/public-notes-cached";
import { safeAuth } from "@/lib/safe-auth";
import { listAlertSubscriptions } from "@/lib/alerts/subscriptions";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";
import { buildFeedNotes } from "@/lib/notes/feed-note";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes
   ?mine=1 — 세션 사용자의 노트(비공개 포함)를 서버에서 조회하는 내 노트 뷰.
   searchParams 분기 때문에 이 라우트는 동적 렌더(기존 revalidate=120 ISR 제거).
   [967 · 19] 카드 빌더(toFeedNote·상대시각·태그·관심 지역 대조)는 lib/notes/feed-note 로
   올렸다 — "더 보기" API 가 같은 카드를 만들어야 해서다.
   [967 · 20] ?tab=mine 도 내 노트 뷰다 — 세그먼트가 URL 에 남기는 값. mine=1 은 /my 가
   보내는 기존 진입로라 그대로 둔다. */

export const metadata = buildPageMetadata({
  title: "임장노트",
  description:
    "직접 다녀온 사람이 남긴 공개 임장노트. 단지별 항목 점수와 현장 메모를 모아 봅니다.",
  path: "/notes",
  og: { badge: "임장노트", sub: "직접 걸어본 사람들의 공개 기록" },
});

export const dynamic = "force-dynamic";

/** [967 · 19] 첫 페이지 크기 — "더 보기" 가 같은 크기로 이어 받는다 */
const FIRST_PAGE = 30;

export default async function NotesFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mine = sp.mine === "1" || sp.tab === "mine";

  /* "내 관심 지역" 필터의 판정 근거 — 지역 알림 구독(user_watchlist 의 alert:region 행).
     구독 지역이 하나도 없으면(비로그인 포함) 그 칩은 무엇을 눌러도 0건이므로
     아예 렌더하지 않는다. 항상 빈 결과인 필터를 남겨 두면 "노트가 없다"는 거짓말이 된다. */
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  let interestRegions: string[] = [];
  if (email) {
    try {
      interestRegions = (await listAlertSubscriptions(email))
        .filter((s) => s.type === "region")
        .map((s) => s.value);
    } catch (e) {
      // 구독 조회 실패 — 칩을 숨겨 "관심 지역에 노트가 없다"고 단정하지 않는다
      console.error("[/notes] 관심 지역 구독 조회 실패:", e);
      interestRegions = [];
    }
  }

  // 내 노트 뷰 — 세션 사용자의 노트(비공개 포함)를 동적 조회. 목업 보강 없음.
  if (mine) {
    if (!email) {
      redirect(`/login?callbackUrl=${encodeURIComponent("/notes?tab=mine")}`);
    }
    let notes: FeedNote[] = [];
    let mineError: string | null = null;
    try {
      const rows = await listNotes(email);
      /* 동시 상한 + 마감이 있는 일괄 해석 — 항목마다 동시 DB 왕복을 내던
         N+1 을 접는다(/qna 와 같은 판단, resolveComplexHrefs 주석 참고). */
      notes = await buildFeedNotes(rows, { mine: true, interestRegions });
    } catch (e) {
      /* 빈 배열로 삼키면 "아직 쓴 노트가 없어요"가 뜬다 — 내가 쓴 기록이
         사라진 것처럼 보이는 화면이다. 공개 피드와 같은 방식으로 실패를 적는다. */
      mineError = e instanceof Error ? e.message : String(e);
      console.error("[/notes?mine=1] 내 임장노트 조회 실패:", mineError);
    }
    return (
      /* [967 · 20] key — 세그먼트 전환 때 클라이언트 상태(필터·더 보기 누적)를 새로 시작 */
      <NotesFeedClient
        key="mine"
        notes={notes}
        loadError={mineError}
        mine
        loggedIn
        showInterestFilter={interestRegions.length > 0}
      />
    );
  }

  let notes: FeedNote[] = [];
  let loadError: string | null = null;
  /* [967 · 19] 첫 페이지가 FIRST_PAGE 보다 짧으면 더 볼 것이 없다 — 버튼을 아예 안 그린다 */
  let hasMore = false;
  try {
    /* [945 · 실사용50 #35] 비로그인 공개 피드는 내용이 모두에게 같다 —
       카페 글 스파이크가 이 목록 조회를 방문마다 DB 에 꽂지 않도록 60초 데이터
       캐시로 묶는다(페이지는 auth 분기 때문에 동적 유지). 로그인 사용자의
       "내 노트" 경로(위)는 개인 데이터라 그대로 실조회다.
       [967 · 19] 캐시는 **첫 페이지만** — 이후 페이지는 /api/inspection/notes?public=1
       이 커서로 실조회한다(커서마다 키를 만들면 캐시가 아니라 누수다). */
    const { unstable_cache } = await import("next/cache");
    /* [967 · 29a] DB 가 밀리는 시간대의 TimeoutError 는 마지막 정상본(24시간 안)으로 받는다.
       stale 표시는 NotesFeedClient 가 다른 항목(19·20)으로 바뀌는 중이라 prop 을 늘리지
       않고 로그로만 남긴다 — 화면 문구는 다음 릴리스에서 잇는다. */
    const { notes: rows, stale, fetchedAt } = await unstable_cache(
      () => listPublicNotesWithFallback(FIRST_PAGE, (n) => listPublicNotesPage({ limit: n })),
      ["notes-public-feed-v2"],
      { revalidate: 60 },
    )();
    if (stale) console.warn(`[/notes] 공개 피드 — ${fetchedAt} 정상본으로 대체(잠시 전 목록)`);
    hasMore = rows.length >= FIRST_PAGE;
    // 아파트명(+지역)으로 complexes 실 id 조회 — 중복 접기 + 동시 4개 + 3초 마감
    notes = await buildFeedNotes(rows, { interestRegions });
  } catch (e) {
    /* 조회 실패를 빈 배열로 삼키면 아래 목업 보강이 작동해 "아직 공개된 노트가
       없어 샘플을 보여드려요" 가 뜬다 — DB 장애를 "노트가 없음" 으로 바꿔
       말하는 셈이다. 실패는 실패라고 화면에 적고, 목업도 붙이지 않는다. */
    loadError = e instanceof Error ? e.message : String(e);
    console.error("[/notes] 공개 임장노트 조회 실패:", loadError);
  }
  /* 콜드스타트: 공작아파트 예시 카드를 넣지 않는다.
     0건이면 NotesFeedClient 의 empty+CTA(노트 쓰기 / 지도)로 정직하게 안내한다. */

  return (
    <NotesFeedClient
      key="public"
      notes={notes}
      loadError={loadError}
      loggedIn={Boolean(email)}
      hasMore={hasMore}
      pageSize={FIRST_PAGE}
      showInterestFilter={interestRegions.length > 0}
    />
  );
}
