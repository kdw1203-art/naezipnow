/**
 * [1052] 전문가 등록 양식의 순수 규칙 — 화면(ApplyForm)과 서버(/api/experts/register)가 같이 읽는다.
 *  · 등록·자격번호 형식(CERT_NUMBER_RE) — "제2024-12345호" · "12345" · "서울-2024-123" 을 받는다.
 *    예전 화면 규칙은 하이픈이 꼭 있어야 해서 숫자만인 번호("12345")를 거절했고, 서버는 형식을 보지 않았다.
 *  · ?type= 미리 고르기 — 분류 체계(lib/experts/taxonomy)의 id 또는 라벨과 정확히 같을 때만.
 *  · 임시 저장(sessionStorage) 직렬화 — 읽어 온 값은 믿지 않고 양식이 받는 범위로 다시 깎는다.
 * node 내장 모듈 · server-only 의존 없음(클라이언트 번들 · 단위 시험 공용).
 */
import {
  BUSINESS_FORMS,
  DOC_KINDS,
  EXPERT_TYPES,
  SPECIALTIES,
  type BusinessFormId,
  type ExpertTypeId,
} from "./taxonomy";
import { EXPERT_DOC_MAX_FILES, type ExpertDocFile } from "./doc-limits";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";

/* ---------- 등록·자격번호 ---------- */

export const CERT_NUMBER_RE = /^제?\s?[0-9A-Za-z가-힣-]{2,20}\s?호?$/;

/** 비교 · 저장용 — 앞뒤 공백과 안쪽 공백을 지운다("제 2024-12345 호" → "제2024-12345호") */
export function normalizeCertInput(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).normalize("NFKC").trim().replace(/\s+/g, "");
}

/** 형식 검사 — 빈 값은 false(필수 여부는 호출부가 따로 본다). 숫자 없는 글자열은 번호가 아니다. */
export function isValidCertNumber(raw: unknown): boolean {
  const s = normalizeCertInput(raw);
  if (!s) return false;
  return CERT_NUMBER_RE.test(s) && /\d/.test(s);
}

export const CERT_NUMBER_ERROR = "등록·자격번호 형식 확인 · 예: 제2024-12345호, 12345";

/* ---------- ?type= 미리 고르기 ---------- */

/** 주소의 ?type= → 직업군 id. 분류 체계에 정확히 있는 id · 라벨만(부분 일치는 하지 않는다) */
export function expertTypeFromQuery(search: string | null | undefined): ExpertTypeId | null {
  let v: string | null = null;
  try {
    v = new URLSearchParams(search ?? "").get("type");
  } catch {
    return null;
  }
  const s = (v ?? "").trim();
  if (!s) return null;
  return EXPERT_TYPES.find((t) => t.id === s || t.label === s)?.id ?? null;
}

/* ---------- 임시 저장 ---------- */

export const APPLY_DRAFT_KEY = "nz:expert-apply-draft:v1";

/** 동의(agree)는 싣지 않는다 — 동의는 낼 때마다 직접 */
export type ApplyDraft = {
  typeId: ExpertTypeId;
  formId: BusinessFormId;
  name: string;
  businessName: string;
  bizNo: string;
  certNumber: string;
  city: string;
  district: string;
  customCity: string;
  specialties: string[];
  yearsExp: string;
  bio: string;
  docs: ExpertDocFile[];
};

const SPECIALTY_MAX = 6;

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function parseDoc(v: unknown): ExpertDocFile | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.path !== "string" || !d.path || d.path.length > 300) return null;
  if (typeof d.kind !== "string" || !DOC_KINDS.some((k) => k.id === d.kind)) return null;
  const size = Number(d.size);
  if (!Number.isFinite(size) || size < 0) return null;
  return {
    path: d.path,
    kind: d.kind as ExpertDocFile["kind"],
    name: clip(d.name, 80) || "첨부",
    size,
    mime: clip(d.mime, 60),
    uploadedAt: clip(d.uploadedAt, 40),
  };
}

/** 저장된 문자열 → 양식 값. 깨졌거나 모양이 다르면 null(새 양식으로 시작) */
export function parseApplyDraft(raw: string | null | undefined): ApplyDraft | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const d = o as Record<string, unknown>;
  const typeId = EXPERT_TYPES.find((t) => t.id === d.typeId)?.id ?? "tax";
  const formId = BUSINESS_FORMS.find((f) => f.id === d.formId)?.id ?? "individual";
  const city = (CITY_OPTIONS as readonly string[]).includes(String(d.city)) ? String(d.city) : "서울특별시";
  const districts = (DISTRICTS as Record<string, string[]>)[city] ?? [];
  const district = typeof d.district === "string" && districts.includes(d.district) ? d.district : "";
  const known = new Set(SPECIALTIES.map((s) => s.label));
  const specialties = Array.isArray(d.specialties)
    ? [...new Set(d.specialties.filter((s): s is string => typeof s === "string" && known.has(s)))].slice(0, SPECIALTY_MAX)
    : [];
  const docs: ExpertDocFile[] = [];
  if (Array.isArray(d.docs)) {
    for (const x of d.docs) {
      const doc = parseDoc(x);
      if (doc && !docs.some((y) => y.path === doc.path)) docs.push(doc);
      if (docs.length >= EXPERT_DOC_MAX_FILES) break;
    }
  }
  return {
    typeId,
    formId,
    name: clip(d.name, 40),
    businessName: clip(d.businessName, 60),
    bizNo: clip(d.bizNo, 12).replace(/[^0-9-]/g, ""),
    certNumber: clip(d.certNumber, 40),
    city,
    district,
    customCity: clip(d.customCity, 20),
    specialties,
    yearsExp: clip(d.yearsExp, 2).replace(/[^0-9]/g, ""),
    bio: clip(d.bio, 1000),
    docs,
  };
}

export function serializeApplyDraft(d: ApplyDraft): string {
  return JSON.stringify(d);
}

/** 손댄 칸이 하나도 없는 양식 — 저장하지 않고 지운다(직업군 · 형태 · 시/도는 기본값이라 보지 않는다) */
export function isBlankApplyDraft(d: ApplyDraft): boolean {
  return (
    !d.name.trim() &&
    !d.businessName.trim() &&
    !d.bizNo.trim() &&
    !d.certNumber.trim() &&
    !d.district &&
    !d.customCity.trim() &&
    d.specialties.length === 0 &&
    !d.yearsExp &&
    !d.bio.trim() &&
    d.docs.length === 0
  );
}
