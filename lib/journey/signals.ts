"use client";

/**
 * [1008 · J] 여정 자동 신호 — 이 기기에 이미 남아 있는 **확실한** 흔적만 "진행 중"으로 보여 준다.
 * 절대 "완료"로 체크하지 않는다(완료는 사람이 "다 했어요"를 눌렀을 때만 — lib/journey/state.ts).
 *
 *  ① 시장 감 잡기 ← 실거래가 게임을 한 판 이상 푼 기록(localStorage nz:quiz:v1 — lib/quiz/price-game.ts 의
 *                    QUIZ_STORE_KEY, 같은 판 Q. 모듈을 import 하지 않고 키·모양만 읽는다 — 게임 번들을 싣지 않게)
 *  ③ 후보 좁히기 ← 최근 본 단지(localStorage nz_recent_complexes — app/components/RecentComplexes.tsx 의 KEY,
 *                    단지 페이지를 열면 RecentComplexRecorder 가 적는다) 1곳 이상
 *  ④ 현장 확인   ← 작성 중인 임장노트 초안(lib/notes/draft-summary — 홈 "이어서 쓰기" 팝업과 같은 판정)
 *  ⑤ 비교·결정   ← 비교함(lib/newui/compare-tray)에 2곳 이상 — 비교는 둘부터다
 * (⑥ 계약은 일정표에 계약일을 넣었는지로 화면이 직접 판단한다 — 여정 상태 안의 사실이다.)
 *
 * 서버 호출 없음. 전부 try/catch — 저장 차단 환경에서는 신호가 없을 뿐이다.
 */
import { listCompareTray, subscribeCompareTray } from "@/lib/newui/compare-tray";
import { readNoteDraftSummary } from "@/lib/notes/draft-summary";
import type { JourneyStageId } from "./state";

/** app/components/RecentComplexes.tsx 의 KEY 와 같은 값 — tests/unit/journey-1008.test.ts 가 두 값을 대조한다 */
export const RECENT_COMPLEXES_KEY = "nz_recent_complexes";
/** lib/quiz/price-game.ts 의 QUIZ_STORE_KEY 와 같은 값 — 같은 테스트가 대조한다 */
export const QUIZ_STORE_KEY_MIRROR = "nz:quiz:v1";

/** 실거래가 게임을 푼 날 수 — { days: { "YYYY-MM-DD": {...} } } 에서 날짜 키만 센다 */
function countQuizDays(): number {
  try {
    const raw = window.localStorage.getItem(QUIZ_STORE_KEY_MIRROR);
    if (!raw) return 0;
    const o = JSON.parse(raw) as { days?: unknown };
    if (!o || typeof o !== "object" || !o.days || typeof o.days !== "object") return 0;
    return Object.keys(o.days as Record<string, unknown>).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).length;
  } catch {
    return 0;
  }
}

export type JourneySignals = Partial<Record<JourneyStageId, string>>;

function countRecentComplexes(): number {
  try {
    const raw = window.localStorage.getItem(RECENT_COMPLEXES_KEY);
    if (!raw) return 0;
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return 0;
    const ids = new Set<string>();
    for (const v of arr) {
      if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") ids.add((v as { id: string }).id);
    }
    return ids.size;
  } catch {
    return 0;
  }
}

export function readJourneySignals(): JourneySignals {
  if (typeof window === "undefined") return {};
  const out: JourneySignals = {};
  const quizDays = countQuizDays();
  if (quizDays > 0) out.market = `실거래가 게임 ${quizDays}판`;
  const recent = countRecentComplexes();
  if (recent > 0) out.shortlist = `최근 본 단지 ${recent}곳`;
  try {
    const draft = readNoteDraftSummary();
    if (draft) out.visit = draft.aptName ? `작성 중인 임장노트 · ${draft.aptName}` : "작성 중인 임장노트가 있어요";
  } catch {
    /* 초안 읽기 실패 — 신호 없음 */
  }
  try {
    const n = listCompareTray().length;
    if (n >= 2) out.decide = `비교함에 ${n}곳`;
  } catch {
    /* 트레이 읽기 실패 — 신호 없음 */
  }
  return out;
}

/** 비교함·다른 탭의 변경을 받아 신호를 다시 읽는다. 해제 함수 반환. */
export function subscribeJourneySignals(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const off = subscribeCompareTray(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_COMPLEXES_KEY || e.key === QUIZ_STORE_KEY_MIRROR) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    off();
    window.removeEventListener("storage", onStorage);
  };
}
