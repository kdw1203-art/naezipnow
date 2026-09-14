/**
 * [1000] 프로필 편집 시트의 순수 규칙 — 이름·관심 지역 검증과 지역 선택지 구성.
 *
 * `server-only`·React 를 import 하지 않는다 — ProfileEditSheet(클라이언트)와 node:test 가
 * 같은 규칙을 부른다. 서버 검증은 /api/me/profile 이 따로 한다(이름 1~50자·지역 80자) —
 * 상한은 서버(app/api/me/profile, 50자)와 같다 — 기존 긴 이름을 가진 사람이 지역만 바꿀 때 막히지 않게.
 */

export const PROFILE_NAME_MAX = 50;
export const PROFILE_REGION_MAX = 80;

export type ProfileDraft = {
  name: string;
  /** 빈 문자열 = 관심 지역 없음 */
  primaryRegion: string;
};

export type ProfileInitial = {
  name: string | null;
  primaryRegion: string | null;
};

export type ProfilePatch = {
  name?: string;
  primaryRegion?: string | null;
};

export type ProfileValidation =
  | { ok: true; draft: ProfileDraft }
  | { ok: false; field: keyof ProfileDraft; error: string };

/* 제어 문자·줄바꿈은 이름이 될 수 없다(화면 한 줄에 그려지는 값) */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** 이름·지역을 다듬고 검사한다. 통과하면 다듬은 초안을 돌려준다. */
export function validateProfileDraft(input: ProfileDraft): ProfileValidation {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length === 0) {
    return { ok: false, field: "name", error: "이름을 입력해 주세요." };
  }
  if (name.length > PROFILE_NAME_MAX) {
    return {
      ok: false,
      field: "name",
      error: `이름은 ${PROFILE_NAME_MAX}자 이내로 입력해 주세요.`,
    };
  }
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, field: "name", error: "이름에 쓸 수 없는 문자가 있어요." };
  }
  const primaryRegion = input.primaryRegion.replace(/\s+/g, " ").trim();
  if (primaryRegion.length > PROFILE_REGION_MAX) {
    return {
      ok: false,
      field: "primaryRegion",
      error: `관심 지역은 ${PROFILE_REGION_MAX}자 이내여야 해요.`,
    };
  }
  return { ok: true, draft: { name, primaryRegion } };
}

/**
 * 처음 값과 비교해 **바뀐 필드만** PATCH 본문으로 만든다. 아무것도 안 바뀌었으면 null —
 * /api/me/profile 은 빈 본문에 400("변경할 내용이 없습니다")을 돌려주므로, 그 요청은
 * 아예 보내지 않는다.
 */
export function buildProfilePatch(
  draft: ProfileDraft,
  initial: ProfileInitial,
): ProfilePatch | null {
  const patch: ProfilePatch = {};
  const initialName = (initial.name ?? "").trim();
  if (draft.name !== initialName) patch.name = draft.name;
  const initialRegion = (initial.primaryRegion ?? "").trim();
  if (draft.primaryRegion !== initialRegion) {
    patch.primaryRegion = draft.primaryRegion === "" ? null : draft.primaryRegion;
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

/* ── 관심 지역 선택지 ── */

export type RegionOptionSource = {
  id: string;
  name: string;
  /** 시/도 — 없으면 서울 */
  city?: string;
};

export type RegionOption = { value: string; label: string };
export type RegionOptionGroup = { city: string; options: RegionOption[] };

/** 시/도 표시명. 카탈로그는 서울 항목에 city 를 적지 않는다. */
export function regionCityLabel(info: Pick<RegionOptionSource, "city">): string {
  return (info.city ?? "").trim() || "서울";
}

/**
 * 선택지 라벨 — `${시/도} ${이름}`. 광역시 항목은 이름에 시/도가 이미 들어 있어("부산 중구")
 * 그대로 붙이면 "부산 부산 중구"가 되므로, 이름이 시/도로 시작하면 이름만 쓴다.
 * 저장값은 항상 `name`(app_users.primary_region 은 자유 텍스트) — 화면·알림이 그 문자열을 그대로 쓴다.
 */
export function regionOptionLabel(info: RegionOptionSource): string {
  const city = regionCityLabel(info);
  const name = info.name.trim();
  return name.startsWith(`${city} `) || name === city ? name : `${city} ${name}`;
}

/** 시/도 순서는 카탈로그 등장 순서를 따른다(서울 → 경기 → 인천 → 광역시). */
export function groupRegionOptions(catalog: readonly RegionOptionSource[]): RegionOptionGroup[] {
  const groups: RegionOptionGroup[] = [];
  const byCity = new Map<string, RegionOptionGroup>();
  for (const info of catalog) {
    const city = regionCityLabel(info);
    let group = byCity.get(city);
    if (!group) {
      group = { city, options: [] };
      byCity.set(city, group);
      groups.push(group);
    }
    group.options.push({ value: info.name, label: regionOptionLabel(info) });
  }
  return groups;
}

/** 저장된 값이 카탈로그에 없는 자유 텍스트(옛 입력)인지 — select 가 값을 잃지 않게 별도 항목으로 붙인다. */
export function isKnownRegion(
  value: string | null | undefined,
  catalog: readonly RegionOptionSource[],
): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  return catalog.some((c) => c.name === v);
}
