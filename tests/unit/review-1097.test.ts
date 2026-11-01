/* [1097] 소유자 2026-10-31 "모든 페이지 및 관리자 페이지, 설정, 임장노트, 지도, AI 분석 등 최적화와 기능 향상, 중복된 기능 통폐합" +
 *  뉴스룸 캡처 "구분이 제대로 안 되어 있는 것 같아 가독성이 떨어져".
 *  디자인 — 뉴스룸: 행을 날짜(KST) 머리로 묶고 행 사이 선 · 여백 · 요약 색을 한 단씩 가른다(제목 한 줄은 1012 폰 규칙 그대로).
 *  지도 — 열리는 길이 없던 "단지 클릭 → 상세 팝업"(selected 모달 · 약 450줄 · 노트·매물 탭 조회 효과)을 지웠다.
 *  AI 분석 — 온도 지도 클라이언트에 읽는 네 값만(slimTemperatureLatest) · 비교 "AI 비교 해석"은 넷째부터 빠지면 라벨이 말한다.
 *  설정 — 알림 설정은 화면이 한 번만 읽는다(usePrefs 한 벌). 임장노트 — 회차 비교 빈 상태에 "비교 가능한 단지" 칩.
 *  관리자 — 이모지 · 그라데이션 미리보기 · 메뉴 빠진 매물 검수 · 틀린 꼬리말 · KPI 두 번 조회 · 같은 조회 두 번 · 차례 조회 180회.
 *  통폐합 — yyyymm 셈 5벌(shiftYm) · ymDot 3벌 · formatYmKo 2벌 · ymShort 2벌 · maskEmail 2벌 → lib/format/ym · lib/privacy/mask-email. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupNewsRowsByDay, newsDayKey, newsDayLabel } from "../../lib/town/news-day";
import { shiftYm, ymDotLabel, ymKoLabel, ymMonthsBefore, ymShortLabel } from "../../lib/format/ym";
import { shiftYm as shiftYmQuiz, ymDotLabel as ymDotQuiz } from "../../lib/quiz/price-game";
import { shiftYm as shiftYmAsk } from "../../lib/complex/asking-check";
import { shiftYm as shiftYmDong } from "../../lib/complex/dong";
import { shiftYm as shiftYmMolit } from "../../lib/market/molit-core";
import { shiftYm as shiftYmRegion, ymShort as ymShortRegion } from "../../app/region/[id]/region-overview";
import { ymShort as ymShortDelta } from "../../lib/complex/month-delta";
import { ymDot as ymDotDong, ymKo } from "../../lib/dong/format";
import { ymDot as ymDotHub } from "../../lib/complex/hub-price";
import { formatYmKo as fmtBest } from "../../lib/inspection/best-notes";
import { maskEmailPublic } from "../../lib/privacy/mask-email";
import { slimTemperatureLatest } from "../../lib/market/temperature-archive";
import { compareCandidates } from "../../lib/inspection/compare-candidates";
import { compareActionLinks } from "../../lib/market/compare-conclusion";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("뉴스룸 — 날짜(KST) 묶음: 키 · 라벨(연도는 다를 때만) · 입력 순서 유지 · 행 마크업 · CSS 토큰", () => {
  assert.equal(newsDayKey("2026-10-31T00:30:00+09:00"), "2026-10-31");
  assert.equal(newsDayKey("2026-10-30T16:30:00Z"), "2026-10-31", "UTC 16:30 = KST 다음 날 01:30");
  assert.equal(newsDayKey("nope"), "");
  assert.equal(newsDayLabel("2026-10-31", 2026), "10월 31일 (토)");
  assert.equal(newsDayLabel("2025-12-31", 2026), "2025년 12월 31일 (수)");
  assert.equal(newsDayLabel("", 2026), "날짜 없음");
  const rows = [
    { id: "a", publishedAt: "2026-10-31T09:00:00+09:00" },
    { id: "b", publishedAt: "2026-10-31T01:00:00+09:00" },
    { id: "c", publishedAt: "2026-10-30T23:00:00+09:00" },
    { id: "d", publishedAt: "bad" },
  ];
  const g = groupNewsRowsByDay(rows);
  assert.deepEqual(g.map((x) => [x.key, x.label, x.rows.map((r) => r.id)]), [
    ["2026-10-31", "10월 31일 (토)", ["a", "b"]],
    ["2026-10-30", "10월 30일 (금)", ["c"]],
    ["none", "날짜 없음", ["d"]],
  ]);
  const list = strip(read("app/town/news/NewsListClient.tsx"));
  assert.match(list, /import \{ groupNewsRowsByDay \} from "@\/lib\/town\/news-day";/);
  assert.match(list, /\{groupNewsRowsByDay\(list\)\.map\(\(g\) => \(\s*<section key=\{g\.key\} className="news-day" aria-label=\{g\.label\}>\s*<h2 className="news-day__head">\s*\{g\.label\}\s*<span className="news-day__count">\{g\.rows\.length\}건<\/span>\s*<\/h2>/);
  /* 제목은 폰도 한 줄 — 1012 폰 배율 규칙(소유자 "최대한 한 줄로")이 line-clamp-2/3 을 1 로 접으므로 두 줄로 풀지 않는다 */
  assert.match(list, /<span className=\{lead \? "line-clamp-3" : "line-clamp-1"\}>\{row\.title\}<\/span>/);
  const css = read("app/globals.css");
  const tail = css.slice(css.indexOf("[1097 · 디자인] 뉴스룸 구분"));
  assert.match(tail, /\.news-day__head \{[\s\S]*?border-bottom: 2px solid var\(--border-strong\);[\s\S]*?font-size: var\(--fs-sub\);/);
  assert.match(tail, /\.news-row \{\s*padding: 14px 2px;\s*border-bottom-color: var\(--border\);/);
  assert.match(tail, /\.news-row__summary \{\s*color: var\(--text-3\);/);
  assert.match(tail, /\.news-row--thumb \{\s*grid-template-columns: 96px minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(tail, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8|font-size:\s*\d/, "1022 뒤 append 규칙(토큰만)");
});

test("지도 — 열리는 길 없던 상세 팝업 제거(selectedId · 탭 · 노트/매물 조회 효과 · 고아 헬퍼) · 살아 있는 단지 패널은 그대로", () => {
  const mc = strip(read("app/map/map-client.tsx"));
  for (const gone of ["setSelectedId(", "DETAIL_TABS", "detailTab", "/api/map/complex-notes", "ComplexNoteItem", "ComplexListingItem", "listingPriceLabel(", "detailPanelRef", "단지 클릭 → 상세 팝업"]) {
    assert.ok(!mc.includes(gone), `남은 죽은 코드: ${gone}`);
  }
  assert.ok(mc.split("\n").length < 5800, `줄 수 ${mc.split("\n").length} — 전 6,208`);
  assert.match(mc, /selected: d\.id === infoId,/);
  assert.match(mc, /const mdSidebarOpen = !infoComplex && panelOpen;/);
  assert.match(mc, /\{infoComplex && \(\s*<ComplexInfoPanel/);
});

test("AI 분석 — 온도 지도는 네 값만(slimTemperatureLatest) · 비교 링크는 넷째부터 빠지면 '앞 3곳'", () => {
  const full = {
    current: { regionId: "r1", regionLabel: "서울 강남구", weekStart: "2026-10-26", score: 71, headline: "뜨거움", parts: "지수 +12", periodType: "weekly" as const, momentumPct: 1, priorPct: 2, volumeRecentCount: 3, volumePriorCount: 4, volumeDeltaPct: 5, indexLatest: 6, formulaVersion: 2, observedAt: "x" },
    previous: { regionId: "r1", regionLabel: "서울 강남구", weekStart: "2026-10-19", score: 65, headline: "따뜻", parts: null, periodType: "weekly" as const, momentumPct: null, priorPct: null, volumeRecentCount: null, volumePriorCount: null, volumeDeltaPct: null, indexLatest: null, formulaVersion: 2, observedAt: null },
  };
  assert.deepEqual(slimTemperatureLatest(full), { current: { regionId: "r1", regionLabel: "서울 강남구", score: 71, headline: "뜨거움" }, previous: { score: 65 } });
  assert.deepEqual(slimTemperatureLatest({ ...full, previous: null }).previous, null);
  const page = strip(read("app/analysis/temperature/page.tsx"));
  assert.match(page, /weeks=\{weeks\.map\(\(w\) => \(\{ \.\.\.w, rows: w\.rows\.map\(slimTemperatureLatest\) \}\)\)\}/);
  const client = strip(read("app/analysis/temperature/TempMapClient.tsx"));
  assert.match(client, /rows: TemperatureLatestSlim\[\];/);
  assert.doesNotMatch(client, /\bTemperatureLatest\b(?!Slim)/);
  const card = strip(read("app/analysis/temperature/TempRegionCard.tsx"));
  assert.match(card, /current: TemperaturePoint;\s*previous: Pick<TemperatureSnapshot, "score"> \| null;/);
  assert.equal(compareActionLinks(["a", "b", "c", "d", "e"])[0]?.label, "AI 비교 해석 · 앞 3곳");
  assert.equal(compareActionLinks(["a", "b"])[0]?.label, "AI 비교 해석");
});

test("설정 — 알림 설정 훅은 화면에 한 벌 · 탭은 props 로 받는다", () => {
  const s = strip(read("app/my/settings/SettingsClient.tsx"));
  assert.equal((s.match(/= usePrefs\(\)/g) ?? []).length, 1, "usePrefs() 호출은 SettingsClient 한 곳");
  assert.match(s, /function NotificationTab\(\{ channels, prefsApi \}: \{ channels: NotifyChannels; prefsApi: PrefsApi \}\)/);
  assert.match(s, /function PrivacyTab\(\{ prefsApi \}: \{ prefsApi: PrefsApi \}\)/);
  assert.match(s, /<NotificationTab channels=\{channels\} prefsApi=\{prefsApi\} \/>/);
  assert.match(s, /<PrivacyTab prefsApi=\{prefsApi\} \/>/);
});

test("임장노트 — 회차 비교 빈 상태: 같은 단지 2회 이상인 단지를 최근 순으로(최대 12) · 칩은 가장 최근 노트로", () => {
  const n = (id: string, apt: string | null, visitDate: string, complexId?: string) =>
    ({ id, aptName: apt, visitDate, createdAt: visitDate, metadata: complexId ? { complexId } : undefined }) as unknown as Parameters<typeof compareCandidates>[0][number];
  const out = compareCandidates([
    n("1", "래미안 A", "2026-01-05"),
    n("2", "래미안 A", "2026-03-02"),
    n("3", "B단지", "2026-02-01"),
    n("4", "표기1", "2026-04-01", "cx9"),
    n("5", "표기2", "2026-05-01", "cx9"),
    n("6", null, "2026-06-01"),
  ]);
  assert.deepEqual(out, [
    { noteId: "5", label: "표기2", count: 2 },
    { noteId: "2", label: "래미안 A", count: 2 },
  ]);
  assert.deepEqual(compareCandidates([]), []);
  const page = strip(read("app/notes/compare/page.tsx"));
  assert.match(page, /\| \{ kind: "need_note"; candidates: CompareCandidate\[\] \}/);
  assert.match(page, /href=\{`\/notes\/compare\?noteId=\$\{encodeURIComponent\(c\.noteId\)\}`\}/);
  assert.match(page, /"회차 비교 불러오기 실패 · 잠시 후 다시"/);
  assert.doesNotMatch(page, /\? result\.message/, "예외 문장을 화면에 그대로 내지 않는다");
});

test("관리자 — 이모지 없음 · 배너 미리보기 단색(끝색 입력 없음) · 매물 검수 메뉴 · 꼬리말 · KPI cache · 같은 조회 한 번 · 묶음 조회", () => {
  for (const [p, bad] of [
    ["app/admin/layout.tsx", "🔴"],
    ["app/admin/ai/page.tsx", "👍"],
    ["app/admin/quality/page.tsx", "👍"],
    ["app/admin/listings/page.tsx", "⚠ 자동"],
    ["app/admin/quality/VerificationQueue.tsx", "⚑"],
  ] as const) {
    assert.ok(!read(p).includes(bad), `${p}: ${bad}`);
  }
  const banners = strip(read("app/admin/banners/BannersClient.tsx"));
  assert.doesNotMatch(banners, /linear-gradient/);
  assert.match(banners, /background: draft\.bgFrom \|\| undefined,/);
  assert.doesNotMatch(banners, /배경 끝색|set\("bgTo"/);
  assert.match(read("app/admin/AdminNav.tsx"), /\{ href: "\/admin\/listings", label: "매물 검수" \}/);
  assert.doesNotMatch(read("lib/admin/moderation-policy.ts"), /\/admin\/reports/);
  assert.match(read("app/admin/page.tsx"), /sub: "검수 대기 매물",/);
  assert.match(read("app/admin/quality/page.tsx"), /sub: "app_users"/);
  assert.match(read("app/admin/quality/page.tsx"), /좋아요·싫어요 비율은 <a href="\/admin\/ai"/);
  const stats = strip(read("lib/admin/stats.ts"));
  assert.match(stats, /export const loadAdminKpi = cache\(loadAdminKpiUncached\);/);
  assert.match(stats, /import \{ cache \} from "react";/);
  const community = strip(read("app/admin/community/page.tsx"));
  assert.match(community, /const \[posts7, comments7, unansweredR, zeroR\] = await Promise\.all\(\[/);
  assert.doesNotMatch(community, /adopted7/);
  const seo = strip(read("app/admin/seo/page.tsx"));
  assert.match(seo, /const hrefMap = await resolveComplexHrefs\(/);
  assert.doesNotMatch(seo, /await resolveComplexHref\(lm/);
  /* 문구 — 실거래 자료에 "시세" 없음 · 권유형 없음 */
  assert.match(read("app/admin/data/CronRunPanel.tsx"), /지도 실거래 색상이 쓰는 집계 MV/);
  assert.match(read("lib/content/promo-pure.ts"), /면적대 실거래·임장노트/);
  assert.match(read("lib/content/blog-pack.ts"), /지도·실거래·임장노트는 내집나우에서/);
  assert.doesNotMatch(read("app/api/admin/payments/notify-preorder/route.ts"), /확인해 보세요/);
});

test("통폐합 — yyyymm 셈과 이메일 마스킹은 본체 하나(같은 입력 같은 결과)", () => {
  const cases: [string, number][] = [["202601", 1], ["202601", -1], ["202612", 13], ["202603", -27], ["202410", 0]];
  for (const [ym, d] of cases) {
    const want = shiftYm(ym, d);
    assert.equal(shiftYmQuiz(ym, d), want);
    assert.equal(shiftYmAsk(ym, d), want);
    assert.equal(shiftYmDong(ym, d), want);
    assert.equal(shiftYmMolit(ym, d), want);
    assert.equal(shiftYmRegion(ym, d), ymMonthsBefore(ym, d), "지역 개요의 shiftYm 은 n 개월 전(부호 반대 · 이름 유지)");
    assert.equal(shiftYm(ym, -d), ymMonthsBefore(ym, d));
  }
  assert.equal(shiftYm("202601", -1), "202512");
  assert.equal(shiftYm("202612", 1), "202701");
  assert.equal(ymKoLabel("202609"), "2026년 9월");
  assert.equal(ymKo("202609"), "2026년 9월");
  assert.equal(fmtBest("202609"), "2026년 9월");
  assert.equal(ymShortLabel("202609"), "26.09");
  assert.equal(ymShortRegion("202609"), "26.09");
  assert.equal(ymShortDelta("202609"), "26.09");
  assert.equal(ymDotLabel("202609"), "2026.09");
  assert.equal(ymDotQuiz("202609"), "2026.09");
  assert.equal(ymDotDong("202609"), "2026.09");
  assert.equal(ymDotHub("202609"), "2026.09");
  assert.equal(ymDotLabel("x"), "x");
  /* 본체가 하나인지 — 예전 모듈에 같은 셈의 몸통이 남아 있지 않다 */
  for (const p of ["lib/quiz/price-game.ts", "lib/complex/asking-check.ts", "lib/complex/dong.ts", "lib/market/molit-core.ts"]) {
    assert.doesNotMatch(strip(read(p)), /function shiftYm\(/, p);
  }
  for (const p of ["lib/dong/format.ts", "lib/complex/hub-price.ts"]) assert.doesNotMatch(strip(read(p)), /function ymDot\(/, p);
  for (const p of ["lib/inspection/best-notes.ts", "lib/reports/monthly.ts"]) assert.doesNotMatch(strip(read(p)), /function formatYmKo\(/, p);
  for (const p of ["app/region/[id]/region-overview.ts", "lib/complex/month-delta.ts"]) assert.doesNotMatch(strip(read(p)), /function ymShort\(/, p);
  const qna = strip(read("lib/qna/store.ts"));
  assert.match(qna, /import \{ maskEmailPublic as maskEmail \} from "@\/lib\/privacy\/mask-email";/);
  assert.doesNotMatch(qna, /function maskEmail\(/);
  assert.equal(maskEmailPublic("kdw1203@gmail.com"), "kdw***");
});

test("문구 — 실거래 자료에 '시세' 없음 · 실패는 '○○ 불러오기 실패 · 잠시 후 다시' · 빈 상태는 '○○ 없음' · 기호 없음", () => {
  const CASES: [string, string[], string[]][] = [
    ["app/my/settings/SettingsClient.tsx", ["새 실거래 신고 문자 알림", "뉴스·실거래 요약", "설정 불러오기 실패 · 잠시 후 다시", "프로필 불러오기 실패 · 잠시 후 다시"], ["시세 변동 시 문자 알림", "뉴스·시세 요약", "새로고침 후 다시 시도해 주세요", "네트워크 오류가 발생했습니다"]],
    ["app/my/settings/RecordPrefsTab.tsx", ["기본값 불러오기 실패 · 잠시 후 다시"], ["새로고침 후 다시 시도해 주세요"]],
    ["app/my/support/TicketList.tsx", ["문의 불러오기 실패 · 잠시 후 다시"], ["네트워크 오류가 발생했습니다"]],
    ["app/analysis/gap/page.tsx", ['title="전세가율 불러오기 실패"'], ["지역 시세 불러오기 실패"]],
    ["app/analysis/compare/RegionMarketSummary.tsx", ["지역 실거래 불러오는 중", "실거래 통계 없음"], ["지역 시세를", "시세 통계 없음"]],
    ["app/notes/new/NoteForm.tsx", ["실거래·공기질·개발계획"], ["시세·공기질·개발계획"]],
    ["app/notes/best/page.tsx", ["기준을 채운 달 없음"], ["아직 기준을 채운 달이 없습니다"]],
    ["app/analysis/temperature/page.tsx", ["쌓인 주 없음</p>"], ["아직 쌓인 주가 없습니다.</p>"]],
    ["app/notes/new/VisitVerifyCard.tsx", ["현장 인증됨 · 단지 반경"], ["✓ 현장 인증됨"]],
    ["app/notes/new/VoiceMemoRecorder.tsx", ['"옮김"'], ["✓ 옮김"]],
    ["app/notes/new/NotePhotoBlocks.tsx", ['"평면도로 표시됨"'], ["평면도 ✓"]],
    ["app/notes/[id]/card/NoteCardStudio.tsx", ['"복사했어요"'], ["복사됨 ✓"]],
    ["app/notes/[id]/NoteAudioTools.tsx", ['"복사했어요"'], ["복사됨 ✓"]],
    ["app/town/news/[id]/PostInteractions.tsx", ['copiedLabel="링크 복사했어요"'], ["복사됨 ✓"]],
    ["app/town/groups/[id]/ShareButton.tsx", ['copiedLabel="링크 복사했어요"'], ["복사됨 ✓"]],
    ["app/analysis/scenario/ScenarioClient.tsx", ['"링크 복사했어요"'], ["복사됨 ✓"]],
  ];
  for (const [p, want, gone] of CASES) {
    const s = strip(read(p));
    for (const w of want) assert.ok(s.includes(w), `${p}: ${w}`);
    for (const g of gone) assert.ok(!s.includes(g), `${p}: 남은 옛 문구 ${g}`);
  }
});
