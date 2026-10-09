/* [1052] 전문가 영역 다듬기 — 공개 DTO 화이트리스트 · 이 지역 전문가 시·도 매칭 · 등록·자격번호 형식 ·
 * 법률 서비스(LEGAL_DENY) 서버 차단 · 등록 양식 임시 저장/?type= · 양식 접근성 · 인증 마크 · 자격 칩 인원.
 *
 * 잠그는 사실:
 *  E1 공개 JSON 은 적힌 칸만(검수 메모 없음) · 미인증은 상호·연락처·등록번호 null.
 *  E2 서울 중구 ↔ 부산 중구 · 서울 강서구 ↔ 부산 강서구가 섞이지 않는다 · 정확 > 같은 시·도+구 > 같은 시·도.
 *  E3 "제2024-12345호" · "12345" · "서울-2024-123" 을 받는다 — 화면과 서버가 같은 규칙.
 *  E4 등록 · 수정 · 관리자 생성 라우트가 법률 서비스 직업군을 서버에서 거절한다.
 *  E5 양식 임시 저장(sessionStorage · try/catch · 접수 뒤 지움) · ?type= 미리 고르기 · 분야별 목록 → 등록 링크.
 *  E6 라벨-입력 묶음(htmlFor + useId) · 오류 role="alert".
 *  E7 인증 마크 aria-label · #verification · 폰 40px / 데스크톱 24px 히트.
 *  E9 자격 칩 0명 숨김 · findExpertType 으로 센다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUBLIC_EXPERT_FIELDS,
  VERIFIED_ONLY_FIELDS,
  sanitizeExpertForPublic,
} from "@/lib/experts/public-dto";
import type { UserExpertProfile } from "@/lib/experts/store-db";
import { AMBIGUOUS_DISTRICTS, NEARBY_SCORE, nearbyScore, parseRegion, pickNearbyExperts } from "@/lib/experts/nearby-pick";
import {
  APPLY_DRAFT_KEY,
  CERT_NUMBER_RE,
  expertTypeFromQuery,
  isBlankApplyDraft,
  isValidCertNumber,
  normalizeCertInput,
  parseApplyDraft,
  serializeApplyDraft,
  type ApplyDraft,
} from "@/lib/experts/apply-rules";
import { LEGAL_DENY, LEGAL_DENY_MESSAGE, hasLegalServiceText, isLegalServiceText } from "@/lib/experts/legal-deny";
import { countExpertTypes } from "@/lib/experts/type-counts";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { getAllSido, getSigunguBySido } from "@/lib/national-data/region-codes";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── E1 공개 DTO ─────────────────────────────────────────────────────────── */

function profile(over: Partial<UserExpertProfile> = {}): UserExpertProfile {
  return {
    id: "e1",
    userId: "u-123",
    ownerEmail: "owner@example.com",
    name: "홍길동",
    title: "양도세 상담",
    category: "세무사",
    regions: ["서울특별시 송파구"],
    specialties: ["세무/절세"],
    introduction: "소개",
    consultationFee: 30000,
    reportFee: 0,
    rating: 4.5,
    reviews: 2,
    consultations: 3,
    experience: "8년",
    responseRate: 90,
    responseTime: "보통 당일",
    isVerified: false,
    isPremium: false,
    badge: null,
    gradient: "x",
    organization: "관양세무회계",
    businessForm: "sole",
    contactPhone: "010-1234-5678",
    contactKakao: "https://pf.kakao.com/_abc",
    brokerRegistrationNo: "11-1234",
    verificationCheckedAt: "2026-10-01T00:00:00Z",
    verificationNote: "운영자 메모: 협회 조회 통과",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    ...over,
  };
}

test("E1 공개 DTO — 적힌 칸만 나간다(검수 메모 · 소유자 이메일 · user id · gradient 없음)", () => {
  const pub = sanitizeExpertForPublic(profile({ isVerified: true })) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(pub).sort(), [...PUBLIC_EXPERT_FIELDS].sort());
  for (const k of ["verificationNote", "ownerEmail", "userId", "gradient"]) assert.ok(!(k in pub), k);
  assert.ok(!JSON.stringify(pub).includes("운영자 메모"));
  assert.ok(!JSON.stringify(pub).includes("owner@example.com"));
});

