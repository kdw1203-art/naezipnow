"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { planLabel } from "@/lib/subscriptions/labels";
import {
  CANCEL_NOTE_MAX,
  CANCEL_REASON_CODES,
  CANCEL_REASONS,
  type CancelReason,
} from "@/lib/payments/cancel-reasons";
import { formatKstLongDate } from "@/lib/format/kst";

/**
 * [1000] 자동결제 관리 — 카드 변경 · 해지(사유 모달) · 다시 시작.
 *
 * 서버(page.tsx)가 넘겨주는 값은 공개 필드뿐이다 — billingKey·customerKey 는 서버 저장소
 * 밖으로 나오지 않는다. 해지는 즉시 반영되고, 이미 결제한 기간은 만료일까지 유지된다는
 * 사실을 모달 안에 그대로 적는다. 사유는 **선택** — 고르지 않아도 해지된다.
 */

export type ManageAutopay = {
  plan: string;
  billing: string;
  amount: number;
  status: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  nextChargeAt: string | null;
  lastError: string | null;
};

type Props = {
  autopay: ManageAutopay | null;
  /** 토스 빌링 개방 여부(전자계약 승인 후 소유자가 켬) */
  billingOpen: boolean;
  /** app_users.plan_expires_at — 해지 확인 문구의 "언제까지" */
  planExpiresAt: string | null;
  currentPlan: string;
  /** 살아 있는 구독이 없을 때, 가장 최근 구독의 상태·해지 시각(없으면 null) */
  lastSubscription: { status: string; canceledAt: string | null; plan: string; billing: string } | null;
};

function cardLabel(a: ManageAutopay): string | null {
  const s = `${a.cardCompany ?? ""} ${a.cardNumberMasked ?? ""}`.trim();
  return s || null;
}

