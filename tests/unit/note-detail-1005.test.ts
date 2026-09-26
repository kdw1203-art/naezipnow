import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AI_ENGINE_QUOTA_MARK,
  AI_POLL_INTERVAL_MS,
  AI_POLL_TIMEOUT_MS,
  aiStateOf,
  analysisModeOf,
  hasAiAnalysis,
  isQuotaFallback,
  pollHasAnalysis,
  pollIsSettled,
  readAiQuery,
  shouldKeepPolling,
} from "../../lib/notes/ai-status.ts";
import {
  NOTE_HASH_DEEP_DIVE_VERSION,
  noteContentHash,
  storedContentHash,
} from "../../lib/notes/content-hash.ts";

/* [1005 · A4] 노트 상세 AI 상태 — 작성 화면이 `?ai=pending` 으로 넘기고, 상세가 저장된 분석과
   합쳐 단계를 판정한다. 저장된 분석이 있으면 쿼리가 뭐라 하든 그것이 진실이다. */

test("readAiQuery — 화이트리스트 4종만, 대소문자·공백은 접고 나머지는 null", () => {
  assert.equal(readAiQuery("ok"), "ok");
  assert.equal(readAiQuery("rule"), "rule");
  assert.equal(readAiQuery("fail"), "fail");
  assert.equal(readAiQuery("pending"), "pending");
  assert.equal(readAiQuery(" Pending "), "pending");
  assert.equal(readAiQuery("done"), null);
  assert.equal(readAiQuery(""), null);
  assert.equal(readAiQuery(undefined), null);
  assert.equal(readAiQuery(null), null);
  assert.equal(readAiQuery(1), null);
  assert.equal(readAiQuery({}), null);
  /* Next searchParams 는 같은 키가 반복되면 배열 — 첫 값만 본다 */
  assert.equal(readAiQuery(["pending", "ok"]), "pending");
  assert.equal(readAiQuery([]), null);
});

test("aiStateOf — 저장된 분석이 있으면 쿼리와 무관하게 ready(LLM) / rule(규칙)", () => {
  assert.equal(aiStateOf({ query: null, hasAnalysis: true, analysisMode: "llm" }), "ready");
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: true, analysisMode: "llm" }), "ready");
  assert.equal(aiStateOf({ query: "fail", hasAnalysis: true, analysisMode: "llm" }), "ready");
  assert.equal(aiStateOf({ query: "ok", hasAnalysis: true, analysisMode: "rule" }), "rule");
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: true, analysisMode: "rule" }), "rule");
  /* mode 를 안 주면 LLM 으로 본다(있는 분석을 규칙으로 깎아 말하지 않는다) */
  assert.equal(aiStateOf({ query: "ok", hasAnalysis: true }), "ready");
  assert.equal(aiStateOf({ query: "ok", hasAnalysis: true, analysisMode: null }), "ready");
});

test("aiStateOf — 분석이 없으면 쿼리가 단계다: pending / fail → failed / 그 외 none", () => {
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: false }), "pending");
  assert.equal(aiStateOf({ query: "fail", hasAnalysis: false }), "failed");
  assert.equal(aiStateOf({ query: "ok", hasAnalysis: false }), "none");
  assert.equal(aiStateOf({ query: "rule", hasAnalysis: false }), "none");
  assert.equal(aiStateOf({ query: null, hasAnalysis: false }), "none");
  /* mode 는 분석이 없을 때 아무 영향이 없다 */
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: false, analysisMode: "rule" }), "pending");
});

test("hasAiAnalysis — 키가 하나라도 있는 객체만 '있다'", () => {
  assert.equal(hasAiAnalysis({ summary: "x" }), true);
  assert.equal(hasAiAnalysis({}), false);
  assert.equal(hasAiAnalysis(null), false);
  assert.equal(hasAiAnalysis(undefined), false);
  assert.equal(hasAiAnalysis([]), false);
  assert.equal(hasAiAnalysis(["a"]), false);
  assert.equal(hasAiAnalysis("summary"), false);
  assert.equal(hasAiAnalysis(0), false);
});

