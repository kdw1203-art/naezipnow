/**
 * [984] 임장노트 작성 폼 — 단계 구조와 "이어받기" 저장값.
 *
 * 왜 순수 모듈로 빼는가: NoteForm.tsx 는 2,794줄짜리 클라이언트 컴포넌트라
 * 단위 테스트를 붙일 수 없다. 판단이 들어가는 부분(어느 단계가 채워졌는가,
 * 기억해 둔 단지를 언제까지 제안할 것인가)만 여기로 내려 테스트한다.
 * `server-only` 를 import 하지 않는다 — 그러면 tests/unit 러너에서 못 읽는다.
 */

export type NoteStep = 1 | 2 | 3;

export const NOTE_STEPS: ReadonlyArray<{
  n: NoteStep;
  /** 탭에 적히는 짧은 이름 — 390px 에서 세 칸이 한 줄에 들어가야 한다 */
  short: string;
  /** 그 단계에서 하는 일 */
  title: string;
  hint: string;
}> = [
  { n: 1, short: "어디", title: "어디를 봤나요", hint: "단지 · 방문 정보 · 사진" },
  { n: 2, short: "무엇", title: "무엇을 봤나요", hint: "점수 · 체크 · 눈에 띈 점" },
  { n: 3, short: "기록", title: "무엇을 남길까요", hint: "메모 · 사진 · 공개 여부" },
];

/**
 * 저장에 **반드시** 필요한 것은 위치뿐이다(handleSave 의 유일한 검증).
 * 그래서 1단계만 채우고도 저장할 수 있다 — 이게 "30초 노트"의 근거다.
 * 나중에 필수 항목이 늘면 이 함수 하나만 바뀐다.
 */
export function canSave(hasLocation: boolean): boolean {
  return hasLocation;
}

/** 검증 오류가 난 항목이 속한 단계 — 다른 단계에 있으면 옮겨야 스크롤이 의미가 있다 */
export function stepOfField(field: "location"): NoteStep {
  switch (field) {
    case "location":
      return 1;
    default:
      return 1;
  }
}

export type StepFill = {
  /** 단지·주소를 골랐다 */
  located: boolean;
  /** 점수·체크·태그 중 하나라도 눌렀다 */
  judged: boolean;
  /** 메모나 사진을 남겼다 */
  wrote: boolean;
};

/** 각 단계가 "채워졌는지" — 탭의 완료 표시에 쓴다. 진행률과 같은 사실을 본다. */
export function stepDone(fill: StepFill): Record<NoteStep, boolean> {
  return { 1: fill.located, 2: fill.judged, 3: fill.wrote };
}

/* ── 05 단지 이어받기 ─────────────────────────────────────────────
   같은 날 같은 단지를 여러 번 보거나, 옆 단지를 이어서 보는 일이 흔하다.
   그때마다 단지명을 다시 검색하게 두지 않는다. 로그인 없이 쓰는 사람도
   이어 쓸 수 있어야 하므로 서버가 아니라 **이 기기**에 남긴다.
   ────────────────────────────────────────────────────────────── */

export type CarryOverComplex = {
  aptName: string;
  region: string;
  complexId: string | null;
  lat: number | null;
  lng: number | null;
  /** 저장 시각(ms) — 오래된 제안은 안 띄운다 */
  savedAt: number;
};

export const CARRY_OVER_KEY = "nz_note_last_complex";

/**
 * 14일. 임장은 며칠 안에 이어지는 일이 많고, 그보다 오래되면 "지난번 그 단지"가
 * 더 이상 지금 하려는 일과 관계가 없다 — 그때 띄우는 제안은 도움이 아니라 방해다.
 */
export const CARRY_OVER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function asFiniteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** localStorage 문자열 → 제안할 만한 값. 형식이 어긋나거나 오래됐으면 null. */
export function readCarryOver(raw: string | null, now: number): CarryOverComplex | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const aptName = typeof o.aptName === "string" ? o.aptName.trim() : "";
  const region = typeof o.region === "string" ? o.region.trim() : "";
  /* 단지명·지역이 없으면 이어받을 게 없다 — 빈 칸을 제안하지 않는다 */
  if (!aptName || !region) return null;
  const savedAt = asFiniteOrNull(o.savedAt);
  if (savedAt === null) return null;
  /* 미래 시각은 기기 시계가 틀어진 것이다 — 믿지 않는다 */
  if (savedAt > now) return null;
  if (now - savedAt > CARRY_OVER_MAX_AGE_MS) return null;
  return {
    aptName,
    region,
    complexId: typeof o.complexId === "string" && o.complexId ? o.complexId : null,
    lat: asFiniteOrNull(o.lat),
    lng: asFiniteOrNull(o.lng),
    savedAt,
  };
}

export function serializeCarryOver(
  c: Omit<CarryOverComplex, "savedAt">,
  now: number,
): string | null {
  const aptName = c.aptName.trim();
  const region = c.region.trim();
  if (!aptName || !region) return null;
  const payload: CarryOverComplex = {
    aptName,
    region,
    complexId: c.complexId ?? null,
    lat: asFiniteOrNull(c.lat),
    lng: asFiniteOrNull(c.lng),
    savedAt: now,
  };
  return JSON.stringify(payload);
}

/** "3일 전 · 은마아파트" 처럼 언제 것인지 밝혀 준다 — 모르는 값이 채워지면 불안하다 */
export function carryOverAgeLabel(savedAt: number, now: number): string {
  const days = Math.floor((now - savedAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/* ── 13 한 손 모드 ────────────────────────────────────────────── */

export const ONE_HAND_KEY = "nz_note_one_hand";

export function readOneHand(raw: string | null): boolean {
  return raw === "1";
}

export function serializeOneHand(on: boolean): string {
  return on ? "1" : "0";
}
