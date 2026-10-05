/* [1033] 임장한 타입·사진 역할의 **핵심**(폼 첫 로드에 실리는 부분) — unit-detail.ts 에서 떼어 냈다.
   /notes/new 예산 470KB 를 지키려 폼(NoteForm)은 이 모듈만 정적으로 가져오고, 선택지 목록(FIELD_*)·실거래 타입·단지 사실 줄·
   서버 정리는 unit-detail.ts(지연 조각·서버)에 남긴다. unit-detail 은 이 모듈을 다시 내보내므로 기존 import 는 그대로다. */

export type NoteUnit = {
  /** 전용면적(㎡) — 실거래 타입에서 고르거나 직접 적은 값 */
  areaM2: number | null;
  /** "84㎡" 같은 표기(고른 타입의 라벨) */
  areaLabel: string | null;
  /** 동 — "103동" 처럼 사람이 적은 그대로(≤ 12자) */
  dong: string | null;
  /** 층 — 숫자(1~99) */
  floor: number | null;
  /** 향 */
  direction: NoteDirection | null;
};

export const NOTE_DIRECTIONS = ["남", "남동", "남서", "동", "서", "북", "북동", "북서"] as const;
export type NoteDirection = (typeof NOTE_DIRECTIONS)[number];

export const EMPTY_UNIT: NoteUnit = { areaM2: null, areaLabel: null, dong: null, floor: null, direction: null };

export function isEmptyUnit(u: NoteUnit): boolean {
  return u.areaM2 == null && !u.areaLabel && !u.dong && u.floor == null && !u.direction;
}

/** 전용면적 → 타입 라벨. 84.97 → "84㎡"(국내 관행: 소수점 버림) */
export function areaTypeLabel(areaM2: number): string {
  return `${Math.floor(areaM2)}㎡`;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 저장된 metadata.unit → NoteUnit(모양이 틀리면 빈 값) */
export function unitFromMetadata(meta: unknown): NoteUnit {
  const u = rec(rec(meta)?.unit);
  if (!u) return EMPTY_UNIT;
  const area = finite(u.areaM2);
  const floor = finite(u.floor);
  const dir = typeof u.direction === "string" && (NOTE_DIRECTIONS as readonly string[]).includes(u.direction) ? (u.direction as NoteDirection) : null;
  return {
    areaM2: area != null && area > 0 && area < 1000 ? area : null,
    areaLabel: typeof u.areaLabel === "string" && u.areaLabel.length <= 12 ? u.areaLabel : area != null && area > 0 ? areaTypeLabel(area) : null,
    dong: typeof u.dong === "string" && u.dong.trim() ? u.dong.trim().slice(0, 12) : null,
    floor: floor != null && Number.isInteger(floor) && floor >= -5 && floor <= 99 ? floor : null,
    direction: dir,
  };
}

/** 저장용 — 빈 값은 키를 뺀다(없는 것을 null 로 적지 않는다). 전부 비면 undefined */
export function unitForSave(u: NoteUnit): Record<string, unknown> | undefined {
  if (isEmptyUnit(u)) return undefined;
  const o: Record<string, unknown> = {};
  if (u.areaM2 != null) o.areaM2 = u.areaM2;
  if (u.areaLabel) o.areaLabel = u.areaLabel;
  if (u.dong) o.dong = u.dong;
  if (u.floor != null) o.floor = u.floor;
  if (u.direction) o.direction = u.direction;
  return o;
}

/** "84㎡ · 103동 · 12층 · 남향" — 있는 것만. 전부 비면 null */
export function unitSummary(u: NoteUnit): string | null {
  const parts: string[] = [];
  if (u.areaLabel) parts.push(u.areaLabel);
  else if (u.areaM2 != null) parts.push(areaTypeLabel(u.areaM2));
  if (u.dong) parts.push(/동$/.test(u.dong) ? u.dong : `${u.dong}동`);
  if (u.floor != null) parts.push(`${u.floor}층`);
  if (u.direction) parts.push(`${u.direction}향`);
  return parts.length ? parts.join(" · ") : null;
}

/* ── 사진 역할(평면도) ─────────────────────────────────────────────────────── */

export const PHOTO_ROLES = ["floorplan"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];
export const PHOTO_ROLE_LABEL: Record<PhotoRole, string> = { floorplan: "평면도" };

/** metadata.photoRoles → { url: role } (아는 역할만) */
export function photoRolesFromMetadata(meta: unknown): Record<string, PhotoRole> {
  const r = rec(rec(meta)?.photoRoles);
  const out: Record<string, PhotoRole> = {};
  if (!r) return out;
  for (const [url, role] of Object.entries(r)) {
    if (typeof role === "string" && (PHOTO_ROLES as readonly string[]).includes(role) && url) out[url] = role as PhotoRole;
  }
  return out;
}

/** 저장용 — 노트에 남은 사진의 역할만(지운 사진의 역할은 버린다). 비면 undefined */
export function photoRolesForSave(roles: Record<string, PhotoRole>, photos: string[]): Record<string, PhotoRole> | undefined {
  const keep = new Set(photos);
  const o: Record<string, PhotoRole> = {};
  for (const [url, role] of Object.entries(roles)) if (keep.has(url)) o[url] = role;
  return Object.keys(o).length ? o : undefined;
}


/* ── 세부 기록(폼 쪽 느슨한 처리) ─────────────────────────────────────── */

/** 폼이 드는 세부 기록 — 키 → 문자열·숫자(선택지·범위 검사는 unit-detail.fieldDetailFromMetadata · 서버 sanitizeUnitMeta 가 한다) */
export type FieldDetailLoose = Record<string, string | number | undefined>;

/** metadata.fieldDetail → 폼 상태(느슨): 문자열(≤200)·유한수만 남긴다. 선택지 밖 값은 저장 때 서버가 지운다 */
export function fieldDetailLoose(meta: unknown): FieldDetailLoose {
  const d = rec(rec(meta)?.fieldDetail);
  const out: FieldDetailLoose = {};
  if (!d) return out;
  for (const [k, v] of Object.entries(d)) {
    if (!/^[A-Za-z]{1,40}$/.test(k)) continue;
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** 저장용 — 빈 값 키 제거. 전부 비면 undefined(폼은 null 로 보낸다: PATCH 덮어쓰기에 "비움"이 전달되게) */
export function fieldDetailLooseForSave(d: FieldDetailLoose): FieldDetailLoose | undefined {
  const o: FieldDetailLoose = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v)) o[k] = typeof v === "string" ? v.trim() : v;
  }
  return Object.keys(o).length ? o : undefined;
}
