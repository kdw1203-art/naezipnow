/**
 * 관심 단지(watchlist) 저장소.
 *
 * 이 파일의 조회는 **실패하면 던진다.** 예전에는 error 를 아예 받지 않아서,
 * DB 가 밀리는 몇 초 동안 사용자가 등록해 둔 관심 단지가 통째로 "없음"이 됐다 —
 * 목록은 "아직 등록한 단지가 없어요"로, 개수는 `0`(= 한도 전부 남음)으로,
 * 등록 여부는 `false`(= 관심 등록 안 함)로. 셋 다 사실이 아닌데 사실처럼 보인다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

/* [1057] notifyPriceChange(가격 변동 인앱 알림)는 부르는 곳이 없는 죽은 코드였다(실제 알림은 app/api/cron/price-alerts) — 함수와
   그 전용 import(pushInboxNotification · logger)·상수(WATCHERS_LIMIT)를 지웠다. */

export interface WatchlistItem {
  id: string;
  userEmail: string;
  complexId: string;
  complexName: string;
  alertPriceMin: number | null;
  alertPriceMax: number | null;
  createdAt: string;
  /* 웹17 — 대시보드용. price-alerts 크론이 세운 기준가(마지막 관측가)와
     그 기준가의 대표 면적대. 면적대가 바뀌면 가격 비교는 무효다(크론과 같은
     판정). 크론이 아직 못 본 행은 null. */
  lastPriceKrw: number | null;
  lastPriceBand: string | null;
}

const inMemory: WatchlistItem[] = [];

function dbToItem(r: Record<string, unknown>): WatchlistItem {
  return {
    id: String(r.id),
    userEmail: String(r.user_email),
    complexId: String(r.complex_id),
    complexName: String(r.complex_name),
    alertPriceMin: r.alert_price_min != null ? Number(r.alert_price_min) : null,
    alertPriceMax: r.alert_price_max != null ? Number(r.alert_price_max) : null,
    createdAt: String(r.created_at),
    lastPriceKrw: r.last_price_krw != null ? Number(r.last_price_krw) : null,
    lastPriceBand: r.last_price_band != null ? String(r.last_price_band) : null,
  };
}

export async function listWatchlist(userEmail: string): Promise<WatchlistItem[]> {
  const sb = getServiceSupabase();
  if (!sb) return inMemory.filter((w) => w.userEmail === userEmail);
  const { data, error } = await sb
    .from("user_watchlist")
    .select("*")
    .eq("user_email", userEmail)
    // 알림 구독(#47, lib/alerts/subscriptions) 행은 관심 단지 목록에서 제외
    .not("complex_id", "like", "alert:%")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`user_watchlist 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("user_watchlist 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map(dbToItem);
}

/* [1057 · B2] /my/watchlist 는 전체를 읽어 앞 30곳만 잘라 "관심 단지 N곳"을 잘린 수로 적었다(플랜 한도 100·무제한) —
   한 쪽(offset·limit)과 전체 수(count exact)를 같은 조건으로 한 번에 받는다. 정렬은 유일 열(id)까지 — 쪽이 겹치거나 빠지지 않게. */
export async function listWatchlistPage(
  userEmail: string,
  opts: { offset: number; limit: number },
): Promise<{ items: WatchlistItem[]; total: number }> {
  const offset = Math.max(0, Math.floor(opts.offset));
  const limit = Math.max(1, Math.min(Math.floor(opts.limit), 1000));
  const sb = getServiceSupabase();
  if (!sb) {
    const all = inMemory.filter((w) => w.userEmail === userEmail);
    return { items: all.slice(offset, offset + limit), total: all.length };
  }
  const { data, error, count } = await sb
    .from("user_watchlist")
    .select("*", { count: "exact" })
    .eq("user_email", userEmail)
    .not("complex_id", "like", "alert:%")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`user_watchlist 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("user_watchlist 조회 실패: 응답이 배열이 아닙니다");
  if (typeof count !== "number") throw new Error("user_watchlist 조회 실패: count 를 받지 못했습니다");
  return { items: data.map(dbToItem), total: count };
}

/** 관심 단지 개수 (한도 검사용). */
export async function countWatchlist(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((w) => w.userEmail.trim().toLowerCase() === em).length;
  }
  const { count, error } = await sb
    .from("user_watchlist")
    .select("id", { count: "exact", head: true })
    .eq("user_email", em)
    // 알림 구독(#47) 행은 관심 단지 한도에 포함하지 않는다
    .not("complex_id", "like", "alert:%");
  if (error) throw new Error(`user_watchlist 개수 조회 실패: ${error.message}`);
  /* count 가 숫자가 아니면 조회가 안 된 것이다. `?? 0` 으로 넘기면 "0개 등록"이
     되어 한도 검사가 통째로 풀린다 — 못 센 것과 0개는 다른 사실이다. */
  if (typeof count !== "number") {
    throw new Error("user_watchlist 개수 조회 실패: count 를 받지 못했습니다");
  }
  return count;
}

