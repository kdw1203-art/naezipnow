"use client";
/* [1025c · 결정·비서] 관심 단지 담기 — AI 비서 "관심 단지 30일" 카드의 손잡이. 단지를 고르면 바로 POST /api/me/watchlist
   (기존 API · 한도는 서버가 판정) → router.refresh() 로 서버가 줄(스파크라인)을 다시 그린다. 채움 파랑은 이 화면의 "대화 열기" 하나라
   여기는 버튼 없이 검색 한 칸(ComplexPicker)뿐이다. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import { useToast } from "@/app/components/toast/ToastProvider";

export function WatchAddForm({ count, max }: { count: number; max: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (c: PickedComplex) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId: c.id, complexName: c.name }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        setError(j?.error ?? j?.message ?? "관심 단지를 담지 못했어요 · 잠시 후 다시");
        return;
      }
      showToast(`${c.name} · 관심 단지에 담았어요`);
      router.refresh();
    } catch {
      setError("관심 단지를 담지 못했어요 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <ComplexPicker label="관심 단지 담기" placeholder="단지 검색" clearOnSelect showChip={false} onSelect={(c) => void add(c)} onMapClick={null} />
      <p className="mt-1 t-caption text-text-3">
        {error ? (
          <span role="alert" className="text-danger">
            {error}
          </span>
        ) : count >= max ? (
          `여기에는 ${max}곳까지 · 전체는 관심 단지 화면에서`
        ) : (
          "담으면 줄이 늘어나고 30일 안 거래가 2건 이상이면 선이 그려집니다"
        )}
      </p>
    </div>
  );
}
