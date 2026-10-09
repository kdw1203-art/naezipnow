import type { UserExpertProfile } from "./store-db";

/**
 * 전문가 공개 DTO — API(/api/experts · /api/experts/[id]) 응답에 싣는 모양.
 *
 * [1052] 블랙리스트(소유자 이메일 · user id 만 빼고 나머지 전부)에서 **명시 화이트리스트**로 바꿨다.
 * 예전 방식은 프로필 타입에 칸이 늘면 그대로 공개 JSON 에 실렸다 — 운영자 검수 메모(verificationNote)가
 * 실제로 그렇게 새고 있었다. 이제 아래 PUBLIC_EXPERT_FIELDS 에 적힌 칸만 나간다.
 *
 * 연락처 원칙(목록 화면 toPublicRow · 상세 화면과 같음): 상호 · 연락처 · 등록번호 · 사업 형태 · 승인일은
 * **인증(관리자 승인) 전문가만** 값을 싣고, 심사 중·미인증은 null 로 비운다.
 *
 * userId 는 내부 식별자다 — 공개 목록에 실리면 다른 API 와 조합해 계정을 역추적하는 재료가 된다(2026-08-02 감사).
 * [953] 순수 모듈 — access.ts 는 server-only 의존(프로필 조회)이 있어 단위 테스트에서 못 불렀다.
 */
export type PublicExpert = {
  id: string;
  name: string;
  title: string;
  category: string;
  regions: string[];
  specialties: string[];
  introduction: string;
  consultationFee: number;
  reportFee: number;
  rating: number;
  reviews: number;
  consultations: number;
  experience: string;
  responseRate: number;
  responseTime: string;
  isVerified: boolean;
  isPremium: boolean;
  badge: string | null;
  /* ↓ 인증 전문가만 값, 아니면 null */
  organization: string | null;
  businessForm: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  brokerRegistrationNo: string | null;
  verificationCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 공개 응답에 실리는 칸 — 이 목록 밖의 칸(ownerEmail · userId · verificationNote · gradient …)은 나가지 않는다 */
export const PUBLIC_EXPERT_FIELDS = [
  "id",
  "name",
  "title",
  "category",
  "regions",
  "specialties",
  "introduction",
  "consultationFee",
  "reportFee",
  "rating",
  "reviews",
  "consultations",
  "experience",
  "responseRate",
  "responseTime",
  "isVerified",
  "isPremium",
  "badge",
  "organization",
  "businessForm",
  "contactPhone",
  "contactKakao",
  "brokerRegistrationNo",
  "verificationCheckedAt",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof PublicExpert)[];

/** 인증 전문가만 공개하는 칸 — 미인증이면 null */
export const VERIFIED_ONLY_FIELDS = [
  "organization",
  "businessForm",
  "contactPhone",
  "contactKakao",
  "brokerRegistrationNo",
  "verificationCheckedAt",
] as const satisfies readonly (keyof PublicExpert)[];

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sanitizeExpertForPublic(e: UserExpertProfile): PublicExpert {
  const verified = e.isVerified === true;
  const gated = (v: unknown): string | null => (verified ? strOrNull(v) : null);
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    category: e.category,
    regions: strList(e.regions),
    specialties: strList(e.specialties),
    introduction: e.introduction ?? "",
    consultationFee: num(e.consultationFee),
    reportFee: num(e.reportFee),
    rating: num(e.rating),
    reviews: num(e.reviews),
    consultations: num(e.consultations),
    experience: e.experience ?? "",
    responseRate: num(e.responseRate),
    responseTime: e.responseTime ?? "",
    isVerified: verified,
    isPremium: e.isPremium === true,
    badge: strOrNull(e.badge),
    organization: gated(e.organization),
    businessForm: gated(e.businessForm),
    contactPhone: gated(e.contactPhone),
    contactKakao: gated(e.contactKakao),
    brokerRegistrationNo: gated(e.brokerRegistrationNo),
    verificationCheckedAt: gated(e.verificationCheckedAt),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
