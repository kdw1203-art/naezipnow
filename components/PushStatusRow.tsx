"use client";

import { useCallback, useState } from "react";
import { PushSubscribe, type PushUiStatus } from "@/components/PushSubscribe";

/* [1058] 알림함(/notifications) 맨 위 한 줄 — 로그인한 사람에게 브라우저 푸시가 **실제로** 꺼져 있을 때만.
   "켜짐"은 PushSubscribe 가 서버(GET /api/push/subscribe?endpoint=)까지 확인한 뒤의 판정이다 —
   켜져 있거나 미지원(키 없음·브라우저 미지원)이거나 판정 전이면 아무것도 그리지 않는다.
   켜는 조작은 그 컴포넌트 자신(설정 › 알림과 같은 버튼)이다. */
export function PushStatusRow() {
  const [status, setStatus] = useState<PushUiStatus>("loading");
  const onStatus = useCallback((s: PushUiStatus) => setStatus(s), []);
  const hidden = status === "loading" || status === "subscribed" || status === "unsupported";
  return (
    <div
      className={
        hidden
          ? "hidden"
          : "card rise-in-1 mt-3 flex items-center justify-between gap-2 rounded-lg px-[15px] py-2"
      }
    >
      {/* 차단됨은 PushSubscribe 가 푸는 법까지 적는다 — 왼쪽 글은 사실 한 낱말만 */}
      <span className="t-sub font-bold text-ink">{status === "denied" ? "브라우저 알림" : "브라우저 알림 끔"}</span>
      <PushSubscribe onStatus={onStatus} />
    </div>
  );
}

export default PushStatusRow;
