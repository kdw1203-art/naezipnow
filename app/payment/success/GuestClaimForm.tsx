"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { readGuestEmailInput } from "@/lib/payments/guest-order";

/**
 * [1003] 이메일 없이 결제한 비회원이 이 화면에서 이메일을 적어 이용권을 받는다.
 *
 * 결제 전에 이메일을 요구하지 않는 대신(토스 심사자는 그 칸 앞에서 멈췄다), 결제가 끝난
 * 바로 이 자리에서 받는다. 붙이는 열쇠는 주소창에 돌아온 paymentKey 다 — 결제창을 통과한
 * 사람만 가진 값이라, 주문번호만 아는 사람은 남의 결제에 자기 이메일을 붙일 수 없다.
 *
 * 보내고 나면 둘 중 하나다:
 *  · applied  — 그 이메일 계정이 이미 있어 이용권이 방금 켜졌다(로그인하면 보인다)
 *  · 대기      — 계정이 없다. 같은 이메일로 가입하는 순간 켜진다(가입 링크를 준다)
 */
export function GuestClaimForm({
  orderId,
  paymentKey,
  signupHref,
}: {
  orderId: string;
  paymentKey: string;
  /** 가입 뒤 이 화면으로 돌아오는 주소 — 서버가 만들어 준다 */
  signupHref: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ applied: boolean; email: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    /* 서버(create·guest-claim)와 같은 규칙을 본다 — 둘이 갈리면 화면은 보내고 서버가 되돌린다 */
    const read = readGuestEmailInput(email);
    if (read.error || !read.email) {
      setError("이메일 주소를 정확히 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payments/guest-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, paymentKey, email: read.email }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        applied?: boolean;
        email?: string;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "지금 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone({ applied: Boolean(j.applied), email: j.email ?? read.email });
    } catch {
      setError("네트워크 오류로 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] leading-[1.6] text-text-2">
          {done.applied ? (
            <>
              <strong className="text-ink">{done.email}</strong> 계정에 7일 이용권을 켰어요. 로그인하면
              바로 쓸 수 있어요.
            </>
          ) : (
            <>
              <strong className="text-ink">{done.email}</strong> 로 이용권을 예약해 뒀어요. 같은 이메일로
              가입하면 그 순간 켜집니다.
            </>
          )}
        </p>
        <Link
          href={done.applied ? "/login" : signupHref}
          className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold"
        >
          {done.applied ? "로그인하고 이용권 쓰기" : "가입하고 이용권 받기"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor="guest-claim-email" className="text-[13px] font-bold text-ink">
        이용권을 받을 이메일
      </label>
      <p className="text-[12px] leading-[1.6] text-text-3">
        결제는 끝났어요. 이메일을 알려 주시면 이 결제에 7일 이용권을 연결해 드려요 — 영수증도 같은
        주소로 보내드립니다.
      </p>
      <input
        id="guest-claim-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@example.com"
        className="min-h-11 rounded-[12px] border border-line bg-surface px-3 text-[15px] text-ink"
      />
      {error && (
        <p role="alert" className="text-[12px] font-bold text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold disabled:opacity-60"
      >
        {busy ? "연결 중…" : "이 이메일로 이용권 받기"}
      </button>
      {/* 이 화면을 닫아 버렸다면 여기로 — 주문번호가 문의에 함께 담긴다 */}
      <Link
        href={`/support?category=payment&order=${encodeURIComponent(orderId)}`}
        className="inline-block py-[5px] text-center text-[12px] font-bold text-text-3"
      >
        연결이 안 되면 고객센터에 문의하기
      </Link>
    </form>
  );
}
