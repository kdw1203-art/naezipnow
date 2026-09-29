/* [1025 · 브리핑] 중개사 브리핑 리포트 — 순수 규칙 잠금: 발행자 줄 · 타입별 표 행 · 해제 신고 요약 · 주소 · 인쇄 CSS · noindex ·
   페이지 배선(채움 파랑 1개 · 쿼리에 사무소 정보 없음 · "시세" 없음 · 보관 라우트 링크 없음).
   [1025b] 다듬기 잠금 — 문서 섹션 4개 · 발행자 띠 · 폼 핵심 2칸 + 담당자 <details> · "PDF 로 저장" 채움 1 + "링크 복사" 텍스트 ·
   폰 하단 바 · /pro 3칸 + 접힌 "문의" · 머리 상태 줄·오른쪽 버튼 없음 · 섹션 점 파랑 하나(CSS) · 학교 칸 규칙.
   [1025c] 대표 그림·결론·손잡이 잠금 — 미니 차트 점·선·막대 기하 · 전세가율 링 · 결론 줄 · 실제 QR(qrcode 서버 전용) · 띠 bg-primary-soft ·
   인쇄 축소 · 표 강조 손잡이 · /pro 견본 미니 문서 + "3단계" 결론 + 채움 파랑 1(머리·폰 바 같은 요소). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BAND_SOURCE_TAIL,
  BRIEF_MINI_MAX,
  BRIEF_MINI_MIN_LINE_POINTS,
  BRIEF_MINI_MONTHS,
  BRIEF_TYPE_MAX,
  EMPTY_PUBLISHER,
  PUBLISHER_MAX,
  PUBLISHER_PLACEHOLDER,
  PUBLISHER_STORAGE_KEY,
  briefConclusion,
  briefMiniSeries,
  briefPathFromComplexPath,
  briefTypeRows,
  cancelledMonthsLabel,
  cancelledSummary,
  countInWindow,
  issuedLabel,
  latestOf,
  localIsoDate,
  miniChartGeometry,
  miniWindowFrom,
  MINI_GEOM,
  nearestSchool,
  publisherLine,
  qrSvgMarkup,
  qrSvgParts,
  ringGeometry,
  schoolDistanceLabel,
  sanitizePublisher,
  shortUrlLabel,
} from "../../lib/brief/model.ts";
import { HIGHLIGHT_ATTR, HIGHLIGHT_CLASS, applyHighlight, readHighlight, writeHighlight } from "../../lib/brief/highlight-store.ts";
import { BRIEF_SAMPLE, PRO_CONCLUSION, PRO_RESULT_LINES, PRO_STEPS } from "../../lib/brief/sample.ts";
import type { HubDeal } from "../../lib/complex/hub-price.ts";

const ROOT = join(import.meta.dirname ?? ".", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const d = (ym: string, day: number | null, man: number, area: number | null, floor: number | null = 5, cancelled = false): HubDeal & { cancelled?: boolean } => ({
  ym,
  day,
  man,
  area,
  floor,
  ...(cancelled ? { cancelled: true } : {}),
});

/* ── 발행자 줄 ───────────────────────────────────────────────────────── */

test("[1025] 발행자 줄 — 있는 칸만 ' · ' 로 잇고, 셋 다 비면 null(화면은 '사무소 정보 입력')", () => {
  assert.equal(publisherLine({ office: "공작공인중개사", agent: "김담당", phone: "010-0000-0000" }), "공작공인중개사 · 김담당 · 010-0000-0000");
  assert.equal(publisherLine({ office: "공작공인중개사", agent: "", phone: "010-0000-0000" }), "공작공인중개사 · 010-0000-0000");
  assert.equal(publisherLine({ office: "  ", agent: "", phone: "" }), null);
  assert.equal(publisherLine(EMPTY_PUBLISHER), null);
  assert.equal(PUBLISHER_PLACEHOLDER, "사무소 정보 입력");
});

test("[1025] 발행자 정리 — 공백 접기·앞뒤 제거·길이 상한·문자열 아닌 값은 빈칸", () => {
  const s = sanitizePublisher({ office: "  공작   공인중개사 ", agent: 12, phone: "0".repeat(50) });
  assert.equal(s.office, "공작 공인중개사");
  assert.equal(s.agent, "");
  assert.equal(s.phone.length, PUBLISHER_MAX.phone);
  assert.deepEqual(sanitizePublisher(null), EMPTY_PUBLISHER);
  assert.deepEqual(sanitizePublisher("x"), EMPTY_PUBLISHER);
});

test("[1025] 발행일 — 'YYYY-MM-DD' 만 '발행 …', 아니면 '발행 —'. 로컬 날짜는 0 채움", () => {
  assert.equal(issuedLabel("2026-09-29"), "발행 2026-09-29");
  assert.equal(issuedLabel(null), "발행 —");
  assert.equal(issuedLabel("2026.09.29"), "발행 —");
  assert.equal(localIsoDate(new Date(2026, 0, 5)), "2026-01-05");
});

/* ── 타입별 표 ───────────────────────────────────────────────────────── */

