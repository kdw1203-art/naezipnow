"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionLite } from "@/lib/client/session-lite";
import { matchesInterest } from "@/lib/notes/region-match";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import {
  RECENT_DAYS,
  feedHeaderStats,
  hasRecentNote,
  regionChipOf,
  regionHighlights,
  type FeedStat,
  type RegionHighlight,
} from "./region-chips";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Segmented } from "@/app/components/ui/Segmented";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";
import { ShareLinkButton } from "@/app/components/ShareLinkButton";
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

/* 공개 임장노트 — 머리 숫자 줄 + 지역 하이라이트 줄 + 격자/피드 탭 + 3열 정사각 격자 ⇄ 게시물 피드.
   [1012] "인스타그램형(스토리 줄)" 이었다 — 원형 아바타 + 그라데이션 링은 다른 서비스의 서명이라(AI 신호표
   "인스타그램식 스토리 링") 걷고, 지역명 + 노트 수 칩 레일로 바꿨다.
   [1012-IG] 소유자 지시 "임장노트는 인스타그램을 참조해줘"(범위: 이 목록만 · 기본 보기 3열 격자) —
   **배치와 흐름만** 가져온다. 로고·그라데이션 링·그 서비스의 아이콘 모양·"스토리" 같은 이름은 쓰지 않는다.
     · 머리 숫자 줄(노트 · 지역 · 최근 7일) — 손에 든 노트를 센 실값, 0 인 칸은 없다
     · 지역 원 줄 — 원 안은 그 지역 최근 노트의 실사진(없으면 한지 면 + 짧은 지역명), 최근 7일 새 노트 =
       주홍 **단색** 링, 선택 = 남색 링(선택 = 한지·남색 규칙)
     · 격자/피드 탭 — 폭 전체를 반씩 나눈 아이콘 탭, 현재 탭 = 잉크 + 1px 잉크 선
     · 격자 — 정사각 3열, 모바일은 화면 끝까지 2px 간격, 반경·테두리·그림자 0
     · 피드 — 머리줄(아바타 · 작성자 · 단지·지역) → 정사각 사진 → 행동 줄(동작하는 것만) → 숫자 → 캡션 → 시각
   숫자는 전부 실데이터에서만. 저장 수·댓글 수·좋아요는 이 목록 데이터에 없어서 그리지 않는다(지어내지 않는다). */

/* [967 · 19] 카드 타입은 lib/notes/feed-note 로 올렸다(서버 빌더와 한 곳) — 기존
   import 경로(./notes-feed-client 의 FeedNote)는 재수출로 그대로 산다. */
export type { FeedNote, TagTone };

/** [967 · 20] 공개/내 노트 세그먼트 값 — URL 의 ?tab= 과 1:1 */
type NotesTab = "public" | "mine";
const TAB_OPTIONS: ReadonlyArray<{ value: NotesTab; label: string }> = [
  { value: "public", label: "공개 노트" },
  { value: "mine", label: "내 노트" },
];

