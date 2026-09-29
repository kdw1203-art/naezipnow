/* [1025 · 결정·비서] 순수 규칙 잠금 — 점수(min-max 가중합) · 동점/값 없음/자료 없음 규칙 · verdict 파싱 · 결정 저장 검증 ·
   후보 모델(detail 응답 → 카드) · 수신함 종류 판정(크론 제목 리터럴) · 최근 7일 집계 · D-day · 페이지 배선. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_DECIDE_WEIGHTS,
  parseDecideWeights,
  parseDecisionInput,
  parseDecisionList,
  parseVerdict,
  scoreCandidates,
  topCandidates,
  usedWeightsLine,
  weightsFromPriorities,
  type DecideCandidateMetrics,
} from "../../lib/decide/score.ts";
import { candidateFromDetail, candidateMetaLine, latestBasisYm } from "../../lib/decide/candidate.ts";
import {
  assistantLine,
  countWeekly,
  dDayLabel,
  daysUntil,
  inboxKindOf,
  nextContractDate,
  txCountFromTitle,
  weekRangeLabel,
  weekStrip,
} from "../../lib/assistant/weekly.ts";
import {
  RADAR_CX,
  RADAR_CY,
  RADAR_MIN_RATIO,
  RADAR_R,
  RING_R,
  decideRadar,
  radarAxisValues,
  radarLabel,
  radarPoint,
  radarRing,
  radarSeriesPoints,
  ringDash,
  scoreOutOf100,
} from "../../lib/decide/radar-geometry.ts";
import { axisRankOf, rankBarGroups, rankBarRatio } from "../../lib/decide/rank-bars.ts";
import { dealDayLabel, dealTime, watchSeriesFromDeals } from "../../lib/assistant/watch-series.ts";

const ROOT = join(import.meta.dirname ?? ".", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const A: DecideCandidateMetrics = { id: "a", name: "A", priceKrw: 550_000_000, jeonsePct: 46.5, count12m: 152, schoolM: null };
const B: DecideCandidateMetrics = { id: "b", name: "B", priceKrw: 765_000_000, jeonsePct: null, count12m: null, schoolM: null };
const C: DecideCandidateMetrics = { id: "c", name: "C", priceKrw: 950_000_000, jeonsePct: null, count12m: null, schoolM: null };

test("점수 — 가격만 값이 셋 있으면 가격 축만 쓰고, 나머지는 값이 한 곳뿐(single)·학교는 자료 없음(unavailable)", () => {
  const r = scoreCandidates([A, B, C], DEFAULT_DECIDE_WEIGHTS, { schoolAvailable: false });
  assert.deepEqual(r.used, ["price"]);
  assert.deepEqual(
    r.dropped.map((d) => `${d.key}:${d.reason}`),
    ["jeonse:single", "volume:single", "school:unavailable"],
  );
  assert.equal(r.ranked[0].id, "a");
  assert.equal(r.ranked[0].score, 100);
  assert.equal(r.ranked[2].id, "c");
  assert.equal(r.ranked[2].score, 0);
  /* min-max: (950-765)/(950-550) = 0.4625 → 46.3 */
  assert.equal(r.ranked[1].score, 46.3);
  assert.deepEqual(r.ranked[0].leads, ["price"]);
  assert.equal(usedWeightsLine(r, DEFAULT_DECIDE_WEIGHTS), "가격 5");
});

