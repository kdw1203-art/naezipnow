"use client";
/* [1023 · 임장노트] docs/review-1022.md 1장 — ① 필터 칩 줄 왼쪽 검색칸(제목·지역·단지명 클라이언트 필터, 지역 칩과 AND,
   0건은 "검색어에 맞는 노트 없음" + 지우기) · ① 내 노트 회차 묶기(같은 aptName 2건 이상 → 접힌 묶음 카드 + 회차 비교 링크)
   · ② "더 보기" 실패는 같은 버튼이 "다시 시도" · ② 내 노트 조회 실패 카드에 다시 시도(loadMine) · ② 폰 격자 타일은 판단 배지 하나만.
   [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */

import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ExpertBadge } from "@/app/components/ExpertBadge";
import { seedGradient as seedFace } from "@/lib/town/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionLite } from "@/lib/client/session-lite";
import { matchesInterest } from "@/lib/notes/region-match";
import { PageShell } from "../components/PageShell";
import { PageHead } from "../components/PageHead";
import { ExampleBadge } from "../components/ExampleBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Segmented } from "@/app/components/ui/Segmented";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";
import { useScrollRestore, useScrollRestoreKey } from "@/lib/client/use-scroll-restore";
import type { FeedNote, TagTone } from "@/lib/notes/feed-note";
import { LIST_AI_STATE_LABEL, type ListAiState } from "@/lib/notes/ai-status";
import {
  DEFAULT_MINE_FILTERS,
  applyMineFilters,
  hasActiveMineFilter,
  mineFilterOptions,
  type MineFilters,
} from "@/lib/notes/mine-filters";
import { MineFilterBar } from "./mine-filter-bar";
import { filterNotesByQuery } from "@/lib/notes/feed-search";
import { groupNoteRounds } from "@/lib/notes/round-groups";

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
type ViewMode = "grid" | "feed" | "table";
/** [1049] 데스크톱 보기 — 표(기본) · 피드. 폰은 ViewMode(격자 기본) */
type DeskView = "table" | "feed";
const DESK_VIEW_KEY = "nz_notes_desk_view";

/** 예시 카드는 존재하지 않는 id로 상세를 열지 않는다 — 작성 CTA로 보낸다 */
function noteHref(n: FeedNote): string {
  return n.isExample ? "/notes/new" : `/notes/${n.id}`;
}

/* [1050 · 펼침] 소유자 지시(2026-10-09): "임장노트는 해당 노트를 누르면 펼쳐지기가 되어서 기존 피드의 카드 형태가 먼저 보이고
   한 번 더 누르면 노트를 볼 수 있도록". 표(데스크톱 기본 · 폰 목록)와 폰 격자에서 — 첫 누름 = 그 자리에 피드 카드(PostCard),
   같은 노트를 다시 누름 = 링크 그대로(노트 열기). 링크는 그대로 두고 첫 누름만 가로챈다 —
   새 탭(가운데 단추 · Ctrl/⌘ · Shift)은 가로채지 않는다. 펼침은 한 번에 하나(다른 노트를 누르면 옮겨 간다). */
function firstTapExpands(e: MouseEvent<HTMLElement>, isOpen: boolean, open: () => void): void {
  if (isOpen || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}

/* [1050 · 펼침] 펼친 피드 카드 아래 "접기" — 펼침을 닫는 길(노트를 열지 않고) */
function FoldButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <div className="mt-1.5 flex justify-center">
      <button
        type="button"
        onClick={onClose}
        aria-label={`${label} 접기`}
        className="inline-flex min-h-10 items-center gap-1 rounded-full px-4 t-sub font-bold text-text-2 hover:bg-surface"
      >
        접기 ▴
      </button>
    </div>
  );
}

/* [996 · 4] 판단·회차 배지 — 상세 판단 카드와 같은 색 규칙(살까 success · 보류 primary ·
   패스 danger · 다시 보기 회색). 탭 대상이 아니라 글자만이다(11px 이상). */
const DECISION_BADGE_CLASS: Record<NonNullable<FeedNote["decision"]>["choice"], string> = {
  buy: "bg-success-soft text-success",
  hold: "bg-primary-soft text-primary",
  pass: "bg-danger-soft text-danger",
  revisit: "bg-bg text-text-2",
};
/* [1006] 내 노트 카드의 AI 정리 상태 — 저장된 것만으로 판정한 네 가지(lib/notes/ai-status
   listAiState). 정리됨은 성공색, 규칙 요약은 회색, 수정 뒤 정리 전은 경고색, 없음은 테두리만.
   타일(어두운 면) 위에서는 흰 반투명 한 가지 — 색으로 구분할 바탕이 없다. */