/* 정렬·필터 토글.
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
function NoteBadges({ n, onDark = false }: { n: FeedNote; onDark?: boolean }) {
  if (!n.decision && n.round == null && !n.aiStatus) return null;
  /* [1012] 규칙 9 — 배지는 11px/500, 4px. 사진 위는 네이비 반투명(블러 없음 — 유리는 헤더 전용). */
  const onDarkClass = "bg-brand-navy/80 text-on-dark";
  return (
    <>
      {n.decision && (
        <span
          className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-px t-caption font-medium ${
            onDark ? onDarkClass : DECISION_BADGE_CLASS[n.decision.choice]
          }`}
        >
          {n.decision.label}
        </span>
      )}
      {n.round != null && (
        <span
          className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-px t-caption font-medium ${
            onDark ? onDarkClass : "border border-line text-text-3"
          }`}
        >
          {n.round}회차
        </span>
      )}
      {n.aiStatus && (
        <span
          className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-px t-caption font-medium ${
            onDark ? onDarkClass : AI_BADGE_CLASS[n.aiStatus]
          }`}
        >
          {LIST_AI_STATE_LABEL[n.aiStatus]}
        </span>
      )}
    </>
  );
}

/** 시드 문자열 → 결정적 단색(사진 없는 노트의 면).
 *  [1012] hue 무작위 그라데이션을 걷었다 — 기준 사이트에 배경 그라데이션이 없고, 무작위 색은
 *  "생성된 자리표시자"로 읽힌다. 브랜드 면 셋 중 하나를 시드로 고른다. */
function seedFace(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const FACES = ["var(--brand-hanji)", "var(--primary-soft)", "var(--divider)"];
  return FACES[h % FACES.length];
}

/** [1012-IG] 작성 시각 상대 라벨 — 서버 빌더(lib/notes/feed-note relativeTime)와 같은 옵션.
 *  `now` 는 첫 렌더에 서버가 그린 시각(hydration 일치), 마운트 뒤 지금 시각으로 바뀐다.
 *  ISR(1일) HTML 에 박힌 "방금 전" 이 하루 동안 남지 않게 여기서 다시 센다. */
function writtenAgo(n: FeedNote, now: number): string {
  if (!n.createdAt || !Number.isFinite(now)) return "";
  return relativeTimeLabel(n.createdAt, now, { yesterday: true, maxDays: 31, fallback: "iso-date" });
}

/** 카드·타일이 말할 수 있는 숫자 — 값이 있는 것만(0 은 빼고, 없는 반응 수는 만들지 않는다) */
function noteNumbers(n: FeedNote): string[] {
  const photos = n.photoCount ?? 0;
  return [n.score > 0 ? `기록 ${n.score}점` : "", photos > 0 ? `사진 ${photos}장` : ""].filter(Boolean);
}

/* ── 머리 숫자 줄 ──
   [1012-IG] 굵은 숫자 위 · 작은 라벨 아래, 칸 균등(3칸 격자)·왼쪽 정렬. 값은 region-chips.feedHeaderStats
   (손에 든 노트를 센 값) — 0 인 칸은 거기서 이미 빠진다. */
function StatRow({ stats }: { stats: FeedStat[] }) {
  if (stats.length === 0) return null;
  return (
    <dl className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.key} className="flex min-w-0 flex-col-reverse">
          <dt className="truncate t-sub text-text-2">{s.label}</dt>
          <dd className="t-section t-num text-ink">{s.value.toLocaleString("ko-KR")}{s.more ? "+" : ""}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 지역 하이라이트 원 한 개 ──
   [1012-IG] 원 64px(정확한 크기라 px 값 — 모바일 전역 축소를 받지 않는다). 링 두께가 1px/2px 로 바뀌어도
   안쪽 원이 54px 로 같도록 안쪽 여백을 4px/3px 로 맞춘다. 원 전체 + 라벨이 한 버튼이다. */
function HighlightCircle({
  name,
  short,
  count,
  coverUrl,
  fresh,
  active,
  ariaLabel,
  onClick,
}: {
  name: string;
  short: string;
  count: number;
  coverUrl: string | null;
  fresh: boolean;
  active: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  const ring = active
    ? "border-2 border-brand-hanji-ink"
    : fresh
      ? "border-2 border-brand-red"
      : "border border-line";
  const inset = active || fresh ? "inset-[3px]" : "inset-[4px]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className="press flex w-[72px] shrink-0 flex-col items-center gap-1.5"
    >
      <span className={`relative block h-[64px] w-[64px] rounded-full ${ring}`}>
        <span
          className={`absolute ${inset} flex items-center justify-center overflow-hidden rounded-full bg-brand-hanji`}
        >
          <CoverImage
            src={coverUrl}
            alt=""
            sizes="64px"
            imgClassName="absolute inset-0 h-full w-full object-cover"
            fallback={
              <span className="max-w-full truncate px-1 t-sub font-bold text-brand-hanji-ink">{short}</span>
            }
          />
        </span>
      </span>
      <span
        className={`flex max-w-full items-baseline gap-0.5 t-sub ${
          active ? "font-bold text-brand-hanji-ink" : "text-text-2"
        }`}
      >
        <span className="truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-text-3">{count}</span>
      </span>
    </button>
  );
}

/* ── 상단 지역 하이라이트 줄 ──
   [1012] 칩 레일("서울 송파구 3")이었다. [1012-IG] 원형 하이라이트 줄로 — 첫 원 = 전체, 이어서 노트가
   많은 지역부터. 누르면 그 지역만 남기고(전체로 해제) 주소(?region=)에도 남는다. 원 안 사진은 그 지역
   최근 노트의 실사진이고, 주홍 링은 최근 7일 안에 새 노트가 있다는 뜻이다(범례를 아래 한 줄로 적는다).
   [970 · B-04] 가장자리 붙이기는 PageShell 의 모바일 패딩(px-3.5)만큼만 — 더 빼면 가로 넘침이 생긴다. */
function RegionRail({
  items,
  total,
  allFresh,
  value,
  onChange,
}: {
  items: RegionHighlight[];
  total: number;
  allFresh: boolean;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  if (items.length === 0) return null;
  const freshNote = ` · 최근 ${RECENT_DAYS}일 새 노트 있음`;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label="지역별 노트"
        className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <HighlightCircle
          name="전체"
          short="전체"
          count={total}
          coverUrl={null}
          fresh={allFresh}
          active={value === null}
          ariaLabel={`전체 노트 ${total}건${allFresh ? freshNote : ""}`}
          onClick={() => onChange(null)}
        />
        {items.map((r) => {
          const active = value === r.label;
          return (
            <HighlightCircle
              key={r.label}
              name={r.name}
              short={r.short}
              count={r.count}
              coverUrl={r.coverUrl}
              fresh={r.fresh}
              active={active}
              ariaLabel={`${r.label} 노트 ${r.count}건${r.fresh ? freshNote : ""}`}
              onClick={() => onChange(active ? null : r.label)}
            />
          );
        })}
      </div>
      {/* [v4 · 설명 문장 삭제] 링 범례 문장은 뺐다 — 뜻은 각 원의 aria-label("최근 7일 새 노트")이 말한다 */}
    </div>
  );
}

/* ── 격자 / 피드 탭 ──
   [1012-IG] 오른쪽 작은 아이콘 토글 두 개였다 → 폭 전체를 반씩 나눈 아이콘 탭. 현재 탭 = 잉크 아이콘 +
   탭 위 1px 잉크 선(줄의 1px 구분선에 겹친다), 나머지 = text-3. 상태 표기는 aria-pressed 로 통일
   (아래 정렬 토글·지역 원과 같은 방식). 높이 44px 은 정확해야 하는 크기라 px 값. */
function ViewTabs({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const tabClass = (active: boolean) =>
    `-mt-px flex h-[44px] items-center justify-center gap-1.5 border-t ${
      active ? "border-ink text-ink" : "border-transparent text-text-3"
    }`;
  return (
    <div role="group" aria-label="보기 방식" className="-mx-3.5 grid grid-cols-2 border-t border-line md:mx-0">
      <button
        type="button"
        aria-pressed={value === "grid"}
        aria-label="격자로 보기"
        onClick={() => onChange("grid")}
        className={tabClass(value === "grid")}
      >
        <Icon name="grid-3x3" size={22} />
        <span className="hidden t-sub font-bold md:inline">격자</span>
      </button>
      <button
        type="button"
        aria-pressed={value === "feed"}
        aria-label="피드로 보기"
        onClick={() => onChange("feed")}
        className={tabClass(value === "feed")}
      >
        <Icon name="gallery-vertical" size={22} />
        <span className="hidden t-sub font-bold md:inline">피드</span>
      </button>
    </div>
  );
}

/* ── 격자 타일 ──
   [1012-IG] 3:4 둥근 카드(데스크톱 4~5열) → 정사각 3열, 반경·테두리·그림자 0.
     · 커버 = 노트의 실사진 첫 장. 없으면(또는 못 받으면) 브랜드 면 단색 위 단지명·지역(데이터 카드 썸네일)
     · 오른쪽 위 = 점수 칩(있을 때) + "여러 장" 선 아이콘(사진 2장 이상)
     · 왼쪽 아래 = 판단·회차·AI 배지(있을 때) + 단지명 한 줄. 사진 위에서만 가독 오버레이(검정→투명)
     · 호버(hover 가능 기기만 — Tailwind v4 의 hover 변형은 @media (hover: hover) 안이다) = 검정 40% + 숫자
   [968 · 17] priority — 목록 첫 타일(LCP 후보)만 true. */
function GridTile({ n, priority = false }: { n: FeedNote; priority?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(n.coverUrl) && !photoFailed;
  /* [1012 · 썸네일] 템플릿 썸네일은 제목·숫자를 그림 안에 이미 적었다 — 제목 오버레이·가독 그라데이션을 또 그리지 않는다 */
  const templateCover = hasPhoto && n.coverTemplate === true;
  const photos = n.photoCount ?? 0;
  const multi = hasPhoto && photos >= 2;
  const numbers = noteNumbers(n);
  const hasBadges = Boolean(n.decision || n.round != null || n.aiStatus);
  return (
    <Link
      href={noteHref(n)}
      aria-label={n.isExample ? "예시 — 임장노트 쓰기" : [`${n.title} 노트 보기`, ...numbers].join(" · ")}
      /* [1009 · T] press — 누르는 순간 살짝 눌린다(터치 기기의 피드백) */
      className="press group relative block aspect-square overflow-hidden bg-divider"
    >
      {hasPhoto ? (
        <>
          <CoverImage
            src={n.coverUrl}
            alt={n.isExample ? "" : `${n.title} 커버 사진`}
            priority={priority}
            /* [968 · 17] 실제 열 수 — 모바일 3열(33vw), md+ 는 최대폭 935px 안의 3열(≈309px) */
            sizes="(max-width: 768px) 33vw, 309px"
            imgClassName="absolute inset-0 h-full w-full object-cover"
            onFailed={() => setPhotoFailed(true)}
          />
          {/* 사진 위 글자 가독 오버레이 — 게이트 허용 목록(이 파일 · from-black)의 유일한 그라데이션 */}
          {!templateCover && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent"
            />
          )}
        </>
      ) : (
        <span aria-hidden="true" className="absolute inset-0" style={{ background: seedFace(n.id) }} />
      )}

      {(n.score > 0 || multi) && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 md:right-2 md:top-2">
          {/* 배지 규칙 — 12px/500 · 4px. 어두운 면 = 네이비 + 한지 글자 */}
          {n.score > 0 && (
            <span className="rounded-sm bg-brand-navy/80 px-1 py-px t-sub font-medium text-on-dark">
              {n.score}점
            </span>
          )}
          {multi && <Icon name="images" size={18} className="text-white drop-shadow-sm" />}
        </span>
      )}
      {n.isExample && (
        <span className="absolute left-1.5 top-1.5 rounded-sm bg-brand-navy/80 px-1.5 py-px t-caption font-medium text-on-dark">
          예시
        </span>
      )}

      <span className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 px-1.5 pb-1.5 md:px-2 md:pb-2">
        {/* [996 · 4] 판단·회차 — 타일 안 글자 배지(링크 전체가 이미 탭 대상). [1006] 내 노트는 AI 상태도 */}
        {hasBadges && (
          <span className="flex flex-wrap gap-1">
            <NoteBadges n={n} onDark={hasPhoto} />
          </span>
        )}
        {hasPhoto ? (
          templateCover ? null : <span className="block w-full truncate t-sub font-bold text-white">{n.title}</span>
        ) : (
          <>
            <span className="line-clamp-2 w-full t-sub font-bold text-ink">{n.title}</span>
            {n.region && <span className="block w-full truncate t-caption text-text-2">{n.region}</span>}
          </>
        )}
      </span>

      {/* 호버 — 데스크톱(hover 가능 기기)·키보드 초점에서만. 링크의 이름(aria-label)이 같은 숫자를 이미 말한다 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4 bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {n.score > 0 && (
          <span className="flex items-center gap-1 t-section">
            <Icon name="clipboard" size={18} />
            {n.score}점
          </span>
        )}
        {photos > 0 && (
          <span className="flex items-center gap-1 t-section">
            <Icon name="camera" size={18} />
            {photos}장
          </span>
        )}
      </span>
    </Link>
  );
}

/* ── 피드 게시물 카드 ──
   [1012-IG] 머리줄(아바타 32px · 작성자 · "단지명 · 지역") → 정사각 사진(모바일 끝까지) → 행동 줄 →
   굵은 숫자 줄 → 캡션(작성자 + 단지명 + 본문 첫 2줄) → 노트 전체 읽기 → 태그 → 작성 시각.
   카드 테두리·그림자 없음, 카드 사이는 여백으로 가른다.
   행동 줄은 **동작하는 것만**: 댓글(상세 #comments 로 이동) · 공유(공용 ShareLinkButton — 시트 → 복사 →
   토스트, 공유 이벤트 기록 포함) · 단지 페이지(실 id 를 찾은 노트만). 노트 저장은 기능이 없어(bookmarks
   target_type 에 note 없음) 아이콘도 두지 않는다. 비공개 내 노트에는 공유·댓글을 그리지 않는다(받아도 못 연다).
   [968 · 17] priority — 피드 첫 카드(LCP 후보)만 true */
function PostCard({
  n,
  priority = false,
  now,
  mine,
}: {
  n: FeedNote;
  priority?: boolean;
  now: number;
  mine: boolean;
}) {
  const detailHref = noteHref(n);
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(n.coverUrl) && !photoFailed;
  const photos = n.photoCount ?? 0;
  /* 공개 피드의 노트는 전부 공개. 내 노트는 빌더가 채운 isPublic 이 true 일 때만 */
  const publicNote = !n.isExample && (!mine || n.isPublic === true);
  const numbers = noteNumbers(n);
  const ago = writtenAgo(n, now);
  const initial = Array.from(n.author.trim())[0] ?? "";
  const place = [n.title, n.region].filter(Boolean).join(" · ");
  /* 시각 줄 — (내 노트면 공개 여부) · 작성 시각 · 서버 빌더 footer. 공개 여부를 모르면(예전 응답) 적지 않는다 */
  const timeParts = [
    mine && typeof n.isPublic === "boolean" ? (n.isPublic ? "공개" : "비공개") : "",
    ago ? `${ago} 작성` : "",
    ...n.footer,
  ].filter(Boolean);
  return (
    <article className="mx-auto w-full max-w-[468px]">
      <div className="flex items-center gap-2.5 pb-2.5">
        {/* [953] 목록 카드 아바타 = 남색 원 위 한지 글자. 사진 없는 자리를 꾸미지 않는다 */}
        <span
          aria-hidden="true"
          className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand-navy t-sub font-bold text-on-dark"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 t-body font-bold text-ink">
            <span className="truncate">{n.author}</span>
            {n.isExample && <ExampleBadge />}
            {/* [983] 공개 노트 27건 중 25건이 Lab 글인데 화면은 "직접 다녀온 사람이
                남긴 기록"이라고만 말했다. 운영진 글에는 그렇다고 적는다 — 사실을
                적는 쪽이 신뢰를 지키고, "내 글이 이 단지 첫 진짜 기록"이 된다. */}
            {n.lab && <ExampleBadge label="운영진 예시" />}
          </p>
          {place && <p className="truncate t-sub text-text-2">{place}</p>}
        </div>
        {/* [996 · 4] 판단·회차 배지 — 글자만. [1006] 내 노트는 AI 상태도 */}
        {(n.decision || n.round != null || n.aiStatus) && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <NoteBadges n={n} />
          </div>
        )}
      </div>

      <Link
        href={detailHref}
        aria-label={`${n.title} 노트 보기`}
        className="press relative -mx-3.5 block aspect-square overflow-hidden bg-divider md:mx-0"
      >
        {hasPhoto ? (
          <CoverImage
            src={n.coverUrl}
            alt={`${n.title} 커버 사진`}
            priority={priority}
            /* [968 · 17] 전폭 카드(최대 468px) — 모바일은 화면 폭 그대로 */
            sizes="(max-width: 768px) 100vw, 468px"
            imgClassName="absolute inset-0 h-full w-full object-cover"
            onFailed={() => setPhotoFailed(true)}
          />
        ) : (
          /* [1012] 사진 없는 자리 — 브랜드 면 단색 위에 제목만. 흰 글자·알약·블러·자간 장식은 걷었다 */
          <span
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-7 text-center text-ink"
            style={{ background: seedFace(n.id) }}
          >
            <span className="t-caption text-text-3">사진 없는 노트</span>
            <span className="line-clamp-3 t-section">{n.title}</span>
          </span>
        )}
        {hasPhoto && photos >= 2 && (
          <span className="absolute right-3 top-3">
            <Icon name="images" size={20} className="text-white drop-shadow-sm" />
          </span>
        )}
      </Link>

      {(publicNote || n.complexHref) && (
        <div className="-mx-2 flex items-center">
          {publicNote && (
            <Link
              href={`/notes/${n.id}#comments`}
              aria-label={`${n.title} 노트 댓글 보기`}
              className="flex h-10 w-10 items-center justify-center text-ink no-underline"
            >
              <Icon name="message-circle" size={24} />
            </Link>
          )}
          {publicNote && (
            <ShareLinkButton
              variant="icon"
              label={`${n.title} 노트 공유`}
              title={`${n.title} 임장노트`}
              /* 상세의 공유 링크와 같은 주소 — utm_source=share 로 공유 유입이 기존 UTM 집계에 잡힌다 */
              url={`/notes/${encodeURIComponent(n.id)}?utm_source=share&utm_medium=note`}
              className="flex h-10 w-10 items-center justify-center text-ink [&_svg]:h-[24px] [&_svg]:w-[24px]"
            />
          )}
          {/* 실 단지 id 를 찾은 노트만 — [1012] 규칙 5 CTA 는 동사 + 대상 */}
          {n.complexHref && (
            <Link
              href={n.complexHref}
              aria-label={`${n.title} 단지 페이지 보기`}
              className="ml-auto inline-flex h-10 items-center gap-1 px-2 t-sub font-bold text-primary no-underline"
            >
              <Icon name="building2" size={16} />
              단지 페이지 보기
            </Link>
          )}
        </div>
      )}

      <div className={publicNote || n.complexHref ? "" : "pt-2.5"}>
        {/* 굵은 숫자 줄 — 값이 있는 것만(기록 점수·사진 장수). 반응 수는 데이터에 없어 만들지 않는다 */}
        {numbers.length > 0 && <p className="t-body font-bold text-ink">{numbers.join(" · ")}</p>}
        <p className="mt-1 line-clamp-2 t-body text-text-1">
          <span className="font-bold text-ink">{n.author}</span>{" "}
          <span className="font-medium text-ink">{n.title}</span>{" "}
          <span className="text-text-2">{n.excerpt}</span>
        </p>
        <Link href={detailHref} className="tap-line mt-0.5 inline-block t-sub text-text-3 no-underline">
          노트 전체 읽기
        </Link>
        {/* 태그는 누르는 것이 아니라 글자다 — 나우블루(링크 색)를 쓰지 않는다(규칙 9) */}
        {n.tags.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 t-sub font-medium text-text-2">
            {n.tags.map((t) => (
              <span key={t.label}>#{t.label.replace(/\s/g, "")}</span>
            ))}
          </p>
        )}
        {/* 규칙 7 — 숫자 3개(자가체크 n/5 · 방문일 · 체크 n/m)는 서버 빌더(footer)가 실값으로 채운다.
            작성 시각은 여기서 다시 센다(writtenAgo). 내 노트는 공개 여부를 맨 앞에 */}
        {timeParts.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 t-caption text-text-3">
            {timeParts.map((part, i) => (
              <span key={`${i}-${part}`}>{i > 0 ? `· ${part}` : part}</span>
            ))}
          </p>
        )}
      </div>
    </article>
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

