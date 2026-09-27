/* [1012] 규칙 1·2 — 본문 카드 반경 12px→8px(rounded-3xl→rounded-lg 7곳). */
import Link from "next/link";
import { displayAuthorLabel, isLabAuthor } from "@/lib/notes/author-label";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { ReportButton } from "../../components/ReportButton";
import {
  getNote,
  hasInspectionScores,
  inspectionAverageScore,
  listNotesByAuthorForApt,
  listNotesByAuthorForComplex,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { NotePhotoCarousel } from "./NotePhotoCarousel";
import { NoteAudioTools } from "./NoteAudioTools";
import { safeAuth } from "@/lib/safe-auth";
import { findPaidReportIdByNote } from "@/lib/reports/store-db";
import { hasPurchased } from "@/lib/report-purchases/store-db";
import { planLabel } from "@/lib/subscriptions/labels";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { NoteDetailActions } from "./note-actions";
import { AiRetryButton } from "./ai-retry-button";
import { AiPendingCard } from "./AiPendingCard";
import {
  aiStateOf,
  analysisModeOf,
  hasAiAnalysis,
  isQuotaFallback,
  noteAiIntent,
  readAiQuery,
} from "@/lib/notes/ai-status";
import { areaBandLabels } from "@/lib/notes/area-band-label";
import { noteContentHash, storedContentHash } from "@/lib/notes/content-hash";
import { NoteToolsRow } from "./NoteToolsRow";
import { AiFeedbackButtons } from "@/app/components/AiFeedbackButtons";
import DeepDivePanel from "./DeepDivePanel";
import { Explain } from "@/app/components/explain/Explain";
import { JsonLd } from "@/app/components/JsonLd";
import { publisherRef } from "@/lib/seo/jsonld";
import { NoteSoftWall } from "./NoteSoftWall";
import { RelatedNotes } from "./RelatedNotes";
import { CompareTrayButton } from "@/app/components/CompareTrayButton";
import { listComplexesInDistrict } from "@/lib/complex/complex-store";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { seoAlternates } from "@/lib/seo/alternates";
import { NoteMiniMap } from "./NoteMiniMap";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { NoteVerdictCard } from "./NoteVerdictCard";
import { resolveComplexPrice } from "@/lib/market/complex-price";
import { noteCoordsFromMetadata } from "@/lib/notes/note-coords";
import { NoteComments, type NoteCommentView } from "./NoteComments";
import { listNoteCommentsForViewer, type NoteComment } from "@/lib/inspection/note-comments";
import {
  getPublicNoteCached,
  listPublicNoteCommentsCached,
  listPublicVisitGroupCached,
  shouldLogNoteTiming,
} from "@/lib/inspection/note-cache";
import { relativeTime } from "@/lib/notes/feed-note";
import { isAdmin } from "@/lib/auth/is-admin";
import { resolveNoteCover } from "@/lib/notes/cover/resolve";
import { decisionFromMetadata } from "@/lib/inspection/decision";
import { buildRevisitDelta, revisitOfId, type RevisitDelta } from "@/lib/inspection/revisit";

/* 시안 6c(노트 상세 + AI) + 10f(AI 노트 분석) + 20a(공개 임장노트 표준 11항목) + 20b(SEO)
   실데이터: inspection_notes → getNote(id) — 공개 노트만 index, 비공개·목업은 noindex
   [1012] 규칙 8 — 이 파일의 굵기 800(extrabold) 17곳을 전부 700(font-bold)로. 규칙 4 — 이모지 제거.

   [v4 · 한 화면 한 가지] 위에서 아래로 한 줄(데스크톱도 최대 760px, 사이드바 없음):
     [머리]     제목(h1) + 사실 한 줄(단지 · 지역 · 방문일 · 작성자) + 글자 버튼 줄 + 사진 캐러셀(노트 본문)
     [주인공]   판단 한 덩어리 — 기록 점수(t-display) · 내 판단 · AI 결론 · 체크 · 대표 실거래가 · 채움 파랑 1개
     [현장 기록] 메모 + 구분선 행(현장 인상 · 좋았던 점 · 주의할 점 · 날씨 · 촬영) + 음성 · 위치
     [방문 기록] 회차가 둘 이상일 때만 — 재방문 변화 두 줄 + 회차 행
     [AI 요약]  잉크 패널(면책 그대로) + 피드백 + 심화 분석(접힘 행)
     [이어서]   도구 · 지도 비교 · 단지 홈 · 알림 로그인 — 구분선 행에 한 번씩
     [댓글] · [다른 임장노트] · 맨 끝 출처 한 줄
   지운 것: 지역·단지 칩 · 직접 방문 도장 · 자료 조사/촬영/운영진 배지(→ 사실 줄·행) · 항목 평가 상자 · 괘선 종이 면 ·
   유리판 판단 카드의 사실 타일 3칸 · 점수 도넛(conic-gradient)과 축 막대(→ 큰 숫자 + 축 점수 한 줄) · 기록 완성도 카드 ·
   저장 직후 "다음 행동" 유리 카드 · 근처 후보 카드 · "그래서 다음은?" 카드 · PRO 안내 카드 · 비로그인 관심단지 카드 ·
   광고 공간(AdZone) · 설명 문장("다녀온 사람이 그 자리에서 느낀 인상이에요…" 등). */

export const dynamic = "force-dynamic";

const BASE_URL = "https://naezipnow.com";

/* ---------- 뷰 모델 ---------- */

type AxisLevel = "상" | "중" | "하";
type Axis = { label: string; level: AxisLevel };
/* [1006] id — 같은 단지의 다른 회차로 가는 링크(예전엔 글자만 있고 갈 길이 없었다) */
type Visit = { id: string; label: string; summary: string; latest: boolean };
type ScoreBar = { label: string; value: number; bad: boolean };

/* [v4] 뷰 모델 — 칩(지역·단지 배지)·직접 방문 도장·규칙 요약 문장(aiSummary)·근거 문장(evidenceNote)·
   약한 축(판단 카드 타일)을 걷었다. 머리는 제목 + 사실 한 줄(factLine), 판단 덩어리는 점수·축 점수·체크 */
type NoteView = {
  breadcrumb: string;
  oneLiner: string; // 한 줄 총평 = 제목 (20a ③)
  /** [v4 · 규칙 1] 머리 사실 한 줄 — 단지 · 지역 · 방문일 · 작성자(있는 값만) */
  factLine: string;
  weather: string;
  fieldVerified: boolean; // [#71] 현장 인증 (위치 확인 통과)
  /** [983] 운영진(Lab)이 쓴 글인가 — 화면에 "운영진 예시"로 적는다 */
  lab: boolean;
  axes: Axis[]; // 채광·소음·주차·교통 4축 (20a ④)
  /** 작성자 메모 — 없으면 "" (설명 문장으로 채우지 않는다) */
  body: string;
  photos: string[];
  visits: Visit[];
  goodPoints: string[]; // 좋았던 점 (20a ⑤) — 없으면 빈 배열
  cautionPoints: string[]; // 주의할 점 (20a ⑥) — 없으면 빈 배열
  aiInline: string; // 본문 내 AI 요약 (20a ⑨ — AIPanel로 구분)
  aiBadge: string; // 저장된 AI 분석 vs 규칙 기반 문구 구분
  /** 입력 축이 없으면 null — 0점을 "종합 점수"로 보여 주지 않는다 */
  totalScore: number | null;
  scoreBars: ScoreBar[];
  scoredAxisCount: number;
  checklistDone: number;
  checklistTotal: number;
  sourceLabel: string; // 출처 각주 (20a ⑦)
  baseDate: string; // 데이터 기준일 (20a ⑧)
  regionLabel: string;
  complexLabel: string;
};

/* G10: 예전에는 조회 실패·미존재 시 MOCK_VIEW(허구의 "공작아파트 3차 임장" 노트)를
   실제 URL 로 그대로 내보냈다. 존재하지 않는 임장 기록을 사실처럼 읽히게 하므로 삭제하고,
   아래 loadNote() 의 3분기(정상·미존재·조회실패)로 대체한다. */

type LoadResult =
  | { kind: "ok"; note: InspectionNote; source: "cache" | "db" }
  | { kind: "missing"; source: "db" }
  | { kind: "error"; message: string };

/* [969 · 20] 노트 행 — 공개 노트는 데이터 캐시(5분, note:<id>)에서 먼저 찾는다.
   누가 보든 같은 값이라 뷰어별 분기(소유자·구매 열람)는 이 결과 위에서 그대로 한다.
   캐시 로더(lib/inspection/note-cache.ts)는 공개가 아닌 행을 절대 돌려주지 않고(null),
   여기서는 그 null 을 "비공개거나 없음" 으로만 읽어 실조회로 내려간다 — 비공개 본문은
   캐시에 실리지 않는다. 캐시 결과를 쓰기 전에 isPublic 을 한 번 더 확인한다(방어).

   React cache(): generateMetadata 와 페이지가 같은 요청 안에서 getNote 를 **각각**
   불렀다 — 요청당 노트 조회 2회 중 1회는 그냥 중복이었다. 이제 한 번만 한다
   (공개·비공개 모두). 실패는 던지지 않고 3분기(정상·미존재·조회실패)로 돌려준다. */
const loadNote = cache(async (id: string): Promise<LoadResult> => {
  try {
    const cached = await getPublicNoteCached(id);
    if (cached && cached.isPublic) return { kind: "ok", note: cached, source: "cache" };
    const note = await getNote(id);
    return note ? { kind: "ok", note, source: "db" } : { kind: "missing", source: "db" };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
});

/* ---------- 실데이터 → 표준 뷰 변환 ---------- */

function axisToneClass(level: AxisLevel): string {
  if (level === "상") return "text-success";
  if (level === "하") return "text-danger";
  return "text-text-1";
}

function levelFromScore(score: number): AxisLevel {
  if (score >= 4) return "상";
  if (score > 0 && score <= 2) return "하";
  return "중";
}

/* [1006] 본체는 lib/notes/ai-status.noteAiIntent — 목록 배지·내용 해시가 같은 규칙을 본다 */
function retryDefaultIntent(note: InspectionNote): "실거주" | "투자" | "전월세" {
  return noteAiIntent(note.metadata);
}

function splitLines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n|·|,|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${y}.${Number(m)}.${Number(day)}`;
}

function toView(n: InspectionNote, visitsOverride?: Visit[]): NoteView {
  const s = n.scores;
  const scored = hasInspectionScores(s);
  const avg = inspectionAverageScore(s);
  const total = scored ? Math.round(avg * 20) : null;
  const scoredAxisCount = [s.location, s.school, s.transport, s.facility, s.future].filter(
    (v) => v > 0,
  ).length;
  const displayTitle = n.aptName?.trim() || n.title;
  const pros = n.sections.pros ?? "";
  const cons = n.sections.cons ?? "";

  const goodPoints = splitLines(n.sections.pros);
  const cautionPoints = splitLines(n.sections.cons);
  const scoreEntries: [string, number][] = [
    ["입지", s.location],
    ["학군", s.school],
    ["교통", s.transport],
    ["시설", s.facility],
    ["미래가치", s.future],
  ];
  if (goodPoints.length === 0) {
    scoreEntries
      .filter(([, v]) => v >= 4)
      .forEach(([label, v]) => goodPoints.push(`${label} 우수 (${v}/5)`));
  }
  if (cautionPoints.length === 0) {
    scoreEntries
      .filter(([, v]) => v > 0 && v <= 2)
      .forEach(([label, v]) => cautionPoints.push(`${label} 취약 (${v}/5)`));
  }
  /* [v4 · 규칙 3] "기록된 확정 강점이 아직 없어요" 같은 채움 문장을 넣지 않는다 — 빈 배열이면 화면이 "기록 없음" 한 낱말 */

  /* 20a ④ 4축: [970 · B-10] 폼이 고른 항목만 fieldRatings 에 남기므로 그 값을 먼저 쓰고,
     없으면 텍스트 키워드, 그것도 없으면 축 점수 — 점수가 0(미입력)인 축은 "중"으로
     지어내지 않고 **뺀다**. 예전엔 안 건드린 노트도 4축이 전부 "중"으로 나갔다. */
  const rawRatings = ((n.metadata ?? {}) as Record<string, unknown>).fieldRatings;
  const ratings =
    rawRatings && typeof rawRatings === "object" ? (rawRatings as Record<string, unknown>) : null;
  const ratedLevel = (key: string): AxisLevel | null => {
    const v = ratings?.[key];
    return v === "좋음" ? "상" : v === "보통" ? "중" : v === "아쉬움" ? "하" : null;
  };
  const axisOrNull = (
    key: string,
    keywords: string[],
    fallbackScore: number,
  ): AxisLevel | null => {
    const rated = ratedLevel(key);
    if (rated) return rated;
    const hit = (text: string) => keywords.some((k) => text.includes(k));
    if (hit(cons)) return "하";
    if (hit(pros)) return "상";
    return fallbackScore > 0 ? levelFromScore(fallbackScore) : null;
  };
  /* [v4 · 규칙 7] 축 앞 장식 아이콘(해·스피커·핀·기차)을 걷었다 — 아이콘은 조작 버튼에만. 이름 + 상/중/하 글자 */
  const axisCandidates: { label: string; level: AxisLevel | null }[] = [
    { label: "채광", level: axisOrNull("채광", ["채광", "햇빛", "일조", "남향"], s.facility) },
    { label: "소음", level: axisOrNull("소음", ["소음", "시끄", "조용"], s.location) },
    { label: "주차", level: axisOrNull("주차", ["주차", "이중주차"], s.facility) },
    { label: "교통", level: axisOrNull("교통", [], s.transport) },
  ];
  const axes: Axis[] = axisCandidates.filter((a): a is Axis => a.level !== null);

  const doneCount = n.checklist.filter((c) => c.done).length;
  /* [983] Lab 표기 7종을 하나로 — 저장값은 그대로 둔다(lib/notes/author-label) */
  const author = displayAuthorLabel(n.authorLabel) || "내집나우 스카우트";
  /* [v4 · 규칙 1] 사실 한 줄 — 단지(제목과 다를 때만) · 지역 · 방문일 · 작성자. 날씨는 "현장 기록" 행으로 */
  const apt = n.aptName?.trim() || "";
  const factLine = [apt && apt !== n.title.trim() ? apt : "", n.region.trim(), n.visitDate ? `방문 ${n.visitDate}` : "", author]
    .filter(Boolean)
    .join(" · ");

  const weakest = scoreEntries
    .filter(([, v]) => v > 0)
    .sort((a, b) => a[1] - b[1])[0];

  /* AI 요약 — 저장된 note.aiAnalysis(실호출 결과)를 우선 표시.
     없을 때만 규칙 기반 문구로 폴백하고, 캡션으로 출처를 구분한다. */
  const ai = (n.aiAnalysis ?? null) as Record<string, unknown> | null;
  const storedAiText = [ai?.narrativeSummary, ai?.summary, ai?.detailedConclusion].find(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const aiEngine = typeof ai?.engine === "string" ? ai.engine : "";
  const ruleInline = scored
    ? `입력 ${scoredAxisCount}개 축 평균 ${avg.toFixed(1)}/5점 — ${
        weakest
          ? `${weakest[0]} 축(${weakest[1]}/5)이 감점 요인입니다.`
          : "축별 점수를 참고하세요."
      }`
    : "현장 축 점수 미입력 — 종합 점수 없음";
  const aiBadge = storedAiText
    ? aiEngine.startsWith("rule-based")
      ? "규칙 기반 분석"
      : "AI 생성"
    : "규칙 기반 요약";

  return {
    breadcrumb: `공개 임장노트 › ${displayTitle}`,
    oneLiner: n.title,
    factLine,
    weather: n.weather?.trim() || "",
    /* [#71] 현장 인증 — 작성 시점 위치 확인(거리 버킷만 저장) 통과 여부 */
    fieldVerified: Boolean(n.metadata?.visitVerified),
    lab: isLabAuthor(n.authorLabel),
    axes,
    body: n.summary?.trim() || n.sections.memo?.trim() || "",
    photos: n.photos,
    visits:
      visitsOverride && visitsOverride.length > 0
        ? visitsOverride
        : [
            {
              id: n.id,
              label: `1차 · ${n.visitDate}`,
              summary: scored
                ? `평점 ${avg.toFixed(1)}/5 · 체크 ${doneCount}/${n.checklist.length}`
                : `점수 미입력 · 체크 ${doneCount}/${n.checklist.length}`,
              latest: true,
            },
          ],
    goodPoints: goodPoints.slice(0, 4),
    cautionPoints: cautionPoints.slice(0, 4),
    aiInline: storedAiText ?? ruleInline,
    aiBadge,
    totalScore: total,
    scoredAxisCount,
    // 값이 기록되지 않은 축(0점)은 생략 — 없는 기록을 있는 것처럼 그리지 않는다
    scoreBars: scoreEntries
      .filter(([, v]) => v > 0)
      .map(([label, v]) => ({
        label,
        value: Math.round(v * 20),
        bad: v <= 2,
      })),
    checklistDone: doneCount,
    checklistTotal: n.checklist.length,
    // 이 화면의 수치는 전부 작성자가 직접 남긴 방문 기록에서 나온다 —
    // 실거래가를 근거로 쓰지 않으므로 출처에 적지 않는다.
    sourceLabel: "작성자 직접 방문 기록",
    baseDate: formatDate(n.updatedAt) || n.visitDate,
    regionLabel: n.region,
    complexLabel: displayTitle,
  };
}

/* ---------- SEO (20b): generateMetadata — 공개 노트만 index ---------- */
/* fetchPublicNote 헬퍼는 제거 — 실패와 없음을 둘 다 null 로 뭉개서
   소프트 404 수복(아래)에 필요한 구분을 지우고 있었다. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /* [969 · 20] 페이지와 같은 요청 메모(React cache) — 예전엔 여기서 getNote 를 따로 불러
     요청마다 노트 조회가 두 번이었다. 실패·없음은 예전처럼 noindex 로 접는다. */
  const loaded = await loadNote(id);
  const note: InspectionNote | null = loaded.kind === "ok" ? loaded.note : null;
  if (!note || !note.isPublic) {
    // 비공개 노트·없는 노트·조회 실패는 색인 금지 (20b 색인 정책)
    return {
      /* [970 · C-25] 제목 접미 통일 `| 내집나우`(아래 정상 경로와 같은 접미) */
      title: "임장노트 | 내집나우",
      robots: { index: false, follow: false },
    };
  }

  const displayTitle = note.aptName?.trim() || note.title;
  const title = `${note.title} — ${note.region} 임장노트 | 내집나우`;
  const description = (
    note.summary?.trim() ||
    note.sections.memo?.trim() ||
    `${note.region} ${displayTitle} 직접 방문 임장 기록 — 채광·소음·주차·교통 평가와 좋았던 점·주의할 점.`
  ).slice(0, 150);
  const canonical = `${BASE_URL}/notes/${note.id}`;

  // 동적 OG 이미지 — 실데이터(제목·점수·4축)를 URL 인코딩 (metadataBase 기준 절대화)
  const view = toView(note);
  const ogQuery = new URLSearchParams({
    title: note.title,
    score: view.totalScore != null ? String(view.totalScore) : "",
    badges: view.axes.map((a) => `${a.label} ${a.level}`).join(","),
  });
  // 좌표가 있으면 OG 카드에 네이버 Static Map 썸네일 노출(키 있을 때). 없으면 지도 없이 폴백.
  {
    const m = (note.metadata ?? {}) as Record<string, unknown>;
    const lat = Number(m.lat ?? m.latitude);
    const lng = Number(m.lng ?? m.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      ogQuery.set("lat", String(lat));
      ogQuery.set("lng", String(lng));
    }
  }

  /* [1012 · 썸네일] 고른 썸네일이 있으면 공유 카드 첫 장으로(정사각) — 없으면 지금 카드만 */
  const cover = resolveNoteCover(note);
  return {
    title,
    description,
    alternates: seoAlternates(`/notes/${note.id}`),
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "article",
      publishedTime: note.createdAt,
      modifiedTime: note.updatedAt,
      images: [
        ...(cover.template && cover.url
          ? [{ url: cover.url, width: 720, height: 720, alt: `${note.title} 썸네일` }]
          : []),
        {
          url: `/api/og/note?${ogQuery.toString()}`,
          width: 1200,
          height: 630,
          alt: `${note.title} 임장노트 카드`,
        },
      ],
    },
  };
}

/* ---------- JSON-LD (Article) — 공개 노트만 ---------- */

/* 문자열이 아니라 **객체**를 돌려준다. 예전에는 여기서 JSON.stringify 한 결과를 그대로
   dangerouslySetInnerHTML 에 넣었는데, note.title·authorLabel 은 사용자가 적는 값이라
   `</script><script>…` 를 넣으면 문서에 실행 가능한 스크립트가 그대로 박혔다(저장형 XSS).
   직렬화와 `<` 이스케이프는 공용 <JsonLd>(lib/seo/jsonld.ts jsonLdScript 와 같은 규칙)에
   맡긴다 — 이 파일의 다른 JSON-LD(noteJsonLd)도 이미 그 경로를 쓴다. */
function articleJsonLd(note: InspectionNote): Record<string, unknown> {
  const displayTitle = note.aptName?.trim() || note.title;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: note.title,
    description:
      note.summary?.trim() ||
      `${note.region} ${displayTitle} 직접 방문 임장 기록`,
    datePublished: note.createdAt,
    dateModified: note.updatedAt,
    author: {
      "@type": "Person",
      name: displayAuthorLabel(note.authorLabel) || "내집나우 스카우트",
    },
    /* [1007 · P2] 전역 Organization 노드 참조(@id) — 페이지마다 다른 발행 주체 노드가 생기지 않게
       (WebPage·Dataset·뉴스 NewsArticle 과 같은 모양, lib/seo/jsonld.ts publisherRef) */
    publisher: publisherRef(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/notes/${note.id}`,
    },
    articleSection: note.region,
    about: {
      "@type": "ApartmentComplex",
      name: displayTitle,
      address: note.region,
    },
  };
}

