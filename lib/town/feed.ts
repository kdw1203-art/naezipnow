/**
 * [967 · 19] 동네이야기 피드 조립 — 서버 전용.
 *
 * 원래 app/town/page.tsx 안에 있던 카드 변환(노트→카드·글→카드)과 병합을 여기로
 * 옮겼다. 이유는 하나다: 페이지(첫 장)와 /api/town/feed(다음 장)가 **같은 코드**로
 * 카드를 만들어야 "더 보기"로 붙는 카드가 첫 장과 한 글자도 다르지 않다.
 *
 * [1043] 피드는 이웃 글만 싣는다(공개 임장노트는 /notes) — 노트 스캔 창(seen · NOTE_SCAN_CAP)은 없어졌다.
 *   글(readTownPosts)은 원래 전량(상한 300)을 읽으므로 "더 보기"는 커서 필터만 한다.
 */
import {
  inspectionAverageScore,
  isLabNoteLabel,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { readTownPosts } from "@/lib/newui/board-posts";
import { listHiddenPostIds } from "@/lib/moderation/reports-store";
import { postAttachments } from "@/lib/community/attachments";
import { maskNoteAuthor } from "@/lib/town/shared";
import { isStoryPost } from "@/lib/town/story";
import type { FeedCard } from "@/app/town/feed-client";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";
import { loadPostAuthorBadges } from "@/lib/experts/badges";
import { noteCoverUrl, resolveNoteCover } from "@/lib/notes/cover/resolve";

/** 첫 장(서버 렌더) 카드 수 — 예전 listPublicNotes(40) 상한과 같은 수 */
export const TOWN_FEED_FIRST_PAGE = 40;
/** "더 보기" 한 번에 붙는 카드 수 */
export const TOWN_FEED_PAGE = 30;

export function noteToCard(n: InspectionNote): FeedCard {
  /* [1030 · G4] 카드 제목 = 노트 제목("관악푸르지오 +3.3억 대출 0원(Lab #36)" — 홈 공개 노트 목록과 같은 글자).
     예전엔 본문 첫 문장 40자("서울 관악구 봉천동 관악푸르지오(2004년 준공, 2,104세대, 임대 …")라 제목이 주소로 보였다. 제목이 비면 예전대로. */
  const oneLiner = n.title?.trim() || n.summary?.trim() || n.sections.pros?.trim() || "";
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
    /* [썸네일] 고른 썸네일 → 첫 사진 — 노트 목록(lib/notes/feed-note)과 같은 함수.
       [1015] 피드 카드 커버는 가로로 넓은 자리라 템플릿이면 넓은 판(1200×630) — 정사각 판을 잘라 쓰면 제목이 잘렸다 */
    cover: noteCoverUrl(n, "wide"),
    coverTemplate: resolveNoteCover(n).template,
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
  const photos = postAttachments(p);
  return {
    id: p.id,
    /* [1006] 이웃 글의 상세는 /town/story/[id] — 예전엔 뉴스와 같은 /town/news/[id] 로
       열려서 "사람 글"과 "기사"가 같은 화면·같은 주소를 썼다. 두 재질을 주소에서부터 가른다. */
    href: `/town/story/${p.id}`,
    kind: "post",
    /* [B31] 첨부 사진의 첫 장이 커버다. 예전엔 무조건 null 이라 사진 우선
       격자에서 이야기 글만 늘 그라디언트 상자였다 — 저장은 되는데 읽는 코드가
       한 줄도 없던 값이다(lib/community/attachments.ts 주석 참고). */
    cover: photos[0] ?? null,
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
    /* [1006] 이야기 카드의 주인공은 사람·대화다 — 댓글 수와 사진 장수를 실측대로 싣는다
       (0 이면 카드가 그 칸을 그리지 않는다). */
    comments: Math.max(0, Number(p.commentCount) || 0),
    photos: photos.length,
  };
}

type PostSlice = { cards: FeedCard[]; failed: boolean };

/* 실패는 잡되 삼키지 않는다 — 프리렌더(revalidate)에서 던지면 배포가 깨지고,
   빈 배열로 눌러 버리면 화면이 "글이 없다"고 거짓말한다. failed 로 들고 간다. */
async function loadPostCards(): Promise<PostSlice> {
  let posts: Post[];
  try {
    posts = await readTownPosts();
  } catch (e) {
    logger.error("[townFeed] 이웃 글 조회 실패", e);
    return { cards: [], failed: true };
  }
  // 신고 누적/처리로 숨김된 글(posts.visibility="hidden")은 피드에서 제외(#7)
  // [1006] 사람 글 판정은 isStoryPost(상세·동네 홈과 같은 규칙). "링크로만 공개"(link_only)한
  // 글은 동네 홈·사이트맵과 같이 목록에 싣지 않는다 — 작성자가 고른 공개 범위다.
  const communityPosts = posts.filter((p) => isStoryPost(p) && p.visibility !== "link_only");
  const hiddenIds = await listHiddenPostIds(communityPosts.map((p) => p.id)).catch(
    () => new Set<string>(),
  );
  const visible = communityPosts.filter((p) => !hiddenIds.has(p.id));
  /* [1047] 인증 전문가 마크 — 작성자 이메일은 서버 안에서만 읽는다(실패는 마크 없음) */
  const badges = await loadPostAuthorBadges(visible.map((p) => p.id));
  return {
    cards: visible.map((p) => ({ ...postToCard(p), authorBadge: badges.get(p.id) ?? null })),
    failed: false,
  };
}

/* [1043] 동네이야기 피드는 **이웃 글만** 싣는다(소유자 지시 2026-10-06: "임장노트는 분리 — 이미 임장노트에 공개노트가
   있으니 동네이야기에는 필요 없다. 동네이야기만 나오도록"). 공개 임장노트는 /notes 가 맡는다.
   예전엔 공개 노트(최신 40건) + 이웃 글을 한 피드로 섞었고, 노트 스캔 창(seen·NOTE_SCAN_CAP)이 "더 보기"에 필요했다.
   noteToCard 는 남겨 둔다(순수 변환기 — 동네 홈 등 다른 화면이 노트 카드를 그릴 때 같은 모양을 쓴다). */
function newestFirst(cards: FeedCard[]): FeedCard[] {
  return [...cards].sort((a, b) => b.createdAt - a.createdAt);
}

export type TownFeedSource = {
  /** 이웃 글 카드 — 최신순 */
  cards: FeedCard[];
  /** 조회가 **실패**했는가 — "없음"과 다르게 말하기 위한 플래그 */
  loadFailed: boolean;
};

/** 이웃 글(비자동, 숨김 제외) — 첫 장은 limit 장까지만 HTML 에 싣고 나머지는 "더 보기"가 잇는다. */
export async function loadTownFeed(): Promise<TownFeedSource> {
  const posts = await loadPostCards();
  return { cards: newestFirst(posts.cards), loadFailed: posts.failed };
}

export type TownFeedPage = {
  items: FeedCard[];
  hasMore: boolean;
  loadFailed: boolean;
};

/** "더 보기" 한 장 — `before`(epoch ms) 보다 오래된 이웃 글을 최신순으로 limit 개. */
export async function pageTownFeed(opts: { before: number; limit: number }): Promise<TownFeedPage> {
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit)));
  const posts = await loadPostCards();
  const older = newestFirst(posts.cards).filter((c) => c.createdAt > 0 && c.createdAt < opts.before);
  return { items: older.slice(0, limit), hasMore: older.length > limit, loadFailed: posts.failed };
}