/** [1012-IG] URL 의 지역 원 선택값(?region=서울 마포구) — 공개 뷰에서만 쓴다 */
function regionFromUrl(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get("region")?.trim();
    return v ? v : null;
  } catch {
    return null;
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
  renderedAt,
}: {
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
  /** [1012-IG] 서버가 이 HTML 을 그린 시각(ms) — "최근 7일"·작성 시각의 첫 렌더 기준(hydration 일치).
      마운트 뒤에는 지금 시각으로 다시 센다. 생략하면 마운트 전까지 "최근" 판정을 하지 않는다 */
  renderedAt?: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("최신");
  /* [1012-IG] 기본 보기 = 격자(소유자 답: 3열 격자) */
  const [view, setView] = useState<ViewMode>("grid");
  /* [1012] 지역 선택값(시·구 라벨). null = 전체. [1012-IG] 주소 ?region= 과 맞춘다 */
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  /* [1012-IG] 기준 시각 — 첫 렌더는 서버 시각, 마운트 뒤 지금 */
  const [now, setNow] = useState<number>(renderedAt ?? Number.NaN);
  useEffect(() => {
    setNow(Date.now());
  }, []);

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
    /* [1012-IG] 공개 뷰의 지역 원 선택값을 주소에서 되살린다(공유·뒤로가기). 내 노트 뷰는 전용 필터 줄이 맡는다 */
    if (!wantMine) setRegionFilter(regionFromUrl(window.location.search));
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
     그려져 있다(ready) — 타일은 정사각 고정 비율이라 사진이 늦게 와도 높이가 안 변한다. */
  useScrollRestore(useScrollRestoreKey(), notes.length > 0);

  /* 구독 지역이 없으면 "내 관심 지역" 은 무엇을 눌러도 0건이라 칩 자체를 숨긴다.
     비활성 상태로 남겨 두면 눌리는데 아무 일도 안 하는 컨트롤이 된다. */
  const filters = FILTERS.filter((f) => f !== "내 관심 지역" || showInterestFilter);
  const activeFilter = filters.includes(filter) ? filter : "최신";

  /* [1006] 내 노트 뷰 — 정렬·판단·지역·기간(방문일) 필터. 규칙은 lib/notes/mine-filters(순수),
     칩은 실제로 있는 값만. 공개 피드는 종전 토글(최신·점수순·관심 지역) 그대로 — 남의 노트에
     판단·AI 상태 필터를 거는 건 다른 화면의 일이다. */
  const [mineFilters, setMineFilters] = useState<MineFilters>(DEFAULT_MINE_FILTERS);
  const mineOptions = useMemo(() => (mine ? mineFilterOptions(allNotes) : null), [mine, allNotes]);
  const mineActive = mine && hasActiveMineFilter(mineFilters);

  /* [1012] 지역 재료 — 공개 뷰에서만(내 노트는 MineFilterBar 가 같은 시·구 칩을 이미 가진다).
     [1012-IG] 원 표지 사진·최근 7일 링까지 region-chips 의 순수 함수가 센다(손에 든 노트 기준). */
  const regionItems = useMemo(() => (mine ? [] : regionHighlights(allNotes, now)), [mine, allNotes, now]);
  const allFresh = useMemo(() => !mine && hasRecentNote(allNotes, now), [mine, allNotes, now]);
  const activeRegion = regionFilter && regionItems.some((r) => r.label === regionFilter) ? regionFilter : null;
  const byRegion = activeRegion ? allNotes.filter((n) => regionChipOf(n) === activeRegion) : allNotes;

  /* [1012-IG] 머리 숫자 줄 — 끝까지 다 불러왔으면 "공개 노트", 아니면 "불러온 노트"(region-chips 주석) */
  const headerStats = useMemo(
    () => feedHeaderStats(allNotes, { now, mine, complete: reachedEnd }),
    [allNotes, now, mine, reachedEnd],
  );
  const labCount = mine ? 0 : allNotes.filter((n) => n.lab).length;

  const visible = mine
    ? applyMineFilters(allNotes, mineFilters)
    : activeFilter === "점수순"
      ? [...byRegion].sort((a, b) => b.score - a.score)
      : activeFilter === "내 관심 지역"
        ? byRegion.filter((n) => n.interested)
        : byRegion;
  /* 정렬 줄 왼쪽 — 걸러 낸 결과가 몇 건인지(거를 때만). 숫자는 지금 보이는 카드 수 */
  const scopeLine =
    !mine && (activeRegion || activeFilter === "내 관심 지역")
      ? `${[activeRegion, activeFilter === "내 관심 지역" ? "내 관심 지역" : null].filter(Boolean).join(" · ")} ${visible.length}건`
      : "";

  /* [1012-IG] 지역 원 → 주소(?region=). 탭 전환과 같은 방식(history.replaceState)으로 주소만 바꾼다 */
  const selectRegion = (next: string | null) => {
    setRegionFilter(next);
    try {
      window.history.replaceState(
        window.history.state,
        "",
        next ? `/notes?${new URLSearchParams({ region: next }).toString()}` : "/notes",
      );
    } catch {
      /* 주소 갱신 실패는 화면 전환을 막지 않는다 */
    }
  };

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
    setRegionFilter(null);
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
        setMoreError(`다음 ${pageSize}건을 불러오지 못했어요. 잠시 후 다시 눌러 주세요`);
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

  /* [1012-IG] 이어 불러오기 — 목록 끝(아래 버튼 자리)이 화면 600px 앞까지 오면 다음 페이지를 스스로 받는다.
     버튼은 그대로 둔다(키보드·IntersectionObserver 없는 브라우저·실패 뒤 다시 시도). 실패하면 자동은 멈추고
     버튼이 "다시 눌러 주세요" 를 받는다 — 실패를 무한히 되풀이하지 않는다. */
  const moreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const autoMore = !mine && !activeLoadError && hasMore && !reachedEnd && !moreError;
  useEffect(() => {
    const el = moreRef.current;
    if (!autoMore || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoMore, allNotes.length]);

  const showControls = allNotes.length > 0 && !(mine && mineState.status !== "ok");

  return (
    <PageShell>
      {/* [1012-IG] 가운데 최대폭 935px — 3열 정사각 격자가 데스크톱에서도 3열로 서는 폭(타일 ≈309px).
          [1005] 의 1240 컨테이너 안에서 가운데 정렬. 피드 카드는 그 안에서 468px. */}
      <div className="mx-auto flex w-full max-w-[935px] flex-col gap-4 md:gap-5">
        {/* 머리 — 제목 · 숫자 줄 · 한 줄 소개 · 링크 */}
        <header className="flex flex-col gap-3">
          {/* [967 · 20] 공개/내 노트 세그먼트 — 로그인했을 때만. 예전엔 내 노트로 가는
              길이 /my 의 링크 하나뿐이라 목록 화면 안에서는 전환이 없었다. */}
          {loggedIn && (
            <Segmented<NotesTab>
              options={TAB_OPTIONS}
              value={mine ? "mine" : "public"}
              onChange={switchTab}
              ariaLabel="노트 범위"
              className="w-fit"
            />
          )}
          <h1 className="t-title text-ink">{mine ? "내 임장노트" : "공개 임장노트"}</h1>
          {/* [1012-IG] 숫자 줄 — 예전 부제 문장("공개 노트 N건 · 지역 M곳 · 이 피드 기준")의 숫자를 옮겼다.
              아래 소개 문장은 숫자를 되풀이하지 않는다(정보 중복 금지) */}
          <StatRow stats={headerStats} />
          <div className="flex flex-col gap-1.5">
            {/* [1012] 규칙 6 — 누가(현장에 다녀온 사람·나) + 어디서. 운영진 글은 몇 건인지 밝힌다([983]) */}
            {/* [v4 · 요약본] 소개 문장 → 사실 한 줄. 운영진 글은 몇 건인지 밝힌다([983] — 이웃을 주어로 쓰지 않는다) */}
            {mine ? (
              <p className="t-sub text-text-3">비공개 노트는 나에게만 보여요</p>
            ) : labCount > 0 ? (
              <p className="t-sub text-text-3">운영진 예시 {labCount}건 포함</p>
            ) : null}
            {!mine && (
              <p className="flex flex-wrap gap-x-3 gap-y-1 t-sub">
                {/* [970 · B-25] 뽑힌 달이 하나라도 있을 때만 — 빈 화면으로 보내지 않는다 */}
                {hasBestMonth && (
                  <Link href="/notes/best" className="tap-line font-bold text-primary underline">
                    이달의 노트 순위 보기 ›
                  </Link>
                )}
                {/* 임장 가이드(전략 §4-2) — 기록 허브에서 준비 허브로 잇는다 */}
                <Link href="/imjang" className="tap-line font-bold text-primary underline">
                  지역별 임장 가이드 보기 ›
                </Link>
                {/* [970 · B-25] 리포트 진열대(/notes/market) 링크는 뺐다 — 판매 오픈 전 잠금
                    화면이라 헤더에서 보낼 곳이 아니다(페이지 자체는 그대로). */}
              </p>
            )}
          </div>
        </header>

        {/* 조회 실패 — 이 경우 "노트가 없다" 고 읽히면 안 되므로 빈 상태와 분리한다 */}
        {activeLoadError && (
          <div className="rounded-lg border border-line bg-surface px-3.5 py-3 t-sub text-text-2">
            {mine ? "내 임장노트를" : "공개 임장노트를"}{" "}
            <strong className="text-ink">불러오지 못했어요</strong>. 노트가 없다는 뜻이 아니라
            조회 자체가 실패했다는 뜻이에요. 잠시 후 다시 열어 주세요.
          </div>
        )}

        {/* [1012-IG] 지역 하이라이트 줄 — 공개 뷰에서, 지역이 잡힌 노트가 하나라도 있을 때 */}
        {!mine && regionItems.length > 0 && (
          <RegionRail
            items={regionItems}
            total={allNotes.length}
            allFresh={allFresh}
            value={activeRegion}
            onChange={selectRegion}
          />
        )}

        {/* [1012-IG] 정렬 — 탭 줄 위 오른쪽의 작은 글자 토글(높이 40px). 선택 = 한지 + 남색 */}
        {!mine && allNotes.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p role="status" className="min-w-0 truncate t-sub text-text-2">
              {scopeLine}
            </p>
            <div role="group" aria-label="정렬" className="-mr-1 flex shrink-0 items-center">
              {filters.map((f) => {
                const on = activeFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f)}
                    className="inline-flex h-10 items-center px-0.5"
                  >
                    <span
                      className={`rounded-sm px-2 py-1 t-sub ${
                        on ? "bg-brand-hanji font-bold text-brand-hanji-ink" : "text-text-3"
                      }`}
                    >
                      {f}
                    </span>
                  </button>
                );
              })}
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

        {/* [1012-IG] 격자 / 피드 탭 — 고를 노트가 있을 때만(0건이면 바꿔 볼 것이 없다) */}
        {showControls && <ViewTabs value={view} onChange={setView} />}

        {/* 예시 안내 */}
        {exampleOnly && (
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 t-sub text-text-3">
            <ExampleBadge />
            <span>
              아직 공개된 임장노트가 없어 샘플 1건만 보여요 — 첫 공개 노트가 올라오면 샘플은 내려가요.
            </span>
          </div>
        )}

        {/* 본문: 격자 / 피드 / 빈 상태. [1007] 내 노트는 받는 중이면 빈 상태 대신 안내 — "없어요"를 먼저 말하지 않는다 */}
        {mine && (mineState.status === "idle" || mineState.status === "loading") ? (
          <p role="status" aria-busy="true" className="py-8 text-center t-sub text-text-3">
            내 임장노트를 불러오는 중…
          </p>
        ) : visible.length === 0 ? (
          /* 빈 상태를 한 문장으로 뭉뚱그리면 "노트가 없다"와 "필터가 걸러 냈다"가
             섞인다. 노트는 있는데 필터 결과만 0건인 경우를 따로 적는다. */
          allNotes.length > 0 ? (
            mineActive ? (
              /* [1006] 내 노트 — 필터가 걸러 낸 0건. 다음 행동은 "쓰기"가 아니라 "필터 지우기"다 */
              <div className="flex flex-col items-center gap-2">
                <EmptyState
                  icon="file-text"
                  title="이 조건에 맞는 내 노트가 없어요"
                  desc={`내 노트 ${allNotes.length}건 중 판단·지역·기간 조건에 맞는 건 없었어요.`}
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
            /* [1012] 규칙 6 — 빈 화면도 어디서·몇 건 중. 지역 원이 골라져 있으면 그 지역명으로 말한다 */
            <EmptyState
              icon="file-text"
              title={
                activeFilter === "내 관심 지역"
                  ? activeRegion
                    ? `${activeRegion}에서 내가 구독한 지역과 겹치는 노트가 없어요`
                    : "내가 구독한 지역의 공개 노트가 아직 없어요"
                  : `${activeRegion ?? "이 조건"}의 노트가 아직 없어요`
              }
              desc={
                activeFilter === "내 관심 지역"
                  ? `이 피드의 노트 ${allNotes.length}건 중 내가 구독한 지역과 겹치는 건 없었어요. 위 '최신'을 누르면 ${allNotes.length}건 전체가 보여요.`
                  : `이 피드의 노트 ${allNotes.length}건 중 남는 것이 없었어요. 위 '전체' 원을 누르면 ${allNotes.length}건 전체가 보여요.`
              }
              action={{ label: "내 임장노트 쓰기", href: "/notes/new" }}
            />
            )
          ) : (
            <EmptyState
              icon="file-text"
              title={
                mine
                  ? "내가 쓴 임장노트가 아직 없어요"
                  : "공개된 임장노트가 아직 없어요"
              }
              desc={
                mine
                  ? "첫 노트를 쓰면 비공개 노트까지 이 화면에 모여요. 임장 당일 현장에서 퀵 기록으로 시작해도 돼요."
                  : "샘플로 채우지 않아요. 첫 공개 노트를 쓰거나, 지도에서 단지를 먼저 둘러봐도 돼요."
              }
              action={{ label: mine ? "첫 임장노트 쓰기" : "첫 공개 임장노트 쓰기", href: "/notes/new" }}
            />
          )
        ) : view === "grid" ? (
          /* [1012-IG] 정사각 3열 — 모바일은 페이지 좌우 여백(px-3.5)을 상쇄해 화면 끝까지 · 간격 2px,
             md+ 는 최대폭 안 3열 · 간격 4px. 반경·테두리·그림자 0 */
          <div className="-mx-3.5 grid grid-cols-3 gap-0.5 md:mx-0 md:gap-1">
            {/* [968 · 17] 첫 타일만 priority — 격자·피드 중 한 뷰만 그려지므로 한 화면에 하나다 */}
            {visible.map((n, i) => (
              <GridTile key={n.id} n={n} priority={i === 0} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {visible.map((n, i) => (
              <PostCard key={n.id} n={n} priority={i === 0} now={now} mine={mine} />
            ))}
          </div>
        )}

        {/* [967 · 19] 다음 페이지 — 공개 뷰에서만(내 노트는 listNotes 가 200건까지 한 번에 준다).
            첫 페이지가 꽉 찼을 때만 그리고, 짧은 응답이 오면 "마지막이에요" 로 닫는다.
            [1012-IG] 이 자리가 화면 가까이 오면 스스로 이어 받는다(위 autoMore). 버튼은 대체 수단으로 남긴다. */}
        {!mine && !activeLoadError && hasMore && allNotes.length > 0 && (
          <div ref={moreRef} className="flex flex-col items-center gap-2 py-1">
            {reachedEnd ? (
              <p role="status" className="t-sub text-text-3">
                마지막이에요 — 공개 노트 {allNotes.length}건을 모두 봤어요
              </p>
            ) : (
              /* [1012] 규칙 5 — "더 보기" 는 대상이 없다. 다음 페이지 크기를 적는다 */
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="btn-soft px-5 py-2.5 t-body font-bold disabled:opacity-60"
              >
                {loadingMore ? "불러오는 중…" : `다음 노트 ${pageSize}건 보기`}
              </button>
            )}
            {moreError && (
              <p role="alert" className="t-sub font-bold text-danger">
                {moreError}
              </p>
            )}
          </div>
        )}

        {/* 모바일 전용 노트 쓰기 CTA — [#68] 현장 퀵 기록 나란히.
            [1005] 퀵 기록은 이제 진짜 한 화면 플로우(/notes/new?quick=1). 두 버튼 모두 램프
            글자(t-section/t-body)·높이 52px 로 맞추고, 손으로 적은 브랜드 블루 그림자는
            .btn-cta(--shadow-cta 토큰)로 바꿨다 — 다크·테마 변형에서도 맞는다. */}
        <div className="rise-in-2 mx-auto flex w-full max-w-[468px] gap-2 md:hidden">
          <Link
            href="/notes/new"
            className="btn-primary btn-cta flex min-h-[52px] flex-1 items-center justify-center rounded-lg px-4 py-3 text-center t-section no-underline"
          >
            임장노트 쓰기
          </Link>
          {/* [1012] 규칙 4 — 📷 이모지 → 선 아이콘. 점선 테두리(장식)도 1px 실선으로 */}
          <Link
            href="/notes/new?quick=1"
            className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-3 text-center t-body font-bold text-text-1 no-underline"
          >
            <Icon name="camera" size={18} />
            현장 퀵 기록
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