test("E1 공개 DTO — 미인증은 상호·연락처·등록번호·사업 형태·승인일 null, 인증은 그대로", () => {
  const pending = sanitizeExpertForPublic(profile({ isVerified: false })) as unknown as Record<string, unknown>;
  for (const k of VERIFIED_ONLY_FIELDS) assert.equal(pending[k], null, k);
  assert.equal(pending.name, "홍길동");
  const ok = sanitizeExpertForPublic(profile({ isVerified: true }));
  assert.equal(ok.contactPhone, "010-1234-5678");
  assert.equal(ok.contactKakao, "https://pf.kakao.com/_abc");
  assert.equal(ok.organization, "관양세무회계");
  assert.equal(ok.brokerRegistrationNo, "11-1234");
  /* isVerified 가 진짜 true 일 때만 — "true" 문자열 같은 값으로 열리지 않는다 */
  const weird = sanitizeExpertForPublic(profile({ isVerified: "true" as unknown as boolean }));
  assert.equal(weird.contactPhone, null);
  for (const k of ["contactPhone", "contactKakao", "organization", "brokerRegistrationNo"]) {
    assert.ok((VERIFIED_ONLY_FIELDS as readonly string[]).includes(k), k);
  }
});

test("E1 API — 목록 · 상세 · 수정 · 생성 응답이 전부 공개 DTO 를 거친다", () => {
  const list = code("app/api/experts/route.ts");
  assert.match(list, /items = \(await listExperts\(\)\)\.map\(sanitizeExpertForPublic\)/);
  assert.match(list, /expert: sanitizeExpertForPublic\(expert\)/);
  const one = code("app/api/experts/[id]/route.ts");
  assert.match(one, /expert: sanitizeExpertForPublic\(expert\)/);
  assert.match(one, /expert: sanitizeExpertForPublic\(updated\)/);
  assert.ok(!/NextResponse\.json\(\{ expert(?:: (?:expert|updated|prev))? \}/.test(one + list), "원본 프로필을 그대로 싣지 않는다");
  assert.match(code("lib/experts/access.ts"), /export \{ sanitizeExpertForPublic \} from "\.\/public-dto"/);
});

/* ── E2 이 지역 인증 전문가 ──────────────────────────────────────────────── */

test("E2 같은 구 이름 · 다른 시·도는 붙지 않는다(중구 · 강서구 · 충북↔충남)", () => {
  assert.equal(nearbyScore(["부산광역시 중구"], "중구", "서울특별시"), 0);
  assert.equal(nearbyScore(["서울특별시 중구"], "중구", "서울특별시"), NEARBY_SCORE.exact);
  assert.equal(nearbyScore(["부산광역시 강서구"], "강서구", "서울특별시"), 0);
  assert.equal(nearbyScore(["서울 강서구"], "강서구", "서울특별시"), NEARBY_SCORE.exact);
  assert.equal(nearbyScore(["부산광역시 중구"], "중구", "부산광역시"), NEARBY_SCORE.exact);
  /* 예전엔 앞 두 글자 비교라 "충청" = "충청" 이었다 */
  assert.equal(nearbyScore(["충청남도 천안시"], "청주시 흥덕구", "충청북도"), 0);
  assert.equal(nearbyScore(["경상북도 포항시"], "창원시 성산구", "경상남도"), 0);
  /* 경기 광주시 ↔ 광주광역시 */
  assert.equal(nearbyScore(["광주광역시 북구"], "광주시", "경기도"), 0);
  assert.equal(nearbyScore(["경기 광주시"], "광주시", "경기도"), NEARBY_SCORE.exact);
});

test("E2 시·도 없는 활동 지역 — 전국에 하나뿐인 구만 맞춘다, 동명 구(중구 등)는 버린다", () => {
  assert.equal(nearbyScore(["송파구"], "송파구", "서울특별시"), NEARBY_SCORE.exact);
  assert.equal(nearbyScore(["중구"], "중구", "서울특별시"), 0);
  assert.equal(nearbyScore(["강서구"], "강서구", "부산광역시"), 0);
  /* 단지의 시·도를 모를 때도 같다 */
  assert.equal(nearbyScore(["서울특별시 중구"], "중구", ""), 0);
  assert.equal(nearbyScore(["서울특별시 송파구"], "송파구", ""), NEARBY_SCORE.exact);
});

test("E2 단계 — 정확한 지역 > 같은 시·도 + 구가 겹침 > 같은 시·도", () => {
  assert.equal(nearbyScore(["서울특별시 송파구"], "송파구", "서울"), 2, "1047 잠금 그대로");
  assert.equal(nearbyScore(["서울특별시 강남구"], "송파구", "서울"), 1, "1047 잠금 그대로");
  assert.equal(nearbyScore(["경기도 성남시"], "송파구", "서울"), 0, "1047 잠금 그대로");
  assert.equal(nearbyScore(["경기도 성남시"], "성남시 분당구", "경기도"), NEARBY_SCORE.district, "더 넓게 적은 지역");
  assert.equal(nearbyScore(["서울 강남구·서초구"], "강남구", "서울특별시"), NEARBY_SCORE.district, "여러 구를 적은 지역");
  assert.equal(nearbyScore(["경기도 성남시 분당구"], "성남시 분당구", "경기도"), NEARBY_SCORE.exact);
  assert.equal(nearbyScore(["경기도 성남시 수정구"], "성남시 분당구", "경기도"), NEARBY_SCORE.sido);
  assert.ok(NEARBY_SCORE.exact > NEARBY_SCORE.district && NEARBY_SCORE.district > NEARBY_SCORE.sido && NEARBY_SCORE.sido > 0);
  assert.deepEqual(parseRegion("서울특별시 송파구"), { sido: "서울", districts: ["송파"] });

  const all = [
    { id: "busan-jung", name: "가", regions: ["부산광역시 중구"], reviews: 99 },
    { id: "seoul", name: "나", regions: ["서울특별시"], reviews: 50 },
    { id: "wide", name: "다", regions: ["서울 중구·종로구"], reviews: 1 },
    { id: "exact", name: "라", regions: ["서울특별시 중구"], reviews: 0 },
    { id: "bare", name: "마", regions: ["중구"], reviews: 70 },
  ];
  assert.deepEqual(pickNearbyExperts(all, "중구", "서울특별시").map((e) => e.id), ["exact", "wide", "seoul"]);
  /* 1047 잠금 그대로 */
  const legacy = [
    { id: "a", name: "가", regions: ["서울특별시 강남구"], reviews: 9 },
    { id: "b", name: "나", regions: ["서울특별시 송파구"], reviews: 0 },
    { id: "c", name: "다", regions: ["부산광역시 해운대구"], reviews: 50 },
    { id: "d", name: "라", regions: ["서울특별시 송파구"], reviews: 3 },
    { id: "e", name: "마", regions: ["서울특별시 마포구"], reviews: 1 },
  ];
  assert.deepEqual(pickNearbyExperts(legacy, "송파구", "서울특별시").map((e) => e.id), ["d", "b", "a"]);
});

test("E2 동명 구 목록 — 전국 시군구 표에서 이름이 겹치는 구는 전부 AMBIGUOUS_DISTRICTS 에 있다", () => {
  const by = new Map<string, Set<string>>();
  for (const sido of getAllSido()) {
    for (const g of getSigunguBySido(sido)) {
      const last = g.sigungu.split(/\s+/).pop() ?? "";
      if (!last || last === sido) continue;
      const norm = last.length > 2 ? last.replace(/[시군구]$/, "") : last;
      if (!by.has(norm)) by.set(norm, new Set());
      by.get(norm)!.add(sido);
    }
  }
  const dups = [...by.entries()].filter(([, v]) => v.size > 1).map(([k]) => k);
  assert.ok(dups.length >= 5, "표가 비어 있지 않다");
  for (const d of dups) assert.ok(AMBIGUOUS_DISTRICTS.has(d), `동명 구 ${d}`);
  assert.ok(AMBIGUOUS_DISTRICTS.has("광주"), "경기 광주시 ↔ 광주광역시");
});

/* ── E3 등록·자격번호 ──────────────────────────────────────────────────── */

test("E3 등록·자격번호 — 제…호 · 숫자만 · 지역-연도-번호를 받고, 숫자 없는 글자 · 너무 긴 값은 거절", () => {
  assert.equal(CERT_NUMBER_RE.source, String.raw`^제?\s?[0-9A-Za-z가-힣-]{2,20}\s?호?$`);
  for (const ok of ["제2024-12345호", "12345", "서울-2024-123", "제 2024-12345 호", "제11-1234호", "92-가-1234"]) {
    assert.ok(isValidCertNumber(ok), ok);
  }
  for (const bad of ["", "   ", "1", "abc", "제호", "12345!", "1".repeat(23), "12/345"]) {
    assert.ok(!isValidCertNumber(bad), bad);
  }
  assert.equal(normalizeCertInput(" 제 2024-12345 호 "), "제2024-12345호");
});

test("E3 화면과 서버가 같은 규칙 — ApplyForm 의 자체 정규식은 없어지고 등록 API 가 같은 함수로 다시 본다", () => {
  const form = code("app/town/experts/apply/ApplyForm.tsx");
  assert.ok(!/const CERT_NUMBER_RE/.test(form));
  assert.match(form, /isValidCertNumber\(cert\)/);
  const reg = code("app/api/experts/register/route.ts");
  assert.match(reg, /const certNumber = normalizeCertInput\(body\.certNumber\);/);
  assert.match(reg, /certNumber && !isValidCertNumber\(certNumber\)/);
  assert.match(reg, /certNumber: certNumber \|\| null,/);
});

/* ── E4 LEGAL_DENY ───────────────────────────────────────────────────────── */

test("E4 법률 서비스 판정 — 띄어쓰기 · 섞인 문장도 잡고, 받는 직업군은 건드리지 않는다", () => {
  assert.ok(LEGAL_DENY.includes("변호사") && LEGAL_DENY.includes("법무사"));
  for (const bad of ["변호사", "법무사", "법 무 사", "OO법무사사무소", "법무법인 하나", "Lawyer"]) assert.ok(isLegalServiceText(bad), bad);
  for (const t of EXPERT_TYPES) assert.ok(!isLegalServiceText(t.label), t.label);
  for (const ok of ["세무/절세", "공인중개사", "", null, undefined]) assert.ok(!isLegalServiceText(ok), String(ok));
  assert.ok(hasLegalServiceText("세무사", ["세무/절세", "변호사 상담"]));
  assert.ok(!hasLegalServiceText("세무사", ["세무/절세"], null, undefined));
  assert.ok(!/변호사|법무사/.test(LEGAL_DENY_MESSAGE), "거절 문구에 낱말을 다시 적지 않는다");
});

test("E4 서버 차단 — 등록 · 프로필 수정(PATCH) · 관리자 생성(POST)", () => {
  const reg = code("app/api/experts/register/route.ts");
  const deny = reg.indexOf("hasLegalServiceText(expertType, specialties, body.organization, body.businessName)");
  assert.ok(deny > 0, "등록 — 유형 · 전문 분야 · 상호");
  assert.ok(deny < reg.indexOf("isExpertTypeLabel(expertType)"), "라벨 검사보다 먼저");
  const patch = code("app/api/experts/[id]/route.ts");
  assert.match(patch, /hasLegalServiceText\(rawCategory, patch\.title, patch\.specialties, patch\.organization\)/);
  assert.ok(patch.indexOf("hasLegalServiceText(") < patch.indexOf("updateExpert(id, patch)"), "저장 전에 거절");
  assert.match(code("app/api/experts/route.ts"), /hasLegalServiceText\(body\.category, body\.title, body\.specialties, body\.organization\)/);
  for (const f of ["app/api/experts/register/route.ts", "app/api/experts/[id]/route.ts", "app/api/experts/route.ts"]) {
    assert.match(code(f), /code: "legal_service_denied" \}, \{ status: 400 \}/, f);
  }
  /* 등록 양식 소스에는 낱말이 없다(토스 심사 게이트) — 차단 목록 모듈도 부르지 않는다 */
  const form = read("app/town/experts/apply/ApplyForm.tsx");
  assert.ok(!/변호사|법무사/.test(form));
  assert.ok(!form.includes("legal-deny"));
});