test("analysisModeOf — engine 이 rule-based* 이거나 비어 있으면 rule, 아니면 llm, 분석 없으면 null", () => {
  assert.equal(analysisModeOf({ engine: "openai:gpt-4o-mini", summary: "x" }), "llm");
  assert.equal(analysisModeOf({ engine: "rule-based-v1 (quota)", summary: "x" }), "rule");
  assert.equal(analysisModeOf({ engine: "rule-based-v1 (gpt fallback)", summary: "x" }), "rule");
  assert.equal(analysisModeOf({ engine: "", summary: "x" }), "rule");
  assert.equal(analysisModeOf({ summary: "x" }), "rule");
  assert.equal(analysisModeOf({}), null);
  assert.equal(analysisModeOf(null), null);
});

test("pollHasAnalysis — GET /api/inspection/notes/{id} 응답의 note.aiAnalysis 만 본다", () => {
  assert.equal(pollHasAnalysis({ note: { id: "n1", aiAnalysis: { summary: "done" } } }), true);
  assert.equal(pollHasAnalysis({ note: { id: "n1", aiAnalysis: null } }), false);
  assert.equal(pollHasAnalysis({ note: { id: "n1", aiAnalysis: {} } }), false);
  assert.equal(pollHasAnalysis({ note: { id: "n1" } }), false);
  assert.equal(pollHasAnalysis({ error: "권한이 없습니다." }), false);
  assert.equal(pollHasAnalysis(null), false);
  assert.equal(pollHasAnalysis("{}"), false);
  /* 다른 키(ai_analysis 스네이크)는 응답 모양이 아니다 — 지어서 읽지 않는다 */
  assert.equal(pollHasAnalysis({ note: { ai_analysis: { summary: "x" } } }), false);
});

test("폴링 리듬 — 2.5초 간격, 90초에서 멈춘다(경계 포함)", () => {
  assert.equal(AI_POLL_INTERVAL_MS, 2_500);
  assert.equal(AI_POLL_TIMEOUT_MS, 90_000);
  assert.equal(shouldKeepPolling(0), true);
  assert.equal(shouldKeepPolling(AI_POLL_TIMEOUT_MS - 1), true);
  assert.equal(shouldKeepPolling(AI_POLL_TIMEOUT_MS), false);
  assert.equal(shouldKeepPolling(AI_POLL_TIMEOUT_MS + AI_POLL_INTERVAL_MS), false);
  assert.equal(shouldKeepPolling(-1), false);
  assert.equal(shouldKeepPolling(Number.NaN), false);
  /* 36번째 틱(90초)은 없다 — 카드가 "늦어지고 있어요"로 넘어간다 */
  let ticks = 0;
  let elapsed = 0;
  while (shouldKeepPolling(elapsed + AI_POLL_INTERVAL_MS)) {
    elapsed += AI_POLL_INTERVAL_MS;
    ticks += 1;
  }
  assert.equal(ticks, 35);
});

/* ── [1005 · M3] 내용 해시 — AI 라우트와 상세가 같은 규칙으로 "지금 내용의 분석인가"를 판정 ── */

/* 표본 노트 — 아래 고정 해시는 lib/ai/presets-store.ts 의 objectiveHash(원본 알고리즘)로 미리
   계산한 값이다. content-hash.ts 가 알고리즘을 바꾸면 DB 에 저장된 aiContentHash 와 어긋나
   모든 수정 저장이 영원히 pending 이 되므로, 값 자체를 고정해 둔다. */