const AI_BADGE_CLASS: Record<ListAiState, string> = {
  ready: "bg-success-soft text-success",
  rule: "bg-bg text-text-2",
  stale: "bg-warning-soft text-warning",
  none: "border border-line text-text-3",
};
/* [1023 · 임장노트 ②] only="decision" — 폰 3열 격자 타일(≈118px)은 배지 하나(판단)만. 회차·AI 는 피드 카드에서만 */
function NoteBadges({ n, onDark = false, only }: { n: FeedNote; onDark?: boolean; only?: "decision" }) {
  if (!n.decision && n.round == null && !n.aiStatus) return null;
  const decision = n.decision ? (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-px t-caption font-bold ${
        onDark ? "bg-white/22 text-white backdrop-blur-sm" : DECISION_BADGE_CLASS[n.decision.choice]
      }`}
    >
      {n.decision.label}
    </span>
  ) : null;
  if (only === "decision") return decision;
  return (
    <>
      {decision}
      {n.round != null && (
        <span
          className={`inline-flex shrink-0 items-center rounded px-1.5 py-px t-caption font-bold ${
            onDark ? "bg-white/22 text-white backdrop-blur-sm" : "border border-line text-text-3"
          }`}
        >
          {n.round}회차
        </span>
      )}
      {n.aiStatus && (
        <span
          className={`inline-flex shrink-0 items-center rounded px-1.5 py-px t-caption font-bold ${
            onDark ? "bg-white/22 text-white backdrop-blur-sm" : AI_BADGE_CLASS[n.aiStatus]
          }`}
        >
          {LIST_AI_STATE_LABEL[n.aiStatus]}
        </span>
      )}
    </>
  );
}

/** 시드 문자열 → 결정적 단색 면(사진 없는 노트 커버/아바타용).
 *  [1012 · 규칙 3] 무지개 그라데이션(hsl 두 색) → 브랜드 면 셋(한지·소프트 블루·연회색) — lib/town/shared 와 같은 규칙 */
function seedGradient(seed: string): string {
  return seedFace(seed);
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
  /* [1012 · 규칙 3] 인스타 무지개 링 → 브랜드 주홍 단색 링 */
  const IG_RING = "var(--brand-red)";
  return (
    /* [1015 · 규칙 F] 데스크톱은 가로 스크롤 대신 줄바꿈(md:flex-wrap) — 폰은 레일 그대로 */
    <div className="-mx-3.5 overflow-x-auto px-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:rounded-2xl md:border md:border-line md:bg-surface md:px-4 md:py-3">
      <div className="flex gap-3.5 pb-1 md:flex-wrap md:pb-0">
        {/* 내 스토리 = 노트 쓰기 */}
        <Link
          href="/notes/new"
          className="press flex w-[64px] shrink-0 flex-col items-center gap-1.5"
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
            className="press flex w-[64px] shrink-0 flex-col items-center gap-1.5"
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
                    /* [1015] 단색 면(한지·연파랑·연회색) 위 흰 글자는 안 보였다 — 잉크색 */
                    <span
                      className="flex h-full w-full items-center justify-center t-section text-ink"
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
/* [1050 · 펼침] open/onOpen — 폰 격자: 첫 누름은 이 줄 아래 피드 카드를 펼치고, 펼친 타일을 다시 누르면 노트(링크 그대로) */
function GridTile({
  n,
  priority = false,
  open = false,
  onOpen,
}: {
  n: FeedNote;
  priority?: boolean;
  open?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Link
      href={noteHref(n)}
      aria-label={n.isExample ? (open ? "예시 · 임장노트 쓰기" : "예시 카드 펼치기") : open ? `${n.title} 노트 보기` : `${n.title} 펼치기`}
      aria-expanded={onOpen ? open : undefined}
      aria-controls={onOpen && open ? `grid-open-${n.id}` : undefined}
      onClick={onOpen ? (e) => firstTapExpands(e, open, onOpen) : undefined}
      /* [1009 · T] press — 누르는 순간 살짝 눌린다(터치 기기의 피드백 · 들림 호버는 md 이상 마우스만) */
      className={`press group relative block aspect-square overflow-hidden bg-bg md:rounded-2xl md:shadow-[0_1px_2px_rgba(16,28,54,.05),0_8px_20px_rgba(16,28,54,.06)] md:transition-transform md:duration-200 md:hover:-translate-y-1 ${
        open ? "outline-3 -outline-offset-3 outline-primary" : ""
      }`}
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
      {/* [1050 · 펼침] 펼친 타일은 점수 자리에 다음 동작(점수는 아래 펼친 카드 머리에 있다) */}
      <span
        className={`absolute right-1.5 top-1.5 rounded-md chip-pad-tight t-caption font-bold backdrop-blur-sm md:right-2.5 md:top-2.5 ${
          open ? "bg-primary text-white" : "bg-brand-navy/80 text-on-dark"
        }`}
      >
        {open ? "노트 열기 ›" : n.score > 0 ? `기록 ${n.score}점` : "점수 없음"}
      </span>
      {n.isExample && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 t-caption font-bold text-white backdrop-blur-sm">
          예시
        </span>
      )}
      {/* [1015 · 규칙 M 직방] 사진이 여러 장이면 장수 — photoCount 는 실제 photos.length(lib/notes/feed-note) */}
      {!n.isExample && (n.photoCount ?? 0) >= 2 && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-brand-navy/80 chip-pad-tight t-caption font-bold text-on-dark backdrop-blur-sm md:left-2.5 md:top-2.5">
          사진 {n.photoCount}
        </span>
      )}
      {/* 하단 스크림 + 제목·지역 오버레이 — [1012 · 썸네일] 템플릿 썸네일(제목·사실·지역이 그림 안에 있음)이면
          겹쳐 적지 않는다(같은 제목이 두 번 보였다). 사진 커버·폴백 면에만 그린다. */}
      {!n.coverTemplate && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/25 to-transparent px-2 pb-2 pt-7 md:px-3 md:pb-3">
          <p className="line-clamp-2 t-sub font-bold text-white drop-shadow-sm">
            {n.title}
          </p>
          {n.region && (
            <p className="mt-0.5 truncate t-caption text-white/85 md:mt-1">
              {n.region}
            </p>
          )}
          {/* [996 · 4] 판단 — 타일 안 글자 배지(링크 전체가 이미 탭 대상).
              [1023 · 임장노트 ②] 3열 격자(≈118px)에서 배지 두 개가 겹쳤다 — 타일은 판단 하나만(회차·AI 는 피드 카드) */}
          {n.decision && (
            <p className="mt-1 flex flex-wrap gap-1">
              <NoteBadges n={n} onDark only="decision" />
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

/* ── 피드 포스트 카드 ──
   [1016] 소유자: "데스크탑에서 임장노트는 페이스북을 참고해서 구성을 해줘".
   페이스북 게시물의 순서를 그대로 옮겼다 — ① 머리(둥근 아바타 · 이름 · 시각·지역 한 줄) ② 글(제목 + 발췌 + #태그)
   ③ 사진(카드 폭 가득, 넓은 판 1200×630) ④ 사실 줄(자가체크 · 방문 · 체크 · 사진 수) ⑤ 행동 줄(구분선 위, 같은 폭 버튼).
   행동 줄에는 실제로 있는 길만 둔다(노트 보기 · 단지 허브) — 좋아요·댓글·공유는 기능이 없어 그리지 않는다.
   폰 피드 보기도 같은 카드(폭 468 이하)로 읽힌다. */
/* 좌우 화살표(인라인 SVG — 아이콘 세트에 chevron 이 없다) */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "left" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

/* [1017] 소유자(데스크톱 캡처의 사진 칸에 ○): "큰 화면에서 좌우 버튼을 달아서 현재 화면에서도 넘길 수 있도록" →
   (한 장을 카드 폭으로 키운 시안을 보고) "사이즈를 늘리면 안 되고 1×2로 책처럼 넘길 수 있게".
   사진은 제 크기(정사각)로 **두 장 나란히**(펼친 책), 버튼은 두 장씩 넘긴다. 장수 = 표지(정사각) + 실사진(앞 8장).
   보이는 두 장만 그린다. 마지막 쪽이 홀수면 오른쪽은 빈 면. 사진을 누르면 상세. 한 쪽(≤2장)뿐이면 버튼 없음. */
function PostMedia({ n, priority, href }: { n: FeedNote; priority: boolean; href: string }) {
  const slides = useMemo(() => {
    const cover = n.coverUrl ?? null;
    const photos = (n.photos ?? []).filter((p) => p && p !== cover);
    const list = cover ? [cover, ...photos] : photos;
    return list.length > 0 ? list : [null];
  }, [n.coverUrl, n.photos]);
  const pages = Math.max(1, Math.ceil(slides.length / 2));
  const [page, setPage] = useState(0);
  const p = Math.min(page, pages - 1);
  const pair: Array<string | null | undefined> = [slides[p * 2], slides[p * 2 + 1]];
  const many = pages > 1;
  const go = (d: number) => setPage((v) => (v + d + pages) % pages);
  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-0.5 bg-line">
        {pair.map((src, k) => {
          const idx = p * 2 + k;
          if (src === undefined) return <div key={`empty-${idx}`} className="aspect-square bg-bg" aria-hidden="true" />;
          return (
            <Link
              key={`${idx}-${src ?? "none"}`}
              href={href}
              aria-label={idx === 0 ? `${n.title} 노트 보기` : `${n.title} 사진 ${idx + 1}`}
              className="press relative block aspect-square bg-bg"
            >
              {/* [1017] 소유자: "사이즈가 네모칸에 맞게 세로 가로 정렬을 제대로" — 잘라 채우지(cover) 않고 칸 안에
                  통째로 들어가게(contain) 가운데 정렬. 비율이 다른 사진은 위아래·좌우에 바탕색이 남는다. */}
              <CoverImage
                src={src}
                alt={idx === 0 ? `${n.title} 커버 사진` : `${n.title} 사진 ${idx + 1}`}
                priority={priority && idx === 0}
                sizes="(max-width: 768px) 50vw, 320px"
                imgClassName="absolute inset-0 h-full w-full object-contain object-center"
                fallback={
                  /* [1015] 단색 면(한지·연파랑·연회색) 위 흰 글자 → 잉크색. 점수는 머리줄에 이미 있다 */
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-ink"
                    style={{ background: seedGradient(n.id) }}
                  >
                    <span className="t-sub font-bold text-text-2">임장노트</span>
                    <span className="line-clamp-2 t-section">{n.title}</span>
                  </div>
                }
              />
            </Link>
          );
        })}
      </div>
      {many && (
        <>
          <button
            type="button"
            aria-label="이전 쪽"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            aria-label="다음 쪽"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
          >
            <Chevron dir="right" />
          </button>
          <span className="absolute right-2 top-2 rounded-md bg-brand-navy/80 px-1.5 py-0.5 t-caption font-bold tabular-nums text-on-dark" aria-live="polite">
            {p * 2 + 1}–{Math.min(p * 2 + 2, slides.length)} / {slides.length}
          </span>
        </>
      )}
    </div>
  );
}

/* [968 · 17] priority — 피드 첫 카드(LCP 후보)만 true */
function PostCard({ n, priority = false }: { n: FeedNote; priority?: boolean }) {
  const detailHref = noteHref(n);
  return (
    <article className="mx-auto w-full max-w-[468px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,28,54,.04),0_10px_26px_rgba(16,28,54,.05)] md:max-w-none">
      {/* ① 머리 */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 md:px-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full t-sub font-bold text-ink md:h-10 md:w-10"
          style={{ background: seedGradient(n.author) }}
          aria-hidden="true"
        >
          {n.author.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 t-body font-bold text-ink">
            <span className="truncate">{n.author}</span>
            <ExpertBadge badge={n.authorBadge} />
            {n.isExample && <ExampleBadge />}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 t-caption text-text-3">
            <span className="truncate">{n.meta}</span>
            <NoteBadges n={n} />
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 t-sub font-bold ${
            n.scoreTone === "primary"
              ? "bg-brand-hanji text-brand-hanji-ink" /* [962] 점수 = 한지 + 남색(홈 시안) */
              : "bg-[rgba(127,140,158,.12)] text-text-3"
          }`}
        >
          {n.score > 0 ? `기록 ${n.score}점` : "점수 없음"}
        </span>
      </div>
      {/* ② 글 — 제목은 링크, 발췌는 작성자 이름 없이(머리에 이미 있다) */}
      <div className="px-3.5 pb-2.5 md:px-4">
        <Link href={detailHref} className="block t-section font-bold text-ink no-underline">
          <span className="line-clamp-2">{n.title}</span>
        </Link>
        <p className="mt-1 line-clamp-3 t-body text-text-2">{n.excerpt}</p>
        {n.tags.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 t-sub font-semibold text-primary">
            {n.tags.map((t) => (
              <span key={t.label}>#{t.label.replace(/\s/g, "")}</span>
            ))}
          </p>
        )}
      </div>
      {/* ③ 사진 — [1017] 정사각 두 장을 펼친 책처럼 나란히, 좌우 버튼으로 두 장씩 넘긴다 */}
      <PostMedia n={n} priority={priority} href={detailHref} />
      {/* ④ 사실 줄 */}
      <div className="flex flex-wrap items-center gap-x-2 px-3.5 py-2 t-caption text-text-3 md:px-4">
        {n.footer.map((f, i) => (
          <span key={f}>{i > 0 ? `· ${f}` : f}</span>
        ))}
        {(n.photoCount ?? 0) > 0 && <span>· 사진 {n.photoCount}장</span>}
      </div>
      {/* ⑤ 행동 줄 — 실제 길만 */}
      <div className="flex border-t border-line">
        <Link
          href={detailHref}
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 t-sub font-bold text-text-2 no-underline hover:bg-bg"
        >
          <Icon name="file-text" size={15} />
          노트 보기
        </Link>
        {n.complexHref && (
          <Link
            href={n.complexHref}
            className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 border-l border-line t-sub font-bold text-text-2 no-underline hover:bg-bg"
          >
            <Icon name="building" size={15} />
            단지 보기
          </Link>
        )}
      </div>
    </article>
  );
}

