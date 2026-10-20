/**
 * [1080] AI 요청 **사이트 전체** 일일 상한.
 *
 * 왜: 사용자별 할당량(요금제)은 있었지만 전체 상한이 없어, 방문자가 늘면 "무료 사용자 수 × 할당량"이 그대로
 * OpenAI·Anthropic 청구서가 됐다. 운영 환경 변수 `AI_DAILY_REQUEST_BUDGET` 은 이미 있었는데 코드가 읽지 않았다.
 *
 * 규칙
 *  - 변수가 없거나 0 이하면 상한 없음(종전과 같다).
 *  - 하루는 한국 시간 기준. 카운터는 KV(lib/kv/rest) — 인스턴스를 가로질러 센다. KV 가 없으면 프로세스 메모리
 *    (best-effort · degraded) — 그래도 한 인스턴스 안에서는 멈춘다.
 *  - 시도를 센다(성공이 아니라). 상한에 닿으면 503 + Retry-After(한국 자정까지) — 사용자 할당량(403)과 구분된다.
 *  - 상한은 모델을 실제로 부르는 길목에서만 소비한다(규칙 기반 폴백·캐시 적중은 세지 않는다).
 */
import { kstDayKey, kvIncrWindow } from "@/lib/kv/rest";

const memory = new Map<string, number>();

export function aiDailyBudget(): number | null {
  const raw = Number(process.env.AI_DAILY_REQUEST_BUDGET?.trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

export type AiBudgetResult = { allowed: boolean; used: number; budget: number | null; degraded: boolean };

/** 요청 1건을 소비한다. `kind` 는 집계용 이름(analysis·chat·…) — 상한은 종류를 가리지 않고 합산 */
export async function consumeAiDailyBudget(kind: string): Promise<AiBudgetResult> {
  const budget = aiDailyBudget();
  if (budget === null) return { allowed: true, used: 0, budget: null, degraded: false };
  const day = kstDayKey();
  const key = `ai:budget:${day}`;
  const fromKv = await kvIncrWindow(key, 48 * 3600);
  let used: number;
  let degraded = false;
  if (fromKv === null) {
    degraded = true;
    void kind; // 종류별 집계는 하지 않는다 — 상한은 합산
    const next = (memory.get(key) ?? 0) + 1;
    memory.set(key, next);
    for (const k of memory.keys()) if (k !== key) memory.delete(k); // 지난 날짜는 버린다
    used = next;
  } else {
    used = fromKv;
  }
  return { allowed: used <= budget, used, budget, degraded };
}

/** 한국 자정까지 남은 초(Retry-After) */
export function secondsUntilKstMidnight(now: number = Date.now()): number {
  const kst = now + 9 * 3600_000;
  const sinceMidnight = kst % 86_400_000;
  return Math.max(60, Math.ceil((86_400_000 - sinceMidnight) / 1000));
}

export const AI_DAILY_BUDGET_MESSAGE = "AI 요청 일일 한도 도달 · 내일 다시";

/** 표준 Response(next/server 의존 없음 — 단위 테스트가 이 모듈을 그대로 부른다). 라우트 핸들러는 Response 를 그대로 돌려준다 */
export function aiBudgetExceededResponse(): Response {
  return Response.json(
    { error: AI_DAILY_BUDGET_MESSAGE, code: "AI_DAILY_BUDGET" },
    { status: 503, headers: { "Retry-After": String(secondsUntilKstMidnight()), "Cache-Control": "no-store" } },
  );
}
