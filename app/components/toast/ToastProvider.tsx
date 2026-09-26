"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

/* 공용 토스트 (#42 · 961 브랜드 모션) — 동작 후 확인 피드백을 사이트 전역에서 일관되게.
   스펙: 동시 1개 · 3초(액션 있으면 5초) · 모바일 탭바 위 · 액션 최대 1개.
   961: 네이비 면 + 한지 글자 + 앞의 숨쉬는 온점(모션 시스템 07). 액션은 링크(href)뿐
   아니라 **되돌리기 같은 콜백(onClick)** 도 받는다 — 삭제 같은 파괴적 동작에 확인 모달을
   띄우는 대신 흐름을 끊지 않고 되돌릴 길을 준다(인터랙션 라이브러리 06).
   Provider 밖에서 useToast()가 호출돼도 no-op으로 안전. */

export type ToastAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };
type ToastContextValue = {
  showToast: (message: string, action?: ToastAction) => void;
};
type ToastState = { id: number; message: string; action?: ToastAction; leaving: boolean };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}

const HOLD_MS = 3000;
const HOLD_WITH_ACTION_MS = 5000;
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);
  /* [1009 · T] 지금 떠 있는 토스트 — 같은 문구가 연달아 오는지 렌더를 기다리지 않고 보려고(같은 틱의 두 호출도 잡는다) */
  const current = useRef<ToastState | null>(null);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const put = useCallback((next: ToastState | null) => {
    current.current = next;
    setToast(next);
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    const cur = current.current;
    if (cur) put({ ...cur, leaving: true });
    timers.current.push(window.setTimeout(() => put(null), LEAVE_MS));
  }, [clearTimers, put]);

  const showToast = useCallback(
    (message: string, action?: ToastAction) => {
      const msg = message?.trim();
      if (!msg) return;
      clearTimers();
      const cur = current.current;
      /* [1009 · T] 같은 문구를 연달아(설정 토글·담기 연타) — 새로 튀어 오르지 않고 **머무는 시간만** 늘린다.
         예전엔 매번 새 id 로 다시 그려져 같은 토스트가 깜빡였다. 액션(되돌리기)은 가장 최근 것으로 갈아 끼운다 —
         되돌리기는 마지막 동작을 되돌려야 한다. 스펙(동시 1개 · 3초/5초 · 탭바 위)은 그대로. */
      const same =
        cur !== null && !cur.leaving && cur.message === msg && (cur.action?.label ?? null) === (action?.label ?? null);
      if (same && cur) {
        put({ ...cur, action });
      } else {
        idRef.current += 1;
        put({ id: idRef.current, message: msg, action, leaving: false });
      }
      const hold = action ? HOLD_WITH_ACTION_MS : HOLD_MS;
      timers.current.push(
        window.setTimeout(() => {
          const now = current.current;
          if (now) put({ ...now, leaving: true });
        }, hold),
      );
      timers.current.push(window.setTimeout(() => put(null), hold + LEAVE_MS));
    },
    [clearTimers, put],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
        style={{ bottom: "var(--nz-toast-bottom)" }}
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            data-leaving={toast.leaving ? "true" : "false"}
            className="toast pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-2.5 px-4 py-3 t-body font-semibold"
          >
            <span className="toast-dot" aria-hidden="true" />
            {/* [1009 · T] 글자색을 여기서 준다 — globals 의 .toast 는 color: var(--brand-hanji) 인데 다크에선 그 토큰이
                '배경용' #262119 로 바뀌어, 네이비(#0B2545) 위 글자가 사실상 안 보였다(대비 1.04:1 → 13.7:1). --on-dark 는
                두 테마 모두 #F6F1E7 이라 라이트 모드 모습은 그대로다. */}
            <span className="min-w-0 truncate text-on-dark">{toast.message}</span>
            {toast.action &&
              (toast.action.href ? (
                <Link
                  href={toast.action.href}
                  className="toast-action shrink-0 whitespace-nowrap no-underline"
                >
                  {toast.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    /* [1009 · T] 먼저 닫고 동작한다 — 되돌리기가 결과 토스트("되돌렸어요")를 띄우면 그 새 토스트가
                       뒤따르는 dismiss() 에 바로 닫히던 순서를 뒤집었다 */
                    const act = toast.action;
                    dismiss();
                    act?.onClick?.();
                  }}
                  className="toast-action shrink-0 whitespace-nowrap"
                >
                  {toast.action.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
