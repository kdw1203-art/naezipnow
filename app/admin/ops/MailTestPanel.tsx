"use client";

import { useState } from "react";

/* [1042 · 메일 발송] 관리 › 운영 — 메일 발송 수단 · 발신 주소 · 시험 메일.
 * 수단과 발신 주소는 서버가 그려 준 값이고(호스트·비밀번호는 오지 않는다), 단추는 로그인한 관리자 자신의 주소로 한 통 보낸다.
 * 결과는 그대로 적는다 — "발송 완료 · 받는 주소" 또는 "발송 실패 · 사유". */
export function MailTestPanel({ provider, from }: { provider: "resend" | "smtp" | null; from: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; line: string } | null>(null);

  async function onTest() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email-test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        reason?: string | null;
        to?: string;
        error?: string;
      };
      if (!res.ok) setResult({ ok: false, line: data.error ?? "시험 실패 · 잠시 후 다시" });
      else if (data.sent) setResult({ ok: true, line: `발송 완료 · ${data.to ?? ""}` });
      else setResult({ ok: false, line: `발송 실패 · ${data.reason ?? "원인 미상"}` });
    } catch {
      setResult({ ok: false, line: "네트워크 오류 · 잠시 후 다시" });
    } finally {
      setBusy(false);
    }
  }

  const label = provider === "smtp" ? "SMTP" : provider === "resend" ? "Resend" : "미설정";
  return (
    <div className="rise-in-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-5">
      <span className="t-sub font-bold text-white">메일 발송</span>
      <span
        className={`rounded-md px-2 py-0.5 t-caption font-bold ${
          provider ? "bg-[rgba(76,175,130,.16)] text-[#4caf82]" : "bg-[rgba(255,107,107,.16)] text-ai-danger"
        }`}
      >
        {label}
      </span>
      {from && <span className="t-caption text-ai-muted">발신 {from}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-3">
        {result && (
          <span role={result.ok ? "status" : "alert"} className={`t-sub font-bold ${result.ok ? "text-[#8fd3a8]" : "text-ai-danger"}`}>
            {result.line}
          </span>
        )}
        <button
          type="button"
          onClick={onTest}
          disabled={busy || !provider}
          className="min-h-10 rounded-lg bg-[rgba(126,162,255,.15)] px-3.5 t-sub font-bold text-ai-accent disabled:opacity-50"
        >
          {busy ? "보내는 중" : "시험 메일 보내기"}
        </button>
      </span>
    </div>
  );
}
