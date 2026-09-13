"use client";

/**
 * [995] 카카오 JS SDK 를 **누를 때** 받아 초기화한다 — app/my/points/ShareRow.tsx 와 같은
 * 방식(같은 SDK 버전·같은 초기화 순서). 그 파일은 초대 화면 전용이라 로더를 내보내지
 * 않는다; 카드 스튜디오가 두 번째 호출자가 되면서 여기로 옮겨 적었다. 세 번째가 생기면
 * lib/kakao 로 올린다.
 *
 * NEXT_PUBLIC_KAKAO_JS_KEY 가 빌드에 없으면 아무것도 하지 않는다(null) — 호출부는 그 경우
 * 카카오 버튼을 아예 그리지 않는다(카카오라고 말하고 다른 일을 하지 않는다).
 * CSP 는 키가 있을 때만 kakaocdn 을 허용한다(lib/security/content-security-policy.ts).
 */

export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

const KAKAO_SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

export type KakaoShareLike = {
  init?: (key: string) => void;
  isInitialized?: () => boolean;
  Share?: {
    sendDefault?: (settings: unknown) => void;
  };
};

function getKakao(): KakaoShareLike | null {
  if (typeof window === "undefined") return null;
  const k = (window as unknown as { Kakao?: KakaoShareLike }).Kakao;
  return k ?? null;
}

let kakaoSdk: Promise<KakaoShareLike | null> | null = null;

/** SDK 를 한 번만 받아 초기화한다. 실패하면 null — 호출부가 폴백을 탄다. */
export function loadKakaoSdk(): Promise<KakaoShareLike | null> {
  if (kakaoSdk) return kakaoSdk;
  kakaoSdk = new Promise<KakaoShareLike | null>((resolve) => {
    if (!KAKAO_JS_KEY || typeof document === "undefined") return resolve(null);

    const ready = (): KakaoShareLike | null => {
      const k = getKakao();
      if (!k) return null;
      try {
        if (!k.isInitialized?.()) k.init?.(KAKAO_JS_KEY);
      } catch {
        return null;
      }
      return k.isInitialized?.() ? k : null;
    };

    const already = getKakao();
    if (already) return resolve(ready());

    const script = document.createElement("script");
    script.src = KAKAO_SDK_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(ready());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  }).catch(() => null);
  return kakaoSdk;
}
