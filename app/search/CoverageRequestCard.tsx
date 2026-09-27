"use client";
/* [1012 · 규칙 8] 굵기 800 이상(font-extrabold·font-black) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */

import { useState } from "react";

/* 검색 무결과 → 커버리지 수요 수집 카드(#413).
 *
 * 실거래 상세 데이터가 수도권 일부인 것이 성장의 유리천장이다. 커버 밖
 * 방문자를 그냥 보내는 대신 "열리면 알려드릴게요"로 수요를 지도화해,
 * 지역 확장 우선순위를 감이 아니라 이 숫자로 정한다.
 * 이메일은 선택 — 없어도 검색어 자체가 수요 1표다. */

export function CoverageRequestCard({ query }: { query: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async () => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/coverage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          source: "search",
          email: email.trim() || undefined,
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      /* [v4 · 규칙 10] 가운데 정렬 → 왼쪽 · 문장 → 사실 */
      <div className="mt-5 w-full rounded-lg bg-primary-soft px-4 py-3">
        <div className="t-body font-bold text-primary">수요 기록됨 · 확장 우선순위에 반영</div>
        {email.trim() && <div className="mt-0.5 t-sub text-text-2">이 지역 데이터가 열리면 이메일 알림</div>}
      </div>
    );
  }

  return (
    <div className="card mt-5 flex w-full flex-col gap-2.5 rounded-lg p-4">
      <div>
        <div className="t-body font-bold text-ink">찾는 지역이 아직 안 열렸나요?</div>
        {/* [v4 · 규칙 3] 설명 두 문장 → 사실 한 줄 */}
        <p className="mt-0.5 t-sub text-text-3">실거래 상세는 수도권 주요 지역부터 순차 확장 · 요청 많은 지역부터</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="(선택) 열리면 알림 받을 이메일"
          aria-label="열리면 알림 받을 이메일 (선택)"
          maxLength={120}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "busy"}
          className="btn-primary shrink-0 rounded-xl px-4 py-2.5 t-body disabled:opacity-60"
        >
          {state === "busy" ? "기록 중…" : "열리면 알려주세요"}
        </button>
      </div>
      {state === "error" && (
        <p className="t-sub font-semibold text-danger">
          지금은 기록하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
