"use client";

/* 지갑 출석 체크 — POST /api/me/attendance (하루 1회 +10P) → 결과 표시 + 잔액 새로고침.
   B6: 마운트 시 GET 으로 연속 출석일·오늘 출석 여부를 읽어 스트릭을 표면화(재방문 동기). */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { text: string; tone: "ok" | "info" | "error" };

/**
 * [v4 · 규칙 5] `variant="row"` — /my 목록 행 한 줄(왼쪽 "출석 체크" + 연속 출석 사실 / 오른쪽 테두리 버튼).
 * 채움 파랑은 쓰지 않는다(그 화면의 채움 파랑은 다음 할 일·카드 재등록 하나). 기본(block)은 /my/points 지갑.
 */
export function AttendanceButton({ variant = "block" }: { variant?: "block" | "row" } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [streak, setStreak] = useState(0);
  const [checkedToday, setCheckedToday] = useState(false);

  // 마운트 시 현재 스트릭·오늘 출석 여부 로드 (실패해도 버튼은 동작).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/attendance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { streak?: number; checkedToday?: boolean } | null) => {
        if (cancelled || !j) return;
        if (typeof j.streak === "number") setStreak(j.streak);
        if (typeof j.checkedToday === "boolean") setCheckedToday(j.checkedToday);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const checkIn = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        awarded?: number;
        alreadyChecked?: boolean;
        streak?: number;
        error?: string;
      };
      if (!res.ok) {
        setMsg({ text: data.error ?? "출석 체크에 실패했어요.", tone: "error" });
        return;
      }
      if (typeof data.streak === "number") setStreak(data.streak);
      setCheckedToday(true);
      if (data.alreadyChecked || !data.awarded) {
        setMsg({ text: "오늘은 이미 출석했어요", tone: "info" });
      } else {
        setMsg({ text: `+${data.awarded}P 적립됐어요`, tone: "ok" }); /* [1012] 규칙 6 — 느낌표 금지 */
      }
      router.refresh();
    } catch {
      setMsg({ text: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [router]);

  const label = busy ? "출석 확인 중…" : checkedToday ? "오늘 출석 완료 ✓" : "출석 체크 +10P";
  const msgTone =
    msg?.tone === "error" ? "text-danger" : msg?.tone === "info" ? "text-text-3" : "text-primary";

  if (variant === "row") {
    return (
      <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 py-3">
        <span className="min-w-0 flex-1">
          <span className="block t-body font-bold text-ink">출석 체크</span>
          <span className="mt-0.5 block truncate t-sub text-text-3">
            {msg ? <span className={msgTone}>{msg.text}</span> : streak > 0 ? `연속 ${streak}일${checkedToday ? " · 오늘 완료" : ""}` : "하루 1회 +10P"}
          </span>
        </span>
        <button
          type="button"
          onClick={checkIn}
          disabled={busy || checkedToday}
          className="btn-outline btn-sm shrink-0"
        >
          {label}
        </button>
      </li>
    );
  }

  /* [v4 · 규칙 4·10] 지갑의 네이비 패널이 흰 바탕 숫자 머리로 바뀌어 AI 잉크 색(ai-accent 등) → 기본 토큰.
     가운데 정렬(연속 출석·결과 문구) → 왼쪽 */
  return (
    <div className="flex flex-col gap-2">
      {streak > 0 && (
        <div className="flex items-center gap-1.5 t-sub font-bold text-primary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          연속 출석 {streak}일{checkedToday ? " · 오늘 완료" : " · 오늘 이어가기"}
        </div>
      )}
      <button
        type="button"
        onClick={checkIn}
        disabled={busy || checkedToday}
        className="btn-primary rounded-lg py-2.5 text-center text-[13px] disabled:opacity-60"
      >
        {label}
      </button>
      {msg && (
        <div className={`text-[12px] font-bold ${msgTone}`}>{msg.text}</div>
      )}
    </div>
  );
}
