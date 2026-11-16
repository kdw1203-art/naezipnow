import "server-only";
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isNaverMapsRestConfigured, naverGeocode, naverReverseGeocode } from "@/lib/map/naver-maps-rest";
import { uniqueShapeCenter, type ZoneShapeFile } from "./zone-shapes";
import { NATIONAL_DATASET_URL } from "./national";
import { SEOUL_SMALL_SERVICE, SEOUL_SMALL_SOURCE, SEOUL_SMALL_URL, parseSeoulSmall, seoulGu, seoulSmallQuery, seoulSmallStage, seoulSmallType } from "./seoul-small";
import { fetchSeoulOpenApi, isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import { SPECIAL_ZONES, complexCentroid, pickPlace, specialAddress } from "./special-zones";
import { kakaoLocalKeywordSearch } from "@/lib/kakao/rest-client";
import { BUSAN_REDEV_URL, findBusanItems, findBusanTotal, parseBusanItem, type BusanZone } from "./busan";
import {
  LOCATE_SOURCE,
  complexRegionKey,
  dongCandidates,
  hitIsDong,
  firstLot,
  hitInSigungu,
  locateSummary,
  locateSummaryBy,
  lotQuery,
  mapSigungu,
  nationalStageKey,
  nationalTypeKey,
  pickComplexPoint,
  pickUpisLot,
  sameZoneKey,
  shortSido,
  zoneNameKey,
  type ComplexPoint,
  type UpisPlace,
} from "./zone-locate";

/* [1152] 서울 정비구역에 대표 지번 좌표를 붙여 redevelopment_projects(지도가 읽는 표)에 싣는다.
   이미 실린 구역은 좌표를 다시 묻지 않고 단계 · 세대수만 새로 적는다. 못 찾은 구역은 싣지 않는다(다음 실행이 다시 묻는다).
   손으로 정리한 40곳(seed-*)과 같은 구역은 건너뛴다 — 한 구역에 점 두 개가 찍히지 않게. */

const SIDO = "서울특별시";
const ID_PREFIX = "nat-";

export type ZoneLocateResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  zones: number;
  kept: number;
  located: number;
  notFound: number;
  noAddress: number;
  duplicate: number;
  offMap: number;
  /** [1154] 같은 이름 단지 좌표로 찍은 수 */
  byComplex: number;
  /** [1166] 구역 경계 도형의 중심으로 찍은 수 */
  byShape: number;
  /** [1183] 부산 정비사업 정보에서 읽은 구역 수(0 = 키 없음 · 활용신청 전 · 조회 실패) */
  busanRows: number;
  /** [1188] 부산 자료가 0건일 때의 사유 한 줄(HTTP · 응답 머리) — 키는 싣지 않는다 */
  busanNote?: string;
  /** [1191] 1기 신도시 선도지구 · 후보 · 도심복합 — 찍은 수 / 못 찍은 이름 */
  special?: number;
  specialMissed?: string[];
  /** [1191] 법정동 중심 근사 위치로 찍은 수 */
  byDong?: number;
  /** [1191] 서울 소규모정비(가로주택 · 모아 · 소규모) — 받은 수 / 찍은 수 / 사유 */
  smallRows?: number;
  smallLocated?: number;
  smallNote?: string;
  budgetExhausted: boolean;
};

type ZoneRow = { id: string; sido: string; sigungu: string; name: string; stage: string | null; project_type: string | null; operator: string | null; households: number | null };
type ProjRow = { id: string; name: string; sido: string; sigungu: string; lat: number; lng: number; address: string | null };

export function locateId(zoneId: string): string {
  return `${ID_PREFIX}${createHash("sha1").update(zoneId).digest("hex").slice(0, 14)}`;
}

