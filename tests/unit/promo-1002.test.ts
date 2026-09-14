import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReferrer,
  hashtagsFor,
  promoWeekTag,
  renderComplexBlogPost,
  renderComplexShortPost,
  summarizeByArea,
  summarizeInflow,
  withUtm,
  type ComplexPostInput,
} from "@/lib/content/promo-pure";

/* [1002] 홍보 킷 순수 부분 — 채널 분류 · 유입 요약 · utm · 주차 태그 · 단지 글.
   글은 사이트 밖으로 나가는 문장이라 금지어(전망·급등·보장·추천)가 없어야 하고,
   출처 문단과 "투자 권유" 문구·링크는 항상 들어 있어야 한다. */

/* ------------------------------------------------------------------ */
/* classifyReferrer                                                     */
/* ------------------------------------------------------------------ */

test("classifyReferrer — 검색·AI·커뮤니티·소셜·직접·미리보기·미상", () => {
  assert.deepEqual(classifyReferrer("www.google.com"), { channel: "search", label: "구글 검색" });
  assert.deepEqual(classifyReferrer("m.search.naver.com"), { channel: "search", label: "네이버 검색" });
  assert.deepEqual(classifyReferrer("chatgpt.com"), { channel: "ai", label: "ChatGPT" });
  assert.equal(classifyReferrer("gemini.google.com").channel, "ai");
  assert.deepEqual(classifyReferrer("cafe.naver.com"), { channel: "community", label: "네이버 카페" });
  assert.equal(classifyReferrer("m.blog.naver.com").channel, "community");
  /* [리뷰] 검색이 아닌 구글·네이버 호스트는 검색으로 세지 않는다 */
  assert.equal(classifyReferrer("docs.google.com").channel, "other");
  assert.equal(classifyReferrer("mail.google.com").channel, "other");
  assert.equal(classifyReferrer("band.naver.com").channel, "other");
  assert.equal(classifyReferrer("search.naver.com").channel, "search");
  assert.equal(classifyReferrer("www.google.co.kr").channel, "search");
  assert.deepEqual(classifyReferrer("l.instagram.com"), { channel: "social", label: "인스타그램" });
  assert.deepEqual(classifyReferrer(null), { channel: "direct", label: "직접/앱" });
  assert.deepEqual(classifyReferrer(""), { channel: "direct", label: "직접/앱" });
  assert.deepEqual(classifyReferrer("(직접/앱)"), { channel: "direct", label: "직접/앱" });
  assert.deepEqual(classifyReferrer("nz-git-main-foo.vercel.app"), { channel: "other", label: "미리보기(무시)" });
  assert.deepEqual(classifyReferrer("ntp.msn.com"), { channel: "other", label: "ntp.msn.com" });
});

/* ------------------------------------------------------------------ */
/* summarizeInflow                                                      */
/* ------------------------------------------------------------------ */

test("summarizeInflow — 채널 합산·비중·미리보기 제외·세션 내림차순", () => {
  const rows = summarizeInflow([
    { source: "www.google.com", sessions: 10, landings: 14 },
    { source: "chatgpt.com", sessions: 5, landings: 6 },
    { source: "(직접/앱)", sessions: 19, landings: 40 },
    { source: "m.search.naver.com", sessions: 2, landings: 2 },
    { source: "ntp.msn.com", sessions: 1, landings: 1 },
    { source: "nz-abc.vercel.app", sessions: 30, landings: 30 },
  ]);
  /* 미리보기 30 세션은 합계(37)에도 행에도 없다 */
  assert.equal(rows.some((r) => r.label === "미리보기(무시)"), false);
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  assert.equal(total, 37);
  assert.deepEqual(
    rows.map((r) => [r.channel, r.sessions]),
    [["direct", 19], ["search", 12], ["ai", 5], ["other", 1]],
  );
  const search = rows.find((r) => r.channel === "search")!;
  assert.equal(search.landings, 16);
  assert.equal(search.share, 32.4); // 12/37
  assert.deepEqual(search.sources, ["구글 검색 10", "네이버 검색 2"]);
  const direct = rows.find((r) => r.channel === "direct")!;
  assert.equal(direct.share, 51.4); // 19/37
});

