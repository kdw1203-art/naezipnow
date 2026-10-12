"use client";

/* 지갑 출석 체크 — POST /api/me/attendance (하루 1회, 10/20/50P) → 결과 표시 + 잔액 새로고침.
   B6: 마운트 시 GET 으로 연속 출석일·오늘 출석 여부를 읽어 스트릭을 표면화(재방문 동기).
   [1056] 서버가 다음 출석 지급액(nextReward)·마지막 출석일(lastDate)을 내려준다 — 버튼이 늘
   "+10P" 였고(3일째 20P·7일째 50P 인데도), 끊긴 스트릭을 "이어가기"로 적던 것의 수정. */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kstDateOf, lastSevenDays, type AttendanceDay } from "@/lib/points/attendance-rules";

/* [1058 · C8] 최근 7일 점 — GET 이 이미 내려보내는 attendance(7일 행)로 "어느 날 출석했는지"를 점 7개로.
   틀린 사실: "연속 N일" 한 줄뿐이라 빠진 날이 보이지 않았다. 오늘(KST)은 큰 점. */

type Msg = { text: string; tone: "ok" | "info" | "error" };
type Status = {
  streak: number;
  checkedToday: boolean;
  /** 다음 출석(오늘 아직이면 오늘, 했으면 내일)의 지급액 */
  nextReward: number;
  /** 마지막 출석일 "YYYY-MM-DD" — 없으면 null */
  lastDate: string | null;
  /** 최근 7일 점 — GET 성공 전엔 null(그리지 않는다) */
  days: AttendanceDay[] | null;
};

/** "2026-10-07" → "10/7" */
function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export function AttendanceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [status, setStatus] = useState<Status>({
    streak: 0,
    checkedToday: false,
    nextReward: 10,
    lastDate: null,
    days: null,
  });

  // 마운트 시 현재 스트릭·오늘 출석 여부 로드 (실패해도 버튼은 동작).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/attendance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          j: {
            streak?: number;
            checkedToday?: boolean;
            nextReward?: number;
            lastDate?: string | null;
            attendance?: { date?: unknown }[];
          } | null,
        ) => {
          if (cancelled || !j) return;
          const rows = Array.isArray(j.attendance)
            ? j.attendance.filter((a): a is { date: string } => typeof a?.date === "string")
            : [];
          setStatus((s) => ({
            streak: typeof j.streak === "number" ? j.streak : s.streak,
            checkedToday: typeof j.checkedToday === "boolean" ? j.checkedToday : s.checkedToday,
            nextReward: typeof j.nextReward === "number" ? j.nextReward : s.nextReward,
            lastDate: typeof j.lastDate === "string" ? j.lastDate : s.lastDate,
            days: lastSevenDays(rows, kstDateOf(Date.now())),
          }));
        },
      )
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
        bonusAwarded?: number;
        alreadyChecked?: boolean;
        streak?: number;
        nextReward?: number;
        date?: string;
        error?: string;
      };
      if (!res.ok) {
        setMsg({ text: data.error ?? "출석 체크 실패", tone: "error" });
        return;
      }
      setStatus((s) => ({
        streak: typeof data.streak === "number" ? data.streak : s.streak,
        checkedToday: true,
        nextReward: typeof data.nextReward === "number" ? data.nextReward : s.nextReward,
        lastDate: typeof data.date === "string" ? data.date : s.lastDate,
        /* 오늘 점을 바로 채운다(점이 있을 때만 — GET 이 실패했으면 그대로 없음) */
        days: s.days ? s.days.map((d) => (d.today ? { ...d, attended: true } : d)) : s.days,
      }));
      if (data.alreadyChecked || !data.awarded) {
        setMsg({ text: "오늘 출석 완료 · 이미 적립됨", tone: "info" });
      } else {
        /* [1056 · A2] 보너스가 섞인 날은 그 사실을 적는다(20P·50P 가 왜 왔는지) */
        const bonus =
          typeof data.bonusAwarded === "number" && data.bonusAwarded > 0 && typeof data.streak === "number"
            ? ` · 연속 ${data.streak}일 보너스 포함`
            : "";
        setMsg({ text: `+${data.awarded}P 적립${bonus}`, tone: "ok" });
      }
      router.refresh();
    } catch {
      /* [1056] "네트워크 오류가 발생했어요…" → 오류 문구 표준 */
      setMsg({ text: "출석 저장 실패 · 잠시 후 다시", tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [router]);

  const { streak, checkedToday, nextReward, lastDate, days } = status;
  const attendedCount = days ? days.filter((d) => d.attended).length : 0;
  /* 스트릭 줄 — 살아 있으면 "연속 출석 N일 · 오늘/내일 XP", 끊겼으면 "마지막 출석 M/D · 오늘 10P" */
  const line =
    streak > 0
      ? `연속 출석 ${streak}일 · ${checkedToday ? "내일" : "오늘"} ${nextReward}P`
      : lastDate
        ? `마지막 출석 ${shortDate(lastDate)} · 오늘 ${nextReward}P`
        : null;

  return (
    <div className="flex flex-col gap-2">
      {days && (
        <div className="flex items-center justify-center gap-2">
          <span className="t-caption text-ai-muted">최근 7일</span>
          <ol className="m-0 flex list-none items-center gap-1.5 p-0" aria-hidden="true">
            {days.map((d) => (
              <li
                key={d.date}
                title={d.date}
                className={`rounded-full ${d.today ? "h-3 w-3" : "h-2 w-2"} ${
                  d.attended ? "bg-ai-accent" : "border border-ai-muted"
                }`}
              />
            ))}
          </ol>
          <span className="sr-only">최근 7일 출석 {attendedCount}일</span>
        </div>
      )}
      {line && (
        <div className="flex items-center justify-center gap-1.5 t-sub font-bold text-ai-accent">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ai-accent" />
          {line}
        </div>
      )}
      <button
        type="button"
        onClick={checkIn}
        disabled={busy || checkedToday}
        className="btn-primary min-h-[40px] rounded-lg py-2.5 text-center text-[13px] disabled:opacity-60 md:min-h-6"
      >
        {busy
          ? "출석 확인 중…"
          : checkedToday
            ? "오늘 출석 완료"
            : `출석 체크 +${nextReward}P`}
      </button>
      {msg && (
        <div
          role="status"
          className={`text-center text-[12px] font-bold ${
            msg.tone === "error"
              ? "text-ai-danger"
              : msg.tone === "info"
                ? "text-ai-muted"
                : "text-ai-accent"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
