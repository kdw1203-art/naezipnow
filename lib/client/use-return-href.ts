"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { loginReturnHref, signupReturnHref } from "@/lib/client/shell-gates";

/**
 * [1086 · A4] 화면 안의 "로그인" · "회원가입" 링크가 지금 화면으로 돌아오게 — 헤더(HeaderAuth)와 같은 규칙(lib/client/shell-gates).
 * 예전엔 알림 받기(KeywordAlertButton) · AI 분석(ai-note-analysis) 링크가 맨 `/login` 이라 로그인 뒤 홈으로 떨어졌다.
 * 쿼리는 마운트 뒤 window 에서 읽는다(정적 페이지에서 useSearchParams 를 피한다 — 첫 렌더는 경로만).
 */
export function useReturnHref(kind: "login" | "signup" = "login"): string {
  const pathname = usePathname() ?? "/";
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  return kind === "signup" ? signupReturnHref(pathname, search) : loginReturnHref(pathname, search);
}

/** 이벤트 처리 중(누른 순간)에 쓰는 같은 규칙 — 훅을 못 쓰는 곳(401 응답 뒤 이동) */
export function currentLoginReturnHref(): string {
  if (typeof window === "undefined") return "/login";
  return loginReturnHref(window.location.pathname, window.location.search);
}
