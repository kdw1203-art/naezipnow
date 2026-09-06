/**
 * [967 · 19] 동네이야기 피드 조립 — 서버 전용.
 *
 * 원래 app/town/page.tsx 안에 있던 카드 변환(노트→카드·글→카드)과 병합을 여기로
 * 옮겼다. 이유는 하나다: 페이지(첫 장)와 /api/town/feed(다음 장)가 **같은 코드**로
 * 카드를 만들어야 "더 보기"로 붙는 카드가 첫 장과 한 글자도 다르지 않다.
 *
 * 노트 커서 페이지네이션에 대해:
 *   lib/inspection/store-db 의 listPublicNotes(limit) 는 "최신 N건"만 준다(before
 *   커서가 없다). 그 파일은 이 릴리스에서 다른 작업자가 손대고 있어 여기서는
 *   건드리지 않는다. 대신 클라이언트가 **이미 받은 카드 수(seen)** 를 함께 보내면
 *   listPublicNotes(seen + limit) 로 창을 넓혀 읽고 커서보다 오래된 것만 남긴다 —
 *   받은 카드 중 노트는 seen 개를 넘을 수 없으니, 창 안에 다음 limit 개의 오래된
 *   노트가 있으면 반드시 들어온다. 창이 가득 찼는데도 오래된 노트가 모자라면
 *   창을 두 배로 넓혀 다시 읽는다(상한 NOTE_SCAN_CAP). 글(readTownPosts)은 원래
 *   전량(상한 300)을 읽으므로 커서 필터만 한다.
 */
