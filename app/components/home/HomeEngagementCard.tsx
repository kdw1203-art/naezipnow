"use client";

import { hasSession } from "@/lib/client/has-session";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useShellActive, type Shell } from "@/lib/client/viewport-shell";

/* [개선 #11·#12·#29, 2026-08-22] 홈 참여 카드 — 로그인 사용자 전용.
 *
 * 실측 배경: 포인트 사용자 1명 · 30일 노트 작성 2건 · 출석 루프 미가동.
 * 출석(하루 +10P)·연속 보너스·온보딩 200P 보상이 코드에 다 있는데 지갑 깊숙이
 * 숨어 있어 아무도 못 봤다. 홈에서 원탭으로 잇는다:
 *   ① 출석 체크(연속 표시) — #12
 *   ② 포인트 → 상점 최고 아이템(상단 노출 7일, 500P) 진행바 — #29 (2026-08-23 목표 변경)
 *   ③ 첫 임장노트 미션(+300P) — #11 (온보딩 inspection 스텝 미완일 때만)
 *
 * 캐시·CLS 규율: 홈은 ISR 공유 캐시라 서버는 로그인 상태를 모른다. 이 카드는
 * 전부 클라이언트 조회이고, 게스트(401)면 아무것도 그리지 않는다. 로그인
 * 사용자는 첫 클라이언트 렌더에서 세션 쿠키 존재로 자리(고정 높이)를 먼저
 * 잡고 데이터로 채운다 — 늦게 불쑥 나타나 아래를 밀지 않게.
 */

type State =
  | { phase: "none" } // 게스트 또는 조회 실패 — 아무것도 안 그림
  | { phase: "loading" }
  | {
      phase: "ready";
      checkedToday: boolean;
      streak: number;
      balance: number;
      needNoteMission: boolean;
      /** [E004] 관심지역 미설정 — 개인화 홈·알림·다이제스트가 전부 이걸 전제한다 */
      needRegionSetup: boolean;
    };

/* 2026-08-23: 구 PLAN_PRO_COST(2,900P → 플러스 1개월) 진행바는 제거 —
   포인트↔유료 구독 교환이 사라지면서(토스 회신, lib/points/catalog.ts 주석)
   목표를 상점 최고 아이템(매물 상단 노출 7일, 500P)으로 바꿨다. */
const SHOP_GOAL_COST = 500; // lib/points/catalog.ts listing_boost_7d 와 동일 (표시용)

/* [968 · 8] 카드 데이터 3건(출석·포인트·온보딩)을 페이지 수명 안에서 한 번만 받는다.
   홈은 이 카드를 모바일·데스크톱 두 벌로 마운트하므로 예전엔 로그인 홈 한 번에
   fetch 6건이 나갔다. shell 판정으로 안 보이는 벌은 아예 안 부르지만, 경계를 넘나드는
   창(태블릿 회전)처럼 두 벌이 다 살아나는 경우를 위해 공유 프라미스도 둔다.
   실패는 캐시하지 않는다(일시 오류가 30초 "카드 없음"으로 굳지 않게). 출석 체크(POST)
   뒤 값은 컴포넌트 상태로 갱신하므로 이 캐시를 건드릴 필요가 없다. */
