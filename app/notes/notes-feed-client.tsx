"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Segmented } from "@/app/components/ui/Segmented";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";
import { useScrollRestore, useScrollRestoreKey } from "@/lib/client/use-scroll-restore";
import type { FeedNote, TagTone } from "@/lib/notes/feed-note";

/* 공개 임장노트 — 인스타그램형(스토리 줄 + 3열 그리드 ⇄ 피드 전환) */

/* [967 · 19] 카드 타입은 lib/notes/feed-note 로 올렸다(서버 빌더와 한 곳) — 기존
   import 경로(./notes-feed-client 의 FeedNote)는 재수출로 그대로 산다. */
export type { FeedNote, TagTone };

/** [967 · 20] 공개/내 노트 세그먼트 값 — URL 의 ?tab= 과 1:1 */
type NotesTab = "public" | "mine";
const TAB_OPTIONS: ReadonlyArray<{ value: NotesTab; label: string }> = [
  { value: "public", label: "공개 노트" },
  { value: "mine", label: "내 노트" },
];

/* 정렬·필터 칩.
   "인기" 였던 칩은 "점수순" 으로 바꿨다 — 정렬 키가 작성자 본인이 매긴 임장 점수라
   조회·좋아요·저장 같은 반응 신호가 하나도 섞여 있지 않았기 때문이다. 노트에는 저장
   기능 자체가 없어(bookmarks 의 target_type 에 note 가 없다) 실참여 수치를 넣을 수도
   없으므로, 없는 인기를 만들어 내는 대신 라벨을 실제 정렬 기준에 맞췄다. */
const FILTERS = ["최신", "점수순", "내 관심 지역"] as const;
type Filter = (typeof FILTERS)[number];
type ViewMode = "grid" | "feed";

/** 예시 카드는 존재하지 않는 id로 상세를 열지 않는다 — 작성 CTA로 보낸다 */
function noteHref(n: FeedNote): string {
  return n.isExample ? "/notes/new" : `/notes/${n.id}`;
}

