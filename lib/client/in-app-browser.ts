/**
 * [1053] 앱 안 브라우저(인앱 웹뷰) 판정 — 순수 함수(tests/unit/auth-1053.test.ts).
 *
 * 왜: 구글은 앱 안 웹뷰에서 OAuth 로그인을 막는다(403 disallowed_useragent). 네이버 앱 검색 유입이 이 사이트
 * 방문의 큰 몫인데(운영 health 실측 7일 41회), 그 화면에서 'Google로 로그인'을 누르면 구글 오류 화면에서 끝났다.
 * 앱 안에서는 구글 단추 대신 "기본 브라우저로 열기"를 보여 준다.
 */
export type InAppKind = "kakaotalk" | "naver" | "instagram" | "facebook" | "line" | "daum" | "band" | "webview";

export function inAppKind(userAgent: string | null | undefined): InAppKind | null {
  const ua = String(userAgent ?? "");
  if (!ua) return null;
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/NAVER\(inapp|\bNAVER\b/.test(ua)) return "naver";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/\bLine\//i.test(ua)) return "line";
  if (/DaumApps|DaumDevice/i.test(ua)) return "daum";
  if (/BAND\//i.test(ua)) return "band";
  /* 안드로이드 시스템 웹뷰 표식 — "; wv)" (크롬 맞춤 탭은 이 표식이 없다) */
  if (/Android[^)]*;\s*wv\)/i.test(ua)) return "webview";
  return null;
}

export function isIOS(userAgent: string | null | undefined): boolean {
  return /iPhone|iPad|iPod/i.test(String(userAgent ?? ""));
}

/**
 * 기본 브라우저로 여는 주소 — 열 수 있는 길이 있을 때만, 없으면 null(화면이 "주소 복사"로 안내).
 *  · 카카오톡: kakaotalk://web/openExternal?url= (카카오 공식 스킴 · 안드로이드·iOS 공통)
 *  · 안드로이드 다른 앱: intent:// 로 크롬 — 크롬이 없으면 기기가 다른 브라우저를 고르게 한다(browser_fallback_url 없음)
 *  · iOS 네이버·인스타 등: 사파리로 여는 표준 스킴이 없다 → null
 */
export function externalOpenUrl(kind: InAppKind, href: string, userAgent: string | null | undefined): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (kind === "kakaotalk") return `kakaotalk://web/openExternal?url=${encodeURIComponent(u.toString())}`;
  if (isIOS(userAgent)) return null;
  if (/Android/i.test(String(userAgent ?? ""))) {
    const rest = `${u.host}${u.pathname}${u.search}`;
    return `intent://${rest}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
  }
  return null;
}

/** 화면 문구 — 어느 앱인지 이름으로 */
export function inAppLabel(kind: InAppKind): string {
  return (
    {
      kakaotalk: "카카오톡",
      naver: "네이버 앱",
      instagram: "인스타그램",
      facebook: "페이스북",
      line: "라인",
      daum: "다음 앱",
      band: "밴드",
      webview: "앱 안 브라우저",
    } as const
  )[kind];
}
