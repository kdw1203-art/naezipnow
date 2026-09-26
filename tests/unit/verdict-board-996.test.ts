import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_TOOLS,
  BOARD_TOOL_LABEL,
  boardConsensus,
  summarizeForBoard,
  type BoardItem,
} from "../../lib/ai/verdict-board.ts";
import { verdictNoteMemo, verdictNextActions } from "../../lib/ai/next-action-routing.ts";
import type { Verdict } from "../../lib/ai/verdict.ts";

/* [996] 종합 판단 보드 — 구간만 세는 합의 문장과 카드 → 미니 카드 요약, 판단 → 노트 메모. */

const item = (tool: BoardItem["tool"], band: BoardItem["band"]): BoardItem => ({
  tool,
  band,
  bandLabel: { strong: "좋음", mixed: "보통", weak: "주의", thin: "자료 부족" }[band],
});

const verdict: Verdict = {
  tool: "ai-diagnosis",
  band: "strong",
  bandLabel: "좋음",
  headline: "은마: 5개 항목이 고르게 좋아요 — 특히 거래 활발(82점).",
  metric: { label: "투자 점수", value: "71", unit: "점", note: "5/5축 측정 평균", asOf: "202608" },
  numbers: [
    { key: "price", label: "대표 실거래가 (84㎡)", value: "24.5억", asOf: "202608", source: "국토부", confidence: "ok" },
    { key: "change", label: "지역 월간 변동", value: "+0.8%", asOf: "202608", source: "국토부", confidence: "ok" },
    { key: "trades", label: "지역 월 거래", value: "312건", asOf: "202608", source: "국토부", confidence: "ok" },
    { key: "supply", label: "입주 예정", value: "396세대", asOf: "2026-09-01", source: "청약홈", confidence: "ok" },
  ],
  evidence: [],
  counters: [],
  computedAt: "2026-09-13T15:30:00.000Z",
};

test("보드는 네 도구 — 허브 핵심 4종에서 동선 대신 리스크 점검", () => {
  assert.deepEqual([...BOARD_TOOLS], ["ai-diagnosis", "ai-prediction", "ai-timing", "ai-risk"]);
  for (const t of BOARD_TOOLS) assert.ok(BOARD_TOOL_LABEL[t].length >= 2);
});

test("summarizeForBoard — 구간·결론·대표 수치를 그대로 옮기고 새 수치를 만들지 않는다", () => {
  const s = summarizeForBoard(verdict);
  assert.equal(s.band, "strong");
  assert.equal(s.bandLabel, "좋음");
  assert.equal(s.headline, verdict.headline);
  assert.deepEqual(s.metric, { label: "투자 점수", value: "71", unit: "점", asOf: "202608" });
  assert.equal(summarizeForBoard({ ...verdict, metric: null }).metric, null);
});

test("summarizeForBoard — stripName 은 '{단지명}: ' 머리만 뗀다", () => {
  assert.equal(summarizeForBoard(verdict, { stripName: "은마" }).headline, "5개 항목이 고르게 좋아요 — 특히 거래 활발(82점).");
  assert.equal(summarizeForBoard(verdict, { stripName: "래미안" }).headline, verdict.headline);
});

test("boardConsensus — 2개 미만이면 null(한 눈으로 합의를 말하지 않는다)", () => {
  assert.equal(boardConsensus([]), null);
  assert.equal(boardConsensus([item("ai-diagnosis", "strong")]), null);
});

test("boardConsensus — 전부 같으면 '모두'", () => {
  const c = boardConsensus([item("ai-diagnosis", "strong"), item("ai-prediction", "strong"), item("ai-timing", "strong"), item("ai-risk", "strong")]);
  assert.deepEqual(c, { line: "4개 도구 모두 '좋음'", agree: 4, total: 4 });
});

test("boardConsensus — 과반이면 '중 n개' + 나머지를 '만' 으로", () => {
  const c = boardConsensus([item("ai-diagnosis", "strong"), item("ai-prediction", "strong"), item("ai-timing", "strong"), item("ai-risk", "weak")]);
  assert.deepEqual(c, { line: "4개 도구 중 3개가 '좋음' · 리스크 점검만 '주의'", agree: 3, total: 4 });
});