test("summarizeInflow — 합계 0 이면 비중 0, 빈 입력은 빈 배열", () => {
  assert.deepEqual(summarizeInflow([]), []);
  const rows = summarizeInflow([{ source: "www.google.com", sessions: 0, landings: 0 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].share, 0);
});

/* ------------------------------------------------------------------ */
/* withUtm · promoWeekTag                                               */
/* ------------------------------------------------------------------ */

const UTM = { source: "naver", medium: "blog", campaign: "complex-2026w38" };

test("withUtm — 쿼리 없는 URL", () => {
  assert.equal(
    withUtm("https://naezipnow.com/complex/abc", UTM),
    "https://naezipnow.com/complex/abc?utm_source=naver&utm_medium=blog&utm_campaign=complex-2026w38",
  );
});

test("withUtm — 기존 쿼리·해시 보존", () => {
  assert.equal(
    withUtm("https://naezipnow.com/tx?region=gangnam#top", UTM),
    "https://naezipnow.com/tx?region=gangnam&utm_source=naver&utm_medium=blog&utm_campaign=complex-2026w38#top",
  );
  assert.equal(
    withUtm("https://naezipnow.com/map#zoom", UTM),
    "https://naezipnow.com/map?utm_source=naver&utm_medium=blog&utm_campaign=complex-2026w38#zoom",
  );
});

test("withUtm — 멱등(이미 utm_source 가 있으면 그대로)", () => {
  const once = withUtm("https://naezipnow.com/", UTM);
  assert.equal(withUtm(once, UTM), once);
  assert.equal(withUtm(once, { source: "x", medium: "y", campaign: "z" }), once);
  assert.equal((once.match(/utm_source=/g) ?? []).length, 1);
});

test("withUtm — 값은 URL 인코딩", () => {
  const u = withUtm("https://naezipnow.com/", { source: "네이버 카페", medium: "post", campaign: "a&b" });
  assert.ok(u.includes("utm_source=%EB%84%A4%EC%9D%B4%EB%B2%84%20%EC%B9%B4%ED%8E%98"));
  assert.ok(u.includes("utm_campaign=a%26b"));
});

test("promoWeekTag — 형식과 KST ISO 주차", () => {
  assert.match(promoWeekTag(), /^\d{4}w\d{2}$/);
  /* 2026-09-14(월) KST → ISO 38주 */
  assert.equal(promoWeekTag(new Date("2026-09-14T03:00:00+09:00")), "2026w38");
  /* KST 로는 월요일 00:30 (UTC 일요일 15:30) — KST 기준으로 38주 */
  assert.equal(promoWeekTag(new Date("2026-09-13T15:30:00Z")), "2026w38");
  /* ISO 연말 규칙: 2027-01-01(금) 은 2026년 53주 */
  assert.equal(promoWeekTag(new Date("2027-01-01T12:00:00+09:00")), "2026w53");
});

/* ------------------------------------------------------------------ */
/* 단지 글                                                               */
/* ------------------------------------------------------------------ */

const FORBIDDEN = ["전망", "급등", "보장", "추천"];

const INPUT: ComplexPostInput = {
  name: "은마",
  region: "서울 강남구",
  url: "https://naezipnow.com/complex/x?utm_source=naver&utm_medium=blog&utm_campaign=complex-2026w38",
  asOfLabel: "2026년 8월 신고분까지",
  trades: [
    { ym: "202608", areaM2: 84.43, avgManwon: 123_000, dealCount: 2 },
    { ym: "202607", areaM2: 84.43, avgManwon: 120_000, dealCount: 1 },
    { ym: "202608", areaM2: 76.79, avgManwon: 110_000, dealCount: 1 },
    { ym: "202606", areaM2: null, areaLabel: "60~85㎡", avgManwon: 118_000, dealCount: 3 },
  ],
  noteCount: 2,
  tradeCount12m: 14,
};

test("summarizeByArea — 평 환산·건수 가중 평균·면적 오름차순", () => {
  const lines = summarizeByArea(INPUT.trades);
  assert.deepEqual(
    lines.map((l) => l.label),
    ["60~85㎡", "77㎡(23평)", "84㎡(26평)"],
  );
  const l84 = lines.find((l) => l.label === "84㎡(26평)")!;
  assert.equal(l84.dealCount, 3);
  assert.equal(l84.avgManwon, 122_000); // (123000*2 + 120000*1) / 3
});

test("renderComplexBlogPost — 출처·투자 권유 아님·링크·수치·금지어 없음", () => {
  const post = renderComplexBlogPost(INPUT);
  assert.equal(post.titles.length, 2);
  assert.ok(post.titles[0].includes("은마"));
  assert.ok(post.titles[0].includes("2026년 8월 신고분까지"));
  const b = post.body;
  assert.ok(b.includes("국토교통부 실거래가 공개시스템 신고분, 취소 거래 제외, 신고 지연 최대 30일"));
  assert.ok(b.includes("투자 권유가 아니"));
  assert.ok(b.endsWith(INPUT.url));
  assert.ok(b.includes("84㎡(26평) 평균 12.2억 · 3건"));
  assert.ok(b.includes("2026.06~2026.08"));
  assert.ok(b.includes("최근 12개월 신고된 매매 거래는 14건"));
  assert.ok(b.includes("임장노트는 2건"));
  assert.ok(b.includes("임장 체크포인트"));
  assert.ok(b.includes("이 단지의 상태를 서술한 것이 아닙니다"));
  for (const w of FORBIDDEN) assert.ok(!b.includes(w), `금지어 포함: ${w}`);
  for (const t of post.titles) for (const w of FORBIDDEN) assert.ok(!t.includes(w), `제목 금지어: ${w}`);
});

test("renderComplexBlogPost — 없는 수치는 문장째 빠진다(0 으로 위장하지 않음)", () => {
  const post = renderComplexBlogPost({ ...INPUT, trades: [], noteCount: null, tradeCount12m: null });
  assert.ok(!post.body.includes("최근 12개월 신고된"));
  assert.ok(!post.body.includes("임장노트는"));
  assert.ok(post.body.includes("매매 거래가 없습니다"));
  assert.ok(post.body.includes("투자 권유가 아니"));
  assert.ok(post.body.endsWith(INPUT.url));
});

test("renderComplexShortPost — 5줄 이하, 마지막 줄은 링크, 금지어 없음", () => {
  const s = renderComplexShortPost(INPUT);
  const lines = s.split("\n");
  assert.ok(lines.length <= 5, `줄 수 ${lines.length}`);
  assert.equal(lines[lines.length - 1], INPUT.url);
  assert.ok(s.includes("최근 12개월 거래 14건"));
  assert.ok(s.includes("투자 권유 아님"));
  for (const w of FORBIDDEN) assert.ok(!s.includes(w), `금지어 포함: ${w}`);
  const noCount = renderComplexShortPost({ ...INPUT, tradeCount12m: null });
  assert.ok(!noCount.includes("최근 12개월"));
  assert.ok(noCount.split("\n").length <= 5);
});

test("hashtagsFor — 공백 제거·중복 제거·최대 8개", () => {
  const tags = hashtagsFor("래미안 원베일리", "서울 서초구");
  assert.ok(tags.includes("래미안원베일리"));
  assert.ok(tags.includes("서울") && tags.includes("서초구"));
  assert.ok(tags.includes("실거래가") && tags.includes("임장") && tags.includes("아파트"));
  assert.ok(tags.length <= 8);
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(tags.every((t) => !t.includes(" ") && !t.includes("#")));
});
