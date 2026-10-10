"use client";

/* [1053] 앱 안 브라우저 안내 — 구글 로그인 단추 자리에. 구글은 앱 안 웹뷰의 로그인을 막아(disallowed_useragent)
   단추를 누르면 구글 오류 화면에서 끝났다. 열 수 있으면 "기본 브라우저로 열기", 아니면 주소 복사 + 메뉴 안내.
   이메일 로그인·가입은 앱 안에서도 그대로 된다. */
import { useEffect, useState } from "react";
import { externalOpenUrl, inAppKind, inAppLabel, isIOS, type InAppKind } from "@/lib/client/in-app-browser";

/** 마운트 뒤에만 판정(서버·첫 렌더는 null — 하이드레이션이 어긋나지 않게) */
export function useInAppBrowser(): InAppKind | null {
  const [kind, setKind] = useState<InAppKind | null>(null);
  useEffect(() => {
    try {
      setKind(inAppKind(navigator.userAgent));
    } catch {
      setKind(null);
    }
  }, []);
  return kind;
}

export function InAppBrowserNotice({ kind, flow = "login" }: { kind: InAppKind; flow?: "login" | "signup" }) {
  const [copied, setCopied] = useState(false);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    try {
      setOpenUrl(externalOpenUrl(kind, window.location.href, navigator.userAgent));
      setIos(isIOS(navigator.userAgent));
    } catch {
      setOpenUrl(null);
    }
  }, [kind]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="note" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
      <p className="m-0 t-sub font-bold text-ink">{inAppLabel(kind)} 안에서는 구글 로그인 막힘</p>
      <p className="m-0 t-caption text-text-3">
        구글 정책 · 기본 브라우저(크롬·사파리·삼성 인터넷)에서 열면 구글 로그인 가능 · 이메일 {flow === "signup" ? "가입" : "로그인"}은 여기서도 가능
      </p>
      <div className="flex flex-wrap gap-2">
        {openUrl && (
          <a href={openUrl} className="btn-soft inline-flex min-h-[40px] items-center px-4 t-sub font-bold no-underline">
            기본 브라우저로 열기
          </a>
        )}
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-[40px] items-center rounded-lg border border-line px-4 t-sub font-bold text-text-1">
          {copied ? "주소 복사됨" : "주소 복사"}
        </button>
      </div>
      {!openUrl && (
        <p className="m-0 t-caption text-text-3">
          {ios ? "화면 아래·위 메뉴(⋯ 또는 공유) → '다른 브라우저로 열기' 또는 'Safari로 열기'" : "화면 메뉴(⋮) → '다른 브라우저로 열기'"}
        </p>
      )}
    </div>
  );
}