test("[1025] 타입별 행 — 정수 ㎡(내림)로 묶어 거래 많은 순 최대 4개 · 최근가는 그 타입 가장 최근 계약 · 중앙값은 최근 3개월(달력) · 해제 행 제외", () => {
  const deals = [
    d("202608", 29, 55_000, 38.1, 6),
    d("202608", 10, 54_000, 38.2, 3),
    d("202605", 1, 50_000, 38.0, 2), // 3개월 창(06~08) 밖
    d("202608", 22, 79_500, 50.4, 15),
    d("202607", 3, 74_500, 50.2, 8),
    d("202606", 3, 70_000, 50.1, 8),
    d("202608", 30, 93_000, 60.3, 10),
    d("202609", 2, 99_000, 60.1, 1, true), // 해제 — 최근가·건수에서 빠진다
    d("202608", 1, 12_000, null, 1), // 면적 없음 — 타입 없음
  ];
  const rows = briefTypeRows(deals, "202608");
  assert.deepEqual(
    rows.map((r) => [r.areaM2, r.count]),
    [
      [38, 3],
      [50, 3],
      [60, 1],
    ],
  );
  assert.deepEqual(rows[0].latest, { ym: "202608", day: 29, man: 55_000, floor: 6 });
  assert.equal(rows[0].median3Man, 54_500, "38㎡ 06~08 창은 2건(55,000·54,000) → 중앙 54,500");
  assert.equal(rows[0].median3Count, 2);
  assert.equal(rows[1].median3Man, 74_500);
  assert.equal(rows[2].latest?.man, 93_000, "해제된 9월 거래는 최근가가 아니다");
  assert.equal(rows[2].median3Count, 1);
});

test("[1025] 타입별 행 — 빈 목록·해제만 있는 목록은 [] · nowYm 이 없으면 가장 최근 계약월이 창의 끝 · 상한 BRIEF_TYPE_MAX", () => {
  assert.deepEqual(briefTypeRows([], "202608"), []);
  assert.deepEqual(briefTypeRows([d("202608", 1, 50_000, 84, 1, true)], "202608"), []);
  const rows = briefTypeRows([d("202603", 1, 50_000, 84), d("202601", 1, 40_000, 84)], null);
  assert.equal(rows[0].median3Man, 45_000, "창 끝 = 202603 → 01~03 두 건");
  const many = [59, 84, 101, 114, 134, 150].flatMap((a, i) => Array.from({ length: 6 - i }, (_, k) => d("202608", k + 1, 10_000 * (i + 1), a)));
  assert.equal(BRIEF_TYPE_MAX, 4);
  assert.equal(briefTypeRows(many, "202608").length, 4);
});

/* ── 해제 신고 ──────────────────────────────────────────────────────── */

test("[1025] 해제 요약 — 건수와 계약월(중복 제거·오름차순) · 라벨은 같은 해 달만 잇고 6개월 넘으면 '외 N개월'", () => {
  const s = cancelledSummary([
    d("202602", 1, 1, 84, 1, true),
    d("202601", 1, 1, 84, 1, true),
    d("202601", 9, 1, 84, 1, true),
    d("202608", 1, 1, 84, 1),
  ]);
  assert.deepEqual(s, { count: 3, yms: ["202601", "202602"] });
  assert.equal(cancelledMonthsLabel(s.yms), "2026-01·02");
  assert.equal(cancelledMonthsLabel(["202511", "202601", "202602"]), "2025-11 · 2026-01·02");
  assert.equal(cancelledMonthsLabel([]), "");
  assert.equal(cancelledMonthsLabel(["202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608"]), "2026-01·02·03·04·05·06 외 2개월");
  assert.deepEqual(cancelledSummary([]), { count: 0, yms: [] });
});

/* ── 주소 ───────────────────────────────────────────────────────────── */

test("[1025] 브리핑 주소 — 단지 정규 경로 + /brief(쿼리 없음) · 출처 줄은 프로토콜 없는 짧은 주소", () => {
  assert.equal(briefPathFromComplexPath("/complex/abc"), "/complex/abc/brief");
  assert.equal(briefPathFromComplexPath("/complex/abc/"), "/complex/abc/brief");
  assert.equal(shortUrlLabel("https://naezipnow.com", "/complex/abc/brief"), "naezipnow.com/complex/abc/brief");
  assert.equal(shortUrlLabel("https://naezipnow.com/", "/pro"), "naezipnow.com/pro");
  assert.equal(PUBLISHER_STORAGE_KEY, "nz_brief_publisher_v1");
});

/* ── 소스 잠금 ──────────────────────────────────────────────────────── */

