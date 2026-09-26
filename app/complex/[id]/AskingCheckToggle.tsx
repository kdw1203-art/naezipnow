"use client";

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";

/* [1008 · Q] 호가 점검 펼침 — 첫 로드 JS 에는 이 버튼만 남는다(/complex/[id] 479/480KB).
   머리말·설명은 page.tsx(서버)가 그리고, 본체(입력·분포 막대·API 조회)는 펼칠 때 받는 청크다.
   행동 줄(상단 알약·하단 CTA·모바일 바)의 "호가 점검"은 JS 없는 <a href="#asking-check"> 이고,
   여기서 hashchange 를 듣고 펼친다(딥링크 …#asking-check 도 같은 길). 버튼과 본체는 부모 카드의
   flex-wrap 자식이다 — 본체는 basis-full 로 다음 줄에 온다. */

const Panel = nextDynamic(() => import("./AskingCheckPanel").then((m) => m.AskingCheckPanel), {
  ssr: false,
  loading: () => <div className="skeleton mt-3 h-40 rounded-xl" />,
});

const HASH = "#asking-check";

export function AskingCheckToggle({ apiId }: { apiId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => location.hash === HASH && setOpen(true);
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="asking-check-body"
        onClick={() => {
          /* 해시를 지워 둬야 다음에 행동 줄의 "호가 점검"을 눌렀을 때 hashchange 가 다시 온다 */
          if (open && location.hash === HASH) history.replaceState(history.state, "", location.pathname + location.search);
          setOpen(!open);
        }}
        className="btn-soft min-h-10 shrink-0 rounded-xl px-3.5 t-sub"
      >
        {open ? "접기" : "열기"}
      </button>
      <div id="asking-check-body" className="basis-full">
        {open && <Panel apiId={apiId} />}
      </div>
    </>
  );
}