test("점수 — 가중치 0 은 off, 값이 전부 같은 축은 same, 값 없는 후보는 그 축을 빼고 남은 축으로만 평균(0점 아님)", () => {
  const X: DecideCandidateMetrics = { id: "x", name: "X", priceKrw: 100, jeonsePct: 50, count12m: 10, schoolM: 300 };
  const Y: DecideCandidateMetrics = { id: "y", name: "Y", priceKrw: 200, jeonsePct: 50, count12m: null, schoolM: 600 };
  const Z: DecideCandidateMetrics = { id: "z", name: "Z", priceKrw: 300, jeonsePct: 50, count12m: 30, schoolM: 900 };
  const r = scoreCandidates([X, Y, Z], { price: 10, jeonse: 5, volume: 0, school: 5 }, { schoolAvailable: true });
  assert.deepEqual(r.used, ["price", "school"]);
  assert.deepEqual(
    r.dropped.map((d) => `${d.key}:${d.reason}`),
    ["jeonse:same", "volume:off"],
  );
  /* Y: 가격 0.5·10 + 학교 0.5·5 → 0.5 → 50점 */
  const y = r.ranked.find((s) => s.id === "y")!;
  assert.equal(y.score, 50);
  assert.deepEqual(y.missing, []);
  /* volume 을 켜면 Y 는 volume 값이 없어 missing 에 적히고, 나머지 축 평균만 */
  const r2 = scoreCandidates([X, Y, Z], { price: 10, jeonse: 0, volume: 5, school: 0 }, { schoolAvailable: true });
  const y2 = r2.ranked.find((s) => s.id === "y")!;
  assert.deepEqual(y2.missing, ["volume"]);
  assert.equal(y2.score, 50);
});

test("동점 — 같은 점수는 같은 순위(공동 1위), 후보가 한 곳이면 순위 없음", () => {
  const P: DecideCandidateMetrics = { id: "p", name: "P", priceKrw: 100, jeonsePct: 40, count12m: null, schoolM: null };
  const Q: DecideCandidateMetrics = { id: "q", name: "Q", priceKrw: 200, jeonsePct: 60, count12m: null, schoolM: null };
  const r = scoreCandidates([P, Q], { price: 5, jeonse: 5, volume: 5, school: 5 }, { schoolAvailable: false });
  assert.equal(r.ranked[0].rank, 1);
  assert.equal(r.ranked[1].rank, 1);
  assert.equal(topCandidates(r).length, 2);
  const one = scoreCandidates([P], DEFAULT_DECIDE_WEIGHTS);
  assert.equal(one.ranked[0].score, null);
  assert.equal(one.ranked[0].rank, null);
  assert.deepEqual(topCandidates(one), []);
});

test("가중치 파싱 — 0~10 정수로 자르고 모르는 키는 버린다 · 페르소나 우선순위(0~100)는 가격·학교만 /10", () => {
  assert.deepEqual(parseDecideWeights('{"price":"7","jeonse":99,"volume":-3,"school":4.6,"x":1}'), { price: 7, jeonse: 10, volume: 0, school: 5 });
  assert.deepEqual(parseDecideWeights("not json"), DEFAULT_DECIDE_WEIGHTS);
  assert.deepEqual(weightsFromPriorities({ price: 75, school: 25, transport: 60, future: 70 }), { price: 8, jeonse: 5, volume: 5, school: 3 });
  assert.deepEqual(weightsFromPriorities(null), DEFAULT_DECIDE_WEIGHTS);
});

test("verdict 파싱 — 키·라벨 둘 다 받고 그 밖은 null", () => {
  assert.equal(parseVerdict("buy"), "buy");
  assert.equal(parseVerdict("다시 보기"), "revisit");
  assert.equal(parseVerdict("살까"), "buy");
  assert.equal(parseVerdict("sell"), null);
  assert.equal(parseVerdict(3), null);
});

test("결정 저장 검증 — 후보 중복 제거·최대 3·chosenId 는 후보 안에 있을 때만·메모 200자", () => {
  const ok = parseDecisionInput({
    complexIds: ["a", "a", "b", "c", "d"],
    chosenId: "b",
    verdict: "hold",
    memo: " x".repeat(150),
    weights: { price: 9 },
  });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.value.complexIds, ["a", "b", "c"]);
    assert.equal(ok.value.chosenId, "b");
    assert.equal(ok.value.memo!.length, 200);
    assert.equal(ok.value.weights.price, 9);
    assert.equal(ok.value.weights.school, 5);
  }
  const out = parseDecisionInput({ complexIds: ["a"], chosenId: "zzz", verdict: "pass" });
  assert.ok(out.ok && out.value.chosenId === null);
  assert.equal(parseDecisionInput({ complexIds: [], verdict: "buy" }).ok, false);
  assert.equal(parseDecisionInput({ complexIds: ["a"], verdict: "nope" }).ok, false);
});

