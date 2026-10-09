import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { parseAdminEmailAllowlist } from "@/lib/auth/admin-emails";
import { kstMonthStartIso, mergeChannels, type ChannelRow, type GrowthWeek, type GrowthWeeklyData } from "@/lib/growth/channels";

/**
 * [1046 · 성장] 관리자 트래픽 화면의 '성장 주간표' 재료 — DB 함수 두 개(service_role 전용)를 읽는다.
 *   admin_growth_weekly(8주)    주별 방문자·세션·검색 착지·신규 가입·첫 관심 등록
 *   admin_signup_channels(기간) 가입 한 건씩의 첫 착지(UTM·유입 호스트) → 채널 이름은 lib/growth/channels.ts
 * 관리자 방문(관리 화면을 연 방문자 키)과 관리자 계정(allowlist + app_users.role ≠ user)은 DB 쪽에서 뺀다.
 * 실패는 실패로 돌려준다 — 0 으로 꾸미지 않는다.
 */
export type { GrowthWeeklyData } from "@/lib/growth/channels";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadGrowthWeekly(): Promise<GrowthWeeklyData> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const exclude = [...parseAdminEmailAllowlist()];
  const since28 = new Date(Date.now() - 28 * 86_400_000).toISOString();

  const [w, c28, cMonth] = await Promise.all([
    sb.rpc("admin_growth_weekly", { p_weeks: 8, p_exclude_emails: exclude }),
    sb.rpc("admin_signup_channels", { p_since: since28, p_exclude_emails: exclude }),
    sb.rpc("admin_signup_channels", { p_since: kstMonthStartIso(), p_exclude_emails: exclude }),
  ]);
  if (w.error) throw new Error(`주간표 조회 실패: ${w.error.message}`);
  if (c28.error) throw new Error(`가입 채널 조회 실패: ${c28.error.message}`);
  if (cMonth.error) throw new Error(`이번 달 가입 조회 실패: ${cMonth.error.message}`);

  const weeks: GrowthWeek[] = ((w.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    weekStart: String(r.week_start ?? ""),
    visitors: num(r.visitors),
    sessions: num(r.sessions),
    searchLandings: num(r.search_landings),
    signups: num(r.signups),
    newWatchers: num(r.new_watchers),
  }));
  const toRows = (data: unknown): ChannelRow[] =>
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      utmSource: r.utm_source == null ? null : String(r.utm_source),
      referrerHost: r.referrer_host == null ? null : String(r.referrer_host),
      attributed: r.attributed === true,
      signups: num(r.signups),
    }));
  const monthRows = toRows(cMonth.data);
  return {
    weeks,
    channels28d: mergeChannels(toRows(c28.data)),
    monthSignups: monthRows.reduce((a, r) => a + r.signups, 0),
  };
}
