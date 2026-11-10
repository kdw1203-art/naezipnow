"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { isBasicGateExempt } from "@/lib/account/basic-info";
import { BASIC_OK_KEY } from "./useBasicInfoForm";

/* [1138 · 필수 기본 정보] 로그인했는데 기본 정보가 비어 있으면 /my/basic-info?next=<지금 화면> 으로 보낸다.
   - 비회원(로그인 힌트 쿠키 없음)은 아무 요청도 하지 않는다.
   - 확인은 탭마다 한 번 — 다 찼으면 sessionStorage 에 표시하고 다시 묻지 않는다.
   - 조회가 실패하면(저장소 장애 · 열 추가 전) 보내지 않는다 — 장애로 사이트를 막지 않는다.
   - 로그인 · 가입 · 인증 콜백 · 약관 · 완성 화면 자신은 건너뛴다(isBasicGateExempt). */
export function BasicInfoGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!readAuthedHint()) {
      /* 로그아웃하면 표시를 지운다 — 같은 탭에서 다른 계정으로 들어와도 다시 확인한다 */
      try {
        window.sessionStorage.removeItem(BASIC_OK_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!pathname || isBasicGateExempt(pathname)) return;
    try {
      if (window.sessionStorage.getItem(BASIC_OK_KEY) === "1") return;
    } catch {
      /* 저장소를 못 쓰면 매번 확인 */
    }
    let alive = true;
    fetch("/api/me/basic-info", { cache: "no-store" })
      .then(async (r) => {
        if (!alive || !r.ok) return;
        const d = (await r.json()) as { complete?: boolean; ready?: boolean };
        if (d.ready === false) return;
        if (d.complete) {
          try {
            window.sessionStorage.setItem(BASIC_OK_KEY, "1");
          } catch {
            /* ignore */
          }
          return;
        }
        const here = `${window.location.pathname}${window.location.search}`;
        router.replace(`/my/basic-info?next=${encodeURIComponent(here)}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  return null;
}
