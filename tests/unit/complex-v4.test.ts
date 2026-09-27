/* [v4 · 한 화면 한 가지] 단지 상세(/complex/[id]) 개편 회귀 테스트.
 *
 * 고정하는 것:
 *  1) 머리 사실 한 줄·요약 행의 순수 함수(lib/complex/hub-summary) — 있는 값만, "—"·빈 괄호 없음, 지난 물량을 "예정"이라 부르지 않음.
 *  2) 화면 구조(소스 문자열) — 네이비 히어로·워터마크 없음 · 채움 파랑 1개 · 지표 6칸·단지 정보 카드·결과 요약 카드·
 *     하우스 광고·사이드바 없음 · "신고된 매매 실거래 없음"은 한 곳 · 이 화면 섹션에 cv-auto(빈 상자 원인) 없음 ·
 *     탭은 서버 조각을 hidden 으로만 숨긴다(HTML 에 남는다).
 * 서버 전용 의존(supabase·next)이 붙은 화면 파일은 이 러너에서 불러올 수 없으므로 소스 문자열로 본다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  SUPPLY_ROWS_MAX,
  distanceLabel,
  headFactLine,
  nearestSupplyValue,
  supplyRows,
  walkMinutesLabel,
  ymDotLabel,
} from "../../lib/complex/hub-summary.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** 주석은 코드가 아니다 — 규칙 기록("예전엔 … 였다")까지 잡지 않게 지운다 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ────────────────────────── 1) 순수 함수 ────────────────────────── */

test("[v4] 머리 사실 한 줄 — 준공 · 연차 · 세대 · 주소(있는 값만)", () => {
  assert.equal(
    headFactLine({ buildYear: 1994, households: 1258, roadAddress: null, address: "창원시 성산구 상남동 44-1", nowYear: 2026 }),
    "1994년 준공 · 32년차 · 1,258세대 · 창원시 성산구 상남동 44-1",
  );
  /* 도로명이 있으면 도로명 */
  assert.equal(
    headFactLine({ buildYear: 2018, households: null, roadAddress: "서울 송파구 올림픽로 435", address: "서울 송파구 가락동 913", nowYear: 2026 }),
    "2018년 준공 · 8년차 · 서울 송파구 올림픽로 435",
  );
  /* 올해 준공이면 "0년차"를 쓰지 않는다 · 세대수 0 은 없음 */
  assert.equal(headFactLine({ buildYear: 2026, households: 0, roadAddress: " ", address: null, nowYear: 2026 }), "2026년 준공");
  /* 아무것도 없으면 null — 빈 줄을 그리지 않는다 */
  assert.equal(headFactLine({ buildYear: null, households: null, roadAddress: null, address: "", nowYear: 2026 }), null);
});

const S = (moveInYm: string, aptName: string | null, households: number | null) => ({
  moveInYm,
  aptName,
  households,
  address: null,
  region: "경상남도 창원시 성산구",
  bizType: "분양",
});

test("[v4] 인근 입주물량 — 이번 달 이후 먼저 · 최대 4행 · 예정이 없으면 최근 물량(예정 아님)", () => {
  const items = [S("202601", "지난 단지", 100), S("202609", "센트럴", 36), S("202706", "푸르지오", 570), S("202712", "더리브", 143), S("203004", "자이", 509), S("203101", "다섯째", 10)];
  const r = supplyRows(items, "202609");
  assert.equal(r.upcoming, true);
  assert.equal(SUPPLY_ROWS_MAX, 4);
  assert.deepEqual(r.rows.map((x) => x.aptName), ["센트럴", "푸르지오", "더리브", "자이"]);
  const past = supplyRows([S("202501", "A", 1), S("202502", "B", 2)], "202609");
  assert.equal(past.upcoming, false);
  assert.equal(past.rows.length, 2);
});

