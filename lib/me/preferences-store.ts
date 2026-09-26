/**
 * 사용자 페르소나·우선순위(개인화 가중) 서버 저장소.
 * - 로그인 시 Supabase `user_preferences` 에 영속.
 * - Supabase 미설정 시 in-memory 폴백(개발/테스트).
 * 클라이언트는 비로그인 시 localStorage(personalization/store)로 폴백한다.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import {
  DEFAULT_PRIORITIES,
  type PersonaId,
  type PriorityWeights,
} from "@/lib/personalization/store";
import {
  DEFAULT_UI_PREFS,
  mergeUiPrefs,
  normalizeUiPrefs,
  type UiPrefs,
} from "@/lib/prefs/ui-prefs";

export type ServerPreferences = {
  persona: PersonaId | null;
  priorities: PriorityWeights;
  holdingYears: number | null;
  riskTolerance: number | null;
  updatedAt: string | null;
};

export const DEFAULT_SERVER_PREFERENCES: ServerPreferences = {
  persona: null,
  priorities: { ...DEFAULT_PRIORITIES },
  holdingYears: null,
  riskTolerance: null,
  updatedAt: null,
};

const mem = new Map<string, ServerPreferences>();

function normalizePriorities(input: unknown): PriorityWeights {
  const p = (input ?? {}) as Partial<PriorityWeights>;
  return {
    school: Number.isFinite(p.school) ? Number(p.school) : DEFAULT_PRIORITIES.school,
    transport: Number.isFinite(p.transport) ? Number(p.transport) : DEFAULT_PRIORITIES.transport,
    price: Number.isFinite(p.price) ? Number(p.price) : DEFAULT_PRIORITIES.price,
    future: Number.isFinite(p.future) ? Number(p.future) : DEFAULT_PRIORITIES.future,
  };
}

export async function getPreferences(authorEmail: string): Promise<ServerPreferences> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return mem.get(em) ?? { ...DEFAULT_SERVER_PREFERENCES };
  const { data, error } = await sb
    .from("user_preferences")
    .select("*")
    .eq("author_email", em)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_SERVER_PREFERENCES };
  const row = data as Record<string, unknown>;
  return {
    persona: (row.persona as PersonaId | null) ?? null,
    priorities: normalizePriorities(row.priorities),
    holdingYears: row.holding_years != null ? Number(row.holding_years) : null,
    riskTolerance: row.risk_tolerance != null ? Number(row.risk_tolerance) : null,
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  };
}

export async function putPreferences(
  authorEmail: string,
  patch: {
    persona?: PersonaId | null;
    priorities?: Partial<PriorityWeights>;
    holdingYears?: number | null;
    riskTolerance?: number | null;
  },
): Promise<ServerPreferences> {
  const em = authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const current = await getPreferences(em);
  const next: ServerPreferences = {
    persona: patch.persona !== undefined ? patch.persona : current.persona,
    priorities: patch.priorities
      ? normalizePriorities({ ...current.priorities, ...patch.priorities })
      : current.priorities,
    holdingYears: patch.holdingYears !== undefined ? patch.holdingYears : current.holdingYears,
    riskTolerance:
      patch.riskTolerance !== undefined ? patch.riskTolerance : current.riskTolerance,
    updatedAt: now,
  };

  const sb = getServiceSupabase();
  if (!sb) {
    mem.set(em, next);
    return next;
  }
  await sb.from("user_preferences").upsert(
    {
      author_email: em,
      persona: next.persona,
      priorities: next.priorities,
      holding_years: next.holdingYears,
      risk_tolerance: next.riskTolerance,
      updated_at: now,
    },
    { onConflict: "author_email" },
  );
  return next;
}

/* ─────────────────────────────────────────────────────────────────────────
   [1006] 표시·기록 기본값(ui_prefs jsonb) — 설정 화면 "표시·기록" 탭이 읽고 쓴다.

   같은 표(user_preferences)의 다른 칸이라 별도 저장소를 두지 않았다. 스키마·정규화는
   lib/prefs/ui-prefs.ts 가 정하고 여기서는 읽을 때마다 normalizeUiPrefs 를 거친다 —
   저장된 jsonb 에 옛 키·틀린 값이 남아 있어도 화면은 늘 스키마대로 본다.
   Supabase 미설정(로컬)은 위 persona 저장과 같은 in-memory 폴백.

   [리뷰 M1] 조회 실패는 **던진다**(기본값으로 접지 않는다). 읽기(GET)는 라우트가 받아
   DEFAULT 로 폴백해도 되지만, 쓰기(PATCH)가 실패한 조회 위에 merge 해 저장하면 예전
   값을 기본값으로 덮어쓴다 — 그건 저장이 아니라 손실이다.
   ───────────────────────────────────────────────────────────────────────── */