test("게스트 결정 목록 — 틀린 행은 버리고 최신순", () => {
  const list = parseDecisionList(
    JSON.stringify([
      { id: "1", complexIds: ["a"], verdict: "buy", createdAt: "2026-09-01T00:00:00Z" },
      { id: "2", complexIds: ["a"], verdict: "pass", createdAt: "2026-09-20T00:00:00Z", memo: "m" },
      { id: "3", complexIds: ["a"], verdict: "nope", createdAt: "2026-09-21T00:00:00Z" },
      null,
    ]),
  );
  assert.deepEqual(
    list.map((d) => d.id),
    ["2", "1"],
  );
  assert.equal(list[0].memo, "m");
  assert.deepEqual(parseDecisionList("{"), []);
});

test("후보 모델 — detail 응답의 있는 칸만 읽고 없는 칸은 null · 갭 = 매매 중앙 − 전세 중앙(6개월 창)", () => {
  const c = candidateFromDetail("id1", "폴백", {
    mode: "db",
    complex: { name: "공작아파트", city: "안양시", district: "동안구", households: 1710, lat: 37.39, lng: 126.97 },
    facts: {
      tradeSummary: { count: 152, medianKrw: 550_000_000, fromYm: "202510", toYm: "202609" },
      jeonseRatio: { pct: 46.5, jeonseMedianKrw: 255_000_000, tradeMedianKrw: 548_000_000 },
    },
    areaBands: [
      { label: "~40㎡", latestManwon: 55_000, latestYm: "202608" },
      { label: "40~60㎡", latestManwon: 60_000, latestYm: "202607" },
    ],
  });
  assert.equal(c.status, "ok");
  assert.equal(c.name, "공작아파트");
  assert.equal(c.priceKrw, 550_000_000);
  assert.equal(c.jeonsePct, 46.5);
  assert.equal(c.count12m, 152);
  assert.equal(c.gapKrw, 293_000_000);
  assert.deepEqual(c.latest, { krw: 550_000_000, ym: "202608", band: "~40㎡" });
  assert.equal(candidateMetaLine(c), "안양시 동안구 · 1,710세대");
  assert.equal(latestBasisYm([c]), "202609");
  const nf = candidateFromDetail("id2", "없는 단지", { mode: "not_found", complex: null });
  assert.equal(nf.status, "not_found");
  assert.equal(nf.priceKrw, null);
  const bare = candidateFromDetail("id3", "값 없음", { complex: { name: "X" }, facts: { tradeSummary: null, jeonseRatio: null }, areaBands: [] });
  assert.equal(bare.status, "ok");
  assert.equal(bare.gapKrw, null);
  assert.equal(bare.latest, null);
  assert.equal(candidateMetaLine(bare), null);
});

