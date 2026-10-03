import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAP_HOME_VIEW, initialMapLevel, nearestZoomTab } from "../../lib/map/home-view.ts";
import { parseMapEntryParams } from "../../lib/map/entry-params.ts";
import { noteMapHref } from "../../lib/notes/note-coords.ts";

const mapClientSrc = () => readFileSync("app/map/map-client.tsx", "utf8");
import {
  REDEV_LABEL_MODES,
  buildRedevInfoHtml,
  escapeHtml,
  filterRedevProjects,
  isRedevLabelMode,
  redevDetailHref,
  redevGroupCounts,
  redevMarkerLabel,
  redevStageCounts,
  safeHttpUrl,
} from "../../lib/redevelopment/map-layer.ts";
import type { ProjectGroupKey, RedevelopmentProject, StageKey } from "../../lib/redevelopment/types.ts";

/* [1027 · 지도] 첫 화면(전국 목록 평균 → 서울시청 level 10) · 바탕 지도(위성·지적편집도) ·
   정비사업 걸러 보기·이름표 · 안내창 이스케이프 · 우하단 범례 높이. */

const LEVELS = { city: 12, dong: 9, danji: 6 } as const;

test("첫 화면 — 목적지가 없으면 홈 화면 축척(시·군·구 탭), 있으면 단지 줌, ?z 가 있으면 그 값", () => {
  assert.deepEqual(MAP_HOME_VIEW, { lat: 37.5665, lng: 126.978, level: 10, tab: "city" });
  assert.equal(initialMapLevel({ initialLevel: null, hasEntryFocus: false, focusLevel: 6 }), 10);
  assert.equal(initialMapLevel({ initialLevel: null, hasEntryFocus: true, focusLevel: 6 }), 6);
  assert.equal(initialMapLevel({ initialLevel: 13, hasEntryFocus: false, focusLevel: 6 }), 13);
  assert.equal(initialMapLevel({ initialLevel: 8, hasEntryFocus: true, focusLevel: 6 }), 8);
});

test("?z 는 네이버 줌 — 내부 level 은 21 − 줌(지도가 주소에 써 두는 단위 · 노트의 지도 링크와 같다)", () => {
  /* 예전: 줌 숫자를 level 로 그대로 읽어 배율이 뒤집혔다 — z=16(동네)이 level 16(전국)으로 열렸다(운영 확인) */
  assert.equal(parseMapEntryParams("?lat=37.4974&lng=127.0653&z=16").initialLevel, 5);
  assert.equal(parseMapEntryParams("?z=15").initialLevel, 6);
  assert.equal(parseMapEntryParams("?z=11").initialLevel, 10, "홈 화면(level 10)에서 주소에 적히는 z=11 이 같은 축척으로 돌아온다");
  assert.equal(parseMapEntryParams("?z=6").initialLevel, 15);
  assert.equal(parseMapEntryParams("?z=19").initialLevel, 2);
  assert.equal(parseMapEntryParams("?z=5").initialLevel, null);
  assert.equal(parseMapEntryParams("?z=20").initialLevel, null);
  assert.equal(parseMapEntryParams("").initialLevel, null);
  /* 쓰는 쪽은 줌 그대로 · 노트 링크도 줌 */
  assert.ok(mapClientSrc().includes('sp.set("z", String(Math.round(z)));'));
  assert.ok(mapClientSrc().includes("syncUrl((bounds.swLat + bounds.neLat) / 2, (bounds.swLng + bounds.neLng) / 2, info.zoom);"));
  assert.equal(noteMapHref({ lat: 37.5, lng: 127 }), "/map?lat=37.5&lng=127&z=16");
  /* 구역 상세의 "지도에서 보기" — 단지 축척은 줌 15 */
  assert.ok(readFileSync("app/redevelopment/[id]/page.tsx", "utf8").includes("&z=15&layers=price,redev"));
});

test("줌 탭 — 공유 주소는 축척에 가장 가까운 탭(level 10 → 동) · 홈 화면은 내용이 맞는 시·군·구 탭", () => {
  assert.equal(nearestZoomTab(10, LEVELS), "dong");
  assert.equal(nearestZoomTab(12, LEVELS), "city");
  assert.equal(nearestZoomTab(6, LEVELS), "danji");
  assert.equal(nearestZoomTab(7, LEVELS), "danji");
  assert.equal(nearestZoomTab(14, LEVELS), "city");
});