/* ---------- JSON-LD (항목 H37) — 공유 JsonLd 헬퍼용 오브젝트 빌더 ----------
   점수(0~100)가 있으면 Review, 없으면 Article. 존재하는 필드만 채워 반환한다. */
function noteJsonLd(
  note: InspectionNote,
  view: NoteView,
): Record<string, unknown> {
  const apt = note.aptName?.trim() || undefined;
  const author = displayAuthorLabel(note.authorLabel) || "내집나우 스카우트";
  const datePublished = note.createdAt || undefined;
  const score = view.totalScore;

  if (score != null && score > 0) {
    return {
      "@context": "https://schema.org",
      "@type": "Review",
      headline: note.title,
      author: { "@type": "Person", name: author },
      reviewRating: {
        "@type": "Rating",
        ratingValue: score,
        bestRating: 100,
      },
      ...(apt ? { itemReviewed: { "@type": "Residence", name: apt } } : {}),
      ...(datePublished ? { datePublished } : {}),
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: note.title,
    author: { "@type": "Person", name: author },
    ...(apt ? { about: apt } : {}),
    ...(datePublished ? { datePublished } : {}),
  };
}

/* ---------- 페이지 ---------- */

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ai?: string; quota?: string }>;
}) {
  const { id } = await params;
  const { ai: aiStatusRaw, quota: quotaRaw } = await searchParams;
  /* [1005 · A4] `?ai=` 는 작성 화면이 남기는 단계 표시다 — pending(방금 요청) · ok · rule · fail.
     화이트리스트 밖은 null(일반 열람). 실제 상태는 아래에서 저장된 분석과 합쳐 판정한다. */
  const aiQuery = readAiQuery(aiStatusRaw);

  // 뷰어 세션 — 소유자면 비공개 노트도 열람 + 공개/비공개 토글 제공
  /* [949] 세션과 노트 본문은 서로 독립이라 나란히 받는다 — 예전엔 세션(Auth 쿠키
     검증) 뒤에 노트를 읽어 왕복 하나가 통째로 직렬이었다. 이 페이지는 동적
     렌더라 요청마다 이 직렬이 그대로 TTFB 였다(실측 콜드 0.98s). */
  /* [969 · 20] 계측 — 파도별 ms 를 아래 [note-timing] 한 줄로 남긴다(표본 1/20) */
  const t0 = Date.now();
  const [session, loaded] = await Promise.all([safeAuth(), loadNote(id)]);
  const tNote = Date.now();
  const viewerEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  // 조회 실패 — "노트가 없다"고 말하면 거짓이므로 실패 그대로 알린다.
  if (loaded.kind === "error") {
    return (
      <PageShell breadcrumb="임장노트">
        <ErrorState
          title="노트를 불러오지 못했어요"
          desc="일시적 조회 오류 · 잠시 뒤 새로고침"
          cause={loaded.message}
          action={{ label: "임장노트 목록", href: "/notes" }}
        />
      </PageShell>
    );
  }

  // 미존재 노트는 404. 비공개 노트는 소유자가 아니면 존재 여부까지 숨긴다.
  if (loaded.kind === "missing") notFound();
  const realNote = loaded.note;
  const isOwner = Boolean(
    viewerEmail && realNote.authorEmail.toLowerCase() === viewerEmail,
  );
  /* 무료 소유자 판정 — 인라인 업그레이드 카드용(항목 38). 세션 plan 클레임만
     본다: 여기서 DB 를 또 읽을 만큼 중요한 판정이 아니고, 유료인데 무료로
     보이는 최악의 경우에도 카드 한 장이 더 보일 뿐이다. */
  const viewerPlanRaw = ((session?.user as { plan?: string } | undefined)?.plan ?? "free")
    .toLowerCase()
    .trim();
  const isFreeViewer = viewerPlanRaw === "free" || viewerPlanRaw === "basic" || viewerPlanRaw === "";
  /* 비공개 노트 — 소유자 외에는 원칙 차단. 단, 이 노트를 전달물로 파는 유료
     리포트를 **구매한 사람**은 열람한다(크리에이터 판매 루프의 전달 지점).
     실패는 잠기는 방향(비공개 유지)이라 안전하다. */
  /* [949] 여기부터의 조회 네 가지(구매 확인·단지 링크·회차 목록·비교 후보)는
     서로 독립이다 — 예전엔 차례로 await 해 왕복 4개가 직렬이었다. 함께 띄우고
     결과만 순서대로 판정한다. 구매 확인이 "잠금"으로 끝나면 나머지는 버려질
     뿐이고(화면에 닿지 않는다), 그 경우는 드물다(비공개 노트 + 비소유자 + 로그인). */
  const visitComplexId =
    typeof realNote.metadata?.complexId === "string"
      ? realNote.metadata.complexId.trim()
      : "";
  const visitApt = realNote.aptName?.trim() ?? "";
  /* [1005 · A4] AI 정리 상태 — 저장된 분석이 있으면 그것이 진실(ready/rule), 없으면 쿼리가
     말하는 단계(pending → 폴링 카드 · fail → 실패). 저장 직후(postSave)는 소유자가 `?ai=` 를
     달고 온 경우이되 pending 은 아직 아니다 — 결과가 오기 전엔 "다음 행동"을 재촉하지 않는다. */
  /* [1005 · M3] 수정 저장 — PATCH 는 옛 aiAnalysis 를 남기고 새 정리는 아직 도는 중이다. 저장된
     분석이 **지금 내용의 것인지**를 AI 라우트와 같은 해시(lib/notes/content-hash)로 대조한다.
     다르면(stale) 있는 분석을 무시하고 pending — 옛 요약을 "반영됐어요"로 내보내지 않는다.
     intent 는 작성 화면이 라우트에 보낸 값과 같은 규칙(방문 목적 → 실거주 기본)이다. */
  const hasAnalysis = hasAiAnalysis(realNote.aiAnalysis);
  const expectedHash = noteContentHash(realNote, retryDefaultIntent(realNote));
  const stale =
    aiQuery === "pending" && hasAnalysis && storedContentHash(realNote) !== expectedHash;
  const aiState = aiStateOf({
    query: aiQuery,
    hasAnalysis,
    analysisMode: analysisModeOf(realNote.aiAnalysis),
    stale,
  });
  const postSave = isOwner && aiQuery !== null && aiState !== "pending";
  const wantsNearby = postSave && Boolean(realNote.region.trim());
  /* NoteForm 이 예전엔 저장 리다이렉트에 quota=1 을 실어 보냈다 — AI 월간 한도에 걸린 채
     저장된 경우다. 그 값을 버리면 가치가 전달된 바로 그 화면(정리된 노트)에서 업그레이드
     안내가 나갈 기회가 사라진다(항목 38). [1005 · M7] 작성 화면은 이제 AI 응답을 기다리지
     않아 quota=1 을 보낼 수 없다 — 대신 라우트가 한도 폴백에 적는 engine 표기(`rule-based-v1
     (quota)`)를 저장 직후 화면에서 읽는다. 쿼리는 호환용으로 남긴다(/map WelcomeHandoff 동일). */
  const quotaHit = quotaRaw === "1" || (postSave && isQuotaFallback(realNote.aiAnalysis));
  /* [967 · 12] 댓글은 공개 노트(또는 소유자 본인)에만 — 이 페이지는 force-dynamic 이라
     요청마다 렌더되므로 다른 요청별 조회(구매 확인·회차 목록)와 같은 방식으로 서버에서
     함께 읽는다. 공개 캐시가 없으니 뷰어별 "내 댓글" 판정을 서버에서 해도 새지 않는다.
     실패는 댓글 섹션만 "못 불러왔다" 로 접는다(노트 본문이 우선). */
  const wantsComments = realNote.isPublic || isOwner;
  /* [969 · 20] 뷰어와 무관한 조회만 데이터 캐시로 — **공개 노트 + 비소유자** 에서만.
     · 회차 목록: 캐시본은 공개 회차만 담는다(비소유자 화면과 같은 집합). 소유자는
       비공개 회차도 봐야 하므로 실조회 그대로.
     · 댓글: 비로그인 뷰어만 캐시. 로그인 뷰어의 "내 댓글" 판정은 author_email 이
       필요한데 공개 응답 모양에는 없으므로 실조회(listNoteCommentsForViewer).
     · 단지 링크(resolveComplexHref)는 이미 6시간 데이터 캐시([948])라 손대지 않는다.
     · 구매 확인·인근 단지·세션·플랜은 뷰어별 값이라 캐시하지 않는다.
     캐시 로더는 공개 노트가 아니면 던지므로(assertPublic) 조건을 여기서 먼저 건다. */
  const useCachedVisits = realNote.isPublic && !isOwner;
  const useCachedComments = realNote.isPublic && !isOwner && !viewerEmail;
  const [purchasedAccess, complexHref, groupedR, nearbyRowsR, commentsR] = await Promise.all([
    (async () => {
      if (realNote.isPublic || isOwner || !viewerEmail) return false;
      const reportId = await findPaidReportIdByNote(realNote.id);
      if (!reportId) return false;
      return hasPurchased(reportId, viewerEmail).catch(() => false);
    })(),
    // 아파트명(+지역)으로 실 단지 id 조회 — 못 찾으면 링크 숨김
    resolveComplexHref(realNote.aptName, realNote.region).catch((): string | null => null),
    // 방문 기록 비교 — complexId 우선, 없으면 aptName. 비소유자는 공개 회차만.
    visitComplexId || visitApt
      ? (useCachedVisits
          ? listPublicVisitGroupCached(realNote)
          : visitComplexId
            ? listNotesByAuthorForComplex(realNote.authorEmail, visitComplexId)
            : listNotesByAuthorForApt(realNote.authorEmail, visitApt)
        ).then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const }),
        )
      : Promise.resolve({ ok: false as const }),
    wantsNearby
      ? listComplexesInDistrict(realNote.region.trim(), 6).then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const }),
        )
      : Promise.resolve({ ok: false as const }),
    wantsComments
      ? (useCachedComments
          ? listPublicNoteCommentsCached(realNote).then(
              (comments): { comments: NoteComment[]; ownCommentIds: string[] } => ({
                comments,
                ownCommentIds: [],
              }),
            )
          : listNoteCommentsForViewer(realNote.id, viewerEmail)
        ).then(
          (r) => ({ ok: true as const, ...r }),
          (e: unknown) => {
            console.error("[/notes/[id]] 댓글 조회 실패:", e);
            return { ok: false as const };
          },
        )
      : Promise.resolve({ ok: false as const }),
  ]);
  /* [969 · 20] [note-timing] — 노트 파도(세션∥노트행)와 곁다리 파도를 따로 잰다.
     path=cache 면 노트 행이 데이터 캐시에서 왔다는 뜻이고, visits/comments 는 그 조회가
     캐시(cache)·실조회(db)·생략(skip) 중 무엇이었는지다. 배포 뒤 이 줄로 "공개 비로그인
     열람에서 DB 왕복이 실제로 0이 됐는지" 를 읽는다. 이메일·제목은 싣지 않는다. */
  const tSide = Date.now();
  if (shouldLogNoteTiming()) {
    const viewerKind = isOwner ? "owner" : viewerEmail ? "member" : "anon";
    const visitsPath = !(visitComplexId || visitApt) ? "skip" : useCachedVisits ? "cache" : "db";
    const commentsPath = !wantsComments ? "skip" : useCachedComments ? "cache" : "db";
    /* 생략(skip)은 실패가 아니다 — 조회를 한 것만 센다 */
    const fail =
      (visitsPath !== "skip" && !groupedR.ok ? 1 : 0) +
      (commentsPath !== "skip" && !commentsR.ok ? 1 : 0);
    console.info(
      `[note-timing] path=${loaded.source} public=${realNote.isPublic ? 1 : 0} viewer=${viewerKind} ` +
        `visits=${visitsPath} comments=${commentsPath} note=${tNote - t0}ms side=${tSide - tNote}ms ` +
        `total=${tSide - t0}ms fail=${fail} id=${id.slice(0, 8)}`,
    );
  }
  if (!realNote.isPublic && !isOwner && !purchasedAccess) notFound();

  let visits: Visit[] | undefined;
  /* [#72] 재방문 변화 — 이 노트 직전 회차와의 점수·메모 변화 자동 요약 */
  let revisitDelta: RevisitDelta | null = null;
  /* [996 · 4] 이 노트가 "이어받았다"고 적은 노트(metadata.revisitOf — 995 프리필)가 있으면
     같은 단지 묶음의 순번이 아니라 **그 노트**와 견준다. 순번은 단지 id 로 묶은 것이라
     같은 단지를 다른 이름으로 적은 노트·중간에 지운 노트가 있으면 엉뚱한 것과 비교한다.
     열람 규칙은 회차 묶음과 같다: 같은 작성자의 노트만, 비소유자는 공개 노트만. */
  const revisitOf = revisitOfId(realNote);
  if (revisitOf && revisitOf !== realNote.id) {
    const prevLoaded = await loadNote(revisitOf);
    if (
      prevLoaded.kind === "ok" &&
      prevLoaded.note.authorEmail.toLowerCase() === realNote.authorEmail.toLowerCase() &&
      (isOwner || prevLoaded.note.isPublic)
    ) {
      const prevRound = Number((prevLoaded.note.metadata as Record<string, unknown> | undefined)?.round);
      const fromIdx = Number.isInteger(prevRound) && prevRound >= 1 ? prevRound - 1 : 0;
      revisitDelta = buildRevisitDelta(prevLoaded.note, realNote, fromIdx, fromIdx + 1);
    }
  }
  if (groupedR.ok) {
    try {
      const grouped = groupedR.rows;
      let visible = isOwner ? grouped : grouped.filter((x) => x.isPublic);
      if (!visible.some((x) => x.id === realNote.id)) visible = [...visible, realNote];
      visits = visible.map((x, i) => {
        const scored = hasInspectionScores(x.scores);
        const avg = inspectionAverageScore(x.scores);
        const checks = `${x.checklist.filter((c) => c.done).length}/${x.checklist.length}`;
        return {
          id: x.id,
          label: `${i + 1}차 · ${x.visitDate}`,
          summary: scored ? `평점 ${avg.toFixed(1)}/5 · 체크 ${checks}` : `점수 미입력 · 체크 ${checks}`,
          latest: x.id === realNote.id,
        };
      });
      /* [#72] 이 노트가 2회차 이상이면 직전 회차와의 변화 요약을 만든다 —
         [996 · 4] revisitOf 로 이미 만들었으면 그것이 우선이다 */
      const currIdx = visible.findIndex((x) => x.id === realNote.id);
      if (currIdx > 0 && !revisitDelta) {
        revisitDelta = buildRevisitDelta(
          visible[currIdx - 1],
          visible[currIdx],
          currIdx - 1,
          currIdx,
        );
      }
    } catch {
      visits = undefined;
    }
  }
  /* [996 · 4] 작성자의 판단 — 판단 카드 헤드라인. 깨진 값은 null(없는 것으로 그린다) */
  const noteDecision = decisionFromMetadata(realNote.metadata);

  const v = toView(realNote, visits);
  const hasLlmAi = v.aiBadge === "AI 생성";
  /* [967 · 11] 미니맵 좌표 — metadata.lat/lng (NoteForm 이 저장, OG 이미지도 같은 값을 쓴다) */
  const noteCoords = noteCoordsFromMetadata(
    (realNote.metadata ?? null) as Record<string, unknown> | null,
  );
  /* [967 · 12] 댓글 뷰 — 상대시각은 서버에서 계산해 넘긴다(hydration 불일치 방지) */
  const commentViews: NoteCommentView[] = commentsR.ok ? commentsR.comments : [];
  const commentLabels = Object.fromEntries(
    commentViews.map((c) => [c.id, relativeTime(c.createdAt)]),
  );
  const canModerateComments = isOwner || isAdmin(session);
  const complexIdFromHref =
    complexHref && complexHref.startsWith("/complex/")
      ? complexHref.slice("/complex/".length)
      : null;
  const mapCompareParams = new URLSearchParams();
  if (realNote.region.trim()) {
    mapCompareParams.set("region", realNote.region.trim());
  }
  if (complexIdFromHref) mapCompareParams.set("complexId", complexIdFromHref);
  mapCompareParams.set("noteId", id);
  if (realNote.aptName?.trim()) {
    mapCompareParams.set("apt", realNote.aptName.trim());
  }
  const mapCompareHref = `/map?${mapCompareParams.toString()}`;

  /* [993] 판단 카드의 "대표 실거래가 + 기준월" — 단지가 실거래와 매칭될 때만. 실패는 칸을 비운다. */
  const verdictPrice = complexIdFromHref
    ? await resolveComplexPrice(complexIdFromHref)
        .then((r) =>
          r.ok
            ? {
                priceKrw: r.price.priceKrw,
                bandLabel: r.price.bandLabel,
                /* [1006] 평 표기도 같이 — 설정(면적 단위)이 평인 사람은 클라이언트 섬이 이걸 고른다 */
                bandLabelPyeong: areaBandLabels(r.price.bandSlug, r.price.bandLabel).pyeong,
                latestYm: r.price.latestYm,
              }
            : null,
        )
        .catch((): null => null)
    : null;
  /* [993] LLM 결론(inspectionReport.verdict·recommendedAction)은 저장만 되고 상세가 안 그렸다 */
  const storedReport = (realNote.metadata?.inspectionReport ?? null) as
    | { verdict?: unknown; recommendedAction?: unknown }
    | null;
  const reportVerdict =
    typeof storedReport?.verdict === "string" && storedReport.verdict.trim().length > 0
      ? storedReport.verdict.trim()
      : null;
  const reportAction =
    typeof storedReport?.recommendedAction === "string" && storedReport.recommendedAction.trim().length > 0
      ? storedReport.recommendedAction.trim()
      : null;

  /* [945 · 실사용50 #18] 저장 직후 "다음 행동" — 같은 구에서 거래가 활발한
     비교 후보 단지 3곳. 실거래 이력 있는 단지만 나오는 매트뷰 기반이라
     빈 추천을 지어내지 않는다. 실패는 조용히 접는다(저장 화면이 우선). */
  let nearbyCandidates: Array<{ id: string; name: string; sub: string }> = [];
  if (wantsNearby && nearbyRowsR.ok) {
    const sameApt = (realNote.aptName ?? "").trim();
    nearbyCandidates = nearbyRowsR.rows
      .filter((c) => c.name !== sameApt)
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: c.name,
        sub: [c.district, c.build_year ? `${c.build_year}년` : null]
          .filter(Boolean)
          .join(" · "),
      }));
  }

  /* ── [v4 · 한 화면 한 가지] 행동 정리 ───────────────────────────────────────────────
     예전: 채움 파랑이 한 화면에 셋까지(상단 "{지역} 지도에서 비교" · 판단 카드 다음 행동 · 하단 "그래서 다음은?"
     카드의 primary) + 무료 소유자 PRO 카드 · 비로그인 관심단지 카드의 파랑 버튼. 같은 목적지(지도 비교 · AI 분석 ·
     단지 홈)가 두세 번씩 나왔다. 지금: 채움 파랑 1개(판단 덩어리) + 나머지는 "이어서" 구분선 행에 한 번씩. */
  const aptForTools = realNote.aptName?.trim() ?? "";
  const regionTrim = realNote.region.trim();
  const diagnosisHref = aptForTools
    ? `/analysis/ai/ai-diagnosis?apt=${encodeURIComponent(aptForTools)}&region=${encodeURIComponent(realNote.region)}`
    : null;
  /* [995 · 3] 회차 프리필 — 단지 id·좌표·태그·체크리스트를 잇고 round 를 +1 한다(app/notes/new?revisit=) */
  const revisitHref = `/notes/new?revisit=${encodeURIComponent(realNote.id)}`;
  /* 주 행동 하나: 소유자 = 다음 방문 노트(저장 직후 + 단지가 있으면 [AI-40] AI 진단 — 가장 뜨거운 순간의 제안) ·
     다른 사람 = 이 단지 AI 진단 · 단지가 없으면 지도 비교 */
  const primaryIsDiagnosis = Boolean(diagnosisHref) && (!isOwner || postSave);
  const primaryAction: { label: string; href: string } =
    primaryIsDiagnosis && diagnosisHref
      ? { label: "이 단지 AI 진단 받기", href: diagnosisHref }
      : isOwner
        ? { label: "다음 방문 노트 쓰기", href: revisitHref }
        : { label: "지도에서 이 지역 비교", href: mapCompareHref };
  /* lib/points/catalog ai_first — 첫 AI 분석 실행 100P(once). 저장 직후 AI 진단이 주 행동일 때만 한 줄 */
  const primaryCaption = postSave && primaryIsDiagnosis ? "첫 AI 분석 실행 +100P" : null;

  /* [1005 · A4] 저장 직후 AI 정리 상태 — 예전 "다음 행동" 유리 카드(문장 + 알약 셋 + 캡션)를 사실 한 줄로.
     알약 셋(지도 비교 · AI 진단/회차 기록 · 카드로 공유)은 주 행동 · "이어서" 행 · 머리 "카드 만들기"로 옮겼다. */
  const postSaveLine = postSave
    ? aiState === "ready"
      ? "저장됨 · AI 정리 반영"
      : aiState === "rule"
        ? "저장됨 · 규칙 기반 요약만 — AI 다시 정리는 아래 AI 요약에서"
        : "저장됨 · AI 정리 미반영 — 다시 정리는 아래 AI 요약에서"
    : null;

  /* [1005 · A4] AI 요약 패널 — pending 이면 이 자리에 폴링 카드가 서고, 이 패널은 "나중에 볼게요"
     뒤의 폴백이 된다(규칙 기반 요약 + 재시도). 결과가 오면 폴링 카드가 ?ai=ok 로 다시 렌더한다.
     [v4 · 규칙 6] 호박·에메랄드 색 배지("규칙 기반 요약 · LLM 아님") → 패널 안 캡션 한 줄(같은 말). 면책은 AIPanel 기본값 그대로. */
  const aiSummaryPanel = (
    <AIPanel title="AI 요약">
      <p className="t-caption text-ai-muted">
        {v.aiBadge}
        {v.aiBadge.startsWith("규칙") ? " · LLM 아님" : " · LLM"}
      </p>
      <p className="t-body">{v.aiInline}</p>
      {isOwner && !hasLlmAi && (
        <AiRetryButton noteId={id} defaultIntent={retryDefaultIntent(realNote)} />
      )}
    </AIPanel>
  );

  const photoTakenAt =
    typeof realNote.metadata?.photoTakenAt === "string"
      ? realNote.metadata.photoTakenAt.slice(5, 16).replace("T", " ")
      : "";
  const showVisits = v.visits.length > 1 || revisitDelta !== null;

  return (
    <PageShell breadcrumb={v.breadcrumb}>
      {/* JSON-LD(Article) — 공개 실데이터 노트만 삽입 (20b). 이스케이프는 <JsonLd> 가 한다. */}
      <JsonLd data={articleJsonLd(realNote)} />
      {/* 항목 H37 — 공유 JsonLd 헬퍼로 Article/Review 구조화 데이터 삽입 */}
      <JsonLd data={noteJsonLd(realNote, v)} />

      {/* [개선 #5] 비회원 소프트월 — 하루 3편까지 무료, 4편째부터 가입 안내.
          서버는 항상 전문을 렌더하므로 SEO·봇에 영향이 없다(컴포넌트 주석 참고).
          공개 노트에만 건다 — 구매 열람·본인 글은 realNote.isPublic 경로가 아니다. */}
      {realNote.isPublic && <NoteSoftWall noteId={realNote.id} />}

      {/* [v4 · 규칙 12] 데스크톱도 가운데 한 줄(최대 760px) — 오른쪽 사이드바(점수 도넛 · 기록 완성도) 없음 */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* ── 머리: 제목 + 사실 한 줄 + 글자 버튼 줄 + 사진(노트 본문) ── */}
        <div className="fold flex flex-col gap-3">
          {/* 게이트 한 줄들 — 구매 열람 · AI 한도 · 저장 직후 상태. [v4 · 규칙 9] 파란 안내 상자 → 사실 한 줄 */}
          {purchasedAccess && (
            /* 구매 열람 안내 — 없으면 구매자가 "왜 남의 비공개 글이 보이지?" 하고, 재열람 경로(/my)도 모른 채 떠난다 */
            <p className="t-sub text-text-2">
              구매한 리포트로 열람 중 ·{" "}
              <Link href="/my" className="tap-line font-bold text-primary no-underline">
                내 구매 목록 ›
              </Link>
            </p>
          )}
          {isOwner && quotaHit && (
            /* AI 한도 도달 — 노트는 저장됐다는 사실을 먼저, 다음 행동(요금제)을 한 줄에 */
            <p className="t-sub text-text-2">
              이번 달 AI 정리 한도 도달 · 이 노트는 AI 없이 저장 ·{" "}
              <Link href="/subscription" className="tap-line font-bold text-primary no-underline">
                요금제 보기 ›
              </Link>
            </p>
          )}
          {postSaveLine && (
            <p role="status" className={`t-sub ${aiState === "ready" ? "text-success" : "text-text-2"}`}>
              {postSaveLine}
            </p>
          )}

          <header className="flex flex-col gap-1">
            {/* ② 한 줄 총평 (= 제목) — h1 은 끝까지 읽혀야 해 접힌다(폰 배율 규칙에서도 말줄임 없음) */}
            <h1 className="break-words t-title text-ink">{v.oneLiner}</h1>
            {/* ① ③ 사실 한 줄 — 단지 · 지역 · 방문일 · 작성자. [v4 · 규칙 6] 지역·단지 칩 · "직접 방문" 도장 ·
                "자료 조사" 배지를 걷었다(방문일이 곧 방문 사실). 운영진 글·현장 인증은 사실이라 같은 줄 끝에 글자로 */}
            <div className="t-sub text-text-3">
              {v.factLine}
              {/* [983] 운영진 글에는 그렇다고 적는다 — 공개 노트 27건 중 25건이 Lab 글이다 */}
              {v.lab && " · 운영진 예시"}
              {/* [#71] 현장 인증 — 작성 시점에 단지 반경 2km 위치 확인을 통과한 노트.
                  [1009 · T] 설명은 옆 ⓘ 시트(누르면 규칙·저장 범위). 판정은 작성자 브라우저에서 하고 서버는
                  받은 metadata.visitVerified 를 검증 없이 저장한다 — "기기 위치로 브라우저가 판정한 표시"라고 사실대로. */}
              {v.fieldVerified && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-0.5 align-middle">
                    <span className="font-bold text-text-2">현장 인증</span>
                    <Explain
                      title="현장 인증"
                      body="노트를 쓸 때 작성자 기기의 위치로 브라우저가 단지 근처라고 판정한 표시예요. 서버가 위치를 다시 확인하지는 않고, 적힌 내용이 사실인지 보증하는 표시도 아니에요."
                      how={[
                        "노트를 쓸 때 ‘현재 위치로 인증하기’를 누르면 그 기기의 현재 위치와 단지 좌표 사이 거리를 브라우저 안에서 계산해요.",
                        "거리가 2km 안이면 인증 표시가 붙어요.",
                        "위치 좌표는 저장하지 않아요 — 50m 단위로 뭉갠 거리와 확인한 시각만 남겨요.",
                      ]}
                      size={12}
                    />
                  </span>
                </>
              )}
            </div>
          </header>

          {/* 상단 조작 — 카드 · 수정 · 공개 토글 · 공유 · 삭제(글자 버튼 한 줄, 채움 없음) */}
          <NoteDetailActions noteId={id} isOwner={isOwner} initialIsPublic={realNote.isPublic} />

          {/* 현장 사진 — 노트 본문. 큰 무대 + 좌우 전환(장수 제한 없음) */}
          {v.photos.length > 0 && <NotePhotoCarousel photos={v.photos} />}
        </div>

        {/* ── 주인공: 판단 한 덩어리(기록 점수 · 내 판단 · AI 결론 · 체크 · 대표 실거래가 · 채움 파랑 1개) ── */}
        <NoteVerdictCard
          verdict={reportVerdict}
          verdictIsLlm={hasLlmAi}
          recommendedAction={reportAction}
          totalScore={v.totalScore}
          scoredAxisCount={v.scoredAxisCount}
          scoreBars={v.scoreBars}
          checklistDone={v.checklistDone}
          checklistTotal={v.checklistTotal}
          price={verdictPrice}
          /* [996 · 4] 내 판단이 있으면 헤드라인, 없으면 소유자에게 "판단 남기기"(수정 3단계) */
          decision={noteDecision}
          decisionEditHref={isOwner && !noteDecision ? `/notes/${realNote.id}/edit#decision` : null}
          next={primaryAction}
          nextCaption={primaryCaption}
        />

        {/* ── 현장 기록: 메모 + 구분선 행(인상 · 좋았던 점 · 주의할 점 · 날씨 · 촬영) + 음성 · 위치 ── */}
        <section aria-labelledby="note-record-h" className="flex flex-col gap-3">
          <h2 id="note-record-h" className="t-section text-ink">
            현장 기록
          </h2>
          {/* [987 · 26] 다녀온 사람이 쓴 글. [v4 · 규칙 4] 괘선 종이 면(.note-paper)과 "현장에서 적은 것" 라벨 →
              흰 바탕 본문(섹션 제목이 곧 출처 표시). 메모가 없으면 채움 문장을 쓰지 않고 줄을 뺀다 */}
          {v.body && <p className="whitespace-pre-wrap t-body text-text-1">{v.body}</p>}
          {/* ④⑤⑥ 항목 평가 · 좋았던 점 · 주의할 점 — 왼쪽 이름 / 오른쪽 값, 1px 구분선(ComplexDataSources dl 과 같은 모양) */}
          <dl data-tone="hanji" className="divide-y divide-line border-y border-line">
            {/* [970 · B-10] 미입력 축은 빠지고, 하나도 없으면 "미입력"(보통으로 채우지 않는다).
                [987 · 28] 측정값이 아니라 다녀온 사람의 인상 — 행 이름("현장 인상")이 그 사실을 말한다 */}
            <div className="flex items-baseline gap-3 py-3">
              <dt className="w-20 shrink-0 t-sub font-bold text-text-2">현장 인상</dt>
              <dd className="min-w-0 t-body text-text-1">
                {v.axes.length === 0
                  ? "미입력"
                  : v.axes.map((a, i) => (
                      <span key={a.label}>
                        {i > 0 ? " · " : ""}
                        {a.label} <b className={`font-bold ${axisToneClass(a.level)}`}>{a.level}</b>
                      </span>
                    ))}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-3">
              <dt className="w-20 shrink-0 t-sub font-bold text-success">좋았던 점</dt>
              <dd className="min-w-0 t-body text-text-1">
                {v.goodPoints.length > 0 ? v.goodPoints.join(" · ") : <span className="text-text-3">기록 없음</span>}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-3">
              <dt className="w-20 shrink-0 t-sub font-bold text-danger">주의할 점</dt>
              <dd className="min-w-0 t-body text-text-1">
                {v.cautionPoints.length > 0 ? v.cautionPoints.join(" · ") : <span className="text-text-3">기록 없음</span>}
              </dd>
            </div>
            {v.weather && (
              <div className="flex items-baseline gap-3 py-3">
                <dt className="w-20 shrink-0 t-sub font-bold text-text-2">날씨</dt>
                <dd className="min-w-0 t-body text-text-1">{v.weather}</dd>
              </div>
            )}
            {/* [#134] 사진 촬영 시각 — EXIF 기반(장식 신호, 사실 판정 아님). [v4] 머리 배지 → 행 */}
            {photoTakenAt && (
              <div className="flex items-baseline gap-3 py-3">
                <dt className="w-20 shrink-0 t-sub font-bold text-text-2">사진 촬영</dt>
                <dd className="min-w-0 t-body tabular-nums text-text-1">{photoTakenAt}</dd>
              </div>
            )}
          </dl>

          {/* [#133 → AI-36·37] 음성 메모 + 브리핑 듣기·전사 도구 */}
          {Array.isArray(realNote.metadata?.voiceMemos) && realNote.metadata.voiceMemos.length > 0 && (
            <NoteAudioTools
              voiceMemos={realNote.metadata.voiceMemos}
              isOwner={isOwner}
              propertyLabel={realNote.aptName ?? realNote.title}
              briefingScript={[
                `${realNote.title}. ${realNote.region}${realNote.aptName ? `, ${realNote.aptName}` : ""} 임장 브리핑입니다.`,
                realNote.summary ?? "",
                realNote.sections?.memo ? `메모. ${String(realNote.sections.memo).slice(0, 600)}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          )}

          {/* [967 · 11] 위치 미니맵 — 좌표가 저장된 노트만. /map 좌표 포커스로 잇는다 */}
          {noteCoords && (
            <NoteMiniMap
              lat={noteCoords.lat}
              lng={noteCoords.lng}
              label={realNote.aptName?.trim() || realNote.title}
            />
          )}

          {/* [#131] 직전 저장본 — 본인에게만, 내용 수정이 있었던 노트만. [v4] 카드 → 접힘 한 줄 */}
          {isOwner && realNote.metadata?.lastRevision && (
            <details className="group border-t border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
                <span>
                  수정 전 저장본{" "}
                  <span className="t-sub font-medium text-text-3">
                    {realNote.metadata.lastRevision.at.slice(0, 16).replace("T", " ")}
                  </span>
                </span>
                <span aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="flex flex-col gap-1.5 pb-3 t-body text-text-2">
                {realNote.metadata.lastRevision.summary && (
                  <p>
                    <b className="text-ink">요약</b> {realNote.metadata.lastRevision.summary}
                  </p>
                )}
                {realNote.metadata.lastRevision.memo && (
                  <p className="whitespace-pre-wrap">
                    <b className="text-ink">메모</b> {realNote.metadata.lastRevision.memo}
                  </p>
                )}
                <p className="t-caption text-text-3">직전 1벌만 보관</p>
              </div>
            </details>
          )}
        </section>

        {/* ── 방문 기록 — 회차가 둘 이상이거나 재방문 변화가 있을 때만(1회면 머리의 방문일과 같은 사실) ── */}
        {showVisits && (
          <section aria-labelledby="note-visits-h" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="note-visits-h" className="t-section text-ink">
                방문 기록 <span className="t-num text-text-3">{v.visits.length}회</span>
              </h2>
              {/* 회차 비교(/notes/compare)는 작성자 본인 것만 열린다 — 다른 사람에게는 "내 노트만" 막다른 화면이라 소유자에게만 */}
              {isOwner && (
                <Link
                  href={`/notes/compare?noteId=${encodeURIComponent(id)}`}
                  className="tap-line shrink-0 t-sub font-bold text-primary no-underline"
                >
                  회차 비교 ›
                </Link>
              )}
            </div>
            {/* [#72] 재방문 변화 — 직전 회차 대비 바뀐 항목만. [v4] 카드 · 알약 칩 · 설명 캡션 → 두 줄 */}
            {revisitDelta && (
              <div className="flex flex-col gap-0.5">
                <p className="t-sub text-text-3">
                  {revisitDelta.round}회차 · {revisitDelta.fromLabel}({revisitDelta.prevVisitDate}) →{" "}
                  {revisitDelta.toLabel}
                </p>
                {/* [996 · 4] 판단이 바뀌었으면 그것이 첫 줄 — 항목 변화보다 먼저 답할 질문이다 */}
                {revisitDelta.decisionLine && <p className="t-body font-bold text-ink">{revisitDelta.decisionLine}</p>}
                {revisitDelta.changes.length > 0 ? (
                  <p className="t-body text-text-1">{revisitDelta.changes.join(" · ")}</p>
                ) : revisitDelta.decisionLine ? null : (
                  <p className="t-body text-text-2">직전 회차와 같음 · 비교 {revisitDelta.comparable}개 항목</p>
                )}
              </div>
            )}
            {/* [1006] 다른 회차는 링크 — 현재 노트 줄은 링크가 아니다(자기 자신) */}
            <ul data-tone="sand" className="divide-y divide-line border-y border-line">
              {v.visits.map((visit) =>
                visit.latest ? (
                  <SummaryRow key={visit.id} label={visit.label} sub={visit.summary} value="현재" />
                ) : (
                  <li key={visit.id}>
                    <Link
                      href={`/notes/${visit.id}`}
                      aria-label={`${visit.label} 노트 보기`}
                      className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block t-body font-bold text-ink">{visit.label}</span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">{visit.summary}</span>
                      </span>
                      <span aria-hidden="true" className="t-body text-text-3">
                        ›
                      </span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        {/* ── AI 요약 — AI 결과는 잉크 패널(면책 포함) 그대로 + 심화 분석(저장된 것이 있을 때만) ── */}
        <section aria-label="AI 요약" className="flex flex-col gap-4">
          {/* ⑨ AI 작성부 구분 표시 — 저장된 aiAnalysis 우선, 없으면 규칙 기반 문구.
              [1005 · A4] ?ai=pending + 분석 없음 → 폴링 카드(결과가 오면 ?ai=ok 로 재렌더).
              [M3] 수정 저장(옛 분석이 남아 있음)만 해시 일치를 기다린다 — 신규는 종전대로 존재만. */}
          {aiState === "pending" ? (
            <AiPendingCard
              noteId={id}
              canRetry={isOwner}
              defaultIntent={retryDefaultIntent(realNote)}
              expectedHash={stale ? expectedHash : null}
              fallback={
                stale ? (
                  /* "나중에 볼게요" 뒤에도 옛 요약이 새 것으로 읽히지 않게 — 무엇의 요약인지 적는다 */
                  <div className="flex flex-col gap-1.5">
                    <p className="t-caption text-text-3">수정 전 내용 기준 AI 정리 · 다시 열면 새 정리 반영</p>
                    {aiSummaryPanel}
                  </div>
                ) : (
                  aiSummaryPanel
                )
              }
            />
          ) : (
            aiSummaryPanel
          )}
          {isOwner && aiState !== "pending" && (
            <AiFeedbackButtons
              targetType="note_ai"
              targetId={id}
              context={{
                mode: hasLlmAi ? "llm" : "rule",
                badge: v.aiBadge,
              }}
            />
          )}
          {/* 항목 38 — 가치를 받은 화면의 상주 안내. AI 정리가 실제로 반영된 노트를 보는 무료 소유자에게만.
              [v4 · 규칙 9] 파란 안내 카드 + 채움 버튼 → 캡션 한 줄(플랜명은 planLabel 단일 출처) */}
          {isOwner && isFreeViewer && hasLlmAi && (
            <p className="t-caption text-text-3">
              노트마다 AI 정리 · {planLabel("pro")}{" "}
              <Link href="/subscription" className="tap-line font-bold text-primary no-underline">
                요금제 보기 ›
              </Link>
            </p>
          )}

          {/* AI 심화 분석 8축 — 저장된 것이 없으면 아무것도 그리지 않는다 */}
          <DeepDivePanel analysis={(realNote.aiAnalysis ?? null) as Record<string, unknown> | null} />
        </section>

        {/* ── 이어서 — 예전 상단 버튼 · 본문 끝 링크 줄 · 도구 카드 · "그래서 다음은?" · 로그인 카드를 구분선 행 하나로 ── */}
        <section aria-labelledby="note-next-h" className="flex flex-col gap-1">
          <h2 id="note-next-h" className="t-section text-ink">
            이어서
          </h2>
          <ul data-tone="hanji" className="divide-y divide-line border-b border-line">
            {/* [986 · 19] 노트에서 도구로 — 소유자에게 상시. 단지 4종 + 나머지 + 에이전트 */}
            {isOwner && <NoteToolsRow aptName={realNote.aptName ?? ""} region={realNote.region} noteId={id} />}
            {/* 소유자: 주 행동이 AI 진단이면 다음 방문 노트는 여기 한 행으로 */}
            {isOwner && primaryIsDiagnosis && (
              <SummaryRow label="다음 방문 노트 쓰기" sub="위치·태그·체크 이어받기" href={revisitHref} />
            )}
            {/* 다른 사람: "그래서 다음은?"의 AI 분석 — 이 노트를 맥락으로 분석 허브를 연다 */}
            {!isOwner && (
              <SummaryRow
                label="이 노트로 AI 분석"
                sub={aptForTools || regionTrim || undefined}
                href={`/analysis?noteId=${encodeURIComponent(id)}`}
              />
            )}
            {/* 15h-43 노트→지도 루프 — 지역 컨텍스트를 넘겨 비교가 끊기지 않게(주 행동이 이것이면 뺀다) */}
            {primaryAction.href !== mapCompareHref && (
              <SummaryRow
                label="지도에서 비교"
                sub={[regionTrim, aptForTools].filter(Boolean).join(" · ") || undefined}
                href={mapCompareHref}
              />
            )}
            {/* 단지 링크 — 실 단지 id를 찾은 경우에만(예전 "{단지} 홈" · "이 단지 노트 더 보기" · "단지 허브 보기"는 같은 주소) */}
            {complexHref && <SummaryRow label={`${v.complexLabel} 단지 홈`} sub="실거래 · 매물 · 다른 노트" href={complexHref} />}
            {/* A9 공개노트 전환 훅 — 비로그인 열람자에게 관심단지·알림 로그인 유도. [1009 · T] "시세" → "실거래" */}
            {!viewerEmail && complexHref && (
              <SummaryRow
                label="로그인하고 실거래 알림 받기"
                sub={`${aptForTools || "이 단지"} 관심 단지 저장`}
                href={`/login?callbackUrl=${encodeURIComponent(complexHref)}`}
              />
            )}
          </ul>

          {/* [945 #18] 저장 직후 다음 임장 후보 — 같은 구 실거래 활발 단지(매트뷰, 지어내지 않음). 소유자 저장 직후만 */}
          {postSave && nearbyCandidates.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              <p className="t-sub font-bold text-text-2">
                근처 비교 후보 <span className="font-medium text-text-3">{realNote.region} 최근 거래 많은 단지</span>
              </p>
              <ul data-tone="blue" className="divide-y divide-line border-y border-line">
                {nearbyCandidates.map((c) => (
                  <li key={c.id} className="flex min-h-14 items-center gap-2 py-2">
                    <Link href={complexHrefFromId(c.id)} className="min-w-0 flex-1 py-1 no-underline">
                      <span className="block t-body font-bold text-ink">{c.name}</span>
                      {c.sub && <span className="block truncate t-sub text-text-3">{c.sub}</span>}
                    </Link>
                    <CompareTrayButton complexId={c.id} name={c.name} region={realNote.region} />
                    <Link
                      href={`/notes/new?apt=${encodeURIComponent(c.name)}&region=${encodeURIComponent(realNote.region)}`}
                      className="inline-flex min-h-10 shrink-0 items-center t-sub font-bold text-primary no-underline"
                    >
                      노트 쓰기
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* [967 · 12] 댓글 — 공개 노트(과 소유자 본인)에만. id="comments" 는 받은편지함
            알림(/notes/[id]#comments)의 착지점이다 — 지우면 알림이 글 맨 위로 떨어진다. [v4] 카드 → 섹션 */}
        {wantsComments && (
          <section id="comments" className="flex scroll-mt-24 flex-col gap-3">
            {commentsR.ok ? (
              <NoteComments
                noteId={realNote.id}
                comments={commentViews}
                relativeLabels={commentLabels}
                ownCommentIds={commentsR.ownCommentIds}
                canModerate={canModerateComments}
                loggedIn={Boolean(viewerEmail)}
              />
            ) : (
              /* 조회 실패를 "댓글 없음" 으로 그리지 않는다 */
              <p role="alert" className="t-sub text-text-2">
                댓글을 불러오지 못함 · 잠시 후 새로고침
              </p>
            )}
          </section>
        )}

        {/* [3차] 같은 지역 다른 노트 + 지역 허브 연결 — 읽고 끝나는 상세를 순환로로 */}
        {realNote.isPublic && <RelatedNotes currentId={realNote.id} region={realNote.region} />}

        {/* ⑦⑧ 맨 끝 출처 한 줄 — 출처 · 기준일 + 신고(#81, 타인의 노트만).
            [v4 · 규칙 9] 광고 공간(AdZone article_end)은 뺐다 — 자사 안내 카드는 주 화면에 두지 않는다 */}
        <p className="flex flex-wrap items-center gap-x-1.5 t-caption text-text-3">
          <span>
            출처 {v.sourceLabel} · 기준일 {v.baseDate}
          </span>
          {!isOwner && (
            <>
              <span aria-hidden="true">·</span>
              <ReportButton postId={realNote.id} />
            </>
          )}
        </p>
      </div>
    </PageShell>
  );
}
