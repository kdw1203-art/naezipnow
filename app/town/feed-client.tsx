"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getHomePersonal } from "@/lib/client/home-personal";
import Link from "next/link";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import { CoverImage } from "@/app/components/CoverImage";
import { useScrollRestore } from "@/lib/client/use-scroll-restore";
import {
  parseTownFeedFilters,
  townFeedFilterQuery,
  type TownFeedFilters,
} from "@/lib/town/feed-filters";
import { feedRegionLabel, regionMatches, townFeedRegionById, townRegionChips, type TownFeedRegionId, feedDisplayTitle, feedAuthorLabel } from "@/lib/town/feed-regions";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* 동네이야기 통합 피드 — 공개 임장노트 + 이웃 글(사람의 기록)을 한 목록으로.
   서버에서 카드 배열을 만들어 내려주고, 여기선 필터·정렬·"더 보기"만 클라이언트로 처리.
   [1006] 이 피드는 **사람의 기록**만 싣는다(kind: note | post). 자동수집 뉴스는 여기
   들어오지 않는다 — 뉴스는 /town/news(뉴스룸)이고, /town 은 "오늘 뉴스" 한 행으로
   그쪽을 가리킬 뿐이다.

   [v4] "한 화면 한 가지" — 매소너리 사진 카드(Lab 데이터 배지·#태그·지역 알약·NEW·그림자) 2열을
   **1px 구분선 행 한 줄 목록**으로 바꿨다. 행 = 왼쪽 72px 정사각 썸네일(사진이 없으면 --divider 단면) +
   오른쪽 제목 2줄 + 메타 한 줄("서울 동대문구 · 작성자 · 1일 전 · ★3.2" — 있는 값만).
   지역 줄은 동네 홈 링크 칩 → 피드를 거르는 필터 칩(lib/town/feed-regions), 유형은 밑줄 탭,
   정렬은 오른쪽 작은 글자 토글. "N개 표시 중"·추천 기준 문장·노트 구성 문장은 화면에서 뺐다
   (추천 기준은 정렬 버튼의 title 로 남긴다). */

export type FeedCard = {
  id: string;
  href: string;
  kind: "note" | "post";
  /** 실제 사진 URL — 없으면 썸네일 자리는 --divider 단면 */
  cover: string | null;
  title: string;
  author: string;
  region: string;
  /** 실측 저장(북마크) 수 — 지표가 없으면 undefined 로 두고 표시하지 않는다 */
  saves?: number;
  /** 임장노트 평균 평점(1~5) — 실데이터. 없으면 미표시 */
  rating?: number | null;
  tags: string[];
  visited: boolean;
  createdAt: number;
  isExample: boolean;
  /** 포인트 추천글 부스트 활성 — 정렬 우선 + 메타 줄 맨 앞 "추천글" */
  boosted?: boolean;
  /** [959] 내집나우 Lab(데이터 분석 카드) 노트 */
  lab?: boolean;
  /** 사진 없는 커버에 크게 적을 이름(단지명 등) */
  aptName?: string | null;
  /** [1006] 이야기(이웃 글) 카드 — 실측 댓글 수. 노트 카드에는 없다. */
  comments?: number;
  /** [1006] 이야기 카드 — 첨부 사진 장수 */
  photos?: number;
};

/* [B19] 유형(무엇을 보나)과 정렬(어떤 순서로 보나)은 서로 다른 축이다 — 한 줄에 섞으면
   "임장노트를 최신순으로" 가 표현 불가능하다. [v4] 유형 = 밑줄 탭, 정렬 = 같은 줄 오른쪽 글자 토글. */
const KINDS = [
  { id: "all", label: "전체" },
  { id: "note", label: "임장노트" },
  { id: "post", label: "이야기" },
] as const;
type KindId = (typeof KINDS)[number]["id"];

const SORTS = [
  { id: "reco", label: "추천순" },
  { id: "latest", label: "최신순" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

/* [1012] 시각은 서버·클라이언트의 now 가 달라 문구가 어긋날 수 있어
   suppressHydrationWarning 으로 한 번만 다시 그린다. */
function CardTime({ at }: { at: number }) {
  if (!Number.isFinite(at) || at <= 0) return null;
  return (
    <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>
      {relativeTimeLabel(at, Date.now(), { fallback: "md-ko" })}
    </time>
  );
}

/* [v4] 목록 행 — 썸네일 72px + 제목 2줄 + 메타 한 줄. 메타 왼쪽(동네 · 작성자)은 말줄임으로 줄어들고,
   오른쪽(시각 · 평점/댓글/저장)은 줄지 않는다 — 긴 작성자 이름이 숫자를 밀어내지 않게. */
function FeedRow({ card, priority }: { card: FeedCard; priority: boolean }) {
  const who = [feedRegionLabel(card.region), feedAuthorLabel(card.author)].filter(Boolean).join(" · ");
  const tail: ReactNode[] = [];
  if (Number.isFinite(card.createdAt) && card.createdAt > 0) tail.push(<CardTime key="t" at={card.createdAt} />);
  if (typeof card.rating === "number" && card.rating > 0) tail.push(`★${card.rating.toFixed(1)}`);
  if (card.kind === "post" && (card.comments ?? 0) > 0) tail.push(`댓글 ${card.comments}`);
  if (typeof card.saves === "number" && card.saves > 0) tail.push(`저장 ${card.saves}`);
  return (
    <li>
      <Link href={card.href} className="flex items-start gap-3 py-3 no-underline">
        <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">
          {card.cover && (
            <CoverImage
              src={card.cover}
              alt=""
              sizes="72px"
              priority={priority}
              imgClassName="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="clamp-2 t-section text-ink">{feedDisplayTitle(card.title, card.region, { lab: card.lab })}</span>
          <span className="flex min-w-0 items-baseline t-sub text-text-3">
            {/* 포인트로 올린 글은 정렬과 무관하게 맨 앞이다 — 그 이유를 한 단어로 밝힌다 */}
            {card.boosted && <span className="mr-1 shrink-0 font-bold text-text-2">추천글</span>}
            {who && <span className="min-w-0 truncate">{who}</span>}
            {tail.length > 0 && (
              <span className="shrink-0 whitespace-pre">
                {tail.map((t, i) => (
                  <span key={i}>
                    {i > 0 || who ? " · " : ""}
                    {t}
                  </span>
                ))}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** /api/home/personal 응답 → 관심지역 목록(대표 지역 먼저, 중복·빈 값 제거) */
function myRegionsOf(p: { primaryRegion: string | null; regions: string[] | null } | null): string[] {
  if (!p) return [];
  return [...new Set([p.primaryRegion, ...(p.regions ?? [])].map((r) => String(r ?? "").trim()).filter(Boolean))];
}
type HomePersonal = { primaryRegion: string | null; regions: string[] | null };

/**
 * [v4] 머리 오른쪽 작은 아웃라인 "글쓰기" — 쓸 수 있는 것이 두 가지(동네이야기 · 임장노트)라
 * 큰 버튼 두 개 대신 작은 메뉴 하나로 연다. 채움 파랑은 쓰지 않는다(모바일은 탭바 ＋ 가 노트 쓰기).
 * [B22] 관심지역이 있으면 동네이야기 쓰기가 그 동네로 미리 채워 열린다(예전 "{동네}에 글쓰기 ›").
 */
export function TownWriteMenu() {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const [myRegion, setMyRegion] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    getHomePersonal<HomePersonal>()
      .then((p) => {
        if (!dead) setMyRegion(myRegionsOf(p)[0] ?? null);
      })
      .catch(() => {
        /* 개인화 실패 — 지역 없이 쓰기 화면으로 */
      });
    /* 네이티브 <details> 는 바깥을 눌러도·Esc 로도 닫히지 않는다 — 메뉴답게 닫는다 */
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      dead = true;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const storyHref = myRegion ? `/town/write?region=${encodeURIComponent(myRegion)}` : "/town/write";
  return (
    <details ref={ref} className="relative shrink-0">
      <summary className="btn-outline btn-sm cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        글쓰기
      </summary>
      <div className="dropdown-panel absolute right-0 top-full z-30 mt-1.5 flex w-48 flex-col rounded-lg border border-line bg-surface p-1.5 shadow-md">
        <Link href={storyHref} className="rounded-sm px-3 py-2.5 t-body font-bold text-ink no-underline hover:bg-bg">
          동네이야기 쓰기
          {myRegion && <span className="ml-1 t-sub font-normal text-text-3">{myRegion}</span>}
        </Link>
        <Link href="/notes/new" className="rounded-sm px-3 py-2.5 t-body font-bold text-ink no-underline hover:bg-bg">
          임장노트 쓰기
        </Link>
      </div>
    </details>
  );
}

/**
 * 추천 정렬 점수 — 실데이터(최신성 + 노트 평점 + 글 저장수)만 사용한다.
 * 예전의 "계산식 저장수(평점×40)" 허수를 없애고, 평점 1점 = 신선도 6시간,
 * 저장 1건 = 1시간(최대 20건)만큼 가산해 최신순을 보정한다.
 */
function recommendScore(c: FeedCard): number {
  const ratingBoost = (c.rating ?? 0) * 6 * 3_600_000;
  const savesBoost = Math.min(c.saves ?? 0, 20) * 3_600_000;
  return c.createdAt + ratingBoost + savesBoost;
}

/* [967 · 19] "더 보기"로 받은 다음 장은 sessionStorage 에 잠깐 남긴다 — 상세로 갔다
   뒤로 오면 서버는 첫 장(40장)만 다시 그리므로, 이게 없으면 스크롤 복원이 목록
   길이보다 아래를 가리켜 실패한다. 30분 지나면 버린다(오래된 목록을 붙이지 않기). */
const MORE_CACHE_KEY = "nz_town_feed_more";
const MORE_CACHE_TTL_MS = 30 * 60_000;
const PAGE_SIZE = 30;

/** 첫 장의 가장 오래된 카드 시각 — 다음 장이 "어디서부터"인지의 경계 */
function oldestOf(cards: FeedCard[]): number {
  const stamps = cards.map((c) => c.createdAt).filter((t) => t > 0);
  return stamps.length > 0 ? Math.min(...stamps) : 0;
}

function readMoreCache(firstOldest: number): { extra: FeedCard[]; more: boolean } | null {
  try {
    const raw = window.sessionStorage.getItem(MORE_CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { extra?: FeedCard[]; more?: boolean; at?: number; firstOldest?: number };
    if (!Array.isArray(v.extra) || typeof v.at !== "number") return null;
    if (Date.now() - v.at > MORE_CACHE_TTL_MS) return null;
    /* 첫 장의 경계가 그때와 다르면(새 글이 들어와 첫 장이 밀렸다) 붙이지 않는다 —
       경계와 캐시 사이에 못 본 카드가 끼어 빈틈이 생긴다. */
    if (v.firstOldest !== firstOldest) return null;
    return { extra: v.extra, more: Boolean(v.more) };
  } catch {
    return null;
  }
}

function writeMoreCache(extra: FeedCard[], more: boolean, firstOldest: number) {
  try {
    if (extra.length === 0) window.sessionStorage.removeItem(MORE_CACHE_KEY);
    else {
      window.sessionStorage.setItem(
        MORE_CACHE_KEY,
        JSON.stringify({ extra, more, at: Date.now(), firstOldest }),
      );
    }
  } catch {
    /* 저장소 차단(프라이빗 모드) — 뒤로가기 때 첫 장만 보일 뿐 */
  }
}

/* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 */
function chipClass(active: boolean): string {
  return `chip px-3 py-1.5 t-sub font-bold ${active ? "chip-active border" : "border border-line bg-surface text-text-2"}`;
}

export function TownFeed({
  cards,
  hasMore = false,
  loadFailed = false,
}: {
  cards: FeedCard[];
  /** [967 · 19] 서버가 준 첫 장 너머에 카드가 더 있는가 — "더 보기" 버튼의 첫 상태 */
  hasMore?: boolean;
  /**
   * 피드 소스 조회가 **실패**했는가. 빈 목록이 "아직 없음"인지 "못 불러옴"인지는
   * 목록만 봐서는 구분이 안 된다 — 둘을 다르게 말하려면 이 플래그가 필요하다.
   */
  loadFailed?: boolean;
}) {
  const [kind, setKind] = useState<KindId>("all");
  const [sort, setSort] = useState<SortId>("reco");
  /* 내 관심지역 — 로그인 사용자만. 홈에서 정한 지역이 여기서 초기화되던 문제(B21).
     null = 아직 모름 / [] = 설정 안 함 → 칩을 그리지 않는다. */
  const [myRegions, setMyRegions] = useState<string[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  /* [v4] 지역 칩(옛 "우리 동네 홈" 링크 줄) — 없으면 전체 */
  const [region, setRegion] = useState<TownFeedRegionId | null>(null);

  /* [967 · 21] 필터 ↔ URL 동기화(?kind=&sort=&mine=1&region=) — 새로고침·공유해도 같은 목록.
     이 페이지는 revalidate(ISR) 라 useSearchParams 를 쓰면 프리렌더 HTML 에서 피드
     서브트리가 Suspense 폴백으로 비어 나간다(/town/news 에서 실측한 교훈,
     NewsListClient 주석). 그래서 마운트 후 location.search 를 한 번 읽고, 이후엔
     history.replaceState 로 쓴다(서버 왕복 없음 — search-client 와 같은 방식).
     첫 렌더는 URL 과 무관하게 기본값이라 SSR HTML 과 하이드레이션이 일치한다. */
  const [urlRead, setUrlRead] = useState(false);
  useEffect(() => {
    const apply = () => {
      const f = parseTownFeedFilters(window.location.search);
      setKind(f.kind);
      setSort(f.sort);
      setOnlyMine(f.mine);
      setRegion(f.region ?? null);
    };
    apply();
    setUrlRead(true);
    /* 뒤로가기·앞으로가기로 쿼리가 바뀌면 다시 읽는다 */
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);
  const filters: TownFeedFilters = useMemo(
    () => ({ kind, sort, mine: onlyMine, ...(region ? { region } : {}) }),
    [kind, sort, onlyMine, region],
  );
  useEffect(() => {
    if (!urlRead) return; // URL 을 읽기 전에 기본값으로 덮어쓰면 딥링크가 지워진다
    try {
      const next = townFeedFilterQuery(filters, window.location.search);
      const cur = window.location.search;
      if (next !== cur) {
        window.history.replaceState(null, "", `${window.location.pathname}${next}`);
      }
    } catch {
      /* history 갱신 실패 — 목록 동작과 무관 */
    }
  }, [filters, urlRead]);

  /* [967 · 19] 다음 장 — /api/town/feed 로 이어 붙인다 */
  const [extra, setExtra] = useState<FeedCard[]>([]);
  const [more, setMore] = useState(hasMore);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [moreRestored, setMoreRestored] = useState(false);
  const firstOldest = useMemo(() => oldestOf(cards), [cards]);
  useEffect(() => {
    const cached = readMoreCache(firstOldest);
    if (cached && cached.extra.length > 0) {
      setExtra(cached.extra);
      setMore(cached.more);
    }
    setMoreRestored(true);
    // 첫 장은 서버 props 라 마운트 때 한 번만 맞춰 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!moreRestored) return;
    writeMoreCache(extra, more, firstOldest);
  }, [extra, more, moreRestored, firstOldest]);

  const allCards = useMemo(() => {
    if (extra.length === 0) return cards;
    const seen = new Set(cards.map((c) => c.id));
    return [...cards, ...extra.filter((c) => !seen.has(c.id))];
  }, [cards, extra]);

  const loadMore = useCallback(async () => {
    if (moreLoading) return;
    const oldest = oldestOf(allCards);
    if (oldest <= 0) {
      setMore(false);
      return;
    }
    const before = new Date(oldest).toISOString();
    setMoreLoading(true);
    setMoreError(null);
    try {
      const r = await fetch(
        `/api/town/feed?before=${encodeURIComponent(before)}&limit=${PAGE_SIZE}&seen=${allCards.length}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { items?: FeedCard[]; hasMore?: boolean; loadFailed?: boolean };
      const items = Array.isArray(j.items) ? j.items : [];
      setExtra((prev) => {
        const have = new Set([...cards, ...prev].map((c) => c.id));
        return [...prev, ...items.filter((c) => !have.has(c.id))];
      });
      /* 한쪽 소스가 실패한 장은 "마지막"이 아니라 "일부를 못 받았다"고 말하고,
         버튼을 남겨 다시 누를 수 있게 한다 */
      setMore(Boolean(j.hasMore) || Boolean(j.loadFailed));
      if (j.loadFailed) setMoreError("일부 글을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
    } catch {
      setMoreError("더 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setMoreLoading(false);
    }
  }, [allCards, cards, moreLoading]);

  /* [966] 상세 → 뒤로가기 스크롤 복원. 행 높이는 썸네일(72px)로 먼저 확정되므로 첫 렌더가 곧 ready 다.
     [967 · 21] 키는 경로 + **현재 필터 쿼리**로 직접 조립한다 — 마운트 때 한 번 읽는
     기본 키(useScrollRestoreKey)는 필터를 바꾼 뒤 나갈 때와 돌아올 때가 어긋난다.
     ready 는 URL 을 읽어 필터가 확정되고(urlRead) 다음 장 캐시까지 붙은 뒤(moreRestored). */
  const pathname = usePathname();
  useScrollRestore(
    `${pathname}${townFeedFilterQuery(filters, "")}`,
    urlRead && moreRestored && allCards.length > 0,
  );
  useEffect(() => {
    let dead = false;
    getHomePersonal<HomePersonal>()
      .then((p) => {
        if (dead || !p) return;
        setMyRegions(myRegionsOf(p));
      })
      .catch(() => {
        /* 개인화 실패 — 칩을 안 그린다. 빈 결과를 "내 지역 글이 없다"로 오인시키지 않는다. */
      });
    return () => {
      dead = true;
    };
  }, []);

  /* 카드의 region 표기("서울 강남구")와 관심지역 표기("강남구")가 다를 수 있어
     한쪽이 다른 쪽을 포함하면 같은 지역으로 본다. */
  const matchesMine = useCallback(
    (c: FeedCard) => {
      const list = myRegions ?? [];
      if (list.length === 0) return true;
      const r = (c.region ?? "").replace(/\s+/g, "");
      if (!r) return false;
      return list.some((m) => {
        const n = m.replace(/\s+/g, "");
        return n.length > 1 && (r.includes(n) || n.includes(r));
      });
    },
    [myRegions],
  );

  /* [v4] 지역 칩 — 손에 든 카드에서 센 수(누르면 보이는 행 수). 0건 동네는 싣지 않되,
     URL 로 들어온 선택 동네는 0건이어도 칩으로 남겨 "무엇이 걸려 있는지" 보이게 한다. */
  const selectedRegion = townFeedRegionById(region);
  const regionChips = useMemo(() => {
    const chips = townRegionChips(allCards);
    if (selectedRegion && !chips.some((c) => c.id === selectedRegion.id)) {
      chips.push({ id: selectedRegion.id, name: selectedRegion.name, count: 0 });
    }
    return chips;
  }, [allCards, selectedRegion]);
  const mineCount = useMemo(
    () => (myRegions && myRegions.length > 0 ? allCards.filter(matchesMine).length : 0),
    [allCards, myRegions, matchesMine],
  );
  /* 홈에서 정한 관심지역을 여기서도 쓴다(B21) — 없거나 0건이면 칩을 그리지 않는다 */
  const showMine = Boolean(myRegions && myRegions.length > 0 && (mineCount > 0 || onlyMine));
  /* ?mine=1 로 들어왔지만 관심지역을 모르면(비로그인·조회 전) 거르는 것이 없다 — "전체"가 켜진 것으로 보인다 */
  const mineOn = onlyMine && Boolean(myRegions && myRegions.length > 0);

  /* 지역(관심지역·동네 칩)으로 먼저 거른 모수 — 유형 탭의 숫자도 이 모수에서 센다(탭 숫자 = 보이는 행 수) */
  const scoped = useMemo(() => {
    let list = onlyMine ? allCards.filter(matchesMine) : allCards;
    if (selectedRegion) list = list.filter((c) => regionMatches(c.region, selectedRegion.name));
    return list;
  }, [allCards, onlyMine, matchesMine, selectedRegion]);

  /* 각 칸의 실제 개수 — 눌러 보기 전에 결과 크기를 알 수 있게 한다.
     개수는 **유형**에만 붙인다(정렬은 같은 목록을 다시 세우는 것이라 수가 같다). */
  const counts = useMemo<Record<KindId, number>>(
    () => ({
      all: scoped.length,
      note: scoped.filter((c) => c.kind === "note").length,
      post: scoped.filter((c) => c.kind === "post").length,
    }),
    [scoped],
  );
  /* [1012 · R2] 추천순의 기준(실측) — recommendScore 가 실제로 밀어 올리는 카드 수.
     [v4] 화면 문장에서 정렬 버튼의 title(툴팁)로 옮겼다 — 설명 문장은 목록 위에 세우지 않는다. */
  const boostedByScore = useMemo(
    () => allCards.filter((c) => (c.rating ?? 0) > 0 || (c.saves ?? 0) > 0).length,
    [allCards],
  );
  const recoNote =
    boostedByScore > 0
      ? `최신순 · 이 피드 ${allCards.length.toLocaleString("ko-KR")}장 중 평점·저장 있는 ${boostedByScore.toLocaleString("ko-KR")}장은 그만큼 위로`
      : `최신순 · 이 피드 ${allCards.length.toLocaleString("ko-KR")}장에 아직 평점·저장이 없어 올린 순서 그대로`;

  const visible = useMemo(() => {
    const list = kind === "all" ? scoped : scoped.filter((c) => c.kind === kind);
    /* 포인트 추천글은 정렬과 무관하게 맨 앞 — 메타 줄의 "추천글"로 이유를 밝힌다 */
    const byBoost = (a: FeedCard, b: FeedCard) => Number(b.boosted ?? false) - Number(a.boosted ?? false);
    if (sort === "latest")
      return [...list].sort((a, b) => byBoost(a, b) || b.createdAt - a.createdAt);
    return [...list].sort((a, b) => byBoost(a, b) || recommendScore(b) - recommendScore(a));
  }, [scoped, kind, sort]);

  /* 지역 칩은 하나만 켜진다 — 전체 · 내 관심지역 · 동네 중 하나 */
  const pickAll = () => {
    setOnlyMine(false);
    setRegion(null);
  };
  const pickMine = () => {
    setRegion(null);
    setOnlyMine((v) => !v);
  };
  const pickRegion = (id: TownFeedRegionId) => {
    setOnlyMine(false);
    setRegion((cur) => (cur === id ? null : id));
  };

  return (
    <>
      {/* [v4] 지역 줄 — 한 줄 가로 스크롤 필터 칩. 칩이 "전체" 하나뿐이면 줄을 그리지 않는다. */}
      {(regionChips.length > 0 || showMine) && (
        <div className="rail-x -mx-3.5 px-3.5 py-3 md:mx-0 md:px-0" role="group" aria-label="지역">
          <button type="button" aria-pressed={!mineOn && !region} onClick={pickAll} className={chipClass(!mineOn && !region)}>
            전체
          </button>
          {showMine && (
            <button type="button" aria-pressed={mineOn} onClick={pickMine} className={chipClass(mineOn)}>
              내 관심지역
              <span className="ml-1 font-normal tabular-nums">{mineCount}</span>
            </button>
          )}
          {regionChips.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={region === r.id}
              onClick={() => pickRegion(r.id)}
              className={chipClass(region === r.id)}
            >
              {r.name}
              <span className="ml-1 font-normal tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* [v4] 유형 = 밑줄 탭(왼쪽) · 정렬 = 작은 글자 토글(오른쪽) — 한 줄 */}
      <div className="flex items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-4" role="group" aria-label="글 유형">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`-mb-px min-h-10 border-b-2 pb-2.5 pt-2 t-body font-bold transition-colors ${
                kind === k.id ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
              }`}
            >
              {k.label}
              <span className="ml-1 font-normal tabular-nums">{counts[k.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pb-2.5 t-sub" role="group" aria-label="정렬">
          {SORTS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={sort === o.id}
              onClick={() => setSort(o.id)}
              title={o.id === "reco" ? recoNote : undefined}
              className={sort === o.id ? "font-bold text-ink" : "text-text-3"}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 빈 목록이면 아래 빈 화면이 같은 사실을 말한다 — 여기선 목록이 있을 때만(같은 사실은 한 번) */}
      {loadFailed && visible.length > 0 && (
        <p role="status" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">
          일부 글을 불러오지 못했어요. 잠시 후 새로고침해 주세요.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          {/* 조회 실패로 목록이 비었을 때 "글이 없어요"라고 하면 사실이 아니다.
              [967 · 19] 아직 안 받은 장이 남아 있을 때도 마찬가지 — "지금까지 받은 것에는 없다"고 말하고
              더 보기로 잇는다. [v4] 빈 화면은 한 줄 + 버튼 하나. */}
          <p className="t-body text-text-2">
            {loadFailed
              ? "글을 불러오지 못했어요. 잠시 후 새로고침해 주세요."
              : more
                ? `지금까지 받은 ${allCards.length.toLocaleString("ko-KR")}건에는 이 조건의 글이 없어요`
                : mineOn
                  ? `${myRegions?.[0] ?? "내 관심지역"} 글이 이 피드에 아직 없어요`
                  : selectedRegion
                    ? `${selectedRegion.name} 글이 이 피드에 아직 없어요`
                    : kind === "post"
                      ? /* [1006] 이야기 탭 0건 — 지금 운영 실측(사람 글 0건)이 그대로 보이는 자리다. 지어내지 않는다 */
                        "이 피드에 이웃 글이 아직 없어요"
                      : kind === "note"
                        ? "이 피드에 공개 임장노트가 아직 없어요"
                        : "이 조건의 글이 아직 없어요"}
          </p>
          {!loadFailed && (
            <Link href={kind === "note" ? "/notes/new" : "/town/write"} className="btn-primary btn-md no-underline">
              {kind === "note" ? "임장노트 쓰기" : "동네이야기 쓰기"}
            </Link>
          )}
        </div>
      ) : (
        <ul data-tone="hanji" className="divide-y divide-line">
          {visible.map((card, i) => (
            <FeedRow key={card.id} card={card} priority={i === 0} />
          ))}
        </ul>
      )}

      {/* [967 · 19] 더 보기 — 필터와 무관하게 전체 피드의 다음 장을 붙인다(유형·정렬·지역은 받은 카드
          위에서 다시 계산된다). 빈 화면에서도 그려야 "첫 장엔 없지만 다음 장엔 있는" 글을 찾아갈 수 있다.
          [v4] 끝에 닿으면 아무것도 적지 않는다("마지막이에요 · 이 조건 N / 전체 M" 상태 문장 삭제).
          지역을 고른 상태면 그 동네 홈(/town/{id})으로 가는 링크를 목록 끝에 둔다 — 옛 지역 칩이 하던 이동. */}
      {(more || selectedRegion) && (
        <div className="mt-3 flex flex-col items-center gap-3 border-t border-line pt-4">
          {moreError && (
            <p role="alert" className="t-sub text-text-2">
              {moreError}
            </p>
          )}
          {more && (
            <button
              type="button"
              onClick={loadMore}
              disabled={moreLoading}
              aria-busy={moreLoading}
              className="btn-ghost btn-md w-full"
            >
              {/* [1012] 규칙 5 — 동사 + 대상 */}
              {moreLoading ? "불러오는 중…" : "이전 글 더 보기"}
            </button>
          )}
          {selectedRegion && (
            <Link href={`/town/${selectedRegion.id}`} className="t-sub font-bold text-primary no-underline">
              {selectedRegion.name} 동네 홈 보기 ›
            </Link>
          )}
        </div>
      )}
    </>
  );
}
