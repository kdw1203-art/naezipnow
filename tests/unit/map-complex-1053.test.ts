import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { settle, startDeadline } from "../../lib/data/section-budget.ts";

/* [1053] 지도·검색·단지 상세 묶음.
 *  ① /map 넓게 볼 때(클러스터) 상세 필터가 숫자에 안 걸린다는 사실을 말하는 고지(누르면 한 칸 확대)
 *  ② /map 인기·분포·매물 요청도 클러스터와 같은 격자로 스냅(CDN 캐시 재사용) · 분포는 디바운스 + 패널 닫힘이면 조회 안 함
 *  ③ /map 줌 버튼 등 폰 40px
 *  ④ /search 지우기 ✕·조건/좁히기/정렬 칩 40px · 굳은 검색어를 주소에(replaceState)
 *  ⑤ 실거래만 있는 자리의 "시세" 낱말
 *  ⑥ 단지 상세 — 실거래 조회 실패 화면을 7일 ISR 캐시에 얼리지 않는다 · 메타데이터 실거래에도 8초 예산
 * .tsx 는 테스트 로더가 못 불러오므로 소스 문자열로 잠그고, 순수 함수는 소스에서 떼어 타입만 벗겨 실행한다. */

const read = (p: string) => readFileSync(p, "utf8");
const mapClient = read("app/map/map-client.tsx");
const search = read("app/search/search-client.tsx");
const priceTab = read("app/complex/[id]/PriceTab.tsx");
const complexPage = read("app/complex/[id]/page.tsx");

/** map-client.tsx 안의 module-level 함수 하나를 떼어 실행 가능한 JS 로 */
function extractFn<T>(src: string, name: string): T {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} 가 없다`);
  const end = src.indexOf("\n}\n", start);
  assert.ok(end > start, `${name} 끝을 못 찾았다`);
  const js = stripTypeScriptTypes(src.slice(start, end + 2));
  return new Function(`${js}\nreturn ${name};`)() as T;
}

/** 소스에서 `const <name> = useCallback(` 부터 다음 `\n  );\n` 까지 */
function callbackBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = useCallback(`);
  assert.ok(start >= 0, `${name} 가 없다`);
  const end = src.indexOf("\n  );\n", start);
  assert.ok(end > start);
  return src.slice(start, end);
}

type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };
type Snapped = { swLat: string; swLng: string; neLat: string; neLng: string };
const snap = extractFn<(b: Bounds, z: number) => Snapped>(mapClient, "snapViewportBounds");

test("② 스냅 격자 — 원래 화면을 항상 포함 · 줌별 눈금(15↑ 0.01 · 12↑ 0.05 · 그 아래 0.2) · 소수 4자리 문자열", () => {
  const b: Bounds = { swLat: 37.51234567, swLng: 127.01987654, neLat: 37.53456789, neLng: 127.06543219 };
  for (const [z, step] of [[16, 0.01], [15, 0.01], [14, 0.05], [12, 0.05], [11, 0.2], [8, 0.2]] as const) {
    const s = snap(b, z);
    assert.ok(Number(s.swLat) <= b.swLat && Number(s.neLat) >= b.neLat, `z${z} 위도 포함`);
    assert.ok(Number(s.swLng) <= b.swLng && Number(s.neLng) >= b.neLng, `z${z} 경도 포함`);
    for (const v of Object.values(s)) {
      assert.match(v, /^-?\d+\.\d{4}$/, "소수 4자리 — URL 이 픽셀 단위로 흔들리지 않는다");
      const k = Number(v) / step;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `z${z} 값 ${v} 가 ${step} 눈금 위`);
    }
  }
});

test("② 스냅 격자 — 같은 칸 안의 작은 팬은 같은 URL(캐시 재사용) · 칸을 넘으면 달라진다", () => {
  const a = snap({ swLat: 37.5112, swLng: 127.0213, neLat: 37.5288, neLng: 127.0391 }, 15);
  const b = snap({ swLat: 37.5131, swLng: 127.0222, neLat: 37.5295, neLng: 127.0398 }, 15);
  assert.deepEqual(a, b);
  const c = snap({ swLat: 37.5212, swLng: 127.0213, neLat: 37.5388, neLng: 127.0391 }, 15);
  assert.notDeepEqual(a, c);
});