const SAMPLE_NOTE = {
  id: "n1",
  authorEmail: "a@example.com",
  title: "남향이라 오후 채광은 좋은데 이중주차가 걸린다",
  region: "서울 노원구",
  aptName: "상계주공9단지",
  visitDate: "2026-09-19",
  summary: "요약은 해시에 안 들어간다",
  scores: { location: 4, school: 3, transport: 4, facility: 2, future: 3 },
  checklist: [
    { id: "c1", label: "채광", done: true },
    { id: "c2", label: "주차", done: false },
  ],
  sections: { pros: "채광 좋음 · 조용함", cons: "이중주차 · 노후 배관", memo: "저녁 7시 방문." },
  photos: ["https://example.com/a.jpg"],
  aiAnalysis: null,
  isPublic: true,
  createdAt: "2026-09-19T10:00:00.000Z",
  updatedAt: "2026-09-19T10:00:00.000Z",
} as const;
type SampleNote = Parameters<typeof noteContentHash>[0];
const sample = (patch: Partial<SampleNote> = {}): SampleNote =>
  ({ ...SAMPLE_NOTE, ...patch }) as unknown as SampleNote;

test("noteContentHash — 표본 해시 고정(원본 objectiveHash 와 같은 값) · intent 가 다르면 다르다", () => {
  assert.equal(noteContentHash(sample(), "실거주"), "xpkq4x");
  assert.equal(noteContentHash(sample(), "투자"), "mwog4l");
  /* 방문일이 없으면 null 로 섞는다(라우트의 `?? null` 그대로) */
  assert.equal(noteContentHash(sample({ visitDate: undefined }), "실거주"), "dlg0jx");
});

test("noteContentHash — 본문(memo)이 바뀌면 다른 해시, 해시에 안 들어가는 필드(summary·updatedAt·aiAnalysis)는 무관", () => {
  const edited = sample({ sections: { ...SAMPLE_NOTE.sections, memo: "저녁 7시 방문. 주차 확인." } });
  assert.equal(noteContentHash(edited, "실거주"), "1hs7sg6");
  assert.notEqual(noteContentHash(edited, "실거주"), noteContentHash(sample(), "실거주"));
  const cosmetic = sample({
    summary: "다른 요약",
    updatedAt: "2026-09-20T00:00:00.000Z",
    aiAnalysis: { summary: "x" },
  });
  assert.equal(noteContentHash(cosmetic, "실거주"), "xpkq4x");
  /* 키 순서와 무관(stableStringify) */
  const reordered = sample({ scores: { future: 3, facility: 2, transport: 4, school: 3, location: 4 } });
  assert.equal(noteContentHash(reordered, "실거주"), "xpkq4x");
});

test("NOTE_HASH_DEEP_DIVE_VERSION 은 lib/inspection/deep-dive.ts 의 DEEP_DIVE_VERSION 과 같다", () => {
  /* deep-dive 는 시장 조회 체인(server-only)을 끌고 와 여기서 import 할 수 없다 — 소스를 읽어 대조 */
  const src = readFileSync(new URL("../../lib/inspection/deep-dive.ts", import.meta.url), "utf8");
  const m = /export const DEEP_DIVE_VERSION\s*=\s*(\d+)\s*;/.exec(src);
  assert.ok(m, "deep-dive.ts 에서 DEEP_DIVE_VERSION 을 찾지 못했다");
  assert.equal(NOTE_HASH_DEEP_DIVE_VERSION, Number(m![1]));
});

