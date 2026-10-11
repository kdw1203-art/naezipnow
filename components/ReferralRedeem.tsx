"use client";

import { useEffect, useRef } from "react";
import { hasSession } from "@/lib/client/has-session";
import { useToast } from "@/app/components/toast/ToastProvider";

/**
 * 초대 리딤 트리거 (렌더링 없음).
 *
 * 어디든(예: 루트 레이아웃) 마운트되어 있다가, ref_code 쿠키가 있으면
 * /api/referral/redeem 로 POST 한다.
 *  - 로그인 상태: 서버가 리딤 → 2xx → 쿠키 정리
 *  - 비로그인:   401 → 쿠키 유지(로그인 후 다음 마운트 때 재시도)
 * 모든 오류는 조용히 무시한다.
 *
 * [1056 · A8] 성사(ok:true)면 토스트 한 번 — 예전엔 300P 가 들어와도 새 회원에게 아무 표시가 없었다.
 * app/layout.tsx 에서 ToastProvider 안쪽에 마운트돼 있어 useToast 가 실제 토스트를 띄운다
 * (Provider 밖이면 no-op 이라 안전).
 */

const COOKIE_NAME = "ref_code";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function ReferralRedeem() {
  const done = useRef(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = readCookie(COOKIE_NAME);
    if (!code) return;

    void (async () => {
      try {
        /* [970 · C-43] 비로그인이면 서버가 어차피 401 이다 — 요청을 보내지 않는다(콘솔의
           빨간 401 줄이 초대 링크로 들어온 방문마다 찍혔다). 쿠키는 그대로 남겨 로그인 뒤
           다음 마운트에서 리딤한다(세션 판정은 hasSession — 헤더와 같은 1회 호출). */
        if (!(await hasSession())) return;
        const res = await fetch("/api/referral/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ code }),
        });
        // 2xx 면 종료 상태(리딤됨/자기추천/이미/코드무효) → 쿠키 제거.
        // 401(비로그인)·503(DB 일시 실패)은 쿠키를 남겨 다음 마운트에 재시도한다.
        // 서버가 "지금 못 한다"를 2xx 로 답하지 않는다는 약속에 기대는 코드다
        // (app/api/referral/redeem/route.ts 의 RETRYABLE_REASONS).
        if (res.ok) {
          clearCookie(COOKIE_NAME);
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; awarded?: number };
          if (j.ok) {
            /* 실제 지급액만 적는다 — 상한 등으로 0 이면 포인트를 말하지 않는다 */
            const pts = typeof j.awarded === "number" && j.awarded > 0 ? j.awarded : 0;
            showToast(pts > 0 ? `초대 코드 적용 · +${pts}P` : "초대 코드 적용", {
              label: "포인트",
              href: "/my/points",
            });
          }
        }
      } catch {
        /* 네트워크 오류 등은 무시 (쿠키 유지) */
      }
    })();
  }, [showToast]);

  return null;
}

export default ReferralRedeem;
