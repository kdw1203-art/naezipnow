import { unstable_cache } from "next/cache";
import { listPublicNotesPage } from "@/lib/inspection/store-db";
import { listPublicNotesWithFallback } from "@/lib/inspection/public-notes-cached";
import { NotesFeedClient, type FeedNote } from "./notes-feed-client";
import { buildFeedNotes } from "@/lib/notes/feed-note";
import { listBestNoteMonths } from "@/lib/inspection/best-notes";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { PUBLIC_NOTES_LIST_TAG } from "@/lib/inspection/note-cache-tags";

/* 시안 7a — 공개 임장노트 피드. 실데이터: inspection_notes(is_public) → listPublicNotes
   [967 · 19] 카드 빌더(toFeedNote·상대시각·태그·관심 지역 대조)는 lib/notes/feed-note 로
   올렸다 — "더 보기" API 가 같은 카드를 만들어야 해서다.
   [967 · 20] ?tab=mine 도 내 노트 뷰다 — 세그먼트가 URL 에 남기는 값. mine=1 은 /my 가
   보내는 기존 진입로라 그대로 둔다.

   [1007] **ISR 5분**으로 전환. 예전엔 ?mine/?tab 분기와 세션(관심 지역 칩·세그먼트 표시)을
   서버에서 읽어 force-dynamic 이었고, 24h 실측 함수 호출 398회 중 사람 방문은 한 자릿수였다.
   서버는 공개 첫 페이지(모두에게 같은 값)만 그린다. 로그인 여부·내 노트 탭·관심 지역 칩은
   NotesFeedClient 가 마운트 뒤 판정한다(세션 프로브 → ?tab=mine 이면 /api/inspection/notes/mine,
   관심 지역은 /api/me/alerts). 서버 렌더에 사용자별 값은 없다 — CDN 한 벌을 모두에게 줘도
   새는 것이 없다. 60초 데이터 캐시는 페이지 눈금(300)과 맞췄다. */

export const metadata = buildPageMetadata({
  title: "임장노트",
  description:
    "직접 다녀온 사람이 남긴 공개 임장노트. 단지별 항목 점수와 현장 메모를 모아 봅니다.",
  path: "/notes",
  og: { badge: "임장노트", sub: "직접 걸어본 사람들의 공개 기록" },
});

/* [1010] 300초 → 1일. 공개 노트가 바뀌는 **모든** 지점이 이미 revalidatePath("/notes") 를
   부르고(생성·공개 전환·삭제), 이번에 수정·지역 변경까지 invalidatePublicNoteRoutes() 로 묶었다.
   같은 판에서 이 페이지의 데이터 캐시(notes-public-feed-v2)도 1일 + public-notes 태그로 올렸다 —
   그 캐시가 300초인 동안에는 세그먼트 값을 올려도 실제 TTL 이 300초로 눌렸다. */
export const revalidate = 86_400;

/** [967 · 19] 첫 페이지 크기 — "더 보기" 가 같은 크기로 이어 받는다 */
const FIRST_PAGE = 30;

/* [945 · 실사용50 #35] 공개 피드 첫 페이지는 내용이 모두에게 같다 — [1007] 페이지가 ISR 이라
   이 캐시는 재생성 렌더 사이의 두 번째 방어선이다(눈금 300 = revalidate).
   [967 · 19] 캐시는 **첫 페이지만** — 이후 페이지는 /api/inspection/notes?public=1 이 커서로
   실조회한다(커서마다 키를 만들면 캐시가 아니라 누수다).
   [967 · 29a] DB 가 밀리는 시간대의 TimeoutError 는 마지막 정상본(24시간 안)으로 받는다. */
/* [1010] 300초 → 1일 + 태그(public-notes). 태그가 없으면 시간만이 신선도를 맡는데,
   이 캐시의 revalidate 는 **라우트 revalidate 를 끌어내린다**(Next 는 둘 중 작은 값) —
   즉 페이지 TTL 을 1일로 올려도 여기가 300초면 실제 TTL 은 300초다.
   public-notes 태그는 공개 노트가 바뀌는 **모든** 지점이 이미 비우고 있다
   (invalidateNoteCache: 생성·수정·공개 전환·삭제·신고 숨김·탈퇴 비공개·세션 동기화). */
const loadPublicFirstPage = unstable_cache(
  () => listPublicNotesWithFallback(FIRST_PAGE, (n) => listPublicNotesPage({ limit: n })),
  ["notes-public-feed-v2"],
  { revalidate: 86_400, tags: [PUBLIC_NOTES_LIST_TAG] },
);

/* [970 · B-25] 헤더의 /notes/best 링크는 뽑힌 달이 있을 때만. 공개 노트 전량(≤500행)을 읽는
   계산이라 /notes/best 와 같은 30분 캐시. */
/* [1010] 1800초 → 1일 + 태그(public-notes) — 위와 같은 이유. 원천이 공개 노트 전량이라
   공개 노트가 바뀔 때만 답이 바뀐다. */
const loadHasBestMonth = unstable_cache(
  async () => (await listBestNoteMonths()).length > 0,
  ["notes-best-has-month-v1"],
  { revalidate: 86_400, tags: [PUBLIC_NOTES_LIST_TAG] },
);

export default async function NotesFeedPage() {
  let notes: FeedNote[] = [];
  let loadError: string | null = null;
  /* [967 · 19] 첫 페이지가 FIRST_PAGE 보다 짧으면 더 볼 것이 없다 — 버튼을 아예 안 그린다 */
  let hasMore = false;
  try {
    const { notes: rows, stale, fetchedAt } = await loadPublicFirstPage();
    if (stale) console.warn(`[/notes] 공개 피드 — ${fetchedAt} 정상본으로 대체(잠시 전 목록)`);
    hasMore = rows.length >= FIRST_PAGE;
    /* 아파트명(+지역)으로 complexes 실 id 조회 — 중복 접기 + 동시 4개 + 3초 마감.
       관심 지역 대조는 클라이언트가 세션 판정 뒤 다시 한다(interestRegions 는 사용자별 값) */
    notes = await buildFeedNotes(rows, { interestRegions: [] });
  } catch (e) {
    /* 조회 실패를 빈 배열로 삼키면 "아직 공개된 노트가 없어요" 가 뜬다 — DB 장애를
       "노트가 없음" 으로 바꿔 말하는 셈이다. 실패는 실패라고 화면에 적고, 목업도 붙이지 않는다. */
    loadError = e instanceof Error ? e.message : String(e);
    console.error("[/notes] 공개 임장노트 조회 실패:", loadError);
  }
  /* 콜드스타트: 공작아파트 예시 카드를 넣지 않는다.
     0건이면 NotesFeedClient 의 empty+CTA(노트 쓰기 / 지도)로 정직하게 안내한다. */

  /* 3초 안에 안 오면 "모름"(= 링크 숨김) — 캐시 함수 밖에서 끊어야 타임아웃이 30분 동안 "없음"으로 굳지 않는다 */
  const hasBestMonth = await (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 3000);
    });
    try {
      return await Promise.race<boolean>([loadHasBestMonth(), timeout]);
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  return (
    <NotesFeedClient
      notes={notes}
      loadError={loadError}
      hasMore={hasMore}
      pageSize={FIRST_PAGE}
      hasBestMonth={hasBestMonth}
    />
  );
}