type AttendanceJson = { checkedToday?: unknown; streak?: unknown; totalPoints?: unknown };
type PointsJson = { balance?: unknown };
type OnboardingJson = { steps?: unknown };
type EngagementPayload = [AttendanceJson | null, PointsJson | null, OnboardingJson | null];
const ENGAGEMENT_TTL_MS = 30_000;
let engagementCache: { at: number; promise: Promise<EngagementPayload> } | null = null;
function fetchEngagement(): Promise<EngagementPayload> {
  if (engagementCache && Date.now() - engagementCache.at < ENGAGEMENT_TTL_MS) {
    return engagementCache.promise;
  }
  const promise: Promise<EngagementPayload> = Promise.all([
    fetch("/api/me/attendance", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    fetch("/api/me/points", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    fetch("/api/me/onboarding", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
  ]).then(
    (v) => {
      if (!v[0] && engagementCache?.promise === promise) engagementCache = null;
      return v as EngagementPayload;
    },
    (e) => {
      if (engagementCache?.promise === promise) engagementCache = null;
      throw e;
    },
  );
  engagementCache = { at: Date.now(), promise };
  return promise;
}

export function HomeEngagementCard({ shell }: { shell?: Shell } = {}) {
  const [st, setSt] = useState<State>({ phase: "none" });
  const [checking, setChecking] = useState(false);
  const [justEarned, setJustEarned] = useState<number | null>(null);
  /* [968 · 8] 안 보이는 벌은 세션 조회·데이터 3건을 시작하지 않는다(null 그대로) */
  const active = useShellActive(shell);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    /* [967 · 33] 게스트 판정은 세션 API 로(httpOnly 쿠키는 스크립트에 안 보인다 —
       예전 정규식 판정은 항상 게스트라 이 카드가 한 번도 렌더되지 않았다). */
    void hasSession().then((authed) => {
      if (cancelled || !authed) return; // 게스트 — 자리도 만들지 않는다
      load();
    });
    return () => {
      cancelled = true;
    };
    function load() {
      setSt({ phase: "loading" });
      fetchEngagement()
        .then(([att, pts, onb]) => {
          if (cancelled) return;
          if (!att) {
            setSt({ phase: "none" });
            return;
          }
          const steps: string[] = Array.isArray(onb?.steps)
            ? onb.steps.filter((x): x is string => typeof x === "string")
            : [];
          setSt({
            phase: "ready",
            checkedToday: Boolean(att.checkedToday),
            streak: Number(att.streak) || 0,
            balance: Number(pts?.balance ?? att.totalPoints) || 0,
            needNoteMission: !steps.includes("inspection"),
            needRegionSetup: !steps.includes("profile_region"),
          });
        })
        .catch(() => {
          if (!cancelled) setSt({ phase: "none" });
        });
    }
  }, [active]);

  const checkIn = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        awarded?: number;
        streak?: number;
        balance?: number | null;
      } | null;
      if (res.ok && data) {
        setJustEarned(typeof data.awarded === "number" ? data.awarded : null);
        setSt((prev) =>
          prev.phase === "ready"
            ? {
                ...prev,
                checkedToday: true,
                streak: data.streak ?? prev.streak,
                balance:
                  typeof data.balance === "number"
                    ? data.balance
                    : prev.balance,
              }
            : prev,
        );
      }
    } catch {
      /* 실패 시 조용히 — 다음 방문에 다시 */
    } finally {
      setChecking(false);
    }
  }, [checking]);

  if (st.phase === "none") return null;

  return (
    <section
      aria-label="오늘의 활동"
      className="card min-h-[104px] rounded-[18px] px-4 py-3.5"
    >
      {st.phase === "loading" ? (
        <div className="h-[76px] animate-pulse rounded-xl bg-bg" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* ① 출석 — 하루의 첫 탭 */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-ink">
                {st.checkedToday
                  ? "오늘 출석 완료"
                  : "오늘 출석하고 포인트 받기"}
                {st.streak > 1 && (
                  <span className="ml-1.5 text-[12px] font-bold text-warning">
                    🔥 연속 {st.streak}일
                  </span>
                )}
              </div>
              <div className="text-[12px] text-text-3">
                {st.checkedToday
                  ? justEarned
                    ? `+${justEarned}P 적립됐어요`
                    : "내일 또 만나요 — 3·7일 연속이면 보너스가 붙어요"
                  : "매일 +10P · 3일 연속 +10P · 7일 연속 +40P 보너스"}
              </div>
            </div>
            {st.checkedToday ? (
              <span className="shrink-0 rounded-full bg-success-soft px-3 py-1.5 t-body font-extrabold text-success">
                ✓ 완료
              </span>
            ) : (
              <button
                type="button"
                onClick={checkIn}
                disabled={checking}
                className="btn-primary press shrink-0 rounded-full px-4 py-2 t-body font-bold disabled:opacity-60"
              >
                {checking ? "체크 중…" : "출석 +10P"}
              </button>
            )}
          </div>

          {/* ② 포인트 → 상점 최고 아이템(상단 노출 7일) 진행바 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="text-text-3">
                내 포인트{" "}
                <b className="text-ink">
                  {st.balance.toLocaleString("ko-KR")}P
                </b>
              </span>
              {st.balance >= SHOP_GOAL_COST ? (
                <Link
                  href="/points/shop"
                  className="font-extrabold text-primary no-underline"
                >
                  상점에서 교환 가능 ›
                </Link>
              ) : (
                <span className="text-text-3">
                  상단 노출 7일까지{" "}
                  <b className="text-primary">
                    {(SHOP_GOAL_COST - st.balance).toLocaleString("ko-KR")}P
                  </b>
                </span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, Math.round((st.balance / SHOP_GOAL_COST) * 100))}%`,
                }}
              />
            </div>
          </div>

          {/* [E004] 관심지역 유도 — 미설정자에게만. 개인화 홈·관심단지 알림·
              주간 다이제스트가 전부 관심지역을 전제하는데, 이 설정으로 가는
              문이 지도 폴백 화면에만 있었다. 매일 여는 카드에 문을 하나 더. */}
          {st.needRegionSetup && (
            <Link
              href="/welcome"
              className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 no-underline"
            >
              <span className="t-body font-bold text-primary">
                📍 관심지역을 정하면 홈·알림이 내 동네 기준으로 바뀌어요
              </span>
              <span className="text-[13px] font-extrabold text-primary">›</span>
            </Link>
          )}

          {/* ③ 첫 노트 미션 — 이미 쓴 사람에겐 안 보인다 */}
          {st.needNoteMission && (
            <Link
              href="/notes/new"
              className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 no-underline"
            >
              <span className="t-body font-bold text-primary">
                🎯 첫 임장노트 쓰면 +300P (공개 100P + 완주 보너스 200P)
              </span>
              <span className="text-[13px] font-extrabold text-primary">›</span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