test("[v4] 요약 행 '인근 입주 예정' — 가장 가까운 달 · 같은 달 세대 합 · 지난 물량만 있으면 행 없음", () => {
  const v = nearestSupplyValue([S("202609", "센트럴", 36), S("202609", "둘째", 14), S("202706", "푸르지오", 570)], "202609");
  assert.deepEqual(v, { ym: "202609", value: "2026.09 · 50세대", names: ["센트럴", "둘째"] });
  assert.equal(nearestSupplyValue([S("202501", "A", 1)], "202609"), null);
  assert.equal(nearestSupplyValue([], "202609"), null);
  /* 세대수를 모르면 달만 */
  assert.equal(nearestSupplyValue([S("202610", null, null)], "202609")?.value, "2026.10");
  assert.equal(ymDotLabel("202609"), "2026.09");
  assert.equal(ymDotLabel("2026-09"), "2026-09");
});

test("[v4] 도보권 행 — 직선거리 80m/분 환산(예전 섹션과 같은 규칙) · 거리 표기", () => {
  assert.equal(walkMinutesLabel(650), "도보 약 8분");
  assert.equal(walkMinutesLabel(20), "도보 약 1분");
  assert.equal(distanceLabel(650), "650m");
  assert.equal(distanceLabel(1234), "1.2km");
});

/* ────────────────────────── 2) 화면 구조 ────────────────────────── */

const PAGE = "app/complex/[id]/page.tsx";
const DIR = "app/complex/[id]";

test("[v4 · 규칙 4] 네이비 히어로·워터마크·면적대 칩·칩 줄이 없다 — 흰 바탕 머리", () => {
  const page = code(PAGE);
  const hero = code(`${DIR}/HubPriceHero.tsx`);
  for (const [name, s] of [["page", page], ["hero", hero]] as const) {
    assert.doesNotMatch(s, /brand-navy-card|BrandWatermark|brand-photo-chip|text-on-dark/, `${name}: 네이비 면·워터마크`);
  }
  assert.doesNotMatch(page, /heroBands|v\.chips/, "히어로 칩 줄이 남아 있다");
});

test("[v4 · 규칙 2] 채움 파랑 버튼은 머리의 '이 단지 임장노트 쓰기' 하나 — 탭·목록 안은 아웃라인", () => {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith(".tsx")).map((f) => `${DIR}/${f}`);
  const hits = files.flatMap((f) => (code(f).match(/btn-primary/g) ?? []).map(() => f));
  /* AiBriefingCard 는 이 화면에서 렌더하지 않는다(v4 — 데스크탑 사이드바 전용이던 기능, 보고서 참고) */
  const rendered = hits.filter((f) => !f.endsWith("AiBriefingCard.tsx"));
  assert.deepEqual(rendered, [PAGE], `채움 파랑이 여러 곳: ${rendered.join(", ")}`);
  assert.match(code(PAGE), /className="btn-primary[^"]*"\s*>\s*이 단지 임장노트 쓰기/);
});

test("[v4] 걷은 블록 — 결과 요약 카드 · 지표 6칸 · 단지 정보 카드 · 전세가율 카드 · 하우스 광고 · 사이드바 · 하단 CTA 묶음 · 임베드 카드", () => {
  const page = code(PAGE);
  for (const gone of [
    "이 단지 결과 요약",
    "VerdictCard",
    "월평균 · 면적 혼합\"",
    "ComplexInfoGrid",
    "ComplexFactsCard",
    "AdZone",
    "AdSlot",
    "<aside",
    "complex-actions-bottom",
    "EmbedSnippet",
    "QaBlock",
    "AiBriefingLazy",
    "한눈에 요약",
    "내 집 마련 여정",
  ]) {
    assert.ok(!page.includes(gone), `page.tsx 에 "${gone}" 가 남아 있다`);
  }
  /* 데스크탑도 가운데 한 줄 */
  assert.ok(page.includes("max-w-[760px]"));
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, "사이드바 격자가 남아 있다");
});