async function geocodeLot(query: string, sigungu: string): Promise<{ lat: number; lng: number } | null> {
  const hits = await naverGeocode(query, 3, { fresh: true });
  const hit = hits.find((h) => hitInSigungu(h.jibunAddress ?? h.address, sigungu) || hitInSigungu(h.address, sigungu));
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

export async function locateSeoulZones(opts: { budgetMs?: number } = {}): Promise<ZoneLocateResult> {
  const empty = { zones: 0, kept: 0, located: 0, notFound: 0, noAddress: 0, duplicate: 0, offMap: 0, byComplex: 0, byShape: 0, busanRows: 0, budgetExhausted: false };
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정", ...empty };
  if (!isNaverMapsRestConfigured()) return { ok: false, skipped: true, reason: "지오코딩 키 미설정", ...empty };
  const deadline = Date.now() + (opts.budgetMs ?? 90_000);

  /* [1183] 전국 — 서울은 조서 · 경계 도형까지, 그 밖은 이름 속 지번 · 같은 이름 단지 하나로만(위치를 지어내지 않는다) */
  const zones: ZoneRow[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await sb.from("redev_national_zones").select("id,sido,sigungu,name,stage,project_type,operator,households").order("id").range(from, from + 999);
    if (error) throw new Error(`redev_national_zones 조회 실패: ${error.message}`);
    zones.push(...((data ?? []) as ZoneRow[]));
    if ((data ?? []).length < 1000) break;
  }

  const upis: UpisPlace[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await sb.from("seoul_upis_records").select("rgn_nm,pstn_nm,sigungu,code_date").eq("service", "upisRebuild").order("rpt_mng_cd").range(from, from + 999);
    if (error) throw new Error(`seoul_upis_records 조회 실패: ${error.message}`);
    const rows = (data ?? []) as { rgn_nm: string | null; pstn_nm: string | null; sigungu: string | null; code_date: string | null }[];
    for (const r of rows) if (r.rgn_nm) upis.push({ name: r.rgn_nm, place: r.pstn_nm, sigungu: r.sigungu, date: r.code_date });
    if (rows.length < 1000) break;
  }

  const { data: pData, error: pErr } = await sb.from("redevelopment_projects").select("id,name,sido,sigungu,lat,lng,address").limit(5000);
  if (pErr) throw new Error(`redevelopment_projects 조회 실패: ${pErr.message}`);
  const projects = (pData ?? []) as ProjRow[];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const curated = projects.filter((p) => !p.id.startsWith(ID_PREFIX));

  /* [1154] 단지 좌표(실거래 주소로 지오코딩해 둔 값) — 자치구별. 못 읽어도 지번 경로는 그대로 간다 */
  const complexByGu = new Map<string, ComplexPoint[]>();
  for (let from = 0; from < 60_000; from += 1000) {
    const { data, error } = await sb.from("complex_geocode").select("region_name,complex_name,lat,lng").eq("status", "ok").order("region_name").order("complex_name").range(from, from + 999);
    if (error) break;
    const rows = (data ?? []) as { region_name: string; complex_name: string; lat: number | null; lng: number | null }[];
    for (const c of rows) {
      if (c.lat == null || c.lng == null) continue;
      /* 열쇠 = 지역 이름에서 공백을 뺀 것("부산 금정구" → "부산금정구" · "고양 덕양구" → "고양덕양구" · "서울 강남구" → "서울강남구") */
      const key = c.region_name.replace(/\s/g, "");
      const list = complexByGu.get(key);
      if (list) list.push({ name: c.complex_name, lat: c.lat, lng: c.lng });
      else complexByGu.set(key, [{ name: c.complex_name, lat: c.lat, lng: c.lng }]);
    }
    if (rows.length < 1000) break;
  }

  /* [1183] 부산 정비사업 정보 — 구역 이름 → 대표 지번. 키가 없거나 활용신청 전이면 0건(부산은 이름 · 단지 경로만) */
  const busanLoad = await loadBusanZones().catch(() => ({ zones: [] as BusanZone[], note: "조회 오류" }));
  const busan = busanLoad.zones;

  /* [1166] 구역 경계 도형(서울시 의제처리구역 위치정보) — 서버 묶음에 싣는다. 못 읽으면 도형 경로만 쉰다 */
  let shapes: ZoneShapeFile["zones"] | null = null;
  try {
    shapes = ((await import("@/public/data/seoul-zone-shapes.json")).default as unknown as ZoneShapeFile).zones;
  } catch {
    shapes = null;
  }
  const dongTodo: { id: string; base: Record<string, unknown>; sido: string; sigungu: string; guLabel: string; cands: string[] }[] = [];
  const shapeTodo: { id: string; base: Record<string, unknown>; lat: number; lng: number; sigungu: string }[] = [];

  const r: ZoneLocateResult = { ok: true, ...empty, zones: zones.length, busanRows: busan.length, ...(busan.length === 0 && busanLoad.note ? { busanNote: busanLoad.note } : {}) };
  const now = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  const todo: { z: ZoneRow; id: string; query: string; address: string; typeKey: string; stageKey: string }[] = [];

  for (const z of zones) {
    const typeKey = nationalTypeKey(z.project_type);
    const stageKey = nationalStageKey(z.stage);
    if (!typeKey || !stageKey) { r.offMap += 1; continue; }
    const key = zoneNameKey(z.name);
    const seoul = z.sido === SIDO;
    const guLabel = mapSigungu(z.sido, z.sigungu);
    if (curated.some((p) => p.sido === shortSido(z.sido) && p.sigungu === guLabel && sameZoneKey(key, zoneNameKey(p.name)))) { r.duplicate += 1; continue; }
    const id = locateId(z.id);
    const base = { id, name: z.name, type_key: typeKey, stage_key: stageKey, sido: shortSido(z.sido), sigungu: guLabel, households: z.households, summary: locateSummary(z), source: LOCATE_SOURCE, source_url: NATIONAL_DATASET_URL, is_sample: false, updated_at: now };
    const have = byId.get(id);
    if (have) { out.push({ ...base, address: have.address, lat: have.lat, lng: have.lng }); r.kept += 1; continue; }
    /* 서울 밖은 이름 속 숫자가 구역 번호인 경우가 많다("산성동2" = 2구역) — "번지"가 적혀 있거나 세 자리 이상 · 부번이 있는 지번만 믿는다 */
    const nameLot = firstLot(z.name);
    const nameLotOk = nameLot && (seoul || /번지/.test(z.name) || /\d{3}|-/.test(nameLot.lot)) ? nameLot : null;
    const busanLot = z.sido === "부산광역시" ? pickBusanLot(z.name, busan) : null;
    const lot = (seoul ? pickUpisLot(z, upis) : null) ?? busanLot ?? nameLotOk;
    if (!lot) {
      const cx = pickComplexPoint(z.name, complexByGu.get(complexRegionKey(z.sido, z.sigungu)) ?? []);
      if (!cx) {
        /* [1166] 지번도 단지도 없으면 구역 경계 도형(이름이 꼭 같은 것 하나)의 중심 — 자치구는 아래에서 역지오코딩으로 확인 */
        const sc = seoul && shapes ? uniqueShapeCenter(z.name, shapes) : null;
        if (sc) { shapeTodo.push({ id, base: { ...base, summary: locateSummaryBy(z, "shape"), address: `${guLabel} ${z.name} 구역 중심` }, lat: sc.lat, lng: sc.lng, sigungu: z.sigungu }); continue; }
        /* [1191] 이름 앞 동 이름 → 법정동 중심(근사 위치) — 아래에서 지오코딩 · 그 구 · 그 동일 때만 */
        const cands = dongCandidates(z.name, z.sigungu);
        if (cands.length) { dongTodo.push({ id, base: { ...base, summary: locateSummaryBy(z, "dong") }, sido: z.sido, sigungu: z.sigungu, guLabel, cands }); continue; }
        r.noAddress += 1;
        continue;
      }
      out.push({ ...base, summary: locateSummaryBy(z, "complex"), address: `${guLabel} ${cx.name}`, lat: cx.lat, lng: cx.lng });
      r.byComplex += 1;
      continue;
    }
    todo.push({ z, id, query: lotQuery(z.sido, z.sigungu, lot), address: `${guLabel} ${lot.dong} ${lot.lot} 일대`, typeKey, stageKey });
    out.push({ ...base, address: `${guLabel} ${lot.dong} ${lot.lot} 일대`, lat: null, lng: null });
  }

  /* 지오코딩 — 4개씩 나란히, 예산이 다하면 멈춘다(남은 구역은 다음 실행) */
  const pending = new Map(todo.map((t) => [t.id, t]));
  const coords = new Map<string, { lat: number; lng: number }>();
  const queue = [...todo];
  const worker = async () => {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      if (Date.now() > deadline) { r.budgetExhausted = true; return; }
      const hit = await geocodeLot(t.query, t.z.sigungu);
      pending.delete(t.id);
      if (hit) { coords.set(t.id, hit); r.located += 1; } else r.notFound += 1;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  /* [1166] 도형 중심 — 그 좌표가 정말 그 자치구인지 확인된 것만 싣는다 */
  for (const t of shapeTodo) {
    if (Date.now() > deadline) { r.budgetExhausted = true; break; }
    try {
      const rev = await naverReverseGeocode(t.lat, t.lng);
      if (rev && hitInSigungu(rev.address, t.sigungu)) {
        out.push({ ...t.base, lat: t.lat, lng: t.lng });
        r.byShape += 1;
      } else r.notFound += 1;
    } catch {
      r.notFound += 1;
    }
  }

  /* [1191] 1기 신도시 선도지구 · 2차 후보 · 도심복합 — 단지 좌표 평균 또는 이름이 맞는 장소(그 자치구 안)만. 못 찾으면 싣지 않는다 */
  r.special = 0;
  r.specialMissed = [];
  for (const z of SPECIAL_ZONES) {
    const list = complexByGu.get(z.regionKey) ?? [];
    const base = { id: z.id, name: z.name, type_key: z.typeKey, stage_key: z.stageKey, sido: z.sido, sigungu: z.sigungu, households: z.households, summary: z.summary, source: z.source, source_url: z.sourceUrl, is_sample: false, updated_at: now };
    if (z.complexes) {
      const c = complexCentroid(z.complexes, list);
      if (c) { out.push({ ...base, address: specialAddress(z, { matched: c.matched }), lat: c.lat, lng: c.lng }); r.special += 1; }
      else r.specialMissed.push(z.name);
      continue;
    }
    if (z.lot) {
      const have = byId.get(z.id);
      if (have) { out.push({ ...base, address: have.address, lat: have.lat, lng: have.lng }); r.special += 1; continue; }
      if (Date.now() > deadline) { r.specialMissed.push(z.name); continue; }
      const hit = await geocodeLot(z.lot, z.sigungu).catch(() => null);
      if (hit) { out.push({ ...base, address: specialAddress(z, {}), lat: hit.lat, lng: hit.lng }); r.special += 1; }
      else r.specialMissed.push(z.name);
      continue;
    }
    if (z.place) {
      const have = byId.get(z.id);
      if (have) { out.push({ ...base, address: have.address, lat: have.lat, lng: have.lng }); r.special += 1; continue; }
      if (Date.now() > deadline || list.length === 0) { r.specialMissed.push(z.name); continue; }
      const cLat = list.reduce((a, b) => a + b.lat, 0) / list.length;
      const cLng = list.reduce((a, b) => a + b.lng, 0) / list.length;
      const res = await kakaoLocalKeywordSearch({ query: z.place.query, lat: cLat, lng: cLng, radiusM: 20_000, size: 15 }).catch(() => ({ items: [] }));
      const hit = pickPlace(res.items, z.place.mustContain, (a) => hitInSigungu(a, z.sigungu));
      if (hit) { out.push({ ...base, address: specialAddress(z, { placeName: z.place.note ?? hit.name }), lat: hit.lat, lng: hit.lng }); r.special += 1; }
      else r.specialMissed.push(z.name);
    }
  }

  /* [1191] 법정동 중심 근사 위치 — 같은 동에 여럿이면 원 위에 조금씩 벌려 겹치지 않게(근사 위치라고 적는다) */
  r.byDong = 0;
  const dongSeen = new Map<string, number>();
  const dongQueue = [...dongTodo];
  const dongWorker = async () => {
    for (;;) {
      const t = dongQueue.shift();
      if (!t) return;
      if (Date.now() > deadline) { r.budgetExhausted = true; r.noAddress += 1; continue; }
      let placed = false;
      for (const dong of t.cands) {
        const hits = await naverGeocode(`${t.sido} ${t.sigungu} ${dong}`, 3, { fresh: true }).catch(() => []);
        const hit = hits.find((h) => (hitInSigungu(h.jibunAddress ?? h.address, t.sigungu) || hitInSigungu(h.address, t.sigungu)) && (hitIsDong(h.jibunAddress, dong) || hitIsDong(h.address, dong)));
        if (!hit) continue;
        const k = `${t.sigungu}|${dong}`;
        const n = dongSeen.get(k) ?? 0;
        dongSeen.set(k, n + 1);
        const ang = n * 2.399963;
        const rad = n === 0 ? 0 : 0.0004 * Math.sqrt(n);
        out.push({ ...t.base, address: `${t.guLabel} ${dong} 중심(근사 위치)`, lat: hit.lat + rad * Math.sin(ang), lng: hit.lng + rad * Math.cos(ang) });
        r.byDong = (r.byDong ?? 0) + 1;
        placed = true;
        break;
      }
      if (!placed) r.noAddress += 1;
    }
  };
  await Promise.all([dongWorker(), dongWorker(), dongWorker(), dongWorker()]);

  /* [1191] 서울 소규모정비(가로주택 · 모아타운 · 소규모재건축 등) — 사업위치 지오코딩 · 그 구 안일 때만 */
  r.smallRows = 0;
  r.smallLocated = 0;
  if (isSeoulApiConfigured()) {
    try {
      const small: ReturnType<typeof parseSeoulSmall>[] = [];
      for (let start = 1; start <= 5000; start += 1000) {
        const page = await fetchSeoulOpenApi(SEOUL_SMALL_SERVICE, start, start + 999, [], "json", { timeoutMs: 20_000 });
        small.push(...page.rows.map(parseSeoulSmall));
        if (page.rows.length < 1000) break;
      }
      const list = small.filter((x): x is NonNullable<typeof x> => x !== null);
      r.smallRows = list.length;
      if (list.length === 0) r.smallNote = "0건";
      const sq = [...list];
      const smallWorker = async () => {
        for (;;) {
          const x = sq.shift();
          if (!x) return;
          const gu = seoulGu(x.gu, x.addr);
          if (!gu) continue;
          const id = `ss-${createHash("sha1").update(x.seq).digest("hex").slice(0, 14)}`;
          const base = { id, name: x.name, type_key: seoulSmallType(x.kind), stage_key: seoulSmallStage(x.stage), sido: "서울", sigungu: gu, households: x.households, summary: [x.kind, x.stage ? `추진 ${x.stage}` : null, "위치는 사업위치 기준 · 구역 경계 아님"].filter(Boolean).join(" · "), source: SEOUL_SMALL_SOURCE, source_url: SEOUL_SMALL_URL, is_sample: false, updated_at: now };
          const have = byId.get(id);
          if (have) { out.push({ ...base, address: have.address, lat: have.lat, lng: have.lng }); r.smallLocated = (r.smallLocated ?? 0) + 1; continue; }
          if (Date.now() > deadline) { r.budgetExhausted = true; continue; }
          const hit = await geocodeLot(seoulSmallQuery(x.addr, gu), gu).catch(() => null);
          if (hit) { out.push({ ...base, address: `${gu} ${x.addr}`.slice(0, 120), lat: hit.lat, lng: hit.lng }); r.smallLocated = (r.smallLocated ?? 0) + 1; }
        }
      };
      await Promise.all([smallWorker(), smallWorker(), smallWorker(), smallWorker()]);
    } catch (e) {
      r.smallNote = e instanceof Error ? e.message.replace(/[A-Za-z0-9]{20,}/g, "***").slice(0, 80) : "조회 오류";
    }
  } else r.smallNote = "키 미설정";

  const rows = out
    .map((o) => (o.lat === null ? (coords.has(String(o.id)) ? { ...o, ...coords.get(String(o.id)) } : null) : o))
    .filter((o): o is Record<string, unknown> => o !== null);
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await sb.from("redevelopment_projects").upsert(rows.slice(i, i + 300), { onConflict: "id" });
    if (error) throw new Error(`redevelopment_projects 저장 실패: ${error.message}`);
  }
  return r;
}

/** [1183] 부산 정비사업 정보 전 건 — 100건씩 최대 10쪽. 실패는 빈 목록(다른 경로는 그대로 간다) */
async function loadBusanZones(): Promise<{ zones: BusanZone[]; note: string | null }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!key) return { zones: [], note: "키 미설정" };
  const out: BusanZone[] = [];
  let note: string | null = null;
  for (let page = 1; page <= 10; page++) {
    const url = new URL(BUSAN_REDEV_URL);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", "100");
    url.searchParams.set("resultType", "json");
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      note = `HTTP ${res.status}`;
      break;
    }
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 활용신청 전이면 공공데이터포털이 XML 오류문을 준다 — 꼬리표를 뗀 앞 80자만 사유로(키는 응답에 없다) */
      note = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "빈 응답";
      break;
    }
    const items = findBusanItems(json);
    for (const it of items) {
      const z = parseBusanItem(it);
      if (z) out.push(z);
    }
    if (items.length === 0 && page === 1) note = JSON.stringify(json).slice(0, 80);
    const total = findBusanTotal(json);
    if (items.length < 100 || (total != null && out.length >= total)) break;
  }
  /* 사유 글에 키가 섞여 나오는 일이 없게 — 혹시 있으면 지운다 */
  return { zones: out, note: note ? note.split(key).join("***").split(encodeURIComponent(key)).join("***") : null };
}

/** 같은 이름(꼭 같은 것 하나)의 부산 구역 지번 — 둘 이상이면 고르지 않는다. 자치구는 지오코딩 답으로 확인한다(hitInSigungu) */
function pickBusanLot(name: string, rows: readonly BusanZone[]): { dong: string; lot: string } | null {
  const key = zoneNameKey(name);
  if (key.length < 2) return null;
  const hits = rows.filter((b) => zoneNameKey(b.name) === key && firstLot(b.location));
  return hits.length === 1 ? firstLot(hits[0].location) : null;
}
