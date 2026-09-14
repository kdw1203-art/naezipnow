import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import {
  getNote,
  hasInspectionScores,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { toCardSource } from "@/lib/notes/card-source";
import { loadCardMarketFacts } from "@/lib/notes/card-market";
import { availableFrames, CARD_BRAND_DOMAIN, type NoteCardSource } from "@/lib/notes/card-frames";
import { autoBuildConfig, normalizeConfig } from "@/lib/notes/card-config";
import { shortNoteLabel, shortNoteUrl } from "@/lib/notes/short-code";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { NoteCardStudio, type AvailableFrame } from "./NoteCardStudio";

export const metadata: Metadata = {
  title: "나만의 임장 카드 | 내집나우",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* [995] 공유 한 줄 — 카카오 피드 설명·공유 시트 본문. 점수는 노트 상세와 같은 환산(5점 평균×20),
   판정은 메모(sections.memo)·요약의 첫 줄. 둘 다 없으면 지역만 — 지어내지 않는다. */
function shareLine(note: InspectionNote, source: NoteCardSource): string {
  const total = hasInspectionScores(note.scores)
    ? Math.round(inspectionAverageScore(note.scores) * 20)
    : null;
  const verdict = (source.verdict ?? source.summary ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  const parts = [total !== null ? `종합 ${total}점` : "", verdict].filter(Boolean);
  const line = parts.length > 0 ? parts.join(" · ") : `${note.region} 직접 다녀온 임장 기록`;
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/* [995] 카카오 피드 썸네일 — 노트 상세 OG 와 같은 /api/og/note. 4축은 폼이 고른 현장 평가
   (fieldRatings)만, 없으면 축 점수로 — 점수 0(미입력)은 뺀다. 4축이 하나도 없으면 null 로
   두어 SDK 기본 이미지(/og-image)를 쓴다: 그 라우트는 badges 가 비면 **예시 뱃지**를
   그리므로, 빈 값을 넘기면 남의 평가가 이 노트 썸네일에 찍힌다. */
function kakaoOgImageUrl(note: InspectionNote, origin: string): string | null {
  const ratings = ((note.metadata ?? {}) as Record<string, unknown>).fieldRatings;
  const rated =
    ratings && typeof ratings === "object" ? (ratings as Record<string, unknown>) : null;
  const fromRating = (key: string): string | null => {
    const v = rated?.[key];
    return v === "좋음" ? "상" : v === "보통" ? "중" : v === "아쉬움" ? "하" : null;
  };
  const fromScore = (v: number): string | null =>
    v >= 4 ? "상" : v > 0 && v <= 2 ? "하" : v > 0 ? "중" : null;
  const s = note.scores;
  const axes: [string, string | null][] = [
    ["채광", fromRating("채광") ?? fromScore(s.facility)],
    ["소음", fromRating("소음") ?? fromScore(s.location)],
    ["주차", fromRating("주차") ?? fromScore(s.facility)],
    ["교통", fromRating("교통") ?? fromScore(s.transport)],
  ];
  const badges = axes.filter((a): a is [string, string] => a[1] !== null).map((a) => a.join(" "));
  if (badges.length === 0) return null;
  const q = new URLSearchParams({
    title: note.title,
    score: hasInspectionScores(s) ? String(Math.round(inspectionAverageScore(s) * 20)) : "",
    badges: badges.join(","),
  });
  return `${origin}/api/og/note?${q.toString()}`;
}

/**
 * /notes/[id]/card — "나만의 카드" 스튜디오.
 *
 * 서버가 이 노트에서 채울 수 있는 프레임의 완성 콘텐츠를 만들어 넘긴다(build()는
 * 서버에서만 — 콘텐츠 로직 이원화 방지). 저장된 구성이 없으면 AI 자동 구성으로
 * 기본 카드를 만들어 보여 준다("임장노트를 쓰면 자동으로 카드가 만들어진다").
 * 소유자는 편집, 비소유자(공개 노트)는 캐러셀만.
 */
export default async function NoteCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getNote(id).catch(() => null);

  if (!note) {
    return (
      <PageShell breadcrumb="임장노트 · 카드">
        <div className="card mx-auto mt-8 max-w-[520px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">노트를 찾을 수 없어요</p>
          <Link href="/notes" className="btn-soft btn-sm mt-3 inline-block no-underline">
            공개 임장노트 보기
          </Link>
        </div>
      </PageShell>
    );
  }

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  const isOwner = Boolean(email && note.authorEmail.toLowerCase() === email);

  // 비공개 노트는 소유자만 볼 수 있다
  if (!note.isPublic && !isOwner) {
    return (
      <PageShell breadcrumb="임장노트 · 카드">
        <div className="card mx-auto mt-8 max-w-[520px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">비공개 노트예요</p>
          <p className="mt-1 t-sub text-text-3">작성자만 이 카드를 볼 수 있어요.</p>
        </div>
      </PageShell>
    );
  }

  /* [988] 노트 밖의 숫자(평단가·전세가율 등)를 함께 얹는다 — "데이터로 보기" 프리셋이 쓴다.
     못 읽으면 null 이고, 그러면 그 장이 통째로 빠진다(빈 숫자를 그리지 않는다). */
  const market = await loadCardMarketFacts(note.region);
  /* [995] 카드에 인쇄되는 짧은 링크 — 공개 노트만. 비공개는 받은 사람이 못 여니 도메인만 찍는다
     (note-actions 의 공유 가드와 같은 원칙). 공개로 바꾸고 다시 저장하면 링크가 찍힌다. */
  const origin = DEFAULT_DESKTOP_ORIGIN;
  const shareUrl = shortNoteUrl(id, origin);
  const shareLabel = note.isPublic ? shortNoteLabel(id, origin) : CARD_BRAND_DOMAIN;
  const source: NoteCardSource = {
    ...toCardSource(note, market),
    shareLabel: note.isPublic ? shareLabel : null,
    /* [997] 마무리 장 QR — 같은 짧은 링크의 절대 주소. 비공개는 QR 도 없다. */
    shareUrl: note.isPublic ? shareUrl : null,
  };
  const available: AvailableFrame[] = availableFrames(source).map((f) => ({
    id: f.id,
    label: f.label,
    category: f.category,
    content: f.build(source),
  }));

  // 저장된 구성 → 정규화, 없으면 자동 구성
  const saved = note.metadata?.cardConfig;
  const config = saved
    ? normalizeConfig(saved, source)
    : autoBuildConfig(source);

  const aptLabel = note.aptName || note.title || "임장 기록";

  return (
    <PageShell breadcrumb="임장노트 · 나만의 카드">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="t-section text-ink">나만의 임장 카드</h1>
            <p className="t-sub text-text-3">
              {aptLabel}
              {note.region ? ` · ${note.region}` : ""}
            </p>
          </div>
          <Link href={`/notes/${id}`} className="btn-soft btn-sm no-underline">
            ← 노트로 돌아가기
          </Link>
        </div>

        <div className="card rounded-[18px] p-5 md:p-6">
          <NoteCardStudio
            noteId={id}
            available={available}
            initialThemeId={config.themeId}
            initialFrameIds={config.frameIds}
            editable={isOwner}
            shareable={note.isPublic}
            shareUrl={shareUrl}
            shareLabel={shareLabel}
            shareTitle={`${aptLabel} 임장노트`}
            shareText={shareLine(note, source)}
            kakaoImageUrl={kakaoOgImageUrl(note, origin)}
          />
        </div>

        {!saved && isOwner && (
          <p className="mt-3 text-center t-sub text-text-3">
            AI가 기록을 바탕으로 카드를 자동으로 구성했어요. 색상·장을 바꾼 뒤 저장하면
            나만의 카드가 완성돼요.
          </p>
        )}
      </div>
    </PageShell>
  );
}
