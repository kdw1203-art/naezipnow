/**
 * 전문가 분류 체계 — 단일 출처 (953).
 *
 * 953 이전에는 같은 개념이 네 곳에 따로 살았다:
 *   · 신청 폼 유형(ExpertApplyCta TYPES)      공인중개사·세무사·감정평가사·대출상담사·기타
 *   · 목록 필터 칩(EXPERT_SUBCATEGORIES)       매매/투자·감정/시장분석·세무/절세·청약·정비·금융/대출
 *   · 견적 요청 카테고리(QuoteRequest·API)     임장 동행·세무·대출·인테리어
 *   · 자격 검증 출처(verification-sources)     공인중개사·세무사·건축사
 * 서로 어긋나 있었다 — 신청은 받는데 검증 출처가 없는 유형(감정평가사·대출상담사),
 * 검증 출처는 있는데 신청 폼에 없는 유형(건축사), 필터로는 닿을 수 없는 견적
 * 카테고리(인테리어). 여기서 한 번만 정의하고 네 곳이 전부 이 파일을 읽는다.
 *
 * 정책 경계(변경 금지): 법률 서비스(법무사·변호사) 유형은 토스페이먼츠 상점 심사
 * 정책상 유료 입점 불가라 2026-08-12 에 제거됐다. 이 파일에도 넣지 않는다 —
 * scripts/check-toss-review-freeze.mjs 가 신청 폼에서 재유입을 막는다.
 * [1047] 소유자 지시(2026-10-09)로 직업군을 넓혔다 — 회계사 · 시공사 추가, 건축사를 설계사무소까지(라벨 "건축사·설계").
 * 개인 · 개인사업자 · 법인 모두 받는다(BUSINESS_FORMS). 변호사는 소유자 선택으로 계속 받지 않는다.
 */

/* ---------- 전문가 유형(자격) ---------- */

export type ExpertTypeId =
  | "broker"
  | "tax"
  | "accountant"
  | "appraiser"
  | "architect"
  | "builder"
  | "loan"
  | "other";

export type ExpertType = {
  id: ExpertTypeId;
  /** 화면·DB(expert_profiles.category / expert_verification_requests.expert_type)에 저장되는 라벨 */
  label: string;
  /** 짧은 설명 — 신청 폼·목록 설명문 */
  desc: string;
  /** 자격 검증 출처 — 없으면 서류·인터뷰 심사만으로 인증한다(운영정책 §2) */
  source: {
    label: string;
    authority: string;
    verificationUrl: string;
    searchHint: string;
  } | null;
  /** 이 유형만 열리는 권한(중개사 매물 등록 등) */
  extraScope: string | null;
};

export const EXPERT_TYPES: readonly ExpertType[] = [
  {
    id: "broker",
    label: "공인중개사",
    desc: "매매·전월세 시세, 단지 비교, 갈아타기 순서",
    source: {
      label: "한국공인중개사협회",
      authority: "KAR / V-World",
      verificationUrl: "https://www.kar.or.kr",
      searchHint: "개설 등록번호·중개사명으로 등록 상태 확인",
    },
    extraScope: "매물 등록·관리 + 받은 문의(리드) 확인",
  },
  {
    id: "tax",
    label: "세무사",
    desc: "양도세·취득세·종부세·증여 순서",
    source: {
      label: "한국세무사회",
      authority: "KACPTA",
      verificationUrl: "https://www.kacpta.or.kr",
      searchHint: "세무사 등록번호·성명 검색",
    },
    extraScope: null,
  },
  {
    id: "accountant",
    label: "회계사",
    desc: "임대사업·법인 회계, 상속·증여 재무 검토",
    source: {
      label: "한국공인회계사회",
      authority: "KICPA",
      verificationUrl: "https://www.kicpa.or.kr",
      searchHint: "공인회계사 등록번호·성명 조회",
    },
    extraScope: null,
  },
  {
    id: "appraiser",
    label: "감정평가사",
    desc: "감정가·담보가치·시장 분석 리포트",
    source: {
      label: "한국감정평가사협회",
      authority: "KAPA",
      verificationUrl: "https://www.kapanet.or.kr",
      searchHint: "감정평가사 등록번호·성명 검색",
    },
    extraScope: null,
  },
  {
    id: "loan",
    label: "대출상담사",
    desc: "주담대·전세대출 한도·금리 비교",
    /* 대출상담사는 은행연합회 등록 대출모집인 조회로 확인한다 */
    source: {
      label: "대출성 상품 판매대리·중개업자 통합조회",
      authority: "은행연합회 / 금융위",
      verificationUrl: "https://www.loanconsultant.or.kr",
      searchHint: "대출모집인 등록번호·성명 조회",
    },
    extraScope: null,
  },
  {
    id: "architect",
    /* [1047] 설계사무소까지 — 예전 라벨 "건축사"(저장된 값)는 findExpertType 의 부분 일치로 계속 찾힌다 */
    label: "건축사·설계",
    desc: "신축·리모델링·증축·용도변경 설계와 인허가 검토",
    source: {
      label: "대한건축사협회",
      authority: "KIRA",
      verificationUrl: "https://www.kira.or.kr",
      searchHint: "건축사 등록·사무소 검색",
    },
    extraScope: null,
  },
  {
    id: "builder",
    label: "시공사",
    desc: "종합·전문건설, 인테리어 시공 — 리모델링·수리 범위와 견적",
    source: {
      label: "건설산업지식정보시스템",
      authority: "KISCON / 국토교통부",
      verificationUrl: "https://www.kiscon.net",
      searchHint: "건설업 등록번호·상호 조회(소규모 인테리어는 사업자등록증으로 확인)",
    },
    extraScope: null,
  },
  {
    id: "other",
    label: "기타 전문가",
    desc: "인테리어 디자인·이사·임장 동행 등 (서류·인터뷰 심사)",
    source: null,
    extraScope: null,
  },
] as const;