test("② 클러스터·인기·분포·매물 요청이 같은 스냅 함수를 쓴다(원시 bounds 를 URL 에 싣지 않는다)", () => {
  const cluster = callbackBody(mapClient, "scheduleClusterFetch");
  assert.ok(cluster.includes("snapViewportBounds(bounds, mapZoom)"));
  assert.ok(!cluster.includes("snapStep"), "격자 계산은 한 군데");
  /* 파라미터 순서가 예전과 같아야 기존 CDN 캐시 키가 그대로다 */
  assert.match(cluster, /minLat: snapped\.swLat,\s*maxLat: snapped\.neLat,\s*minLng: snapped\.swLng,\s*maxLng: snapped\.neLng,\s*zoom: String\(mapZoom\)/);

  const listings = callbackBody(mapClient, "fetchListings");
  assert.ok(listings.includes("snapViewportBounds(bounds, mapZoom)"));
  assert.ok(!listings.includes("String(bounds."), "매물 요청에 원시 bounds");
  assert.ok(mapClient.includes("if (showListingsRef.current) fetchListings(bounds, info.zoom);"));
  assert.ok(!mapClient.includes("lastBoundsRef"), "마지막 뷰포트는 lastIdleRef(줌 포함) 하나");

  const facets = callbackBody(mapClient, "fetchFacets");
  assert.ok(facets.includes("snapViewportBounds(bounds, mapZoom)"));
  assert.ok(!facets.includes("String(bounds."), "분포 요청에 원시 bounds");

  const popular = callbackBody(mapClient, "schedulePopularFetch");
  assert.ok(popular.includes("snapViewportBounds(bounds, mapZoom)"));
  assert.ok(popular.includes("load(true)"), "먼저 격자 범위로 묻는다");
  /* 격자는 화면보다 넓다 — 화면 안만 남기고 10개로 자른다. 순위 밖에 화면 안 단지가 더 있을 수 있으면 원시 범위로 한 번 더 */
  assert.ok(popular.includes("it.lat >= bounds.swLat"));
  assert.ok(popular.includes("inView.slice(0, POPULAR_LIMIT)"));
  assert.ok(popular.includes("inView.length < POPULAR_LIMIT && all.length >= POPULAR_SNAPPED_FETCH_LIMIT"));
  assert.ok(popular.includes("return load(false);"));
  assert.ok(mapClient.includes("const POPULAR_SNAPPED_FETCH_LIMIT = 30;"), "서버 상한(MAX_LIMIT 30)과 같게");
  assert.match(read("app/api/map/popular/route.ts"), /const MAX_LIMIT = 30;/);
});

test("② 분포 — 디바운스 · 패널이 닫혀 있으면 조회하지 않고 낡음 표시 · 열면 마지막 뷰포트로 즉시 · 실패 문구", () => {
  const facets = callbackBody(mapClient, "fetchFacets");
  assert.ok(mapClient.includes("const FACETS_FETCH_DEBOUNCE_MS = 400;"));
  assert.ok(facets.includes("window.setTimeout(run, FACETS_FETCH_DEBOUNCE_MS)"));
  assert.match(facets, /if \(!filtersExpandedRef\.current\) \{\s*facetsStaleRef\.current = true;\s*return;\s*\}/);
  assert.ok(mapClient.includes("filtersExpandedRef.current = filtersExpanded;"));
  /* 패널 effect — 열릴 때 낡았으면 즉시 */
  assert.match(
    mapClient,
    /if \(!facetsStaleRef\.current\) return;\s*const last = lastIdleRef\.current;\s*fetchFacets\(last\?\.bounds \?\? null, last\?\.zoom \?\? 0, true\);\s*\}, \[filtersExpanded, fetchFacets\]\);/,
  );
  /* 첫 진입 effect 는 분포를 직접 부르지 않는다(패널 effect 가 맡는다) */
  assert.ok(!/schedulePopularFetch\(null, 0\);\s*fetchFacets\(null, 0\);/.test(mapClient));
  assert.ok(mapClient.includes("분포 불러오기 실패 · 잠시 후 다시"));
});

