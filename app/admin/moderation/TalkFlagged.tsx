"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FlaggedTalk } from "@/lib/talk/store";

/**
 * [1052] 실시간 토론(1051) 신고·숨김 글 — 신고 1건 이상이거나 숨김(신고 3건 · 탈퇴 접수)인 한 줄.
 * 되살리기(숨김 해제 · 누적 0) · 지우기(deleted_at). PATCH /api/admin/talk. 브라우저 confirm() 은 쓰지 않는다 —
 * 지우기는 한 번 더 눌러야 한다.
 */

function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}.${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export function TalkFlagged({ items }: { items: FlaggedTalk[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "restore" | "delete") {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/talk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(j.error ?? `처리 실패 (${res.status})`);
      else {
        setArm(null);
        router.refresh();
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-6 text-center text-[12px] text-[#9aa6b8]">
        신고·숨김 토론 글 없음
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <div className="text-[12px] text-ai-danger">{error}</div>}
      {items.map((t) => (
        <div key={t.id} className="rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span
              className="rounded px-1.5 py-px font-bold"
              style={t.hiddenAt ? { color: "var(--ai-danger)", background: "rgba(248,113,113,.14)" } : { color: "#f2c94c", background: "rgba(242,201,76,.14)" }}
            >
              {t.hiddenAt ? "숨김" : "신고"} {t.reportCount}
            </span>
            <span className="font-bold text-ai-accent">{t.regionName}</span>
            {t.complexName && <span className="text-[#9aa6b8]">{t.complexName}</span>}
            <span className="text-[#9aa6b8]">{t.author}</span>
            <span className="ml-auto text-[#6b7688]">{when(t.createdAt)}</span>
          </div>
          <div className="mt-1.5 break-words text-[12px] text-white">{t.body}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(t.hiddenAt || t.reportCount > 0) && (
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => void act(t.id, "restore")}
                className="min-h-8 rounded-lg border border-[rgba(74,222,128,.4)] px-3 py-1.5 text-[12px] font-bold text-ai-success disabled:opacity-50"
              >
                {t.hiddenAt ? "되살리기" : "신고 기각"}
              </button>
            )}
            <button
              type="button"
              disabled={busy === t.id}
              onClick={() => (arm === t.id ? void act(t.id, "delete") : setArm(t.id))}
              className="min-h-8 rounded-lg border border-[rgba(248,113,113,.4)] px-3 py-1.5 text-[12px] font-bold text-ai-danger disabled:opacity-50"
            >
              {arm === t.id ? "한 번 더 누르면 지우기" : "지우기"}
            </button>
            {arm === t.id && (
              <button type="button" onClick={() => setArm(null)} className="min-h-8 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#9aa6b8]">
                그만두기
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
