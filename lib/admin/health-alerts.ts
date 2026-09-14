import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* 운영 경보 읽기 — ops.health_alert_log.
 *
 * 왜 이 파일이 생겼나(2026-08-25 실측): 경보 시스템은 이미 돌고 있었다.
 * 14일 동안 critical 이 169건 쌓였고(market_transactions.month_rollover 73 ·
 * ingest 66 · pipeline_heartbeat 30), db.query_load 경고는 **매일** 울렸다.
 * 그런데 그 경보를 읽는 화면이 한 곳도 없었다 — 테이블에만 쌓이고 있었다.
 * 아무도 안 보는 경보는 경보가 아니다.
 *
 * 메일 발송(RESEND)은 키가 아직 없어 닫혀 있다. 그 전까지는 최소한
 * 관리자 화면에서 보이게 한다.
 *
 * [999 · 2026-09-14] 로그에는 "울린 것"만 쌓이고 "그친 것"은 안 쌓인다. 그래서 7일 판은
 * 09-08 에 고친 matview 경보, 09-13 에 회복한 apt-master 경보를 오늘도 critical 로
 * 보여 줬다(소유자 화면: critical 7종 중 진행 중은 2종). 검사마다 마지막 발생 시각과
 * 그 검사의 발생 주기(로그 간격에서 도출)를 보고 **진행 중 / 해소** 를 가른다 —
 * 시간 단위 검사는 마지막 발생이 3시간 안이면 진행 중, 일 단위 검사는 27시간.
 */

export type { HealthAlertRow } from "./health-alerts-fold";
import { foldHealthAlerts, type HealthAlertRow } from "./health-alerts-fold";

/** 최근 N일 경보를 check_name 기준으로 접어, 진행 중 → 심각도 → 최근 순으로 돌려준다. */
export async function loadRecentHealthAlerts(days = 7, limit = 12): Promise<HealthAlertRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  /* [937 수리 2026-08-31] `.schema("ops")` REST 조회는 PGRST106으로 항상
     실패한다 — ops 는 PostgREST exposed schemas 에 없다(설계 유지, rls-inventory).
     이 함수는 그동안 조용히 빈 배열을 돌려줬다: 경보 배너도, 운영 콘솔 경보
     판도 사실상 꺼져 있었다. public 의 SECURITY DEFINER RPC(service_role 전용)
     로 통로를 바꾼다. */
  const run = () => sb.rpc("admin_recent_health_alerts", { p_days: days, p_limit: 500 });
  let { data, error } = await run();
  if (error) {
    /* [G003 2026-08-31] 1회 재시도. 7일간 이 조회의 실패 2건은 전부 DB 포화
       구간의 일시 오류였다 — 운영 콘솔이 그 순간에만 "경보를 못 읽었다"고
       앓으면, 정작 경보를 봐야 할 때 화면이 비어 있게 된다. 짧게 한 번 더. */
    await new Promise((r) => setTimeout(r, 300));
    ({ data, error } = await run());
  }
  if (error) {
    logger.error("[admin] 경보 로그 조회 실패", error);
    return [];
  }
  return foldHealthAlerts((data ?? []) as Array<Record<string, unknown>>, new Date(), limit);
}

/** [G001] 지금 울리고 있는 critical 경보 — 관리자 전 페이지 상단 배너용.
 *
 * billing-renewals 가 4일 넘게 critical 인데 freshness 서브 페이지에 들어가야
 * 보였다. 심각 경보는 관리자 어느 화면에 있어도 먼저 보여야 한다.
 * [999] 24시간 안에 울렸더라도 이미 그친 것은 배너에 올리지 않는다(판에는 "해소"로 남는다). */
export async function loadCriticalAlerts24h(): Promise<HealthAlertRow[]> {
  const alerts = await loadRecentHealthAlerts(1, 12);
  return alerts.filter((a) => a.severity === "critical" && a.active);
}