test("① 클러스터 모드 + 범위 필터 → '넓게 볼 때 필터 미적용' 고지 · 알약 전체가 한 칸 확대 버튼(폰 40px)", () => {
  const at = mapClient.indexOf('key: "range-cluster"');
  assert.ok(at > 0);
  const block = mapClient.slice(mapClient.lastIndexOf("if (", at), at + 300);
  assert.ok(block.includes('(rangeActive || cxOn) && txType !== "rent" && ((clusterMode === "clusters" && clusters.length > 0) || regionBubblesShown)'));
  /* 시·군·구/동 축척의 지역 평균 말풍선도 필터와 무관 — 같은 고지(1053 로컬 실측: "10억 이하"인데 29억 구 평균) */
  assert.ok(mapClient.includes('const regionBubblesShown = zoom !== "danji" && regionMarketMarkers.length > 0;'));
  assert.ok(block.includes('text: "넓게 볼 때 필터 미적용 · 확대하면 적용"'));
  assert.ok(block.includes("onTap: () => setLevel((v) => stepLevel(v, -1))"), "＋ 버튼과 같은 한 칸 확대");
  /* 그리는 쪽 — 버튼 + 40px(폰) · 고지 열은 pointer-events-none 이라 이 줄만 살린다 */
  assert.ok(mapClient.includes("n.onTap ? ("));
  assert.match(mapClient, /onClick=\{n\.onTap\}[\s\S]{0,200}className="min-h-\[40px\][^"]*md:min-h-6/);
  assert.ok(mapClient.includes('<div key={n.key} role="status" className="pointer-events-auto max-w-full">'));
  /* 클러스터 라우트는 정말 필터를 받지 않는다(받게 되면 이 고지를 걷어야 한다) */
  const route = read("app/api/map/clusters/route.ts");
  assert.ok(!/priceMin|areaMin|yearMin|hhMin/.test(route), "clusters API 가 범위 필터를 받기 시작했다 — 고지 재검토");
});

test("③ 지도 조작 폰 40px — 줌 ＋/－ · 매물 고지 버튼 · 거리 재기 패널 · 초기화 글자 버튼", () => {
  assert.ok(!mapClient.includes("h-[34px] w-[34px]"), "줌 버튼 34px 잔존");
  assert.equal(mapClient.split('className="glass flex h-[40px] w-[40px] items-center justify-center rounded-lg t-body text-text-1"').length - 1, 2);
  /* 줌 열이 86px 로 길어져 매물 등록 버튼을 232 로 올렸다(134+86=220 에 붙지 않게) */
  assert.ok(mapClient.includes('style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 232px)" }}'));
  assert.ok(!mapClient.includes('"calc(env(safe-area-inset-bottom, 0px) + 220px)"'));
  assert.ok(mapClient.includes("max-h-[calc(212px_-_var(--nz-map-bottom-lane))]"), "범례 상한은 그대로(겹침 쪽으로 안 움직인다)");
  const buttonClassFor = (label: string): string => {
    const m = new RegExp(`>\\s*\\n\\s*${label}\\s*\\n\\s*</(?:button|Link)>`).exec(mapClient);
    assert.ok(m, `${label} 버튼이 없다`);
    return mapClient.slice(mapClient.lastIndexOf("className=", m.index), m.index);
  };
  for (const label of [
    "중심 삭제", "화면 중앙으로", "수정", "삭제", "되돌리기", "전체 삭제", "거리 복사", "차량 길찾기",
    "도보 길찾기", "시작점 수정", "끝내기", "필터 초기화", "매물 등록하기", "초기화", "중심 해제",
  ]) {
    const cls = buttonClassFor(label);
    assert.ok(cls.includes("min-h-[40px]") && cls.includes("md:min-h-6"), `${label} 40px`);
  }
  assert.ok(!/className="(?:[^"]*\s)?min-h-10 md:min-h-6/.test(mapClient), "min-h-10 은 globals.css 가 40px 로 고정 — md: 가 안 먹는다");
});

test("④ 검색 — 지우기 ✕ 40px(t-* 글자) · 조건 더하기/좁히기/정렬 칩 폰 40px", () => {
  const clear = search.slice(search.indexOf('aria-label="검색어 지우기"') - 300, search.indexOf('aria-label="검색어 지우기"'));
  assert.ok(clear.includes("h-[40px] w-[40px]"));
  assert.ok(!clear.includes("text-[13px]"), "글자 크기는 t-* 만");
  assert.ok(!search.includes("group inline-flex h-[36px]"), "36px 칩 잔존");
  assert.equal(search.split("group inline-flex h-[40px] shrink-0 items-center whitespace-nowrap md:h-9").length - 1, 3);
});

