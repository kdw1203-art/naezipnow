/**
 * [1005 · A4] 임장노트 상세의 AI 정리 상태 — 순수 함수(서버·클라이언트·테스트 공용).
 *
 * 계약: 작성 화면은 노트를 저장하고 `POST /api/inspection/ai` 를 **기다리지 않고**
 * `/notes/{id}?ai=pending` 으로 온다. 결과가 어떻게 됐는지는 이 화면이 스스로 읽는다 —
 * 저장된 분석(aiAnalysis)이 있으면 그것이 진실이고, 없으면 쿼리가 말하는 단계다.
 *
 *   ready   — 저장된 LLM 분석이 있다(쿼리와 무관)
 *   rule    — 저장된 분석이 있지만 규칙 기반(한도·폴백)이다
 *   pending — 분석은 아직 없고, 방금 요청했다고 한다(?ai=pending) → 화면이 폴링한다
 *   failed  — 분석이 없고 실패로 돌아왔다(?ai=fail)
 *   none    — 저장 직후가 아니다(일반 열람)
 *
 * 쿼리는 사용자가 주소창에 뭐든 적을 수 있으므로 화이트리스트 밖은 전부 null 로 접는다.
 */

export type AiQuery = "ok" | "rule" | "fail" | "pending" | null;

export type AiState = "pending" | "ready" | "rule" | "failed" | "none";

export type AnalysisMode = "llm" | "rule";

export function readAiQuery(v: unknown): AiQuery {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  const t = s.trim().toLowerCase();
  if (t === "ok" || t === "rule" || t === "fail" || t === "pending") return t;
  return null;
}

export function aiStateOf(input: {
  query: AiQuery;
  hasAnalysis: boolean;
  analysisMode?: AnalysisMode | null;
  /**
   * [M3] 저장된 분석이 **지금 내용의 것이 아니다**(수정 저장 → PATCH 는 옛 aiAnalysis 를
   * 남기고, 새 정리는 아직 도는 중). pending 요청과 함께면 "있는 분석"을 무시하고 기다린다 —
   * 옛 요약을 "반영됐어요"로 내보내지 않기 위해서다. pending 이 아니면 아무 영향이 없다
   * (기다릴 요청이 없는데 pending 이라고 말할 수는 없다).
   */
  stale?: boolean;
}): AiState {
  if (input.stale && input.query === "pending") return "pending";
  if (input.hasAnalysis) return input.analysisMode === "rule" ? "rule" : "ready";
  if (input.query === "pending") return "pending";
  if (input.query === "fail") return "failed";
  return "none";
}

/** 저장된 분석이 "있다"고 칠 수 있는가 — 빈 객체·null·배열·문자열은 없는 것이다 */
export function hasAiAnalysis(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return false;
  return Object.keys(analysis as Record<string, unknown>).length > 0;
}

/** 분석의 engine 표기로 LLM/규칙을 가른다 — app/api/inspection/ai 가 적는 값과 같은 규칙 */
export function analysisModeOf(analysis: unknown): AnalysisMode | null {
  if (!hasAiAnalysis(analysis)) return null;
  const engine = (analysis as Record<string, unknown>).engine;
  const e = typeof engine === "string" ? engine.trim() : "";
  return !e || e.startsWith("rule-based") ? "rule" : "llm";
}

/**
 * `GET /api/inspection/notes/{id}` 응답에서 분석 유무를 읽는다 — 폴링이 보는 단 하나의 필드.
 * 응답 모양은 `{ note: { ..., aiAnalysis } }` (lib/inspection/store-db mapRow 의 aiAnalysis).
 */
export function pollHasAnalysis(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const note = (json as { note?: unknown }).note;
  if (!note || typeof note !== "object") return false;
  return hasAiAnalysis((note as { aiAnalysis?: unknown }).aiAnalysis);
}