/* ── [1023 · 임장노트 ①] 내 노트 회차 묶음 카드 ──
   같은 단지(aptName) 2건 이상 → 한 장(단지명 · N회차 · 최근 방문일)으로 접힌다. 머리(40px 이상)를 누르면
   회차별 PostCard 가 펼쳐진다. 머리 오른쪽 "회차 비교 ›" 는 있는 화면(/notes/compare?noteId=) — 그 화면이
   noteId 로 같은 단지의 내 노트를 모으므로 가장 최근 회차의 id 를 넘긴다. 데이터는 손에 든 카드뿐(lib/notes/round-groups). */
function RoundGroupCard({
  aptName,
  notes,
  latestVisit,
}: {
  aptName: string;
  notes: FeedNote[];
  latestVisit: string;
}) {
  const [open, setOpen] = useState(false);
  const latest = notes[0];
  const panelId = `rounds-${latest?.id ?? aptName}`;
  return (
    <section className="mx-auto w-full max-w-[468px] overflow-hidden rounded-2xl border border-line bg-surface md:max-w-none" aria-label={`${aptName} 회차 묶음`}>
      <div className="flex items-center gap-2 pl-3.5 pr-2 md:pl-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
            <Icon name="repeat" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate t-body font-bold text-ink">{aptName}</span>
            <span className="block truncate t-caption text-text-3">
              {notes.length}회차{latestVisit ? ` · 최근 방문 ${latestVisit}` : ""}
              {latest?.region ? ` · ${latest.region}` : ""}
            </span>
          </span>
          <span className={`shrink-0 text-text-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
            <Chevron dir="right" />
          </span>
        </button>
        {latest && !latest.isExample && (
          <Link
            href={`/notes/compare?noteId=${encodeURIComponent(latest.id)}`}
            className="tap-line inline-flex min-h-[24px] shrink-0 items-center t-sub font-bold text-primary no-underline"
          >
            회차 비교 ›
          </Link>
        )}
      </div>
      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line bg-bg p-2 md:p-3">
          {notes.map((n) => (
            <PostCard key={n.id} n={n} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── [1016] 데스크톱 왼쪽 레일(페이스북 왼쪽 바로가기) — 쓰기 버튼 · 바로가기 · 지역 ── */
const RAIL_LINK = "flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 t-body font-bold text-ink no-underline hover:bg-bg";
/* ── [1049] 표 보기 — 소유자 지시(2026-10-09): "임장노트 디자인 개선과 간결화 · 그래프 · 표 적극 도입" ·
   답 "기능 유지, 배치만 정리"(긴 사진 카드 목록 → 표). 데스크톱 기본 보기 · 폰은 보기 전환의 "목록".
   한 줄 = 썸네일 · 제목 · 작성(작성자 · 시각 · 지역) · 기록 점수(막대) · 판단 · 사진 수. 값은 카드와 같은 FeedNote 그대로.
   피드(사진 카드)는 전환 단추로 그대로 남는다. */
/* [1050 · 펼침] 줄을 누르면 그 줄 아래에 피드 카드(PostCard)가 펼쳐지고, 펼친 줄을 다시 누르면 노트를 연다.
   제목 칸은 링크 그대로(첫 누름만 가로챔 · 새 탭은 그대로) · 점수 칸 등 링크 밖을 눌러도 같은 순서. 펼침은 한 번에 하나. */
function NotesTable({ notes }: { notes: FeedNote[] }) {
  const router = useRouter();
  /* 판단 칸은 판단을 남긴 노트가 하나라도 있을 때만 — 전부 "—" 인 칸은 소음이다 */
  const hasDecision = notes.some((n) => n.decision);
  const [openId, setOpenId] = useState<string | null>(null);
  /* 펼친 칸은 머리의 칸 수만큼(숨은 칸 포함) 가로지른다 */
  const span = hasDecision ? 4 : 3;
  return (
    <div className="card overflow-hidden rounded-2xl">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-line bg-bg text-left t-caption text-text-3">
            <th scope="col" className="px-3 py-2 font-bold">노트</th>
            <th scope="col" className="w-[132px] px-2 py-2 font-bold max-md:w-[64px]">
              <span className="max-md:hidden">기록 </span>점수
            </th>
            {/* [1050 · 펼침] 좁은 화면에서 감추는 칸은 display:none 이 아니라 폭 0 — 펼친 줄(colSpan)이 칸 수를 늘려
                고정 표(table-fixed)가 남은 폭을 빈 칸에 나눠 주던 것(폰 목록에서 제목이 "까치…"로 눌림)을 막는다 */}
            {hasDecision && (
              <th scope="col" className="w-[84px] overflow-hidden px-2 py-2 font-bold max-xl:w-0 max-xl:p-0">
                <span className="max-xl:hidden">판단</span>
              </th>
            )}
            <th scope="col" className="w-[56px] overflow-hidden px-3 py-2 text-right font-bold max-md:w-0 max-md:p-0">
              <span className="max-md:hidden">사진</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => {
            const href = noteHref(n);
            const isOpen = openId === n.id;
            const panelId = `note-open-${n.id}`;
            return (
              <Fragment key={n.id}>
              <tr
                className={`cursor-pointer border-b border-line last:border-b-0 ${isOpen ? "bg-primary-soft" : "hover:bg-bg"}`}
                onClick={(e) => {
                  /* 링크 밖(점수 · 판단 · 사진 칸)을 눌러도 같은 순서 — 링크 안은 링크가 처리한다 */
                  if ((e.target as HTMLElement).closest("a,button")) return;
                  if (isOpen) router.push(href);
                  else setOpenId(n.id);
                }}
              >
                <td className="px-3 py-2">
                  <Link
                    href={href}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? panelId : undefined}
                    onClick={(e) => firstTapExpands(e, isOpen, () => setOpenId(n.id))}
                    className="press flex min-h-[48px] min-w-0 items-center gap-2.5 no-underline"
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-bg">
                      <CoverImage
                        src={n.coverUrl}
                        alt=""
                        sizes="44px"
                        imgClassName="absolute inset-0 h-full w-full object-cover"
                        fallback={<span className="absolute inset-0" style={{ background: seedGradient(n.id) }} />}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate t-body font-bold text-ink">{n.title}</span>
                        {n.isExample && <ExampleBadge />}
                      </span>
                      <span className="flex min-w-0 items-center gap-1 t-caption text-text-3">
                        <span className="truncate">
                          {n.author}
                          {n.meta ? ` · ${n.meta}` : ""}
                        </span>
                        <ExpertBadge badge={n.authorBadge} />
                      </span>
                    </span>
                    {isOpen ? (
                      <span className="shrink-0 t-caption font-bold text-primary">노트 열기 ›</span>
                    ) : (
                      <span className="shrink-0 rotate-90 text-text-3" aria-hidden="true">
                        <Chevron dir="right" />
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-2 py-2 align-middle">
                  {n.score > 0 ? (
                    <span className="flex items-center gap-2">
                      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg max-md:hidden" aria-hidden="true">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-full ${n.score >= 75 ? "bg-primary" : n.score < 50 ? "bg-down" : "bg-primary/70"}`}
                          style={{ width: `${Math.min(100, n.score)}%` }}
                        />
                      </span>
                      <span className="shrink-0 t-sub font-bold tabular-nums text-ink">{n.score}점</span>
                    </span>
                  ) : (
                    <span className="t-caption text-text-3">점수 없음</span>
                  )}
                </td>
                {hasDecision && (
                  <td className="overflow-hidden px-2 py-2 max-xl:p-0">
                    <span className="max-xl:hidden">
                      {n.decision ? <NoteBadges n={n} only="decision" /> : <span className="t-caption text-text-3">—</span>}
                    </span>
                  </td>
                )}
                <td className="overflow-hidden px-3 py-2 text-right t-sub tabular-nums text-text-2 max-md:p-0">
                  <span className="max-md:hidden">{(n.photoCount ?? 0) > 0 ? `${n.photoCount}장` : "—"}</span>
                </td>
              </tr>
              {isOpen && (
                <tr id={panelId} className="border-b border-line last:border-b-0">
                  <td colSpan={span} className="bg-bg p-2 md:p-3">
                    <PostCard n={n} />
                    <FoldButton onClose={() => setOpenId(null)} label={n.title} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeftRail({
  loggedIn,
  mine,
  hasBestMonth,
  onTab,
  regions,
  regionPick,
  onRegion,
}: {
  loggedIn: boolean | null;
  mine: boolean;
  hasBestMonth: boolean;
  onTab: (t: NotesTab) => void;
  regions: Array<{ label: string; count: number }>;
  regionPick: string | null;
  onRegion: (r: string | null) => void;
}) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="임장노트 바로가기">
      <div className="flex flex-col gap-2">
        <Link href="/notes/new" className="btn-primary btn-cta flex min-h-[44px] items-center justify-center rounded-xl t-body no-underline">
          노트 쓰기
        </Link>
        <Link
          href="/notes/new?quick=1"
          className="flex min-h-[40px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-strong bg-surface t-sub font-bold text-text-1 no-underline"
        >
          현장 퀵 기록
        </Link>
      </div>
      <nav className="card flex flex-col gap-0.5 rounded-2xl p-2">
        <button type="button" onClick={() => onTab("public")} aria-current={!mine ? "page" : undefined} className={`${RAIL_LINK} ${!mine ? "bg-primary-soft text-primary" : ""}`}>
          <Icon name="users" size={17} />
          공개 노트
        </button>
        {loggedIn && (
          <button type="button" onClick={() => onTab("mine")} aria-current={mine ? "page" : undefined} className={`${RAIL_LINK} ${mine ? "bg-primary-soft text-primary" : ""}`}>
            <Icon name="notebook-pen" size={17} />
            내 노트
          </button>
        )}
        {hasBestMonth && (
          <Link href="/notes/best" className={RAIL_LINK}>
            <Icon name="trophy" size={17} />
            이달의 임장노트
          </Link>
        )}
        <Link href="/notes/compare" className={RAIL_LINK}>
          <Icon name="scale" size={17} />
          노트 비교
        </Link>
        {/* [1027] "노트 템플릿"(/notes/templates) 링크는 내렸다 — 992 에서 보관한 경로다(입구를 닫고 noindex · lib/seo/archived-routes).
            보관 경로로 가는 입구가 이 레일에만 남아 있었다. */}
        <Link href="/imjang" className={RAIL_LINK}>
          <Icon name="compass" size={17} />
          임장 가이드
        </Link>
      </nav>
      {regions.length > 1 && (
        <div className="card rounded-2xl p-2">
          <p className="px-2.5 pb-1 pt-1 t-caption font-bold text-text-3">지역</p>
          <button
            type="button"
            onClick={() => onRegion(null)}
            className={`${RAIL_LINK} min-h-[36px] justify-between t-sub ${regionPick === null ? "text-primary" : "text-text-2"}`}
          >
            전체
          </button>
          {/* [1049] 지역별 노트 수를 막대로 — 숫자만 있던 줄에 길이를 더했다(가장 많은 지역 = 가득) */}
          {regions.map((r) => {
            const top = Math.max(...regions.map((x) => x.count), 1);
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => onRegion(regionPick === r.label ? null : r.label)}
                aria-pressed={regionPick === r.label}
                className={`${RAIL_LINK} min-h-[36px] w-full gap-2 t-sub ${regionPick === r.label ? "bg-primary-soft text-primary" : "text-text-2"}`}
              >
                <span className="w-16 shrink-0 truncate text-left">{r.label}</span>
                <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-primary/60" style={{ width: `${(r.count / top) * 100}%` }} />
                </span>
                <span className="w-5 shrink-0 text-right t-caption tabular-nums text-text-3">{r.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/* ── [1016] 데스크톱 오른쪽 레일(페이스북 오른쪽 목록) — 최근 임장(스토리 줄의 세로판) · 광고 ── */
function RightRail({ notes, ad }: { notes: FeedNote[]; ad: ReactNode }) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="최근 임장">
      {notes.length > 0 && (
        <div className="card rounded-2xl p-2">
          <p className="px-2.5 pb-1 pt-1 t-caption font-bold text-text-3">최근 임장</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {notes.slice(0, 8).map((n) => (
              <li key={n.id}>
                <Link href={noteHref(n)} className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-1 no-underline hover:bg-bg">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-bg">
                    <CoverImage
                      src={n.coverUrl}
                      alt=""
                      sizes="36px"
                      imgClassName="h-full w-full object-cover"
                      fallback={
                        <span className="flex h-full w-full items-center justify-center t-caption font-bold text-ink" style={{ background: seedGradient(n.id) }}>
                          {shortLabel(n).slice(0, 2)}
                        </span>
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate t-sub font-bold text-ink">{shortLabel(n)}</span>
                    <span className="block truncate t-caption text-text-3">{n.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ad}
    </aside>
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
            fill={active ? "currentColor" : "var(--border-strong)"}
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
          fill={active ? "currentColor" : "var(--border-strong)"}
        />
      ))}
    </svg>
  );
}

function ListGlyph({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[4, 10.5, 17].map((y) => (
        <rect key={y} x="3" y={y} width="18" height="3" rx="1" fill={active ? "currentColor" : "var(--border-strong)"} />
      ))}
    </svg>
  );
}

/** [1007] URL 의 내 노트 탭 판정 — ?tab=mine(세그먼트) 또는 ?mine=1(/my 진입로) */
function wantsMineTab(search: string): boolean {
  try {
    const sp = new URLSearchParams(search);
    return sp.get("tab") === "mine" || sp.get("mine") === "1";
  } catch {
    return false;
  }
}

export function NotesFeedClient({
  notes: publicNotes,
  mine: mineProp,
  loadError = null,
  showInterestFilter: showInterestFilterProp,
  loggedIn: loggedInProp,
  hasMore = false,
  pageSize = 30,
  hasBestMonth = false,
  ad = null,
  adSide = null,
}: {
  /** [1016] 데스크톱 오른쪽 레일 광고(placement="sidebar") — page.tsx 가 넘긴다 */
  adSide?: ReactNode;
  /** [1015 · 규칙 G] 페이지 끝 광고 자리 — 서버(page.tsx)가 <AdZone placement="page_bottom"> 을 넘긴다. 폰·데스크톱 각 1곳 */
  ad?: ReactNode;
  /** 서버가 그린 공개 첫 페이지(모두에게 같은 값 — ISR HTML) */
  notes: FeedNote[];
  /** 내 노트 뷰(?mine=1 · ?tab=mine). [1007] 생략하면 마운트 뒤 URL·세션으로 판정한다 */
  mine?: boolean;
  /** 조회 자체가 실패했을 때의 사유. "노트가 없다" 와 반드시 구분해 표시한다. */
  loadError?: string | null;
  /** 지역 알림 구독이 1건 이상일 때만 true. false 면 "내 관심 지역" 칩을 아예 감춘다.
      [1007] 생략하면 세션 판정 뒤 /api/me/alerts 로 읽는다 */
  showInterestFilter?: boolean;
  /** [967 · 20] 로그인 상태 — 세그먼트(공개/내 노트)는 로그인했을 때만 그린다.
      [1007] 생략하면 세션 프로브(헤더와 공유, 요청 0 추가)로 판정한다 */
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
  /* [1050 · 펼침] 폰 격자에서 펼친 노트(한 번에 하나) */
  const [gridOpen, setGridOpen] = useState<string | null>(null);
  /* [1049] 데스크톱 보기(표 기본) — 고른 보기는 이 브라우저에만 기억(저장소가 막혀도 표로 그린다) */
  const [deskView, setDeskViewState] = useState<DeskView>("table");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DESK_VIEW_KEY);
      if (v === "feed" || v === "table") setDeskViewState(v);
    } catch {
      /* 저장소 차단 — 기본(표) */
    }
  }, []);
  const setDeskView = (v: DeskView) => {
    setDeskViewState(v);
    try {
      window.localStorage.setItem(DESK_VIEW_KEY, v);
    } catch {
      /* 저장소 차단 — 이번 화면만 */
    }
  };
  /* [1016] 데스크톱 왼쪽 레일의 지역 — 지금 목록에 있는 지역(구·동 짧은 라벨)만, 많은 순 8개 */
  const [regionPick, setRegionPick] = useState<string | null>(null);
  /* [1023 · 임장노트 ①] 검색칸 — 제목·지역·단지명 클라이언트 필터(lib/notes/feed-search). 추가 조회 없음.
     "더 보기" 로 받은 카드도 allNotes 에 합쳐지므로 그대로 걸린다. 지역 칩(regionPick)과 AND. */
  const [query, setQuery] = useState("");

  /* ── [1007] 보는 사람·탭 — 서버(ISR)는 비로그인 공개 피드만 그린다. 마운트 뒤:
       ① 세션 프로브(공유 프라미스) → 로그인이면 세그먼트를 그리고 /api/me/alerts 로 관심 지역을 읽어
          공개 카드의 interested 를 다시 판정한다(lib/notes/region-match — 서버 빌더와 같은 규칙).
       ② URL 이 내 노트 탭이면(?tab=mine · ?mine=1): 비로그인은 예전 서버 redirect 와 같은 목적지
          (/login?callbackUrl=/notes?tab=mine)로, 로그인은 /api/inspection/notes/mine 으로 받는다.
       세그먼트 전환은 history.replaceState 로 URL 만 바꾼다 — useSearchParams 는 정적 셸에서
       Suspense 없이는 프리렌더 HTML 에서 피드가 사라진다(/town/news 실측). */
  const [loggedIn, setLoggedIn] = useState<boolean | null>(loggedInProp ?? null);
  const [interestRegions, setInterestRegions] = useState<string[] | null>(null);
  const [tab, setTab] = useState<NotesTab | null>(mineProp === undefined ? null : mineProp ? "mine" : "public");
  const [mineState, setMineState] = useState<{
    status: "idle" | "loading" | "ok" | "error";
    notes: FeedNote[];
    error: string | null;
  }>({ status: "idle", notes: [], error: null });

  const loadMine = async () => {
    setMineState((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const res = await fetch("/api/inspection/notes/mine", { cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent("/notes?tab=mine")}`);
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        items?: FeedNote[];
        interestRegions?: string[];
        error?: string;
      } | null;
      if (!res.ok || !Array.isArray(data?.items)) {
        /* 빈 배열로 삼키면 "아직 쓴 노트가 없어요"가 뜬다 — 내가 쓴 기록이 사라진 것처럼
           보이는 화면이다. 공개 피드와 같은 방식으로 실패를 적는다. */
        setMineState({ status: "error", notes: [], error: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      if (Array.isArray(data.interestRegions)) setInterestRegions(data.interestRegions);
      setMineState({ status: "ok", notes: data.items, error: null });
    } catch (e) {
      setMineState({ status: "error", notes: [], error: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const wantMine = mineProp ?? wantsMineTab(window.location.search);
    void getSessionLite().then(async (s) => {
      if (cancelled) return;
      const authed = loggedInProp ?? Boolean(s?.user?.email);
      setLoggedIn(authed);
      if (!authed) {
        if (wantMine) {
          router.replace(`/login?callbackUrl=${encodeURIComponent("/notes?tab=mine")}`);
          return;
        }
        setTab("public");
        return;
      }
      setTab(wantMine ? "mine" : "public");
      if (wantMine) void loadMine();
      if (showInterestFilterProp === undefined) {
        try {
          const r = await fetch("/api/me/alerts", { cache: "no-store" });
          const j = r.ok
            ? ((await r.json().catch(() => null)) as { items?: { type: string; value: string }[] } | null)
            : null;
          if (cancelled) return;
          /* 구독 조회 실패 — 칩을 숨겨 "관심 지역에 노트가 없다"고 단정하지 않는다 */
          setInterestRegions(
            Array.isArray(j?.items)
              ? j.items.filter((x) => x.type === "region").map((x) => x.value)
              : [],
          );
        } catch {
          if (!cancelled) setInterestRegions([]);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mine = tab === "mine";
  const showInterestFilter =
    showInterestFilterProp ?? (interestRegions !== null && interestRegions.length > 0);
  /* 공개 카드의 관심 지역 표식 — 서버는 사용자별 값을 모른다(ISR). 로그인 사용자의 구독 지역으로 다시 판정 */
  const notes = useMemo<FeedNote[]>(() => {
    if (mine) return mineState.notes;
    if (!interestRegions || interestRegions.length === 0) return publicNotes;
    return publicNotes.map((n) => ({ ...n, interested: matchesInterest(n.region, interestRegions) }));
  }, [mine, mineState.notes, publicNotes, interestRegions]);
  const activeLoadError = mine ? mineState.error : loadError;

  /* [967 · 19] "더 보기" 로 이어 붙인 카드 — 서버 첫 페이지(props) 뒤에 붙는다.
     필터·정렬은 합친 목록에 건다(붙인 카드도 관심 지역·점수순을 똑같이 따른다). */
  const [extra, setExtra] = useState<FeedNote[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(!hasMore);
  /* [1006] useMemo — 아래 mineFilterOptions 의 의존성이라 렌더마다 새 배열이면 매번 다시 센다 */
  const allNotes = useMemo(() => (extra.length > 0 ? [...notes, ...extra] : notes), [notes, extra]);
  const exampleOnly = allNotes.length > 0 && allNotes.every((n) => n.isExample);
  /* [966] 상세 → 뒤로가기 스크롤 복원. 노트는 서버가 내려준 props 라 첫 렌더에 이미
     그려져 있다(ready) — 타일은 정사각 고정 비율이라 사진이 늦게 와도 높이가 안 변한다([1018] 3:4 → 1:1, 표지가 720 정사각이라 양옆이 잘렸다). */
  useScrollRestore(useScrollRestoreKey(), notes.length > 0);

  /* 구독 지역이 없으면 "내 관심 지역" 은 무엇을 눌러도 0건이라 칩 자체를 숨긴다.
     비활성 상태로 남겨 두면 눌리는데 아무 일도 안 하는 컨트롤이 된다. */
  const filters = FILTERS.filter((f) => f !== "내 관심 지역" || showInterestFilter);
  const activeFilter = filters.includes(filter) ? filter : "최신";

  /* [1006] 내 노트 뷰 — 정렬·판단·지역·기간(방문일) 필터. 규칙은 lib/notes/mine-filters(순수),
     칩은 실제로 있는 값만. 공개 피드는 종전 칩(최신·점수순·관심 지역) 그대로 — 남의 노트에
     판단·AI 상태 필터를 거는 건 다른 화면의 일이다. */
  const [mineFilters, setMineFilters] = useState<MineFilters>(DEFAULT_MINE_FILTERS);
  const mineOptions = useMemo(() => (mine ? mineFilterOptions(allNotes) : null), [mine, allNotes]);
  const mineActive = mine && hasActiveMineFilter(mineFilters);

  const sorted = mine
    ? applyMineFilters(allNotes, mineFilters)
    : activeFilter === "점수순"
      ? [...allNotes].sort((a, b) => b.score - a.score)
      : activeFilter === "내 관심 지역"
        ? allNotes.filter((n) => n.interested)
        : allNotes;
  const regionFiltered = regionPick ? sorted.filter((n) => shortLabel(n) === regionPick) : sorted;
  /* [1023 · 임장노트 ①] 검색어는 지역 칩 뒤에 AND 로 — 둘 다 걸린 카드만 */
  const queryActive = query.trim().length > 0;
  const visible = queryActive ? filterNotesByQuery(regionFiltered, query) : regionFiltered;
  /* [1023 · 임장노트 ①] 내 노트 회차 묶기 — 같은 단지 2건 이상이면 묶음(피드 카드 배열에서만 · 폰 격자는 낱장) */
  const mineGroups = useMemo(() => (mine ? groupNoteRounds(visible) : null), [mine, visible]);
  const railRegions = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of allNotes) {
      const k = shortLabel(n);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
      .slice(0, 8);
  }, [allNotes]);

  /* [967 · 20] 세그먼트 → URL(?tab=mine). [1007] 내 노트는 /api/inspection/notes/mine 으로 받고,
     URL 은 history.replaceState 로만 바꾼다(페이지는 ISR — 서버 렌더를 다시 받을 것이 없다).
     예전의 key 리마운트가 하던 일(필터·더 보기 누적 초기화)은 여기서 직접 한다. */
  const switchTab = (next: NotesTab) => {
    if ((next === "mine") === mine) return;
    try {
      window.history.replaceState(window.history.state, "", next === "mine" ? "/notes?tab=mine" : "/notes");
    } catch {
      /* 주소 갱신 실패는 화면 전환을 막지 않는다 */
    }
    setFilter("최신");
    setRegionPick(null);
    setQuery("");
    setMineFilters(DEFAULT_MINE_FILTERS);
    setExtra([]);
    setMoreError(null);
    setReachedEnd(!hasMore);
    setTab(next);
    if (next === "mine" && mineState.status !== "ok") void loadMine();
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
        setMoreError("더 불러오기 실패 · 잠시 후 다시");
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
      {/* [1005] 안쪽 폭 1240 — 홈·PageShell 과 같은 컨테이너(예전 1120 은 이 화면만 좁았다). */}
      {/* [1016] 데스크톱(lg+)은 페이스북 3단 — 왼쪽 바로가기 240 · 가운데 피드(최대 640) · 오른쪽 최근 임장 300.
          폰·태블릿은 전과 같은 한 열(스토리 줄 + 격자/피드). */}
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:items-start lg:gap-6">
      <LeftRail
        loggedIn={loggedIn}
        mine={mine}
        hasBestMonth={hasBestMonth}
        onTab={switchTab}
        regions={mine ? [] : railRegions}
        regionPick={regionPick}
        onRegion={setRegionPick}
      />
      {/* [1015 · 규칙 E] 폰 섹션 간격 gap-4 → gap-3 */}
      <div className="flex w-full flex-col gap-3 md:gap-4 lg:mx-auto lg:max-w-[640px]">
        {/* 헤더 — [1022 · 정렬·글씨·테마] 공용 PageHead(아이콘 칩 40 · h1.t-title · 사실 한 줄 | 오른쪽 세그먼트·링크).
            [967 · 20] 공개/내 노트 세그먼트는 로그인했을 때만. [1015 · 규칙 C] 부연 문장은 없고 사실 한 줄만. */}
        <PageHead
          icon="notebook-pen"
          title={mine ? "내 임장노트" : "공개 임장노트"}
          sub={
            mine
              ? "내가 남긴 임장노트 · 비공개 포함"
              : "직접 다녀온 사람의 공개 기록 · 단지별 항목 점수 · 현장 메모"
          }
          className="px-1"
          actions={
            <>
              {loggedIn && (
                <Segmented<NotesTab>
                  options={TAB_OPTIONS}
                  value={mine ? "mine" : "public"}
                  onChange={switchTab}
                  ariaLabel="노트 범위"
                />
              )}
              {/* [1016] lg+ 는 왼쪽 레일에 같은 링크가 있다 */}
              {!mine && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 t-sub lg:hidden">
                  {/* [970 · B-25] 뽑힌 달이 하나라도 있을 때만 — 빈 화면으로 보내지 않는다 */}
                  {hasBestMonth && (
                    <Link href="/notes/best" className="tap-line font-bold text-primary underline">
                      이달의 임장노트 ›
                    </Link>
                  )}
                  {/* 임장 가이드(전략 §4-2) — 기록 허브에서 준비 허브로 잇는다 */}
                  <Link href="/imjang" className="tap-line font-bold text-primary underline">
                    임장 가이드 ›
                  </Link>
                  {/* [970 · B-25] 리포트 진열대(/notes/market) 링크는 뺐다 — 판매 오픈 전 잠금 화면 */}
                </span>
              )}
            </>
          }
        />

        {/* 조회 실패 — 이 경우 "노트가 없다" 고 읽히면 안 되므로 빈 상태와 분리한다 */}
        {activeLoadError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3.5 py-3 t-sub text-text-2">
            <span>
              {mine ? "내 임장노트를" : "공개 임장노트를"}{" "}
              <strong className="text-ink">불러오기 실패</strong>. 잠시 후 다시 시도해 주세요.
            </span>
            {/* [1023 · 임장노트 ②] 내 노트 조회 실패 — 같은 자리에서 다시 시도(loadMine 재호출). 공개 피드는 서버 렌더라 손잡이 없음 */}
            {mine && (
              <button
                type="button"
                onClick={() => void loadMine()}
                className="btn-outline btn-md shrink-0"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* 스토리 줄 */}
        {/* [1016] lg+ 는 오른쪽 레일 "최근 임장" 이 같은 목록을 세로로 보여 준다 */}
        {visible.length > 0 && (
          <div className="lg:hidden">
            <StoryRail notes={visible} />
          </div>
        )}

        {/* 필터 칩 + 뷰 전환. [1006] 내 노트가 0건이면 필터·뷰 전환을 그리지 않는다 — 고를 것이 없다 */}
        {(!mine || allNotes.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {/* [1023 · 임장노트 ①] 검색칸 — 필터 칩 줄 왼쪽(폰은 한 줄 통째, sm+ 는 왼쪽 220px). 높이 40 · 지우기 × 40px.
              제목·지역·단지명을 손에 든 목록에서 즉시 거른다(추가 조회 없음). */}
          <div className="field-focus relative flex h-10 basis-full items-center rounded-xl border border-line bg-surface sm:w-[220px] sm:basis-auto">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 text-text-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="단지 · 지역 · 제목"
              aria-label="노트 검색"
              enterKeyHint="search"
              autoComplete="off"
              className="h-10 w-full min-w-0 bg-transparent pl-9 pr-10 t-body text-ink outline-none placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {queryActive && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-0 flex h-10 w-10 items-center justify-center text-text-3"
              >
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          {mine ? (
            /* [1006] 내 노트 — 필터는 아래 전용 줄(MineFilterBar). 여기엔 뷰 전환만 */
            <span className="t-caption text-text-3">보기 방식</span>
          ) : (
          <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 t-body [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          )}
          {/* [1016] 격자/피드 전환은 폰에서만 — md+ 는 항상 게시물 피드(페이스북 구성) */}
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            <button
              type="button"
              aria-label="그리드 보기"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
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
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                view === "feed" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <FeedGlyph active={view === "feed"} />
            </button>
            {/* [1049] 목록(표) — 사진 없이 한 줄씩 */}
            <button
              type="button"
              aria-label="목록 보기"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                view === "table" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <ListGlyph active={view === "table"} />
            </button>
          </div>
          {/* [1049] 데스크톱 보기 전환 — 표(기본) · 피드(사진 카드) */}
          <div className="hidden shrink-0 items-center gap-1 rounded-full bg-bg p-0.5 md:flex" role="group" aria-label="보기">
            {(["table", "feed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={deskView === v}
                onClick={() => setDeskView(v)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 t-sub font-bold ${
                  deskView === v ? "bg-surface text-ink shadow-sm" : "text-text-3"
                }`}
              >
                {v === "table" ? <ListGlyph active={deskView === v} /> : <FeedGlyph active={deskView === v} />}
                {v === "table" ? "표" : "피드"}
              </button>
            ))}
          </div>
          </div>
        </div>
        )}

        {/* [1006] 내 노트 필터 줄 — 정렬 · 판단 · 지역 · 기간(방문일) */}
        {mine && mineOptions && allNotes.length > 0 && (
          <MineFilterBar
            value={mineFilters}
            options={mineOptions}
            total={allNotes.length}
            shown={visible.length}
            onChange={setMineFilters}
            onReset={() => setMineFilters(DEFAULT_MINE_FILTERS)}
          />
        )}

        {/* 예시 안내 */}
        {exampleOnly && (
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 t-sub text-text-3">
            <ExampleBadge />
            <span>공개 임장노트 0건. 아래는 샘플 1건.</span>
          </div>
        )}

        {/* 본문: 그리드 / 피드 / 빈 상태. [1007] 내 노트는 받는 중이면 빈 상태 대신 안내 — "없어요"를 먼저 말하지 않는다 */}
        {mine && (mineState.status === "idle" || mineState.status === "loading") ? (
          <p role="status" aria-busy="true" className="py-8 text-center t-sub text-text-3">
            내 임장노트를 불러오는 중…
          </p>
        ) : visible.length === 0 ? (
          /* 빈 상태를 한 문장으로 뭉뚱그리면 "노트가 없다"와 "필터가 걸러 냈다"가
             섞인다. 노트는 있는데 필터 결과만 0건인 경우를 따로 적는다. */
          allNotes.length > 0 ? (
            queryActive ? (
              /* [1023 · 임장노트 ①] 검색어가 걸러 낸 0건 — 다음 행동은 "지우기". 지역 칩이 같이 걸려 있으면 그것도 적는다 */
              <div className="flex flex-col items-center gap-2">
                <EmptyState
                  icon="search"
                  title="검색어에 맞는 노트 없음"
                  desc={`노트 ${allNotes.length}건 중 0건 · "${query.trim()}"${regionPick ? ` · 지역 ${regionPick}` : ""}`}
                  className="w-full"
                />
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="btn-soft px-5 py-2.5 t-body font-bold"
                >
                  검색어 지우기
                </button>
              </div>
            ) : mineActive ? (
              /* [1006] 내 노트 — 필터가 걸러 낸 0건. 다음 행동은 "쓰기"가 아니라 "필터 지우기"다 */
              <div className="flex flex-col items-center gap-2">
                <EmptyState
                  icon="file-text"
                  title="이 조건에 맞는 내 노트 없음"
                  desc={`내 노트 ${allNotes.length}건 중 0건.`}
                  className="w-full"
                />
                <button
                  type="button"
                  onClick={() => setMineFilters(DEFAULT_MINE_FILTERS)}
                  className="btn-soft px-5 py-2.5 t-body font-bold"
                >
                  필터 지우기
                </button>
              </div>
            ) : (
            <EmptyState
              icon="file-text"
              title={
                activeFilter === "내 관심 지역"
                  ? "구독한 지역의 노트는 아직 없어요"
                  : "해당 필터에 맞는 노트 없음"
              }
              desc={
                activeFilter === "내 관심 지역"
                  ? `노트 ${allNotes.length}건 중 구독 지역과 겹치는 건 0건. '최신' 칩에서 전체를 볼 수 있어요.`
                  : "다른 칩을 고르면 전체를 볼 수 있어요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
            )
          ) : (
            <EmptyState
              icon="file-text"
              title={
                mine
                  ? "작성한 임장노트 없음"
                  : "공개된 임장노트 없음"
              }
              desc={
                mine
                  ? "첫 노트를 쓰면 비공개 노트까지 여기에 모여요."
                  : "샘플로 채우지 않아요. 첫 노트를 쓰거나 지도에서 단지를 먼저 볼 수 있어요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          )
        ) : (
          <>
            {/* 폰 격자 보기: 가장자리까지 붙는 촘촘한 3열(인스타 앱). md+ 에서는 그리지 않는다(아래 피드가 항상) */}
            {view === "grid" && (
              <div className="-mx-3.5 grid grid-flow-row-dense grid-cols-3 gap-0.5 md:hidden">
                {/* [968 · 17] 첫 타일만 priority — 폰 격자 첫 칸(LCP 후보) */}
                {/* [1050 · 펼침] 누른 타일 줄 바로 아래 피드 카드 — 같은 줄의 나머지 타일은 dense 로 제 줄에 남는다 */}
                {visible.map((n, i) => (
                  <Fragment key={n.id}>
                    <GridTile n={n} priority={i === 0} open={gridOpen === n.id} onOpen={() => setGridOpen(n.id)} />
                    {gridOpen === n.id && (
                      <div id={`grid-open-${n.id}`} className="col-span-3 bg-bg px-2 pb-1 pt-2">
                        <PostCard n={n} />
                        <FoldButton onClose={() => setGridOpen(null)} label={n.title} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
            {/* [1049] 표 — 폰은 목록 보기일 때, md+ 는 데스크톱 보기가 표일 때(기본) */}
            <div className={`${view === "table" ? "block" : "hidden"} ${deskView === "table" ? "md:block" : "md:hidden"}`}>
              <NotesTable notes={visible} />
            </div>
            {/* [1016] 게시물 피드 — 폰은 피드 보기일 때, md+ 는 데스크톱 보기가 피드일 때.
                숨긴 사진은 lazy 라 내려받지 않는다(priority 는 격자 첫 칸이 맡는다). */}
            <div className={`flex-col gap-4 md:gap-4 ${view === "feed" ? "flex" : "hidden"} ${deskView === "feed" ? "md:flex" : "md:hidden"}`}>
              {mineGroups
                ? /* [1023 · 임장노트 ①] 내 노트 — 같은 단지 2건 이상은 묶음 카드(접힘), 나머지는 낱장 */
                  mineGroups.map((g, i) =>
                    g.kind === "single" ? (
                      <PostCard key={g.note.id} n={g.note} priority={view === "feed" && i === 0} />
                    ) : (
                      <RoundGroupCard key={`group-${g.key}`} aptName={g.aptName} notes={g.notes} latestVisit={g.latestVisit} />
                    ),
                  )
                : visible.map((n, i) => (
                    <PostCard key={n.id} n={n} priority={view === "feed" && i === 0} />
                  ))}
            </div>
          </>
        )}

        {/* [967 · 19] 더 보기 — 공개 뷰에서만(내 노트는 listNotes 가 200건까지 한 번에 준다).
            첫 페이지가 꽉 찼을 때만 버튼을 그리고, 짧은 응답이 오면 "마지막이에요" 로 닫는다.
            버튼은 목록 아래 제자리라 스크롤 위치가 그대로 유지된다(위로 튀지 않는다). */}
        {!mine && !activeLoadError && hasMore && allNotes.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-1">
            {reachedEnd ? (
              <p role="status" className="t-sub text-text-3">
                {allNotes.length}건 모두 표시
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="btn-soft px-5 py-2.5 t-body font-bold disabled:opacity-60"
              >
                {/* [1023 · 임장노트 ②] 실패 뒤에는 같은 버튼이 "다시 시도" — 눌러야 한다는 걸 라벨이 말한다(loadMore 재호출) */}
                {loadingMore ? "불러오는 중…" : moreError ? "다시 시도" : "더 보기"}
              </button>
            )}
            {moreError && (
              <p role="alert" className="t-sub font-bold text-danger">
                {moreError}
              </p>
            )}
          </div>
        )}

        {/* [1015 · 규칙 G] 광고 — 목록이 끝난 뒤 한 곳(폰·데스크톱 같은 자리). 첫 화면·스토리 줄·격자 사이에는 없다.
            공개 목록에 노트가 있을 때만(빈 화면·오류 화면에 광고를 두지 않는다). */}
        {!mine && !activeLoadError && visible.length > 0 && ad}

        {/* 모바일 전용 노트 쓰기 CTA — [#68] 현장 퀵 기록 나란히.
            [1005] 퀵 기록은 이제 진짜 한 화면 플로우(/notes/new?quick=1). 두 버튼 모두 램프
            글자(t-section/t-body)·높이 52px 로 맞추고, 손으로 적은 브랜드 블루 그림자는
            .btn-cta(--shadow-cta 토큰)로 바꿨다 — 다크·테마 변형에서도 맞는다. */}
        <div className="rise-in-2 mx-auto flex w-full max-w-[468px] gap-2 md:hidden">
          <Link
            href="/notes/new"
            className="btn-primary btn-cta flex min-h-[52px] flex-1 items-center justify-center rounded-2xl px-4 py-3 text-center t-section no-underline"
          >
            노트 쓰기
          </Link>
          <Link
            href="/notes/new?quick=1"
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-line-strong bg-surface px-4 py-3 text-center t-body font-bold text-text-1 no-underline"
          >
            현장 퀵 기록
          </Link>
        </div>
      </div>
      <RightRail notes={mine ? [] : visible} ad={mine ? null : adSide} />
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
