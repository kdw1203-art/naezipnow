import "server-only";

/**
 * [1025 · 결정·비서] 결정 기록(user_decisions) 서버 저장소 — service_role 전용 표.
 *
 * 표는 supabase/migrations/20260929104418_1025_user_decisions.sql 이 만든다(통합자 적용 — 적용 전에는 42P01 로
 * 조회·저장이 던지고 라우트가 503 으로 말한다. 화면은 이 기기 저장으로 계속 동작한다).
 * 키는 다른 개인 표(user_watchlist · user_preferences · inspection_schedules)와 같은 **user_email** 이다 —
 * 이 앱의 세션 id 는 provider 별 문자열(kakao:… · 이메일)이라 uuid 가 아니다(auth.ts session 콜백).
 * 읽기·쓰기 실패는 던진다. Supabase 미설정(로컬)은 in-memory 폴백.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { parseDecisionRecord, type DecideVerdict, type DecideWeights, type DecisionRecord } from "./score";

export const DECISIONS_LIST_LIMIT = 30;

const mem = new Map<string, DecisionRecord[]>();

function rowToRecord(r: Record<string, unknown>): DecisionRecord | null {
  return parseDecisionRecord({
    id: r.id,
    complexIds: r.complex_ids,
    chosenId: r.chosen_id,
    chosenName: r.chosen_name,
    verdict: r.verdict,
    memo: r.memo,
    weights: r.weights,
    createdAt: r.created_at,
  });
}

export async function listDecisions(userEmail: string): Promise<DecisionRecord[]> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return (mem.get(em) ?? []).slice(0, DECISIONS_LIST_LIMIT);
  const { data, error } = await sb
    .from("user_decisions")
    .select("id, complex_ids, chosen_id, chosen_name, verdict, memo, weights, created_at")
    .eq("user_email", em)
    .order("created_at", { ascending: false })
    .limit(DECISIONS_LIST_LIMIT);
  if (error) throw new Error(`user_decisions 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("user_decisions 응답이 배열이 아닙니다");
  return data.map((r) => rowToRecord(r as Record<string, unknown>)).filter((x): x is DecisionRecord => x !== null);
}

export async function insertDecision(
  userEmail: string,
  input: {
    complexIds: string[];
    chosenId: string | null;
    chosenName: string | null;
    verdict: DecideVerdict;
    memo: string | null;
    weights: DecideWeights;
  },
): Promise<DecisionRecord> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    const rec: DecisionRecord = {
      id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      complexIds: input.complexIds,
      chosenId: input.chosenId,
      chosenName: input.chosenName,
      verdict: input.verdict,
      memo: input.memo,
      weights: input.weights,
      createdAt: new Date().toISOString(),
    };
    mem.set(em, [rec, ...(mem.get(em) ?? [])]);
    return rec;
  }
  const { data, error } = await sb
    .from("user_decisions")
    .insert({
      user_email: em,
      complex_ids: input.complexIds,
      chosen_id: input.chosenId,
      chosen_name: input.chosenName,
      verdict: input.verdict,
      memo: input.memo,
      weights: input.weights,
    })
    .select("id, complex_ids, chosen_id, chosen_name, verdict, memo, weights, created_at")
    .single();
  if (error) throw new Error(`user_decisions 저장 실패: ${error.message}`);
  const rec = rowToRecord((data ?? {}) as Record<string, unknown>);
  if (!rec) throw new Error("user_decisions 저장 응답이 기록 모양이 아닙니다");
  return rec;
}
