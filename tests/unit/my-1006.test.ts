import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FAILED,
  ONBOARDING_STEP_DEFS,
  buildActivitySummary,
  loaded,
  nextOnboardingStep,
  recentComplexCards,
  sectionState,
  toLoaded,
} from "../../lib/me/my-hub.ts";

/* [1006] 마이 허브 — 로더 결과(실패/0건/n건)를 화면 상태로 옮기는 순수 규칙을 잠근다.
   page.tsx(로더)·MyHubView(화면)는 server-only 모듈을 끌고 들어와 여기서 import 하지 못한다 —
   화면의 "충전 금지"·"빈 상태 그림 한 번" 은 소스 문자열로 잠근다. */

test("toLoaded: 거부는 FAILED, 이행은 값 — 실패를 값으로 바꾸지 않는다", async () => {
  assert.deepEqual(await toLoaded(Promise.resolve([1, 2])), { ok: true, value: [1, 2] });
  let logged: unknown = null;
  const r = await toLoaded(Promise.reject(new Error("db down")), (e) => (logged = e));
  assert.deepEqual(r, FAILED);
  assert.ok(logged instanceof Error);
});

test("sectionState: 실패 / 빈 / 목록 세 상태가 갈린다 · limit 는 목록만 자른다", () => {
  assert.deepEqual(sectionState(FAILED), { kind: "error" });
  assert.deepEqual(sectionState(loaded([])), { kind: "empty" });
  assert.deepEqual(sectionState(loaded([1, 2, 3]), 2), { kind: "items", items: [1, 2] });
  assert.deepEqual(sectionState(loaded([1])), { kind: "items", items: [1] });
});

test("buildActivitySummary: 실패는 '—'(0 이 아니다), 0 은 '0', 포인트는 P 단위·천 단위 구분", () => {
  const items = buildActivitySummary({
    notes: loaded(0),
    watchlist: FAILED,
    savedNotes: loaded(3),
    analyses: loaded(12),
    points: loaded(1250),
  });
  assert.deepEqual(
    items.map((i) => [i.key, i.value, i.failed]),
    [
      ["notes", "0", false],
      ["watchlist", "—", true],
      ["savedNotes", "3", false],
      ["analyses", "12", false],
      ["points", "1,250P", false],
    ],
  );
  /* 각 칸은 그 기록이 있는 화면으로 간다 */
  assert.deepEqual(
    items.map((i) => i.href),
    ["/notes?mine=1", "/my/watchlist", "/notes", "/my/analyses", "/my/points"],
  );
  assert.equal(items.length, 5);
});

test("nextOnboardingStep: 남은 첫 단계 하나 · 순서는 verify.ts 와 같다 · 완주면 null", () => {
  assert.deepEqual(
    ONBOARDING_STEP_DEFS.map((s) => s.id),
    ["explore", "inspection", "share"],
  );
  const first = nextOnboardingStep([]);
  assert.equal(first?.step.id, "explore");
  assert.equal(first?.done, 0);
  assert.equal(first?.total, 3);

  const second = nextOnboardingStep(["explore"]);
  assert.equal(second?.step.id, "inspection");
  assert.equal(second?.done, 1);

  /* 순서를 건너뛰어 완료돼도 남은 첫 항목을 고른다 */
  const skipped = nextOnboardingStep(["inspection"]);
  assert.equal(skipped?.step.id, "explore");
  assert.equal(skipped?.done, 1);

  assert.equal(nextOnboardingStep(["explore", "inspection", "share"]), null);
  /* 모르는 id 는 세지 않는다 */
  assert.equal(nextOnboardingStep(["explore", "bogus"])?.done, 1);
});

test("recentComplexCards: 빈 이름·중복 id 제거 · 상한 · href 는 규칙 함수로", () => {
  const rows = [
    { id: "a", name: "래미안", region: "서울 강남구" },
    { id: "a", name: "래미안(중복)", region: null },
    { id: " ", name: "이름만", region: null },
    { id: "b", name: "  ", region: "x" },
    { id: "c", name: "힐스테이트", region: "  " },
    { id: "d", name: "자이", region: "성남시" },
  ];
  const cards = recentComplexCards(rows, (id) => `/complex/${id}`, 2);
  assert.deepEqual(cards, [
    { id: "a", name: "래미안", region: "서울 강남구", href: "/complex/a" },
    { id: "c", name: "힐스테이트", region: null, href: "/complex/c" },
  ]);
});

/* ── 화면 소스 규칙 ── */
const VIEW = readFileSync(new URL("../../app/my/MyHubView.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../../app/my/page.tsx", import.meta.url), "utf8");

test("마이 화면에 포인트 '충전' 문구가 없다(적립·교환만)", () => {
  for (const src of [VIEW, PAGE]) {
    assert.equal(/충전/.test(src), false);
    assert.equal(/pointToKrw|payoutReady|plan_pro_1m/.test(src), false);
  }
  assert.ok(VIEW.includes('href="/points/shop"'), "포인트 상점 링크는 유지");
});

test("빈 상태 그림(EmptyState)은 마이 화면에서 한 번만 쓴다", () => {
  const uses = VIEW.match(/<EmptyState\b/g) ?? [];
  assert.equal(uses.length, 1);
});

test("보관(비노출) 경로로 가는 입구를 다시 만들지 않는다", () => {
  for (const p of ["/my/expert-profile", "/my/consultations", "/my/leads"]) {
    assert.equal(VIEW.includes(`href="${p}"`), false, p);
    assert.equal(VIEW.includes(`href: "${p}"`), false, p);
  }
});

test("로더는 실패를 빈 배열로 누르지 않는다 — Loaded 로 넘긴다", () => {
  /* 예전 코드: `savedNotesLoaded.ok ? notes : []` 가 화면에 그대로 갔다 */
  assert.ok(PAGE.includes("toLoaded(listNotes(email)"));
  assert.ok(PAGE.includes("toLoaded(countWatchlist(email)"));
  assert.ok(PAGE.includes("toLoaded(countRunsTotal(email)"));
  assert.ok(PAGE.includes("toLoaded(listRecentComplexes(email"));
  assert.ok(PAGE.includes("toLoaded(getBalance(email)"));
});
