/* [1047] 전문가 등록 · 분야 · 인증 마크 · 홍보 — 소유자 지시(2026-10-09):
 *   "전문가 등록하기 기능을 만들고 전문가 카테고리를 추가해서 숨고처럼 전문가 홍보기능도 넣고 싶어"
 *   "변호사, 세무사, 회계사, 설계사, 시공사, 감정평가사, 공인중개사 등 개인, 법인 등 다양한 직업군"
 *   "면허증이나 사업자등록증 등을 추가해서 심사를 통해 관리자가 승인한 사람만 등록 · 인증 마크를 아이디나 게시글에"
 * 변호사는 소유자 선택("변호사 빼고 진행")으로 받지 않는다 — 토스 심사 약속.
 *
 * 잠그는 사실:
 *  ① 직업군 · 사업 형태 · 필요 서류는 분류 체계 한 곳이 정하고, 화면과 서버가 같은 규칙을 쓴다.
 *  ② 첨부는 이 계정 폴더의 경로만 · 사진/PDF · 10MB · 8개. 관리자만 5분 주소로 연다(감사 기록).
 *  ③ 인증 마크는 승인(is_verified)된 프로필만 · 이메일은 화면으로 나가지 않는다.
 *  ④ 홍보: 분야별 목록(정적 8장) · 단지 화면 "이 지역 인증 전문가" · 공유 링크 출처 표시 · 인증 0명이면 noindex.
 *  ⑤ 보관 해제 범위(전문가 목록 · 등록 · 프로필 관리 · 상담함)와 그대로 보관(받은 문의).
 *  ⑥ 운영 DB 변경은 원장과 같은 바이트 · 버킷 비공개. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  BUSINESS_FORMS,
  DOC_KINDS,
  EXPERT_TYPES,
  QUOTE_CATEGORIES,
  allowedBusinessForms,
  expertBadgeText,
  findBusinessForm,
  findExpertType,
  missingDocsMessage,
  requiredDocKinds,
} from "@/lib/experts/taxonomy";
import { expertDocFolder, parseDocFiles } from "@/lib/experts/document-rules";
import { cleanDocName, docExtForMime, formatDocSize } from "@/lib/experts/doc-limits";
import { nearbyScore, pickNearbyExperts } from "@/lib/experts/nearby-pick";
import { isArchivedPath } from "@/lib/seo/archived-routes";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── ① 분류 체계 ─────────────────────────────────────────────────────────── */

test("직업군 — 세무사 · 회계사 · 감정평가사 · 건축사·설계 · 시공사 · 공인중개사 · 대출상담사 · 기타, 변호사·법무사 없음", () => {
  const labels = EXPERT_TYPES.map((t) => t.label);
  for (const want of ["세무사", "회계사", "감정평가사", "건축사·설계", "시공사", "공인중개사", "대출상담사", "기타 전문가"]) {
    assert.ok(labels.includes(want), want);
  }
  assert.ok(!labels.some((l) => /변호|법무|법률/.test(l)));
  assert.equal(findExpertType("건축사")?.id, "architect", "예전 저장값(건축사)도 찾는다");
  assert.ok(QUOTE_CATEGORIES.includes("회계/재무") && QUOTE_CATEGORIES.includes("설계/인허가"));
});

test("사업 형태 — 개인 · 개인사업자 · 법인, 시공사는 사업자만", () => {
  assert.deepEqual(BUSINESS_FORMS.map((f) => f.id), ["individual", "sole", "corporation"]);
  assert.equal(findBusinessForm("법인")?.id, "corporation");
  assert.deepEqual(allowedBusinessForms("builder"), ["sole", "corporation"]);
  assert.deepEqual(allowedBusinessForms("tax"), ["individual", "sole", "corporation"]);
});

test("필요 서류 — 자격 직업군은 면허·등록증, 사업자는 사업자등록증, 시공사는 사업자등록증", () => {
  assert.deepEqual(requiredDocKinds("tax", "individual"), ["license"]);
  assert.deepEqual(requiredDocKinds("tax", "corporation"), ["license", "business_reg"]);
  assert.deepEqual(requiredDocKinds("builder", "sole"), ["business_reg"]);
  assert.deepEqual(requiredDocKinds("other", "individual"), []);
  assert.equal(missingDocsMessage("tax", "individual", ["license"]), null);
  assert.match(missingDocsMessage("tax", "sole", ["license"]) ?? "", /사업자등록증/);
  assert.match(missingDocsMessage("other", "individual", []) ?? "", /하나 이상/);
  assert.match(missingDocsMessage("builder", "individual", ["business_reg"]) ?? "", /개인사업자 또는 법인/);
  assert.deepEqual(DOC_KINDS.map((d) => d.id), ["license", "business_reg", "other"]);
});