/* ── E5 임시 저장 · ?type= ───────────────────────────────────────────────── */

const sampleDraft: ApplyDraft = {
  typeId: "architect",
  formId: "sole",
  name: "홍길동",
  businessName: "내집설계",
  bizNo: "123-45-67890",
  certNumber: "제2024-12345호",
  city: "서울특별시",
  district: "송파구",
  customCity: "",
  specialties: ["설계/인허가"],
  yearsExp: "8",
  bio: "신축·증축 설계와 인허가 검토를 맡습니다.",
  docs: [
    {
      path: "applications/abc/1-a.pdf",
      kind: "license",
      name: "등록증.pdf",
      size: 1000,
      mime: "application/pdf",
      uploadedAt: "2026-10-09T00:00:00Z",
    },
  ],
};

test("E5 임시 저장 — 왕복 · 깨진 값은 새 양식 · 모르는 값은 양식 범위로 깎는다 · 동의는 싣지 않는다", () => {
  assert.deepEqual(parseApplyDraft(serializeApplyDraft(sampleDraft)), sampleDraft);
  assert.equal(parseApplyDraft(null), null);
  assert.equal(parseApplyDraft("{깨짐"), null);
  assert.equal(parseApplyDraft("[1,2]"), null);
  const odd = parseApplyDraft(
    JSON.stringify({
      ...sampleDraft,
      typeId: "lawyer",
      formId: "x",
      city: "평양",
      district: "중구",
      specialties: ["세무/절세", "법률 상담", "세무/절세"],
      bizNo: "12a3",
      yearsExp: "123",
      name: "가".repeat(100),
      agree: true,
      docs: [{ path: "", kind: "license" }, { ...sampleDraft.docs[0], kind: "passport" }, sampleDraft.docs[0], sampleDraft.docs[0]],
    }),
  )!;
  assert.equal(odd.typeId, "tax", "분류 체계 밖 직업군은 기본값");
  assert.equal(odd.formId, "individual");
  assert.equal(odd.city, "서울특별시");
  assert.equal(odd.district, "중구", "서울특별시 중구는 목록에 있다");
  assert.deepEqual(odd.specialties, ["세무/절세"]);
  assert.equal(odd.bizNo, "123");
  assert.equal(odd.yearsExp, "12");
  assert.equal(odd.name.length, 40);
  assert.equal(odd.docs.length, 1);
  assert.ok(!("agree" in odd));
  assert.ok(isBlankApplyDraft({ ...sampleDraft, name: "", businessName: "", bizNo: "", certNumber: "", district: "", specialties: [], yearsExp: "", bio: "", docs: [] }));
  assert.ok(!isBlankApplyDraft(sampleDraft));
  assert.equal(APPLY_DRAFT_KEY, "nz:expert-apply-draft:v1");
});