/** 시드 문자열 → 결정적 그라디언트(사진 없는 노트 커버/아바타용) */
function seedGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 58% 60%), hsl(${hue2} 62% 48%))`;
}

/** 지역명에서 짧은 라벨(구/동) 추출 — 스토리·타일 라벨용 */
function shortLabel(n: FeedNote): string {
  const r = (n.region ?? "").trim();
  if (r) {
    const tokens = r.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] ?? r;
  }
  return n.title.slice(0, 6);
}

/* ── 상단 스토리 줄 (최근 임장 · 인스타 스토리 느낌) ──
   [970 · B-04] 가장자리 붙이기는 PageShell 의 모바일 패딩(px-3.5)만큼만 — -mx-5 는
   6px 을 더 빼서 가로 스크롤(넘침)을 만들었다. 아래 그리드도 같다. */
function StoryRail({ notes }: { notes: FeedNote[] }) {
  const IG_RING =
    "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)";
  return (
    <div className="-mx-3.5 overflow-x-auto px-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:rounded-2xl md:border md:border-line md:bg-surface md:px-4 md:py-3">
      <div className="flex gap-3.5 pb-1 md:pb-0">
        {/* 내 스토리 = 노트 쓰기 */}
        <Link
          href="/notes/new"
          className="flex w-[64px] shrink-0 flex-col items-center gap-1.5"
        >
          <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-line-strong text-primary">
            <Icon name="plus" size={22} />
          </span>
          <span className="w-full truncate text-center t-caption text-text-2">
            노트 쓰기
          </span>
        </Link>
        {notes.slice(0, 14).map((n) => (
          <Link
            key={n.id}
            href={noteHref(n)}
            className="flex w-[64px] shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className="h-[62px] w-[62px] rounded-full p-[2.5px]"
              style={{ background: IG_RING }}
            >
              <span className="block h-full w-full overflow-hidden rounded-full border-2 border-surface bg-bg">
                <CoverImage
                  src={n.coverUrl}
                  alt={`${shortLabel(n)} 노트 커버`}
                  /* [B004] 62px 원에 기본 힌트(50vw)로는 384w 가 내려온다 —
                     실 표시 크기를 말해 가장 작은 변환(384→실효 128w급)으로. */
                  sizes="62px"
                  imgClassName="h-full w-full object-cover"
                  fallback={
                    <span
                      className="flex h-full w-full items-center justify-center t-section text-white"
                      style={{ background: seedGradient(n.id) }}
                    >
                      {shortLabel(n).slice(0, 2)}
                    </span>
                  }
                />
              </span>
            </span>
            <span className="w-full truncate text-center t-caption text-text-2">
              {shortLabel(n)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── 그리드 타일 (탐색·프로필 그리드) ── */
/* [968 · 17] priority — 목록 첫 타일(LCP 후보)만 true. lazy 를 풀고 선점 요청한다. */
function GridTile({ n, priority = false }: { n: FeedNote; priority?: boolean }) {
  return (
    <Link
      href={noteHref(n)}
      aria-label={n.isExample ? "예시 — 임장노트 쓰기" : `${n.title} 노트 보기`}
      className="group relative block aspect-[3/4] overflow-hidden bg-bg md:rounded-2xl md:shadow-[0_1px_2px_rgba(16,28,54,.05),0_8px_20px_rgba(16,28,54,.06)] md:transition-transform md:duration-200 md:hover:-translate-y-1"
    >
      <CoverImage
        src={n.coverUrl}
        alt={n.isExample ? "" : `${n.title} 커버 사진`}
        priority={priority}
        /* [968 · 17] 실제 열 수(모바일 3열·md 4열·xl 5열)를 말한다 — 기본 50vw 는
           3열 타일에 한 단계 큰 변환(DPR2 기준 640w→384w)을 내려받게 했다. */
        sizes="(max-width: 768px) 33vw, (max-width: 1280px) 25vw, 224px"
        imgClassName="absolute inset-0 h-full w-full object-cover md:transition-transform md:duration-300 md:group-hover:scale-[1.06]"
        fallback={
          <span
            className="absolute inset-0"
            style={{ background: seedGradient(n.id) }}
          />
        }
      />
      {/* 점수 배지 (인스타 조회수/캐러셀 인디케이터 위치) */}
      {/* [962] 검정 반투명 → 네이비(어두운 면 = 네이비) + 한지 글자 */}
      <span className="absolute right-1.5 top-1.5 rounded-md bg-brand-navy/80 chip-pad-tight t-caption font-extrabold text-on-dark backdrop-blur-sm md:right-2.5 md:top-2.5 md:t-sub">
        체크 {n.score}
      </span>
      {n.isExample && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 t-caption font-bold text-white backdrop-blur-sm">
          예시
        </span>
      )}
      {/* 하단 스크림 + 제목·지역 오버레이 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/25 to-transparent px-2 pb-2 pt-7 md:px-3 md:pb-3">
        <p className="line-clamp-2 t-sub font-bold text-white drop-shadow-sm md:t-body">
          {n.title}
        </p>
        {n.region && (
          <p className="mt-0.5 truncate t-caption text-white/85 md:mt-1 md:t-sub">
            {n.region}
          </p>
        )}
      </div>
    </Link>
  );
}

/* ── 피드 포스트 카드 (홈 피드) ── */
/* [968 · 17] priority — 피드 첫 카드(LCP 후보)만 true */
function PostCard({ n, priority = false }: { n: FeedNote; priority?: boolean }) {
  const detailHref = noteHref(n);
  return (
    <article className="mx-auto w-full max-w-[468px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,28,54,.04),0_10px_26px_rgba(16,28,54,.05)]">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div
          className="h-8 w-8 shrink-0 rounded-full ring-2 ring-primary-soft"
          style={{ background: seedGradient(n.author) }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 t-body font-bold text-ink">
            <span className="truncate">{n.author}</span>
            {n.isExample && <ExampleBadge />}
            {/* [983] 공개 노트 27건 중 25건이 Lab 글인데 화면은 "직접 다녀온 사람이
                남긴 기록"이라고만 말했다. 운영진 글에는 그렇다고 적는다 — 사실을
                적는 쪽이 신뢰를 지키고, "내 글이 이 단지 첫 진짜 기록"이 된다. */}
            {n.lab && <ExampleBadge label="운영진 예시" />}
          </div>
          <div className="truncate t-sub text-text-3">{n.title}</div>
        </div>
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
            n.scoreTone === "primary"
              ? "bg-brand-hanji text-brand-hanji-ink" /* [962] 점수 = 한지 + 남색(홈 시안) */
              : "bg-[rgba(127,140,158,.12)] text-text-3"
          }`}
        >
          체크 {n.score}
        </span>
      </div>
      <Link
        href={detailHref}
        aria-label={`${n.title} 노트 보기`}
        className="relative block aspect-square bg-bg"
      >
        <CoverImage
          src={n.coverUrl}
          alt={`${n.title} 커버 사진`}
          priority={priority}
          /* [968 · 17] 전폭 카드(최대 468px)인데 기본 힌트(50vw)를 받고 있었다 —
             모바일에서 절반 해상도 변환이 내려와 흐릿하게 확대됐다. */
          sizes="(max-width: 768px) 100vw, 468px"
          imgClassName="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-7 text-center text-white"
              style={{ background: seedGradient(n.id) }}
            >
              <span className="t-sub font-bold uppercase tracking-[0.14em] text-white/85">
                임장노트
              </span>
              <span className="line-clamp-3 t-title drop-shadow-sm">
                {n.title}
              </span>
              <span className="mt-1 rounded-full bg-white/22 px-3.5 py-1 t-sub font-extrabold backdrop-blur-sm">
                자가 체크 요약 {n.score}
              </span>
            </div>
          }
        />
      </Link>
      {/* 하트·댓글·북마크 아이콘 제거 — 기능이 없는 장식은 두지 않는다. 상세 진입은 카드/자세히 보기로 충분 */}
      {n.complexHref && (
        <div className="flex items-center px-3.5 pt-3">
          <Link
            href={n.complexHref}
            className="t-sub font-bold text-primary no-underline"
          >
            단지 허브 ›
          </Link>
        </div>
      )}
      <div className="px-3.5 pb-3.5 pt-2">
        <p className="t-body text-text-1">
          <span className="font-bold text-ink">{n.author}</span>{" "}
          <span className="text-text-2">{n.excerpt}</span>
        </p>
        {n.tags.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 t-sub font-semibold text-primary">
            {n.tags.map((t) => (
              <span key={t.label}>#{t.label.replace(/\s/g, "")}</span>
            ))}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 t-sub text-text-3">
          <span>{n.meta}</span>
          {n.footer.map((f) => (
            <span key={f}>· {f}</span>
          ))}
        </div>
        <Link
          href={detailHref}
          className="mt-2 inline-block t-sub font-semibold text-text-3 no-underline"
        >
          자세히 보기 ›
        </Link>
      </div>
    </article>
  );
}