import {
  listPublicNotes,
  inspectionAverageScore,
  isLabNoteLabel,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { readTownPosts } from "@/lib/newui/board-posts";
import { listHiddenPostIds } from "@/lib/moderation/reports-store";
import { postAttachments } from "@/lib/community/attachments";
import { maskNoteAuthor } from "@/app/town/shared";
import type { FeedCard } from "@/app/town/feed-client";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";

/** 첫 장(서버 렌더) 카드 수 — 예전 listPublicNotes(40) 상한과 같은 수 */
export const TOWN_FEED_FIRST_PAGE = 40;
/** "더 보기" 한 번에 붙는 카드 수 */
export const TOWN_FEED_PAGE = 30;
/** 노트 스캔 창 상한 — 행마다 jsonb 다섯 개가 실리므로 무한정 넓히지 않는다 */
const NOTE_SCAN_CAP = 400;

export function noteToCard(n: InspectionNote): FeedCard {
  const oneLiner = n.summary?.trim() || n.sections.pros?.trim() || n.title;
  const lab = isLabNoteLabel(n.authorLabel);
  const tags: string[] = [];
  if (n.aptName?.trim()) tags.push(n.aptName.trim());
  /* [959] Lab 노트는 현장 방문이 아니라 데이터 카드 — "직접방문" 태그를 달지 않는다 */
  if (n.visitDate && !lab) tags.push("직접방문");
  if (lab) tags.push("데이터 분석");
  if (n.metadata?.visitVerified) tags.push("현장 인증"); // [#71]
  // 허수 제거(#9): 예전의 "저장수 = 평균 평점×40 + 체크 수" 계산식을 없앴다.
  // 노트에는 실측 저장 지표가 없으므로 saves 미표시, 실데이터인 평균 평점만 노출.
  const rating = inspectionAverageScore(n.scores);
  return {
    id: n.id,
    href: `/notes/${n.id}`,
    kind: "note",
    cover: n.photos.find(Boolean) ?? null,
    title: oneLiner.length > 40 ? `${oneLiner.slice(0, 40)}…` : oneLiner,
    author: maskNoteAuthor(n.authorLabel, n.authorEmail),
    region: n.region || "전국",
    rating: rating > 0 ? rating : null,
    tags,
    visited: Boolean(n.visitDate) && !lab,
    createdAt: Date.parse(n.createdAt) || 0,
    isExample: false,
    lab,
    aptName: n.aptName?.trim() || null,
  };
}

export function postToCard(p: Post): FeedCard {
  const region = p.city && p.district ? `${p.city} ${p.district}` : p.city || "전국";
  return {
    id: p.id,
    href: `/town/news/${p.id}`,
    kind: "post",
    /* [B31] 첨부 사진의 첫 장이 커버다. 예전엔 무조건 null 이라 사진 우선
       격자에서 이야기 글만 늘 그라디언트 상자였다 — 저장은 되는데 읽는 코드가
       한 줄도 없던 값이다(lib/community/attachments.ts 주석 참고). */
    cover: postAttachments(p)[0] ?? null,
    title: p.title,
    author: p.authorLabel || "이웃",
    region,
    /* 저장(북마크)만 — 좋아요로 채워 저장 지표를 부풀리지 않는다 */
    saves: typeof p.bookmarkCount === "number" ? p.bookmarkCount : undefined,
    tags: p.tags ?? [],
    visited: false,
    createdAt: Date.parse(p.createdAt) || 0,
    isExample: false,
    /* 포인트 추천글 부스트 — 만료(과거)면 자연 소멸이라 false */
    boosted: Boolean(p.boostUntil && Date.parse(p.boostUntil) > Date.now()),
  };
}

type NoteSlice = { cards: FeedCard[]; failed: boolean; full: boolean };
type PostSlice = { cards: FeedCard[]; failed: boolean };

/* 실패는 잡되 삼키지 않는다 — 프리렌더(revalidate)에서 던지면 배포가 깨지고,
   빈 배열로 눌러 버리면 화면이 "글이 없다"고 거짓말한다. failed 로 들고 간다. */
async function loadNoteCards(limit: number): Promise<NoteSlice> {
  const capped = Math.max(1, Math.min(NOTE_SCAN_CAP, Math.floor(limit)));
  try {
    const notes: InspectionNote[] = await listPublicNotes(capped);
    return { cards: notes.map(noteToCard), failed: false, full: notes.length >= capped };
  } catch (e) {
    logger.error("[townFeed] 임장노트 조회 실패", e);
    return { cards: [], failed: true, full: false };
  }
}

async function loadPostCards(): Promise<PostSlice> {
  let posts: Post[];
  try {
    posts = await readTownPosts();
  } catch (e) {
    logger.error("[townFeed] 이웃 글 조회 실패", e);
    return { cards: [], failed: true };
  }
  // 신고 누적/처리로 숨김된 글(posts.visibility="hidden")은 피드에서 제외(#7)
  const communityPosts = posts.filter((p) => !p.isAutomated);
  const hiddenIds = await listHiddenPostIds(communityPosts.map((p) => p.id)).catch(
    () => new Set<string>(),
  );
  return {
    cards: communityPosts.filter((p) => !hiddenIds.has(p.id)).map(postToCard),
    failed: false,
  };
}

/** 노트·글을 섞어 최신순 — 클라이언트가 추천/최신/유형별로 다시 세운다 */
function mergeCards(notes: FeedCard[], posts: FeedCard[]): FeedCard[] {
  return [...notes, ...posts].sort((a, b) => b.createdAt - a.createdAt);
}

export type TownFeedSource = {
  /** 노트·글을 섞어 최신순으로 정렬한 전체 카드 */
  cards: FeedCard[];
  /** 한쪽이라도 조회가 **실패**했는가 — "없음"과 다르게 말하기 위한 플래그 */
  loadFailed: boolean;
  /** 노트 창(noteLimit)이 가득 찼는가 = 더 오래된 노트가 남아 있을 수 있다 */
  notesMaybeMore: boolean;
};

/** 공개 노트(최신 noteLimit 건) + 커뮤니티 글(비자동, 숨김 제외)을 한 피드로. */
export async function loadTownFeed(noteLimit: number): Promise<TownFeedSource> {
  const [notes, posts] = await Promise.all([loadNoteCards(noteLimit), loadPostCards()]);
  return {
    cards: mergeCards(notes.cards, posts.cards),
    loadFailed: notes.failed || posts.failed,
    notesMaybeMore: notes.full,
  };
}

export type TownFeedPage = {
  items: FeedCard[];
  hasMore: boolean;
  loadFailed: boolean;
};

/**
 * "더 보기" 한 장 — `before`(epoch ms) 보다 오래된 카드를 최신순으로 limit 개.
 * seen = 클라이언트가 이미 들고 있는 카드 수(노트 스캔 창 계산용, 위 헤더 참고).
 */
export async function pageTownFeed(opts: {
  before: number;
  limit: number;
  seen: number;
}): Promise<TownFeedPage> {
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit)));
  const seen = Math.max(0, Math.floor(opts.seen));
  const isOlder = (c: FeedCard) => c.createdAt > 0 && c.createdAt < opts.before;

  const postsP = loadPostCards();
  let window = Math.min(NOTE_SCAN_CAP, seen + limit);
  let notes = await loadNoteCards(window);
  /* 창이 가득 찼는데 커서보다 오래된 노트가 limit 개를 못 채우면 창을 넓힌다 —
     그러지 않으면 0건이 돌아오면서 "더 있다"고 답하는 제자리걸음이 생긴다. */
  while (notes.full && notes.cards.filter(isOlder).length <= limit && window < NOTE_SCAN_CAP) {
    window = Math.min(NOTE_SCAN_CAP, window * 2);
    notes = await loadNoteCards(window);
  }
  const posts = await postsP;

  const older = mergeCards(notes.cards, posts.cards).filter(isOlder);
  /* 창 상한(NOTE_SCAN_CAP)까지 갔는데도 모자라면 거기서 끝이라고 말한다 —
     그 너머는 listPublicNotes 로는 못 읽는다(커서 조회가 생기면 풀린다). */
  return {
    items: older.slice(0, limit),
    hasMore: older.length > limit,
    loadFailed: notes.failed || posts.failed,
  };
}
