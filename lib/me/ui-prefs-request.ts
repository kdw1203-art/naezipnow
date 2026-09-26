/**
 * [1006] PATCH /api/me/preferences 의 입력 검증 — 순수 함수(node:test 대상).
 *
 * 라우트는 세션·저장만 맡고 "무엇을 받아 주는가"는 여기 한 곳에 둔다. 스키마의 진짜
 * 원본은 lib/prefs/ui-prefs.ts(normalize/merge)지만, 그쪽은 **틀린 값을 조용히 기본값으로
 * 바꾼다**(저장된 jsonb 를 읽을 때 맞는 태도). 사용자가 방금 보낸 요청은 다르다 —
 * "pyeong2" 를 보냈는데 200 OK 에 "m2" 가 돌아오면 화면은 저장됐다고 믿고 값은 틀린다.
 * 그래서 요청은 여기서 **거절**하고, 허용된 키·값만 골라 patch 로 넘긴다.
 */
import type { UiPrefs } from "@/lib/prefs/ui-prefs";

export type UiPrefsPatch = Partial<Omit<UiPrefs, "updatedAt">>;

export type UiPrefsPatchResult =
  | { ok: true; patch: UiPrefsPatch }
  | { ok: false; error: string };

const AREA_UNITS = new Set(["m2", "pyeong"]);
const VISIBILITIES = new Set(["public", "private"]);
const ROLES = new Set(["live", "invest", "flip", "rent", "balanced"]);

/** 요청 body 전체(`{ uiPrefs: {...} }`)를 받아 저장 가능한 patch 로 좁힌다. */
export function parseUiPrefsPatch(body: unknown): UiPrefsPatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "요청 형식이 올바르지 않아요." };
  }
  const raw = (body as { uiPrefs?: unknown }).uiPrefs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "uiPrefs 객체가 필요해요." };
  }
  const o = raw as Record<string, unknown>;
  const patch: UiPrefsPatch = {};

  if ("areaUnit" in o) {
    if (typeof o.areaUnit !== "string" || !AREA_UNITS.has(o.areaUnit)) {
      return { ok: false, error: "면적 단위는 ㎡ 또는 평만 고를 수 있어요." };
    }
    patch.areaUnit = o.areaUnit as UiPrefs["areaUnit"];
  }
  if ("noteVisibilityDefault" in o) {
    if (typeof o.noteVisibilityDefault !== "string" || !VISIBILITIES.has(o.noteVisibilityDefault)) {
      return { ok: false, error: "기본 공개 범위는 공개 또는 비공개만 고를 수 있어요." };
    }
    patch.noteVisibilityDefault = o.noteVisibilityDefault as UiPrefs["noteVisibilityDefault"];
  }
  if ("noteQuickDefault" in o) {
    if (typeof o.noteQuickDefault !== "boolean") {
      return { ok: false, error: "퀵 기록 기본값은 켜짐/꺼짐이어야 해요." };
    }
    patch.noteQuickDefault = o.noteQuickDefault;
  }
  if ("investorRoleDefault" in o) {
    const v = o.investorRoleDefault;
    if (v !== null && (typeof v !== "string" || !ROLES.has(v))) {
      return { ok: false, error: "기본 투자자 역할 값이 올바르지 않아요." };
    }
    patch.investorRoleDefault = v as UiPrefs["investorRoleDefault"];
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "변경할 항목이 없어요." };
  }
  return { ok: true, patch };
}