test("AI 라우트는 자체 해시 함수를 갖지 않고 lib/notes/content-hash 를 쓴다", () => {
  const src = readFileSync(new URL("../../app/api/inspection/ai/route.ts", import.meta.url), "utf8");
  assert.ok(/from "@\/lib\/notes\/content-hash"/.test(src));
  assert.ok(!/function noteContentHash\(/.test(src), "라우트 안에 노트 해시 함수가 다시 생겼다");
});

test("storedContentHash — metadata.aiContentHash 문자열만, 없거나 깨지면 null", () => {
  assert.equal(storedContentHash({ metadata: { aiContentHash: "xpkq4x" } }), "xpkq4x");
  assert.equal(storedContentHash({ metadata: { aiContentHash: "" } }), null);
  assert.equal(storedContentHash({ metadata: { aiContentHash: 12 } }), null);
  assert.equal(storedContentHash({ metadata: {} }), null);
  assert.equal(storedContentHash({}), null);
  assert.equal(storedContentHash(null), null);
});

test("aiStateOf — stale(수정 저장, 옛 분석 잔존) + pending 이면 있는 분석을 무시하고 pending", () => {
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: true, analysisMode: "llm", stale: true }), "pending");
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: true, analysisMode: "rule", stale: true }), "pending");
  /* stale 은 pending 요청과 함께일 때만 뜻이 있다 — 기다릴 요청이 없으면 있는 분석이 진실 */
  assert.equal(aiStateOf({ query: null, hasAnalysis: true, analysisMode: "llm", stale: true }), "ready");
  assert.equal(aiStateOf({ query: "ok", hasAnalysis: true, analysisMode: "rule", stale: true }), "rule");
  /* 신규 저장(분석 없음)은 stale 과 무관하게 종전 그대로 */
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: false, stale: false }), "pending");
  assert.equal(aiStateOf({ query: "pending", hasAnalysis: true, stale: false }), "ready");
});

test("pollIsSettled — expectedHash 가 있으면 분석 존재 + metadata.aiContentHash 일치까지, 없으면 존재만", () => {
  const withHash = (h: unknown) => ({ note: { id: "n1", aiAnalysis: { summary: "x" }, metadata: { aiContentHash: h } } });
  /* 신규 저장(expectedHash 없음): 종전 동작 — 존재만 */
  assert.equal(pollIsSettled(withHash("old"), undefined), true);
  assert.equal(pollIsSettled(withHash("old"), null), true);
  assert.equal(pollIsSettled({ note: { aiAnalysis: null } }, null), false);
  /* 수정 저장: 옛 해시면 아직이다 — 옛 요약을 새 것으로 확정하지 않는다 */
  assert.equal(pollIsSettled(withHash("old"), "xpkq4x"), false);
  assert.equal(pollIsSettled(withHash("xpkq4x"), "xpkq4x"), true);
  assert.equal(pollIsSettled({ note: { aiAnalysis: { summary: "x" } } }, "xpkq4x"), false);
  assert.equal(pollIsSettled({ note: { aiAnalysis: { summary: "x" }, metadata: null } }, "xpkq4x"), false);
  /* 해시가 맞아도 분석이 없으면 끝난 게 아니다 */
  assert.equal(pollIsSettled({ note: { aiAnalysis: {}, metadata: { aiContentHash: "xpkq4x" } } }, "xpkq4x"), false);
});

/* ── [1005 · M7] 한도 폴백 — 작성 화면이 quota=1 을 못 보내니 engine 표기로 읽는다 ── */

test("isQuotaFallback — 라우트가 적는 정확한 문자열 `rule-based-v1 (quota)` 를 잡는다", () => {
  assert.equal(AI_ENGINE_QUOTA_MARK, "(quota)");
  assert.equal(isQuotaFallback({ engine: "rule-based-v1 (quota)", summary: "x" }), true);
  assert.equal(isQuotaFallback({ engine: "rule-based-v1 (gpt-4o-mini fallback)", summary: "x" }), false);
  assert.equal(isQuotaFallback({ engine: "rule-based-v1 (evidence-guard)", summary: "x" }), false);
  assert.equal(isQuotaFallback({ engine: "openai:gpt-4o-mini", summary: "x" }), false);
  assert.equal(isQuotaFallback({ summary: "x" }), false);
  assert.equal(isQuotaFallback({}), false);
  assert.equal(isQuotaFallback(null), false);
  /* 라우트 소스와 대조 — 문자열이 바뀌면 여기서 울린다 */
  const src = readFileSync(new URL("../../app/api/inspection/ai/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("`rule-based-v1 (quota)`"), "라우트의 한도 폴백 engine 표기가 바뀌었다");
});