test("④ 검색 — 굳은 검색어(settledQuery)를 replaceState 로 주소에 · 마운트 프리필은 건드리지 않는다", () => {
  const at = search.indexOf("if (!editedRef.current) return;");
  assert.ok(at > 0, "사용자가 손댄 검색어만");
  const eff = search.slice(at, search.indexOf("}, [settledQuery]);", at));
  assert.ok(eff.includes('if ((sp.get("q") ?? "").trim() === settledQuery) return;'), "같은 값이면 쓰지 않는다");
  assert.ok(eff.includes('sp.set("q", settledQuery)') && eff.includes('sp.delete("q")'));
  assert.ok(eff.includes("window.history.replaceState(null, \"\", qs ? `/search?${qs}` : \"/search\")"));
  assert.ok(!eff.includes("pushState") && !eff.includes("router."), "기록을 쌓지 않는다");
  /* 사용자 입력 경로는 전부 editQ — 마운트 프리필(?q=)만 setQ */
  assert.ok(search.includes("onChange={(e) => editQ(e.target.value)}"));
  assert.ok(search.includes('onClick={() => editQ("")}'));
  assert.ok(search.includes("onAccept={() => editQ(q + ghost)}"));
  assert.ok(search.includes("        setQ(initial);"), "프리필은 표시 없이");
  assert.equal((search.match(/\bsetQ\(/g) ?? []).length, 3, "setQ 는 프리필 · editQ 본체 · runSearch 세 곳뿐");
});

test("⑤ 실거래만 있는 자리에 '시세' 낱말 없음 — 지도 폴백 링크 · 단지 시세 탭 링크", () => {
  assert.ok(!mapClient.includes("면적대별 시세 ›"));
  assert.ok(!mapClient.includes("시세·타이밍 ›"));
  assert.ok(mapClient.includes("면적대별 실거래가 ›"));
  assert.ok(mapClient.includes("가격 흐름·타이밍 ›"));
  assert.ok(!priceTab.includes("AI 시세 분석 보기"));
  assert.ok(priceTab.includes("AI 가격 분석 보기"));
});

test("⑥ 단지 상세 — 실거래 조회 실패(오류·예산 초과)면 던진다 · 기존 4/5 임계 뒤 · 캐시 7일 유지", () => {
  assert.ok(complexPage.includes("export const revalidate = 604_800"));
  const view = complexPage.slice(complexPage.indexOf("async function loadView("), complexPage.indexOf("function tradeDeltaViews("));
  const thr = view.indexOf("if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD)");
  const tx = view.indexOf("if (!txR.ok) {\n    throw new Error(");
  assert.ok(thr > 0 && tx > thr, "실거래 단독 실패도 던진다");
  assert.ok(tx < view.indexOf("return toView("), "toView 전에");
  /* "거래 없음"은 실패가 아니다 — 본문은 settle 로 받는다(빈 배열 = ok:true) */
  assert.ok(view.includes("settle(`${row.name} 실거래 이력`, loadTxHistory(row.canonical_id, TX_HISTORY_MONTHS), heroBudget.expired)"));
});

test("⑥ 메타데이터 실거래에도 본문과 같은 8초 예산 · 같은 인자(React cache 적중)", () => {
  const meta = complexPage.slice(
    complexPage.indexOf("export async function generateMetadata"),
    complexPage.indexOf("export default async function"),
  );
  assert.ok(meta.includes("const metaTxBudget = startDeadline(SIDE_SECTION_BUDGET_MS);"));
  assert.match(
    meta,
    /Promise\.race\(\[loadTxHistory\(row\.canonical_id, TX_HISTORY_MONTHS\), metaTxBudget\.expired\]\)\.finally\(\(\) =>\s*metaTxBudget\.done\(\),\s*\)/,
  );
  assert.ok(!/^\s*loadTxHistory\(row\.canonical_id, TX_HISTORY_MONTHS\),$/m.test(meta), "예산 없이 기다리는 자리 잔존");
});

test("⑥ 실패와 없음의 경계 — settle: 빈 배열은 ok · 오류·예산 초과만 ok:false (본문이 던지는 기준)", async () => {
  assert.deepEqual(await settle("테스트 실거래 없음", Promise.resolve([])), { ok: true, data: [] });
  assert.deepEqual(await settle("테스트 실거래 오류", Promise.reject(new Error("db down"))), { ok: false });
  const d = startDeadline(5);
  const slow = new Promise<number[]>((r) => setTimeout(() => r([1]), 50));
  assert.deepEqual(await settle("테스트 실거래 지연", slow, d.expired), { ok: false });
  d.done();
});
