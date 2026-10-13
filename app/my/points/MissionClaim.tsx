"use client";
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-bold/black 2곳을 font-bold(700)로 바꿨다. */

import { useState } from "react";
import { useRouter } from "next/navigation";

/* [1056] 서버 사유 → 짧은 사실 문구. 예전엔 상한 외 모든 실패를 "이미 적립됐어요"로 적었다(DB 오류도). */
function reasonText(reason: string | undefined): string {
  if (reason === "cap" || reason === "rule_cap") return "오늘 적립 상한 도달";
  if (reason === "already_once" || reason === "already_ref") return "이미 적립됨";
  return "적립 실패 · 잠시 후 다시";
}

/* 미션 청구 버튼 — 서버 재검증 후 지급. 성공 시 새로고침으로 claimed 반영. */
export function MissionClaim({
  kind,
  missionKey,
  points,
  disabled,
  claimed,
}: {
  kind: "start" | "ai" | "weekly";
  missionKey?: string;
  points: number;
  disabled: boolean;
  claimed: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (claimed) {
    return (
      <span className="rounded-full bg-success-soft px-3 py-1.5 t-sub font-bold text-success">
        적립 완료
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="t-sub font-bold text-warning">{msg}</span>}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch("/api/missions/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, key: missionKey }),
            });
            const json: { ok?: boolean; awarded?: number; error?: string; reason?: string } =
              await res.json().catch(() => ({}));
            if (!res.ok) {
              setMsg(json.error ?? "청구 실패");
              return;
            }
            if (json.ok) router.refresh();
            else setMsg(reasonText(json.reason));
          } catch {
            setMsg("적립 저장 실패 · 잠시 후 다시");
          } finally {
            setBusy(false);
          }
        }}
        className={`min-h-[40px] rounded-full px-3.5 py-1.5 t-sub font-bold md:min-h-6 ${
          disabled ? "bg-bg text-text-3" : "bg-primary text-white"
        } disabled:opacity-60`}
      >
        {busy ? "확인 중…" : `+${points}P 받기`}
      </button>
    </div>
  );
}