test("인증 마크 문구 — '인증 세무사' · 기타는 '인증 전문가'", () => {
  assert.equal(expertBadgeText("세무사"), "인증 세무사");
  assert.equal(expertBadgeText("시공사"), "인증 시공사");
  assert.equal(expertBadgeText("기타 전문가"), "인증 전문가");
  assert.equal(expertBadgeText(null), "인증 전문가");
});

/* ── ② 첨부 ──────────────────────────────────────────────────────────────── */

test("첨부 폴더 — 이메일 해시(대소문자 무관) · 이메일이 경로에 드러나지 않는다", () => {
  const a = expertDocFolder("Kim@Example.com");
  assert.equal(a, expertDocFolder("kim@example.com "));
  assert.match(a, /^applications\/[0-9a-f]{24}$/);
  assert.ok(!a.includes("example"));
});

test("parseDocFiles — 남의 폴더 · 모르는 종류 · 형식 · 크기 · 개수를 거절하고, 같은 경로는 한 번", () => {
  const me = "me@example.com";
  const ok = { path: `${expertDocFolder(me)}/1-a.pdf`, kind: "license", name: "등록증.pdf", size: 1000, mime: "application/pdf" };
  const r = parseDocFiles([ok, ok], me);
  assert.ok(r.ok && r.files.length === 1);
  assert.equal(parseDocFiles(null, me).ok, true);
  assert.equal(parseDocFiles([{ ...ok, path: `${expertDocFolder("you@example.com")}/1-a.pdf` }], me).ok, false);
  assert.equal(parseDocFiles([{ ...ok, path: `${expertDocFolder(me)}/../x.pdf` }], me).ok, false);
  assert.equal(parseDocFiles([{ ...ok, kind: "passport" }], me).ok, false);
  assert.equal(parseDocFiles([{ ...ok, mime: "image/gif" }], me).ok, false);
  assert.equal(parseDocFiles([{ ...ok, size: 11 * 1024 * 1024 }], me).ok, false);
  assert.equal(parseDocFiles(Array.from({ length: 9 }, (_, i) => ({ ...ok, path: `${expertDocFolder(me)}/${i}.pdf` })), me).ok, false);
});

test("파일 이름 · 확장자 · 크기 표기", () => {
  assert.equal(cleanDocName("../../etc/passwd"), ".. .. etc passwd");
  assert.equal(cleanDocName(""), "첨부");
  assert.equal(docExtForMime("image/jpeg"), "jpg");
  assert.equal(docExtForMime("image/gif"), null);
  assert.equal(formatDocSize(2 * 1024 * 1024), "2.0MB");
  assert.equal(formatDocSize(300), "1KB");
});