test("수신함 종류 — 크론 4개가 적는 제목 리터럴이 소스에 그대로 있고, 판정이 그 제목을 가른다", () => {
  assert.ok(read("app/api/cron/watchlist-new-tx/route.ts").includes("관심단지 새 실거래 ${total}건"));
  assert.ok(read("app/api/cron/price-alerts/route.ts").includes('"관심 단지 가격 변동"'));
  assert.ok(read("app/api/cron/saved-search-alerts/route.ts").includes('"저장검색 새 결과"'));
  assert.ok(read("app/api/cron/weekly-digest/route.ts").includes("주간 다이제스트"));
  assert.ok(read("lib/digest/personal-format.ts").includes("이번 주 내 요약"));
  assert.equal(inboxKindOf({ title: "관심단지 새 실거래 3건" }), "tx");
  assert.equal(inboxKindOf({ title: "관심 단지 가격 변동" }), "price");
  assert.equal(inboxKindOf({ title: "공작아파트 가격 변동 알림" }), "price");
  assert.equal(inboxKindOf({ title: "저장검색 새 결과" }), "saved");
  assert.equal(inboxKindOf({ title: "2026-W39 주간 다이제스트" }), "digest");
  assert.equal(inboxKindOf({ title: "이번 주 내 요약 — 관심 단지 2곳" }), "digest");
  assert.equal(inboxKindOf({ title: "2026-W39 내 주간 요약" }), "digest");
  assert.equal(inboxKindOf({ title: "요약", actionUrl: "/digest" }), "digest");
  assert.equal(inboxKindOf({ title: "댓글이 달렸어요" }), "other");
});

test("최근 7일 집계 — 창 밖·못 읽는 시각은 세지 않고 종류별로 나눈다", () => {
  const now = new Date("2026-09-29T06:00:00Z");
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const c = countWeekly(
    [
      { title: "관심단지 새 실거래 2건", createdAt: at(1) },
      { title: "관심 단지 가격 변동", createdAt: at(30) },
      { title: "저장검색 새 결과", createdAt: at(24 * 6) },
      { title: "2026-W39 주간 다이제스트", createdAt: at(24 * 7 + 1) },
      { title: "댓글", createdAt: at(2) },
      { title: "관심단지 새 실거래 1건", createdAt: "not-a-date" },
    ],
    now,
  );
  assert.deepEqual([c.tx, c.price, c.saved, c.digest, c.other, c.total], [1, 1, 1, 0, 1, 4]);
  assert.equal(weekRangeLabel(c), "2026-09-22 ~ 09-29");
});

test("D-day — KST 달력 기준, 계약 일정표에서 오늘 이후 가장 가까운 날짜 하나", () => {
  const now = new Date("2026-09-29T06:00:00Z"); // KST 15:00
  assert.equal(daysUntil("2026-09-29", now), 0);
  assert.equal(daysUntil("2026-10-02", now), 3);
  assert.equal(daysUntil("2026-09-28", now), -1);
  assert.equal(daysUntil("2026-09-29T23:30:00+09:00", now), 0);
  assert.equal(daysUntil("2026-09-29T15:30:00Z", now), 1); // KST 30일 00:30
  assert.equal(daysUntil(null, now), null);
  assert.equal(dDayLabel(0), "D-day");
  assert.equal(dDayLabel(3), "D-3");
  assert.equal(dDayLabel(-2), "D+2");
  assert.equal(dDayLabel(null), "—");
  const next = nextContractDate({ contractDate: "2026-09-20", midDate: "2026-10-10", balanceDate: "2026-10-05", moveInDate: null }, now);
  assert.deepEqual(next, { label: "잔금", date: "2026-10-05", days: 6 });
  assert.equal(nextContractDate(null, now), null);
  assert.equal(nextContractDate({ contractDate: "2026-09-01", midDate: null, balanceDate: null, moveInDate: null }, now), null);
});