function zone(over: Partial<RedevelopmentProject>): RedevelopmentProject {
  return {
    id: "z1",
    name: "한남3구역",
    typeKey: "redev",
    stageKey: "moving",
    sido: "서울",
    sigungu: "용산구",
    address: "용산구 한남동",
    lat: 37.536,
    lng: 126.9995,
    households: 5816,
    summary: null,
    source: "공개 자료",
    sourceUrl: "https://cleanup.seoul.go.kr",
    isSample: false,
    updatedAt: "2026-07-22T06:53:15Z",
    asOf: null,
    ...over,
  };
}

const ZONES: RedevelopmentProject[] = [
  zone({ id: "a", typeKey: "redev", stageKey: "moving" }), // 민간
  zone({ id: "b", typeKey: "recon_apt", stageKey: "union" }), // 민간
  zone({ id: "c", typeKey: "public_redev", stageKey: "designated" }), // 공공
  zone({ id: "d", typeKey: "moa", stageKey: "designated" }), // 소규모
  zone({ id: "e", typeKey: "garo", stageKey: "plan_approved" }), // 소규모
];
const G = (...k: ProjectGroupKey[]) => new Set<ProjectGroupKey>(k);
const S = (...k: StageKey[]) => new Set<StageKey>(k);

test("정비사업 걸러 보기 — 빈 집합은 전체, 두 축은 AND", () => {
  assert.equal(filterRedevProjects(ZONES, G(), S()).length, 5);
  assert.deepEqual(filterRedevProjects(ZONES, G("small"), S()).map((p) => p.id), ["d", "e"]);
  assert.deepEqual(filterRedevProjects(ZONES, G(), S("designated")).map((p) => p.id), ["c", "d"]);
  assert.deepEqual(filterRedevProjects(ZONES, G("small", "public"), S("designated")).map((p) => p.id), ["c", "d"]);
  assert.deepEqual(filterRedevProjects(ZONES, G("etc"), S()), []);
});

test("칩의 수 = 눌렀을 때 보이는 수 — 다른 축 조건을 건 뒤 센다", () => {
  assert.deepEqual(redevGroupCounts(ZONES, S()), { private: 2, public: 1, small: 2, etc: 0 });
  assert.deepEqual(redevGroupCounts(ZONES, S("designated")), { private: 0, public: 1, small: 1, etc: 0 });
  const st = redevStageCounts(ZONES, G("small"));
  assert.equal(st.designated, 1);
  assert.equal(st.plan_approved, 1);
  assert.equal(st.moving, 0);
  /* 칩을 눌러 본 결과와 같은지 — 전 조합 */
  for (const g of ["private", "public", "small", "etc"] as const) {
    for (const s of ["designated", "union", "moving", "plan_approved"] as const) {
      assert.equal(redevGroupCounts(ZONES, S(s))[g], filterRedevProjects(ZONES, G(g), S(s)).length);
      assert.equal(redevStageCounts(ZONES, G(g))[s], filterRedevProjects(ZONES, G(g), S(s)).length);
    }
  }
});

test("이름표 — 구역명 · 진행단계 · 세대수(없으면 — , 0·추정으로 채우지 않는다)", () => {
  const p = zone({});
  assert.equal(redevMarkerLabel(p, "name"), "한남3구역");
  assert.equal(redevMarkerLabel(p, "stage"), "이주·철거·착공");
  assert.equal(redevMarkerLabel(p, "households"), "5,816세대");
  assert.equal(redevMarkerLabel(zone({ households: null }), "households"), "—");
  assert.equal(redevMarkerLabel(zone({ households: 0 }), "households"), "—");
  assert.deepEqual(REDEV_LABEL_MODES.map((m) => m.key), ["name", "stage", "households"]);
  assert.ok(isRedevLabelMode("stage"));
  assert.ok(!isRedevLabelMode("price"));
  assert.ok(!isRedevLabelMode(undefined));
});

