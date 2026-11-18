import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/* [1195] 앱에서 생긴 장애를 운영 경보(ops.health_alert_log)에 바로 남긴다 — 가입 인증 메일 · 사이트 메일 SMTP 인증 실패,
   공용 KV 장애처럼 "로그에만 찍히고 아무도 몰랐던" 것들. ops 스키마는 REST 에 열려 있지 않아 public.report_ops_alert RPC 로 쓴다
   (같은 경보 throttle 시간 안 중복은 RPC 가 거른다 · ok 는 직전이 경보일 때만 남는다). RPC 가 없거나 실패하면 조용히 넘어간다. */
export type OpsAlertSeverity = "critical" | "warn" | "ok";

export async function reportOpsAlert(check: `ops.${string}`, severity: OpsAlertSeverity, detail: string, throttleHours = 6): Promise<void> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return;
    await sb.rpc("report_ops_alert", {
      p_check: check,
      p_severity: severity,
      p_detail: `#sig:${check.slice(4)}:${severity} ${detail}`.slice(0, 500),
      p_throttle_hours: throttleHours,
    });
  } catch {
    /* 경보 기록 실패가 본 동작을 막지 않는다 */
  }
}
