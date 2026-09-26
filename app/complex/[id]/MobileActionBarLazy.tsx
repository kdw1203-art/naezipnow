"use client";

import { useEffect, useState, type ComponentProps } from "react";
import nextDynamic from "next/dynamic";
import type { MobileActionBar as Bar } from "./MobileActionBar";

/* [1008 · Q] 모바일 하단 액션 바는 **처음 스크롤할 때** 받는다(번들 상쇄).
   왜: 바는 원래 CTA 가 화면 밖일 때만 보이므로(첫 화면에는 늘 없다) 첫 로드에 실을 이유가 없다.
   /complex/[id] 는 479/480KB 인데 이번 판에 "호가 점검" 입구가 더해진다 — 바 본체(관찰자·모달 감지·
   관심 버튼 배선)를 떼어 그 몫을 만든다. 착지 뒤 스크롤 없이 떠나는 방문(단지 착지 이탈 48%)·봇은
   이 청크를 아예 받지 않는다. 보이는 조건·동작은 MobileActionBar 그대로다. */
const MobileActionBar = nextDynamic(() => import("./MobileActionBar").then((m) => m.MobileActionBar), {
  ssr: false,
});

export function MobileActionBarLazy(props: ComponentProps<typeof Bar>) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const arm = () => setArmed(true);
    addEventListener("scroll", arm, { once: true, passive: true });
    /* 해시로 들어온 경우(…#asking-check) 브라우저가 이미 스크롤해 둔 상태일 수 있다 */
    if (scrollY > 0) arm();
    return () => removeEventListener("scroll", arm);
  }, []);
  return armed ? <MobileActionBar {...props} /> : null;
}
