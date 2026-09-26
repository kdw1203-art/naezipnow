import "server-only";

/**
 * [1008 · J] 여정 진행 — 서버 저장소(user_preferences.journey_state jsonb).
 *
 * 1006 의 ui_prefs(lib/me/preferences-store.ts putUiPrefs)와 같은 방식이다:
 *  - 같은 표의 **다른 칸**만 읽고 쓴다(journey_state · updated_at). persona·priorities·ui_prefs 는 건드리지 않는다.
 *  - 쓰기는 update → 행이 없으면 insert(priorities 가 NOT NULL 이라 기본 가중치 동반).
 *  - 읽기·쓰기 실패는 던진다 — 라우트가 실패로 말하고, 화면은 이 기기 저장으로 계속 동작한다.
 *  - 읽을 때마다 normalizeJourneyState(모르는 키·틀린 값은 버린다).
 * 칸은 마이그레이션 20260921002000_1008_user_preferences_journey_state.sql 이 만든다(운영 적용됨 2026-09-21).
 * 표 권한은 기존 그대로(service_role 전용, RLS 켜짐·정책 없음).
 * Supabase 미설정(로컬 개발)은 preferences-store 와 같은 in-memory 폴백.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { DEFAULT_PRIORITIES } from "@/lib/personalization/store";
import { emptyJourneyState, normalizeJourneyState, type JourneyState } from "./state";

const memJourney = new Map<string, JourneyState>();

export async function getJourneyState(authorEmail: string): Promise<JourneyState> {
  const em = authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return memJourney.get(em) ?? emptyJourneyState();
  const { data, error } = await sb
    .from("user_preferences")
    .select("journey_state")
    .eq("author_email", em)
    .maybeSingle();
  if (error) throw new Error(`user_preferences.journey_state 조회 실패: ${error.message}`);
  if (!data) return emptyJourneyState();
  return normalizeJourneyState((data as { journey_state?: unknown }).journey_state);
}

/** 정규화된 상태를 통째로 저장한다(PUT). 반환값이 저장된 최종 상태. */
export async function putJourneyState(authorEmail: string, state: JourneyState): Promise<JourneyState> {
  const em = authorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  const next: JourneyState = { ...normalizeJourneyState(state), updatedAt: now };
  const sb = getServiceSupabase();
  if (!sb) {
    memJourney.set(em, next);
    return next;
  }
  const update = () =>
    sb
      .from("user_preferences")
      .update({ journey_state: next, updated_at: now })
      .eq("author_email", em)
      .select("author_email");
  const { data: updated, error: updErr } = await update();
  if (updErr) throw new Error(`user_preferences.journey_state 저장 실패: ${updErr.message}`);
  if (Array.isArray(updated) && updated.length > 0) return next;

  /* 행이 없다 — 이 사용자의 첫 저장. 다른 칸은 표의 기본값/필수값만. */
  const { error: insErr } = await sb.from("user_preferences").insert({
    author_email: em,
    priorities: { ...DEFAULT_PRIORITIES },
    journey_state: next,
    updated_at: now,
  });
  if (!insErr) return next;
  /* [리뷰 C] 23505(기본키 충돌) — update 와 insert 사이에 다른 요청(다른 탭·설정 화면의 ui_prefs 첫 저장)이 행을
     만들었다. 행이 생겼으니 update 를 한 번 더 한다(다른 칸은 건드리지 않는다). */
  if (insErr.code === "23505") {
    const { data: retried, error: retryErr } = await update();
    if (!retryErr && Array.isArray(retried) && retried.length > 0) return next;
    throw new Error(`user_preferences.journey_state 저장 실패(재시도): ${retryErr?.message ?? "행 없음"}`);
  }
  throw new Error(`user_preferences.journey_state 생성 실패: ${insErr.message}`);
}
