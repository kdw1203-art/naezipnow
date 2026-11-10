"use client";

import { useEffect, useState } from "react";
import { ADDRESS_MAX } from "@/lib/account/basic-info";

/* [1135 · 기본 정보] 마이 › 설정 — 연락처 · 생년월일 6자리 · 주소를 보고 고친다(전부 선택 · 비우고 저장하면 지움).
   가입 때 적은 값이 여기에 나온다. 조회 실패는 실패로(빈 칸으로 위장하지 않는다 — 저장을 막는다). */
type State = "loading" | "ready" | "failed";

export function BasicInfoCard() {
  const [state, setState] = useState<State>("loading");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/basic-info", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setState("failed");
        const d = (await r.json()) as { phone: string | null; birth: string | null; address: string | null };
        setPhone(d.phone ?? "");
        setBirth(d.birth ?? "");
        setAddress(d.address ?? "");
        setState("ready");
      })
      .catch(() => alive && setState("failed"));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/me/basic-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, birth, address }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string; phone?: string | null; birth?: string | null; address?: string | null } | null;
      if (!r.ok) {
        setMsg({ ok: false, text: d?.error ?? "기본 정보 저장 실패 · 잠시 후 다시" });
      } else {
        setPhone(d?.phone ?? "");
        setBirth(d?.birth ?? "");
        setAddress(d?.address ?? "");
        setMsg({ ok: true, text: "저장됨" });
      }
    } catch {
      setMsg({ ok: false, text: "기본 정보 저장 실패 · 잠시 후 다시" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="basic-info-h" className="card mb-4 rounded-2xl p-[var(--pad-card)]">
      <h2 id="basic-info-h" className="m-0 t-section text-ink">
        기본 정보 <span className="t-sub font-medium text-text-3">선택 · 비우고 저장하면 삭제</span>
      </h2>
      {state === "loading" ? (
        <div className="skeleton mt-3 h-[132px] rounded-lg" aria-hidden="true" />
      ) : state === "failed" ? (
        <p className="m-0 mt-2 t-sub text-text-3">기본 정보 불러오기 실패 · 잠시 후 다시</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="njn-field">
            <input id="basic-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder=" " maxLength={13} />
            <label htmlFor="basic-phone">휴대전화</label>
          </div>
          <div className="njn-field">
            <input id="basic-birth" type="text" inputMode="numeric" autoComplete="bday" value={birth} onChange={(e) => setBirth(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder=" " maxLength={6} />
            <label htmlFor="basic-birth">생년월일 6자리</label>
          </div>
          <div className="njn-field">
            <input id="basic-address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder=" " maxLength={ADDRESS_MAX} />
            <label htmlFor="basic-address">주소</label>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-outline btn-md disabled:opacity-60">
              {busy ? "저장 중" : "기본 정보 저장"}
            </button>
            {msg && (
              <span role="status" className={`t-sub font-bold ${msg.ok ? "text-primary" : "text-danger"}`}>
                {msg.text}
              </span>
            )}
          </div>
          <p className="m-0 t-caption text-text-3">주민등록번호 뒷자리는 받지 않음 · 본인만 볼 수 있음</p>
        </div>
      )}
    </section>
  );
}

export default BasicInfoCard;
