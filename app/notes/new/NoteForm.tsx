"use client";

import { ActionButton } from "@/app/components/ui/ActionButton";
import { Switch } from "@/app/components/ui/Switch";
import { CharCount } from "@/app/components/ui/CharCount";
import { useToast } from "@/app/components/toast/ToastProvider";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { NoteLocationSearch, type NoteLocation } from "./NoteLocationSearch";
import type { NoteDraft as AiNoteDraft } from "@/lib/ai/note-draft-core";
import { FieldCaptureConsentNotice } from "@/components/inspection/field-capture-consent";
import {
  CARRY_OVER_KEY,
  NOTE_STEPS,
  ONE_HAND_KEY,
  carryOverAgeLabel,
  readCarryOver,
  readOneHand,
  serializeCarryOver,
  serializeOneHand,
  stepDone,
  type CarryOverComplex,
  type NoteStep,
} from "@/lib/notes/form-steps";
import { useMoment } from "@/app/components/motion/MomentProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import {
  allKnownChecklistItems,
  CHECKLIST_GROUPS,
  getChecklistForIntent,
  type InspectionChecklistIntent,
} from "@/lib/inspection/checklist";
import { checklistHintsFromVoice } from "@/lib/inspection/voice-checklist-keywords";
import {
  isDraftNewerThan,
  noteDraftKey,
  stableStringify,
} from "@/lib/notes/draft-summary";
import {
  localDateIso,
  makeCoverPhoto,
  mergeUploadedPhotos,
  movePhoto,
  runWithConcurrency,
  uploadFailureLabel,
  uploadProgressLabel,
  visitDateFromTakenAt,
} from "@/lib/notes/note-form-utils";
import { resizeImageFiles } from "@/lib/client/image-resize";
import { readExifTakenAt } from "@/lib/client/exif-datetime";
import { useUnsavedGuard } from "@/lib/client/use-unsaved-guard";
import {
  CHECK_ITEMS,
  checksFromSavedNote,
  composeScoresFromChecks,
  countCheckedItems,
  isNoteLevel,
  NOTE_LEVELS,
  type NoteLevel,
} from "@/lib/notes/note-scores";
/* [OPT-27] 음성 녹음기는 새 노트에서만 쓰인다 — 폼 첫 로드 번들에서 분리 */
import nextDynamic from "next/dynamic";
const VoiceMemoRecorder = nextDynamic(
  () => import("./VoiceMemoRecorder").then((m) => m.VoiceMemoRecorder),
  { ssr: false, loading: () => <div className="h-10 animate-pulse rounded-xl bg-surface" /> },
);
/* [985] AI 초안 패널도 분리 — "AI 초안 받기"를 누르기 전에는 필요 없다.
   /notes/new 예산(470KB) 여유가 1~2KB 뿐이라, 조건부로만 쓰이는 화면은
   초기 번들에 두지 않는다. */
const AiDraftPanel = nextDynamic(
  () => import("./AiDraftPanel").then((m) => m.AiDraftPanel),
  { ssr: false, loading: () => <div className="h-24 animate-pulse rounded-xl bg-surface" /> },
);
/* [985 · 17] 현장 브리핑도 같은 이유로 분리 — 위치를 고른 뒤에만 필요하다.
   직접 두면 /notes/new 초기 번들이 471KB 가 되어 예산(470KB)을 1KB 넘겼다(실측).
   예산을 올리지 않는다. 위치를 안 고르면 이 코드는 내려오지도 않는다. */
const FieldBriefCard = nextDynamic(
  () => import("./FieldBriefCard").then((m) => m.FieldBriefCard),
  { ssr: false },
);

/* 임장노트 작성/수정 공용 폼 (시안 6b·6r)
   - 작성: POST /api/inspection/notes → /api/inspection/ai(AI 정리) → 상세 이동
   - 수정: PATCH /api/inspection/notes/[id] (소유자 전용 — /notes/[id]/edit)
   - 템플릿: /notes/new?tpl={id} → 서버에서 읽어 props 로 전달, 고려사항 체크리스트 프리셋 주입
   - #45 임시저장: localStorage 1초 디바운스 자동 저장 — 작성은 nz_note_draft,
     수정은 nz_note_draft:edit:<id> ([967 · 9·10] noteDraftKey) */

const LEVELS = NOTE_LEVELS;
type Level = NoteLevel;

/* [970 · B-10] 현장 체크 9항목 — 예전 CHECK_DEFAULTS(채광 좋음·주차 아쉬움…)는 지웠다.
   기본값이 있으면 아무것도 고르지 않은 노트가 "평가된 채" 저장돼 상세·비교·AI 재료에
   지어낸 점수가 흘렀다. 이제 고른 항목만 남고(빈 객체에서 시작), 축 점수 합성은
   lib/notes/note-scores(미선택 축 = 0 = 미입력)가 맡는다. */
const CHECK_KEYS: readonly string[] = CHECK_ITEMS;

const VISIT_GROUPS: { label: string; options: string[] }[] = [
  { label: "유형", options: ["아파트", "빌라", "오피스텔"] },
  { label: "시간대", options: ["오전", "오후", "저녁", "주말"] },
  { label: "목적", options: ["실거주", "투자", "전월세", "갈아타기"] },
];

/* 방문 정보 3칩 ↔ metadata 키.
   예전엔 시간대만 transportation 으로 서버에 갔고, 유형·목적은 payload 의 어디에도
   (scores·sections·metadata 어디에도) 없었다. 탭하면 강조까지 되는데 저장하는 순간
   사라져 localStorage 초안에만 남았다 — 눌러도 아무 일이 없는 컨트롤이었던 셈이다.
   metadata 는 jsonb 라 임의 키가 그대로 보존되고 POST/PATCH 라우트도 통과시키므로
   satisfaction 과 같은 자리에 세 값을 모두 적고, 수정 모드에서 되읽는다. */
const VISIT_META_KEYS: Record<string, string> = {
  유형: "propertyType",
  시간대: "visitTimeSlot",
  목적: "visitPurpose",
};

const VISIT_DEFAULTS: Record<string, string> = {
  유형: "아파트",
  시간대: "오후",
  목적: "실거주",
};

const WEATHER_CHIPS = ["맑음", "흐림", "비", "눈", "더움", "추움"] as const;

type InvestorRole = "live" | "invest" | "rent" | "balanced";

function intentFromVisitPurpose(purpose: string | undefined): InspectionChecklistIntent {
  if (purpose === "투자") return "투자";
  if (purpose === "전월세") return "전월세";
  return "실거주";
}

function investorRoleFromPurpose(purpose: string | undefined): InvestorRole {
  if (purpose === "투자") return "invest";
  if (purpose === "전월세") return "rent";
  if (purpose === "갈아타기") return "balanced";
  return "live";
}

/** 로컬 시각 → 방문 시간대 기본값 */
function timeSlotFromClock(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "오전";
  if (h < 17) return "오후";
  return "저녁";
}

