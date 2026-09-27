import "server-only";
import { callLlmChat } from "@/lib/ai/llm-provider";
import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";
import { isAnthropicConfigured, isOpenAiConfigured } from "@/lib/ai/env-keys";
import { keyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/log";
import { buildCoverPrompt, coverPromptHash, parseCoverLlm, type CoverLlmText } from "./prompt";
import type { CoverNote } from "./verify";

/**
 * 썸네일 문구 AI 호출 — 서버 전용. 기존 LLM 관문(callLlmChat: 컴플라이언스 조항 자동 부착)만 쓴다.
 * 새 키를 요구하지 않는다: 키가 없거나 실패·시간 초과·한도 초과면 빈 목록을 돌려주고 호출부가 규칙 문구로 채운다.
 *
 * 비용 보호 두 겹:
 *  1) 노트 내용 해시 캐시(인스턴스 메모리, 하루) — 내용이 그대로면 LLM 을 다시 부르지 않는다.
 *  2) 같은 노트 하루 COVER_AI_DAILY_PER_NOTE 회(keyRateLimit — Upstash 가 있으면 인스턴스 공통).
 *     AI 분석 월 한도(ai_analysis)는 쓰지 않는다 — 썸네일 문구 뽑기로 사용자의 분석 횟수를 깎지 않는다.
 */

export const COVER_AI_DAILY_PER_NOTE = 5;
const DAY_MS = 86_400_000;
const LLM_TIMEOUT_MS = 15_000;
const MEMO_MAX = 300;

export type CoverAiStatus = "ok" | "cached" | "limited" | "unavailable" | "failed";
export type CoverAiResult = { texts: CoverLlmText[]; status: CoverAiStatus };

const memo = new Map<string, { at: number; texts: CoverLlmText[] }>();

function remember(key: string, texts: CoverLlmText[]): void {
  if (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, { at: Date.now(), texts });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function suggestCoverTextsWithAi(note: CoverNote & { id: string }): Promise<CoverAiResult> {
  const key = coverPromptHash(note);
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return { texts: hit.texts, status: "cached" };

  const option = getModelOption(defaultModelIdFromEnv());
  const configured = option?.vendor === "openai" ? isOpenAiConfigured() : option?.vendor === "anthropic" ? isAnthropicConfigured() : false;
  /* 키가 없으면 한도를 깎지 않고 바로 규칙으로 */
  if (!option || !configured) return { texts: [], status: "unavailable" };

  const rl = await keyRateLimit(`note-cover-ai:${note.id}`, { max: COVER_AI_DAILY_PER_NOTE, windowMs: DAY_MS });
  if (!rl.ok) return { texts: [], status: "limited" };

  const { system, user } = buildCoverPrompt(note);
  const res = await withTimeout(
    callLlmChat(option, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]),
    LLM_TIMEOUT_MS,
  );
  if (!res || !res.ok) {
    logger.warn("[note-cover] AI 문구 실패 — 규칙 문구로 채운다", res ? res.error : "timeout");
    return { texts: [], status: "failed" };
  }
  const texts = parseCoverLlm(res.text);
  if (!texts.length) return { texts: [], status: "failed" };
  remember(key, texts);
  return { texts, status: "ok" };
}
