import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeWatchItems, viewportCountLabel, watchNameKey } from "../../lib/map/watch-layer.ts";

/* [1023 · 지도] 검토 문서(docs/review-1022.md 2장) 지도 항목 잠금 —
   관심 단지 레이어(좌표는 지도가 가진 데이터에서만) · 뷰포트 한 줄 · 실패 고지 재시도 · 그라데이션 제거 · 문구. */

const pool = [
  { id: "kapt:A100", name: "래미안 퍼스티지", lat: 37.5, lng: 127.0 },
  { id: "name:반포자이", name: "반포자이 (1차)", lat: 37.51, lng: 127.01 },
  { id: "kapt:B200", name: "잠실엘스", lat: NaN, lng: 127.1 },
];

test("관심 단지 좌표 — id 일치가 먼저, 없으면 이름(공백·괄호 무시) 일치, 좌표 없는 pool 항목은 쓰지 않는다", () => {
  const { placed, unplaced } = placeWatchItems(
    [
      { complexId: "kapt:A100", complexName: "래미안퍼스티지" },
      { complexId: "kapt:Z999", complexName: "반포 자이" },
      { complexId: "kapt:B200", complexName: "잠실엘스" },
      { complexId: "kapt:C300", complexName: "없는단지" },
    ],
    pool,
  );
  assert.deepEqual(
    placed.map((p) => [p.complexId, p.sourceId, p.lat]),
    [
      ["kapt:A100", "kapt:A100", 37.5],
      ["kapt:Z999", "name:반포자이", 37.51],
    ],
  );
  assert.equal(unplaced, 2, "좌표 없음(NaN)·pool 에 없음 둘 다 미표시로 센다");
  assert.equal(placed[1].name, "반포 자이", "표시 이름은 관심 목록의 이름");
});

test("관심 단지 좌표 — 같은 complexId 가 두 번 오면 한 번만, 빈 id 는 건너뛴다 · 켜지 않았거나 0건이면 빈 결과", () => {
  const r = placeWatchItems(
    [
      { complexId: "kapt:A100", complexName: "래미안퍼스티지" },
      { complexId: "kapt:A100", complexName: "래미안퍼스티지" },
      { complexId: "", complexName: "x" },
    ],
    pool,
  );
  assert.equal(r.placed.length, 1);
  assert.equal(r.unplaced, 0);
  assert.deepEqual(placeWatchItems([], pool), { placed: [], unplaced: 0 });
});

test("이름 키 — 공백·괄호 안·대소문자를 지운다", () => {
  assert.equal(watchNameKey("반포자이 (1차)"), "반포자이");
  assert.equal(watchNameKey("Raemian Firstige"), "raemianfirstige");
});

test("뷰포트 한 줄 — 거래 수는 있을 때만, 실패는 —", () => {
  assert.equal(viewportCountLabel(12, 0, false), "단지 12");
  assert.equal(viewportCountLabel(1234, 5678, false), "단지 1,234 · 거래 5,678건");
  assert.equal(viewportCountLabel(0, 0, false), "단지 0");
  assert.equal(viewportCountLabel(9, 9, true), "단지 —");
});

const mapClient = readFileSync("app/map/map-client.tsx", "utf8");
const lazy = readFileSync("app/map/MapClientLazy.tsx", "utf8");
const searchBox = readFileSync("app/map/MapSearchBox.tsx", "utf8");
const panel = readFileSync("app/map/ComplexInfoPanel.tsx", "utf8");

test("관심 단지 레이어 — 기존 읽기 API(/api/me/watchlist)만 · 토글은 내 노트 옆 · 게스트 문구는 내 노트와 같은 꼴 · layers= 토큰", () => {
  assert.ok(mapClient.includes('fetch("/api/me/watchlist"'), "기존 API 재사용");
  assert.ok(!mapClient.includes("/api/bookmarks"), "없는 API 를 부르지 않는다");
  assert.ok(mapClient.indexOf("> 내 노트\n") < mapClient.indexOf("> 관심 단지\n"), "내 노트 다음 자리");
  assert.ok(mapClient.includes("관심 단지 레이어는 로그인 후 볼 수 있어요"));
  assert.ok(mapClient.includes("내 노트 레이어는 로그인 후 볼 수 있어요"));
  assert.ok(mapClient.includes('showWatchlist ? "watchlist" : null'), "주소창 layers 토큰");
  assert.ok(mapClient.includes('on.has("watchlist")'), "공유 링크 복원");
  assert.ok(mapClient.includes("placeWatchItems(watchItems, [...danji, ...viewportDanji, ...extraPoints])"), "좌표는 지도가 가진 데이터에서만");
  assert.ok(!/fetch\(`\/api\/map\/geocode[^`]*watch/.test(mapClient), "관심 단지 때문에 지오코딩을 새로 하지 않는다");
});

test("레이어 실패 고지 — 7종(+관심 단지) 전부 재시도 손잡이 · 24px 하한 · 포인터 살림", () => {
  for (const key of ["redev", "mynotes", "rentshare", "auctions", "poi", "supply", "watch"]) {
    assert.ok(mapClient.includes(`retry: () => retryLayer("${key}")`), `${key} 재시도`);
    assert.ok(mapClient.includes(`layerRetry.${key}`), `${key} effect 가 재시도 횟수를 본다`);
  }
  assert.ok(mapClient.includes("if (last) scheduleClusterFetch(last.bounds, last.zoom);"), "단지 조회 실패도 재시도");
  assert.ok(mapClient.includes('className="map-notice-retry ml-2 inline-flex min-h-[24px]'));
  assert.ok(mapClient.includes('n.retry ? "pointer-events-auto" : ""'), "고지 열은 pointer-events-none — 단추가 있는 고지만 살린다");
});

test("뷰포트 한 줄 — 칩 줄 끝 두 자리(헤더 lg · 모바일 줄) · 목록 헤더와 같은 수(filteredDanji) · 거래 수는 priceMeta 에서만", () => {
  assert.equal(mapClient.split("{viewportCountChip}").length - 1, 2);
  assert.ok(mapClient.includes("viewportCountLabel(filteredDanji.length, priceMeta.txCount, danjiLoadFailed)"));
});

test("그라데이션 면 — 타일 실패·지도 셸·로딩 셸 전부 bg-bg", () => {
  assert.ok(!mapClient.includes("bg-gradient-to-br"));
  assert.ok(!lazy.includes("bg-gradient-to-br"));
});

test("검색 입력 전 — 최근 본 단지 줄(RecentComplexes 저장소 재사용) · 입력이 있으면 안 그린다", () => {
  assert.ok(searchBox.includes('from "@/app/components/RecentComplexes"'));
  assert.ok(searchBox.includes("recentOpen && query.trim().length === 0 && recents.length > 0"));
  assert.ok(searchBox.includes("{recentPanelOpen && !panelOpen && ("));
  assert.ok(!searchBox.includes("nz_recent_complexes"), "저장소 키를 따로 적지 않는다(한 곳)");
});

test("문구·정렬 — 미연결 고지는 사실 한 줄 · 패널 섹션 머리 baseline", () => {
  assert.ok(panel.includes("단지 마스터와 아직 연결되지 않음 · 아래는 실거래·이야기"));
  assert.ok(!panel.includes("아래를 참고해 주세요"));
  assert.ok(panel.includes('<div className="mb-2 flex items-baseline justify-between gap-2">'));
});