/* 그리드/피드 전환 아이콘 (인라인 SVG) */
function GridGlyph({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[3, 10, 17].map((x) =>
        [3, 10, 17].map((y) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="4"
            height="4"
            rx="1"
            fill={active ? "currentColor" : "#c3cad6"}
          />
        )),
      )}
    </svg>
  );
}
function FeedGlyph({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[4, 14].map((y) => (
        <rect
          key={y}
          x="3"
          y={y}
          width="18"
          height="6"
          rx="1.5"
          fill={active ? "currentColor" : "#c3cad6"}
        />
      ))}
    </svg>
  );
}

export function NotesFeedClient({
  notes,
  mine = false,
  loadError = null,
  showInterestFilter = false,
  loggedIn = false,
  hasMore = false,
  pageSize = 30,
  hasBestMonth = false,
}: {
  notes: FeedNote[];
  /** 내 노트 뷰(?mine=1 · ?tab=mine) — 세션 사용자의 노트(비공개 포함) */
  mine?: boolean;
  /** 조회 자체가 실패했을 때의 사유. "노트가 없다" 와 반드시 구분해 표시한다. */
  loadError?: string | null;
  /** 지역 알림 구독이 1건 이상일 때만 true. false 면 "내 관심 지역" 칩을 아예 감춘다 */
  showInterestFilter?: boolean;
  /** [967 · 20] 로그인 상태 — 세그먼트(공개/내 노트)는 로그인했을 때만 그린다 */
  loggedIn?: boolean;
  /** [967 · 19] 첫 페이지가 꽉 찼는지(더 볼 것이 있을 가능성). 공개 뷰에서만 의미 있다 */
  hasMore?: boolean;
  /** [967 · 19] 다음 페이지 크기 — 서버 첫 페이지와 같은 값 */
  pageSize?: number;
  /** [970 · B-25] /notes/best 에 뽑힌 달이 있는가 — 없으면(또는 못 읽었으면) 링크를 감춘다 */
  hasBestMonth?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("최신");
  const [view, setView] = useState<ViewMode>("grid");
  /* [967 · 19] "더 보기" 로 이어 붙인 카드 — 서버 첫 페이지(props) 뒤에 붙는다.
     필터·정렬은 합친 목록에 건다(붙인 카드도 관심 지역·점수순을 똑같이 따른다). */
  const [extra, setExtra] = useState<FeedNote[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(!hasMore);
  const allNotes = extra.length > 0 ? [...notes, ...extra] : notes;
  const exampleOnly = allNotes.length > 0 && allNotes.every((n) => n.isExample);
  /* [966] 상세 → 뒤로가기 스크롤 복원. 노트는 서버가 내려준 props 라 첫 렌더에 이미
     그려져 있다(ready) — 타일은 3:4 고정 비율이라 사진이 늦게 와도 높이가 안 변한다. */
  useScrollRestore(useScrollRestoreKey(), notes.length > 0);

  /* 구독 지역이 없으면 "내 관심 지역" 은 무엇을 눌러도 0건이라 칩 자체를 숨긴다.
     비활성 상태로 남겨 두면 눌리는데 아무 일도 안 하는 컨트롤이 된다. */
  const filters = FILTERS.filter((f) => f !== "내 관심 지역" || showInterestFilter);
  const activeFilter = filters.includes(filter) ? filter : "최신";

  const visible =
    activeFilter === "점수순"
      ? [...allNotes].sort((a, b) => b.score - a.score)
      : activeFilter === "내 관심 지역"
        ? allNotes.filter((n) => n.interested)
        : allNotes;

  /* [967 · 20] 세그먼트 → URL(?tab=mine). 내 노트는 서버가 세션으로 읽는 목록이라
     클라이언트가 필터로 흉내 낼 수 없다 — replace 로 서버 렌더를 다시 받는다.
     scroll:false — 세그먼트는 같은 화면의 상태 전환이지 페이지 이동이 아니다. */
  const switchTab = (next: NotesTab) => {
    if ((next === "mine") === mine) return;
    router.replace(next === "mine" ? "/notes?tab=mine" : "/notes", { scroll: false });
  };

  /* [967 · 19] 다음 페이지 — 마지막 카드의 createdAt 을 커서로 넘긴다. 응답이 페이지
     크기보다 짧으면 끝. 실패는 "노트가 없다" 가 아니라 실패라고 적는다. */
  const loadMore = async () => {
    if (loadingMore || reachedEnd) return;
    const last = allNotes[allNotes.length - 1];
    const cursor = last?.createdAt;
    if (!cursor) {
      setReachedEnd(true);
      return;
    }
    setLoadingMore(true);
    setMoreError(null);
    try {
      const qs = new URLSearchParams({ public: "1", before: cursor, limit: String(pageSize) });
      const res = await fetch(`/api/inspection/notes?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setMoreError("더 불러오지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        items?: FeedNote[];
        hasMore?: boolean;
      } | null;
      const items = Array.isArray(data?.items) ? data.items : [];
      /* 커서 경계에서 같은 시각의 노트가 겹칠 수 있다 — id 로 한 번 거른다 */
      const seen = new Set(allNotes.map((n) => n.id));
      const fresh = items.filter((n) => !seen.has(n.id));
      if (fresh.length > 0) setExtra((prev) => [...prev, ...fresh]);
      if (items.length < pageSize || data?.hasMore === false) setReachedEnd(true);
    } catch {
      setMoreError("네트워크 오류가 발생했어요");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 md:gap-5">
        {/* 헤더 */}
        <div className="px-1">
          {/* [967 · 20] 공개/내 노트 세그먼트 — 로그인했을 때만. 예전엔 내 노트로 가는
              길이 /my 의 링크 하나뿐이라 목록 화면 안에서는 전환이 없었다. */}
          {loggedIn && (
            <Segmented<NotesTab>
              options={TAB_OPTIONS}
              value={mine ? "mine" : "public"}
              onChange={switchTab}
              ariaLabel="노트 범위"
              className="mb-3 w-fit"
            />
          )}
          <h1 className="t-title text-ink md:t-title">
            {mine ? "내 임장노트" : "공개 임장노트"}
          </h1>
          <p className="mt-1.5 text-[13px] text-text-2">
            {mine
              ? "내가 남긴 임장 기록 — 비공개 노트도 여기서만 보여요"
              : "이웃들의 실제 임장 기록 — 실회원 기록만 노출돼요"}
          </p>
          {!mine && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-sub">
              {/* [970 · B-25] 뽑힌 달이 하나라도 있을 때만 — 빈 화면으로 보내지 않는다 */}
              {hasBestMonth && (
                <Link href="/notes/best" className="font-bold text-primary underline">
                  이달의 공개 임장노트 — 선정 기준까지 공개 ›
                </Link>
              )}
              {/* 임장 가이드(전략 §4-2) — 기록 허브에서 준비 허브로 잇는다 */}
              <Link href="/imjang" className="font-bold text-primary underline">
                지역별 임장 가이드 — 답사 준비 ›
              </Link>
              {/* [970 · B-25] 리포트 진열대(/notes/market) 링크는 뺐다 — 판매 오픈 전 잠금
                  화면이라 헤더에서 보낼 곳이 아니다(페이지 자체는 그대로). */}
            </p>
          )}
        </div>

        {/* 조회 실패 — 이 경우 "노트가 없다" 고 읽히면 안 되므로 빈 상태와 분리한다 */}
        {loadError && (
          <div className="rounded-[10px] border border-line bg-surface px-3.5 py-3 t-sub text-text-2">
            {mine ? "내 임장노트를" : "공개 임장노트를"}{" "}
            <strong className="text-ink">불러오지 못했습니다</strong>. 노트가 없다는 뜻이 아니라
            조회 자체가 실패했다는 뜻입니다. 잠시 후 다시 확인해 주세요.
          </div>
        )}

        {/* 스토리 줄 */}
        {visible.length > 0 && <StoryRail notes={visible} />}

        {/* 필터 칩 + 뷰 전환 */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 t-body [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`chip press shrink-0 px-4 py-2 ${
                  activeFilter === f
                    ? "chip-active"
                    : "border border-line bg-surface text-text-2"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="그리드 보기"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                view === "grid" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <GridGlyph active={view === "grid"} />
            </button>
            <button
              type="button"
              aria-label="피드 보기"
              aria-pressed={view === "feed"}
              onClick={() => setView("feed")}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                view === "feed" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <FeedGlyph active={view === "feed"} />
            </button>
          </div>
        </div>

        {/* 예시 안내 */}
        {exampleOnly && (
          <div className="flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 t-sub text-text-3">
            <ExampleBadge />
            <span>
              아직 공개된 임장노트가 없어 샘플 1건을 보여드려요 — 실데이터가
              쌓이면 자동으로 교체됩니다.
            </span>
          </div>
        )}

        {/* 본문: 그리드 / 피드 / 빈 상태 */}
        {visible.length === 0 ? (
          /* 빈 상태를 한 문장으로 뭉뚱그리면 "노트가 없다"와 "필터가 걸러 냈다"가
             섞인다. 노트는 있는데 필터 결과만 0건인 경우를 따로 적는다. */
          allNotes.length > 0 ? (
            <EmptyState
              icon="file-text"
              title={
                activeFilter === "내 관심 지역"
                  ? "구독한 지역의 노트는 아직 없어요"
                  : "해당 필터에 맞는 노트가 아직 없어요"
              }
              desc={
                activeFilter === "내 관심 지역"
                  ? `노트 ${allNotes.length}건 중 내가 구독한 지역과 겹치는 건 없었어요. 필터를 '최신'으로 바꾸면 전체를 볼 수 있어요.`
                  : "필터를 바꾸면 다른 노트를 볼 수 있어요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          ) : (
            <EmptyState
              icon="file-text"
              title={
                mine
                  ? "아직 작성한 임장노트가 없어요"
                  : "아직 공개된 임장노트가 없어요"
              }
              desc={
                mine
                  ? "첫 임장노트를 작성하면 비공개 노트까지 여기에 모여요."
                  : "아직 공개된 기록이 없어요. 샘플로 채우지 않아요 — 첫 노트를 쓰거나 지도에서 단지를 먼저 둘러보세요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          )
        ) : view === "grid" ? (
          // 모바일: 가장자리까지 붙는 촘촘한 3열(인스타 앱). 데스크탑: 넓은 4~5열 보드(둥근 카드·호버·여백)
          <div className="-mx-3.5 grid grid-cols-3 gap-0.5 md:mx-0 md:grid-cols-4 md:gap-3.5 xl:grid-cols-5">
            {/* [968 · 17] 첫 타일만 priority — 그리드·피드 중 한 뷰만 그려지므로 한 화면에 하나다 */}
            {visible.map((n, i) => (
              <GridTile key={n.id} n={n} priority={i === 0} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {visible.map((n, i) => (
              <PostCard key={n.id} n={n} priority={i === 0} />
            ))}
          </div>
        )}

        {/* [967 · 19] 더 보기 — 공개 뷰에서만(내 노트는 listNotes 가 200건까지 한 번에 준다).
            첫 페이지가 꽉 찼을 때만 버튼을 그리고, 짧은 응답이 오면 "마지막이에요" 로 닫는다.
            버튼은 목록 아래 제자리라 스크롤 위치가 그대로 유지된다(위로 튀지 않는다). */}
        {!mine && !loadError && hasMore && allNotes.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-1">
            {reachedEnd ? (
              <p role="status" className="t-sub text-text-3">
                마지막이에요 — {allNotes.length}건을 모두 봤어요
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="btn-soft px-5 py-2.5 t-body font-bold disabled:opacity-60"
              >
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </button>
            )}
            {moreError && (
              <p role="alert" className="t-sub font-bold text-danger">
                {moreError}
              </p>
            )}
          </div>
        )}

        {/* 모바일 전용 노트 쓰기 CTA — [#68] 현장 퀵 기록 나란히 */}
        <div className="rise-in-2 mx-auto flex w-full max-w-[468px] gap-2 md:hidden">
          <Link
            href="/notes/new"
            className="btn-primary flex-1 rounded-2xl p-[15px] text-center text-[15px]"
            style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
          >
            노트 쓰기
          </Link>
          <Link
            href="/notes/new?quick=1"
            className="flex-1 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-surface p-[15px] text-center t-body font-bold text-text-1"
          >
            📷 현장 퀵 기록
          </Link>
        </div>
      </div>

      {/* 모바일 노트 쓰기 FAB — [961] 동네이야기 FAB 와 같은 자리·같은 모양(네이비 + 주홍 파문).
          예전엔 오프셋 공식·그림자·글리프가 서로 달랐다. */}
      <Link
        href="/notes/new"
        aria-label="노트 쓰기"
        data-glyph="plus"
        className="njn-fab fixed right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full no-underline md:hidden"
        style={{ bottom: "calc(var(--nz-tabbar-offset) + 12px)" }}
      >
        <Icon name="plus" size={24} />
      </Link>
    </PageShell>
  );
}