test("E5 ?type= — 분류 체계의 id · 라벨과 정확히 같을 때만, 정책상 받지 않는 유형 · 부분 일치는 무시", () => {
  assert.equal(expertTypeFromQuery("?type=tax"), "tax");
  assert.equal(expertTypeFromQuery("?type=%EC%84%B8%EB%AC%B4%EC%82%AC"), "tax", "라벨(세무사)");
  assert.equal(expertTypeFromQuery("?type=builder&x=1"), "builder");
  for (const q of ["", "?type=", "?type=lawyer", "?type=attorney", `?type=${encodeURIComponent("변호사")}`, `?type=${encodeURIComponent("세")}`, "?type=건축사"]) {
    assert.equal(expertTypeFromQuery(q), null, q);
  }
});

test("E5 양식 — 저장소 접근은 전부 try 안 · 접수 성공에 지움 · 분야별 목록이 ?type= 으로 연결", () => {
  const form = code("app/town/experts/apply/ApplyForm.tsx");
  const hits = [...form.matchAll(/sessionStorage/g)].map((m) => m.index ?? 0);
  assert.ok(hits.length >= 3, "읽기 · 쓰기 · 지우기");
  for (const i of hits) {
    assert.ok(form.lastIndexOf("try {", i) > form.lastIndexOf("catch", i), `try 밖 접근 @${i}`);
  }
  assert.match(form, /clearDraft\(\);\s*setPhase\("done"\);/);
  assert.match(form, /if \(!restored \|\| phase === "done"\) return;/);
  assert.match(form, /expertTypeFromQuery\(window\.location\.search\)/);
  assert.ok(!form.includes("useSearchParams"), "정적 셸 규칙");
  assert.ok(!/setAgree\(draft/.test(form), "동의는 복원하지 않는다");
  assert.match(code("app/town/experts/c/[type]/page.tsx"), /href=\{`\/town\/experts\/apply\?type=\$\{t\.id\}`\}/);
});

/* ── E6 양식 접근성 ─────────────────────────────────────────────────────── */

test("E6 라벨 — 입력 라벨은 htmlFor(useId) 로 묶이고, 칩 묶음은 role=group + aria-labelledby, 오류는 role=alert", () => {
  const form = code("app/town/experts/apply/ApplyForm.tsx");
  assert.match(form, /const uid = useId\(\);/);
  assert.ok(!/<Label(?![^>]*\b(?:htmlFor|id)=)/.test(form), "이름표 없는 Label 없음");
  const fors = [...form.matchAll(/<Label htmlFor=\{ids\.(\w+)\}/g)].map((m) => m[1]);
  assert.ok(fors.length >= 6, `htmlFor ${fors.length}개`);
  for (const k of fors) {
    assert.match(form, new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid=\\{ids\\.${k}\\}`), `입력 id=${k}`);
  }
  const groups = [...form.matchAll(/<Label id=\{ids\.(\w+)\}/g)].map((m) => m[1]);
  assert.ok(groups.length >= 4, "직업군 · 사업 형태 · 지역 · 전문 분야");
  for (const k of groups) assert.match(form, new RegExp(`role="group" aria-labelledby=\\{ids\\.${k}\\}`), `group ${k}`);
  assert.match(form, /<div role="alert" className="t-sub font-semibold text-danger">/);
  assert.match(form, /<label htmlFor=\{htmlFor\}/);
});

/* ── E7 인증 마크 ───────────────────────────────────────────────────────── */

test("E7 인증 마크 — aria-label 로 인증 상태 · 검증 정보 칸(#verification)으로 · 폰 40px / 데스크톱 24px", () => {
  const b = code("app/components/ExpertBadge.tsx");
  assert.match(b, /href=\{`\/town\/experts\/\$\{badge\.expertId\}#verification`\}/);
  assert.match(b, /aria-label=\{`\$\{badge\.text\} · \$\{VERIFIED_NOTE\} · 검증 정보 보기`\}/);
  assert.match(b, /const VERIFIED_NOTE = "서류 심사 승인 완료";/);
  assert.match(b, /min-h-\[40px\]/);
  assert.match(b, /md:min-h-6/);
  assert.match(b, /-my-2 /, "줄 높이는 예전(24px) 그대로");
  assert.match(b, /<span className="sr-only"> · \{VERIFIED_NOTE\}<\/span>/, "링크 아닌 마크도 상태를 읽힌다");
  assert.ok(!/authorEmail|author_email/.test(b));
  assert.match(code("app/town/experts/[id]/page.tsx"), /<Section title="검증 정보" delay=\{3\} id="verification">/);
});

/* ── E9 자격 칩 ─────────────────────────────────────────────────────────── */

test("E9 직업군 인원 — findExpertType 으로 센다(예전 저장값 · id 저장값 · 모르는 값은 기타)", () => {
  const m = countExpertTypes([
    { category: "건축사" },
    { category: "건축사·설계" },
    { category: "세무사" },
    { category: "tax" },
    { category: "모르는 값" },
    { category: null },
  ]);
  assert.equal(m.get("architect"), 2);
  assert.equal(m.get("tax"), 2);
  assert.equal(m.get("other"), 2);
  assert.equal(m.get("broker"), undefined);
});

test("E9 /town/experts — 0명 자격 칩은 그리지 않고(고른 칩은 남김), 분야 칸 인원도 같은 규칙", () => {
  const c = code("app/town/experts/ExpertsClient.tsx");
  assert.match(c, /const typeCounts = useMemo\(\(\) => countExpertTypes\(items\), \[items\]\);/);
  assert.match(c, /EXPERT_TYPES\.filter\(\(t\) => \(typeCounts\.get\(t\.id\) \?\? 0\) > 0 \|\| filter\.type === t\.id\)/);
  assert.match(c, /\{typeChips\.map\(\(t\) => \(/);
  assert.ok(!/\{EXPERT_TYPES\.map\(\(t\) => \(\s*<button/.test(c), "전 직업군을 그대로 칩으로 깔지 않는다");
  const p = code("app/town/experts/page.tsx");
  assert.match(p, /const verifiedByType = countExpertTypes\(verified\);/);
  assert.ok(!/e\.category\.includes\(t\.label\)/.test(p));
});
