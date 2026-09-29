/**
 * [1025 · 브리핑] 발행자(사무소명·담당자·연락처) — 이 기기의 localStorage 에만 둔다.
 *
 * 왜 서버·쿼리가 아닌가: 중개사 개인 연락처다. 링크를 고객에게 보내도 사무소 정보는 따라가지 않아야 하고(개인정보),
 * 게스트(비로그인)도 쓸 수 있어야 한다. 서버 HTML 은 ISR 공용이라 개인 값을 그릴 수 없다 — 클라이언트가 붙은 뒤 채운다.
 *
 * 폼(BriefPublisherForm)과 문서 머리줄(BriefPublisherLine)은 다른 서버 조각 안에 있어 같은 React 상태를 못 나눈다 —
 * 저장할 때 window 이벤트를 쏘고 머리줄이 듣는다(같은 탭). 다른 탭의 변경은 storage 이벤트로 온다.
 */
import { EMPTY_PUBLISHER, PUBLISHER_STORAGE_KEY, sanitizePublisher, type Publisher } from "./model";

/** 같은 탭 안 갱신 신호 */
export const PUBLISHER_EVENT = "nz-brief-publisher";

export function readPublisher(): Publisher {
  if (typeof window === "undefined") return EMPTY_PUBLISHER;
  try {
    const raw = window.localStorage.getItem(PUBLISHER_STORAGE_KEY);
    if (!raw) return EMPTY_PUBLISHER;
    return sanitizePublisher(JSON.parse(raw));
  } catch {
    return EMPTY_PUBLISHER;
  }
}

export function writePublisher(p: Publisher): Publisher {
  const clean = sanitizePublisher(p);
  if (typeof window === "undefined") return clean;
  try {
    const empty = !clean.office && !clean.agent && !clean.phone;
    if (empty) window.localStorage.removeItem(PUBLISHER_STORAGE_KEY);
    else window.localStorage.setItem(PUBLISHER_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* 사생활 모드 등 — 저장 실패는 조용히(화면 상태는 그대로) */
  }
  try {
    window.dispatchEvent(new CustomEvent(PUBLISHER_EVENT));
  } catch {
    /* 아주 오래된 브라우저 — 머리줄 갱신만 빠진다 */
  }
  return clean;
}

/** 변경을 듣는다(같은 탭 이벤트 + 다른 탭 storage). 해제 함수를 돌려준다. */
export function subscribePublisher(onChange: (p: Publisher) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fire = () => onChange(readPublisher());
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PUBLISHER_STORAGE_KEY) fire();
  };
  window.addEventListener(PUBLISHER_EVENT, fire);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PUBLISHER_EVENT, fire);
    window.removeEventListener("storage", onStorage);
  };
}