test("등록 API — 사업 형태 · 사업자등록번호 · 첨부 요건을 서버에서 다시 본다", () => {
  const src = code("app/api/experts/register/route.ts");
  assert.match(src, /parseDocFiles\(body\.documents, session\.user\.email\)/);
  assert.match(src, /missingDocsMessage\(typeDef\.id, form\.id/);
  assert.match(src, /\\d\{3\}-\?\\d\{2\}-\?\\d\{5\}/);
  assert.match(src, /documentFiles: files\.files/);
});

test("첨부 API — 로그인 필요 · 비공개 버킷 · 사진은 메타데이터 제거 · 관리자 열람은 5분 주소 + 감사 기록", () => {
  const up = code("app/api/experts/documents/route.ts");
  assert.match(up, /status: 401/);
  assert.match(up, /rateLimit\(`expert-doc:\$\{email\}`/);
  const lib = code("lib/experts/documents.ts");
  assert.match(lib, /sniffMimeFromBytes\(raw\)/);
  assert.match(lib, /stripMeta\(raw, sniffed\)/);
  assert.match(lib, /createSignedUrl\(path, EXPERT_DOC_VIEW_TTL_SECONDS\)/);
  assert.match(code("lib/experts/document-rules.ts"), /EXPERT_DOC_VIEW_TTL_SECONDS = 300/);
  const admin = code("app/api/admin/experts/document/route.ts");
  assert.match(admin, /isAdminApiRequest\(\)/);
  assert.match(admin, /action: "expert\.doc_view"/);
  assert.match(admin, /select\("document_files"\)/, "신청서에 붙은 경로만 연다");
});

test("등록 양식 — 첨부 · 사업 형태 · 정책상 받지 않는 직업군 없음", () => {
  const form = read("app/town/experts/apply/ApplyForm.tsx");
  assert.match(form, /\/api\/experts\/documents/);
  assert.match(form, /BUSINESS_FORMS/);
  assert.ok(!/변호사|법무사/.test(code("app/town/experts/apply/ApplyForm.tsx")));
  assert.match(read("app/town/experts/ExpertApplyCta.tsx"), /href="\/town\/experts\/apply"/);
  const freeze = read("scripts/check-toss-review-freeze.mjs");
  assert.match(freeze, /file: "app\/town\/experts\/apply\/ApplyForm\.tsx"/);
  assert.match(freeze, /file: "lib\/experts\/taxonomy\.ts"/);
});

/* ── ③ 인증 마크 ─────────────────────────────────────────────────────────── */

test("인증 마크 조회 — 승인된 프로필만 · 화면으로는 문구와 프로필 id 만", () => {
  const b = code("lib/experts/badges.ts");
  assert.match(b, /\.eq\("is_verified", true\)/);
  assert.match(b, /export type ExpertBadgeInfo = \{ expertId: string; text: string \}/);
});

test("인증 마크가 붙는 자리 — 동네이야기 글·댓글·피드 · 임장노트 상세·댓글·목록 · 공개 프로필 · 마이", () => {
  const sites: Array<[string, RegExp]> = [
    ["app/town/story/[id]/page.tsx", /<ExpertBadge badge=\{authorBadge\} \/>/],
    ["app/town/story/[id]/page.tsx", /expertBadge: expertBadges\.get\(emails\.comments\[c\.id\] \?\? ""\) \?\? null/],
    ["app/town/news/[id]/CommentThread.tsx", /<ExpertBadge badge=\{c\.expertBadge\} \/>/],
    ["app/town/feed-client.tsx", /<ExpertBadge badge=\{card\.authorBadge\} link=\{false\} \/>/],
    ["lib/town/feed.ts", /loadPostAuthorBadges\(visible\.map\(\(p\) => p\.id\)\)/],
    ["app/notes/[id]/page.tsx", /<ExpertBadge badge=\{authorExpertBadge\} \/>/],
    ["app/notes/[id]/NoteComments.tsx", /<ExpertBadge badge=\{c\.expertBadge\} \/>/],
    ["lib/inspection/note-comments.ts", /comments: await withBadges\(rows\)/],
    ["app/notes/notes-feed-client.tsx", /<ExpertBadge badge=\{n\.authorBadge\} \/>/],
    ["app/u/[handle]/page.tsx", /<ExpertBadge badge=\{expertBadge\} \/>/],
    ["app/my/MyHubView.tsx", /<ExpertBadge badge=\{\{ expertId: expert\.expertId, text: expert\.badgeText \}\} \/>/],
  ];
  for (const [f, re] of sites) assert.match(code(f), re, f);
  /* 이메일은 클라이언트 모양에 실리지 않는다 */
  assert.ok(!/authorEmail|author_email/.test(code("app/components/ExpertBadge.tsx")));
});

/* ── ④ 홍보 ─────────────────────────────────────────────────────────────── */

test("이 지역 인증 전문가 — 구 일치 2점 · 시·도 일치 1점 · 0점 제외 · 최대 3명", () => {
  assert.equal(nearbyScore(["서울특별시 송파구"], "송파구", "서울"), 2);
  assert.equal(nearbyScore(["서울특별시 강남구"], "송파구", "서울"), 1);
  assert.equal(nearbyScore(["경기도 성남시"], "송파구", "서울"), 0);
  const all = [
    { id: "a", name: "가", regions: ["서울특별시 강남구"], reviews: 9 },
    { id: "b", name: "나", regions: ["서울특별시 송파구"], reviews: 0 },
    { id: "c", name: "다", regions: ["부산광역시 해운대구"], reviews: 50 },
    { id: "d", name: "라", regions: ["서울특별시 송파구"], reviews: 3 },
    { id: "e", name: "마", regions: ["서울특별시 마포구"], reviews: 1 },
  ];
  assert.deepEqual(pickNearbyExperts(all, "송파구", "서울특별시").map((e) => e.id), ["d", "b", "a"]);
  assert.match(code("app/complex/[id]/page.tsx"), /<NearbyExperts sigungu=\{v\.dong\} city=\{v\.city\} \/>/);
});

test("분야별 목록 — 정적 8장(없는 낱말 404) · 인증된 사람만 · 0명이면 noindex", () => {
  const p = code("app/town/experts/c/[type]/page.tsx");
  assert.match(p, /export const dynamicParams = false;/);
  assert.match(p, /EXPERT_TYPES\.map\(\(t\) => \(\{ type: t\.id \}\)\)/);
  assert.match(p, /e\.isVerified && findExpertType\(e\.category\)\?\.id === id/);
  assert.match(p, /robots: \{ index: false, follow: true \}/);
  const list = code("app/town/experts/page.tsx");
  assert.match(list, /href=\{`\/town\/experts\/c\/\$\{t\.id\}`\}/);
  assert.match(list, /verified > 0 \? base : \{ \.\.\.base, robots: \{ index: false, follow: true \} \}/);
});

test("공유 링크 출처 · 사이트맵은 인증 전문가가 있을 때만 목록·분야·프로필", () => {
  assert.match(code("app/town/experts/[id]/page.tsx"), /utm_source=expert&utm_medium=share/);
  assert.match(code("app/my/expert-profile/page.tsx"), /utm_source=expert&utm_medium=profile/);
  const sm = code("lib/seo/build-sitemap.ts");
  assert.match(sm, /if \(verified\.length === 0\) return always;/);
  assert.ok(!/\{ path: "\/town\/experts", priority/.test(sm), "정적 목록에서 뺐다(0명이면 noindex)");
  assert.match(code("lib/seo/sitemap-sections.ts"), /entries\.push\(\.\.\.\(await loadExpertEntries\(\)\)\)/);
});

test("승인 → 목록 · 프로필 · 분야 8장 · 단지 화면 캐시를 비운다", () => {
  const r = code("app/api/admin/experts/route.ts");
  assert.match(r, /for \(const t of EXPERT_TYPES\) revalidatePath\(`\/town\/experts\/c\/\$\{t\.id\}`\)/);
  assert.match(r, /revalidateTag\("verified-experts"\)/);
});

/* ── ⑤ 보관 해제 범위 ───────────────────────────────────────────────────── */

test("보관 해제 — 전문가 목록 · 등록 · 프로필 관리 · 상담함 / 그대로 보관 — 받은 문의 · 제휴 · 쪽지", () => {
  for (const p of ["/town/experts", "/town/experts/apply", "/town/experts/c/tax", "/my/expert-profile", "/my/consultations"]) {
    assert.equal(isArchivedPath(p), false, p);
  }
  for (const p of ["/my/leads", "/partners", "/messages"]) assert.equal(isArchivedPath(p), true, p);
  const nav = read("app/components/nav-data.ts");
  assert.match(nav, /\{ label: "전문가 찾기", href: "\/town\/experts" \}/);
});

/* ── ⑥ 운영 DB ──────────────────────────────────────────────────────────── */

test("1047 마이그레이션 — 원장과 같은 바이트 · 비공개 버킷 · 사업 형태 제약", () => {
  const sql = read("supabase/migrations/20261009001404_1047_expert_registration_documents.sql");
  assert.equal(createHash("md5").update(sql).digest("hex"), "dd782ac80c819a14d0670fe322a9b901");
  assert.equal(sql.endsWith("\n"), false);
  assert.match(sql, /values \('expert-docs', 'expert-docs', false, 10485760/);
  assert.match(sql, /applicant_kind in \('individual', 'sole', 'corporation'\)/);
  assert.match(sql, /jsonb_array_length\(document_files\) <= 8/);
});
