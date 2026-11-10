/* [1135 · 기본 정보] 소유자 2026-11-10 "회원가입 시 연락처, 주민번호 앞자리, 주소 등 기본정보도 업데이트할 수 있도록".
   세 칸 모두 **선택**이다. 주민등록번호는 받지 않는다 — 앞 6자리는 생년월일이므로 화면 · 저장 · 방침 모두 "생년월일"로 다룬다(뒷자리 칸 없음).
   순수 규칙 — 가입 화면 · 설정 카드 · API · node:test 가 같이 쓴다(server-only · React 를 import 하지 않는다). */

export const ADDRESS_MAX = 120;

export type BasicInfo = { phone: string | null; birth: string | null; address: string | null };
export type BasicInfoInput = { phone?: unknown; birth?: unknown; address?: unknown };
export type BasicInfoResult = { ok: true; value: Partial<BasicInfo> } | { ok: false; field: keyof BasicInfo; error: string };

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

/** 넘어온 칸만 검사해 돌려준다(없는 칸은 건드리지 않는다) */
export function validateBasicInfo(input: BasicInfoInput): BasicInfoResult {
  const value: Partial<BasicInfo> = {};
  if (typeof input.phone === "string") {
    const v = normalizePhone(input.phone);
    if (v === undefined) return { ok: false, field: "phone", error: "휴대전화 번호 형식 확인 · 예 010-1234-5678" };
    value.phone = v;
  }
  if (typeof input.birth === "string") {
    const v = normalizeBirth(input.birth);
    if (v === undefined) return { ok: false, field: "birth", error: "생년월일 6자리 확인 · 예 900115" };
    value.birth = v;
  }
  if (typeof input.address === "string") {
    const v = normalizeAddress(input.address);
    if (v === undefined) return { ok: false, field: "address", error: `주소는 ${ADDRESS_MAX}자 이내` };
    value.address = v;
  }
  return { ok: true, value };
}

export function hasAnyBasicInfo(v: Partial<BasicInfo>): boolean {
  return Object.values(v).some((x) => typeof x === "string" && x !== "");
}
