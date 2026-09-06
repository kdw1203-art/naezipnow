"use client";

import { getSessionLite } from "@/lib/client/session-lite";

/**
 * [967 · 33] 클라이언트 "로그인 여부" 판정 — document.cookie 정규식 대신 세션 API.
 *
 * 왜 바꿨나: 세 곳(뉴스 댓글 채택·노트 소프트월·홈 출석 카드)이
 *   /(next-auth|authjs)\.session-token=/.test(document.cookie)
 * 로 로그인 여부를 판정했다. 그런데 auth.ts 는 cookies 옵션을 두지 않으므로
 * Auth.js 기본값(httpOnly: true)이 적용되고, httpOnly 쿠키는 스크립트에서
 * **절대 보이지 않는다.** 즉 이 판정은 브라우저에서 언제나 false 였다 —
 *   · 뉴스 댓글의 채택 버튼이 글쓴이에게도 안 보였고(GET /adopt 자체가 안 나감)
 *   · 노트 소프트월(하루 3건)이 로그인 사용자에게도 세워졌으며
 *   · 홈 출석 카드는 로그인해도 렌더되지 않았다.
 * 2026-09-06 모바일 감사에서 발견(감사 항목 48).
 *
 * getSessionLite 는 /api/auth/session 을 페이지당 1회로 수렴한 공유 프라미스라
 * (헤더 아바타가 이미 매 페이지 호출) 요청이 늘지 않는다.
 */
export async function hasSession(): Promise<boolean> {
  const s = await getSessionLite();
  return Boolean(s?.user?.email);
}