export const EXPERT_TYPE_LABELS = EXPERT_TYPES.map((t) => t.label);

export function findExpertType(labelOrId: string | null | undefined): ExpertType | null {
  const s = (labelOrId ?? "").trim();
  if (!s) return null;
  return (
    EXPERT_TYPES.find((t) => t.id === s || t.label === s) ??
    EXPERT_TYPES.find((t) => s.includes(t.label) || t.label.includes(s)) ??
    null
  );
}

export function isExpertTypeLabel(v: string): boolean {
  return EXPERT_TYPES.some((t) => t.label === v.trim());
}

/* ---------- 전문 분야(상담 주제) ---------- */

export type SpecialtyId =
  | "trade"
  | "appraisal"
  | "tax"
  | "subscription"
  | "remodel"
  | "loan"
  | "escort"
  | "interior"
  | "account"
  | "design";

export type Specialty = {
  id: SpecialtyId;
  label: string;
  /** 프로필의 자유 입력 specialties·category·title 과 느슨하게 매칭할 키워드 */
  match: string[];
  desc: string;
  /** 이 분야를 주로 맡는 유형(신청 폼 추천용) */
  types: ExpertTypeId[];
  /** 견적 요청 카테고리로도 쓰는가 — 중개 알선으로 보이지 않는 범위만 true */
  quotable: boolean;
};

export const SPECIALTIES: readonly Specialty[] = [
  {
    id: "trade",
    label: "매매/투자 상담",
    match: ["매매", "투자", "갈아타기", "중개", "시세"],
    desc: "매수·매도 타이밍, 단지 비교, 갈아타기 순서",
    types: ["broker"],
    quotable: false,
  },
  {
    id: "tax",
    label: "세무/절세",
    match: ["세무", "세금", "절세", "양도", "취득세", "종부세", "증여"],
    desc: "양도세·취득세·종부세 시뮬레이션",
    types: ["tax"],
    quotable: true,
  },
  {
    id: "loan",
    label: "금융/대출",
    match: ["대출", "금융", "담보", "금리", "한도"],
    desc: "주담대·전세대출 한도와 금리 비교",
    types: ["loan", "broker"],
    quotable: true,
  },
  {
    id: "appraisal",
    label: "감정/시장분석",
    match: ["감정", "평가", "시장", "분석", "리포트"],
    desc: "감정가·담보가치·시장 리포트",
    types: ["appraiser"],
    quotable: false,
  },
  {
    id: "subscription",
    label: "청약 전략",
    match: ["청약", "가점", "분양"],
    desc: "가점 계산, 일정, 특별공급 요건",
    types: ["broker", "other"],
    quotable: false,
  },
  {
    id: "remodel",
    label: "정비사업",
    match: ["정비", "재건축", "재개발", "조합", "리모델링"],
    desc: "재건축·재개발 단계, 조합·분양권",
    types: ["broker", "architect"],
    quotable: false,
  },
  {
    id: "escort",
    label: "임장 동행",
    match: ["임장", "동행", "현장"],
    desc: "현장 동행, 체크리스트 점검",
    types: ["broker", "other"],
    quotable: true,
  },
  {
    id: "interior",
    label: "인테리어",
    match: ["인테리어", "리모델링", "시공", "수리"],
    desc: "입주 전 수리·시공 범위와 견적",
    types: ["builder", "architect", "other"],
    quotable: true,
  },
  /* [1047] 회계사 · 설계 직업군의 분야 */
  {
    id: "account",
    label: "회계/재무",
    match: ["회계", "재무", "기장", "임대사업", "법인"],
    desc: "임대사업·법인 장부, 상속·증여 재무 검토",
    types: ["accountant", "tax"],
    quotable: true,
  },
  {
    id: "design",
    label: "설계/인허가",
    match: ["설계", "인허가", "신축", "증축", "용도변경", "건축"],
    desc: "신축·증축·용도변경 설계와 인허가 가능성",
    types: ["architect", "builder"],
    quotable: true,
  },
] as const;

export const SPECIALTY_LABELS = SPECIALTIES.map((s) => s.label);

