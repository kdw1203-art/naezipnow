"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { attendanceLine, pointsLink } from "@/lib/home/engagement-line";

/* [1056] 홈 "오늘의 활동" 카드 — 로그인 사용자에게만, HomeMyRail 이 세션을 확인한 뒤
 * 동적 import 로 붙인다(홈 첫 번들 밖 — / 예산 495KB 안에서 488KB 라 정적 import 는 못 넣는다).
 *
 * 예전 이 파일(2026-08-22)은 홈 어디에서도 import 되지 않은 고아였다 — 출석·연속 보너스·
 * 미션·완주 200P 가 전부 지갑 깊숙이(/my/points) 있어 홈에서는 보이지 않았다. 다시 붙이며
 * 한 번의 조회(/api/me/engagement)로 바꾸고, 관심지역 판정 오류(steps 에 없는
 * profile_region 을 찾아 늘 "미설정")도 그 API 쪽에서 고쳤다.
 *
 * 그리는 것(전부 사실 낱말):
 *   ① 출석 — "연속 출석 N일 · 오늘 20P" + 단추 "출석 +20P" / 완료 뒤 "오늘 출석 완료 · 연속 N일"
 *   ② 포인트 잔액 · 이번 주 미션 n/3(적립 가능 n) → /my/points
 *   ③ 시작 3미션 n/3(완주 보너스 200P) — 완주 전에만
 *   ④ 관심지역 미설정 — 설정 전에만 → /welcome
 * 게스트·조회 실패는 아무것도 그리지 않는다(빈 상자·훈계 없음). */

type Engagement = {
  attendance: { checkedToday: boolean; streak: number; nextReward: 10 | 20 | 50; lastDate: string | null } | null;
  balance: number | null;
  missions: {
    weekDone: number;
    weekTotal: number;
    claimable: number;
    startDone: number;
    startTotal: number;
    startClaimed: boolean;
  } | null;
  regionsSet: boolean | null;
};

type State = { phase: "loading" } | { phase: "none" } | { phase: "ready"; data: Engagement };

export function HomeEngagementCard({ onResolved }: { onResolved?: (has: boolean) => void } = {}) {
  const [st, setSt] = useState<State>({ phase: "loading" });
  const [checking, setChecking] = useState(false);
  const [earned, setEarned] = useState<{ awarded: number; bonus: number } | null>(null);
  const [checkError, setCheckError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/engagement", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Engagement>) : null))
      .then((j) => {
        if (!alive) return;
        if (!j || (!j.attendance && j.balance === null && !j.missions)) {
          setSt({ phase: "none" });
          onResolved?.(false);
          return;
        }
        setSt({ phase: "ready", data: j });
        onResolved?.(true);
      })
      .catch(() => {
        if (!alive) return;
        setSt({ phase: "none" });
        onResolved?.(false);
      });
    return () => {
      alive = false;
    };
  }, [onResolved]);

  const checkIn = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setCheckError(false);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        awarded?: number;
        bonusAwarded?: number;
        streak?: number;
        nextReward?: 10 | 20 | 50;
        balance?: number | null;
        alreadyChecked?: boolean;
      } | null;
      if (!res.ok || !data) {
        setCheckError(true);
        return;
      }
      setEarned({ awarded: data.awarded ?? 0, bonus: data.bonusAwarded ?? 0 });
      setSt((prev) =>
        prev.phase === "ready"
          ? {
              phase: "ready",
              data: {
                ...prev.data,
                attendance: prev.data.attendance
                  ? {
                      ...prev.data.attendance,
                      checkedToday: true,
                      streak: data.streak ?? prev.data.attendance.streak,
                      nextReward: data.nextReward ?? prev.data.attendance.nextReward,
                    }
                  : prev.data.attendance,
                balance: typeof data.balance === "number" ? data.balance : prev.data.balance,
              },
            }
          : prev,
      );
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  }, [checking]);

  if (st.phase === "none") return null;
  if (st.phase === "loading") {
    return (
      <section aria-label="오늘의 활동" aria-busy="true" className="card rounded-2xl px-4 py-3.5">
        <div className="h-[72px] animate-pulse rounded-xl bg-bg" />
      </section>
    );
  }

  const { attendance, balance, missions, regionsSet } = st.data;
  const showStart = missions && !missions.startClaimed && missions.startDone < missions.startTotal;

  return (
    <section aria-label="오늘의 활동" className="card flex flex-col gap-2.5 rounded-2xl px-4 py-3.5">
      {/* ① 출석 */}
      {attendance && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-body font-bold text-ink">출석</div>
            <div className="t-sub text-text-3">
              {earned && earned.awarded > 0
                ? `+${earned.awarded}P 적립${earned.bonus > 0 ? ` · 연속 ${attendance.streak}일 보너스 포함` : ""}`
                : checkError
                  ? "출석 저장 실패 · 잠시 후 다시"
                  : attendanceLine(attendance)}
            </div>
          </div>
          {attendance.checkedToday ? (
            <span className="shrink-0 rounded-full bg-success-soft px-3 py-1.5 t-sub font-bold text-success">
              완료
            </span>
          ) : (
            <button
              type="button"
              onClick={checkIn}
              disabled={checking}
              aria-busy={checking || undefined}
              className="btn-primary press min-h-[40px] shrink-0 rounded-full px-4 t-body font-bold disabled:opacity-60 md:min-h-6"
            >
              {checking ? "확인 중" : `출석 +${attendance.nextReward}P`}
            </button>
          )}
        </div>
      )}

      {/* ② 포인트 · 이번 주 미션 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2.5 t-sub">
        <span className="text-text-3">
          {balance !== null ? (
            <>
              내 포인트 <b className="tabular-nums text-ink">{balance.toLocaleString("ko-KR")}P</b>
            </>
          ) : (
            "포인트 불러오기 실패"
          )}
          {missions && (
            <>
              {" · "}이번 주 미션{" "}
              <b className="tabular-nums text-ink">
                {missions.weekDone}/{missions.weekTotal}
              </b>
              {missions.claimable > 0 && <> · 적립 가능 {missions.claimable}</>}
            </>
          )}
        </span>
        <Link href={pointsLink(missions?.claimable ?? 0).href} className="tap-line font-bold text-primary no-underline">
          {pointsLink(missions?.claimable ?? 0).label}
        </Link>
      </div>

      {/* ③ 시작 3미션 — 완주 전에만 */}
      {showStart && missions && (
        <Link
          href="/my/points?tab=missions"
          className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 no-underline"
        >
          <span className="t-sub font-bold text-primary">
            시작 미션 {missions.startDone}/{missions.startTotal} · 완주 보너스 200P
          </span>
          <span className="t-sub font-bold text-primary">›</span>
        </Link>
      )}

      {/* ④ 관심지역 — 설정 전에만 */}
      {regionsSet === false && (
        <Link
          href="/welcome"
          className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 no-underline"
        >
          <span className="t-sub font-bold text-primary">관심지역 미설정 · 설정하면 홈·알림이 내 동네 기준</span>
          <span className="t-sub font-bold text-primary">›</span>
        </Link>
      )}
    </section>
  );
}

export default HomeEngagementCard;
