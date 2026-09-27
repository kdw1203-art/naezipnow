"use client";
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 4곳을 font-bold(700)로 바꿨다. */

/**
 * 포인트 상점 — 교환 인터랙션.
 * SPEND_ITEMS 그리드 + 잔액 표시 · 각 항목 "교환" → POST /api/points/spend { itemKey }.
 * 성공 시 잔액 갱신 + 안내 · 잔액 부족 시 버튼 비활성.
 */
import { useState } from "react";
import Link from "next/link";
import { SPEND_ITEMS, type SpendItem } from "@/lib/points/catalog";

type ItemState = {
  status: "idle" | "busy" | "done" | "error";
  message: string;
};

type SpendResponse = {
  ok?: boolean;
  balance?: number;
  note?: string;
  error?: string;
};

export function ShopClient({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [states, setStates] = useState<Record<string, ItemState>>({});

  const setItem = (key: string, s: ItemState) =>
    setStates((prev) => ({ ...prev, [key]: s }));

  const redeem = async (item: SpendItem) => {
    if ((states[item.key]?.status ?? "idle") === "busy") return;
    setItem(item.key, { status: "busy", message: "" });
    try {
      const res = await fetch("/api/points/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key }),
      });
      const data = (await res.json().catch(() => ({}))) as SpendResponse;
      if (typeof data.balance === "number") setBalance(data.balance);
      if (res.ok && data.ok) {
        setItem(item.key, {
          status: "done",
          message: data.note ?? "교환이 완료됐어요.",
        });
      } else {
        setItem(item.key, {
          status: "error",
          message: data.error ?? "교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    } catch {
      setItem(item.key, {
        status: "error",
        message: "네트워크 오류예요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  /* [v4 · 한 화면 한 가지] 제목 + 주인공(보유 포인트 숫자 하나) → 상품 1px 선 행(왼쪽 이름·설명 / 오른쪽 포인트 + 교환).
     지운 것: 잔액 카드 · 높이가 다른 상품 카드 격자(엇갈림) · 행마다 채움 파랑(→ 테두리 버튼) · 계절 알약(→ 글자). */
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <header className="rise-in flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="t-title text-ink">포인트 상점</h1>
          <p className="t-sub text-text-3">보유 포인트</p>
          <p className="t-display t-num text-ink">
            {balance.toLocaleString("ko-KR")}
            <span className="ml-0.5 t-section text-primary">P</span>
          </p>
        </div>
        <Link href="/my/points" className="inline-flex min-h-10 shrink-0 items-center t-sub font-bold text-primary no-underline">
          내역 보기 ›
        </Link>
      </header>

      <ul data-tone="mint" className="rise-in-1 divide-y divide-line">
        {SPEND_ITEMS.map((item) => {
          const st = states[item.key] ?? { status: "idle", message: "" };
          const insufficient = balance < item.cost;
          const busy = st.status === "busy";
          const disabled = busy || (insufficient && st.status !== "done");
          return (
            <li key={item.key} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">
                  {item.label}
                  {item.season && <span className="ml-1.5 t-caption font-bold text-warning">{item.season} 한정</span>}
                </span>
                <span className="mt-0.5 block truncate t-sub text-text-3">{item.desc}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="t-body t-num text-ink">{item.cost.toLocaleString("ko-KR")}P</span>
                <button
                  type="button"
                  onClick={() => void redeem(item)}
                  disabled={disabled}
                  className="btn-outline btn-sm min-w-[72px]"
                >
                  {busy ? "교환 중…" : st.status === "done" ? "교환 완료" : "교환"}
                </button>
              </span>

              {/* 상태 안내 — 행 아래 한 줄 */}
              {st.status === "done" && (
                <span role="status" className="basis-full t-sub font-bold text-success">
                  {st.message}
                </span>
              )}
              {st.status === "error" && (
                <span role="alert" className="basis-full t-sub font-bold text-danger">
                  {st.message}
                </span>
              )}
              {st.status !== "done" && st.status !== "error" && insufficient && (
                <span className="basis-full t-caption text-text-3">포인트 부족</span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="rise-in-2 t-caption leading-[1.6] text-text-3">교환 효과 즉시 적용 · 교환한 포인트는 환불 안 됨</p>
    </div>
  );
}
