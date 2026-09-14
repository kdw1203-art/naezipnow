"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CharCount } from "@/app/components/ui/CharCount";
import {
  firstTicketError,
  isTicketCategory,
  TICKET_CATEGORIES,
  TICKET_MESSAGE_MAX,
  TICKET_SUBJECT_MAX,
  validateTicketInput,
  type TicketCategory,
} from "@/lib/support/ticket-labels";
import { RESPONSE_TIME } from "@/lib/support/constants";
import { getSessionLite } from "@/lib/client/session-lite";

/* P2-2: 1:1 문의 폼 — POST /api/support 실연동.
   계약(app/api/support/route.ts): { category, subject(2~200자), message(10~3000자), email }
   → 200 { ok: true, ticketId, ticketNo } / 400 { error }. 로그인 세션 이메일이 있으면 서버가 우선 사용.
   [1000] 카테고리·검증은 lib/support/ticket-labels 한 곳(폼과 API 가 같은 규칙). 접수 뒤 접수번호와
   내 문의 내역 링크(로그인 시)를 보여 준다. 메일 주소는 서버(business-info)가 props 로 넘긴다.
   로그인 여부는 /support 가 prerender 화면이라(PUBLIC_CACHE_RULES) 서버가 못 넘긴다 — 헤더가 이미
   부르는 getSessionLite(페이지당 1회 수렴)로 마운트 뒤 붙인다. 판정 전에는 비로그인 폼을 그린다. */

export function SupportContactForm({ supportEmail }: { supportEmail: string }) {
  const [category, setCategory] = useState<TicketCategory>("일반 문의");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  /** 로그인 이메일 — 있으면 이메일 칸을 채우고 잠근다(서버가 어차피 세션 값을 우선한다) */
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const loggedIn = Boolean(sessionEmail);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ticketNo: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSessionLite().then((s) => {
      const e = s?.user?.email?.trim().toLowerCase() || null;
      if (!alive || !e) return;
      setSessionEmail(e);
      /* 서버가 세션 이메일을 우선하므로 칸도 그 값으로 맞춘다(다른 주소로 접수되는 것처럼 보이지 않게) */
      setEmail(e);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* [966] 결제 표면의 딥링크(/support?category=payment&order=…&amount=&plan=)를 읽어
     카테고리·제목·본문을 미리 채운다. 예전엔 "결제·환불" 로 보내 놓고 여기서 다시
     "일반 문의" 로 시작해 사용자가 카테고리를 또 골라야 했다. 주소창 값은 표시용
     텍스트로만 들어간다(서버가 다시 검증).
     [1000] 한글 카테고리 그대로(`?category=결제·환불`)도 받는다 — 내 문의 내역의 "추가 문의" 링크. */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const cat = sp.get("category");
      const map: Record<string, TicketCategory> = {
        payment: "결제·환불",
        refund: "결제·환불",
        bug: "버그 신고",
        privacy: "개인정보",
        report: "악성 콘텐츠 신고",
      };
      const picked = cat ? (isTicketCategory(cat) ? cat : map[cat]) : undefined;
      if (picked) setCategory(picked);
      const order = (sp.get("order") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
      const amount = Number(sp.get("amount"));
      const plan = (sp.get("plan") ?? "").replace(/[^a-z]/g, "").slice(0, 20);
      if (picked === "결제·환불" && order) {
        setSubject((v) => v || `환불·문의 — 주문번호 ${order}`);
        setMessage((v) =>
          v ||
          [
            `주문번호: ${order}`,
            ...(Number.isFinite(amount) && amount > 0 ? [`결제 금액: ${amount.toLocaleString("ko-KR")}원`] : []),
            ...(plan ? [`플랜: ${plan}`] : []),
            "",
            "요청 내용: (예: 결제 후 7일 이내 청약철회 / 중도 해지 일할 환불 / 영수증 발급)",
          ].join("\n"),
        );
      }
    } catch {
      /* 주소 파싱 실패는 무시 — 빈 폼으로 시작 */
    }
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const checked = validateTicketInput({ category, subject, message, email });
    if (!checked.ok) {
      setError(firstTicketError(checked.errors));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.value),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ticketNo?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone({ ticketNo: data.ticketNo ?? null });
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success"
        >
          ✓
        </span>
        <div className="t-section text-ink">문의가 접수되었습니다</div>
        {done.ticketNo ? (
          <div className="lg-pill tabular-nums">접수번호 {done.ticketNo}</div>
        ) : (
          <div className="t-sub text-text-3">접수번호는 이메일 답변에서 확인할 수 있어요</div>
        )}
        <div className="t-sub leading-[1.6] text-text-2">
          {RESPONSE_TIME} — 입력하신 이메일로 답변 드립니다.
          {loggedIn && " 알림함에도 접수 확인이 남았어요."}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {loggedIn && (
            <Link href="/my/support" className="btn-primary btn-md no-underline">
              내 문의 내역 보기
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setSubject("");
              setMessage("");
            }}
            className="btn-ghost btn-md"
          >
            새 문의 작성
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5" noValidate>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="문의 유형">
        {TICKET_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={`min-h-10 rounded-full px-3.5 t-sub ${
              category === c
                ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                : "border border-line bg-surface text-text-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {/* [968 · 29] 제목은 "다음"(Enter 로 내용 칸 이동 — 힌트만 붙이면 Enter 가 빈 내용으로
          제출된다), 내용 textarea 는 Enter 가 줄바꿈이라 힌트 없음, 이메일은 "완료". */}
      <input
        id="support-subject"
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={`제목 (2~${TICKET_SUBJECT_MAX}자)`}
        maxLength={TICKET_SUBJECT_MAX}
        aria-label="문의 제목"
        enterKeyHint="next"
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          document.getElementById("support-message")?.focus();
        }}
        className="rounded-[10px] border border-line bg-surface px-3.5 py-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      <textarea
        id="support-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`문의 내용을 자세히 적어 주세요 (10~${TICKET_MESSAGE_MAX.toLocaleString("ko-KR")}자)`}
        maxLength={TICKET_MESSAGE_MAX}
        rows={5}
        aria-label="문의 내용"
        className="resize-y rounded-[10px] border border-line bg-surface px-3.5 py-3 t-body leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      {/* [966] 글자 수 — maxLength 와 같은 상한 */}
      <div className="-mt-1.5 flex justify-end">
        <CharCount value={message} max={TICKET_MESSAGE_MAX} />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="답변 받을 이메일"
        aria-label="답변 받을 이메일"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="done"
        readOnly={Boolean(sessionEmail)}
        className={`rounded-[10px] border border-line px-3.5 py-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary ${
          sessionEmail ? "bg-bg text-text-2" : "bg-surface"
        }`}
      />
      {sessionEmail && (
        <p className="-mt-1 t-caption text-text-3">로그인 계정의 이메일로 답변을 드려요.</p>
      )}
      {error && (
        <p role="alert" className="t-sub font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
        <button
          type="submit"
          disabled={busy}
          className={`btn-primary btn-md w-full md:w-auto md:px-6 ${busy ? "is-busy" : ""}`}
        >
          {busy ? "접수 중…" : "문의 접수하기"}
        </button>
        <a
          href={`mailto:${supportEmail}`}
          /* [989] 실측 16px — 제출 버튼 바로 아래 단독으로 서는 링크라 24px 로 키운다 */
          className="inline-block py-[5px] t-sub font-semibold text-text-3 underline underline-offset-2"
        >
          또는 메일로 문의: {supportEmail}
        </a>
      </div>
    </form>
  );
}