test("[v4 · 규칙 8] '신고된 매매 실거래 없음'은 머리(대표가 자리) 한 곳에서만", () => {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${DIR}/${f}`);
  const says = files.filter((f) => /신고된 매매 실거래 없음|아직 신고된 매매 실거래가 없어요|아직 수집된 국토교통부 실거래가 없어요/.test(code(f)));
  /* axis-summary-rules.ts 의 EMPTY_TILES_LINE 은 AI 진단 화면 규칙(허브에서는 그리지 않는다) */
  assert.deepEqual(
    says.filter((f) => !f.endsWith("axis-summary-rules.ts")),
    [`${DIR}/HubPriceHero.tsx`],
  );
});

test("[v4 · 브리프 9] 빈 상자 — 이 화면 섹션에 cv-auto(화면 밖 420px 자리표시) 없음", () => {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith(".tsx")).map((f) => `${DIR}/${f}`);
  const hits = files.filter((f) => /\bcv-auto\b/.test(code(f)));
  assert.deepEqual(hits, []);
});

test("[v4] 탭 — 서버 조각(요약·이야기·실거래)은 hidden 으로만 숨긴다(ISR HTML 에 남는다) · 탭 줄은 헤더 아래 sticky", () => {
  const hub = code(`${DIR}/hub-client.tsx`);
  assert.match(hub, /hidden=\{tab !== "요약"\}>\s*\{summary\}/);
  assert.match(hub, /hidden=\{tab !== "이야기"\}[\s\S]*?\{storyExtras\}/);
  assert.match(hub, /hidden=\{tab !== "실거래"\}[\s\S]*?\{priceExtras\}/);
  assert.match(hub, /sticky top-\[calc\(49px\+env\(safe-area-inset-top,0px\)\)\][^"]*md:top-\[calc\(57px\+env\(safe-area-inset-top,0px\)\)\]/);
  /* 탭 이동 행(data-hub-tab)은 가로챈다 · 주소 ?tab= 과 같은 id */
  assert.match(hub, /closest\?\.\("a\[data-hub-tab\]"\)/);
  const row = code(`${DIR}/SummaryRow.tsx`);
  assert.match(row, /href=\{`\?tab=\$\{tab\}`\} data-hub-tab=\{tab\}/);
  /* 요약 탭 첫 화면 JS 에서 빠진 것 */
  assert.doesNotMatch(hub, /from "\.\/TradeRow"|DealListLazy|aiBody|myRecordCard/);
});

test("[v4] 요약 목록 — 행 순서(매매 · 전세가율 · 역 · 학교 · 정비사업 · 호가 점검 · 거리뷰 · AI 종합 진단) · 출처 캡션 한 줄", () => {
  const page = code(PAGE);
  const order = [
    'label="최근 12개월 매매"',
    'label="전세가율"',
    /* [v4] '인근 입주 예정' 행 제거 — 바로 아래 입주 목록과 같은 사실이라 한 번만 */
    'label="가까운 역"',
    'label="가까운 학교"',
    'label="인근 정비사업"',
    'label="호가 점검"',
    'label="거리뷰"',
    "<ComplexAxisSummary",
  ];
  let at = -1;
  for (const k of order) {
    const i = page.indexOf(k);
    assert.ok(i > at, `${k} 가 없거나 순서가 다르다`);
    at = i;
  }
  /* 매매 행은 대표가가 있을 때만(없으면 머리가 한 번 말했다) */
  assert.match(page, /\{headline && !txFailed && \(\s*<SummaryRow label="최근 12개월 매매"/);
  /* 호가 점검 앵커는 목록 행 — 하단 바의 #asking-check 가 여기로 */
  assert.match(page, /id="asking-check"/);
});

test("[v4] 기능 유지 — 관심 · 비교 담기 · 공유 · 임장노트 · 지도 · 하단 바 · 최근 본 단지 · 탭 5개", () => {
  const page = code(PAGE);
  for (const k of [
    "<WatchlistButton complexId={v.id}",
    "<CompareTrayButton complexId={complexId}",
    "<ShareLinkButton",
    "href={noteHref}",
    "/map?complexId=",
    "<MobileActionBarLazy",
    "<RecentComplexRecorder",
    "<ComplexReviewsLazy",
    "<ComplexNotesNewsAi",
    "<ComplexAreaBands",
    "<RegionRelative",
    "<ComplexRentSection",
    "<UpcomingSupply",
    "<ComplexDataSources",
    'id="nearby-complexes"',
  ]) {
    assert.ok(page.includes(k), `page.tsx 에 ${k} 가 없다`);
  }
  assert.match(code(`${DIR}/hub-client.tsx`), /const TABS = \["요약", "이야기", "매물", "실거래", "내 기록"\] as const/);
});
