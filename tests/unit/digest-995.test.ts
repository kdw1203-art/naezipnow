import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_BODY_MAX,
  PUSH_BODY_MAX,
  clampLines,
  formatPersonalDigestEmail,
  formatPersonalDigestInbox,
  formatPersonalDigestPush,
  isPersonalDigestEmpty,
  personalDigestLines,
  personalDigestPrimaryHref,
  personalDigestTitleParts,
  type PersonalDigest,
} from "../../lib/digest/personal-format";

/* [995-4] 개인 주간 다이제스트 — 순수 포맷터. 픽스처만으로 검증한다(서버·DB 없음). */

const FULL: PersonalDigest = {
  weekLabel: "9월 2주차",
  windowFrom: "2026-09-06",
  windowTo: "2026-09-13",
  regions: [
    { name: "서울 마포구", regionId: "mapo", regionName: "마포구", avgSaleWon: 1_250_000_000, changeMonthlyPct: 0.6, period: "202608", tradeCount: 312 },
    { name: "판교", regionId: null, regionName: "성남 분당구", avgSaleWon: 1_530_000_000, changeMonthlyPct: null, period: "202608", tradeCount: null },
    { name: "인천 부평구", regionId: "incheon-bupyeong", regionName: "부평구", avgSaleWon: 420_000_000, changeMonthlyPct: -0.4, period: null, tradeCount: 0 },
  ],
  watchlist: {
    complexCount: 5,
    txCount: 9,
    items: [
      { complexId: "c1", name: "래미안대치팰리스", txCount: 4, latestPriceWon: 2_850_000_000, latestContractYm: "202609", latestReportedAt: "2026-09-12T03:00:00.000Z", areaM2: 84, floor: 12 },
      { complexId: "c2", name: "마포래미안푸르지오", txCount: 3, latestPriceWon: 1_720_000_000, latestContractYm: "202608", latestReportedAt: "2026-09-10T15:30:00.000Z", areaM2: 59, floor: 7 },
      { complexId: "c3", name: "e편한세상", txCount: 2, latestPriceWon: null, latestContractYm: null, latestReportedAt: null, areaM2: null, floor: null },
    ],
  },
  myNotes: {
    complexCount: 1,
    items: [
      { noteId: "n-1", complexId: "c2", name: "마포래미안푸르지오", txCount: 3, latestPriceWon: 1_720_000_000, latestContractYm: "202608", latestReportedAt: "2026-09-10T15:30:00.000Z", areaM2: 59, floor: 7 },
    ],
  },
  apply: {
    count: 2,
    items: [
      { houseNm: "래미안 테스트", region: "서울", address: "서울특별시 마포구 …", totSupply: 500, rceptBgnde: "2026-09-15", rceptEndde: "2026-09-17", url: "https://www.applyhome.co.kr/x" },
      { houseNm: "힐스테이트 샘플", region: "인천", address: null, totSupply: null, rceptBgnde: "2026-09-18", rceptEndde: null, url: null },
    ],
  },
};

const EMPTY: PersonalDigest = { weekLabel: "9월 2주차", windowFrom: "2026-09-06", windowTo: "2026-09-13" };

test("[995] 빈 다이제스트 — 섹션이 하나도 없으면 empty 이고, 0건 섹션도 empty 로 본다", () => {
  assert.equal(isPersonalDigestEmpty(EMPTY), true);
  assert.equal(isPersonalDigestEmpty(null), true);
  assert.equal(isPersonalDigestEmpty({ ...EMPTY, regions: [], watchlist: { complexCount: 0, txCount: 0, items: [] } }), true);
  assert.equal(isPersonalDigestEmpty(FULL), false);
  assert.deepEqual(personalDigestTitleParts(EMPTY), []);
  assert.deepEqual(personalDigestLines(EMPTY), []);
  /* 빈 것을 굳이 포맷하면 제목만 남고 본문은 빈 문자열 — 지어낸 줄이 없다 */
  const f = formatPersonalDigestInbox(EMPTY);
  assert.equal(f.title, "9월 2주차 내 주간 요약");
  assert.equal(f.body, "");
});

test("[995] 수신함 제목 — 있는 섹션만, 정해진 순서로", () => {
  const { title } = formatPersonalDigestInbox(FULL);
  assert.equal(title, "이번 주 내 요약 — 관심 지역 3곳 · 새 실거래 5단지 · 임장 단지 1곳 · 청약 2건");
  const onlyApply: PersonalDigest = { ...EMPTY, apply: FULL.apply };
  assert.equal(formatPersonalDigestInbox(onlyApply).title, "이번 주 내 요약 — 청약 2건");
});

