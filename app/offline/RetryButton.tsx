"use client";

import { useState } from "react";

/**
 * 오프라인 폴백의 "다시 시도" — location.reload() 한 줄이 전부다.
 * confirm()/alert() 같은 모달 다이얼로그는 쓰지 않는다(자동화·접근성 양쪽에서 막힌다).
 *
 * [968 · 42] 클래스는 page.tsx 의 인라인 <style>(.nz-off-*) 이 정의한다 — Tailwind 유틸은
 * CSS 번들이 캐시에 없으면 사라지므로 이 화면에서는 쓰지 않는다.
 */
export function RetryButton() {
  const [tried, setTried] = useState(false);

  return (
    <div className="nz-off-retry">
      <button
        type="button"
        onClick={() => {
          setTried(true);
          window.location.reload();
        }}
        className="nz-off-btn"
      >
        다시 시도
      </button>
      {/* 눌렀는데도 이 화면이 그대로면 아직 연결이 안 된 것 — 그 사실만 알려준다 */}
      <p aria-live="polite" className="nz-off-status">
        {tried ? "아직 연결되지 않았어요. 잠시 후 다시 눌러 주세요." : ""}
      </p>
    </div>
  );
}
