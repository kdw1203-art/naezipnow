/**
 * [1006] 마이 허브(/my)의 순수 조립 규칙 — node:test 대상. DB 를 모른다.
 *
 * 왜 따로 두는가: /my 는 로더 열 개를 한 화면에 모은다. 로더마다 "실패 / 0건 / n건" 이
 * 다른 사실인데, 화면 코드 안에서 `?? []` 한 줄이면 실패가 0건으로 둔갑한다(관심 노트가
 * 그렇게 사라진 적이 있다). 그래서 로더 결과는 Loaded<T> 로 들고, 화면이 그릴 세 상태
 * (error / empty / items)와 요약 수치("—" 는 실패, 0 은 0)는 여기서만 정한다.
 */

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export function loaded<T>(value: T): Loaded<T> {
  return { ok: true, value };
}
export const FAILED: Loaded<never> = { ok: false };

/** Promise 하나를 Loaded 로 감싼다 — 거부는 FAILED, 기록은 호출자가 한다(onError). */
export async function toLoaded<T>(p: Promise<T>, onError?: (e: unknown) => void): Promise<Loaded<T>> {
  try {
    return loaded(await p);
  } catch (e) {
    onError?.(e);
    return FAILED;
  }
}

export type SectionState<T> =
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "items"; items: T[] };

/** 목록 로더 결과 → 화면 상태. 실패는 실패, 빈 배열은 빈 상태, 그 밖은 목록. */
export function sectionState<T>(l: Loaded<T[]>, limit?: number): SectionState<T> {
  if (!l.ok) return { kind: "error" };
  if (l.value.length === 0) return { kind: "empty" };
  return { kind: "items", items: limit ? l.value.slice(0, limit) : l.value };
}

/* ── 활동 요약 한 줄 ── */
export type ActivityCounts = {
  notes: Loaded<number>;
  watchlist: Loaded<number>;
  savedNotes: Loaded<number>;
  analyses: Loaded<number>;
  points: Loaded<number>;
};

export type ActivitySummaryItem = {
  key: keyof ActivityCounts;
  label: string;
  /** 표시 문자열 — 실패는 "—"(0 이 아니다), 포인트는 "1,250P" */
  value: string;
  /** 조회 실패 여부 — 화면이 title 로 이유를 붙인다 */
  failed: boolean;
  href: string;
};

const SUMMARY_DEF: ReadonlyArray<{ key: keyof ActivityCounts; label: string; href: string; unit: string }> = [
  { key: "notes", label: "노트", href: "/notes?mine=1", unit: "" },
  { key: "watchlist", label: "관심 단지", href: "/my/watchlist", unit: "" },
  { key: "savedNotes", label: "저장 노트", href: "/notes", unit: "" },
  { key: "analyses", label: "AI 분석", href: "/my/analyses", unit: "" },
  { key: "points", label: "포인트", href: "/my/points", unit: "P" },
];

export function buildActivitySummary(counts: ActivityCounts): ActivitySummaryItem[] {
  return SUMMARY_DEF.map((d) => {
    const l = counts[d.key];
    return {
      key: d.key,
      label: d.label,
      value: l.ok ? `${l.value.toLocaleString("ko-KR")}${d.unit}` : "—",
      failed: !l.ok,
      href: d.href,
    };
  });
}

/* ── 시작하기 3단계 → 다음 할 일 하나 ── */
export type OnboardingStepId = "explore" | "inspection" | "share";
export type OnboardingStepDef = {
  id: OnboardingStepId;
  label: string;
  /** 버튼 글자 — 행동 동사로 */
  cta: string;
  href: string;
};

/** 순서는 app/api/me/onboarding/verify.ts 의 REAL_ONBOARDING_STEPS 와 같다 */
export const ONBOARDING_STEP_DEFS: readonly OnboardingStepDef[] = [
  { id: "explore", label: "관심 단지·권역 담기", cta: "지도에서 담기", href: "/map" },
  { id: "inspection", label: "첫 임장노트 작성", cta: "노트 쓰기", href: "/notes/new" },
  { id: "share", label: "임장노트 공개 공유", cta: "내 노트에서 공개하기", href: "/notes?mine=1" },
];

export type NextStep = {
  step: OnboardingStepDef;
  done: number;
  total: number;
};

/** 남은 첫 단계. 다 끝났으면 null(카드를 그리지 않는다). 모르는 id 는 무시. */
export function nextOnboardingStep(completed: readonly string[]): NextStep | null {
  const doneSet = new Set(completed.filter((c) => ONBOARDING_STEP_DEFS.some((s) => s.id === c)));
  const step = ONBOARDING_STEP_DEFS.find((s) => !doneSet.has(s.id));
  if (!step) return null;
  return { step, done: doneSet.size, total: ONBOARDING_STEP_DEFS.length };
}

/* ── 최근 본 단지 레일 ── */
export type RecentComplexCard = { id: string; name: string; region: string | null; href: string };

/** 이름이 빈 행·중복 id 를 걸러 최대 n개. href 는 호출자가 slug 규칙으로 만든다. */
export function recentComplexCards(
  rows: ReadonlyArray<{ id: string; name: string; region: string | null }>,
  hrefOf: (id: string) => string,
  limit = 8,
): RecentComplexCard[] {
  const seen = new Set<string>();
  const out: RecentComplexCard[] = [];
  for (const r of rows) {
    const id = r.id.trim();
    const name = r.name.trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, region: r.region?.trim() || null, href: hrefOf(id) });
    if (out.length >= limit) break;
  }
  return out;
}