test("[995] 수신함 본문 — 줄마다 근거(기준월·계약월·신고일·접수일)가 붙고 600자 이내", () => {
  const { body } = formatPersonalDigestInbox(FULL);
  const lines = body.split("\n");
  assert.ok(body.length <= INBOX_BODY_MAX, `본문 ${body.length}자`);
  /* 지역: 평균가 · 전월 대비 · 기준월 */
  assert.equal(lines[0], "마포구 평균 매매 12.5억 · 전월 대비 ▲ 0.6% · 거래 312건 (2026.08 기준)");
  /* 변동률을 모르면 "전월 대비" 구절 자체가 없다 — 0.0% 로 위장하지 않는다 */
  assert.equal(lines[1], "성남 분당구 평균 매매 15.3억 (2026.08 기준)");
  assert.ok(!lines[1].includes("전월 대비"));
  /* 기준월이 없으면 괄호도 없다 · 거래 0건은 싣지 않는다 */
  assert.equal(lines[2], "부평구 평균 매매 4.2억 · 전월 대비 ▼ 0.4%");
  /* 관심단지: 건수 · 최근가 · (계약월 · 신고일 KST) */
  assert.equal(lines[3], "래미안대치팰리스 새 실거래 4건 · 최근 28.5억 (2026.09 계약 · 09.12 신고)");
  /* 09.10 15:30Z 는 KST 로 09.11 */
  assert.equal(lines[4], "마포래미안푸르지오 새 실거래 3건 · 최근 17.2억 (2026.08 계약 · 09.11 신고)");
  assert.equal(lines[5], "e편한세상 새 실거래 2건");
  /* 3개 넘는 단지는 수만 — 창(신고 기준)을 명시 */
  assert.equal(lines[6], "외 2개 단지에도 새 실거래 (09.06~09.13 신고)");
  assert.equal(lines[7], "임장 다녀온 마포래미안푸르지오 새 실거래 3건 · 최근 17.2억 (2026.08 계약 · 09.11 신고)");
  assert.equal(lines[8], "청약 래미안 테스트(서울) 500세대 · 접수 09.15~09.17");
  assert.equal(lines[9], "청약 힐스테이트 샘플(인천) · 접수 09.18");
  assert.equal(lines.length, 10);
});

test("[995] clampLines — 줄 단위로 자르고 잘린 줄 수를 남긴다(상한 초과 금지)", () => {
  const lines = Array.from({ length: 30 }, (_, i) => `줄 ${i} ${"가".repeat(40)}`);
  const out = clampLines(lines, INBOX_BODY_MAX);
  assert.ok(out.length <= INBOX_BODY_MAX);
  assert.match(out, /… 외 \d+줄$/);
  assert.equal(clampLines(["짧은 줄"], 100), "짧은 줄");
  assert.equal(clampLines([], 100), "");
  /* 푸시는 더 짧다 */
  const push = formatPersonalDigestPush(FULL);
  assert.ok(push.body.length <= PUSH_BODY_MAX);
  assert.equal(push.title, formatPersonalDigestInbox(FULL).title);
});

test("[995] 카드가 여는 곳 — 실거래 > 지역 > 청약, 지역 id 가 없으면 /map?region=", () => {
  assert.equal(personalDigestPrimaryHref(FULL), "/my/watchlist");
  assert.equal(personalDigestPrimaryHref({ ...EMPTY, regions: [FULL.regions![0]] }), "/region/mapo");
  assert.equal(personalDigestPrimaryHref({ ...EMPTY, regions: [FULL.regions![1]] }), `/map?region=${encodeURIComponent("판교")}`);
  assert.equal(personalDigestPrimaryHref({ ...EMPTY, apply: FULL.apply }), "/apply");
  assert.equal(personalDigestPrimaryHref(EMPTY), "/digest");
});

test("[995] 이메일 — (광고) 제목, 표 없는 본문, 실재하는 링크만, 없는 섹션은 제목도 없다", () => {
  const m = formatPersonalDigestEmail(FULL, { siteUrl: "https://naezipnow.com/" });
  assert.equal(m.subject, "(광고) [내집나우] 9월 2주차 내 주간 요약 — 관심 지역 3곳 · 새 실거래 5단지 · 임장 단지 1곳 · 청약 2건");
  /* 본문(카드 안)에는 table 이 없다 — 레이아웃 머리띠의 presentation 표만 허용 */
  const card = m.html.split('<div style="background-color:#ffffff')[1] ?? "";
  assert.ok(!/<table/i.test(card), "본문에 table 금지");
  assert.ok(m.html.includes('href="https://naezipnow.com/region/mapo"'));
  assert.ok(m.html.includes(`href="https://naezipnow.com/map?region=${encodeURIComponent("판교")}"`));
  assert.ok(m.html.includes('href="https://naezipnow.com/my/watchlist"'));
  assert.ok(m.html.includes('href="https://naezipnow.com/apply"'));
  assert.ok(m.html.includes('href="https://naezipnow.com/notes/n-1"'));
  /* 수신거부 경로(공통 레이아웃) */
  assert.ok(m.html.includes("https://naezipnow.com/my/settings"));
  assert.ok(m.html.includes("12.5억"));
  assert.ok(m.html.includes("(2026.08 기준)"));
  assert.ok(m.text.includes("래미안대치팰리스 새 실거래 4건 · 최근 28.5억 (2026.09 계약 · 09.12 신고)"));

  const onlyRegions = formatPersonalDigestEmail({ ...EMPTY, regions: FULL.regions }, { siteUrl: "https://naezipnow.com" });
  assert.ok(onlyRegions.html.includes("관심 지역 시세"));
  assert.ok(!onlyRegions.html.includes("관심 단지 새 실거래"));
  assert.ok(!onlyRegions.html.includes("청약 접수"));
  assert.ok(!onlyRegions.html.includes("임장 다녀온"));
});

test("[995] 이메일 — HTML 이스케이프(단지명·주소에 태그가 있어도 그대로 박히지 않는다)", () => {
  const d: PersonalDigest = {
    ...EMPTY,
    watchlist: {
      complexCount: 1,
      txCount: 1,
      items: [{ complexId: "x", name: "<b>악성</b>&단지", txCount: 1, latestPriceWon: 100_000_000, latestContractYm: "202609", latestReportedAt: null, areaM2: null, floor: null }],
    },
  };
  const m = formatPersonalDigestEmail(d, { siteUrl: "https://naezipnow.com" });
  assert.ok(!m.html.includes("<b>악성</b>"));
  assert.ok(m.html.includes("&lt;b&gt;악성&lt;/b&gt;&amp;단지"));
  assert.ok(m.html.includes("1억"));
});
