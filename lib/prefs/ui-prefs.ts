/**
 * [1006] 표시·기록 기본값(설정 화면) — 순수 스키마. 서버·클라이언트·테스트가 같은 것을 본다.
 *
 * 저장 위치: user_preferences.ui_prefs(jsonb, 마이그레이션 20260920032000). 서버는 읽을
 * 때마다 normalizeUiPrefs 로 정규화한다 — 모르는 키·틀린 값은 버리고 기본값을 쓴다.
 * 면적 단위만은 로그인 없이도 쓰이므로 쿠키(AREA_UNIT_COOKIE)에 거울을 둔다 —
 * lib/prefs/area-unit.ts.
 *
 * 값을 늘릴 때: 여기에 키·기본값·정규화 규칙을 먼저 적고, 화면(설정)과 소비처(노트
 * 작성기·지도 패널)가 그 키를 읽는다. 여기 없는 키는 저장되지 않는다.
 *
 * [1006 · 리뷰 H1] 주간 다이제스트 메일(weeklyDigestEmail)은 여기서 뺐다 — 발송 크론
 * (app/api/cron/weekly-digest)은 notification_preferences 만 읽으므로, 여기 둔 값은 어디에도
 * 닿지 않는 죽은 스위치였다. 수신 설정은 알림 탭(pushWeeklyDigest·emailMarketing)이 맡는다.
 */

export type AreaUnit = "m2" | "pyeong";
export type NoteVisibility = "public" | "private";
/** lib/inspection/store-db 의 InvestorRole 과 같은 집합 — 그 모듈은 server-only 라 여기서 다시 적는다 */
export type InvestorRolePref = "live" | "invest" | "flip" | "rent" | "balanced";

export type UiPrefs = {
  /** 면적 표시 단위 — 실거래·단지 패널·노트의 면적 */
  areaUnit: AreaUnit;
  /** 임장노트 저장 시 기본 공개 범위 */
  noteVisibilityDefault: NoteVisibility;
  /** /notes/new 를 열 때 퀵 기록(한 화면)으로 시작 */
  noteQuickDefault: boolean;
  /** AI 정리에 넘기는 기본 투자자 역할 — null 이면 노트마다 고른다 */
  investorRoleDefault: InvestorRolePref | null;
  /** 마지막 저장 시각(ISO) — 화면 표시용 */
  updatedAt: string | null;
};

export const DEFAULT_UI_PREFS: UiPrefs = {
  areaUnit: "m2",
  /* [1006 · 리뷰 H2] 기본은 비공개 — 작성기가 예전부터 비공개로 시작했고, 설정을 열어 본 적 없는
     사람의 노트가 말없이 공개로 저장되면 안 된다. 설정 화면의 표시값과 작성기의 실제 시작값이
     같은 이유로 여기서 한 번만 정한다. */
  noteVisibilityDefault: "private",
  noteQuickDefault: false,
  investorRoleDefault: null,
  updatedAt: null,
};

const AREA_UNITS: readonly AreaUnit[] = ["m2", "pyeong"];
const VISIBILITIES: readonly NoteVisibility[] = ["public", "private"];
const ROLES: readonly InvestorRolePref[] = ["live", "invest", "flip", "rent", "balanced"];

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 저장된 jsonb(또는 클라이언트가 보낸 patch)를 스키마에 맞춘다. 알 수 없는 키는 버린다. */
export function normalizeUiPrefs(input: unknown, base: UiPrefs = DEFAULT_UI_PREFS): UiPrefs {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const role = o.investorRoleDefault;
  return {
    areaUnit: pick(o.areaUnit, AREA_UNITS, base.areaUnit),
    noteVisibilityDefault: pick(o.noteVisibilityDefault, VISIBILITIES, base.noteVisibilityDefault),
    noteQuickDefault: typeof o.noteQuickDefault === "boolean" ? o.noteQuickDefault : base.noteQuickDefault,
    /* 모르는 역할 문자열은 null(노트마다 고른다)로 — 임의 기본 역할로 승격하지 않는다 */
    investorRoleDefault:
      role === null
        ? null
        : typeof role === "string"
          ? (ROLES as readonly string[]).includes(role)
            ? (role as InvestorRolePref)
            : null
          : base.investorRoleDefault,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : base.updatedAt,
  };
}

/** patch 에 실제로 들어온 키만 골라 base 위에 얹는다 — PATCH 의미 */
export function mergeUiPrefs(base: UiPrefs, patch: unknown): UiPrefs {
  const o = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...base };
  for (const k of ["areaUnit", "noteVisibilityDefault", "noteQuickDefault", "investorRoleDefault"]) {
    if (k in o) next[k] = o[k];
  }
  return normalizeUiPrefs(next, base);
}