test("배선 — /decide · /my/assistant · API · 마이 링크 · 면책 · 마이그레이션 권한", () => {
  const decide = read("app/decide/DecideClient.tsx");
  assert.equal(decide.match(/btn-primary/g)?.length, 1, "채움 파랑은 결정 저장 하나");
  assert.ok(decide.includes("AI_DISCLAIMER"));
  assert.ok(decide.includes('type="range"'));
  assert.ok(decide.includes("/api/me/decisions"));
  assert.ok(decide.includes("/api/decide/school"));
  /* [1025b] 빈 상태는 카드 하나 · 레일·하단 바는 후보 2곳의 값이 있을 때만(ready) · 세그먼트는 chip-active(네이비 채움 없음) ·
     폰의 유일한 행동은 MobilePrimaryBar · 섹션 점은 파랑 하나 · 내부 용어(비교 트레이·POI) 없음 */
  assert.ok(decide.includes("후보를 담으면 내 기준으로 순위가 나옵니다"));
  assert.ok(decide.includes("{ready && (\n          <aside"), "레일은 ready 일 때만");
  assert.ok(decide.includes('{ready && <MobilePrimaryBar label="결정 저장">{saveButton}</MobilePrimaryBar>}'));
  assert.ok(decide.includes('className="nz-dot-blue"'));
  assert.ok(!decide.includes("bg-brand-navy"), "네이비 채움 세그먼트 없음");
  assert.ok(!decide.includes("비교 트레이") && !decide.includes("POI"), "내부 용어 없음");
  const assistant = read("app/my/assistant/page.tsx");
  assert.equal(assistant.match(/btn-primary/g)?.length, 1, "채움 파랑은 AgentChat 링크 하나");
  assert.ok(assistant.includes('redirect(`/login?callbackUrl=${encodeURIComponent("/my/assistant")}`)'));
  assert.ok(assistant.includes("AI_DISCLAIMER"));
  /* [1025b] 3블록 · 접힌 일정 폼 · 채널은 글자(토글 모양 njn-switch 없음) · 하단 바 · 섹션 점 파랑 */
  assert.ok(assistant.includes("<details") && assistant.includes("일정 추가"));
  assert.ok(!assistant.includes("njn-switch"), "읽기 전용 토글 모양 없음");
  assert.ok(assistant.includes("이번 주 알림 없음 · 관심 단지를 담으면 새 실거래·가격 변동을 알립니다"));
  assert.ok(assistant.includes('<MobilePrimaryBar label="비서에게 묻기">{openChat}</MobilePrimaryBar>'));
  assert.ok(assistant.includes('className="nz-dot-blue"'));
  assert.ok(read("app/my/assistant/ScheduleForm.tsx").includes('"/api/inspection/schedule"'));
  const css = read("app/globals.css");
  assert.ok(css.includes("[1025b · 결정·비서]") && css.includes("body.nz-has-primarybar") && css.includes("main .nz-dot-blue :is(section, article)"));
  const my = read("app/my/page.tsx");
  assert.ok(my.includes('href: "/decide"') && my.includes('href: "/my/assistant"'));
  const sql = read("supabase/migrations/20260929104418_1025_user_decisions.sql");
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.user_decisions from anon, authenticated"));
  assert.ok(sql.includes("grant all on public.user_decisions to service_role"));
  assert.ok(sql.includes("check (verdict in ('buy', 'hold', 'pass', 'revisit'))"));
  assert.ok(!sql.includes("create policy"));
});

/* ── [1025c] 대표 그림 — 레이더 기하 · 점수→100 · 순위 막대 · 7일 집계 · 30일 줄 ─────────────── */

test("[1025c] 레이더 기하 — 12시부터 시계 방향 · 반지름 78 · 라벨 정렬 · 값 없음은 하한 자리", () => {
  const top = radarPoint(0, 3, 1);
  assert.equal(top.x, RADAR_CX);
  assert.equal(top.y, RADAR_CY - RADAR_R);
  const right = radarPoint(1, 3, 1);
  assert.ok(right.x > RADAR_CX && right.y > RADAR_CY, "둘째 축은 오른쪽 아래");
  const left = radarPoint(2, 3, 1);
  assert.ok(left.x < RADAR_CX && Math.abs(left.y - right.y) < 0.2, "셋째 축은 왼쪽 아래 · 둘째와 같은 높이");
  assert.equal(radarRing(3, 1).split(" ").length, 3);
  assert.equal(radarRing(4, 0.5).split(" ").length, 4);
  assert.equal(radarLabel(0, 3).anchor, "middle");
  assert.equal(radarLabel(1, 3).anchor, "start");
  assert.equal(radarLabel(2, 3).anchor, "end");
  const pts = radarSeriesPoints([1, null, 0]);
  assert.deepEqual(pts[0], top);
  const floor = radarPoint(1, 3, RADAR_MIN_RATIO);
  assert.deepEqual(pts[1], floor, "null 은 하한(0.02R) 자리에 점");
  assert.deepEqual(pts[2], radarPoint(2, 3, RADAR_MIN_RATIO), "0 도 하한 자리");
});

