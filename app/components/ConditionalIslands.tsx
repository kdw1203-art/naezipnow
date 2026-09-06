"use client";

import nextDynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { isInstalled } from "@/lib/client/pwa-install";
import { isIosSafari } from "@/lib/client/pwa-install-prompt";
import {
  FINE_POINTER_MEDIA,
  NO_ISLANDS,
  decideIslands,
  type IslandDecision,
  type IslandEnv,
} from "@/lib/client/shell-gates";

/**
 * [968 · 14] 루트 레이아웃의 **조건부** 클라이언트 섬 — 조건을 한 번 판정한 뒤 맞는
 * 것만 next/dynamic 으로 내려받아 마운트한다.
 *
 * 왜: 루트 레이아웃이 섬 26개를 모든 페이지에서 하이드레이션했다. 그중 넷은 환경에
 * 따라 아예 할 일이 없다(판정 규칙은 lib/client/shell-gates.decideIslands) —
 * 브라우저 탭으로 여는 안드로이드 폰에서는 넷 다 마운트만 하고 아무 일도 안 했다.
 * 여기서 판정하면 그 폰은 이 넷의 코드·하이드레이션을 받지 않는다(모바일 브라우저
 * 기준 루트 섬 4개 → 0개, 데스크톱은 DragScroll 하나만).
 *
 * 서버 HTML: 넷 다 원래 서버에서 그리는 마크업이 없거나(BrandSplash·DragScroll·
 * IosInstallHint 는 null) 보이지 않는다(PullToRefresh 의 .njn-ptr 은 fixed·height 0)
 * — LCP·게스트 캐시와 무관. 서버·첫 렌더는 전부 미마운트(하이드레이션 불일치 없음).
 */

function readEnv(): IslandEnv {
  let finePointer = false;
  try {
    finePointer =
      typeof window.matchMedia === "function" && window.matchMedia(FINE_POINTER_MEDIA).matches;
  } catch {
    finePointer = false;
  }
  return { standalone: isInstalled(), finePointer, iosSafari: isIosSafari() };
}

/* 넷 다 ssr:false — 서버가 그리던 마크업이 없거나 보이지 않는다(위 주석). loading 은
   기본(null): 자리표시가 필요한 UI 가 아니다. */
const PullToRefresh = nextDynamic(
  () => import("./motion/PullToRefresh").then((m) => m.PullToRefresh),
  { ssr: false },
);
const BrandSplash = nextDynamic(
  () => import("./motion/BrandSplash").then((m) => m.BrandSplash),
  { ssr: false },
);
const DragScroll = nextDynamic(() => import("./motion/DragScroll").then((m) => m.DragScroll), {
  ssr: false,
});
const IosInstallHint = nextDynamic(
  () => import("./IosInstallHint").then((m) => m.IosInstallHint),
  { ssr: false },
);

export function ConditionalIslands() {
  const [on, setOn] = useState<IslandDecision>(NO_ISLANDS);
  useEffect(() => {
    setOn(decideIslands(readEnv()));
  }, []);

  return (
    <>
      {/* [962] 설치 앱에서만 — 당겨서 새로고침(온점 물방울) */}
      {on.pullToRefresh && <PullToRefresh />}
      {/* [961] 홈 화면 설치 앱으로 열 때만, 세션당 한 번 — 로고가 그려지는 1.4초 */}
      {on.brandSplash && <BrandSplash />}
      {/* 가로 스크롤 레일 마우스 드래그(문서 위임·렌더 없음) */}
      {on.dragScroll && <DragScroll />}
      {/* iOS 사파리는 beforeinstallprompt 가 없어 InstallPrompt 배너가 절대 안 뜬다.
          주소창·도구막대를 없애는 유일한 경로("공유 → 홈 화면에 추가")를 안내만 한다. */}
      {on.iosInstallHint && <IosInstallHint />}
    </>
  );
}
