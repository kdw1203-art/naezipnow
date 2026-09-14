"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * [1000] 결제 내역 — 행을 펼치면 주문번호·결제수단·이용기간·영수증·환불 링크.
 *
 * 서버(page.tsx)가 라벨까지 다 만들어 넘긴다(plan/billing/status 한글·기간 라벨·문의 링크).
 * 이 컴포넌트는 lib/subscriptions/billing-history 를 import 하지 않는다 — 그 모듈은
 * 서비스 클라이언트를 끌고 오므로 클라이언트 번들에 들어가면 안 된다.
 * "더 보기" 는 클라이언트에서 20건씩 — 서버는 이미 100건까지 내려 준다.
 */

export type HistoryRow = {
  id: string;
  orderId: string | null;
  planLabel: string;
  billingLabel: string;
  /** "30일" · "365일(1년)" · null(주기 불명) */
  durationLabel: string | null;
  amount: number | null;
  status: string | null;
  statusLabel: string;
  method: string | null;
  receiptUrl: string | null;
  /** 결제 시각(없으면 요청 시각) — KST 문자열 */
  atLabel: string;
  cancelledAtLabel: string | null;
  /** /support?category=payment&order=… */
  supportHref: string;
};

const PAGE = 20;

const STATUS_TONE: Record<string, string> = {
  paid: "bg-primary-soft text-primary",
  done: "bg-primary-soft text-primary",
  requested: "bg-bg text-text-2",
  failed: "bg-danger-soft text-danger",
  cancelled: "bg-bg text-text-3",
  canceled: "bg-bg text-text-3",
  refunded: "bg-warning-soft text-warning",
};

function StatusChip({ status, label }: { status: string | null; label: string }) {
  const tone = (status && STATUS_TONE[status]) || "bg-bg text-text-2";
  return (
    <span className={`inline-block shrink-0 rounded-md px-1.5 py-px t-caption font-bold ${tone}`}>
      {label}
    </span>
  );
}

export function PaymentHistoryList({ ok, rows }: { ok: boolean; rows: HistoryRow[] }) {
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!ok) {
    /* 조회 실패를 "내역 없음"으로 보여 주면, 결제한 사람이 자기 기록이 사라졌다고 오해한다. */
    return (
      <div className="rounded-xl bg-warning-soft px-4 py-4 t-sub text-text-2">
        결제 내역을 지금 불러오지 못했어요. 잠시 후 새로고침해 주세요 — 결제 기록이 사라진 것은
        아닙니다.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-bg px-4 py-6 text-center t-sub text-text-3">
        아직 결제 내역이 없어요.
        <br />
        결제가 완료되면 금액·이용 기간·영수증 링크가 여기에 쌓입니다.
      </div>
    );
  }

  const visible = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((p) => {
          const expanded = openId === p.id;
          const panelId = `pay-${p.id}`;
          return (
            <li key={p.id} className="rounded-xl border border-line bg-surface">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpenId(expanded ? null : p.id)}
                className="flex w-full min-h-10 items-center justify-between gap-3 px-3.5 py-3 text-left"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate t-body font-bold text-ink">
                    {p.planLabel} · {p.billingLabel}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 t-sub text-text-3">
                    <span>{p.atLabel}</span>
                    <StatusChip status={p.status} label={p.statusLabel} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="t-body font-extrabold text-ink t-num">
                    {p.amount !== null ? `${p.amount.toLocaleString("ko-KR")}원` : "—"}
                  </span>
                  <span className="t-caption font-bold text-text-3">{expanded ? "접기" : "자세히"}</span>
                </span>
              </button>
              {expanded && (
                <div id={panelId} className="border-t border-divider px-3.5 py-3">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 t-sub">
                    <dt className="text-text-3">주문번호</dt>
                    <dd className="break-all font-mono text-text-1">{p.orderId ?? "—"}</dd>
                    <dt className="text-text-3">결제수단</dt>
                    <dd className="text-text-1">{p.method ?? "—"}</dd>
                    <dt className="text-text-3">이용 기간</dt>
                    <dd className="text-text-1">{p.durationLabel ?? "—"}</dd>
                    {p.cancelledAtLabel && (
                      <>
                        <dt className="text-text-3">취소·환불</dt>
                        <dd className="text-text-1">{p.cancelledAtLabel}</dd>
                      </>
                    )}
                  </dl>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 t-sub">
                    {p.receiptUrl ? (
                      <a
                        href={p.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block py-[5px] font-bold text-primary underline underline-offset-2"
                      >
                        영수증 보기
                      </a>
                    ) : p.status === "paid" ? (
                      /* [966] 매출전표는 승인 응답에 있을 때만 저장된다 — 없으면 고객센터가 발급 */
                      <Link
                        href={p.supportHref}
                        className="inline-block py-[5px] font-bold text-text-2 underline underline-offset-2"
                      >
                        영수증 요청
                      </Link>
                    ) : null}
                    {p.status === "paid" && (
                      <Link
                        href={p.supportHref}
                        className="inline-block py-[5px] font-bold text-text-2 underline underline-offset-2"
                      >
                        환불·문의
                      </Link>
                    )}
                    {p.status !== "paid" && (
                      <Link
                        href={p.supportHref}
                        className="inline-block py-[5px] font-bold text-text-2 underline underline-offset-2"
                      >
                        이 결제 문의
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="btn-soft btn-md w-full"
        >
          더 보기 ({Math.min(PAGE, rows.length - shown)}건 더)
        </button>
      )}
      {rows.length >= 100 && shown >= rows.length && (
        <p className="text-center t-caption text-text-3">
          최근 100건까지 보여 드려요. 그 이전 내역은 고객센터에 문의해 주세요.
        </p>
      )}
    </div>
  );
}
