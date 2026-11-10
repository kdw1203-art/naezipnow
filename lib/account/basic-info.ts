/* [1135 · 기본 정보] 소유자 2026-11-10 "회원가입 시 연락처, 주민번호 앞자리, 주소 등 기본정보도 업데이트할 수 있도록".
   [1138 · 필수] 소유자 2026-11-11 "순서는 생년월일, 주소, 휴대폰번호, 직업, 그외 너가 추천하는 사항, 필수로 입력하도록".
   추천 항목 = 보유 주택 · 이용 목적(부동산 서비스에 맞는 두 가지 · 고르기만 · 자유 글 없음).
   주민등록번호는 받지 않는다 — 앞 6자리는 생년월일이므로 화면 · 저장 · 방침 모두 "생년월일"로 다룬다(뒷자리 칸 없음).
   순수 규칙 — 가입 화면 · 설정 카드 · 완성 화면 · API · node:test 가 같이 쓴다(server-only · React 를 import 하지 않는다). */

export const ADDRESS_MAX = 120;

export const JOB_OPTIONS = ["직장인", "공무원", "자영업", "전문직", "프리랜서", "주부", "학생", "은퇴", "구직 중", "기타"] as const;
export const HOUSING_OPTIONS = ["무주택", "1주택", "2주택 이상"] as const;
export const PURPOSE_OPTIONS = ["실거주 매수", "투자", "전월세", "정보 확인"] as const;

export type BasicInfo = {
  birth: string | null;
  address: string | null;
  phone: string | null;
  job: string | null;
  housing: string | null;
  purpose: string | null;
};
export type BasicField = keyof BasicInfo;
export type BasicInfoInput = Partial<Record<BasicField, unknown>>;
export type BasicInfoResult = { ok: true; value: Partial<BasicInfo> } | { ok: false; field: BasicField; error: string };

/** 화면 순서(소유자 지정) — 가입 · 설정 · 완성 화면이 이 순서로 그린다 */
export const BASIC_FIELD_ORDER: readonly BasicField[] = ["birth", "address", "phone", "job", "housing", "purpose"];

export const BASIC_FIELD_LABEL: Record<BasicField, string> = {
  birth: "생년월일 6자리",
  address: "주소",
  phone: "휴대전화",
  job: "직업",
  housing: "보유 주택",
  purpose: "이용 목적",
};

export const BASIC_CHOICES: Partial<Record<BasicField, readonly string[]>> = {
  job: JOB_OPTIONS,
  housing: HOUSING_OPTIONS,
  purpose: PURPOSE_OPTIONS,
};

export const EMPTY_BASIC: BasicInfo = { birth: null, address: null, phone: null, job: null, housing: null, purpose: null };

/** 휴대전화 — 숫자만 남겨 010-1234-5678 꼴로. 빈 값은 null(지움) */
export function normalizePhone(raw: string): string | null | undefined {
  const d = raw.replace(/\D/g, "");
  if (d === "") return null;
  if (!/^01[016789]\d{7,8}$/.test(d)) return undefined;
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 생년월일 6자리(YYMMDD) — 실제 있는 날짜만. 빈 값은 null */
export function normalizeBirth(raw: string): string | null | undefined {
  const d = raw.replace(/\D/g, "");
  if (d === "") return null;
  if (d.length !== 6) return undefined;
  const mm = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return undefined;
  /* 세기는 묻지 않는다 — 월별 최대 일수만 본다(2월은 29일까지) */
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  return dd <= max ? d : undefined;
}

/** 주소 — 줄바꿈 · 연속 공백은 한 칸. 빈 값은 null */
export function normalizeAddress(raw: string): string | null | undefined {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s === "") return null;
  return s.length <= ADDRESS_MAX ? s : undefined;
}

/** 고르기 칸 — 목록에 있는 값만. 빈 값은 null */
export function normalizeChoice(field: BasicField, raw: string): string | null | undefined {
  const s = raw.trim();
  if (s === "") return null;
  return (BASIC_CHOICES[field] ?? []).includes(s) ? s : undefined;
}

const FORMAT_ERROR: Record<BasicField, string> = {
  birth: "생년월일 6자리 확인 · 예 900115",
  address: `주소는 ${ADDRESS_MAX}자 이내`,
  phone: "휴대전화 번호 형식 확인 · 예 010-1234-5678",
  job: "직업 다시 고르기",
  housing: "보유 주택 다시 고르기",
  purpose: "이용 목적 다시 고르기",
};

const MISSING_ERROR: Record<BasicField, string> = {
  birth: "생년월일 6자리 입력 필요",
  address: "주소 입력 필요",
  phone: "휴대전화 번호 입력 필요",
  job: "직업 선택 필요",
  housing: "보유 주택 선택 필요",
  purpose: "이용 목적 선택 필요",
};

function normalizeField(field: BasicField, raw: string): string | null | undefined {
  if (field === "birth") return normalizeBirth(raw);
  if (field === "address") return normalizeAddress(raw);
  if (field === "phone") return normalizePhone(raw);
  return normalizeChoice(field, raw);
}

/** 넘어온 칸만 검사해 돌려준다(없는 칸은 건드리지 않는다) */
export function validateBasicInfo(input: BasicInfoInput): BasicInfoResult {
  const value: Partial<BasicInfo> = {};
  for (const f of BASIC_FIELD_ORDER) {
    const raw = input[f];
    if (typeof raw !== "string") continue;
    const v = normalizeField(f, raw);
    if (v === undefined) return { ok: false, field: f, error: FORMAT_ERROR[f] };
    value[f] = v;
  }
  return { ok: true, value };
}

/** [1138] 필수 — 여섯 칸 모두 있어야 하고 형식이 맞아야 한다(화면 순서대로 첫 문제 칸을 돌려준다) */
export function validateRequiredBasicInfo(input: BasicInfoInput): { ok: true; value: BasicInfo } | { ok: false; field: BasicField; error: string } {
  const value: BasicInfo = { ...EMPTY_BASIC };
  for (const f of BASIC_FIELD_ORDER) {
    const raw = typeof input[f] === "string" ? (input[f] as string) : "";
    const v = normalizeField(f, raw);
    if (v === undefined) return { ok: false, field: f, error: FORMAT_ERROR[f] };
    if (v === null) return { ok: false, field: f, error: MISSING_ERROR[f] };
    value[f] = v;
  }
  return { ok: true, value };
}

/** 저장된 값이 여섯 칸 모두 찼나 — 완성 화면으로 보낼지 정한다 */
export function isBasicInfoComplete(v: Partial<BasicInfo> | null | undefined): boolean {
  if (!v) return false;
  return validateRequiredBasicInfo(v as BasicInfoInput).ok;
}

export function hasAnyBasicInfo(v: Partial<BasicInfo>): boolean {
  return Object.values(v).some((x) => typeof x === "string" && x !== "");
}

/** [1138] 완성 화면으로 보내지 않는 경로 — 완성 화면 자신 · 로그인/가입/로그아웃 · 인증 콜백 · 약관/방침(동의 전에 읽는 곳) · 오프라인 */
export const BASIC_GATE_EXEMPT = ["/my/basic-info", "/login", "/signup", "/logout", "/auth/", "/legal/", "/offline", "/api/"] as const;

export function isBasicGateExempt(pathname: string): boolean {
  return BASIC_GATE_EXEMPT.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}
