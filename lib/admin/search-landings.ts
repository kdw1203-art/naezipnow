import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { readPaged } from "@/lib/supabase/read-paged";
import { kstDay } from "@/lib/metrics/page-count";
import { outageOn } from "@/lib/metrics/known-outages";
import { summarizeSearchLandings, type LandingRow, type SearchLandingSummary } from "@/lib/seo/search-engines";

/** [1106] 화면이 "매일 갱신"을 보여 줄 재료 — 마지막으로 수가 오른 시각 · 잘림 여부 */
export type SearchLandingsLoaded = SearchLandingSummary & {
  /** 가장 최근 updated_at(ISO) — 비콘 하나가 들어올 때마다 바뀐다 */
  lastRecordedAt: string | null;
  /** 2만 행 상한에 닿았는가(닿으면 화면이 "일부"라고 적는다) */
  truncated: boolean;
};

/**
 * [1061] 검색엔진별 착지(우리 측정) — public.page_view_daily_agg 의 첫 화면 줄(is_landing) 최근 56일
 * (비교용 앞 28일 포함). 동의와 무관한 익명 하루 수라 전체 방문의 모집단이다(관리 › 트래픽의
 * "유입 출처" 표는 동의 방문 표본 — 둘이 다른 이유가 여기 있다). 실패는 던진다.
 *
 * [1106] 소유자 2026-11-05 캡처 — 막대가 10.22 뒤로 비고 "앞 28일"이 전부 0. 원인: `.limit(50_000)` 한 번은
 * PostgREST 상한 1,000행만 돌려준다(56일 1,691행 · 날짜 오름차순이라 10.22 이후가 통째로 빠짐 · 합계도 그만큼 모자람).
 * → readPaged(쪽마다 기본 키 순서 · 끝까지). 처음 쌓인 날을 따로 읽어 "앞 기간 수집 전"을 0 과 구분하고,
 * 운영 정지 날(known-outages)을 표시한다. 이 화면은 열 때마다 새로 읽는다(force-dynamic) — 오늘 수는 자정까지 오른다.
 */
export async function loadSearchLandings(nowMs: number = Date.now(), days = 28): Promise<SearchLandingsLoaded> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const today = kstDay(nowMs);
  const since = kstDay(nowMs - (days * 2 - 1) * 86_400_000);
  const [paged, firstR] = await Promise.all([
    readPaged<Record<string, unknown>>(
      (from, to) =>
        sb
          .from("page_view_daily_agg")
          .select("day, route, ref_host, n, updated_at")
          .eq("is_landing", true)
          .gte("day", since)
          /* 기본 키 순서 그대로 — 쪽이 겹치거나 빠지지 않게(is_landing 은 위에서 고정) */
          .order("day", { ascending: true })
          .order("route", { ascending: true })
          .order("is_landing", { ascending: true })
          .order("ref_host", { ascending: true })
          .order("utm_source", { ascending: true })
          .order("device", { ascending: true })
          .range(from, to),
      20_000,
    ),
    sb.from("page_view_daily_agg").select("day").order("day", { ascending: true }).limit(1),
  ]);
  if (firstR.error) throw new Error(`착지 시작일 조회 실패: ${firstR.error.message}`);
  let lastRecordedAt: string | null = null;
  const rows: LandingRow[] = paged.rows.map((r) => {
    const u = typeof r.updated_at === "string" ? r.updated_at : null;
    if (u && (lastRecordedAt === null || Date.parse(u) > Date.parse(lastRecordedAt))) lastRecordedAt = u;
    return {
      day: String(r.day ?? ""),
      route: String(r.route ?? ""),
      ref_host: String(r.ref_host ?? ""),
      n: Number(r.n ?? 0),
    };
  });
  const firstRow = ((firstR.data ?? []) as Array<{ day?: unknown }>)[0];
  const firstDay = firstRow && typeof firstRow.day === "string" ? firstRow.day : null;
  const summary = summarizeSearchLandings(rows, today, days, {
    firstDay,
    isOutage: (d) => outageOn(d) !== null,
  });
  return { ...summary, lastRecordedAt, truncated: paged.truncated };
}