/**
 * [M3] 폴링이 "끝났다"고 볼 조건. `expectedHash` 가 있으면(수정 저장 — 옛 분석이 남아 있는 경우)
 * 분석이 있는 것만으로는 부족하고 `note.metadata.aiContentHash` 가 지금 내용의 해시와 같아야
 * 한다 — 옛 분석은 처음부터 있었으니 "있음"만 보면 첫 틱에 옛 것을 새 것이라고 확정한다.
 * 없으면(신규 저장 — 이전 분석 없음) 종전대로 존재만 본다.
 */
export function pollIsSettled(json: unknown, expectedHash?: string | null): boolean {
  if (!pollHasAnalysis(json)) return false;
  if (!expectedHash) return true;
  const note = (json as { note: { metadata?: unknown } }).note;
  const meta = note.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (meta as { aiContentHash?: unknown }).aiContentHash === expectedHash;
}

/**
 * [M7] 한도 소진 폴백 — app/api/inspection/ai 는 월 한도에 걸려 규칙 요약만 저장할 때
 * engine 을 `rule-based-v1 (quota)` 로 적는다. 작성 화면은 더 이상 `?quota=1` 을 보내지
 * 않으므로(AI 응답을 기다리지 않는다) 상세가 이 표기로 한도 안내를 이어 붙인다.
 */
export const AI_ENGINE_QUOTA_MARK = "(quota)";
export function isQuotaFallback(analysis: unknown): boolean {
  if (!hasAiAnalysis(analysis)) return false;
  const engine = (analysis as Record<string, unknown>).engine;
  return typeof engine === "string" && engine.includes(AI_ENGINE_QUOTA_MARK);
}

/**
 * [1006] AI 정리에 넘기는 목적 — 노트 metadata 의 visitPurpose(없으면 intent)에서. 상세의
 * 재시도 버튼·내용 해시(content-hash)·목록 배지가 같은 규칙을 봐야 해시가 맞는다.
 * 예전엔 app/notes/[id]/page.tsx 의 비공개 함수(retryDefaultIntent)였다.
 */
export function noteAiIntent(meta: unknown): "실거주" | "투자" | "전월세" {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const p = m.visitPurpose ?? m.intent;
  if (p === "투자" || p === "전월세" || p === "실거주") return p;
  return "실거주";
}

/**
 * [1006] 목록 카드용 AI 정리 상태 — 상세의 aiStateOf 와 달리 쿼리(?ai=)가 없다. 저장된
 * 것만으로 말할 수 있는 네 가지:
 *   ready — LLM 정리가 있고 지금 내용의 것이다
 *   rule  — 규칙 기반 요약만 있다(한도·폴백)
 *   stale — 정리는 있지만 수정 뒤의 내용이 아니다(해시 불일치) — "수정 뒤 정리 전"
 *   none  — 정리가 없다
 * "대기(pending)"는 목록에서 알 수 없다(요청 중인지 저장된 흔적이 없다) — 지어내지 않는다.
 * 해시가 저장돼 있지 않은 옛 노트는 비교할 수 없으므로 stale 로 몰지 않는다.
 */
export type ListAiState = "ready" | "rule" | "stale" | "none";

export function listAiState(input: {
  analysis: unknown;
  storedHash: string | null;
  currentHash: string;
}): ListAiState {
  if (!hasAiAnalysis(input.analysis)) return "none";
  if (input.storedHash && input.storedHash !== input.currentHash) return "stale";
  return analysisModeOf(input.analysis) === "rule" ? "rule" : "ready";
}

export const LIST_AI_STATE_LABEL: Record<ListAiState, string> = {
  ready: "AI 정리됨",
  rule: "규칙 요약",
  stale: "수정 뒤 정리 전",
  none: "AI 정리 없음",
};

/** 폴링 리듬 — 2.5초마다, 최대 90초(그 뒤는 "늦어지고 있어요" + 재시도) */
export const AI_POLL_INTERVAL_MS = 2_500;
export const AI_POLL_TIMEOUT_MS = 90_000;

/** 지금까지 기다린 시간으로 아직 폴링을 이어갈지 — 경계(90초)는 멈춘다 */
export function shouldKeepPolling(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < AI_POLL_TIMEOUT_MS;
}