test("[1025c] 레이더 축 값 — score.ts 와 같은 min-max · 값이 한 곳뿐이면 그 곳 1 · 없으면 null · 학교 없으면 3축", () => {
  assert.deepEqual(radarAxisValues([A, B, C], "price"), [1, 0.4625, 0]);
  assert.deepEqual(radarAxisValues([A, B, C], "jeonse"), [1, null, null]);
  assert.deepEqual(radarAxisValues([A, B, C], "school"), [null, null, null]);
  const r = scoreCandidates([A, B, C], DEFAULT_DECIDE_WEIGHTS, { schoolAvailable: false });
  const radar = decideRadar([A, B, C], r);
  assert.ok(radar);
  assert.deepEqual(
    radar!.axes.map((a) => `${a.key}:${a.scored ? 1 : 0}`),
    ["price:1", "jeonse:0", "volume:0"],
    "학교는 축에서 빠지고, 값이 한 곳뿐인 전세가율·거래량은 그리되 점수 제외 표시",
  );
  assert.deepEqual(radar!.series.map((s) => s.values), [
    [1, 1, 1],
    [0.4625, null, null],
    [0, null, null],
  ]);
  /* 가중치 0 축은 그림에서도 뺀다 → 2축이면 레이더 없음 */
  const off = scoreCandidates([A, B, C], { ...DEFAULT_DECIDE_WEIGHTS, jeonse: 0 }, { schoolAvailable: false });
  assert.equal(decideRadar([A, B, C], off), null);
  /* 학교 자료가 있으면 4축 */
  const withSchool = [
    { ...A, schoolM: 300 },
    { ...B, schoolM: 500 },
    { ...C, schoolM: 900 },
  ];
  const r4 = scoreCandidates(withSchool, DEFAULT_DECIDE_WEIGHTS, { schoolAvailable: true });
  assert.equal(decideRadar(withSchool, r4)!.axes.length, 4);
});

test("[1025c] 점수 → 0~100 · 원형 게이지 dasharray", () => {
  assert.equal(scoreOutOf100(82.3), 82);
  assert.equal(scoreOutOf100(100), 100);
  assert.equal(scoreOutOf100(0), 0);
  assert.equal(scoreOutOf100(140), 100, "범위 밖은 자른다");
  assert.equal(scoreOutOf100(null), null);
  assert.equal(scoreOutOf100(0.82, "unit"), 82, "0~1 은 명시할 때만 100배");
  const r = scoreCandidates([A, B, C], DEFAULT_DECIDE_WEIGHTS, { schoolAvailable: false });
  assert.equal(scoreOutOf100(r.ranked[0].score), 100, "score.ts 점수는 이미 0~100 — 그대로");
  const full = ringDash(100);
  assert.equal(full.circumference, Math.round(2 * Math.PI * RING_R * 10) / 10);
  assert.equal(full.dash, full.circumference);
  assert.equal(ringDash(0).dash, 0);
  assert.equal(ringDash(50).dash, Math.round((full.circumference / 2) * 10) / 10);
  assert.equal(ringDash(Number.NaN).dash, 0);
});