test("[1025] 인쇄 CSS 잠금 — globals.css 에 [1025 · 브리핑] @media print 블록 · .brief-doc 여백·테두리 제거 · 쪽 나눔 방지", () => {
  const css = read("app/globals.css");
  const idx = css.indexOf("[1025 · 브리핑]");
  assert.ok(idx > 0, "append-only 블록 표식");
  const block = css.slice(idx);
  assert.match(block, /@media print \{/);
  assert.match(block, /\.brief-doc \{[^}]*padding: 0 !important/);
  assert.match(block, /\.brief-doc \{[^}]*border: 0 !important/);
  assert.match(block, /break-inside: avoid/);
  assert.match(block, /\.brief-lay \{[^}]*display: block !important/);
  /* 전역 print 규칙이 header·nav·[data-noprint] 를 숨긴다 — 폼·머리·브레드크럼은 data-noprint 로 그 규칙을 탄다 */
  assert.match(css, /@media print \{\s*header,\s*footer,\s*nav,[\s\S]*?\[data-noprint\]/);
  const form = code("app/complex/[id]/brief/BriefPublisherForm.tsx");
  assert.match(form, /data-noprint=""/);
  const page = code("app/complex/[id]/brief/page.tsx");
  assert.ok((page.match(/data-noprint=""/g) ?? []).length >= 2, "브레드크럼·머리도 인쇄에서 뺀다");
  assert.match(page, /className="brief-lay /);
  assert.match(page, /className="brief-doc /);
});

test("[1025] noindex 잠금 — 브리핑은 index:false · /pro 는 canonical 만(noindex 아님) · 사이트맵에 /pro 만", () => {
  const page = code("app/complex/[id]/brief/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.match(page, /export const revalidate = 604_800/);
  assert.match(page, /export function generateStaticParams/);
  const pro = code("app/pro/page.tsx");
  assert.match(pro, /seoAlternates\("\/pro"\)/);
  assert.doesNotMatch(pro, /index: false/);
  const sitemap = code("lib/seo/build-sitemap.ts");
  assert.match(sitemap, /path: "\/pro"/);
  assert.doesNotMatch(sitemap, /\/brief/);
});

test("[1025] 페이지 배선 — 채움 파랑 1개(폼 인쇄 버튼) · window.print · 링크 복사는 정규 주소만(사무소 정보 없음) · '시세' 없음 · 보관 라우트 링크 없음", () => {
  const page = code("app/complex/[id]/brief/page.tsx");
  const form = code("app/complex/[id]/brief/BriefPublisherForm.tsx");
  const line = code("app/complex/[id]/brief/BriefPublisherLine.tsx");
  const store = code("lib/brief/publisher-store.ts");
  assert.equal((page.match(/btn-primary/g) ?? []).length, 0);
  assert.equal((form.match(/btn-primary/g) ?? []).length, 1);
  assert.match(form, /window\.print\(\)/);
  assert.match(form, /new URL\(sharePath, window\.location\.origin\)/);
  assert.doesNotMatch(form, /searchParams|\?office|office=/);
  assert.match(store, /localStorage/);
  assert.doesNotMatch(store, /fetch\(|document\.cookie/);
  for (const src of [page, form, line]) {
    assert.doesNotMatch(src, /시세/);
    assert.doesNotMatch(src, /href="\/widget|href="\/partners/);
  }
  /* 서버 재료 — 단지 상세와 같은 로더(해제 포함 목록·전세가율 규칙·관리비·POI) */
  const load = code("app/complex/[id]/brief/load.ts");
  assert.match(load, /getComplexDeals\(row\.canonical_id, \{ includeCancelled: true \}\)/);
  assert.match(load, /buildComplexFacts\(/);
  assert.match(load, /getComplexMgmtFeeSummary\(/);
  assert.match(load, /getNearbyPoi\(/);
  assert.match(page, /<ComplexOverviewStrip row=\{row\} \/>/);
});

test("[1025] /pro 배선 — PageHead + 3칸 + OfficeLeadForm(/api/support) · 채움 파랑은 폼 하나 · 권유문 없음 · 보관 라우트 링크 없음", () => {
  const pro = code("app/pro/page.tsx");
  assert.match(pro, /<PageHead/);
  assert.match(pro, /md:grid-cols-3/);
  assert.match(pro, /grid grid-cols-1 gap-3 md:grid-cols-3/);
  assert.match(pro, /<OfficeLeadForm/);
  /* [1025c] 채움 파랑 리터럴 1 — 머리 "브리핑 만들기"(폰 바는 같은 요소) */
  assert.equal((pro.match(/btn-primary/g) ?? []).length, 1);
  assert.match(pro, /무료 · 베타/);
  assert.doesNotMatch(pro, /href="\/widget|href="\/partners/);
  assert.doesNotMatch(pro, /지금 시작|시작하세요|시작하기|무료로 시작|더 알아보기|자세히 알아보기|지금 바로/);
  const form = code("app/widget/OfficeLeadForm.tsx");
  assert.equal((form.match(/btn-primary|bg-primary /g) ?? []).length, 1);
  assert.match(form, /fetch\("\/api\/support"/);
  assert.match(form, /subjectPrefix = "\[중개사 위젯\]"/, "기본값은 예전 그대로 — /widget 은 안 바뀐다");
  const picker = code("app/pro/ProBriefPicker.tsx");
  assert.match(picker, /briefPathFromComplexPath\(complexHrefFromId\(c\.id\)\)/);
});

/* ── [1025b] 다듬기 ─────────────────────────────────────────────────── */

test("[1025b] 학교 칸 — 가장 가까운 초등학교, 없으면 가장 가까운 학교, 비면 null(칸을 그리지 않는다) · 거리 라벨은 m/km + 도보 분(80m/분·최소 1분)", () => {
  const s = (name: string, category: string | null, distanceM: number) => ({ name, category, distanceM });
  assert.equal(nearestSchool([]), null);
  assert.equal(nearestSchool([s("a중", "중학교", 100), s("b초", "초등학교", 900), s("c초", "초등학교", 400)])?.name, "c초");
  assert.equal(nearestSchool([s("a중", "중학교", 300), s("b고", "고등학교", 100)])?.name, "b고");
  assert.equal(nearestSchool([s("x", "초등학교", Number.NaN)]), null);
  assert.equal(schoolDistanceLabel(350), "350m · 도보 4분");
  assert.equal(schoolDistanceLabel(1240), "1.2km · 도보 16분");
  assert.equal(schoolDistanceLabel(20), "20m · 도보 1분");
});

test("[1025b] 문서 구조 — 섹션 4개(개요·타입별 표·전세가율/갭/관리비·주의/출처) · 발행자 띠가 맨 위 · 학교는 값 있을 때만 한 칸 더 · 머리 상태 줄 없음 · 내부 용어 없음", () => {
  const page = code("app/complex/[id]/brief/page.tsx");
  const doc = page.slice(page.indexOf('className="brief-doc '), page.indexOf("</article>"));
  const ids = [...doc.matchAll(/<section aria-labelledby="([a-z-]+)"/g)].map((m) => m[1]);
  /* [1025c] 미니 차트 섹션이 개요 앞에 하나 더 */
  assert.deepEqual(ids, ["brief-minis-title", "brief-overview-title", "brief-types-title", "brief-ratio-title", "brief-notice-title"]);
  assert.ok(doc.indexOf("<BriefPublisherLine />") < doc.indexOf("<h2"), "발행자 띠가 단지명보다 앞");
  assert.match(doc, /school \? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"/);
  assert.match(doc, /\{school && <Cell/);
  assert.doesNotMatch(doc, /"— m · 도보 —"/, "학교 없음은 칸을 그리지 않는다");
  assert.equal((page.match(/<SectionHead\s/g) ?? []).length, 5, "섹션 제목 한 모양([1025c] 미니 차트 +1)");
  assert.doesNotMatch(page, /facts=\{/, "머리 아래 상태 줄 없음");
  assert.equal((page.match(/<Link [^>]*className="btn-secondary/g) ?? []).length, 1, "머리 오른쪽 버튼 1");
  assert.doesNotMatch(page, /POI|kapt_code|K-apt \$\{/, "내부 용어·코드는 화면에 없다");
  assert.match(page, /매물 호가 아님 · 투자 권유 아님 · 현장 확인 후 판단/);
  assert.equal((page.match(/투자 권유 아님/g) ?? []).length, 1, "면책 한 줄 한 번");
  const line = code("app/complex/[id]/brief/BriefPublisherLine.tsx");
  assert.match(line, /className="brief-band /);
  assert.match(line, /-mx-4 -mt-4/);
});

test("[1025b] 폼 — 사무소명·연락처 2칸 앞, 담당자는 <details> 안 · 'PDF 로 저장' 채움 1 + '링크 복사' 텍스트 버튼(btn-secondary 아님) · 폰 하단 바", () => {
  const form = code("app/complex/[id]/brief/BriefPublisherForm.tsx");
  const office = form.indexOf('field("office"');
  const phone = form.indexOf('field("phone"');
  const details = form.indexOf("<details");
  const agent = form.indexOf('field("agent"');
  assert.ok(office > 0 && phone > office && details > phone && agent > details, "순서: 사무소명 → 연락처 → <details> → 담당자");
  assert.ok(agent < form.indexOf("</details>"));
  assert.match(form, />\s*PDF 로 저장\s*</);
  assert.doesNotMatch(form, /PDF 로 저장 \(인쇄\)/);
  assert.doesNotMatch(form, /btn-secondary/);
  assert.match(form, /text-primary max-lg:min-h-12"\s*>\s*<Icon name="link"/, "링크 복사는 텍스트 버튼");
  assert.match(form, /className="brief-actions /);
  assert.match(form, /<MobilePrimaryBar label="PDF 로 저장">\{actions\}<\/MobilePrimaryBar>/, "폰 하단 바는 공용 부품 · 같은 요소");
  assert.match(form, /<div className="max-lg:hidden">\{actions\}<\/div>/);
  assert.match(form, /className="card rounded-2xl p-4 max-md:p-3\.5"/);
});

test("[1025b] /pro — 3칸 카드 한 규격 + 접힌 <details> '문의'(OfficeLeadForm 안) · 머리 오른쪽 버튼·상태 줄 없음 · 섹션 점 파랑 하나(CSS)", () => {
  const pro = code("app/pro/page.tsx");
  /* [1025c] 머리 오른쪽은 "브리핑 만들기" 하나(lg+) — 상태 줄은 여전히 없다 */
  assert.match(pro, /actions=\{<div className="max-lg:hidden">\{cta\}<\/div>\}/);
  assert.doesNotMatch(pro, /facts=\{/);
  assert.match(pro, /const CARD = "card rounded-2xl p-4 max-md:p-3\.5"/);
  assert.equal((pro.match(/className=\{CARD\}/g) ?? []).length, 3);
  const details = pro.indexOf("<details");
  assert.ok(details > 0 && pro.indexOf("<OfficeLeadForm") > details && pro.indexOf("</details>") > pro.indexOf("<OfficeLeadForm"));
  assert.doesNotMatch(pro, /<details[^>]*open/, "처음 화면은 접힌 채");
  assert.match(pro, /<summary[^>]*>\s*<h2 className="t-section text-ink">문의<\/h2>/);
  assert.match(pro, /className="pro-lay /);
  const css = read("app/globals.css");
  const idx = css.indexOf("[1025b · 브리핑]");
  assert.ok(idx > css.indexOf("[1025 · 브리핑]"), "append-only 블록");
  const block = css.slice(idx);
  assert.match(block, /\.brief-doc section,\s*\.pro-lay section \{\s*--lq-dot: var\(--lq-blue\);/);
  assert.match(block, /main \.pro-lay details > summary > \.t-section::before/);
  assert.match(block, /@media print \{[\s\S]*\.brief-doc \.brief-band \{[^}]*background: transparent !important/);
});

/* ── [1025c] 대표 그림 · 결론 · 손잡이 ─────────────────────────────────── */

test("[1025c] 미니 차트 점 — 창(끝 달 포함 12개월) 안 실거래 한 건이 점 하나 · fx 는 달+일 · fy 는 최저 0~최고 1 · 마지막이 latest · 해제·창 밖 제외", () => {
  assert.equal(miniWindowFrom("202608"), "202509");
  assert.equal(miniWindowFrom("202601", 3), "202511");
  const deals = [
    d("202608", 29, 55_000, 38.1, 6),
    d("202606", 1, 50_000, 38.2, 3),
    d("202509", 1, 45_000, 38.0, 2), // 창 첫 달 — 들어간다
    d("202508", 31, 99_000, 38.0, 2), // 창 밖
    d("202608", 30, 60_000, 38.0, 2, true), // 해제 — 점 아님
    d("202608", 22, 79_500, 50.4, 15),
    d("202607", 3, 74_500, 50.2, 8),
  ];
  const [s38, s50, s60] = briefMiniSeries(deals, [38, 50, 60], "202608");
  assert.equal(s38.count, 3);
  assert.deepEqual(
    s38.points.map((p) => [p.ym, p.man, p.latest]),
    [
      ["202509", 45_000, false],
      ["202606", 50_000, false],
      ["202608", 55_000, true],
    ],
  );
  assert.equal(s38.minMan, 45_000);
  assert.equal(s38.maxMan, 55_000);
  assert.equal(s38.points[0].fy, 0, "최저 → 0");
  assert.equal(s38.points[2].fy, 1, "최고 → 1");
  assert.equal(s38.points[1].fy, 0.5);
  assert.ok(Math.abs(s38.points[0].fx - 0 / 12) < 1e-9, "창 첫 달 1일 → 0");
  assert.ok(Math.abs(s38.points[2].fx - (11 + 28 / 31) / 12) < 1e-9, "끝 달 29일");
  assert.equal(s38.line.length, 3, "점 3개 → 월 중앙값 선(월 3개)");
  assert.equal(s50.count, 2);
  assert.equal(s50.line.length, 0, "점 2개는 잇지 않는다");
  assert.equal(s50.points[1].latest, true);
  assert.equal(s50.points[0].fy, 0);
  assert.equal(s60.count, 0);
  assert.deepEqual(s60.points, []);
  assert.equal(s60.minMan, null);
  assert.equal(BRIEF_MINI_MIN_LINE_POINTS, 3);
  assert.equal(BRIEF_MINI_MAX, 3);
  assert.equal(BRIEF_MINI_MONTHS, 12);
  /* 한 값뿐이면 가운데 · 상한 · 창 끝이 없으면 가장 최근 계약월 */
  assert.equal(briefMiniSeries([d("202608", 1, 50_000, 84)], [84], "202608")[0].points[0].fy, 0.5);
  assert.equal(briefMiniSeries(deals, [38, 50, 60, 84], "202608").length, 3);
  assert.equal(briefMiniSeries(deals, [38], null)[0].count, 3, "nowYm 없음 → 202608 이 끝");
  assert.deepEqual(briefMiniSeries([], [38], null), []);
});

test("[1025c] 미니 차트 선 — 같은 달 여러 건은 월 중앙값 한 점(시안 miniType 기하: 120×36 · 여백 4 · 기준선 24 · 막대 30)", () => {
  const deals = [d("202606", 1, 40_000, 84), d("202606", 20, 60_000, 84), d("202607", 5, 50_000, 84), d("202608", 9, 70_000, 84)];
  const [s] = briefMiniSeries(deals, [84], "202608");
  assert.equal(s.points.length, 4);
  assert.equal(s.line.length, 3, "월 3개");
  assert.equal(s.line[0].fy, (50_000 - 40_000) / 30_000, "6월 두 건(4·6만) 중앙 5만");
  const g = miniChartGeometry(s, 8);
  assert.deepEqual([g.w, g.h], [MINI_GEOM.w, MINI_GEOM.h]);
  assert.deepEqual(g.baseline, { x1: 4, y1: 24, x2: 116, y2: 24 });
  assert.equal(g.dots.length, 4);
  assert.equal(g.dots[3].latest, true);
  assert.equal(g.dots[3].cy, 4, "최고가 → 위 4");
  assert.equal(g.dots[0].cy, 20, "최저가 → 4 + 16");
  assert.deepEqual(g.bar, { x: 4, y: 30, width: 56, height: 4 }, "건수 4/8 → 폭 절반");
  assert.equal(g.polyline.split(" ").length, 3);
  const two = miniChartGeometry({ points: s.points.slice(0, 2), line: [], count: 2 }, 0);
  assert.equal(two.polyline, "", "선 없음");
  assert.equal(two.bar.width, 0, "분모 0 → 폭 0");
});

test("[1025c] 전세가율 링 — r 26 · 둘레 2πr · dash = 둘레 × %/100 · 0~100 으로 자름 · null 은 궤도만(dash 0)", () => {
  const g = ringGeometry(46.5);
  assert.equal(g.r, 26);
  assert.equal(g.c, 163.36);
  assert.equal(g.dash, Math.round(((163.36 * 46.5) / 100) * 100) / 100);
  assert.equal(g.value, 46.5);
  assert.deepEqual(ringGeometry(null), { r: 26, c: 163.36, dash: 0, value: null });
  assert.equal(ringGeometry(150).value, 100);
  assert.equal(ringGeometry(150).dash, 163.36);
  assert.equal(ringGeometry(-3).dash, 0);
  assert.equal(ringGeometry(Number.NaN).value, null);
});

test("[1025c] 결론 줄 — '최근 12개월 매매 N건 · 최근 {가격} · 전세가율 {%}' · 없는 조각은 빠짐 · 셋 다 없으면 null · 창 건수·최근 계약", () => {
  assert.equal(briefConclusion({ count12: 152, latestLabel: "5억 5,000만", jeonsePct: 46.5 }), "최근 12개월 매매 152건 · 최근 5억 5,000만 · 전세가율 46.5%");
  assert.equal(briefConclusion({ count12: 0, latestLabel: null, jeonsePct: null }), "최근 12개월 매매 0건");
  assert.equal(briefConclusion({ count12: null, latestLabel: "3억", jeonsePct: null }), "최근 3억");
  assert.equal(briefConclusion({ count12: null, latestLabel: null, jeonsePct: null }), null);
  assert.equal(briefConclusion({ count12: 1234, latestLabel: null, jeonsePct: 40 }), "최근 12개월 매매 1,234건 · 전세가율 40%");
  assert.doesNotMatch(briefConclusion({ count12: 5, latestLabel: null, jeonsePct: null }) ?? "", /—|\(\)/);
  const deals = [d("202608", 29, 55_000, 38), d("202509", 1, 45_000, 38), d("202508", 1, 40_000, 38), d("202609", 2, 99_000, 60, 1, true)];
  assert.equal(countInWindow(deals, "202608"), 2, "202509~202608 두 건 · 해제 제외");
  assert.equal(countInWindow([], "202608"), 0);
  assert.equal(countInWindow(deals, null), 2, "창 끝 = 가장 최근 계약월(해제 제외)");
  assert.equal(latestOf(deals)?.man, 55_000, "해제된 9월 거래는 최근 계약이 아니다");
});

test("[1025c] QR 문자열 — qrSvgMarkup 은 <svg …>…</svg> 만 받아 role/aria-label 을 달고, 아니면 null · qrSvgParts 는 viewBox·안쪽만", () => {
  const raw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h29v29H0z"/></svg>';
  const m = qrSvgMarkup(raw, "QR · 단지 화면");
  assert.ok(m?.startsWith('<svg role="img" aria-label="QR · 단지 화면" xmlns='));
  assert.ok(m?.endsWith("</svg>"));
  assert.equal(qrSvgMarkup("", "x"), null);
  assert.equal(qrSvgMarkup("<div>hi</div>", "x"), null);
  assert.equal(qrSvgMarkup("<svg>", "x"), null);
  assert.doesNotMatch(qrSvgMarkup(raw, 'a"b<c>') ?? "", /"b<c>/, "라벨의 따옴표·꺾쇠는 뺀다");
  const parts = qrSvgParts(raw);
  assert.equal(parts?.viewBox, "0 0 29 29");
  assert.equal(parts?.inner, '<path fill="#fff" d="M0 0h29v29H0z"/>');
  assert.equal(qrSvgParts("<svg><path/></svg>"), null, "viewBox 없으면 못 앉힌다");
  assert.equal(qrSvgParts(null), null);
});

test("[1025c] QR 실물 — qrcode 패키지가 있으면 단지 주소를 SVG 문자열로(viewBox · path) · 서버 전용 lib/brief/qr.ts 가 감싼다", async () => {
  let mod: { toString: (text: string, opts: object) => Promise<string> } | null = null;
  try {
    mod = (await import("qrcode")).default as typeof mod;
  } catch {
    mod = null;
  }
  assert.ok(mod, "qrcode 의존성(package.json dependencies)");
  const svg = await mod!.toString("https://naezipnow.com/complex/abc", { type: "svg", margin: 0 });
  assert.match(svg, /^<svg[^>]*viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path /);
  assert.doesNotMatch(svg, /width="\d+"/, "크기는 CSS 가 정한다(viewBox 만)");
  assert.ok(qrSvgMarkup(svg, "QR"));
  assert.ok(qrSvgParts(svg));
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  assert.ok(pkg.dependencies.qrcode, "런타임 의존성");
  assert.ok(pkg.devDependencies["@types/qrcode"], "타입은 dev");
  const qr = code("lib/brief/qr.ts");
  assert.match(qr, /^import "server-only";/m);
  assert.match(qr, /from "qrcode"/);
  assert.match(qr, /type: "svg", margin: 0/);
  /* 클라이언트 파일은 qrcode 를 import 하지 않는다 */
  for (const f of ["app/complex/[id]/brief/BriefPublisherForm.tsx", "app/complex/[id]/brief/BriefPublisherLine.tsx", "app/complex/[id]/brief/BriefHighlightBridge.tsx", "app/pro/ProBriefPicker.tsx"]) {
    const src = code(f);
    assert.match(src, /^"use client";/m);
    assert.doesNotMatch(src, /qrcode|lib\/brief\/qr/);
  }
  const page = code("app/complex/[id]/brief/page.tsx");
  assert.match(page, /briefQrSvg\(`\$\{DEFAULT_DESKTOP_ORIGIN\}\$\{complexPath\}`\)/, "QR 은 단지 상세 주소");
  assert.match(page, /\{qr && <div className="brief-qr [^"]*" dangerouslySetInnerHTML=\{\{ __html: qr \}\} \/>\}/);
  assert.match(page, /\{qr && " · QR 로 단지 화면"\}/, "QR 이 없으면 주소 텍스트만(1025 원래 상태)");
});

test("[1025c] 표 강조 손잡이 — 폼 칩(types) → highlight-store 이벤트 → 문서의 data-brief-area 요소에 brief-hl 클래스 · null 은 첫 타입 · 라벨 갱신", () => {
  type FakeEl = { attrs: Record<string, string>; classes: Set<string>; textContent: string; getAttribute: (k: string) => string | null; classList: { toggle: (c: string, on: boolean) => void } };
  const el = (attrs: Record<string, string>): FakeEl => {
    const e: FakeEl = {
      attrs,
      classes: new Set(),
      textContent: "",
      getAttribute: (k) => attrs[k] ?? null,
      classList: { toggle: (c, on) => (on ? e.classes.add(c) : e.classes.delete(c)) },
    };
    return e;
  };
  const targets = [el({ [HIGHLIGHT_ATTR]: "38" }), el({ [HIGHLIGHT_ATTR]: "50" }), el({ [HIGHLIGHT_ATTR]: "38" })];
  const label = el({});
  const root = { querySelectorAll: (sel: string) => (sel.includes(HIGHLIGHT_ATTR) ? targets : [label]) } as unknown as ParentNode;
  assert.equal(applyHighlight(root, 50), 50);
  assert.deepEqual(targets.map((t) => t.classes.has(HIGHLIGHT_CLASS)), [false, true, false]);
  assert.equal(label.textContent, "50㎡ 강조");
  assert.equal(applyHighlight(root, null), 38, "null → 첫 타입");
  assert.deepEqual(targets.map((t) => t.classes.has(HIGHLIGHT_CLASS)), [true, false, true], "미니 카드·표 행 둘 다");
  assert.equal(applyHighlight(root, 84), 38, "없는 타입 → 첫 타입");
  assert.equal(applyHighlight({ querySelectorAll: () => [] } as unknown as ParentNode, 38), null);
  writeHighlight(50);
  assert.equal(readHighlight(), 50);
  writeHighlight(null);
  assert.equal(readHighlight(), null);
  assert.equal(HIGHLIGHT_CLASS, "brief-hl");
  /* 배선 — 폼은 types 로 칩을, 문서는 첫 타입을 강조한 채 보내고 다리가 옮긴다 */
  const form = code("app/complex/[id]/brief/BriefPublisherForm.tsx");
  assert.match(form, /types\?: readonly number\[\]/);
  assert.match(form, /role="radiogroup" aria-labelledby="brief-hl-title"/);
  assert.match(form, /writeHighlight\(area\)/);
  assert.match(form, /표 강조 타입/);
  assert.equal((form.match(/btn-primary/g) ?? []).length, 1, "칩은 채움 파랑이 아니다");
  const page = code("app/complex/[id]/brief/page.tsx");
  assert.match(page, /<BriefPublisherForm sharePath=\{briefPath\} types=\{typeAreas\} \/>/);
  assert.match(page, /<BriefHighlightBridge scope="\.brief-doc" \/>/);
  assert.match(page, /const hlArea = typeAreas\[0\] \?\? null;/);
  assert.match(page, /<span data-brief-hl-label="">\{hlArea\}㎡ 강조<\/span>/);
  assert.match(page, /<tr key=\{r\.areaM2\} \{\.\.\.hlAttrs\(r\.areaM2\)\} className=\{`[^`]*\$\{hlClass\(r\.areaM2\)\}`\}>/);
  assert.match(page, /className=\{`brief-mini [^`]*\$\{hlClass\(m\.areaM2\)\}`\}/);
});

test("[1025c] 문서 — 띠 bg-primary-soft(발행자 줄 + '내집나우 실거래 기준') · 요약 띠(t-display t-num · 링 · 결론) · 미니 3(빈 상태는 회색 윤곽) · 값은 로더 것만", () => {
  const line = code("app/complex/[id]/brief/BriefPublisherLine.tsx");
  assert.match(line, /className="brief-band [^"]*bg-primary-soft[^"]*text-primary/);
  assert.doesNotMatch(line, /bg-bg|border-b/);
  assert.match(line, /BAND_SOURCE_TAIL/);
  assert.equal(BAND_SOURCE_TAIL, "내집나우 실거래 기준");
  assert.match(line, /<span className="max-md:hidden"> · \{BAND_SOURCE_TAIL\}<\/span>/, "꼬리는 md 이상");
  const page = code("app/complex/[id]/brief/page.tsx");
  const doc = page.slice(page.indexOf('className="brief-doc '), page.indexOf("</article>"));
  const sum = doc.indexOf('className="brief-sum ');
  const minis = doc.indexOf('aria-labelledby="brief-minis-title"');
  const overview = doc.indexOf('aria-labelledby="brief-overview-title"');
  assert.ok(doc.indexOf("<h2") < sum && sum < minis && minis < overview, "단지명 → 요약 띠 → 미니 차트 → 개요");
  assert.match(doc, /className=\{`m-0 t-display t-num \$\{latest \? "text-ink" : "text-text-3"\}`\}>\{latest \? formatEokMan\(latest\.man\) : "—"\}/);
  assert.match(doc, /<BriefRatioRing pct=\{jeonse\?\.pct \?\? null\} \/>/);
  assert.match(doc, /\{conclusion && <p className="m-0 mt-1 t-sub font-bold text-ink">\{conclusion\}<\/p>\}/);
  assert.match(page, /briefConclusion\(\{ count12, latestLabel: latest \? formatEokMan\(latest\.man\) : null, jeonsePct: jeonse\?\.pct \?\? null \}\)/);
  assert.match(page, /const minis = deals \? briefMiniSeries\(deals, typeAreas, nowYm\) : \[\];/);
  assert.match(doc, /Array\.from\(\{ length: BRIEF_MINI_MAX \}/, "빈 상태 회색 윤곽 3칸");
  assert.match(doc, /점 = 실거래 · 선 = 월 중앙값 · 막대 = 건수/);
  assert.match(doc, /className="brief-minis mt-2 grid grid-cols-3 gap-2"/, "폰도 한 줄 셋(320px 안)");
  assert.match(doc, /<BriefMiniChart series=\{m\} maxCount=\{miniMax\} className="mt-1 block h-9 w-full text-primary" \/>/);
  const chart = code("app/complex/[id]/brief/BriefMiniChart.tsx");
  assert.doesNotMatch(chart, /"use client"/, "서버 조각");
  assert.doesNotMatch(chart, /#[0-9a-f]{3,6}\b/i, "색은 토큰 변수·currentColor 뿐");
  assert.match(chart, /polyline/);
  const ring = code("app/complex/[id]/brief/BriefRatioRing.tsx");
  assert.match(ring, /viewBox="0 0 64 64"/);
  assert.match(ring, /transform="rotate\(-90 32 32\)"/);
  assert.match(ring, /strokeDasharray=\{`\$\{g\.dash\} \$\{g\.c\}`\}/);
  for (const src of [page, line, chart, ring]) assert.doesNotMatch(src, /시세|gradient|linear-gradient/);
  assert.equal((page.match(/btn-primary/g) ?? []).length, 0, "문서 화면 채움 파랑은 폼 하나 그대로");
});

test("[1025c] 인쇄 잠금 — globals.css [1025c · 브리핑] 블록(append-only) · 미니 차트 24px · 요약 띠 축소 · 강조는 print-color-adjust · QR 상자", () => {
  const css = read("app/globals.css");
  const idx = css.indexOf("[1025c · 브리핑]");
  assert.ok(idx > css.indexOf("[1025b · 브리핑]"), "append-only");
  const block = css.slice(idx);
  assert.match(block, /\.brief-doc \.brief-mini\.brief-hl \{[^}]*border-color: var\(--primary\)/);
  assert.match(block, /\.brief-doc tr\.brief-hl > td \{[^}]*background: var\(--primary-soft\)/);
  assert.match(block, /\.brief-qr svg \{[^}]*width: 100%/);
  const print = block.slice(block.indexOf("@media print"));
  assert.match(print, /\.brief-doc \.brief-mini svg \{[^}]*height: 24px !important/);
  assert.match(print, /\.brief-doc \.brief-sum \.t-display \{[^}]*font-size: var\(--fs-title\) !important/);
  assert.match(print, /\.brief-doc \.brief-sum \{[^}]*break-inside: avoid/);
  assert.match(print, /\.brief-doc \.brief-minis \{[^}]*break-inside: avoid/);
  assert.match(print, /\.brief-doc section \{[^}]*margin-top: 10px !important/);
  assert.match(print, /print-color-adjust: exact/);
  assert.match(print, /\.brief-doc \.brief-band \{[^}]*border-bottom: 1px solid var\(--border\) !important/, "띠는 선 하나(1025b 규칙 그대로)");
  assert.doesNotMatch(block, /font-size:\s*\d+px/, "램프 변수만");
  assert.doesNotMatch(block, /#[0-9a-f]{3,6}\b|gradient/i);
});

test("[1025c] /pro — 견본 미니 문서(SVG · 공작아파트 실측 · '견본 · 2026-08 기준') · 결론 '3단계' + StepLine 1·2·3 · 3칸 결과 문장 · 채움 파랑 1(머리 + 폰 바 같은 요소)", () => {
  assert.equal(BRIEF_SAMPLE.label, "견본 · 공작아파트 · 2026-08 기준");
  assert.equal(BRIEF_SAMPLE.minis.length, 3);
  assert.equal(BRIEF_SAMPLE.table.length, 3);
  assert.equal(BRIEF_SAMPLE.overview.length, 8);
  assert.equal(BRIEF_SAMPLE.minis[0].price, BRIEF_SAMPLE.latestPrice, "요약 띠 큰 숫자 = 첫 타입 최근가");
  assert.equal(BRIEF_SAMPLE.table[0][1], BRIEF_SAMPLE.latestPrice);
  assert.equal(BRIEF_SAMPLE.conclusion, "최근 12개월 매매 152건 · 최근 5억 5,000만 · 전세가율 46.5%");
  assert.equal(BRIEF_SAMPLE.jeonsePct, 46.5);
  assert.equal(BRIEF_SAMPLE.ratio[0][1], "46.5%");
  for (const m of BRIEF_SAMPLE.minis) {
    assert.ok(m.points.length < BRIEF_MINI_MIN_LINE_POINTS && m.line.length === 0, "견본 점은 최근가·3개월 중앙뿐 — 선 없음");
    assert.equal(m.points.filter((p) => p.latest).length, 1);
  }
  assert.equal(PRO_CONCLUSION, "단지 이름 하나로 A4 한 장 · 인쇄까지 3단계");
  assert.doesNotMatch(PRO_CONCLUSION, /30초|초\b/, "측정 문구 아님");
  assert.equal(PRO_STEPS.length, 3);
  assert.match(PRO_RESULT_LINES.brief, /152건 · 5억 5,000만 · 전세가율 46\.5%/);
  const pro = code("app/pro/page.tsx");
  assert.match(pro, /<BriefSample qrRaw=\{qrRaw\} \/>/);
  assert.match(pro, /<StepLine className="mt-3" current=\{0\} steps=\{PRO_STEPS\} \/>/);
  assert.match(pro, /<MobilePrimaryBar label="브리핑 만들기">\{cta\}<\/MobilePrimaryBar>/);
  assert.match(pro, /href=\{`#\$\{SEARCH_ID\}`\} className="btn-primary /, "머리 버튼은 검색 칸으로(JS 없이)");
  assert.match(pro, /id=\{SEARCH_ID\} className="mt-3 scroll-mt-20"/);
  assert.equal((pro.match(/<ResultLine text=\{PRO_RESULT_LINES\.\w+\} \/>/g) ?? []).length, 3);
  assert.match(pro, /lg:grid-cols-\[minmax\(0,1fr\)_400px\]/);
  assert.match(pro, /lg:col-start-2 lg:row-span-3 lg:row-start-1/, "견본은 한 번만 그리고 자리만 바꾼다");
  assert.match(pro, /h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary/, "아이콘 칩 40px");
  assert.match(pro, /rawQrSvg\(`\$\{DEFAULT_DESKTOP_ORIGIN\}\/pro`\)/, "견본 QR 은 이 화면 주소");
  assert.doesNotMatch(pro, /30초|지금 시작|시작하세요|시작하기|무료로 시작|더 알아보기|자세히 알아보기|지금 바로/);
  const sample = code("app/pro/BriefSample.tsx");
  assert.doesNotMatch(sample, /"use client"/);
  assert.match(sample, /viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/);
  assert.match(sample, /<BriefMiniChart series=\{m\} maxCount=\{miniMax\} x=/, "브리핑과 같은 부품");
  assert.match(sample, /<BriefRatioRing pct=\{S\.jeonsePct\} x=/);
  assert.match(sample, /qrSvgParts\(qrRaw\)/);
  for (const m of sample.matchAll(/fontSize=\{(\d+)\}/g)) assert.ok([11, 12, 13, 15, 19, 21, 24, 28].includes(Number(m[1])), `램프 밖 글자(캡션 11 = --fs-caption) ${m[1]}`);
  assert.doesNotMatch(sample, /gradient|시세/);
  assert.doesNotMatch(sample, /#[0-9a-f]{3,6}\b/i, "색은 토큰 변수뿐(QR 흰 바탕은 qrcode 출력 안에)");
});
