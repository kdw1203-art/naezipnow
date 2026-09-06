"use client";

import { useSyncExternalStore } from "react";

/**
 * [968 · 47] "홈 화면에 추가" 진입점 공유 상태.
 *
 * 왜: Chromium 의 `beforeinstallprompt` 는 InstallPrompt 컴포넌트가 useRef 에 혼자
 * 쥐고 있었다 — 3일째 방문 전엔 배너가 안 뜨고, 배너 말고는 설치를 **사용자가 직접**
 * 시작할 자리가 없었다. 이벤트를 모듈 상태로 옮겨 배너와 전체 메뉴가 같은 이벤트를
 * 본다. 이벤트는 1회용이므로(prompt() 뒤 재사용 불가) 소비는 `takeDeferredInstallPrompt`
 * 로 한 번만 꺼내 쓴다.
 *
 * iOS 사파리는 이 이벤트가 없다. 그쪽은 IosInstallHint 안내를 **요청**하는 신호
 * (`requestIosInstallHint`)만 있고, 판정(`isIosSafariUa`)은 순수 함수로 두어 테스트한다.
 */

/** Chromium 전용 이벤트라 lib.dom 타입에 없다. 필요한 두 멤버만 좁혀서 선언한다. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let captured = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

/**
 * window 의 beforeinstallprompt / appinstalled 를 한 번만 잡아 둔다(멱등).
 * 브라우저 자체 미니 인포바를 막고 이벤트를 보관한다 — 안 막으면 나중에 prompt() 를
 * 부를 방법이 없다. 여러 컴포넌트가 불러도 리스너는 하나다.
 */
export function captureInstallPrompt(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

/** 이벤트를 꺼내고 비운다 — prompt() 는 1회용이라 두 곳이 같은 이벤트를 쓰면 반드시 실패한다 */
export function takeDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  const ev = deferred;
  deferred = null;
  notify();
  return ev;
}

/** 테스트·재사용용: 밖에서 받은 이벤트를 넣는다(InstallPrompt 가 직접 쓰지는 않는다) */
export function setDeferredInstallPrompt(ev: BeforeInstallPromptEvent | null): void {
  deferred = ev;
  notify();
}

export function subscribeInstallPrompt(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

const getAvailable = () => deferred !== null;
const getServerAvailable = () => false;

/** 브라우저가 설치 가능하다고 알려 왔는가(이벤트 보관 중). 서버·첫 렌더는 false. */
export function useInstallPromptAvailable(): boolean {
  return useSyncExternalStore(subscribeInstallPrompt, getAvailable, getServerAvailable);
}

/* ───────────── iOS Safari 판정 (IosInstallHint 에서 옮김) ───────────── */

/** 홈 화면 추가 메뉴가 **없는** 인앱 웹뷰들 — 여기서 안내하면 틀린 설명이 된다 */
const IN_APP = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|Snapchat|Threads/i;
/** iOS 의 다른 브라우저 — 공유 시트 구성이 사파리와 달라 같은 안내를 쓸 수 없다 */
const OTHER_IOS_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|Whale|SamsungBrowser/i;

/** 순수 판정: iPhone/iPad(iPadOS 13+ 는 Macintosh + 터치) 의 사파리인가 */
export function isIosSafariUa(ua: string, maxTouchPoints = 0): boolean {
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!isIos) return false;
  if (IN_APP.test(ua) || OTHER_IOS_BROWSER.test(ua)) return false;
  return /Safari/.test(ua);
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIosSafariUa(navigator.userAgent, navigator.maxTouchPoints);
}

/* ───────────── iOS 안내 열기 요청 ───────────── */

export const IOS_INSTALL_HINT_EVENT = "nz:ios-install-hint";
let iosHintPending = false;

/**
 * 전체 메뉴의 "홈 화면에 추가"(iOS)가 부른다. IosInstallHint 가 이미 떠 있으면 이벤트로
 * 즉시 열리고, 아직 마운트 전(next/dynamic 청크 대기)이면 플래그를 남겨 마운트 때 연다.
 */
export function requestIosInstallHint(): void {
  if (typeof window === "undefined") return;
  iosHintPending = true;
  window.dispatchEvent(new Event(IOS_INSTALL_HINT_EVENT));
}

/** IosInstallHint 가 마운트·이벤트 때 호출 — 요청이 있었으면 true 를 돌려주고 지운다 */
export function consumeIosInstallHintRequest(): boolean {
  const pending = iosHintPending;
  iosHintPending = false;
  return pending;
}
