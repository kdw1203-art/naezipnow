import {
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { complexHrefKey, resolveComplexHrefs } from "@/lib/newui/complex-link";
import { matchesInterest } from "@/lib/notes/region-match";
import { relativeTimeLabel } from "@/lib/format/relative-time";

/* [967 · 19] 공개 임장노트 피드 카드 빌더 — 서버 전용.
 *
 * 예전엔 app/notes/page.tsx 안에만 있었다. "더 보기" 가 붙으면서 같은 카드가
 * /api/inspection/notes?public=1 응답으로도 나가야 하는데, 카드 한 장에는 서버만
 * 아는 것이 셋 들어간다 — 단지 허브 링크(complexes 조회), 관심 지역 여부(구독
 * 대조), 상대시각 라벨(hydration 불일치 방지로 서버 계산). 클라이언트가 원본
 * 노트를 받아 다시 만들면 세 가지가 전부 어긋나므로, 빌더를 여기로 올리고 페이지와
 * API 가 같은 함수를 부른다. */

export type TagTone = "pos" | "neg";

export type FeedNote = {
  id: string;
  author: string;
  meta: string;
  score: number; // 0~100
  scoreTone: "primary" | "muted";
  title: string;
  excerpt: string;
  tags: { label: string; tone: TagTone }[];
  footer: string[];
  /** 서버에서 사용자의 지역 알림 구독과 대조해 채운다 (전에는 전부 false 고정이었다) */
  interested: boolean;
  region?: string;
  /** 커버 이미지(첫 사진). 없으면 그라디언트 타일 폴백 */
  coverUrl?: string | null;
  /** 단지 허브(/complex/[id]) 링크 — 실 id를 못 찾으면 undefined → 링크 숨김 */
  complexHref?: string;
  /** 더미 1개 원칙: 실데이터 0건일 때만 노출되는 테스트용 샘플 표시 */
  isExample?: boolean;
  /** [967 · 19] 커서 페이지네이션용 원본 생성 시각(ISO) — 마지막 카드의 값이 다음 커서 */
  createdAt?: string;
};

/** 노트 피드·댓글의 상대시각 — "방금 전 / N분 전 / N시간 전 / 어제 / N일 전(30일까지) / ISO 날짜부".
 *  [967 · 32] 본체는 lib/format/relative-time.ts. 서버에서 부르므로 now 를 요청당 한 번 잡아 넘길 수 있다 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  return relativeTimeLabel(iso, now, { yesterday: true, maxDays: 31, fallback: "iso-date" });
}

function maskAuthor(n: InspectionNote): string {
  if (n.authorLabel && n.authorLabel.trim()) return n.authorLabel.trim();
  const local = n.authorEmail.split("@")[0] ?? "이웃";
  const head = local.slice(0, 2) || "이웃";
  return `${head}** 이웃`;
}

/* 파생 태그 — 작성자가 직접 입력한 축(입지·교통·시설)만 사용.
   학군·미래가치는 과거 만족도 슬라이더에서 파생되던 값이라 태그로 만들지 않는다. */
function deriveTags(n: InspectionNote): FeedNote["tags"] {
  const tags: FeedNote["tags"] = [];
  const s = n.scores;
  if (s.transport >= 4) tags.push({ label: "교통 좋음", tone: "pos" });
  if (s.location >= 4) tags.push({ label: "입지 좋음", tone: "pos" });
  if (s.facility <= 2) tags.push({ label: "시설 아쉬움", tone: "neg" });
  if (s.location > 0 && s.location <= 2)
    tags.push({ label: "입지 아쉬움", tone: "neg" });
  return tags.slice(0, 3);
}

export function toFeedNote(
  n: InspectionNote,
  complexHref: string | null,
  opts?: { mine?: boolean; interestRegions?: string[] },
): FeedNote {
  const avg = inspectionAverageScore(n.scores);
  const score = Math.round(avg * 20);
  const excerptSrc =
    n.summary?.trim() ||
    n.sections.memo?.trim() ||
    n.sections.pros?.trim() ||
    "현장 기록이 등록된 임장노트입니다.";
  const excerpt =
    excerptSrc.length > 60 ? `“${excerptSrc.slice(0, 60)}…”` : `“${excerptSrc}”`;
  return {
    id: n.id,
    author: maskAuthor(n),
    meta: opts?.mine
      ? `${n.isPublic ? "공개" : "비공개"} · ${relativeTime(n.createdAt)} · ${n.region}`
      : `${relativeTime(n.createdAt)} · ${n.region}`,
    score,
    scoreTone: avg >= 3.5 ? "primary" : "muted",
    title: n.aptName ? `${n.aptName}` : n.title,
    excerpt,
    tags: deriveTags(n),
    footer: [
      `자가체크 ${avg.toFixed(1)}/5`,
      `방문 ${n.visitDate}`,
      `체크 ${n.checklist.filter((c) => c.done).length}/${n.checklist.length}`,
    ],
    /* 전에는 모든 실노트에 interested:false 를 박아 넣어서 "내 관심 지역" 칩이
       구조적으로 0건만 돌려주고 "해당 필터에 맞는 노트가 아직 없어요"라고 말했다.
       이제 사용자의 실제 지역 알림 구독(listAlertSubscriptions)과 대조해 판정한다.
       [967 · 13] 대조 규칙은 lib/notes/region-match 로 — 상세의 관련 노트와 같은 잣대. */
    interested: matchesInterest(n.region, opts?.interestRegions ?? []),
    region: n.region,
    // 인스타 피드형 커버 — 첫 사진(있으면). 없으면 클라이언트에서 그라디언트 타일 폴백.
    coverUrl: n.photos?.[0] ?? null,
    // 실 단지 id를 찾은 경우에만 /complex/[id] 연결, 못 찾으면 링크 숨김 (mock-1로 보내지 않음)
    complexHref: complexHref ?? undefined,
    createdAt: n.createdAt,
  };
}

/**
 * 노트 행 묶음 → 피드 카드 묶음. 단지 링크는 일괄 해석(동시 상한 + 마감 —
 * resolveComplexHrefs 주석)으로 N+1 을 접는다.
 */
export async function buildFeedNotes(
  rows: InspectionNote[],
  opts?: { mine?: boolean; interestRegions?: string[] },
): Promise<FeedNote[]> {
  const hrefs = await resolveComplexHrefs(
    rows.map((n) => ({ name: n.aptName, region: n.region })),
  );
  return rows.map((n) =>
    toFeedNote(n, hrefs.get(complexHrefKey(n.aptName, n.region)) ?? null, opts),
  );
}
