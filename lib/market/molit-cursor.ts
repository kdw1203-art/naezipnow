/**
 * [1024] 크론 진행 커서 — `public_data_cache` 재사용(새 표 금지).
 *
 * 이력 백필·비아파트 수집은 "적재된 행 자체가 커서"(빈 (구, 월)만 채운다)지만, 어느 달부터 빈 곳을
 * 찾을지까지 매번 2021년부터 세면 HEAD 카운트가 실행마다 수천 회가 된다. 그래서 **어느 달을 보고 있나**만
 * 작게 적어 둔다. 잃어버려도(행 삭제·만료) 시작 월부터 다시 세면 그만이다 — 이중 계상은 없다.
 *
 * expires_at 은 NOT NULL([1007]) — 만료를 의미하지 않으므로 넉넉히(2년) 둔다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

const SOURCE = "molit-cursor";
const CURSOR_TTL_MS = 2 * 365 * 24 * 3_600_000;

export async function readCursor<T extends object>(cacheKey: string): Promise<T | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("public_data_cache")
      .select("payload")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error) {
      logger.warn(`[molit-cursor] ${cacheKey} 읽기 실패 — 시작점부터`, error.message);
      return null;
    }
    const payload = data?.payload;
    return payload && typeof payload === "object" ? (payload as T) : null;
  } catch (e) {
    logger.warn(`[molit-cursor] ${cacheKey} 읽기 실패 — 시작점부터`, e);
    return null;
  }
}

/** 쓰기 실패는 경고만 — 커서를 못 남겨도 적재 결과는 사실이다(다음 실행이 조금 더 센다). */
export async function writeCursor(cacheKey: string, value: object): Promise<boolean> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return false;
    const now = Date.now();
    const { error } = await sb.from("public_data_cache").upsert(
      {
        source: SOURCE,
        cache_key: cacheKey,
        payload: value as never,
        fetched_at: new Date(now).toISOString(),
        expires_at: new Date(now + CURSOR_TTL_MS).toISOString(),
      },
      { onConflict: "cache_key" },
    );
    if (error) {
      logger.warn(`[molit-cursor] ${cacheKey} 저장 실패`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn(`[molit-cursor] ${cacheKey} 저장 실패`, e);
    return false;
  }
}
