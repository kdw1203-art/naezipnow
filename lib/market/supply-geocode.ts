import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { geocodeAndCache } from "@/lib/map/complex-geocode";
import {
  chunk,
  pgErrorText,
  regionsByName,
  NAME_IN_CHUNK,
  REGION_IN_MAX,
} from "@/lib/map/geocode-chunk";
import { logger } from "@/lib/log";

/* [#74] 입주 예정 단지 좌표 채우기 — 기존 complex_geocode 파이프라인 재사용.
 * 수집 크론(supply-ingest) 끝에 하루 상한(기본 25건)만큼 점진 백필한다.
 * notfound 로 굳은 키는 다시 시도하지 않는다(geocodeAndCache 캐시 정책 그대로).
 *
 * [1003 · 2026-09-17] 이 함수가 매일 ETL 을 죽이고 있었다. "이미 시도한 키"를
 * 한 번의 `.in()` 로 물었는데, 실측 582개(한글 9,140자)면 GET URL 이 ~82KB 라
 * 프록시가 요청을 잘랐다. 돌아온 오류는 message 가 빈 문자열이라 로그에는
 * "complex_geocode 조회 실패: " 만 남았고, 백필은 한 건도 못 했다.
 * 이제 lib/map/geocode-chunk.ts 의 규칙대로 끊어 묻는다(계산은 그 파일 주석).
 */

export type SupplyGeocodeResult = {
  candidates: number;
  attempted: number;
  ok: number;
  notfound: number;
};

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function backfillSupplyGeocode(cap = 25): Promise<SupplyGeocodeResult> {
  const sb = getServiceSupabase();
  const empty: SupplyGeocodeResult = { candidates: 0, attempted: 0, ok: 0, notfound: 0 };
  if (!sb) return empty;

  const { data, error } = await sb
    .from("apartment_supply")
    .select("region, apt_name, address")
    .gte("move_in_ym", currentYm())
    .not("apt_name", "is", null)
    .order("move_in_ym", { ascending: true })
    .limit(600);
  if (error) throw new Error(`apartment_supply 조회 실패: ${pgErrorText(error)}`);

  // (region, name) 중복 제거
  const seen = new Set<string>();
  const rows: Array<{ region: string; name: string; address: string | null }> = [];
  for (const r of data ?? []) {
    const region = String(r.region ?? "").trim();
    const name = String(r.apt_name ?? "").trim();
    if (!region || !name) continue;
    const k = `${region}${name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ region, name, address: r.address ? String(r.address) : null });
  }
  if (rows.length === 0) return empty;

  /* 이미 시도한 키(성공·notfound 불문)는 후보에서 뺀다 — cap 은 실제 API 시도 수.
     필요한 건 "어떤 짝이 이미 있나" 하나뿐이라, 나눠 물어도 답은 같다(합집합). */
  const byName = regionsByName(rows);
  const done = new Set<string>();
  for (const namePart of chunk([...byName.keys()], NAME_IN_CHUNK)) {
    const regionPart = [...new Set(namePart.flatMap((n) => byName.get(n) ?? []))];
    let q = sb
      .from("complex_geocode")
      .select("region_name, complex_name")
      .in("complex_name", namePart);
    /* 지역은 이 조각에 실린 이름들의 것만(실측 17곳). PK(region_name,
       complex_name) 인덱스를 계속 타기 위해서다. 그래도 많으면 빼는데 결과는
       같다 — done 은 (지역+단지명) 짝으로만 맞으므로 남는 행은 아무 키와도
       걸리지 않는다. */
    if (regionPart.length <= REGION_IN_MAX) q = q.in("region_name", regionPart);
    const { data: existing, error: exErr } = await q;
    if (exErr) {
      throw new Error(`complex_geocode 조회 실패: ${pgErrorText(exErr, namePart.length)}`);
    }
    for (const r of existing ?? []) {
      done.add(`${r.region_name}${r.complex_name}`);
    }
  }
  const todo = rows.filter((r) => !done.has(`${r.region}${r.name}`));

  const result: SupplyGeocodeResult = {
    candidates: todo.length,
    attempted: 0,
    ok: 0,
    notfound: 0,
  };
  for (const r of todo.slice(0, cap)) {
    result.attempted += 1;
    try {
      const coord = await geocodeAndCache(
        r.region,
        r.name,
        r.address ? r.address : undefined,
      );
      if (coord) result.ok += 1;
      else result.notfound += 1;
    } catch (e) {
      logger.warn(`[supply-geocode] ${r.region} ${r.name} 실패`, e);
      result.notfound += 1;
    }
  }
  return result;
}