test("[1025c] 기준별 순위 막대 — 값 비례 길이(낮을수록 앞은 최소÷값) · 값 없음은 — 맨 뒤 · 1순위 자리 줄", () => {
  assert.equal(rankBarRatio(550_000_000, [550_000_000, 765_000_000, 950_000_000], "low"), 1);
  assert.equal(rankBarRatio(765_000_000, [550_000_000, 765_000_000, 950_000_000], "low"), 0.719);
  assert.equal(rankBarRatio(152, [152, null, null], "high"), 1);
  assert.equal(rankBarRatio(null, [152, null, null], "high"), 0);
  const groups = rankBarGroups([A, B, C], ["price", "jeonse", "volume"]);
  assert.deepEqual(groups.map((g) => g.label), ["가격", "전세가율", "거래량"]);
  assert.deepEqual(groups[0].rows.map((r) => `${r.id}:${r.rank}`), ["a:1", "b:2", "c:3"]);
  assert.deepEqual(groups[1].rows.map((r) => `${r.id}:${r.rank}`), ["a:1", "b:null", "c:null"]);
  assert.equal(groups[1].rows[1].ratio, 0);
  assert.deepEqual(
    axisRankOf(groups, "a").map((r) => `${r.label} ${r.rank}`),
    ["가격 1", "전세가율 1", "거래량 1"],
  );
  /* 공동 순위 */
  const tie = rankBarGroups([A, { ...B, priceKrw: A.priceKrw }, C], ["price"]);
  assert.deepEqual(tie[0].rows.map((r) => r.rank), [1, 1, 3]);
});