/** 견적 요청 카테고리 — 숨고형 퍼널. "중개 알선"으로 읽히는 분야는 넣지 않는다. */
export const QUOTE_CATEGORIES = SPECIALTIES.filter((s) => s.quotable).map((s) => s.label);
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export function isQuoteCategory(v: string): boolean {
  return QUOTE_CATEGORIES.includes(v.trim());
}

export function findSpecialty(labelOrId: string | null | undefined): Specialty | null {
  const s = (labelOrId ?? "").trim();
  if (!s) return null;
  return SPECIALTIES.find((x) => x.id === s || x.label === s) ?? null;
}

/** 자유 입력 문자열 묶음(category·title·specialties)에서 분야를 추정한다 */
export function specialtiesOf(haystack: string[]): Specialty[] {
  const text = haystack.join(" ").toLowerCase();
  return SPECIALTIES.filter(
    (s) => text.includes(s.label.toLowerCase()) || s.match.some((m) => text.includes(m.toLowerCase())),
  );
}

/** 프로필에 저장할 분야 라벨 정규화 — 알려진 라벨은 그대로, 나머지는 자유 입력 유지(최대 max) */
export function normalizeSpecialties(input: string[], max = 8): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().slice(0, 20);
    if (!s) continue;
    const known = findSpecialty(s);
    const label = known ? known.label : s;
    if (!out.includes(label)) out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

/* ---------- 응답 시간 안내 ---------- */

export const RESPONSE_TIME_OPTIONS = [
  "보통 3시간 내",
  "보통 당일",
  "보통 1~2일",
  "보통 3일 내",
] as const;

/* ---------- [1047] 사업 형태 · 첨부 서류 ---------- */

export type BusinessFormId = "individual" | "sole" | "corporation";

export const BUSINESS_FORMS: readonly { id: BusinessFormId; label: string; desc: string }[] = [
  { id: "individual", label: "개인", desc: "자격 보유자 · 사무소·법인 소속 포함" },
  { id: "sole", label: "개인사업자", desc: "사업자등록증이 있는 개인 사무소·업체" },
  { id: "corporation", label: "법인", desc: "법인 사업자(주식회사 등)" },
] as const;

export function findBusinessForm(v: string | null | undefined): (typeof BUSINESS_FORMS)[number] | null {
  const s = (v ?? "").trim();
  return BUSINESS_FORMS.find((f) => f.id === s || f.label === s) ?? null;
}

export type DocKind = "license" | "business_reg" | "other";

export const DOC_KINDS: readonly { id: DocKind; label: string; hint: string }[] = [
  { id: "license", label: "자격증·면허·등록증", hint: "예: 중개사무소 개설등록증, 세무사·회계사·감정평가사 등록증, 건축사 자격증, 건설업 등록증" },
  { id: "business_reg", label: "사업자등록증", hint: "개인사업자·법인은 필수" },
  { id: "other", label: "기타 증빙", hint: "경력·재직 증명, 포트폴리오 등" },
] as const;

export function docKindLabel(kind: string): string {
  return DOC_KINDS.find((d) => d.id === kind)?.label ?? "첨부";
}

/** 시공사는 사업자로만 받는다(공사 계약 주체) */
export function allowedBusinessForms(typeId: ExpertTypeId): BusinessFormId[] {
  return typeId === "builder" ? ["sole", "corporation"] : ["individual", "sole", "corporation"];
}

/**
 * 이 유형·형태에서 꼭 내야 하는 서류.
 *  · 자격 조회처가 있는 유형(시공사 제외)은 자격증·등록증
 *  · 개인사업자·법인 · 시공사는 사업자등록증(소규모 인테리어처럼 건설업 등록이 없는 시공사는 사업자등록증만)
 *  · 기타 전문가는 어느 서류든 하나 이상
 */
export function requiredDocKinds(typeId: ExpertTypeId, form: BusinessFormId): DocKind[] {
  const out: DocKind[] = [];
  const t = EXPERT_TYPES.find((x) => x.id === typeId);
  if (t?.source && typeId !== "builder") out.push("license");
  if (form !== "individual" || typeId === "builder") out.push("business_reg");
  return out;
}

/** 첨부 목록이 요건을 채우는가 — 모자라면 사람이 읽는 한 문장, 채우면 null */
export function missingDocsMessage(typeId: ExpertTypeId, form: BusinessFormId, kinds: string[]): string | null {
  if (!allowedBusinessForms(typeId).includes(form)) {
    return "시공사는 개인사업자 또는 법인으로 신청해 주세요.";
  }
  const need = requiredDocKinds(typeId, form).filter((k) => !kinds.includes(k));
  if (need.length > 0) return `${need.map(docKindLabel).join(" · ")} 사진이나 PDF 를 첨부해 주세요.`;
  if (kinds.length === 0) return "자격이나 사업을 확인할 서류를 하나 이상 첨부해 주세요.";
  return null;
}

/** [1047] 인증 마크 문구 — 이름 옆·글 머리에 붙는 짧은 말 */
export function expertBadgeText(category: string | null | undefined): string {
  const t = findExpertType(category);
  return t && t.id !== "other" ? `인증 ${t.label}` : "인증 전문가";
}
