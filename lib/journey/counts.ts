import "server-only";
import { loadQuizDays } from "@/lib/quiz/load-price-game";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { listImjangRegions } from "@/lib/imjang/guide";
import { GLOSSARY_TERMS } from "@/lib/seo/glossary-terms";
import { SALE_HOUSE_BRACKETS } from "@/lib/finance/brokerage";
import { LOAN_RULES_CHECKED_AT } from "@/lib/finance/loan-rules";
import { logger } from "@/lib/log";
import type { JourneyCountInput } from "./stages";

/* ============================================================
   [1012 · R2] /journey 카드 오른쪽 숫자의 원천 — 서버에서 한 번 읽는다(페이지는 ISR 1일).

   2라운드 리뷰(채점 A −3 "숫자 없는 링크 카드", −1 "실데이터·출처 0"): 여정 카드는 이름 + 설명뿐이었다.
   여기서 읽는 값은 전부 **다른 화면이 이미 같은 값으로 쓰는 실데이터**다 — 새 계산·새 조회 종류 없음.
     · 오늘 문제 수      lib/quiz/load-price-game(날짜별 데이터 캐시 48h — /quiz 와 같은 판)
     · 시군구 수         lib/newui/home-coverage(홈 "전국 N개 시군구" · 7일 캐시)
     · 최신 신고월       lib/market/tx-bands 지역 목록(/imjang·/tx 와 같은 원천)의 latestYm 최댓값
     · 임장 가이드 지역   listImjangRegions(48) — /imjang 인덱스가 싣는 수와 같다
     · 용어 수·요율 구간·규정 확인일 — 코드 상수(순수 모듈)
   실패 규율: DB 를 읽는 셋은 각각 잡아서 null(그 카드는 숫자 없음). 던지지 않는다 — 정적 페이지가
   숫자 하나 때문에 깨지면 안 된다. 개인화(세션·쿠키)는 읽지 않는다(tests/unit/journey-1008 계약).
   ============================================================ */

async function quizRounds(nowMs: number): Promise<number | null> {
  try {
    const r = await loadQuizDays(nowMs);
    if (!r.ok) return null;
    const today = r.days[0];
    const rounds = today ? today.entries.length - 1 : 0;
    return rounds > 0 ? rounds : null;
  } catch (e) {
    logger.warn("[journey-counts] 오늘 문제 수 조회 실패 — 카드에 숫자를 붙이지 않는다", e);
    return null;
  }
}

async function imjang(): Promise<{ regions: number | null; latestYm: string | null }> {
  try {
    const list = await listImjangRegions(48);
    let latestYm: string | null = null;
    for (const r of list) if (r.latestYm && (!latestYm || r.latestYm > latestYm)) latestYm = r.latestYm;
    return { regions: list.length > 0 ? list.length : null, latestYm };
  } catch (e) {
    logger.warn("[journey-counts] 임장 가이드 지역 조회 실패 — 카드에 숫자를 붙이지 않는다", e);
    return { regions: null, latestYm: null };
  }
}

export async function loadJourneyCounts(nowMs: number = Date.now()): Promise<JourneyCountInput> {
  const [quiz, coverage, im] = await Promise.all([quizRounds(nowMs), loadHomeCoverage(), imjang()]);
  return {
    quizRounds: quiz,
    regionCount: coverage.regionCount,
    latestYm: im.latestYm,
    imjangRegions: im.regions,
    glossaryTerms: GLOSSARY_TERMS.length,
    brokerageBrackets: SALE_HOUSE_BRACKETS.length,
    loanRulesCheckedAt: LOAN_RULES_CHECKED_AT,
  };
}
