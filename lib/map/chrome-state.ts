/**
 * [968 · 24] 모바일 지도 크롬 접기 — 상태 전이만 담은 순수 함수.
 *
 * 왜 따로 떼어냈나: map-client.tsx 는 5,000줄이 넘어 "언제 접히고 언제 펴지나"를
 * 그 안에서 검증할 수 없다. 드래그·idle·탭·타이머·뷰포트 변화가 섞이는 규칙은
 * 여기서 표로 정하고 단위테스트로 못 박는다(tests/unit/map-mobile-968.test.ts).
 *
 * 규칙(탭바 autohide 와 같은 결):
 *   - dragstart(손가락으로 지도를 끌기 시작) → compact. 단, 넓은 화면(≥768)이거나
 *     잠금(locked: 필터 패널 열림·목록 뷰·입력 중)일 때는 접지 않는다 — 접는 순간
 *     입력이 blur 되어 키보드가 닫히는 식의 부작용이 더 크다.
 *   - idle(지도가 멈춤) → 상태 유지. 호출부가 CHROME_RESTORE_DELAY_MS 뒤에
 *     "idle-timeout" 을 보낸다(멈추자마자 펴면 관성 스크롤 끝에서 깜빡인다).
 *   - idle-timeout · tap(칩 행이나 지도를 탭) · widen(≥768 로 넓어짐) → expanded.
 * 모든 컨트롤은 접힌 동안에도 DOM 에 남는다(inert 로 가릴 뿐) — 기능을 빼는
 * "최적화"가 아니라 시점을 옮기는 것이다.
 */

export type MapChromeState = "expanded" | "compact";

export type MapChromeEvent = "dragstart" | "idle" | "idle-timeout" | "tap" | "widen";

/** idle 이후 크롬을 다시 펴기까지의 지연(ms) */
export const CHROME_RESTORE_DELAY_MS = 1200;

/** 767px 이하 = 접기 대상 뷰포트(Tailwind md 미만과 같은 경계) */
export const CHROME_COMPACT_MEDIA = "(max-width: 767px)";

export type MapChromeContext = {
  /** 뷰포트가 767px 이하인가 — 아니면 어떤 이벤트도 compact 를 만들지 않는다 */
  narrow: boolean;
  /** 접으면 안 되는 상황(필터 패널 열림·목록 뷰·입력 포커스) */
  locked?: boolean;
};

export function nextChromeState(
  evt: MapChromeEvent,
  state: MapChromeState,
  ctx: MapChromeContext,
): MapChromeState {
  if (!ctx.narrow) return "expanded";
  switch (evt) {
    case "dragstart":
      return ctx.locked ? state : "compact";
    case "idle":
      return state;
    case "idle-timeout":
    case "tap":
    case "widen":
      return "expanded";
    default:
      return state;
  }
}

/**
 * idle 뒤 복원 타이머를 걸어야 하는가 — compact 일 때만. expanded 에서 매 idle 마다
 * 타이머를 만들면 지도가 조용히 멈출 때마다 setState 가 한 번씩 헛돈다.
 */
export function shouldScheduleRestore(evt: MapChromeEvent, state: MapChromeState): boolean {
  return evt === "idle" && state === "compact";
}