test("[1025c] 이번 주 7일 — 월~일 KST · 오늘 표시 · 날짜별 알림 수 · 새 실거래 제목의 건수 합 · 비서 한 줄", () => {
  const now = new Date("2026-09-29T06:00:00Z"); // KST 화 15:00
  const rows = [
    { title: "관심단지 새 실거래 3건", createdAt: "2026-09-28T01:00:00Z" }, // 월 KST 10:00
    { title: "관심단지 새 실거래 2건", createdAt: "2026-09-27T16:00:00Z" }, // 월 KST 01:00 (UTC 는 일요일)
    { title: "관심 단지 가격 변동", createdAt: "2026-09-29T03:00:00Z" }, // 화
    { title: "저장검색 새 결과", createdAt: "2026-09-29T04:00:00Z" }, // 화
    { title: "관심 단지 가격 변동", createdAt: "2026-09-27T10:00:00Z" }, // 지난주 일 — 밖
    { title: "관심단지 새 실거래 9건", createdAt: "bad" },
  ];
  const w = weekStrip(rows, now);
  assert.deepEqual(w.days.map((d) => d.date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(w.days.map((d) => d.dow), ["월", "화", "수", "목", "금", "토", "일"]);
  assert.deepEqual(w.days.map((d) => d.today), [false, true, false, false, false, false, false]);
  assert.deepEqual(w.days.map((d) => d.future), [false, false, true, true, true, true, true]);
  assert.deepEqual(w.days.map((d) => d.count), [2, 2, 0, 0, 0, 0, 0]);
  assert.equal(w.txNotices, 2);
  assert.equal(w.txDeals, 5, "제목의 N건을 더한다");
  assert.equal(w.price, 1);
  assert.equal(w.total, 4);
  assert.equal(w.rangeLabel, "2026-09-28 ~ 10-04");
  assert.equal(txCountFromTitle("관심단지 새 실거래 12건"), 12);
  assert.equal(txCountFromTitle("관심단지 새 실거래"), 1);
  assert.equal(txCountFromTitle("관심 단지 가격 변동"), 0);
  /* 일요일 KST 밤 — 이번 주 = 지난 월요일부터 */
  const sun = new Date("2026-10-04T14:30:00Z"); // KST 일 23:30
  assert.equal(weekStrip([], sun).days[0].date, "2026-09-28");
  assert.equal(weekStrip([], sun).days[6].today, true);
  assert.equal(
    assistantLine({ watchCount: 6, txDeals: 5, price: 1, nextInspectionDays: 3 }),
    "이번 주 관심 단지 6곳 중 새 실거래 5건 · 가격 변동 1건 · 다음 임장 D-3",
  );
  assert.equal(
    assistantLine({ watchCount: null, txDeals: 0, price: 0, nextInspectionDays: null }),
    "이번 주 관심 단지 새 실거래 0건 · 가격 변동 0건 · 다음 임장 없음",
  );
  assert.equal(assistantLine({ watchCount: 2, txDeals: 0, price: 0, nextInspectionDays: 0 }).endsWith("다음 임장 D-day"), true);
});

test("[1025c] 관심 단지 30일 줄 — 마지막 거래 · 30일 새 거래 수 · 스파크는 2건 이상일 때만(가짜 선 없음)", () => {
  const now = new Date("2026-09-29T06:00:00Z");
  const deals = [
    { ym: "202608", day: 29, man: 55_000, area: 38.2, floor: 6 },
    { ym: "202605", day: 3, man: 52_000, area: 38.2, floor: 2 },
  ];
  const s = watchSeriesFromDeals(deals, now);
  assert.deepEqual(s.last, { man: 55_000, ym: "202608", day: 29, area: 38.2, floor: 6 });
  assert.equal(s.count30, 0, "8-29 는 30일 밖(9-29 기준 8-30부터)");
  assert.equal(s.spark, null);
  const one = watchSeriesFromDeals([...deals, { ym: "202609", day: 20, man: 56_000, area: null, floor: null }], now);
  assert.equal(one.count30, 1);
  assert.equal(one.spark, null, "1건은 선이 아니다");
  assert.equal(one.last!.man, 56_000);
  const two = watchSeriesFromDeals(
    [...deals, { ym: "202609", day: 20, man: 56_000, area: null, floor: null }, { ym: "202609", day: 5, man: 54_000, area: null, floor: null }],
    now,
  );
  assert.equal(two.count30, 2);
  assert.deepEqual(two.spark, [54_000, 56_000], "날짜순");
  assert.deepEqual(watchSeriesFromDeals([], now), { last: null, count30: 0, spark: null });
  assert.equal(dealTime({ ym: "202609", day: null }), Date.parse("2026-09-01T00:00:00+09:00"), "계약일 없으면 1일");
  assert.ok(Number.isNaN(dealTime({ ym: "2026", day: 1 })));
  assert.equal(dealDayLabel({ ym: "202608", day: 29 }), "08-29");
  assert.equal(dealDayLabel({ ym: "202608", day: null }), "08");
  assert.equal(dealDayLabel(null), "—");
});

test("[1025c] 배선 — 레이더·게이지·순위 막대·아이콘 칩·타임라인 · 비서 아바타·7일 스트립·스파크·담기", () => {
  const decide = read("app/decide/DecideClient.tsx");
  assert.ok(decide.includes("DecideRadarSvg") && decide.includes("ScoreRing") && decide.includes("DecideRankBars") && decide.includes("TimelineItem"));
  assert.ok(decide.includes('{ buy: "check", hold: "clock", pass: "x", revisit: "repeat" }'), "결정 칩 아이콘");
  assert.ok(decide.includes("RadarGhost"), "빈 상태 회색 견본");
  assert.equal(decide.match(/btn-primary/g)?.length, 1);
  const viz = read("app/decide/DecideViz.tsx");
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(viz), "토큰 색만(raw hex 없음)");
  assert.ok(!viz.includes("gradient"));
  const assistant = read("app/my/assistant/page.tsx");
  assert.ok(assistant.includes('<ToolGlyph id="agent"') && assistant.includes("assistantLine("));
  assert.ok(assistant.includes("DayStrip") && assistant.includes("loadWeekStrip") && assistant.includes("loadWatchSeries"));
  assert.ok(assistant.includes("<Spark ") && assistant.includes("sr?.spark ?"), "스파크는 값이 있을 때만");
  assert.ok(assistant.includes("<WatchAddForm"));
  assert.equal(assistant.match(/btn-primary/g)?.length, 1);
  assert.ok(read("app/my/assistant/WatchAddForm.tsx").includes('"/api/me/watchlist"'));
});
