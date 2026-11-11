"use client";

import { useEffect, useState, type FormEvent } from "react";
import { safeInternalPath } from "@/lib/safe-path";

/* [1147] 등록: "등록 시작" → QR 을 인증 앱으로 찍거나 열쇠를 직접 입력 → 앱의 6자리 번호로 확인.
   확인: 6자리 번호 → 12시간 동안 이 브라우저에서 관리자 화면 사용. */
type Status = { enrolled: boolean; pending: boolean; verified: boolean };

export function Admin2faClient() {
  const [st, setSt] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/admin");

  useEffect(() => {
    const n = safeInternalPath(new URLSearchParams(window.location.search).get("next"), "/admin");
    setNext(n.startsWith("/admin-2fa") ? "/admin" : n);
    fetch("/api/admin/2fa", { cache: "no-store" })
      .then(async (r) => (r.ok ? setSt((await r.json()) as Status) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/admin/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: r.ok, d };
  };

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { ok, d } = await post({ action: "setup" }).catch(() => ({ ok: false, d: null }));
    setBusy(false);
    if (!ok || !d) return setErr(String(d?.error ?? "등록 시작 실패 · 잠시 후 다시"));
    setSetup({ secret: String(d.secret), qrSvg: String(d.qrSvg) });
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { ok, d } = await post({ action: "verify", code }).catch(() => ({ ok: false, d: null }));
    setBusy(false);
    if (!ok) {
      setCode("");
      return setErr(String(d?.error ?? "확인 실패 · 잠시 후 다시"));
    }
    window.location.replace(next);
  };

  if (failed) return <p className="m-0 t-body text-text-3">2단계 인증 상태 불러오기 실패 · 잠시 후 다시</p>;
  if (!st) return <div className="skeleton h-[160px] rounded-2xl" aria-hidden="true" />;

  const needSetup = !st.enrolled && !setup;
  return (
    <div className="card flex flex-col gap-3 rounded-2xl p-[var(--pad-card)]">
      {needSetup ? (
        <>
          <p className="m-0 t-body text-text-2">인증 앱(Google Authenticator · Microsoft Authenticator 등)의 6자리 번호를 로그인 뒤 한 번 더 확인합니다.</p>
          <button type="button" onClick={() => void begin()} disabled={busy} className="btn-outline btn-lg w-full disabled:opacity-60">
            {busy ? "준비 중" : "등록 시작"}
          </button>
        </>
      ) : (
        <>
          {setup && (
            <>
              <p className="m-0 t-sub text-text-2">1. 인증 앱에서 아래 QR 을 찍거나 열쇠를 직접 입력</p>
              {/* 서버가 만든 QR(SVG 문자열 · 사용자 입력 없음) */}
              <div className="mx-auto h-44 w-44 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
              <p className="m-0 break-all rounded-lg bg-primary-soft px-3 py-2 text-center t-sub font-bold text-primary">{setup.secret}</p>
              <p className="m-0 t-sub text-text-2">2. 앱에 뜬 6자리 번호 입력</p>
            </>
          )}
          <form onSubmit={verify} className="flex flex-col gap-2">
            <div className="njn-field">
              <input
                id="admin-2fa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                placeholder=" "
                autoFocus
              />
              <label htmlFor="admin-2fa-code">인증 번호 6자리</label>
            </div>
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary btn-lg w-full disabled:opacity-60">
              {busy ? "확인 중" : "확인"}
            </button>
          </form>
          <p className="m-0 t-caption text-text-3">확인 뒤 12시간 유지 · 이 브라우저만</p>
        </>
      )}
      {err && (
        <p role="alert" className="m-0 t-sub font-bold text-danger">
          {err}
        </p>
      )}
    </div>
  );
}
