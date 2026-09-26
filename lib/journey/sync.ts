/**
 * [1008 · J] 로그인 뒤 계정 진행을 정하는 규칙(순수 — 브라우저 저장소 lib/journey/client-store.ts 가 쓰고,
 * node:test 가 경쟁 상황을 그대로 재현한다).
 *
 * [리뷰 C · race2.mjs] 계정 진행을 불러오는(GET) 사이 매매가를 적으면, 그 값이 비회원 사본에 "매매가만 있는 일정표"로
 * 적혔고, 합칠 때 더 최근 일정표가 통째로 이겨 계정의 계약일·잔금일·체크가 지워졌다. 이제는
 *  - 불러오는 동안의 변경은 사본에 적지 않고 **변경 함수 그대로** 줄 세웠다가(client-store pendingOps) 계정 상태 위에
 *    다시 적용한다 — 매매가만 바꾼 변경은 매매가만 바꾼다(setDate·setPrice 가 모두 "지금 일정표 + 한 칸" 모양이다).
 *  - 합치기(mergeJourneyStates)도 같은 거래면 칸마다 합친다.
 *  - 입력칸은 불러오는 동안 막혀 있다(ContractPlanner·JourneyBoard 의 disabled={!ready}) — 이 규칙은 그래도 들어온
 *    변경(다른 탭·빠른 클릭)을 잃지 않게 하는 두 번째 벽이다.
 */
import type { AccountCopy } from "./local";
import { isJourneyEmpty, mergeJourneyStates, type JourneyState } from "./state";

/** 진행 상태를 바꾸는 변경 하나(updateJourney 에 넘기는 함수) */
export type JourneyOp = (s: JourneyState) => JourneyState;

export function applyJourneyOps(s: JourneyState, ops: readonly JourneyOp[]): JourneyState {
  return ops.reduce((acc, fn) => fn(acc), s);
}

/**
 * 계정 진행 = 서버 상태 ← 이 계정의 저장 못 한 사본 ← 비회원 사본 ← 불러오는 동안의 변경.
 *  1) 저장 못 한 사본(copy): 서버가 그 뒤로 그대로면(copy.base === server.updatedAt) 사본이 그대로 최신 — 통째로 쓴다
 *     (지운 칸·푼 체크까지 사본대로). 그 사이 다른 기기가 저장했으면 합친다(잃지 않는 쪽).
 *  2) 비회원 사본(guest): 합친다(mergeJourneyStates — 같은 거래면 칸마다, 체크는 합집합).
 *  3) 불러오는 동안의 변경(ops): 순서대로 다시 적용한다.
 */
export function composeAccountState(input: {
  server: JourneyState;
  copy: AccountCopy | null;
  guest: JourneyState;
  ops: readonly JourneyOp[];
  nowIso: string;
}): JourneyState {
  const { server, copy, guest, ops, nowIso } = input;
  let next = server;
  if (copy) next = copy.base === server.updatedAt ? copy.state : mergeJourneyStates(copy.state, server, nowIso);
  if (!isJourneyEmpty(guest)) next = mergeJourneyStates(guest, next, nowIso);
  return applyJourneyOps(next, ops);
}