test("안내창 — 글자는 이스케이프, 출처는 http(s) 만, 구역 상세 링크는 id 를 경로 한 토막으로", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('1')">&`), "&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;");
  assert.equal(safeHttpUrl("https://cleanup.seoul.go.kr"), "https://cleanup.seoul.go.kr");
  assert.equal(safeHttpUrl(" HTTP://x.kr/a "), "HTTP://x.kr/a");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,x"), null);
  assert.equal(safeHttpUrl(null), null);
  assert.equal(redevDetailHref("seed-eunma"), "/redevelopment/seed-eunma");
  assert.equal(redevDetailHref("seoul-한남 3/구역"), `/redevelopment/${encodeURIComponent("seoul-한남 3/구역")}`);

  const evil = buildRedevInfoHtml(
    zone({
      id: `x"><script>`,
      name: `<script>alert(1)</script>`,
      sigungu: `"><img src=x>`,
      address: `<b>주소</b>`,
      sourceUrl: "javascript:alert(1)",
      asOf: `<i>2026.07</i>`,
    }),
  );
  assert.ok(!evil.includes("<script>"), "구역명·id 의 태그가 살아 있으면 안 된다");
  assert.ok(!evil.includes("<img"), "시군구의 태그");
  assert.ok(!evil.includes("<b>주소"), "주소의 태그");
  assert.ok(!evil.includes("<i>2026"), "기준 시점의 태그");
  assert.ok(!evil.includes("javascript:"), "http(s) 가 아닌 출처는 링크를 그리지 않는다");
  assert.ok(evil.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));

  const ok = buildRedevInfoHtml(zone({ id: "seed-hannam3", asOf: "2026.07" }));
  assert.ok(ok.includes('href="/redevelopment/seed-hannam3"'));
  assert.ok(ok.includes("구역 상세 ›"));
  assert.ok(ok.includes('href="https://cleanup.seoul.go.kr" target="_blank" rel="noopener noreferrer"'));
  assert.ok(ok.includes("예정 5,816세대"));
  assert.ok(ok.includes("2026.07 공개자료 기준"));
  assert.ok(ok.includes("background:var(--surface);color:var(--ink)"), "상자가 자기 바탕을 가진다(다크)");
  assert.ok(!/font-size:(9|11|14)px/.test(ok), "글자 크기는 램프(12·13)");
  assert.ok(!buildRedevInfoHtml(zone({ households: null })).includes("예정"), "세대수가 없으면 줄을 내지 않는다");
});

const mapClient = readFileSync("app/map/map-client.tsx", "utf8");
const redevMap = readFileSync("app/redevelopment/RedevelopmentMap.tsx", "utf8");

test("map-client — 첫 화면은 홈 화면(목록 좌표 평균을 쓰지 않는다) · 줌 캡션은 탭이 켜는 내용만(축척 숫자 없음)", () => {
  assert.ok(mapClient.includes('if (initialLevel == null) return hasEntryFocus ? "danji" : MAP_HOME_VIEW.tab;'));
  /* [1028] "줌 레벨 N · " 접두는 개발 용어라 화면에 내지 않는다 — 탭이 켜는 내용만 돌려준다 */
  assert.ok(mapClient.includes("return ZOOM_CAPTION_TEXT[tab];"));
  assert.ok(mapClient.includes('city: "시·군·구별 평균",') && mapClient.includes('dong: "동별 평균 · 거래량",') && mapClient.includes('danji: "단지별 실거래",'));
  assert.ok(!mapClient.includes("`줌 레벨 ${"), "축척 숫자를 문구에 넣지 않는다");
  assert.ok(!/줌 레벨 (9|12|15) ·/.test(mapClient), "탭마다 박아 둔 숫자 없음");
  assert.ok(mapClient.includes('import { MAP_HOME_VIEW, initialMapLevel, nearestZoomTab } from "@/lib/map/home-view";'));
  assert.ok(mapClient.includes("return { lat: MAP_HOME_VIEW.lat, lng: MAP_HOME_VIEW.lng };"));
  assert.ok(mapClient.includes("initialMapLevel({ initialLevel, hasEntryFocus, focusLevel: LEVEL_BY_ZOOM.danji })"));
  assert.ok(!/danji\.reduce\(\(s, d\) => s \+ d\.lat, 0\)/.test(mapClient), "단지 목록 좌표 평균");
});