export function SubscriptionManageClient(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const a = props.autopay;
  const suspended = a?.status === "suspended";

  async function confirmCancel() {
    if (state === "working") return;
    setState("working");
    setMessage(null);
    try {
      const res = await fetch("/api/payments/toss/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason ?? undefined, note: note.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && j.ok) {
        setState("done");
        setMessage(j.message ?? "자동결제를 해지했어요.");
        setOpen(false);
        /* 서버 섹션(히어로·이력)이 새 상태를 읽게 */
        router.refresh();
      } else {
        setState("error");
        setMessage(j.error ?? "해지 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setState("error");
      setMessage("네트워크 오류로 해지하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  /* ── 해지 완료 ── */
  if (state === "done") {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-primary-soft px-4 py-3">
        <p className="t-body font-bold text-ink">{message}</p>
        <p className="t-sub text-text-2">
          마음이 바뀌면 언제든 다시 시작할 수 있어요. 환불(결제 후 7일 이내 청약철회)은{" "}
          <Link href="/support?category=payment" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
            고객센터
          </Link>
          로 접수해 주세요.
        </p>
      </div>
    );
  }

  /* ── 살아 있는 구독 없음 — 다시 시작 ── */
  if (!a) {
    const last = props.lastSubscription;
    return (
      <div className="flex flex-col gap-3">
        <p className="t-sub text-text-2">
          {last && (last.status === "canceled" || last.status === "deleted")
            ? `${planLabel(last.plan)} ${last.billing === "annual" ? "연간" : "월간"} 자동결제를 ${
                last.canceledAt ? `${formatKstLongDate(last.canceledAt)}에 ` : ""
              }${last.status === "deleted" ? "카드 등록 해제로 멈췄어요" : "해지했어요"}.${
                props.planExpiresAt && props.currentPlan !== "free"
                  ? ` 이미 결제한 기간은 ${formatKstLongDate(props.planExpiresAt)}까지 그대로 이용돼요.`
                  : ""
              }`
            : props.currentPlan !== "free"
              ? "지금 이용권은 단건 결제라 자동 반복청구가 없어요. 만료 뒤 추가 청구 없이 무료 플랜으로 돌아가요."
              : "등록된 자동결제가 없어요."}
        </p>
        {billingOpenCta(props.billingOpen)}
      </div>
    );
  }

  /* ── 살아 있는 구독 — 카드 변경 · 해지 ── */
  const card = cardLabel(a);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 t-sub">
        <dt className="text-text-3">상품</dt>
        <dd className="font-bold text-ink">
          {planLabel(a.plan)} · {a.billing === "annual" ? "연간" : "월간"} 자동결제
        </dd>
        <dt className="text-text-3">금액</dt>
        <dd className="font-bold text-ink t-num">
          {a.amount.toLocaleString("ko-KR")}원 / {a.billing === "annual" ? "년" : "월"}
        </dd>
        <dt className="text-text-3">결제 카드</dt>
        <dd className="text-text-1">{card ?? "—"}</dd>
        <dt className="text-text-3">{suspended ? "상태" : "다음 결제일"}</dt>
        <dd className={suspended ? "font-bold text-warning" : "text-text-1"}>
          {suspended
            ? "결제 실패로 일시중단 — 카드를 다시 등록하면 바로 재개돼요"
            : a.nextChargeAt
              ? formatKstLongDate(a.nextChargeAt)
              : "—"}
        </dd>
        {suspended && a.lastError && (
          <>
            <dt className="text-text-3">마지막 오류</dt>
            <dd className="break-all font-mono t-caption text-text-2">{a.lastError.slice(0, 120)}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/subscription/billing?tier=${a.plan}&billing=${a.billing}&mode=card`}
          className={`${suspended ? "btn-primary" : "btn-soft"} btn-md no-underline`}
        >
          {suspended ? "카드 다시 등록" : "카드 변경"}
        </Link>
        <button
          type="button"
          onClick={() => {
            setState("idle");
            setMessage(null);
            setOpen(true);
          }}
          className="btn-outline btn-md"
        >
          자동결제 해지
        </button>
      </div>
      {state === "error" && message && (
        <p role="alert" className="t-sub font-bold text-danger">
          {message}
        </p>
      )}

      <Modal
        open={open}
        onClose={() => {
          if (state !== "working") setOpen(false);
        }}
        label="자동결제 해지"
        dismissOnBackdrop={state !== "working"}
        maxWidth={480}
      >
        <ModalHeader title="자동결제 해지" onClose={() => state !== "working" && setOpen(false)} />
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-bg px-3.5 py-3">
            <p className="t-sub font-bold text-ink">해지하면 이렇게 돼요</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 t-sub text-text-2">
              <li>
                {a.nextChargeAt && !suspended
                  ? `다음 결제일(${formatKstLongDate(a.nextChargeAt)})부터 청구되지 않아요.`
                  : "더 이상 청구되지 않아요."}
              </li>
              <li>
                {props.planExpiresAt && props.currentPlan !== "free"
                  ? `이미 결제한 기간은 ${formatKstLongDate(props.planExpiresAt)}까지 그대로 이용되고, 그 뒤 무료 플랜으로 전환돼요.`
                  : "이미 결제한 기간은 만료일까지 그대로 이용되고, 그 뒤 무료 플랜으로 전환돼요."}
              </li>
              <li>등록된 카드 정보는 토스페이먼츠에서 삭제돼요.</li>
              <li>언제든 다시 카드를 등록해 시작할 수 있어요.</li>
              <li>
                결제 후 7일 이내 환불(청약철회)은 해지와 별개로{" "}
                <Link href="/support?category=payment" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                  고객센터
                </Link>
                에 접수해 주세요.
              </li>
            </ul>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 t-sub font-bold text-ink">
              해지 이유를 알려 주실 수 있나요? <span className="font-normal text-text-3">(선택)</span>
            </legend>
            {CANCEL_REASON_CODES.map((code) => (
              <label
                key={code}
                className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border px-3 t-body ${
                  reason === code ? "border-primary bg-primary-soft text-ink" : "border-line text-text-1"
                }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  value={code}
                  checked={reason === code}
                  onChange={() => setReason(code)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span>{CANCEL_REASONS[code]}</span>
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="t-sub font-bold text-ink">
              더 하고 싶은 말 <span className="font-normal text-text-3">(선택 · {CANCEL_NOTE_MAX}자)</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, CANCEL_NOTE_MAX))}
              rows={3}
              maxLength={CANCEL_NOTE_MAX}
              placeholder="불편했던 점이나 바라는 기능이 있으면 적어 주세요. 다음 판에 반영해요."
              className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 t-body text-ink outline-none focus:border-primary"
            />
          </label>

          {state === "error" && message && (
            <p role="alert" className="t-sub font-bold text-danger">
              {message}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => void confirmCancel()}
              disabled={state === "working"}
              className="btn-outline btn-md flex-1 text-danger disabled:opacity-60"
            >
              {state === "working" ? "해지 처리 중…" : "해지 확정"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={state === "working"}
              className="btn-primary btn-md flex-1 disabled:opacity-60"
            >
              계속 이용하기
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function billingOpenCta(billingOpen: boolean) {
  if (!billingOpen) {
    return (
      <p className="t-sub text-text-3">
        자동결제는 아직 준비 중이에요 — 지금은{" "}
        <Link href="/subscription" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
          단건 결제
        </Link>
        로 이용할 수 있어요.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/subscription/billing?tier=pro&billing=monthly" className="btn-primary btn-md no-underline">
        자동결제 다시 시작
      </Link>
      <Link href="/subscription" className="btn-soft btn-md no-underline">
        플랜 비교
      </Link>
    </div>
  );
}