test("boardConsensus — 2:2 는 과반이 아니다 → '도구마다 달라요' 와 양쪽 도구 이름", () => {
  const c = boardConsensus([item("ai-diagnosis", "strong"), item("ai-prediction", "strong"), item("ai-timing", "weak"), item("ai-risk", "weak")]);
  assert.equal(c?.line, "도구마다 달라요 — 종합 진단·시세 예측 '좋음' · 매수 타이밍·리스크 점검 '주의'");
  assert.equal(c?.agree, 2);
  assert.equal(c?.total, 4);
});

test("boardConsensus — 셋만 도착해도 센다(총수는 도착한 수) · 자료 부족도 한 구간이다", () => {
  const c = boardConsensus([item("ai-diagnosis", "mixed"), item("ai-timing", "mixed"), item("ai-risk", "thin")]);
  assert.deepEqual(c, { line: "3개 도구 중 2개가 '보통' · 리스크 점검만 '자료 부족'", agree: 2, total: 3 });
});

test("verdictNoteMemo — 'AI {도구} {한국 날짜}: 결론' + 핵심 숫자 ≤3 을 '라벨 값(기준일)' 줄로", () => {
  const memo = verdictNoteMemo({ tool: "ai-diagnosis", verdict });
  const lines = memo.split("\n");
  /* computedAt 15:30Z 는 한국 시간으로 14일 00:30 — 서버(UTC)에서도 한국 날짜를 적는다 */
  assert.equal(lines[0], "AI 종합 진단 2026.09.14: 은마: 5개 항목이 고르게 좋아요 — 특히 거래 활발(82점).");
  assert.equal(lines.length, 4);
  assert.equal(lines[1], "대표 실거래가 (84㎡) 24.5억(2026.08)");
  assert.equal(lines[3], "지역 월 거래 312건(2026.08)");
  assert.ok(memo.length <= 600);
});

test("verdictNoteMemo — 600자를 넘지 않는다", () => {
  const long = { ...verdict, headline: "가".repeat(900) };
  assert.equal(verdictNoteMemo({ tool: "ai-timing", verdict: long, now: new Date("2026-09-13T03:00:00Z") }).length, 600);
});

test("verdictNextActions — 핵심 4종은 노트 이관이 1순위, 단지 홈이 2순위", () => {
  const a = verdictNextActions({ tool: "ai-prediction", verdict, complexId: "abc", complexName: "은마", region: "강남구", now: new Date("2026-09-13T03:00:00Z") });
  assert.equal(a.primary.label, "이 판단으로 임장노트 쓰기");
  const url = new URL(a.primary.href, "https://x.test");
  assert.equal(url.pathname, "/notes/new");
  assert.equal(url.searchParams.get("apt"), "은마");
  assert.equal(url.searchParams.get("region"), "강남구");
  assert.equal(url.searchParams.get("complexId"), "abc");
  assert.ok(url.searchParams.get("memo")?.startsWith("AI 시세 예측 2026.09.13: "));
  assert.equal(a.secondary?.label, "단지 홈에서 근거 보기");
  assert.ok(a.secondary?.href.startsWith("/complex/"));
});

test("verdictNextActions — 핵심 밖 도구는 예전 매핑, 단지가 없으면 2순위 없음", () => {
  const a = verdictNextActions({ tool: "ai-gap", verdict: { ...verdict, metric: null }, complexId: null });
  assert.equal(a.primary.label, "위험을 함께 점검");
  assert.equal(a.primary.href, "/analysis");
  assert.equal(a.secondary, null);
  /* noteHandoff(공유 페이지)는 핵심 밖에서도 노트 이관 */
  const b = verdictNextActions({ tool: "ai-gap", verdict, complexId: "abc", noteHandoff: true });
  assert.ok(b.primary.href.startsWith("/notes/new?"));
  assert.ok(new URL(b.primary.href, "https://x.test").searchParams.get("memo")?.startsWith("AI 분석 "));
});