const memUi = new Map<string, UiPrefs>();

/** 저장된 표시·기록 기본값. 행이 없으면 DEFAULT, 조회 실패는 throw. */
export async function getUiPrefs(authorEmail: string): Promise<UiPrefs> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return memUi.get(em) ?? { ...DEFAULT_UI_PREFS };
  const { data, error } = await sb
    .from("user_preferences")
    .select("ui_prefs")
    .eq("author_email", em)
    .maybeSingle();
  if (error) throw new Error(`user_preferences.ui_prefs 조회 실패: ${error.message}`);
  if (!data) return { ...DEFAULT_UI_PREFS };
  return normalizeUiPrefs((data as { ui_prefs?: unknown }).ui_prefs);
}

/**
 * patch 에 들어온 키만 얹어 저장한다(PATCH 의미). 반환값이 저장된 최종 상태.
 * ui_prefs·updated_at **두 칸만** 갱신한다 — persona·priorities·holding_years·risk_tolerance 는
 * 절대 건드리지 않는다. 행이 없을 때만 insert(priorities 가 NOT NULL 이라 기본 가중치 동반).
 * 실패는 던진다: "저장했어요" 토스트가 거짓이 되면 안 되므로 라우트가 500 으로 말한다.
 */
export async function putUiPrefs(authorEmail: string, patch: unknown): Promise<UiPrefs> {
  const em = authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const current = await getUiPrefs(em); // 조회 실패면 여기서 던진다 — 실패한 조회 위에 저장하지 않는다
  const next: UiPrefs = { ...mergeUiPrefs(current, patch), updatedAt: now };

  const sb = getServiceSupabase();
  if (!sb) {
    memUi.set(em, next);
    return next;
  }
  const { data: updated, error: updErr } = await sb
    .from("user_preferences")
    .update({ ui_prefs: next, updated_at: now })
    .eq("author_email", em)
    .select("author_email");
  if (updErr) throw new Error(`user_preferences.ui_prefs 저장 실패: ${updErr.message}`);
  if (Array.isArray(updated) && updated.length > 0) return next;

  /* 행이 없다 — 이 사용자의 첫 저장. 다른 칸은 표의 기본값/필수값만. */
  const { error: insErr } = await sb.from("user_preferences").insert({
    author_email: em,
    priorities: { ...DEFAULT_PRIORITIES },
    ui_prefs: next,
    updated_at: now,
  });
  if (insErr) {
    /* [1008] update→insert 경쟁 — 같은 사람의 첫 저장이 동시에 두 번 오거나(두 탭), 여정 저장
       (lib/journey/store.ts)이 같은 순간 행을 먼저 만들면 PK(author_email) 23505 로 떨어진다. 그 행은
       이미 있으므로 update 를 한 번 더 한다(여정 저장소와 같은 규칙). */
    if ((insErr as { code?: string }).code === "23505") {
      const { error: retryErr } = await sb
        .from("user_preferences")
        .update({ ui_prefs: next, updated_at: now })
        .eq("author_email", em);
      if (retryErr) throw new Error(`user_preferences.ui_prefs 저장 실패(재시도): ${retryErr.message}`);
      return next;
    }
    throw new Error(`user_preferences.ui_prefs 생성 실패: ${insErr.message}`);
  }
  return next;
}