test("map-client — 바탕 지도(위성·지적편집도)를 NaverMap 에 넘기고 주소·저장값에 남긴다", () => {
  assert.ok(mapClient.includes("mapType={baseMap}"));
  assert.ok(mapClient.includes("nativeLayers={nativeMapLayers}"));
  assert.ok(mapClient.includes("useMemo(() => ({ cadastral: showCadastral }), [showCadastral])"));
  assert.ok(mapClient.includes('showCadastral ? "cadastral" : null'), "layers= 토큰");
  assert.ok(mapClient.includes('setShowCadastral(on.has("cadastral"))'), "공유 링크 복원");
  assert.ok(mapClient.includes('if (baseMap === "satellite") url.searchParams.set("base", "sat");'));
  assert.ok(mapClient.includes('setBaseMap(sp.get("base") === "sat" ? "satellite" : "normal")'));
  assert.ok(mapClient.includes("base: baseMap,") && mapClient.includes("cadastral: showCadastral,"), "nz_map_prefs");
  assert.ok(mapClient.includes('aria-label="바탕 지도"'));
  assert.ok(mapClient.includes("disabled={mapFallback}"), "지도를 못 그린 화면에서는 비활성");
  /* 레이어 수(접힌 칩 "레이어 N")는 layers= 토큰과 같은 집합 — 지적편집도는 세고 위성(base)은 세지 않는다 */
  const count = mapClient.slice(mapClient.indexOf("const activeLayerCount = ["), mapClient.indexOf("].filter(Boolean).length;", mapClient.indexOf("const activeLayerCount = [")));
  assert.ok(count.includes("showCadastral"));
  assert.ok(!count.includes("baseMap"));
});

test("map-client — 정비사업 마커·범례·패널이 걸러 본 목록 하나를 본다 · 안내창은 공용 빌더", () => {
  assert.ok(mapClient.includes("filterRedevProjects(redevItems, redevGroups, redevStages)"));
  assert.ok(mapClient.includes("return redevShown.map((p) => ({"));
  assert.ok(mapClient.includes("label: redevMarkerLabel(p, redevLabelMode),"));
  assert.ok(mapClient.includes("infoHtml: buildRedevInfoHtml(p),"));
  assert.ok(mapClient.includes("for (const p of redevShown) {"), "범례도 걸러 본 구역에서만");
  assert.ok(!mapClient.includes('<p style="font-size:13px;font-weight:700;color:var(--ink);margin:0">${p.name}</p>'), "이스케이프 없는 옛 안내창");
  assert.ok(!mapClient.includes('href="${p.sourceUrl}"'));
  assert.ok(mapClient.includes('aria-label="사업종류"') && mapClient.includes('aria-label="진행단계"') && mapClient.includes('aria-label="이름표"'));
  /* 0곳인 칩은 비활성(켜 둔 것은 끌 수 있어야 한다) — 단, 다 받아 온 뒤에만. 받기 전의 0 은 "없다"가 아니다 */
  assert.equal(mapClient.split("disabled={redevCountsReady && n === 0 && !on}").length - 1, 2);
  assert.ok(mapClient.includes("const redevCountsReady = redevLoaded && !redevFailed;"));
  assert.ok(mapClient.includes('? "불러오지 못했어요"') && mapClient.includes('? "불러오는 중"'), "받기 전·실패는 숫자로 말하지 않는다");
  /* 전체 초기화가 정비사업 조건도 푼다 · 조건에 맞는 구역이 없으면 지도 위에서 말한다(손잡이 "조건 풀기") */
  const reset = mapClient.slice(mapClient.indexOf("const resetFilters = useCallback("), mapClient.indexOf("}, []);", mapClient.indexOf("const resetFilters = useCallback(")));
  assert.ok(reset.includes("setRedevGroups(new Set());") && reset.includes("setRedevStages(new Set());"));
  assert.ok(mapClient.includes('key: "redev-filtered-out"') && mapClient.includes('retryLabel: "조건 풀기"'));
  /* 정비사업 마커에는 단지용 호버 카드를 띄우지 않는다(이름표가 제목이 되지 않게) */
  assert.ok(mapClient.includes('const next = m && String(m.id).startsWith("redev:") ? null : m;'));
  /* layers= 가 주소에 있어도 주소에 싣지 않는 저장값(이름표)은 살린다 */
  assert.ok(mapClient.includes("if (saved && isRedevLabelMode(saved.redevLabel)) setRedevLabelMode(saved.redevLabel);"));
  /* 파생값은 패널 JSX(filterPanel)보다 먼저 선언돼야 한다 — 뒤에 있으면 렌더에서 TDZ 로 터진다 */
  assert.ok(mapClient.indexOf("const redevShown = useMemo(") < mapClient.indexOf("const filterPanel = filtersExpanded ? ("));
  assert.ok(mapClient.indexOf("const redevGroupCount = useMemo(") < mapClient.indexOf("const filterPanel = filtersExpanded ? ("));
});

