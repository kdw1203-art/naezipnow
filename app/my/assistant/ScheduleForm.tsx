"use client";
/* [1025 · 결정·비서] 임장 일정 등록 폼 — 단지(ComplexPicker) · 날짜 · 시간 → POST /api/inspection/schedule(기존 CRUD).
   등록되면 router.refresh() 로 서버가 목록(D-day)을 다시 그린다. 채움 파랑은 이 화면의 AgentChat 링크 하나라 여기는 btn-secondary.
   [1025b] page.tsx 의 접힌 <details> "일정 추가" 안에 놓인다 — 부연 캡션은 없애고 오류만 한 줄. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";

export function ScheduleForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!picked) {
      setError("단지를 고르세요");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("날짜를 고르세요");
      return;
    }
    const hm = /^\d{2}:\d{2}$/.test(time) ? time : "10:00";
    const scheduledAt = new Date(`${date}T${hm}:00+09:00`);
    if (!Number.isFinite(scheduledAt.getTime())) {
      setError("날짜·시간을 읽을 수 없어요");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/inspection/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${picked.name} 임장`,
          region: picked.regionLabel || picked.region || "—",
          aptName: picked.name,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(j?.error ?? "일정을 등록하지 못했어요 · 잠시 후 다시");
        return;
      }
      showToast(`${picked.name} · ${date} ${hm} 등록`);
      setPicked(null);
      setDate("");
      router.refresh();
    } catch {
      setError("일정을 등록하지 못했어요 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div className="md:col-span-2">
          <ComplexPicker label="단지" placeholder="단지 검색" onSelect={setPicked} onMapClick={null} />
        </div>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="t-caption text-text-3">날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 t-body text-ink tabular-nums"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="t-caption text-text-3">시간</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 t-body text-ink tabular-nums"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {error && (
          <span role="alert" className="t-caption text-danger">
            {error}
          </span>
        )}
        <button type="button" onClick={() => void submit()} disabled={busy} className={`btn-secondary btn-md press gap-1.5 ${busy ? "is-busy" : ""}`}>
          <Icon name="calendar" size={16} />
          일정 등록
        </button>
      </div>
    </div>
  );
}
