"use client";

import { useState } from "react";
import { KAKAO_JS_KEY, loadKakaoSdk } from "@/lib/kakao/sdk";
import { buildKakaoFeedShare } from "@/lib/kakao/share-template";
import { Icon } from "@/app/components/Icon";

/* [1081 · #23] 카카오톡 공유 — 단지·월간 리포트. 키가 없으면 아무것도 그리지 않는다(카카오라고 말하고 다른 일을 하지 않는다).
   SDK 는 누를 때 받는다(lib/kakao/sdk). 실패하면 시스템 공유 → 링크 복사 순으로 내려간다. 모양은 옆의 ShareLinkButton(chip)과 같은 칩. */
export function KakaoShareButton({
  title,
  description,
  url,
  buttonTitle = "내집나우에서 보기",
  className = "",
}: {
  title: string;
  description: string;
  /** 절대 주소 또는 상대 경로(현재 주소 기준) */
  url?: string;
  buttonTitle?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  if (!KAKAO_JS_KEY) return null;

  const resolveUrl = () => {
    if (typeof window === "undefined") return url ?? "";
    try {
      return new URL(url ?? window.location.href, window.location.href).toString();
    } catch {
      return window.location.href;
    }
  };

  const share = async () => {
    if (state === "busy") return;
    setState("busy");
    const shareUrl = resolveUrl();
    try {
      const kakao = await loadKakaoSdk();
      if (kakao?.Share?.sendDefault) {
        /* [1082] 카드 그림은 이 화면의 og:image(단지 카드·리포트 카드) — 없으면 템플릿 기본(/og-image) */
        const imageUrl = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content?.trim() || undefined;
        kakao.Share.sendDefault(buildKakaoFeedShare({ title, description, shareUrl, buttonTitle, imageUrl }));
        setState("idle");
        return;
      }
    } catch {
      /* SDK 실패 — 아래 폴백 */
    }
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: description, url: shareUrl });
        setState("idle");
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={state === "busy"}
      aria-label="카카오톡으로 공유"
      className={`press inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 t-sub font-bold text-ink no-underline md:min-h-9 ${className}`.trim()}
    >
      <Icon name="message-circle" size={15} />
      {state === "copied" ? "링크 복사됨" : "카카오톡"}
    </button>
  );
}

export default KakaoShareButton;
