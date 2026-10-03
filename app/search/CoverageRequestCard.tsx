"use client";

import { useState } from "react";

/* 검색 무결과 → 빠진 단지 제보 카드(#413).
 *
 * [1027] 이메일 칸과 "열리면 알려드릴게요" 약속을 내렸다. 이 서비스는 아직 메일을 보내지 못한다
 * (발송 키 미설정 — lib/email/send.ts). 보낼 수 없는 알림을 약속하고 주소를 받는 것은 거짓 약속이다.
 * 운영 실측(2026-10-03) region_demand_requests 0행 — 받아 둔 주소는 없다.
 * "수도권 주요 지역부터 순차 확장" 문구도 내렸다 — 실거래는 이미 전국을 수집한다(무결과의 원인은
 * 지역이 아니라 단지 이름·수집 누락이다). 남는 것은 제보 한 번: 검색어가 운영자에게 간다.
 * 메일이 실제로 나가게 되면(제안 14번) 주소 칸은 그때 다시 붙인다. */

export function CoverageRequestCard({ query }: { query: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async () => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/coverage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, source: "search" }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div
        role="status"
        className="mt-5 w-full max-w-[520px] rounded-2xl border border-primary/25 bg-primary-soft px-4 py-3.5 text-center t-body font-bold text-primary"
      >
        제보했어요 · 단지 데이터 보강에 반영
      </div>
    );
  }

  return (
    <div className="card mt-5 flex w-full max-w-[520px] flex-col gap-2 rounded-2xl px-4 py-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="t-body font-bold text-ink">빠진 단지 제보</div>
          <p className="mt-0.5 truncate t-sub text-text-2">「{query}」 검색어를 운영자에게 전달</p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "busy"}
          className="btn-primary shrink-0 rounded-xl px-4 py-2.5 t-body disabled:opacity-60"
        >
          {state === "busy" ? "보내는 중…" : "제보하기"}
        </button>
      </div>
      {state === "error" && (
        <p className="t-sub font-semibold text-danger">
          지금은 보내지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