function normalizeLoose(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

type TagTone = "pos" | "neg";
type TagDef = { label: string; tone: TagTone };

/* 자주 쓰는 태그 후보 — 기본은 아무것도 선택하지 않는다(남의 기록처럼 보이지 않게) */
const TAG_CANDIDATES: TagDef[] = [
  { label: "초품아", tone: "pos" },
  { label: "남향 위주", tone: "pos" },
  { label: "역세권", tone: "pos" },
  { label: "커뮤니티 시설", tone: "pos" },
  { label: "대단지", tone: "pos" },
  { label: "공원 인접", tone: "pos" },
  { label: "학원가", tone: "pos" },
  { label: "관리 잘됨", tone: "pos" },
  { label: "이중주차", tone: "neg" },
  { label: "노후 배관", tone: "neg" },
  { label: "층간소음", tone: "neg" },
  { label: "엘리베이터 대기", tone: "neg" },
  { label: "관리비 부담", tone: "neg" },
  { label: "일조권 우려", tone: "neg" },
  { label: "도로 소음", tone: "neg" },
  { label: "냄새·환기", tone: "neg" },
];

type TodoItem = { text: string; level: "중요" | "보통" };

const TODO_DEFAULTS: TodoItem[] = [
  { text: "겨울철 저층 채광 재확인", level: "중요" },
  { text: "관리비 내역·배관 교체 이력 문의", level: "보통" },
  { text: "주차 만차 시간대 재확인", level: "중요" },
  { text: "엘리베이터·택배 동선 확인", level: "보통" },
  { text: "단지 내 소음원(놀이터·도로) 체감", level: "보통" },
];


const MAX_PHOTOS = 10;
/* [967 · 6] 동시 업로드 수 — /api/upload 는 1분 10회 제한이라 3이면 10장이 한
   번에 가도 한도 안이고, 모바일 회선에서 한 장씩 차례로 기다리는 것보다 빠르다. */
const UPLOAD_CONCURRENCY = 3;
/* [967 · 8] 본문 상한 — 서버(app/api/inspection/notes/route.ts · lib/inspection/
   store-db.ts)에 summary/memo 길이 제한이 없어 폼에서 정한 값. 카운터·maxLength 가
   같은 수를 본다. */
const MEMO_MAX = 5000;
/* [967 · 7] 인라인 추가 입력의 상한 — 예전 window.prompt 의 slice 와 같은 수 */
const TAG_MAX = 20;
const TODO_MAX = 80;

/* [967 · 1·6] 파일 하나의 업로드 상태 — 진행 줄과 재시도의 단위 */
type UploadItem = {
  id: string;
  name: string;
  status: "uploading" | "done" | "failed";
  /** XHR upload.onprogress 가 준 실제 % (lengthComputable 일 때만) */
  pct?: number;
  /** 리사이즈된 파일 — 실패분 재시도에 그대로 쓴다 */
  file: File;
  /** 미리보기용 object URL — 항목이 빠질 때 revoke */
  preview: string | null;
  error?: string;
  /** 401 이면 로그인 안내로 이어진다 */
  httpStatus?: number;
};

export type NoteFormTemplate = {
  id: string;
  title: string;
  sections: { title: string; items: string[] }[];
};

/** 템플릿 문구 ↔ 의도 체크리스트 느슨 매칭 — 강제 완료가 아니라 추천 체크 */
function checklistSuggestionsFromTemplate(t: NoteFormTemplate): {
  checked: Record<string, boolean>;
  openGroupIds: string[];
} {
  const texts = t.sections
    .flatMap((s) => [s.title, ...s.items])
    .map(normalizeLoose)
    .filter((x) => x.length >= 2);
  const checked: Record<string, boolean> = {};
  const open = new Set<string>();
  for (const g of CHECKLIST_GROUPS) {
    for (const it of g.items) {
      const labelN = normalizeLoose(it.label);
      const tokens = it.label
        .split(/[\s·・\/\-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      const hit = texts.some(
        (tx) =>
          (tx.length >= 2 && labelN.includes(tx)) ||
          (labelN.length >= 4 && tx.includes(labelN.slice(0, 4))) ||
          tokens.some((tok) => tx.includes(normalizeLoose(tok))),
      );
      if (hit) {
        checked[it.id] = true;
        open.add(g.id);
      }
    }
  }
  return { checked, openGroupIds: [...open] };
}

export type NoteFormInitialNote = {
  id: string;
  title: string;
  region: string;
  aptName: string | null;
  visitDate: string;
  weather?: string | null;
  summary: string | null;
  scores: {
    location: number;
    school: number;
    transport: number;
    facility: number;
    future: number;
  };
  checklist: { label: string; done: boolean }[];
  sections: { pros?: string; cons?: string; memo?: string };
  photos: string[];
  isPublic: boolean;
  metadata?: Record<string, unknown> | null;
  /** [967 · 10] 마지막 서버 저장 시각 — 이보다 나중에 적힌 수정 초안만 복원 제안 */
  updatedAt?: string | null;
};

/* ===== #45 임시저장 (localStorage — [967 · 10] 작성·수정 모두) ===== */

/* 임시저장 키는 홈 "이어서 보기" 배너와 공유 — noteDraftKey(null) = nz_note_draft
   (고도화 8·21). 수정 모드는 noteDraftKey(id) 로 노트별 분리 [967 · 9]. */

type NoteDraft = {
  v: 1;
  savedAt: string;
  checks: Record<string, Level>;
  visit: Record<string, string>;
  tags: string[];
  doneTodos: string[];
  /** [970 · B-10] null = 미입력(기본). 예전 초안의 숫자는 그대로 읽는다 */
  satisfaction: number | null;
  memo: string;
  /* 선택 필드(구버전 드래프트 호환) */
  loc?: NoteLocation;
  photos?: string[];
  isPublic?: boolean;
  /** 카테고리 체크리스트 항목 id → 체크 여부 */
  groupChecked?: Record<string, boolean>;
  weather?: string;
  /** 모바일8 — 체크리스트 섹션 접기 상태(그룹 id → 열림). 긴 폼에서 접어 둔
      구성을 복원해 스크롤 소모를 줄인다. */
  openGroups?: Record<string, boolean>;
  /** [967 · 2] 방문일(YYYY-MM-DD) — 사진 촬영일로 채운 값도 여기 남는다 */
  visitDate?: string;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseDraft(raw: string | null): NoteDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (
      typeof o.savedAt !== "string" ||
      typeof o.memo !== "string" ||
      (typeof o.satisfaction !== "number" && o.satisfaction !== null) ||
      !o.checks ||
      typeof o.checks !== "object" ||
      !o.visit ||
      typeof o.visit !== "object" ||
      !isStringArray(o.tags) ||
      !isStringArray(o.doneTodos)
    ) {
      return null;
    }
    const checks: Record<string, Level> = {};
    for (const [k, val] of Object.entries(o.checks as Record<string, unknown>)) {
      if (isNoteLevel(val)) checks[k] = val;
    }
    const visit: Record<string, string> = {};
    for (const [k, val] of Object.entries(o.visit as Record<string, unknown>)) {
      if (typeof val === "string") visit[k] = val;
    }
    let loc: NoteLocation | undefined;
    if (o.loc && typeof o.loc === "object") {
      const l = o.loc as Record<string, unknown>;
      if (typeof l.aptName === "string" && typeof l.region === "string") {
        loc = {
          aptName: l.aptName,
          region: l.region,
          complexId: typeof l.complexId === "string" ? l.complexId : null,
          lat: typeof l.lat === "number" ? l.lat : null,
          lng: typeof l.lng === "number" ? l.lng : null,
        };
      }
    }
    const groupChecked: Record<string, boolean> = {};
    if (o.groupChecked && typeof o.groupChecked === "object") {
      for (const [k, val] of Object.entries(o.groupChecked as Record<string, unknown>)) {
        if (typeof val === "boolean") groupChecked[k] = val;
      }
    }
    const openGroups: Record<string, boolean> = {};
    if (o.openGroups && typeof o.openGroups === "object") {
      for (const [k, val] of Object.entries(o.openGroups as Record<string, unknown>)) {
        if (typeof val === "boolean") openGroups[k] = val;
      }
    }
    return {
      v: 1,
      savedAt: o.savedAt,
      checks,
      visit,
      tags: o.tags,
      doneTodos: o.doneTodos,
      satisfaction: typeof o.satisfaction === "number" ? o.satisfaction : null,
      memo: o.memo,
      loc,
      photos: isStringArray(o.photos) ? o.photos : undefined,
      isPublic: typeof o.isPublic === "boolean" ? o.isPublic : undefined,
      groupChecked: Object.keys(groupChecked).length ? groupChecked : undefined,
      weather: typeof o.weather === "string" ? o.weather : undefined,
      openGroups: Object.keys(openGroups).length ? openGroups : undefined,
      visitDate:
        typeof o.visitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.visitDate)
          ? o.visitDate
          : undefined,
    };
  } catch {
    return null;
  }
}

/* [967 · 10] 초안 ↔ 폼 상태 "내용이 같은가" 비교용 정규형. 저장 시각·접기 상태
   같은 표시용 필드는 뺀다 — 그것만 달라진 초안을 복원하라고 묻는 건 소음이다. */
type DraftComparable = {
  checks: Record<string, Level>;
  visit: Record<string, string>;
  tags: string[];
  doneTodos: string[];
  satisfaction: number | null;
  memo: string;
  loc?: NoteLocation;
  photos?: string[];
  isPublic?: boolean;
  groupChecked?: Record<string, boolean>;
  weather?: string;
  visitDate?: string;
};

function draftComparable(d: DraftComparable): string {
  return stableStringify({
    checks: d.checks,
    visit: d.visit,
    tags: d.tags,
    doneTodos: d.doneTodos,
    satisfaction: d.satisfaction,
    memo: d.memo,
    loc: d.loc ?? null,
    photos: d.photos ?? [],
    isPublic: d.isPublic ?? false,
    /* 끄면 false 로 남는 키가 있어 "켜진 것"만 센다 — 켰다 끈 항목은 안 바뀐 것 */
    groupChecked: Object.entries(d.groupChecked ?? {})
      .filter(([, on]) => on)
      .map(([k]) => k)
      .sort(),
    weather: d.weather ?? "",
    visitDate: d.visitDate ?? "",
  });
}

/** [967 · 4] "HH:MM" — 저장 바·복구 배너의 시각 표기 */
function clockLabel(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ===== 수정 모드 초기값 매핑 ===== */

/* [970 · B-10] 저장 노트 → 체크 복원 — fieldRatings 에 적힌 키만(기본값으로 채우지 않는다),
   구버전은 축 점수 역변환(0 축은 비움). 본체는 lib/notes/note-scores. */
function checksFromNote(n: NoteFormInitialNote): Record<string, Level> {
  return checksFromSavedNote(n.metadata?.fieldRatings, n.scores);
}

function groupCheckedFromNote(n: NoteFormInitialNote | null | undefined): Record<string, boolean> {
  if (!n?.checklist?.length) return {};
  const known = allKnownChecklistItems();
  const byLabel = new Map(known.map((it) => [it.label, it.id]));
  const out: Record<string, boolean> = {};
  for (const c of n.checklist) {
    if (!c.done) continue;
    const id = byLabel.get(c.label);
    if (id) out[id] = true;
  }
  return out;
}

function splitTagText(s?: string): string[] {
  return (s ?? "")
    .split("·")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagDefsFromNote(n?: NoteFormInitialNote | null): TagDef[] {
  const defs = [...TAG_CANDIDATES];
  if (!n) return defs;
  for (const label of splitTagText(n.sections.pros)) {
    if (!defs.some((d) => d.label === label)) defs.push({ label, tone: "pos" });
  }
  for (const label of splitTagText(n.sections.cons)) {
    if (!defs.some((d) => d.label === label)) defs.push({ label, tone: "neg" });
  }
  return defs;
}

function todosFromTemplate(t: NoteFormTemplate): TodoItem[] {
  const out: TodoItem[] = [];
  for (const section of t.sections) {
    for (const item of section.items) {
      out.push({
        text: section.title ? `[${section.title}] ${item}` : item,
        level: "보통",
      });
      if (out.length >= 40) return out;
    }
  }
  return out;
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = meta?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* 저장된 metadata 에서 방문 정보 3칩을 복원한다.
   되읽지 않으면 수정 모드가 항상 아파트/오후/실거주로 시작해, 사용자가 예전에 고른
   값을 화면에 보여주지도 않은 채 저장 때 기본값으로 덮어써 버린다. */
function visitFromNote(n?: NoteFormInitialNote | null): Record<string, string> {
  /* 신규 작성: 지금 시각으로 시간대 기본값. 수정: 저장값 복원 */
  const out: Record<string, string> = {
    ...VISIT_DEFAULTS,
    시간대: timeSlotFromClock(),
  };
  if (!n) return out;
  for (const g of VISIT_GROUPS) {
    const saved = n.metadata?.[VISIT_META_KEYS[g.label]];
    if (typeof saved === "string" && g.options.includes(saved)) out[g.label] = saved;
  }
  return out;
}

export function NoteForm({
  template,
  initialNote,
  presetMemo,
  preferAi = false,
  fromWelcome = false,
  quickStart = false,
}: {
  template?: NoteFormTemplate | null;
  initialNote?: NoteFormInitialNote | null;
  /** 작성 모드 메모 초안 프리필 (?memo= — /calculator 조건 전달용) */
  presetMemo?: string | null;
  /** 홈 AI CTA — 저장 후 AI 정리 유도 (?intent=ai) */
  preferAi?: boolean;
  /** /welcome 온보딩 — 저장·AI 후 지도로 루프 완료 */
  fromWelcome?: boolean;
  /** [#68] 현장 퀵모드(?quick=1) — 사진·위치·메모 먼저, 세부 평가는 접어 둔다 */
  quickStart?: boolean;
}) {
  const router = useRouter();
  const { showMoment } = useMoment();
  const { handleUpgradeResponse, promptUpgrade } = useUpgradePaywall();
  const { promptSignup } = useSoftSignup();
  const { showToast } = useToast();
  const isEdit = Boolean(initialNote);
  const editId = initialNote?.id ?? null;
  /* [967 · 9] 작성은 nz_note_draft, 수정은 노트별 키 */
  const draftKey = noteDraftKey(editId);

  /** welcome 루프면 지도로, 아니면 노트 상세로 */
  const afterSaveHref = (noteId: string, aiFlag: string, quota: boolean) => {
    if (fromWelcome && !isEdit) {
      try {
        window.localStorage.setItem("nz_onboarding_loop", "done");
        window.localStorage.setItem("nz_journey_loop", "map");
      } catch {
        /* ignore */
      }
      const mapQs = new URLSearchParams({
        noteId,
        from: "welcome",
        ai: aiFlag,
      });
      if (loc.region.trim()) mapQs.set("region", loc.region.trim());
      if (loc.complexId) mapQs.set("complexId", loc.complexId);
      if (loc.aptName.trim()) mapQs.set("apt", loc.aptName.trim());
      if (quota) mapQs.set("quota", "1");
      return `/map?${mapQs.toString()}`;
    }
    return `/notes/${noteId}?ai=${aiFlag}${quota ? "&quota=1" : ""}`;
  };

  /* 위치(단지·주소) — 기본은 빈 값(placeholder). 프리필: ?apt=&region=&complexId=&lat=&lng= */
  const [loc, setLoc] = useState<NoteLocation>(() =>
    initialNote
      ? {
          aptName: initialNote.aptName ?? "",
          region: initialNote.region,
          complexId:
            typeof initialNote.metadata?.complexId === "string"
              ? (initialNote.metadata.complexId as string)
              : null,
          lat: metaNumber(initialNote.metadata, "lat"),
          lng: metaNumber(initialNote.metadata, "lng"),
        }
      : { aptName: "", region: "", complexId: null, lat: null, lng: null },
  );
  useEffect(() => {
    if (isEdit) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const apt = sp.get("apt")?.trim();
      const region = sp.get("region")?.trim();
      const complexId = sp.get("complexId")?.trim() || null;
      const latRaw = Number(sp.get("lat"));
      const lngRaw = Number(sp.get("lng"));
      if (apt || region || complexId) {
        setLoc((prev) => ({
          aptName: apt ? apt.slice(0, 60) : prev.aptName,
          region: region ? region.slice(0, 60) : prev.region,
          complexId,
          lat: Number.isFinite(latRaw) && latRaw !== 0 ? latRaw : null,
          lng: Number.isFinite(lngRaw) && lngRaw !== 0 ? lngRaw : null,
        }));
      }
    } catch {
      /* URL 파싱 실패 — 빈 위치 유지 */
    }
  }, [isEdit]);

  /* [970 · B-10] 새 노트는 빈 객체 — 고른 항목만 담긴다 */
  const [checks, setChecks] = useState<Record<string, Level>>(() =>
    initialNote ? checksFromNote(initialNote) : {},
  );
  const [visit, setVisit] = useState<Record<string, string>>(() =>
    visitFromNote(initialNote),
  );
  /* [967 · 2] 방문일 — 예전엔 상태도 입력도 없이 저장 시 "오늘"(수정은 원래 값)로
     굳었다. 어제 다녀온 단지를 오늘 적으면 방문일이 틀렸고 고칠 길이 없었다.
     기본은 오늘(로컬 달력), 사진 EXIF 촬영일이 있고 손대지 않았으면 그 날짜. */
  const [visitDate, setVisitDate] = useState<string>(() => {
    const saved = initialNote?.visitDate?.slice(0, 10);
    return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : localDateIso();
  });
  /* 수정 모드는 저장된 날짜가 곧 사용자의 선택 — EXIF 로 덮지 않는다 */
  const visitDateTouchedRef = useRef(Boolean(isEdit));
  const [visitDateFromPhoto, setVisitDateFromPhoto] = useState(false);
  const todayIso = localDateIso();
  const [tagDefs, setTagDefs] = useState<TagDef[]>(() => tagDefsFromNote(initialNote));
  const [tags, setTags] = useState<string[]>(() =>
    initialNote
      ? [...splitTagText(initialNote.sections.pros), ...splitTagText(initialNote.sections.cons)]
      : [],
  );
  const [todoItems, setTodoItems] = useState<TodoItem[]>(() => {
    if (initialNote && initialNote.checklist.length > 0) {
      /* 카테고리 체크리스트 라벨은 그룹 UI로 복원 — 커스텀/기본 고려사항만 남긴다 */
      const knownLabels = new Set(allKnownChecklistItems().map((it) => it.label));
      const levels =
        initialNote.metadata?.todoLevels &&
        typeof initialNote.metadata.todoLevels === "object"
          ? (initialNote.metadata.todoLevels as Record<string, unknown>)
          : {};
      const custom = initialNote.checklist
        .filter((c) => !knownLabels.has(c.label))
        .map((c) => ({
          text: c.label,
          level: levels[c.label] === "중요" ? ("중요" as const) : ("보통" as const),
        }));
      return custom.length ? custom : TODO_DEFAULTS;
    }
    if (template && template.sections.length > 0) return todosFromTemplate(template);
    return TODO_DEFAULTS;
  });
  /* [AI-24] AI 체크리스트 핸드오프 — /analysis/ai/my-checklist 에서 넘어온 항목을
     고려사항(todo)으로 1회 병합. 10분 지난 저장분은 무시(우발 병합 방지). */
  useEffect(() => {
    if (initialNote) return; // 새 노트에서만
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("fromChecklist") !== "1") return;
      const raw = window.localStorage.getItem("nz_ai_checklist");
      if (!raw) return;
      window.localStorage.removeItem("nz_ai_checklist");
      const parsed = JSON.parse(raw) as { at?: number; items?: unknown };
      if (!parsed || typeof parsed.at !== "number" || Date.now() - parsed.at > 10 * 60_000) return;
      const items = Array.isArray(parsed.items)
        ? parsed.items.filter((x): x is string => typeof x === "string").slice(0, 10)
        : [];
      if (!items.length) return;
      setTodoItems((prev) => {
        const exist = new Set(prev.map((t) => t.text));
        const added = items
          .filter((t) => !exist.has(t))
          .map((t) => ({ text: t, level: "보통" as const }));
        return added.length ? [...prev, ...added] : prev;
      });
    } catch {
      /* 병합 실패는 조용히 — 폼 본연 동작 우선 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [doneTodos, setDoneTodos] = useState<string[]>(() => {
    if (!initialNote) return [];
    const knownLabels = new Set(allKnownChecklistItems().map((it) => it.label));
    return initialNote.checklist
      .filter((c) => c.done && !knownLabels.has(c.label))
      .map((c) => c.label);
  });
  const [groupChecked, setGroupChecked] = useState<Record<string, boolean>>(() =>
    groupCheckedFromNote(initialNote),
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    location: true,
    complex: true,
    interior: false,
    school: false,
    facility: false,
    future: false,
  });
  const [weather, setWeather] = useState(() => {
    if (typeof initialNote?.weather === "string" && initialNote.weather.trim()) {
      return initialNote.weather.trim();
    }
    if (typeof initialNote?.metadata?.weather === "string") {
      return String(initialNote.metadata.weather);
    }
    return "";
  });
  const [weatherHint, setWeatherHint] = useState<string | null>(null);
  /* [985 · 17] 같은 응답에 시세·공기질·지역 체크 힌트·개발계획이 이미 들어 있다 —
     예전에는 weatherHint 만 꺼내 쓰고 나머지를 버렸다(요청·캐시 비용은 그대로 내면서).
     응답을 **그대로** 들고 있는다: 무엇을 보여줄지 고르는 일은 지연 로드되는
     카드 쪽에서 한다(판정 모듈까지 초기 번들에 들어오지 않게). */
  const [fieldContext, setFieldContext] = useState<unknown>(null);
  const [templateSuggestedIds, setTemplateSuggestedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [memoHints, setMemoHints] = useState<Array<{ id: string; label: string }>>(
    [],
  );
  const timeSlotTouchedRef = useRef(Boolean(isEdit));

  const checklistGroups = useMemo(
    () => getChecklistForIntent(intentFromVisitPurpose(visit["목적"])),
    [visit],
  );

  /* 템플릿 → 의도 체크리스트 추천 (고려사항과 별도) */
  useEffect(() => {
    if (isEdit || !template?.sections?.length) return;
    const { checked, openGroupIds } = checklistSuggestionsFromTemplate(template);
    const ids = Object.keys(checked);
    if (ids.length === 0) return;
    setTemplateSuggestedIds(new Set(ids));
    setGroupChecked((prev) => ({ ...checked, ...prev }));
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const id of openGroupIds) next[id] = true;
      return next;
    });
  }, [isEdit, template]);

  /* 위치 확정 시 날씨 힌트 (public-data-context — 카카오 아님) */
  useEffect(() => {
    const region = loc.region.trim();
    if (!region) {
      setWeatherHint(null);
      setFieldContext(null);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      const intent = intentFromVisitPurpose(visit["목적"]);
      const qs = new URLSearchParams({
        region,
        intent,
      });
      if (loc.aptName.trim()) qs.set("aptName", loc.aptName.trim());
      fetch(`/api/inspection/public-data-context?${qs.toString()}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { weatherHint?: string } | null) => {
          const hint =
            typeof j?.weatherHint === "string" ? j.weatherHint.trim() : "";
          setWeatherHint(hint || null);
          /* [985 · 17] 나머지 필드도 쓴다. 판정은 lib/inspection/field-brief.ts —
             무엇을 몇 줄까지 믿고 보여줄지가 판단이라 테스트를 붙여 뒀다. */
          setFieldContext(j);
        })
        .catch(() => {
          /* 조회 실패 — 제안·브리핑만 숨김(작성은 그대로 진행된다) */
        });
    }, 450);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [loc.region, loc.aptName, visit]);
  /* [970 · B-10] 기본 null(미입력) — 예전 7.5 기본값은 안 건드린 노트도 "만족 7.5"로 저장했다 */
  const [satisfaction, setSatisfaction] = useState<number | null>(() => {
    const v = metaNumber(initialNote?.metadata, "satisfaction");
    return v == null ? null : Math.max(0, Math.min(10, v));
  });
  /* 메모·태그는 기본 빈 값 — 예시 문구는 placeholder 로만 노출.
     작성 모드에서 ?memo= 프리셋이 오면 초안으로 채운다. */
  const [memo, setMemo] = useState(() =>
    initialNote ? (initialNote.sections.memo ?? initialNote.summary ?? "") : (presetMemo ?? ""),
  );
  /* 공개 여부 — 기본 비공개, 저장 직전 명시적으로 선택 */
  const [isPublic, setIsPublic] = useState(initialNote?.isPublic ?? false);
  /* 공개 노트를 내집나우 공식 소셜(릴스/쇼츠) 소재로 쓰는 데 대한 명시 동의.
     기본 꺼짐 — 동의 없는 이용자 노트는 자동 소재 선정에서 제외된다
     (lib/social/autopost.ts 가 이 값을 본다). */
  const [socialShareConsent, setSocialShareConsent] = useState(
    Boolean(initialNote?.metadata?.socialShareConsent),
  );
  const [photos, setPhotos] = useState<string[]>(initialNote?.photos ?? []);

  /* [#134] 사진 EXIF 촬영 시각 — 가장 이른 1개 (방문 시간 배지 재료, 장식 신호) */
  const [photoTakenAt, setPhotoTakenAt] = useState<string | null>(null);

  /* [967 · 2] 촬영일 → 방문일 프리필. 사용자가 날짜를 건드린 뒤에는 덮지 않는다
     (EXIF 는 힌트지 사실 판정이 아니다). 채웠다는 사실은 화면에 적는다. */
  useEffect(() => {
    if (visitDateTouchedRef.current) return;
    const d = visitDateFromTakenAt(photoTakenAt);
    if (!d) return;
    setVisitDate(d);
    setVisitDateFromPhoto(true);
  }, [photoTakenAt]);

  /* [#133] 음성 메모 URL 목록 (metadata.voiceMemos) */
  const [voiceMemos, setVoiceMemos] = useState<string[]>(
    Array.isArray(initialNote?.metadata?.voiceMemos)
      ? (initialNote?.metadata?.voiceMemos as string[])
      : [],
  );

  /* [#68] 현장 퀵모드 — 임장의 실제 순서(사진 먼저, 평가는 나중)와 폼 순서를
     일치시킨다. 켜져 있으면 세부 평가 4개 섹션(현장 체크·체크리스트·태그·
     고려사항)을 접고, 사진·위치·메모·저장만 남긴다. 임시저장(1초 자동)이
     이미 있으므로 "나중에 채우기"는 초안 복구로 자연스럽게 이어진다. */
  /* [984] 세터를 걷었다 — 이 값을 바꾸던 유일한 곳(퀵모드 배너의 "세부 항목
     펼치기")이 단계 구조로 대체됐다. 남은 쓰임은 **사진 버튼 순서** 하나다:
     ?quick=1 로 들어온 사람은 촬영이 먼저다. */
  const [quickMode] = useState(quickStart && !isEdit);

  /* ── [984 · 01] 3단계 ────────────────────────────────────────────────
     예전엔 위치부터 공개 설정까지 **한 화면 3,000px** 이 이어졌다. 현장에서
     스크롤 어디쯤인지 모른 채 채우다 보면, 무엇이 남았는지도 알 수 없다.
     같은 입력을 세 덩어리로 나눈다 — 어디 / 무엇을 봤나 / 무엇을 남길까.
     내용은 그대로 두고 보이는 범위만 나눈다(마운트는 유지 — 단계를 오가도
     입력이 사라지지 않는다. hidden 클래스로 감출 뿐 언마운트하지 않는다).
     수정 모드도 같은 구조다 — 화면이 두 갈래면 다음에 반드시 어긋난다. */
  const [step, setStep] = useState<NoteStep>(1);
  const stepTopRef = useRef<HTMLDivElement>(null);
  const goStep = (n: NoteStep) => {
    setStep(n);
    /* 단계를 바꾸면 그 단계의 처음을 보여 준다 — 스크롤 위치가 남아 있으면
       "아무 일도 안 일어난 것"처럼 보인다. */
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stepTopRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  };

  /* ── [984 · 13] 한 손 모드 ───────────────────────────────────────────
     현장에서는 한 손에 폰, 다른 손에 우산·가방·아이 손이다. 엄지가 닿는 곳은
     화면 아래쪽뿐인데 단계 이동 탭은 맨 위에 있다. 켜면 단계 이동을 **화면
     아래 고정 바**로 내리고 조작을 48px 로 키운다(989에서 정한 40px 보다 한
     단계 위 — 한 손 엄지는 두 손보다 부정확하다). 기기에 기억한다. */
  const [oneHand, setOneHand] = useState(false);
  useEffect(() => {
    try {
      setOneHand(readOneHand(localStorage.getItem(ONE_HAND_KEY)));
    } catch {
      /* 저장소 접근 불가(사파리 프라이빗 등) — 기본값 그대로 */
    }
  }, []);
  const toggleOneHand = () => {
    setOneHand((v) => {
      const next = !v;
      try {
        localStorage.setItem(ONE_HAND_KEY, serializeOneHand(next));
      } catch {
        /* 저장 실패해도 이번 세션에는 적용된다 */
      }
      return next;
    });
  };

  /* ── [984 · 05] 단지 이어받기 ────────────────────────────────────────
     같은 날 같은 단지를 두 번 보거나 옆 단지를 이어 보는 일이 흔한데, 그때마다
     단지명을 처음부터 다시 검색해야 했다. 직전에 저장한 단지를 **이 기기에**
     남겨 두고 새 노트 첫 화면에서 한 번에 이어받는다(로그인 없이 쓰는 사람도
     써야 하므로 서버가 아니라 localStorage). 14일이 지나면 제안하지 않는다. */
  const [carryOver, setCarryOver] = useState<CarryOverComplex | null>(null);
  const [carryOverUsed, setCarryOverUsed] = useState(false);
  useEffect(() => {
    if (isEdit) return;
    try {
      setCarryOver(readCarryOver(localStorage.getItem(CARRY_OVER_KEY), Date.now()));
    } catch {
      /* 저장소 접근 불가 — 제안만 안 뜬다 */
    }
  }, [isEdit]);

  /* [#71] 직접 방문 인증(선택) — 현재 위치와 단지 좌표의 거리로 확인.
     프라이버시 설계: 사용자의 원 좌표는 **어디에도 저장·전송하지 않는다**.
     브라우저 안에서 거리만 계산해 50m 단위 버킷과 시각만 metadata 에 남긴다.
     동의는 이 버튼을 직접 누르는 행위 그 자체(눌러야만 위치 권한 요청). */
  const [visitVerified, setVisitVerified] = useState<
    { method: "geo"; distanceM: number; at: string } | null
  >(null);
  const [verifyState, setVerifyState] = useState<
    "idle" | "asking" | "far" | "denied" | "unsupported"
  >("idle");
  const [verifyFarKm, setVerifyFarKm] = useState<number | null>(null);
  const runVisitVerify = () => {
    if (typeof loc.lat !== "number" || typeof loc.lng !== "number") return;
    if (!("geolocation" in navigator)) {
      setVerifyState("unsupported");
      return;
    }
    setVerifyState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 6371000;
        const dLat = toRad(pos.coords.latitude - (loc.lat as number));
        const dLng = toRad(pos.coords.longitude - (loc.lng as number));
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(loc.lat as number)) *
            Math.cos(toRad(pos.coords.latitude)) *
            Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a));
        if (dist <= 2000) {
          setVisitVerified({
            method: "geo",
            distanceM: Math.max(50, Math.round(dist / 50) * 50), // 50m 버킷 — 정밀 위치 비저장
            at: new Date().toISOString(),
          });
          setVerifyState("idle");
        } else {
          setVisitVerified(null);
          setVerifyFarKm(Math.round(dist / 100) / 10);
          setVerifyState("far");
        }
      },
      () => setVerifyState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  /* [944] AI 초안 적용 흔적 — 저장 메타(aiDraft*)와 화면 라벨의 근거 */
  const [aiDraftMeta, setAiDraftMeta] = useState<{
    llm: boolean;
    model: string | null;
    scored: boolean;
  } | null>(null);
  const applyAiDraft = (d: AiNoteDraft) => {
    /* 사용자 입력 보존이 원칙: 비어 있으면 채우고, 있으면 아래에 덧붙인다. */
    setMemo((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${d.memo}` : d.memo));
    if (Object.keys(d.checks).length > 0) {
      setChecks((prev) => ({ ...prev, ...(d.checks as Record<string, Level>) }));
    }
    if (d.satisfaction != null) setSatisfaction(d.satisfaction);
    if (d.todo.length > 0) {
      setTodoItems((prev) => {
        const seen = new Set(prev.map((t) => t.text));
        const add = d.todo.filter((t) => !seen.has(t)).map((text) => ({ text, level: "보통" as const }));
        return [...prev, ...add];
      });
    }
    setAiDraftMeta({
      llm: d.llmUsed,
      model: d.model,
      scored: Object.keys(d.checks).length > 0 || d.satisfaction != null,
    });
  };

  /* [967 · 1·6] 파일별 업로드 상태. uploading 은 여기서 파생한다 — 별도 불리언을
     들고 있으면 병렬 업로드에서 "하나 끝났다 = 전부 끝났다"로 어긋난다. */
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploading = uploads.some((u) => u.status === "uploading");
  const uploadSeqRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  /* [968 · 32] 촬영 직행 input — capture="environment" 는 iOS 에서 "사진 보관함/촬영"
     시트를 건너뛰고 후면 카메라를 바로 연다. 같은 onPickFiles 로 흘러 업로드 로직은 하나. */
  const captureRef = useRef<HTMLInputElement>(null);
  /* 두 input 의 값을 함께 비운다 — 같은 파일을 연달아 고를 수 있게(change 는 값이 바뀔 때만) */
  const resetPickers = () => {
    if (fileRef.current) fileRef.current.value = "";
    if (captureRef.current) captureRef.current.value = "";
  };

  const [savedDraft, setSavedDraft] = useState(false);
  /* [967 · 4] 마지막 임시저장 시각 — 하단 저장 바의 상태 문구 재료 */
  const [lastAutosaveAt, setLastAutosaveAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* [966] 새로고침·탭 닫기 가드.
     [967 · 10] 작성·수정 모두 1초 자동 임시저장이 도니, 아직 못 따라온 구간
     (draftPending)에서만 묻는다 — 저장본이 있으면 나가도 잃는 게 없다(수정 모드는
     다시 열 때 복원 배너가 받는다). 저장 요청 중(saving)에는 묻지 않는다 —
     노트는 이미 서버로 가고 있다. */
  const [draftPending, setDraftPending] = useState(false);
  /* 처음 연 값의 정규형 — 수정 초안이 "노트와 다른가"의 기준 [967 · 10] */
  const [editBaseline] = useState(() =>
    draftComparable({
      checks,
      visit,
      tags,
      doneTodos,
      satisfaction,
      memo,
      loc,
      photos,
      isPublic,
      groupChecked,
      weather,
      visitDate,
    }),
  );
  useUnsavedGuard(!saving && draftPending);

  const loginHref = `/login?callbackUrl=${encodeURIComponent(
    editId ? `/notes/${editId}/edit` : "/notes/new",
  )}`;

  /* #45 복구 배너용 드래프트 스냅샷 — [967 · 10] 수정 모드도(노트별 키) */
  const [pendingDraft, setPendingDraft] = useState<NoteDraft | null>(null);

  /* 모바일19 — 오프라인 안내. 지하주차장 등 무신호 현장에서 작성하다 저장이
     실패하면 글이 날아간 걸로 오해한다. 사실을 말한다: 입력은 이 기기에
     1초마다 임시저장되고 있고(작성 모드 한정 — 아래 autosave effect),
     연결이 돌아오면 저장하면 된다. navigator.onLine 은 "확실히 끊김"만
     신뢰할 수 있는 신호라 끊김 안내에만 쓴다. */
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const hydratedRef = useRef(false);

  /* [967 · 10] 열 때 초안 확인.
     작성: 있으면 그대로 배너(예전과 같다).
     수정: 노트 마지막 저장(updatedAt)보다 나중에 적혔고 지금 불러온 노트와 내용이
     다를 때만 배너. 같거나 낡은 초안은 지운다 — 다음에 또 묻지 않게. */
  useEffect(() => {
    try {
      const d = parseDraft(window.localStorage.getItem(draftKey));
      if (!d) return;
      if (!isEdit) {
        setPendingDraft(d);
        return;
      }
      const worth =
        isDraftNewerThan(d.savedAt, initialNote?.updatedAt) &&
        draftComparable(d) !== editBaseline;
      if (worth) setPendingDraft(d);
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 배너 없이 진행 */
    }
    // editBaseline 은 마운트 시 고정값 — 초기 1회만 판단하면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, draftKey]);

  const buildDraft = (): NoteDraft => ({
    v: 1,
    savedAt: new Date().toISOString(),
    checks,
    visit,
    tags,
    doneTodos,
    satisfaction,
    memo,
    loc,
    photos,
    isPublic,
    groupChecked,
    weather,
    openGroups,
    visitDate,
  });

  const writeDraft = () => {
    try {
      const d = buildDraft();
      window.localStorage.setItem(draftKey, JSON.stringify(d));
      setSavedDraft(true);
      setLastAutosaveAt(d.savedAt);
      setDraftPending(false);
    } catch {
      /* 저장 불가 환경 — 조용히 무시 */
    }
  };

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* no-op */
    }
  };

  /* 입력 변경 시 1초 디바운스 자동 저장 (첫 렌더 제외).
     [967 · 10] 수정 모드도 같은 경로 — 키만 노트별(draftKey). 예전엔 수정 중
     새로고침 한 번에 고친 내용이 전부 사라졌다. */
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    setDraftPending(true); /* [966] 입력 → 저장 사이 1초가 가드 구간 */
    const t = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            v: 1,
            savedAt,
            checks,
            visit,
            tags,
            doneTodos,
            satisfaction,
            memo,
            loc,
            photos,
            isPublic,
            groupChecked,
            weather,
            openGroups,
            visitDate,
          } satisfies NoteDraft),
        );
        setSavedDraft(true);
        setLastAutosaveAt(savedAt);
        setDraftPending(false);
      } catch {
        /* no-op */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [
    draftKey,
    checks,
    visit,
    tags,
    doneTodos,
    satisfaction,
    memo,
    loc,
    photos,
    isPublic,
    groupChecked,
    weather,
    openGroups,
    visitDate,
  ]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setChecks({ ...pendingDraft.checks });
    setVisit((prev) => ({ ...prev, ...pendingDraft.visit }));
    setTags(pendingDraft.tags);
    setTagDefs((prev) => {
      const next = [...prev];
      for (const label of pendingDraft.tags) {
        if (!next.some((d) => d.label === label)) next.push({ label, tone: "pos" });
      }
      return next;
    });
    setDoneTodos(pendingDraft.doneTodos);
    setSatisfaction(pendingDraft.satisfaction);
    setMemo(pendingDraft.memo);
    if (pendingDraft.loc) setLoc(pendingDraft.loc);
    if (pendingDraft.photos) setPhotos(pendingDraft.photos.slice(0, MAX_PHOTOS));
    if (typeof pendingDraft.isPublic === "boolean") setIsPublic(pendingDraft.isPublic);
    if (pendingDraft.groupChecked) setGroupChecked(pendingDraft.groupChecked);
    if (typeof pendingDraft.weather === "string") setWeather(pendingDraft.weather);
    // 모바일8 — 접기 상태 복원(기본값 위에 덮어쓰기, 저장 안 된 그룹은 기본 유지)
    if (pendingDraft.openGroups) {
      const saved = pendingDraft.openGroups;
      setOpenGroups((prev) => ({ ...prev, ...saved }));
    }
    /* [967 · 2] 방문일 — 초안에 있으면 사용자가 정한 값으로 본다(EXIF 로 안 덮게) */
    if (pendingDraft.visitDate) {
      setVisitDate(pendingDraft.visitDate);
      visitDateTouchedRef.current = true;
      setVisitDateFromPhoto(false);
    }
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
  };

  const draftSavedLabel = (() => {
    if (!pendingDraft) return null;
    const t = Date.parse(pendingDraft.savedAt);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${clockLabel(pendingDraft.savedAt)} 저장됨`;
  })();

  /* [967 · 4] 하단 저장 바의 임시저장 상태 문구 — 사실만 말한다: 대기 중이면
     대기 중, 저장했으면 그 시각. 한 번도 안 했으면 자동 저장이 된다는 안내. */
  const autosaveStatus = draftPending
    ? "임시저장 대기 중…"
    : lastAutosaveAt
      ? `${clockLabel(lastAutosaveAt) ?? ""} 임시저장됨`.trim()
      : "입력하면 이 기기에 자동 임시저장돼요";

  const toggleTag = (label: string) =>
    setTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
  const toggleTodo = (text: string) =>
    setDoneTodos((prev) =>
      prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text],
    );

  /* [967 · 7] window.prompt 대신 인라인 미니 입력 — 966 에서 prompt/confirm 을
     전부 걷어냈는데 이 두 곳이 남아 있었다(prompt 는 모바일 키보드·IME 와
     어긋나고 다크 모드도 못 따른다). Enter 추가 · Esc 취소 · 중복은 토스트. */
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [todoInputOpen, setTodoInputOpen] = useState(false);
  const [todoInput, setTodoInput] = useState("");

  const submitCustomTag = () => {
    const label = tagInput.trim().slice(0, TAG_MAX);
    if (!label) return;
    if (tags.includes(label)) {
      showToast("이미 있어요");
      return;
    }
    setTagDefs((prev) =>
      prev.some((d) => d.label === label) ? prev : [...prev, { label, tone: "pos" }],
    );
    setTags((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setTagInput("");
    setTagInputOpen(false);
  };

  const submitTodo = () => {
    const text = todoInput.trim().slice(0, TODO_MAX);
    if (!text) return;
    if (todoItems.some((t) => t.text === text)) {
      showToast("이미 있어요");
      return;
    }
    setTodoItems((prev) => [...prev, { text, level: "보통" }]);
    setTodoInput("");
    setTodoInputOpen(false);
  };

  /* [967 · 1·6] 사진 업로드 — 파일마다 독립 요청(XHR, 진행률), 3개씩 병렬.
     예전엔 for 루프가 첫 실패에서 return 해 그때까지 올라간 사진의 URL 이
     setPhotos 에 닿지 못했다 — 서버에는 있는데 노트에는 없는 사진이 생겼다.
     이제 성공분은 성공한 순간 photos 에 붙고, 실패분만 줄에 남아 재시도한다. */
  const previewUrlsRef = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  const makePreview = (file: File): string | null => {
    try {
      const u = URL.createObjectURL(file);
      previewUrlsRef.current.add(u);
      return u;
    } catch {
      return null;
    }
  };

  /* 항목을 목록에서 빼면서 미리보기 URL 도 놓아준다 */
  const dropUploads = (pred: (u: UploadItem) => boolean) =>
    setUploads((prev) => {
      for (const u of prev) {
        if (pred(u) && u.preview) {
          URL.revokeObjectURL(u.preview);
          previewUrlsRef.current.delete(u.preview);
        }
      }
      return prev.filter((u) => !pred(u));
    });

  const patchUpload = (id: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  /** 한 파일 업로드 — fetch 대신 XHR: upload.onprogress 로 실제 진행률을 받는다.
      던지지 않고 결과로 말한다(병렬 배치에서 한 장 실패가 나머지를 못 막게). */
  const uploadOne = (
    item: UploadItem,
  ): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }> =>
    new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        patchUpload(item.id, { pct: Math.min(99, Math.round((e.loaded / e.total) * 100)) });
      };
      xhr.onload = () => {
        let json: { url?: string; error?: string } = {};
        try {
          json = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        } catch {
          /* 본문이 JSON 이 아니면 아래 상태 코드로만 판단 */
        }
        if (xhr.status >= 200 && xhr.status < 300 && json.url) {
          resolve({ ok: true, url: String(json.url) });
        } else {
          resolve({
            ok: false,
            status: xhr.status,
            error:
              json.error ??
              (xhr.status === 401 ? "로그인이 필요해요." : "사진 업로드에 실패했어요."),
          });
        }
      };
      xhr.onerror = () =>
        resolve({ ok: false, status: 0, error: "네트워크 오류로 사진을 올리지 못했어요." });
      xhr.onabort = () => resolve({ ok: false, status: 0, error: "업로드가 취소됐어요." });
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("folder", "notes");
      xhr.send(fd);
    });

  /** 항목 묶음을 3개씩 올린다 — 신규 선택과 실패분 재시도가 같은 경로 */
  const runUploads = async (items: UploadItem[]) => {
    if (items.length === 0) return;
    setSaveError(null);
    setNeedLogin(false);
    let unauthorized = false;
    await runWithConcurrency(items, UPLOAD_CONCURRENCY, async (item) => {
      const r = await uploadOne(item);
      if (r.ok) {
        /* 성공한 순간 붙인다 — 뒤 파일이 실패해도 이 사진은 이미 노트에 있다 */
        setPhotos((prev) => mergeUploadedPhotos(prev, [r.url], MAX_PHOTOS));
        patchUpload(item.id, { status: "done", pct: 100 });
      } else {
        if (r.status === 401) unauthorized = true;
        patchUpload(item.id, { status: "failed", error: r.error, httpStatus: r.status });
      }
    });
    if (unauthorized) setNeedLogin(true);
    /* 다 성공했으면 진행 줄을 치운다. 실패가 있으면 done 도 같이 남겨
       "N장 중 M장 실패" 집계가 사실과 맞게 한다. */
    setUploads((prev) => {
      if (prev.some((u) => u.status === "failed" || u.status === "uploading")) return prev;
      for (const u of prev) {
        if (u.preview) {
          URL.revokeObjectURL(u.preview);
          previewUrlsRef.current.delete(u.preview);
        }
      }
      return [];
    });
  };

  /* ── [985 · 15] 오프라인 사진 ──────────────────────────────────────────
     예전에는 오프라인 배너가 "사진 업로드는 연결 후에 해주세요"라고 말했다.
     현장은 지하 주차장·엘리베이터·신도시라 신호가 없는 순간이 많은데, 사진은
     바로 그때 찍는다. 나중에 다시 찍을 수 없는 것을 "연결 후에"로 미루면
     기록 자체가 사라진다.

     lib/inspection/offline-queue.ts (IndexedDB) 가 이미 저장소에 있었는데
     **아무도 import 하지 않는 죽은 코드**였다(실측: 사용처 0). 새로 만들지 않고
     그것을 연결한다. 업로드 자체는 기존 uploadOne 을 그대로 쓴다 — 경로가
     둘이면 한쪽만 고쳐진다.

     번들: IndexedDB 코드는 오프라인일 때만 필요하므로 동적 import 로 초기
     번들 밖에 둔다(/notes/new 예산 여유가 1KB 뿐이다). */
  const queueSessionId = isEdit && editId ? `note-${editId}` : "note-new";
  const [queuedPhotos, setQueuedPhotos] = useState(0);
  const [queueFlushing, setQueueFlushing] = useState(false);
  /* 실측에서 잡힌 버그: 가드를 useState 로만 뒀더니 연결 복귀 이벤트가 두 번 올 때
     (브라우저의 online + 앱 쪽 재시도) 두 호출이 **둘 다** 가드를 통과했다.
     setState 는 비동기라 첫 호출이 아직 false 를 보고 있었다 — 같은 사진이 두 번
     올라가 노트에 두 장이 붙었다(업로드 호출 2회 실측).
     ref 는 동기라 두 번째 호출이 즉시 막힌다. 화면 표시는 state 가 계속 맡는다. */
  const queueFlushingRef = useRef(false);
  const offlineSeqRef = useRef(0);

  const refreshQueuedCount = async () => {
    try {
      const { listPendingQueue } = await import("@/lib/inspection/offline-queue");
      const pending = await listPendingQueue(queueSessionId);
      setQueuedPhotos(pending.length);
    } catch {
      /* IndexedDB 미지원·접근 불가 — 큐 표시만 안 뜬다 */
    }
  };

  /* 이전에 오프라인으로 담아 둔 사진이 있으면 화면에 알린다 — 조용히 들고 있으면
     사용자는 사진이 사라진 줄 안다. */
  useEffect(() => {
    void refreshQueuedCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueSessionId]);

  const enqueueOfflinePhotos = async (list: File[]) => {
    try {
      const { enqueueOfflineItem } = await import("@/lib/inspection/offline-queue");
      for (const file of list) {
        offlineSeqRef.current += 1;
        await enqueueOfflineItem({
          id: `oq-${Date.now()}-${offlineSeqRef.current}`,
          sessionId: queueSessionId,
          type: "photo",
          blob: file,
          payload: { name: file.name, mime: file.type },
          createdAt: new Date().toISOString(),
        });
      }
      await refreshQueuedCount();
      return true;
    } catch {
      return false;
    }
  };

  /** 연결이 돌아오면 큐를 비운다. 성공한 항목만 지운다 — 실패는 남겨 다시 시도한다. */
  const flushQueuedPhotos = async () => {
    if (queueFlushingRef.current) return;
    queueFlushingRef.current = true;
    setQueueFlushing(true);
    try {
      const { listPendingQueue, removeQueueItem, markQueueItem } = await import(
        "@/lib/inspection/offline-queue"
      );
      const pending = await listPendingQueue(queueSessionId);
      for (const q of pending) {
        if (!(q.blob instanceof Blob)) {
          /* 파일이 없는 항목은 되살릴 수 없다 — 큐에 영원히 남게 두지 않는다 */
          await removeQueueItem(q.id);
          continue;
        }
        const name =
          typeof q.payload?.name === "string" && q.payload.name ? q.payload.name : "photo.jpg";
        const mime = typeof q.payload?.mime === "string" ? q.payload.mime : q.blob.type;
        uploadSeqRef.current += 1;
        const item: UploadItem = {
          id: `u${uploadSeqRef.current}`,
          name,
          status: "uploading",
          file: new File([q.blob], name, { type: mime || "image/jpeg" }),
          /* 미리보기 URL 은 만들지 않는다 — 이 항목은 복귀 직후 바로 올라가고,
             revoke 를 놓치면 blob URL 이 새는 자리다(previewUrlsRef 는 이 경로를
             거치지 않는다). */
          preview: null,
        };
        setUploads((prev) => [...prev, item]);
        const r = await uploadOne(item);
        if (r.ok) {
          setPhotos((prev) => mergeUploadedPhotos(prev, [r.url], MAX_PHOTOS));
          patchUpload(item.id, { status: "done", pct: 100 });
          await removeQueueItem(q.id);
        } else {
          if (r.status === 401) setNeedLogin(true);
          patchUpload(item.id, { status: "failed", error: r.error, httpStatus: r.status });
          await markQueueItem(q.id, { status: "pending", retryCount: q.retryCount + 1 });
        }
      }
      await refreshQueuedCount();
    } catch {
      /* 전체 실패 — 큐는 그대로 남는다(다음 복귀·재시도에서 다시 본다) */
    } finally {
      queueFlushingRef.current = false;
      setQueueFlushing(false);
    }
  };

  /* 연결 복귀 이벤트에 붙인다. 오프라인 상태가 아니고 큐가 비어 있으면 아무 일도 없다. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      void flushQueuedPhotos();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueSessionId]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const inFlight = uploads.filter((u) => u.status === "uploading").length;
    const remain = MAX_PHOTOS - photos.length - inFlight;
    if (remain <= 0) {
      setSaveError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
      resetPickers();
      return;
    }
    const picked = Array.from(files).slice(0, remain);
    resetPickers();
    setSaveError(null);
    /* [#134] 촬영 시각 — 리사이즈(canvas 재인코딩)가 EXIF 를 지우므로 그 전에
       원본에서 읽는다. 가장 이른 촬영 시각 하나만 보관(방문 시간 배지·방문일 재료). */
    void (async () => {
      try {
        const times = (
          await Promise.all(picked.map((f) => readExifTakenAt(f)))
        ).filter((t): t is string => Boolean(t));
        if (times.length > 0) {
          times.sort();
          setPhotoTakenAt((prev) => (prev && prev < times[0] ? prev : times[0]));
        }
      } catch {
        /* 장식 신호 — 실패 무시 */
      }
    })();
    let list: File[];
    try {
      /* 업로드 전 클라 리사이즈(#23) — 폰 원본(4000px·수 MB)을 긴 변 1600px 로
         줄여 올린다. 줄일 수 없으면 원본이 그대로 오므로 업로드는 막히지 않는다. */
      list = await resizeImageFiles(picked);
    } catch {
      list = picked;
    }
    /* [985 · 15] 오프라인이면 올리지 않고 이 기기에 담아 둔다. 리사이즈까지 끝난
       파일을 담으므로, 연결이 돌아오면 그대로 올라간다(다시 줄이지 않는다). */
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const stored = await enqueueOfflinePhotos(list);
      /* 성공은 saveError 로 말하지 않는다 — 실측에서 저장 바가 이 문장을 빨간
         role="alert" 로 띄우고 버튼을 "다시 시도"로 바꿨다. 잘된 일을 실패처럼
         알리는 셈이다. 담긴 사실은 위쪽 큐 안내("이 기기에 담아 둔 사진 N장")가
         이미 말한다. 진짜 실패(담아 둘 수조차 없음)만 오류로 남긴다. */
      if (!stored) {
        setSaveError(
          "오프라인이고 이 브라우저에 사진을 담아 둘 수 없어요 — 연결된 뒤에 다시 담아 주세요.",
        );
      }
      return;
    }
    const items: UploadItem[] = list.map((file, i) => {
      uploadSeqRef.current += 1;
      return {
        id: `u${uploadSeqRef.current}`,
        name: picked[i]?.name ?? file.name,
        status: "uploading",
        file,
        preview: makePreview(file),
      };
    });
    /* 이전 배치의 성공분은 치우고 실패분은 남긴다(아직 재시도할 수 있게) */
    dropUploads((u) => u.status === "done");
    setUploads((prev) => [...prev, ...items]);
    await runUploads(items);
  };

  /* [967 · 1] 실패분만 다시 — 파일은 이미 리사이즈된 것을 들고 있다 */
  const retryFailedUploads = () => {
    const failed = uploads.filter((u) => u.status === "failed");
    if (failed.length === 0) return;
    const remain = MAX_PHOTOS - photos.length - uploads.filter((u) => u.status === "uploading").length;
    const retrying = failed.slice(0, Math.max(0, remain));
    if (retrying.length === 0) {
      setSaveError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
      return;
    }
    const ids = new Set(retrying.map((u) => u.id));
    setUploads((prev) =>
      prev.map((u) =>
        ids.has(u.id) ? { ...u, status: "uploading", pct: undefined, error: undefined } : u,
      ),
    );
    void runUploads(retrying.map((u) => ({ ...u, status: "uploading" as const })));
  };

  const removePhoto = (url: string) =>
    setPhotos((prev) => prev.filter((p) => p !== url));

  /* [967 · 5] 순서·대표 — 드래그 없이 버튼만(모바일 스크롤과 충돌하지 않게).
     대표 = photos[0]: 목록 카드(app/notes/page.tsx coverUrl)가 첫 장을 쓴다. */
  const shiftPhoto = (index: number, dir: -1 | 1) =>
    setPhotos((prev) => movePhoto(prev, index, dir));
  const setCoverPhoto = (index: number) => setPhotos((prev) => makeCoverPhoto(prev, index));

  const uploadDone = uploads.filter((u) => u.status === "done").length;
  const uploadFailed = uploads.filter((u) => u.status === "failed").length;
  const uploadProgressText = uploadProgressLabel(uploadDone + uploadFailed, uploads.length);
  const uploadFailureText = uploading ? null : uploadFailureLabel(uploads.length, uploadFailed);

  /* [967 · 8] 본문 자동 높이 — 내용만큼 자라고(4줄 최소) 40vh 에서 멈춰 안에서
     스크롤. height 대신 min-height 를 밀어 사용자가 손잡이로 키운 높이는 지킨다. */
  const memoRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.minHeight = "0px";
    const cap = Math.round(window.innerHeight * 0.4);
    el.style.minHeight = `${Math.min(el.scrollHeight, cap)}px`;
    el.style.maxHeight = `${cap}px`;
  }, [memo]);

  /* [967 · 4] 하단 고정 저장 바 — 원래 CTA 가 화면에 없을 때만 보인다(두 번 보이지
     않게). 관찰 대상은 CTA 블록 자체. 처음엔 "보인다"로 시작해 관찰 결과가 오기
     전 한 프레임 겹쳐 뜨는 걸 막는다. */
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaInView, setCtaInView] = useState(true);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) setCtaInView(e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showSaveBar = !ctaInView;

  /* [970 · B-11] 위치 카드 — 검증 오류 때 여기로 스크롤한다(오류 문구는 3,000px 아래
     CTA 블록에만 있었고, 저장 바에서 누른 사람은 아무 변화도 못 봤다) */
  const locationRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (saving || uploading) return;
    const aptName = loc.aptName.trim();
    const region = loc.region.trim();
    if (!aptName || !region) {
      setSaveError("단지·주소를 먼저 검색해 위치를 선택해 주세요.");
      /* [984 · 01] 위치 입력은 1단계에 있다. 2·3단계에서 저장을 누른 사람에게
         스크롤만 하면 화면이 그대로다(그 칸이 hidden 이라 갈 곳이 없다) —
         단계부터 옮긴다. */
      setStep(1);
      const reduce =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      locationRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    setSaving(true);
    setNeedLogin(false);
    setSaveError(null);
    /* [970 · B-10] 고른 항목만 축 점수로 — 미선택 축은 0(서버 규약 "미입력") */
    const scores = composeScoresFromChecks(checks);
    const posTags = tagDefs.filter((t) => t.tone === "pos" && tags.includes(t.label));
    const negTags = tagDefs.filter((t) => t.tone === "neg" && tags.includes(t.label));
    const intent = intentFromVisitPurpose(visit["목적"]);
    const groups = getChecklistForIntent(intent);
    const categoryChecklist = groups.flatMap((g) =>
      g.items
        .filter((it) => groupChecked[it.id])
        .map((it) => ({
          label: it.label,
          done: true,
          groupId: g.id,
        })),
    );
    const todoChecklist = todoItems.map((t) => ({
      label: t.text,
      done: doneTodos.includes(t.text),
      level: t.level,
    }));
    try {
      const payload = {
        title: `${aptName} 임장 기록`,
        region,
        aptName,
        /* [967 · 2] 폼의 방문일 — 작성·수정 모두 사용자가 정한(또는 촬영일로 채운) 값 */
        visitDate: /^\d{4}-\d{2}-\d{2}$/.test(visitDate) ? visitDate : localDateIso(),
        transportation: visit["시간대"] ?? null,
        weather: weather.trim() || null,
        summary: memo.trim() || null,
        scores,
        checklist: [...categoryChecklist, ...todoChecklist],
        sections: {
          memo: memo.trim() || undefined,
          pros: posTags.map((t) => t.label).join(" · ") || undefined,
          cons: negTags.map((t) => t.label).join(" · ") || undefined,
        },
        photos,
        metadata: {
          socialShareConsent: isPublic ? socialShareConsent : undefined,
          /* [#71] 방문 인증 — 거리 버킷·시각만 (원 좌표 비저장 원칙) */
          visitVerified: visitVerified ?? undefined,
          /* [#134] 사진 촬영 시각(가장 이른 1개) — EXIF, 리사이즈 전에 읽음 */
          photoTakenAt: photoTakenAt ?? undefined,
          /* [#133] 음성 메모 — 저장만, 전사는 후속 */
          voiceMemos: voiceMemos.length > 0 ? voiceMemos : undefined,
          complexId: loc.complexId ?? undefined,
          lat: loc.lat ?? undefined,
          lng: loc.lng ?? undefined,
          /* [970 · B-10] 미입력이면 키를 아예 보내지 않는다(0 이나 7.5 로 지어내지 않는다) */
          satisfaction: satisfaction ?? undefined,
          templateId: template?.id ?? undefined,
          propertyType: visit["유형"] || undefined,
          visitTimeSlot: visit["시간대"] || undefined,
          visitPurpose: visit["목적"] || undefined,
          intent:
            visit["목적"] === "투자" ||
            visit["목적"] === "실거주" ||
            visit["목적"] === "전월세"
              ? visit["목적"]
              : undefined,
          investorRole: investorRoleFromPurpose(visit["목적"]),
          weather: weather.trim() || undefined,
          /* [970 · B-10] 고른 항목만 — 상세 4축이 이 키로 "미입력"을 구분한다 */
          fieldRatings: checks,
          /* [944] AI 초안 사용 흔적 — 점수 추정이 섞인 노트는 상세에서 라벨로
             구분할 근거가 된다. 라벨 없는 추정 점수는 지어낸 값과 같다. */
          aiDraft: aiDraftMeta ? true : undefined,
          aiDraftScored: aiDraftMeta?.scored || undefined,
          aiDraftModel: aiDraftMeta?.model ?? undefined,
          todoLevels: Object.fromEntries(todoItems.map((t) => [t.text, t.level])),
          checklistGroupCounts: {
            checked: categoryChecklist.length,
            groups: groups.length,
          },
        },
        isPublic,
      };
      const res = await fetch(
        editId ? `/api/inspection/notes/${editId}` : "/api/inspection/notes",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.status === 401) {
        setNeedLogin(true);
        promptSignup({
          action: "note_save",
          title: "임장노트를 저장하려면 로그인",
          benefit: "가입하면 방금 작성한 기록을 저장하고 AI 정리·지도 비교로 이어갈 수 있어요.",
          callbackUrl: typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/notes/new",
        });
        return;
      }
      const json: { note?: { id: string }; error?: string } = await res
        .json()
        .catch(() => ({}));
      const noteId = editId ?? json.note?.id;
      if (!res.ok || !noteId) {
        setSaveError(json.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      /* 정식 저장 완료 — 임시저장본 제거. [967 · 9] 수정 모드도 노트별 키를 지운다
         (남겨 두면 다음에 열 때 방금 저장한 내용을 "저장하지 않은 수정"이라 묻는다). */
      clearDraft();
      setDraftPending(false);
      /* [984 · 05] 다음 노트가 이어받을 수 있게 이 단지를 기기에 남긴다.
         저장이 **확정된 뒤에만** 남긴다 — 실패한 시도를 "지난번 그 단지"로
         제안하면 있지도 않은 기록을 있었던 것처럼 말하게 된다. */
      try {
        const carry = serializeCarryOver(
          {
            aptName,
            region,
            complexId: loc.complexId ?? null,
            lat: typeof loc.lat === "number" ? loc.lat : null,
            lng: typeof loc.lng === "number" ? loc.lng : null,
          },
          Date.now(),
        );
        if (carry) localStorage.setItem(CARRY_OVER_KEY, carry);
      } catch {
        /* 저장소 접근 불가 — 이어받기 제안만 안 뜬다(저장 자체와 무관) */
      }
      /* 저장이 확정된 지점에서 부른다. 바로 아래 AI 호출은 실패해도 저장은
         성공이므로, 그 결과를 기다렸다가 부르면 "저장됐다"는 사실이 AI 성패에
         따라 달라진다 — 사실과 연출을 묶으면 안 된다. */
      // AI 정리 실호출 — HTTP 200 + rule 폴백 가능. mode 로만 LLM/규칙 구분.
      setAiRunning(true);
      let aiFlag: "ok" | "rule" | "fail" = "fail";
      try {
        const aiRes = await fetch("/api/inspection/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId,
            intent,
            investorRole: investorRoleFromPurpose(visit["목적"]),
          }),
        });
        const aiJson = (await aiRes.json().catch(() => null)) as {
          mode?: string;
          quotaExceeded?: boolean;
          code?: string;
        } | null;
        if (handleUpgradeResponse(aiRes.status, aiJson)) {
          aiFlag = "fail";
          showMoment({
            title: isEdit ? "수정한 내용을 저장했어요" : "임장노트를 저장했어요",
            subtitle: "이번 달 AI 한도를 썼어요 · 구독에서 이어서 정리할 수 있어요",
          });
          router.push(afterSaveHref(noteId, "fail", true));
          return;
        }
        if (aiRes.ok && aiJson) {
          aiFlag = aiJson.mode === "llm" ? "ok" : "rule";
          if (aiJson.quotaExceeded && aiFlag === "rule") {
            promptUpgrade({
              title: "AI 월간 한도 도달",
              message:
                "규칙 기반 요약으로 저장됐어요. PRO 이상으로 올리면 LLM 정리를 이어서 쓸 수 있어요.",
              ctaLabel: "구독하고 AI 이어서 쓰기",
            });
            showMoment({
              title: isEdit ? "수정한 내용을 저장했어요" : "임장노트를 저장했어요",
              subtitle: "규칙 요약이에요 · AI 한도 소진 시 구독에서 업그레이드",
            });
            router.push(afterSaveHref(noteId, "rule", true));
            return;
          }
        }
      } catch {
        /* AI 실패 무시 — 노트 저장은 완료됨 */
      }
      showMoment({
        title: isEdit ? "수정한 내용을 저장했어요" : "임장노트를 저장했어요",
        subtitle:
          aiFlag === "ok"
            ? "AI 정리가 반영됐어요"
            : aiFlag === "rule"
              ? "규칙 기반 요약으로 정리됐어요"
              : "노트는 저장됐어요 · AI는 아래에서 다시 시도할 수 있어요",
      });
      router.push(afterSaveHref(noteId, aiFlag, false));
    } catch {
      /* [OPT-46] 오프라인 임장 — 현장(지하주차장 등)에서 신호가 끊겨도 기록은 안전하다.
         작성 내용은 #45 임시저장(1초 디바운스 localStorage)이 이미 들고 있으므로,
         "저장 실패"가 아니라 "초안 보관 + 연결 복귀 시 재시도 안내"로 말한다.
         online 복귀 이벤트에서 한 번 더 알려 저장 버튼을 다시 누르게 유도한다. */
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setSaveError(
        offline
          ? "오프라인이에요 — 작성 내용은 이 기기에 초안으로 안전하게 보관 중입니다. 연결이 돌아오면 저장을 다시 눌러 주세요."
          : "네트워크 오류로 저장하지 못했어요. 작성 내용은 초안으로 보관 중이니 연결을 확인한 뒤 다시 시도해 주세요.",
      );
      if (offline && typeof window !== "undefined") {
        const onBack = () => {
          setSaveError("연결이 돌아왔어요 — 지금 저장을 다시 누르면 이어서 제출됩니다.");
          window.removeEventListener("online", onBack);
        };
        window.addEventListener("online", onBack);
      }
    } finally {
      setAiRunning(false);
      setSaving(false);
    }
  };

  /* [970 · B-12] 업로드 진행·실패 블록 — 상단 "사진 먼저 담기" 아래와 하단 사진 섹션
     두 곳에 그린다. 예전엔 하단(3,200px 아래)에만 있어 상단 버튼으로 담은 사람은
     진행도·실패를 보지 못했다. 라이브 영역(role=status)은 한 곳(하단)만 — 같은 변화를
     두 번 읽어 주지 않는다. */
  const renderUploadProgress = (live: boolean) =>
    uploads.length > 0 ? (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* 라이브 영역은 요약 줄만 — 파일별 % 까지 읽어 주면 소음이 된다 */}
          <span role={live ? "status" : undefined} className="t-sub font-bold text-text-1">
            {uploadProgressText ?? uploadFailureText ?? "업로드 완료"}
          </span>
          {uploadFailed > 0 && !uploading && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={retryFailedUploads}
                className="btn-soft min-h-[36px] rounded-lg px-3 t-sub font-bold"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => dropUploads((u) => u.status !== "uploading")}
                aria-label="실패한 사진 목록 닫기"
                className="tap grid h-7 w-7 place-items-center rounded-full text-text-3"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>
        <ul className="flex gap-2 overflow-x-auto" aria-label="업로드 중인 사진">
          {uploads.map((u) => (
            <li key={u.id} className="relative shrink-0" title={u.error ?? u.name}>
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.preview}
                  alt={u.name}
                  className={`h-12 w-16 rounded-lg object-cover ${
                    u.status === "failed" ? "opacity-50 grayscale" : ""
                  }`}
                />
              ) : (
                <span className="grid h-12 w-16 place-items-center rounded-lg bg-bg text-text-3">
                  <Icon name="camera" size={16} />
                </span>
              )}
              {u.status === "uploading" && (
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-brand-navy/45 t-caption font-bold text-on-dark">
                  {typeof u.pct === "number" ? (
                    `${u.pct}%`
                  ) : (
                    <span className="njn-ring" aria-hidden="true" />
                  )}
                </span>
              )}
              {u.status === "done" && (
                <span className="absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-success text-on-dark">
                  <Icon name="check" size={11} />
                </span>
              )}
              {u.status === "failed" && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-danger px-1 text-center t-caption font-bold text-white">
                  실패
                </span>
              )}
              <span className="sr-only">
                {u.name} —{" "}
                {u.status === "uploading"
                  ? "업로드 중"
                  : u.status === "done"
                    ? "완료"
                    : `실패${u.error ? `: ${u.error}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
        {uploadFailed > 0 && !uploading && (
          <p className="t-caption text-text-3">
            {uploads.find((u) => u.status === "failed")?.error ?? "사진 업로드에 실패했어요."}
            {" "}성공한 사진은 그대로 남아 있어요.
          </p>
        )}
      </div>
    ) : null;

  /* 입력 진행도 — 예전엔 "2/3 단계"와 w-[66%] 하드코딩이었다. 이 폼은 단계가 없는
     단일 화면이고 1·3 단계로 갈 곳도 없었으며, 아무리 채워 넣어도 바가 움직이지 않았다.
     이제 사용자가 실제로 넣은 것만 센다. [970 · B-10] 현장 체크·만족도는 기본값이 사라져
     (빈 상태에서 시작) 이제 "고른 것"만 세므로 진행도에 넣어도 거짓이 아니다. */
  const progressItems = [
    { label: "위치", done: Boolean(loc.aptName.trim() && loc.region.trim()) },
    { label: "현장 체크", done: countCheckedItems(checks) > 0 || satisfaction !== null },
    { label: "메모", done: memo.trim().length > 0 },
    { label: "태그", done: tags.length > 0 },
    {
      label: "체크리스트",
      done:
        checklistGroups.some((g) => g.items.some((it) => groupChecked[it.id])) ||
        doneTodos.length > 0,
    },
    { label: "사진", done: photos.length > 0 },
  ];
  const progressDone = progressItems.filter((i) => i.done).length;
  const progressPct = Math.round((progressDone / progressItems.length) * 100);
  /* [984] 단계 완료 표시 — 위 progressItems 와 **같은 값**을 본다. 두 곳에서 따로
     세면 한쪽만 고쳐져 진행 바와 탭이 다른 말을 하게 된다. */
  const doneByStep = stepDone({
    located: progressItems[0].done,
    judged: progressItems[1].done || progressItems[3].done || progressItems[4].done,
    wrote: progressItems[2].done || progressItems[5].done,
  });

  return (
    /* [967 · 4] 저장 바가 떠 있는 동안 아래 여백을 더 준다 — 마지막 입력을 바가 덮지 않게 */
    <div
      data-one-hand={oneHand ? "on" : undefined}
      className={`note-form mx-auto flex w-full max-w-[560px] flex-col px-5 ${
        showSaveBar ? "pb-28" : "pb-10"
      } ${oneHand ? "pb-40" : ""}`}
    >
      {/* 상단 바 */}
      <div className="glass sticky top-3.5 z-40 mt-3.5 flex items-center justify-between rounded-2xl px-4 py-3">
        <Link
          href={editId ? `/notes/${editId}` : "/notes"}
          aria-label="닫기"
          className="text-[15px] text-text-1"
        >
          ✕
        </Link>
        <div className="flex flex-col items-center">
          {/* [970 · B-22] 이 화면의 유일한 제목 — h1 이 없었다 */}
          <h1 className="t-section text-ink">
            {isEdit ? "임장노트 수정" : "임장노트"}
          </h1>
          <div className="t-caption text-text-3">
            {isEdit ? "내 기록 수정" : "현장 기록"} · {progressDone}/
            {progressItems.length} 항목 입력
          </div>
        </div>
        {/* [967 · 10] 수정 모드도 임시저장이 도니 버튼을 같이 보인다 */}
        <button
          type="button"
          onClick={writeDraft}
          className="t-body font-bold text-primary"
        >
          {savedDraft ? "저장됨 ✓" : "임시저장"}
        </button>
      </div>

      {(preferAi || fromWelcome) && !isEdit && (
        <div
          role="status"
          className="mt-2.5 rounded-[10px] border border-primary/25 bg-primary-soft px-3.5 py-2.5 t-sub text-text-1"
        >
          {fromWelcome ? (
            <>
              <b className="text-primary">온보딩 루프</b> — 저장 후 AI 정리를 시도하고, 이어서
              지도에서 후보를 비교해요. LLM이 아니면 &quot;규칙 기반&quot;으로 표시됩니다.
            </>
          ) : (
            <>
              <b className="text-primary">AI 정리 경로</b> — 노트를 저장하면 AI(또는 규칙 초안)로
              장단점을 정리해요. LLM이 아닐 때는 &quot;규칙 기반&quot; 배지로 표시됩니다.
            </>
          )}
        </div>
      )}

      {/* 입력 진행 바 — 위 progressItems 의 실제 충족 개수만 반영(하드코딩 66% 제거) */}
      <div
        className="relative mt-2.5 h-1 rounded-sm bg-bg"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progressItems.length}
        aria-valuenow={progressDone}
        aria-label={`임장노트 입력 진행 — ${progressItems
          .filter((i) => i.done)
          .map((i) => i.label)
          .join(", ") || "아직 입력한 항목 없음"}`}
      >
        <div
          className="absolute left-0 top-0 h-1 rounded-sm bg-primary transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── [984 · 01] 단계 표시 ─────────────────────────────────────────
          탭(role="tab")이 아니라 **단계**다 — 같은 내용을 다른 각도로 보는 게
          아니라 순서가 있는 과정이라, aria-current="step" 이 맞는 표기다.
          다만 순서를 강제하지는 않는다: 아무 단계나 눌러 갈 수 있다(현장에서
          기억나는 것부터 적는 사람을 막을 이유가 없다). */}
      {/* scroll-mt-24 — 위 상단 바가 sticky(top-3.5, 높이 ~72px)라, 단계를 옮길 때
          이 줄의 top 으로 스크롤하면 탭이 그 바 밑으로 들어가 버린다(실측). */}
      <nav aria-label="작성 단계" ref={stepTopRef} className="mt-3 scroll-mt-24">
        <ol className="grid grid-cols-3 gap-1 rounded-[12px] bg-bg p-1">
          {NOTE_STEPS.map((st) => {
            const active = step === st.n;
            return (
              <li key={st.n} className="min-w-0">
                <button
                  type="button"
                  onClick={() => goStep(st.n)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${st.n}단계 ${st.title}${doneByStep[st.n] ? " · 입력함" : ""}`}
                  className={`note-step-btn flex min-h-[44px] w-full items-center justify-center gap-1 rounded-[9px] px-1 t-sub font-bold transition-colors ${
                    active
                      ? "bg-surface text-ink shadow-[0_1px_3px_rgba(16,28,54,.10)]"
                      : "text-text-3"
                  }`}
                >
                  <span className="truncate">
                    {st.n}. {st.short}
                  </span>
                  {/* 완료 표시는 "다 됐다"가 아니라 "여기에 입력이 있다"는 뜻이다 —
                      필수는 위치 하나뿐이라 나머지는 비워도 저장된다. */}
                  {doneByStep[st.n] && (
                    <span aria-hidden="true" className="text-primary">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="t-body font-extrabold text-ink">
              {NOTE_STEPS[step - 1].title}
            </span>{" "}
            <span className="t-sub text-text-3">{NOTE_STEPS[step - 1].hint}</span>
          </div>
          <button
            type="button"
            onClick={toggleOneHand}
            aria-pressed={oneHand}
            title="단계 이동을 화면 아래로 내리고 조작을 크게 합니다"
            className={`chip shrink-0 whitespace-nowrap border px-3 t-caption font-bold ${
              oneHand
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-text-3"
            }`}
          >
            한 손 모드 {oneHand ? "켬" : "끔"}
          </button>
        </div>
      </nav>

      <div className="mt-3.5 flex flex-col gap-3">
        {/* 모바일19 — 오프라인 안내. [967 · 10] 수정 모드도 임시저장이 돌아 같이 보인다 */}
        {offline && (
          <div
            role="status"
            className="rise-in flex items-center gap-2.5 rounded-[14px] border border-warning-border bg-warning-soft px-4 py-3"
          >
            <Icon name="📴" size={16} className="shrink-0" />
            {/* [985 · 15] "사진 업로드는 연결 후에 해주세요"는 이제 사실이 아니다 —
                오프라인에서 담은 사진은 이 기기(IndexedDB)에 보관되고 연결이
                돌아오면 자동으로 올라간다. 문구가 낡은 채로 남으면 사용자는
                할 수 있는 일을 안 한다. */}
            <p className="text-xs leading-[1.6] text-warning">
              <b>오프라인이에요.</b> 입력 내용과 담은 사진은 이 기기에 보관되고
              있어요. 연결이 돌아오면 사진은 자동으로 올라가고, 저장을 한 번
              눌러 주시면 그대로 이어서 제출됩니다.
            </p>
          </div>
        )}
        {/* [985 · 15] 이 기기에 담아 둔 사진 — 조용히 들고 있으면 사라진 줄 안다.
            자동 업로드는 연결 복귀 이벤트가 하지만, 그 이벤트를 못 받는 경우
            (탭 복귀·기기 절전 등)가 있어 손으로 누를 길도 남긴다. */}
        {queuedPhotos > 0 && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-[14px] border border-line bg-bg px-4 py-3"
          >
            <Icon name="📥" size={16} className="shrink-0" />
            <p className="min-w-0 flex-1 t-sub leading-[1.6] text-text-1">
              이 기기에 담아 둔 사진 <b>{queuedPhotos}장</b> — 연결되면 자동으로
              올라가요.
            </p>
            <button
              type="button"
              onClick={() => void flushQueuedPhotos()}
              disabled={queueFlushing}
              className="chip shrink-0 border border-line-strong bg-surface px-3 t-sub font-bold text-text-1 disabled:opacity-50"
            >
              {queueFlushing ? "올리는 중" : "지금 올리기"}
            </button>
          </div>
        )}

        {/* #45 임시저장 복구 배너 — [967 · 10] 수정 모드는 "저장하지 않은 수정" 문구 */}
        {pendingDraft && (
          <div
            role="status"
            className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.06)] px-4 py-3"
          >
            <Icon name="📝" size={18} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-ink">
                {isEdit ? "저장하지 않은 수정 내용이 있어요" : "작성 중이던 노트가 있어요"}
              </div>
              {draftSavedLabel && (
                <div className="t-caption text-text-3">{draftSavedLabel}</div>
              )}
            </div>
            <button
              type="button"
              onClick={restoreDraft}
              className="shrink-0 rounded-[10px] bg-primary px-3 py-2 t-sub font-bold text-white"
            >
              {isEdit ? "복원" : "이어서 쓰기"}
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="shrink-0 rounded-[10px] border border-line bg-surface px-3 py-2 t-sub font-bold text-text-2"
            >
              {isEdit ? "버리기" : "삭제"}
            </button>
          </div>
        )}

        {/* 템플릿 적용 안내 */}
        {template && !isEdit && (
          <div className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.15)] bg-[rgba(29,79,216,.06)] px-4 py-3">
            <Icon name="notebook-pen" size={16} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-xs text-text-2">
              <b className="text-primary">{template.title}</b> 템플릿 적용 — 점검
              항목 {todoItems.length}개가 고려사항 체크리스트에 채워졌어요.
            </div>
          </div>
        )}

        {/* 로그인 없이 작성 안내 */}
        {!isEdit && (
          <div className="rise-in rounded-[14px] border border-[rgba(29,79,216,.15)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center text-xs font-semibold text-primary">
            로그인 없이 작성할 수 있어요 — 저장할 때만 로그인이 필요해요
          </div>
        )}

        {/* [984] 1단계 — 어디를 봤나 */}
        <div className={step === 1 ? "flex flex-col gap-3" : "hidden"}>
        {/* 모바일9 — 사진 첨부 1탭. 현장에서는 사진→메모 순서가 많은데 사진
            버튼이 폼 하단(메모 아래)에만 있었다. 상단에서 같은 input(fileRef)을
            연다 — 업로드 로직·한도 전부 기존 그대로. 촬영 사진은 하단 사진
            줄에 쌓인다. */}
        {/* [968 · 32] "촬영" 을 옆에 둔다 — accept="image/*" 하나면 iOS 는 매번 "사진 보관함 /
            사진 찍기" 시트를 거친다. 퀵모드(현장)는 촬영이 첫 행동이라 앞에, 평소엔 담기가
            앞. 둘 다 같은 onPickFiles → 업로드 로직은 그대로 하나다. 마우스 기기(pointer:fine)
            는 capture 를 무시하고 파일 창만 띄우므로 촬영 버튼을 숨긴다. */}
        {!isEdit &&
          (() => {
            const pickBtn = (
              <button
                key="pick"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || photos.length >= MAX_PHOTOS}
                className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-line-strong bg-surface px-4 py-2.5 t-body font-bold text-text-2 disabled:opacity-60"
              >
                <Icon name="📷" size={16} className="inline shrink-0 align-middle" />
                <span className="truncate">
                  {/* [970 · B-23] 퀵모드는 촬영 버튼이 앞에 와 폭이 좁다 — 짧은 라벨 */}
                  {uploading
                    ? "업로드 중…"
                    : quickMode
                      ? `사진 담기${photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ""}`
                      : photos.length > 0
                        ? `사진 먼저 담기 (${photos.length}/${MAX_PHOTOS})`
                        : "사진 먼저 담기 — 현장이면 지금 찍어 두세요"}
                </span>
              </button>
            );
            const captureBtn = (
              <button
                key="capture"
                type="button"
                onClick={() => captureRef.current?.click()}
                disabled={uploading || photos.length >= MAX_PHOTOS}
                aria-label="카메라로 촬영해 사진 추가"
                className={`flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 t-body font-bold disabled:opacity-60 pointer-fine:hidden ${
                  quickMode
                    ? "btn-primary"
                    : "border-[1.5px] border-line-strong bg-surface text-text-1"
                }`}
              >
                <Icon name="camera" size={16} className="inline shrink-0 align-middle" />
                촬영
              </button>
            );
            /* DOM 순서까지 바꾼다 — 시각 순서만 뒤집으면(flex-row-reverse) 스크린리더·
               Tab 순서는 여전히 담기가 먼저다. */
            return (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {quickMode ? [captureBtn, pickBtn] : [pickBtn, captureBtn]}
                </div>
                {/* [970 · B-12] 상단에서 담은 사진의 진행·실패를 바로 아래에서 본다 */}
                {renderUploadProgress(false)}
              </div>
            );
          })()}
        </div>
        {/* [970 · B-12] 로그인 안내도 상단에 — 저장 바(B-11)에서 401 을 받은 사람은 폼 중간에 있다 */}
        {needLogin && (
          <div className="rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center t-body text-primary">
            저장하려면 로그인이 필요해요 — 작성한 내용은 유지돼요.{" "}
            <Link href={loginHref} className="font-extrabold underline underline-offset-2">
              로그인하기 ›
            </Link>
          </div>
        )}

        {/* [984] 1단계 — 어디를 봤나 */}
        <div className={step === 1 ? "flex flex-col gap-3" : "hidden"}>
        {/* [984 · 05] 단지 이어받기 — 직전에 저장한 단지가 있고, 아직 이 노트의
            위치를 안 골랐을 때만. 언제 것인지 밝혀 준다("3일 전") — 모르는 값이
            저절로 채워지면 도움이 아니라 불안이다. 한 번 쓰거나 닫으면 사라진다. */}
        {!isEdit && carryOver && !carryOverUsed && !loc.aptName.trim() && (
          <div className="rise-in flex items-center gap-2.5 rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.06)] px-4 py-3">
            <Icon name="📍" size={18} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate t-body font-extrabold text-ink">
                {carryOver.aptName}
              </div>
              <div className="truncate t-caption text-text-3">
                {carryOverAgeLabel(carryOver.savedAt, Date.now())} 이 기기에서 쓴 노트 ·{" "}
                {carryOver.region}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoc({
                  aptName: carryOver.aptName,
                  region: carryOver.region,
                  complexId: carryOver.complexId,
                  lat: carryOver.lat,
                  lng: carryOver.lng,
                });
                setCarryOverUsed(true);
              }}
              className="chip shrink-0 border border-primary bg-primary-soft px-3 t-sub font-bold text-primary"
            >
              이어받기
            </button>
            <button
              type="button"
              onClick={() => setCarryOverUsed(true)}
              aria-label="이어받기 제안 닫기"
              className="tap-44 shrink-0 text-text-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* 위치 카드 — 단지·주소 검색으로 연결. [970 · B-11] 검증 오류의 스크롤 목적지 */}
        <div ref={locationRef} className="scroll-mt-24">
          <NoteLocationSearch value={loc} onChange={setLoc} />
        </div>

        {/* ── [985 · 17] 현장 브리핑 ─────────────────────────────────────────
            위치를 고르면 이미 나가던 조회(public-data-context)의 응답을 그대로
            쓴다. 새 요청은 없다 — 예전에는 같은 응답에서 날씨만 꺼내 쓰고 시세·
            공기질·지역 체크 힌트·개발계획을 버렸다.

            왜 작성 화면에 두는가: 임장노트의 가장 약한 고리는 "비싸다/싸다"를
            근거 없이 적는 것이다. 지금 이 지역의 실제 시세가 옆에 있으면 같은
            문장이 판단이 된다. 값을 메모에 자동으로 넣지는 않는다 — 시스템이
            쓴 문장이 사용자의 관찰처럼 보이면 안 된다. 읽을 것만 준다. */}
        {fieldContext !== null && <FieldBriefCard context={fieldContext} />}

        {/* [#71] 방문 인증(선택) — 단지 좌표가 있을 때만. 원 좌표는 저장하지 않는다. */}
        {!isEdit && typeof loc.lat === "number" && typeof loc.lng === "number" && (
          <div className="rise-in-2 flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="t-body font-extrabold text-ink">
                직접 방문 인증{" "}
                <span className="font-medium text-text-3">(선택)</span>
              </div>
              {visitVerified ? (
                <span className="rounded-md bg-success-soft px-2 py-1 t-sub font-extrabold text-success">
                  ✓ 현장 인증됨 · 단지 반경 {visitVerified.distanceM >= 1000
                    ? `${(visitVerified.distanceM / 1000).toFixed(1)}km`
                    : `${visitVerified.distanceM}m`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={runVisitVerify}
                  disabled={verifyState === "asking"}
                  className="rounded-[10px] border border-line-strong bg-bg px-3 py-1.5 t-sub font-bold text-text-1 disabled:opacity-60"
                >
                  {verifyState === "asking" ? "위치 확인 중…" : "현재 위치로 인증하기"}
                </button>
              )}
            </div>
            <p className="t-sub text-text-3">
              지금 단지 근처(2km 이내)에 있다면 노트에 &lsquo;현장 인증&rsquo; 배지가
              붙어요. 버튼을 누를 때 한 번만 위치를 확인하며, 내 위치 좌표는 저장하지도
              전송하지도 않습니다 — 거리 구간(50m 단위)만 남아요.
            </p>
            {verifyState === "far" && (
              <p className="t-sub font-bold text-warning">
                단지에서 약 {verifyFarKm}km 떨어져 있어 인증되지 않았어요. 현장에서 다시
                시도해 주세요.
              </p>
            )}
            {verifyState === "denied" && (
              <p className="t-sub font-bold text-text-3">
                위치 권한이 거부돼 인증을 건너뛰어요 — 인증 없이도 노트는 그대로 저장돼요.
              </p>
            )}
            {verifyState === "unsupported" && (
              <p className="t-sub font-bold text-text-3">
                이 브라우저는 위치 확인을 지원하지 않아요.
              </p>
            )}
          </div>
        )}

        {/* [944] AI 초안으로 시작 — 위치 선택 직후, 본 입력 전에 제안한다.
            수정 모드에선 숨김(이미 쓴 노트를 초안으로 덮을 이유가 없다). */}
        {!isEdit && (
          <AiDraftPanel
            region={loc.region}
            aptName={loc.aptName}
            complexId={loc.complexId ?? null}
            purpose={visit["목적"] || null}
            emphasize={preferAi || fromWelcome}
            onApply={applyAiDraft}
          />
        )}

        {/* [#133] 음성 메모 — 현장의 세 번째 입력 수단 */}
        {!isEdit && (
          <VoiceMemoRecorder
            memos={voiceMemos}
            onChange={setVoiceMemos}
            onTranscript={(text) =>
              setMemo((prev) =>
                prev.trim() ? `${prev.trimEnd()}\n\n🎙 ${text}` : `🎙 ${text}`,
              )
            }
          />
        )}

        {/* 방문 정보 */}
        <div className="rise-in-2 card flex flex-col gap-2.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="t-body font-extrabold text-ink">방문 정보</div>
            <button
              type="button"
              onClick={() => {
                timeSlotTouchedRef.current = true;
                setVisit((prev) => ({
                  ...prev,
                  시간대: timeSlotFromClock(),
                }));
              }}
              /* [989] 실측 세로 18px — 칩 줄 옆에 붙는 텍스트 버튼이라 24px 로만 키운다 */
              className="shrink-0 py-1 t-sub font-bold text-primary"
            >
              지금 시간대
            </button>
          </div>
          {VISIT_GROUPS.map((g) => (
            <div key={g.label} className="flex items-start gap-2">
              <span className="w-14 shrink-0 pt-2 text-xs text-text-2">{g.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const active = visit[g.label] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        if (g.label === "시간대") timeSlotTouchedRef.current = true;
                        setVisit((prev) => ({ ...prev, [g.label]: opt }));
                      }}
                      className={`chip rounded-full px-3 py-1.5 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-line bg-surface text-text-2"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* [967 · 2] 방문일 — 오늘까지만. 촬영일로 채웠으면 그 사실을 적는다 */}
          <div className="flex items-start gap-2">
            <label htmlFor="note-visit-date" className="w-14 shrink-0 pt-1.5 text-xs text-text-2">
              방문일
            </label>
            <div className="flex flex-1 flex-col gap-1">
              <input
                id="note-visit-date"
                type="date"
                value={visitDate}
                max={todayIso}
                onChange={(e) => {
                  const v = e.target.value;
                  visitDateTouchedRef.current = true;
                  setVisitDateFromPhoto(false);
                  /* 빈 값(지우기)은 오늘로 — 방문일 없는 노트는 목록에서 정렬이 깨진다 */
                  setVisitDate(v && v <= todayIso ? v : todayIso);
                }}
                className="w-full min-h-[36px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-text-1 outline-none"
                aria-label="방문일"
              />
              {visitDateFromPhoto && (
                <span role="status" className="t-caption text-text-3">
                  사진 촬영일로 채웠어요
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-14 shrink-0 pt-1.5 text-xs text-text-2">날씨</span>
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {WEATHER_CHIPS.map((opt) => {
                  const active = weather === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWeather(active ? "" : opt)}
                      className={`chip rounded-full px-3 py-1.5 text-xs ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-line bg-surface text-text-2"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {weatherHint && (
                <button
                  type="button"
                  onClick={() => setWeather(weatherHint.slice(0, 40))}
                  className="self-start rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left t-sub text-text-2"
                >
                  제안 · {weatherHint.slice(0, 48)}
                  {weatherHint.length > 48 ? "…" : ""} (탭하여 적용)
                </button>
              )}
              <input
                type="text"
                value={weather}
                onChange={(e) => setWeather(e.target.value.slice(0, 40))}
                placeholder="직접 입력 (선택)"
                /* [968 · 29] 한 줄 입력 — Enter 는 자판 닫기("완료") */
                enterKeyHint="done"
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-text-1 outline-none"
                aria-label="방문 날씨"
              />
            </div>
          </div>
        </div>
        </div>

        {/* [984] 2단계 — 무엇을 봤나 */}
        <div className={step === 2 ? "flex flex-col gap-3" : "hidden"}>
        {/* [984] 예전 [#68] 퀵모드 배너("세부 항목 펼치기")를 걷었다 — 접힌 섹션을
            여는 통로였는데, 이제 그 섹션들이 **2단계 자체**라 열 것이 없다.
            대신 이 단계가 건너뛰어도 되는 곳이라는 사실만 한 줄로 적는다. */}
        <p className="t-sub text-text-3">
          여기는 비워 둬도 저장됩니다 — 기억나는 것만 누르고 넘어가세요.
        </p>

        {/* 현장 체크 — 세그먼트 평가 (9항목 → 5축 점수) */}
        <div className="rise-in-3 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            현장 체크{" "}
            <span className="text-xs font-medium text-text-3">
              {/* [970 · B-10] 고른 항목만 점수가 된다는 걸 여기서 말한다 */}
              고른 항목만 점수에 들어가요 · {countCheckedItems(checks)}/{CHECK_KEYS.length}
            </span>
          </div>
          {CHECK_KEYS.map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <span className="w-12 shrink-0 t-body font-semibold text-text-1">
                {item}
              </span>
              <div className="flex flex-1 gap-1.5" role="group" aria-label={`${item} 평가`}>
                {LEVELS.map((lv) => {
                  const active = checks[item] === lv;
                  return (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={active}
                      /* [970 · B-10] 같은 칸을 다시 누르면 선택 해제 — "미입력"으로 되돌릴 길 */
                      onClick={() =>
                        setChecks((prev) => {
                          if (prev[item] === lv) {
                            const next = { ...prev };
                            delete next[item];
                            return next;
                          }
                          return { ...prev, [item]: lv };
                        })
                      }
                      /* [989] h-9(36px) → 모바일에서만 44px. 만족도는 손가락으로 고르는 3분할 */
                      className={`flex h-9 flex-1 items-center justify-center rounded-[10px] px-2 text-xs max-md:h-11 ${
                        active
                          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
                          : "border border-line bg-surface font-semibold text-text-2"
                      }`}
                    >
                      {lv}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 종합 만족도 — [970 · B-10] 기본 "미입력". 슬라이더를 움직이면 값이 생기고,
              "지우기"로 다시 미입력으로 돌아간다(안 건드린 노트에 7.5 를 적지 않는다). */}
          <div className="mt-0.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-2">종합 만족도</span>
              <span className="flex items-center gap-2">
                {satisfaction === null ? (
                  <span className="font-bold text-text-3">미입력</span>
                ) : (
                  <>
                    <span className="font-extrabold text-primary">{satisfaction.toFixed(1)} / 10</span>
                    <button
                      type="button"
                      onClick={() => setSatisfaction(null)}
                      className="tap rounded-md px-1.5 py-0.5 t-caption font-bold text-text-3"
                    >
                      지우기
                    </button>
                  </>
                )}
              </span>
            </div>
            {/* 모바일10 — 히트 영역 확대: 슬라이더 입력 높이를 36px 로 (트랙은
                그대로, 터치 판정 영역만 넓어진다). 미입력일 때는 가운데(5)에 흐리게 둔다 */}
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={satisfaction ?? 5}
              onChange={(e) => setSatisfaction(Number(e.target.value))}
              /* [989] 슬라이더도 모바일에서 44px — 손잡이를 잡는 조작이라 세로가 좁으면 놓친다 */
              className={`h-9 w-full cursor-pointer accent-[#1d4fd8] max-md:h-11 ${satisfaction === null ? "opacity-50" : ""}`}
              aria-label="종합 만족도"
              aria-valuetext={satisfaction === null ? "미입력" : `${satisfaction.toFixed(1)} / 10`}
            />
          </div>
        </div>

        {/* 카테고리별 현장 체크리스트 (입지·단지·내부·학군·생활·호재) */}
        <div className="rise-in-3 card flex flex-col gap-2 p-4">
          <div className="t-body font-extrabold text-ink">
            체크리스트{" "}
            <span className="t-sub font-medium text-text-3">
              목적({visit["목적"] || "실거주"})에 맞춰 항목이 바뀝니다 ·{" "}
              {checklistGroups.reduce(
                (n, g) => n + g.items.filter((it) => groupChecked[it.id]).length,
                0,
              )}
              개 체크
              {templateSuggestedIds.size > 0
                ? ` · 템플릿 추천 ${templateSuggestedIds.size}`
                : ""}
            </span>
          </div>
          {memoHints.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-primary/20 bg-primary-soft/40 px-3 py-2.5">
              <div className="t-sub font-bold text-primary">
                메모에서 찾은 점검 제안
              </div>
              <div className="flex flex-wrap gap-1.5">
                {memoHints.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setGroupChecked((prev) => ({ ...prev, [h.id]: true }));
                      setMemoHints((prev) => prev.filter((x) => x.id !== h.id));
                      const group = checklistGroups.find((g) =>
                        g.items.some((it) => it.id === h.id),
                      );
                      if (group) {
                        setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
                      }
                    }}
                    className="rounded-full border border-primary/30 bg-surface px-2.5 py-1 t-sub font-bold text-primary"
                  >
                    ＋ {h.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {checklistGroups.map((g) => {
            const open = openGroups[g.id] ?? false;
            const doneCount = g.items.filter((it) => groupChecked[it.id]).length;
            return (
              <div key={g.id} className="rounded-xl border border-line bg-bg/60">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [g.id]: !open }))
                  }
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="t-body font-bold text-ink">{g.title}</span>
                  <span className="t-sub font-semibold text-text-3">
                    {doneCount}/{g.items.length} {open ? "▴" : "▾"}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1 border-t border-line px-2 py-2">
                    {g.items.map((it) => {
                      const checked = Boolean(groupChecked[it.id]);
                      const suggested = templateSuggestedIds.has(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() =>
                            setGroupChecked((prev) => ({
                              ...prev,
                              [it.id]: !prev[it.id],
                            }))
                          }
                          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                        >
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[12px] ${
                              checked
                                ? "bg-primary text-white"
                                : "border-[1.5px] border-line-strong bg-surface"
                            }`}
                          >
                            {checked ? "✓" : ""}
                          </span>
                          <span
                            className={`flex-1 text-[13px] ${
                              checked ? "font-semibold text-ink" : "text-text-1"
                            }`}
                          >
                            {it.label}
                            {suggested && !checked && (
                              <span className="ml-1.5 t-caption font-bold text-primary">
                                템플릿 추천
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 눈에 띈 점 태그 */}
        <div className="rise-in-4 card flex flex-col gap-2.5 p-4">
          <div className="t-body font-extrabold text-ink">
            눈에 띈 점{" "}
            <span className="t-sub font-medium text-text-3">
              탭해서 태그 추가 (예: 초품아 · 이중주차)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagDefs.map((t) => {
              const active = tags.includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggleTag(t.label)}
                  className={`chip rounded-full px-3 py-1.5 text-xs ${
                    active
                      ? t.tone === "neg"
                        ? "bg-danger-soft font-bold text-danger"
                        : "bg-[rgba(29,79,216,.1)] font-bold text-primary"
                      : "border border-line bg-surface text-text-2"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {t.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTagInputOpen((v) => !v)}
              aria-expanded={tagInputOpen}
              className="chip rounded-full bg-bg px-3 py-1.5 text-xs text-text-3"
            >
              ＋ 직접 입력
            </button>
          </div>
          {/* [967 · 7] 인라인 태그 입력 — Enter 추가 · Esc 닫기 */}
          {tagInputOpen && (
            <div className="flex items-center gap-2">
              <input
                id="note-tag-input"
                type="text"
                autoFocus
                value={tagInput}
                maxLength={TAG_MAX}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 무시
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCustomTag();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTagInput("");
                    setTagInputOpen(false);
                  }
                }}
                placeholder="예: 조용한 단지"
                aria-label="추가할 태그"
                /* [968 · 29] Enter = 추가 — 자판에도 "완료" 로 보인다 */
                enterKeyHint="done"
                className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus:border-primary"
              />
              <button
                type="button"
                onClick={submitCustomTag}
                disabled={!tagInput.trim()}
                className="btn-soft min-h-[40px] shrink-0 rounded-lg px-3 t-sub font-bold disabled:opacity-60"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setTagInput("");
                  setTagInputOpen(false);
                }}
                aria-label="태그 입력 닫기"
                className="tap grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-3"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 고려사항 — 추가 확인 항목 (중요/보통) */}
        <div className="rise-in-5 card flex flex-col gap-2.5 p-4">
          <div className="t-body font-extrabold text-ink">
            고려사항{" "}
            <span className="t-sub font-medium text-text-3">
              결정 전 꼭 확인할 것 · 중요도 표시
            </span>
          </div>
          {todoItems.map((todo) => {
            const done = doneTodos.includes(todo.text);
            return (
              <button
                key={todo.text}
                type="button"
                onClick={() => toggleTodo(todo.text)}
                className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-[11px] text-left"
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[12px] ${
                    done
                      ? "bg-primary text-white"
                      : "border-[1.5px] border-line-strong bg-surface"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  className={`flex-1 text-[13px] ${
                    done ? "text-text-3 line-through" : "text-text-1"
                  }`}
                >
                  {todo.text}
                </span>
                <span
                  className={`rounded-full chip-pad text-[10px] font-bold ${
                    todo.level === "중요"
                      ? "bg-danger-soft text-danger"
                      : "bg-bg text-text-2"
                  }`}
                >
                  {todo.level}
                </span>
              </button>
            );
          })}
          {/* [967 · 7] 인라인 고려사항 입력 — Enter 추가 · Esc 닫기 */}
          {todoInputOpen ? (
            <div className="flex items-center gap-2">
              <input
                id="note-todo-input"
                type="text"
                autoFocus
                value={todoInput}
                maxLength={TODO_MAX}
                onChange={(e) => setTodoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitTodo();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTodoInput("");
                    setTodoInputOpen(false);
                  }
                }}
                placeholder="예: 저녁 시간대 주차 상황 확인"
                aria-label="추가할 고려사항"
                /* [968 · 29] Enter = 추가 — 자판에도 "완료" 로 보인다 */
                enterKeyHint="done"
                className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus:border-primary"
              />
              <button
                type="button"
                onClick={submitTodo}
                disabled={!todoInput.trim()}
                className="btn-soft min-h-[40px] shrink-0 rounded-lg px-3 t-sub font-bold disabled:opacity-60"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setTodoInput("");
                  setTodoInputOpen(false);
                }}
                aria-label="고려사항 입력 닫기"
                className="tap grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-3"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setTodoInputOpen(true)}
              aria-expanded={false}
              className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-strong px-3 py-[11px] t-body text-text-3"
            >
              ＋ 고려사항 추가
            </button>
          )}
        </div>

        </div>

        {/* [984] 3단계 — 무엇을 남길까 */}
        <div className={step === 3 ? "flex flex-col gap-3" : "hidden"}>
        {/* 메모 + 사진 */}
        <div className="rise-in-6 card flex flex-col gap-2.5 p-4">
          <div className="text-[13px] font-extrabold text-ink">
            메모{" "}
            <span className="text-xs font-medium text-text-3">
              현장에서 본 그대로
            </span>
          </div>
          {/* [967 · 8] 자동 높이(4줄~40vh) · 세로 손잡이 · 글자 수(maxLength 와 같은 상한) */}
          <textarea
            ref={memoRef}
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, MEMO_MAX))}
            onBlur={() => {
              const hints = checklistHintsFromVoice(memo).filter(
                (h) => !groupChecked[h.id],
              );
              setMemoHints(hints);
            }}
            rows={4}
            maxLength={MEMO_MAX}
            className="w-full resize-y overflow-y-auto rounded-xl bg-bg p-3.5 text-[13px] leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
            placeholder="예: 남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음"
            aria-label="메모"
          />
          <div className="-mt-1.5 flex justify-end">
            <CharCount value={memo} max={MEMO_MAX} />
          </div>

          {/* 사진 업로드 — /api/upload 실연결 (최대 10장) */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="현장 사진 선택"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          {/* [968 · 32] 촬영 직행 — capture="environment": 후면 카메라로 바로. 한 번에 한 장
              (카메라 앱은 multiple 을 무시한다). 같은 onPickFiles 로 흘러 한도·리사이즈·
              업로드 전부 종전 그대로. */}
          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="카메라로 촬영"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          {/* [967 · 5] 사진 줄 — ◀ ▶ 로 순서, "대표" 로 맨 앞(= 목록 커버). 버튼만
              쓴다: 가로 스크롤 줄에서 드래그는 스크롤과 싸운다. 보이는 버튼은 28px,
              .tap 이 44px 로 넓힌다. */}
          {photos.length > 0 && (
            <ul className="note-photo-strip flex gap-3 overflow-x-auto pb-1" aria-label="첨부한 사진">
              {photos.map((p, i) => {
                const isCover = i === 0;
                const isLast = i === photos.length - 1;
                return (
                  <li key={p} className="w-[132px] shrink-0">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        decoding="async"
                        src={p}
                        alt={isCover ? `대표 사진 (${i + 1}번째)` : `현장 사진 ${i + 1}번째`}
                        className="h-[88px] w-[132px] rounded-[10px] object-cover"
                      />
                      {isCover && (
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-brand-navy px-1.5 py-0.5 t-caption font-bold text-on-dark">
                          대표
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`${i + 1}번째 사진 삭제`}
                        onClick={() => removePhoto(p)}
                        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-brand-navy/85 text-on-dark after:absolute after:-inset-2 after:content-['']"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <button
                        type="button"
                        aria-label="앞으로"
                        disabled={isCover}
                        onClick={() => shiftPhoto(i, -1)}
                        className="tap grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-[13px] text-text-2 disabled:opacity-40"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        aria-label={isCover ? "대표 사진이에요" : "대표 사진으로"}
                        aria-pressed={isCover}
                        disabled={isCover}
                        onClick={() => setCoverPhoto(i)}
                        className={`tap h-7 rounded-lg px-2 t-caption font-bold ${
                          isCover
                            ? "bg-primary text-white"
                            : "border border-line bg-surface text-text-2"
                        }`}
                      >
                        대표
                      </button>
                      <button
                        type="button"
                        aria-label="뒤로"
                        disabled={isLast}
                        onClick={() => shiftPhoto(i, 1)}
                        className="tap grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-[13px] text-text-2 disabled:opacity-40"
                      >
                        ▶
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* [967 · 1·6] 업로드 진행 줄 — 파일별 done/failed, XHR 진행률이 오면 %
              [970 · B-12] 본체는 renderUploadProgress — 상단 버튼 아래에도 같은 블록 */}
          {renderUploadProgress(true)}
          {/* [968 · 32] 하단에도 촬영 버튼 — 수정 모드(상단 블록 없음)에서도 현장 촬영이 되게 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || photos.length >= MAX_PHOTOS}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-line-strong p-[11px] text-center t-body font-bold text-text-2 disabled:opacity-60"
            >
              <Icon name="📷" size={16} className="inline shrink-0 align-middle" />
              {uploading
                ? "업로드 중…"
                : `사진 추가 (${photos.length}/${MAX_PHOTOS})`}
            </button>
            <button
              type="button"
              onClick={() => captureRef.current?.click()}
              disabled={uploading || photos.length >= MAX_PHOTOS}
              aria-label="카메라로 촬영해 사진 추가"
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-line-strong bg-surface px-4 p-[11px] t-body font-bold text-text-1 disabled:opacity-60 pointer-fine:hidden"
            >
              <Icon name="camera" size={16} className="inline shrink-0 align-middle" />
              촬영
            </button>
          </div>
        </div>

        {/* 공개/비공개 선택 — 기본 비공개, 저장 직전 명시적 선택 */}
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic((v) => !v)}
          className="rise-in-6 card flex items-center justify-between gap-3 p-4 text-left"
        >
          <div className="min-w-0">
            <div className="t-body font-extrabold text-ink">
              공개 노트로 저장
            </div>
            <div className="mt-0.5 t-sub text-text-3">
              {isPublic
                ? "공개 피드에 노출돼요 · 노트당 최초 공개 시 100P 적립"
                : "꺼져 있으면 나만 볼 수 있어요 (기본값)"}
            </div>
          </div>
          <Switch on={isPublic} />
        </button>

        {/* 소셜 소재 활용 동의 — 공개 노트일 때만 노출. 동의 없인 자동 소재로
            쓰이지 않는다(저작권·동의 원칙). 문구에 활용 범위를 그대로 적는다. */}
        {isPublic && (
          <label className="card flex cursor-pointer items-start gap-3 p-4">
            <input
              type="checkbox"
              checked={socialShareConsent}
              onChange={(e) => setSocialShareConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#1d4fd8]"
            />
            <span className="min-w-0">
              <span className="block t-body font-extrabold text-ink">
                내집나우 공식 소셜 소재 활용 동의 (선택)
              </span>
              <span className="mt-0.5 block t-sub text-text-3">
                이 노트의 지역·단지명·요약·체감 점수를 내집나우 공식 인스타그램
                릴스·유튜브 쇼츠 영상으로 만들어 게시하는 데 동의해요. 동의는
                노트 수정에서 언제든 철회할 수 있고, 철회하면 이후 소재로 쓰이지
                않아요.
              </span>
            </span>
          </label>
        )}
        </div>
      </div>


      {/* ── [984 · 01/02] 단계 이동 ──────────────────────────────────────
          1·2단계에서도 저장은 늘 열려 있다(필수는 위치 하나뿐) — 그래서
          "여기까지만 저장"이 진짜 동작한다. 이게 30초 노트의 실체다:
          별도 모드가 아니라, 1단계만 채우고 저장을 누르면 끝난다. */}
      <div
        data-above-savebar={oneHand && showSaveBar ? "yes" : undefined}
        className={
          oneHand
            ? "note-step-nav fixed inset-x-0 z-30 flex justify-center px-3"
            : "mt-4 flex justify-center"
        }
      >
        <div
          className={`flex w-full max-w-[560px] items-center gap-2 ${
            oneHand
              ? /* popover-surface — 유리만 쓰면 뒤 글자가 비쳐 두 겹으로 읽힌다
                   (실측: 음성 메모 카드가 바 너머로 보였다). 드롭다운과 같은 면. */
                "glass popover-surface rounded-2xl px-3 py-2.5 shadow-[0_12px_32px_rgba(16,28,54,.16)]"
              : ""
          }`}
        >
          <button
            type="button"
            onClick={() => goStep((step - 1) as NoteStep)}
            disabled={step === 1}
            className="note-step-btn btn-soft btn-md shrink-0 disabled:opacity-40"
          >
            ← 이전
          </button>
          <span className="min-w-0 flex-1 text-center t-caption text-text-3">
            {step} / {NOTE_STEPS.length}
          </span>
          {step < NOTE_STEPS.length ? (
            <button
              type="button"
              onClick={() => goStep((step + 1) as NoteStep)}
              className="note-step-btn btn-primary btn-md shrink-0"
            >
              다음 →
            </button>
          ) : (
            <span className="shrink-0 t-caption text-text-3">마지막 단계</span>
          )}
        </div>
      </div>

      {/* 하단 CTA — [967 · 4] 이 블록이 화면에 보이면 고정 저장 바는 숨는다 */}
      <div
        ref={ctaRef}
        className={step === 3 ? "mt-4 flex flex-col gap-2" : "hidden"}
      >
        {needLogin && (
          <div className="rounded-[14px] border border-[rgba(29,79,216,.2)] bg-[rgba(29,79,216,.08)] px-4 py-3 text-center t-body text-primary">
            저장하려면 로그인이 필요해요 — 작성한 내용은 유지돼요.{" "}
            <Link href={loginHref} className="font-extrabold underline underline-offset-2">
              로그인하기 ›
            </Link>
          </div>
        )}
        {saveError && (
          <div className="rounded-[14px] border border-[color:var(--danger-border)] bg-danger-soft px-4 py-3 text-center t-body font-semibold text-danger">
            {saveError}
          </div>
        )}
        {/* AI 처리 고지 — 버튼을 누르기 전에 알린다 (몰래 보내지 않는다) */}
        <FieldCaptureConsentNotice />
        {/* [961] 4상태 버튼 — 진행(흐린 블루 + 링) → 실패(주홍 흔들림). 완료는 화면이
            바뀌며 환영 장면(showMoment)이 맡는다. */}
        <ActionButton
          state={saving || uploading || aiRunning ? "busy" : saveError ? "error" : "idle"}
          onClick={handleSave}
          busyLabel={aiRunning ? "AI 정리 중" : uploading ? "사진 올리는 중" : "저장 중"}
          errorLabel="다시 시도해 주세요"
          className="btn-cta rounded-2xl p-[15px] text-center text-[15px]"
        >
          {isEdit ? "수정 완료 → AI 정리 받기" : "기록 완료 → AI 정리 받기"}
        </ActionButton>
        <div className="text-center text-xs text-text-3">
          저장할 때만 로그인 · 체크 항목은 다음 임장에도 유지
        </div>
      </div>

      {/* [967 · 4] 하단 고정 저장 바 — 긴 폼의 중간에서도 저장·상태가 손에 닿게.
          탭바 위(--nz-tabbar-offset), 인쇄 제외, 원래 CTA 가 보이면 숨김. 같은
          handleSave 라 동작이 두 갈래가 아니다. */}
      {showSaveBar && (
        <div
          data-noprint
          role="region"
          aria-label="저장"
          className="note-savebar fixed inset-x-0 z-30 flex justify-center px-3"
        >
          <div className="glass flex w-full max-w-[560px] items-center gap-3 rounded-2xl px-3.5 py-2.5 shadow-[0_12px_32px_rgba(16,28,54,.16)]">
            <div className="min-w-0 flex-1">
              {/* [970 · B-11] 첫 줄에 검증·저장 오류를 우선 — 바에서 눌렀는데 아무 반응이 없었다 */}
              {saveError ? (
                <div role="alert" className="truncate t-caption font-bold text-danger">
                  {saveError}
                </div>
              ) : needLogin ? (
                <div role="status" className="truncate t-caption font-bold text-primary">
                  저장하려면 로그인이 필요해요 — 작성한 내용은 유지돼요
                </div>
              ) : (
                <div role="status" className="truncate t-caption text-text-3">
                  {autosaveStatus}
                </div>
              )}
              <div className="truncate t-sub font-bold text-text-1">
                {isPublic ? "공개 노트" : "비공개 노트"}
                {uploading ? " · 사진 올리는 중" : ""}
              </div>
            </div>
            <ActionButton
              state={saving || uploading || aiRunning ? "busy" : saveError ? "error" : "idle"}
              onClick={handleSave}
              busyLabel={aiRunning ? "AI 정리 중" : uploading ? "사진 올리는 중" : "저장 중"}
              errorLabel="다시 시도"
              /* 원래 CTA(아래)가 이미 상태를 읽어 준다 — 같은 변화를 두 번 알리지 않는다 */
              aria-live="off"
              className="btn-cta min-h-[44px] shrink-0 rounded-xl px-4 t-body"
            >
              {/* [984 · 02] 1·2단계에서 누르면 **거기까지가 그대로 저장된다** —
                  필수는 위치 하나뿐이라 정말로 그렇다. 버튼이 "기록 완료"라고만
                  적혀 있으면 남은 칸을 다 채워야 하는 줄 알고 닫아 버린다. */}
              {isEdit ? "수정 완료" : step < NOTE_STEPS.length ? "여기까지 저장" : "기록 완료"}
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