test("map-client — 우하단 범례 열은 매물 등록 버튼(아래끝 220px) 밑에 머문다", () => {
  assert.ok(mapClient.includes("max-h-[calc(212px_-_var(--nz-map-bottom-lane))]"));
  assert.ok(!mapClient.includes("z-30 hidden w-[200px] max-h-[180px]"));
});

test("/redevelopment 지도도 같은 안내창을 쓴다(자기 사본 없음) · 펼친 패널에서 구역 상세로", () => {
  assert.ok(redevMap.includes('import { buildRedevInfoHtml, redevDetailHref } from "@/lib/redevelopment/map-layer";'));
  assert.ok(redevMap.includes("infoHtml: buildRedevInfoHtml(p),"));
  assert.ok(!redevMap.includes("function buildInfoHtml("));
  assert.ok(redevMap.includes("detailHref={redevDetailHref(selectedProject.id)}"));
});

test("NaverMap — 인증 실패 뒤에는 SDK 객체를 부르지 않고 놓는다 · 정리 중 예외로 화면이 오류 화면이 되지 않는다", () => {
  const wrapper = readFileSync("components/map/NaverMap.tsx", "utf8");
  /* 인증 실패 알림이 오면 가장 먼저 참조를 놓는다(SDK 호출 없음) */
  assert.match(wrapper, /onAuthFailure: \(\) => \{\s*if \(cancelled\) return;\s*dropSdkRefs\(\);/);
  const drop = wrapper.slice(wrapper.indexOf("const dropSdkRefs = () => {"), wrapper.indexOf("// 런타임 Client ID 우선"));
  for (const line of [
    "markerMapRef.current.clear();",
    "infoWindowRef.current = null;",
    "cadastralLayerRef.current = null;",
    "measureMarkersRef.current = [];",
    "routeLinesRef.current = [];",
    "mapRef.current = null;",
  ]) {
    assert.ok(drop.includes(line), line);
  }
  assert.ok(!/\.setMap\(|\.destroy\?*\.?\(|\.close\(/.test(drop), "놓을 때 SDK 를 부르지 않는다");
  /* 언마운트 정리 — SDK 호출은 하나씩 감싼다 */
  const cleanup = wrapper.slice(wrapper.indexOf("// 언마운트 시 오버레이·맵 정리"), wrapper.indexOf("// 언마운트 시 오버레이·맵 정리") + 1400);
  assert.ok(cleanup.includes("for (const [, entry] of markerMapRef.current) quiet(() => entry.marker.setMap(null));"));
  assert.ok(cleanup.includes("quiet(() => mapRef.current?.destroy?.());"));
  assert.ok(!/^\s*(entry\.marker|trafficLayerRef\.current\?|cadastralLayerRef\.current\?|bicycleLayerRef\.current\?)\.setMap\(null\);/m.test(cleanup));
  /* 크기 변화 알림 — 놓은 지도에는 refresh 를 부르지 않는다 */
  assert.match(wrapper, /new ResizeObserver\(\(\) => \{[\s\S]{0,200}?if \(mapRef\.current !== map\) return;\s*try \{\s*map\.refresh\?\.\(\);\s*\} catch \{/);
});
