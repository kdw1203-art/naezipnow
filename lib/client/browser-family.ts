/**
 * [1027 · 제안 29] 브라우저 계열 — UA 에서 한 낱말만 뽑는다. 순수 함수(tests/unit/ops-1027.test.ts).
 *
 * 가입 지표에 "어떤 브라우저인지"를 남기려는 것이다(운영 실측 2026-09-11~10-01: "가입 1단계" 451건이
 * 전부 신원 없는 PC 접속 — 무엇이 찍었는지 알 길이 없었다). 버전·기기 모델은 남기지 않는다 —
 * 사람을 가려내려는 값이 아니라 "크롬 사람인가, 인앱인가, 낯선 것인가"만 본다.
 * 순서가 뜻이다: 인앱(카카오톡·네이버)·삼성·웨일·엣지는 UA 에 Chrome/Safari 글자를 같이 싣는다.
 */
export type BrowserFamily =
  | "kakaotalk"
  | "naver"
  | "samsung"
  | "whale"
  | "edge"
  | "firefox"
  | "chrome"
  | "safari"
  | "other";

export function browserFamily(userAgent: string | null | undefined): BrowserFamily {
  const ua = userAgent ?? "";
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/NAVER\(inapp|\bNAVER\b/.test(ua)) return "naver";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Whale\//i.test(ua)) return "whale";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/Firefox\/|FxiOS\//i.test(ua)) return "firefox";
  if (/Chrome\/|CriOS\//i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

/** 손에 든 기기인가 — UA 의 Mobi·Android·iPhone·iPad 표식만 본다 */
export function deviceClass(userAgent: string | null | undefined): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent ?? "") ? "mobile" : "desktop";
}