/* [1057 · B9] 이미 담긴 단지를 다시 담으면(단지 화면 "관심 등록" 재클릭 · 되돌리기) 알림 범위가 null 로 덮였다 —
   요청에 없는(undefined) 범위 열은 upsert 본문에서 뺀다. PostgREST 의 ON CONFLICT DO UPDATE 는 본문에 있는 열만 SET 하므로
   기존 alert_price_min/max · last_price_* · created_at 이 그대로 남는다(명시한 값만 바뀐다). */
export async function addToWatchlist(
  userEmail: string,
  complexId: string,
  complexName: string,
  alertPriceMin?: number,
  alertPriceMax?: number,
): Promise<WatchlistItem> {
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = inMemory.findIndex((w) => w.userEmail === userEmail && w.complexId === complexId);
    const prev = existing >= 0 ? inMemory[existing] : null;
    const item: WatchlistItem = {
      id: prev?.id ?? `mem-${Date.now()}`,
      userEmail,
      complexId,
      complexName,
      alertPriceMin: alertPriceMin ?? prev?.alertPriceMin ?? null,
      alertPriceMax: alertPriceMax ?? prev?.alertPriceMax ?? null,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      lastPriceKrw: prev?.lastPriceKrw ?? null,
      lastPriceBand: prev?.lastPriceBand ?? null,
    };
    if (existing >= 0) inMemory[existing] = item;
    else inMemory.unshift(item);
    return item;
  }
  const payload: Record<string, unknown> = { user_email: userEmail, complex_id: complexId, complex_name: complexName };
  if (alertPriceMin !== undefined) payload.alert_price_min = alertPriceMin;
  if (alertPriceMax !== undefined) payload.alert_price_max = alertPriceMax;
  const { data, error } = await sb
    .from("user_watchlist")
    .upsert(payload, { onConflict: "user_email,complex_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return dbToItem(data as Record<string, unknown>);
}

export async function removeFromWatchlist(userEmail: string, complexId: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const idx = inMemory.findIndex((w) => w.userEmail === userEmail && w.complexId === complexId);
    if (idx >= 0) inMemory.splice(idx, 1);
    return;
  }
  /* [1009 · H 리뷰] 오류를 확인한다 — 예전엔 결과를 버려 DB 가 실패해도 조용히 끝났고, API 는 200 을 돌려줬다.
     그래서 관심 단지 화면의 "실패하면 행을 되돌려 놓는다"가 실제로는 한 번도 돌 수 없었다. 던지면 API 가 5xx 로 답한다. */
  const { error } = await sb.from("user_watchlist").delete().eq("user_email", userEmail).eq("complex_id", complexId);
  if (error) throw new Error(`user_watchlist 삭제 실패: ${error.message}`);
}

export async function isWatching(userEmail: string, complexId: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return inMemory.some((w) => w.userEmail === userEmail && w.complexId === complexId);
  const { data, error } = await sb
    .from("user_watchlist")
    .select("id")
    .eq("user_email", userEmail)
    .eq("complex_id", complexId)
    .maybeSingle();
  /* 행이 없으면 error 없이 data=null 이다 — 그 null 만 "관심 등록 안 함"이다. */
  if (error) throw new Error(`user_watchlist 조회 실패: ${error.message}`);
  return !!data;
}

/* [1057 · B10] 실거래 알림 범위만 바꾼다 — null 은 지우기. 행이 없으면 false(관심 단지가 아니다 — 새로 담지 않는다). */
export async function setWatchlistAlertRange(
  userEmail: string,
  complexId: string,
  alertPriceMin: number | null,
  alertPriceMax: number | null,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) {
    const row = inMemory.find((w) => w.userEmail === userEmail && w.complexId === complexId);
    if (!row) return false;
    row.alertPriceMin = alertPriceMin;
    row.alertPriceMax = alertPriceMax;
    return true;
  }
  const { data, error } = await sb
    .from("user_watchlist")
    .update({ alert_price_min: alertPriceMin, alert_price_max: alertPriceMax })
    .eq("user_email", userEmail)
    .eq("complex_id", complexId)
    .select("id");
  if (error) throw new Error(`user_watchlist 알림 범위 저장 실패: ${error.message}`);
  return (data ?? []).length > 0;
}
