"use client";

import { useState } from "react";
import { alertRangeOrdered, eokInputFromKrw, parseEokInput } from "@/lib/watchlist/alert-range";

/* [1057 · B10] 실거래 알림 범위 입력 — user_watchlist.alert_price_min/max 는 API 가 받고 화면이 보여 줬지만 값을 넣는
   조작이 어디에도 없었다(항상 null). 행마다 억 단위 두 칸 + 저장 — PATCH /api/me/watchlist(원 단위 · 빈 칸 = 지움).
   폰 누름 면 40px(입력·저장) · 결과는 한 줄 사실("알림 범위 저장" / "알림 범위 저장 실패 · 잠시 후 다시"). */

const INPUT =
  "w-[72px] rounded-xl border border-line bg-surface px-3 py-2.5 t-body text-ink placeholder:text-text-3 min-h-[40px] md:min-h-6 md:py-1";

export function AlertRangeEditor({
  complexId,
  complexName,
  min,
  max,
  onSaved,
}: {
  complexId: string;
  complexName: string;
  /** 원 단위 — 없으면 null */
  min: number | null;
  max: number | null;
  onSaved?: (min: number | null, max: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [minText, setMinText] = useState(() => eokInputFromKrw(min));
  const [maxText, setMaxText] = useState(() => eokInputFromKrw(max));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function save() {
    if (busy) return;
    const a = parseEokInput(minText);
    const b = parseEokInput(maxText);
    if (!a.ok || !b.ok) {
      setNote({ text: "억 단위 숫자만 · 예 8.5", error: true });
      return;
    }
    if (!alertRangeOrdered(a.krw, b.krw)) {
      setNote({ text: "최소가 최대보다 큼", error: true });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/me/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId, alertPriceMin: a.krw, alertPriceMax: b.krw }),
      });
      if (!res.ok) {
        setNote({ text: "알림 범위 저장 실패 · 잠시 후 다시", error: true });
        return;
      }
      setNote({ text: a.krw == null && b.krw == null ? "알림 범위 지움" : "알림 범위 저장", error: false });
      onSaved?.(a.krw, b.krw);
    } catch {
      setNote({ text: "알림 범위 저장 실패 · 잠시 후 다시", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`${complexName} 실거래 알림 범위 편집`}
        className="tap-line inline-flex min-h-[40px] items-center t-caption font-bold text-primary md:min-h-6"
      >
        알림 범위 편집 ›
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      aria-label={`${complexName} 실거래 알림 범위`}
    >
      <span className="t-caption text-text-3">실거래 알림 범위 · 억</span>
      <input
        type="text"
        inputMode="decimal"
        value={minText}
        onChange={(e) => setMinText(e.target.value)}
        placeholder="최소"
        aria-label="최소 · 억"
        className={INPUT}
      />
      <span className="t-caption text-text-3">~</span>
      <input
        type="text"
        inputMode="decimal"
        value={maxText}
        onChange={(e) => setMaxText(e.target.value)}
        placeholder="최대"
        aria-label="최대 · 억"
        className={INPUT}
      />
      <button
        type="submit"
        disabled={busy}
        className="btn-outline inline-flex min-h-[40px] items-center rounded-lg px-3 t-caption md:min-h-6 md:py-0"
      >
        {busy ? "저장 중" : "저장"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setNote(null);
        }}
        className="inline-flex min-h-[40px] items-center px-1 t-caption text-text-3 md:min-h-6"
      >
        닫기
      </button>
      {note && (
        <span role={note.error ? "alert" : "status"} className={`t-caption ${note.error ? "font-bold text-danger" : "text-text-2"}`}>
          {note.text}
        </span>
      )}
    </form>
  );
}

export default AlertRangeEditor;
