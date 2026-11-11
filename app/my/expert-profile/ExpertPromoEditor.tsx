"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { PROMO_BODY_MAX, PROMO_FREE_DAYS, PROMO_HEADLINE_MAX, type PromoState } from "@/lib/experts/promo";

/* [1144 · 전문가 홍보] 내 홍보 글 — 한 줄(목록 · 배너에 크게) + 설명(지역 · 단지 화면) + 켬/끔.
   상태 줄: 무료 N일 남음 / 프로 구독 중 / 무료 기간 끝(프로필은 그대로 · 홍보만 멈춤 → 프로 구독). */
type View = { verified: boolean; ready: boolean; headline: string; body: string; on: boolean; state: PromoState };

function statusText(s: PromoState): string {
  if (s.mode === "subscribed") return "프로 구독 중 · 홍보 노출 중";
  if (s.mode === "free") return `무료 홍보 ${s.freeDaysLeft}일 남음 · ${s.freeUntil}까지`;
  return "무료 기간 종료 · 홍보 멈춤 · 프로필은 그대로 공개";
}

export function ExpertPromoEditor() {
  const [v, setV] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fill = (d: View) => {
    setV(d);
    setHeadline(d.headline);
    setBody(d.body);
    setOn(d.on);
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/me/expert-promo", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setFailed(true);
        fill((await r.json()) as View);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/me/expert-promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headline, body, on }) });
      const d = (await r.json().catch(() => null)) as (View & { error?: string }) | null;
      if (!r.ok || !d) setMsg({ ok: false, text: d?.error ?? "홍보 설정 저장 실패 · 잠시 후 다시" });
      else {
        fill(d);
        setMsg({ ok: true, text: "저장됨" });
      }
    } catch {
      setMsg({ ok: false, text: "홍보 설정 저장 실패 · 잠시 후 다시" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="expert-promo-h" className="card mt-4 rounded-2xl p-[var(--pad-card)]">
      <h2 id="expert-promo-h" className="m-0 t-section text-ink">
        홍보 <span className="t-sub font-medium text-text-3">등록 후 {PROMO_FREE_DAYS}일 무료 · 이후 프로 구독</span>
      </h2>
      {failed ? (
        <p className="m-0 mt-2 t-sub text-text-3">홍보 설정 불러오기 실패 · 잠시 후 다시</p>
      ) : !v ? (
        <div className="skeleton mt-3 h-[180px] rounded-lg" aria-hidden="true" />
      ) : !v.verified ? (
        <p className="m-0 mt-2 t-sub text-text-3">승인 후 홍보 글 작성 가능</p>
      ) : !v.ready ? (
        <p className="m-0 mt-2 t-sub text-text-3">홍보 기능 준비 중</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          <p className={`m-0 rounded-lg px-3 py-2 t-sub font-bold ${v.state.active ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}`}>{statusText(v.state)}</p>
          {v.state.mode !== "subscribed" && (
            <Link href="/subscription" className="tap-line self-start t-sub font-bold text-primary">
              {v.state.mode === "ended" ? "프로 구독으로 홍보 다시 켜기 ›" : "무료 기간 뒤에도 이어가기 · 프로 요금제 보기 ›"}
            </Link>
          )}
          <div className="njn-field">
            <input id="promo-headline" type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={PROMO_HEADLINE_MAX} placeholder=" " />
            <label htmlFor="promo-headline">홍보 한 줄 · {PROMO_HEADLINE_MAX}자</label>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="promo-body" className="px-1 t-caption font-bold text-text-2">
              설명 · {PROMO_BODY_MAX}자
            </label>
            <textarea
              id="promo-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={PROMO_BODY_MAX}
              rows={2}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 t-body text-text-1"
            />
          </div>
          <label className="flex min-h-10 items-center gap-2 t-sub text-text-1">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5" />
            홍보 노출 켜기
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-outline btn-md disabled:opacity-60">
              {busy ? "저장 중" : "홍보 저장"}
            </button>
            {msg && (
              <span role="status" className={`t-sub font-bold ${msg.ok ? "text-primary" : "text-danger"}`}>
                {msg.text}
              </span>
            )}
          </div>
          <p className="m-0 t-caption text-text-3">노출 자리: 활동 지역의 지역 · 단지 화면 · 전문가 찾기 상단 · 홈 · 임장노트 · 동네 글 목록 · 모두 "홍보" 표시</p>
          <p className="m-0 t-caption text-text-3">수익 보장 · 최고 · 유일 같은 단정 표현 · 링크 불가 · 상호 · 등록번호 함께 표시</p>
        </div>
      )}
    </section>
  );
}
