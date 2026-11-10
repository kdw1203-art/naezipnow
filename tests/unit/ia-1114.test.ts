import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankHomeDeals, type HomeDealRow } from "../../lib/newui/home-deals.ts";

/* ============================================================
   [1114 · 홈 벤토] 소유자 2026-11-09 — 지역 화면 형식(숫자 칸 · 시세 흐름 그래프 · 표)을 홈에 · 옅은 파랑 실거래 판 = 아래→위 순위 배너 · 시안 A(벤토) 선택
     ① 금액 순위(순수 함수) ② 홈 격자 · 같은 조각 재사용 ③ 같은 숫자 한 곳 ④ 배너 · 표 꼴
   ============================================================ */
const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const row = (man: number, i: number): HomeDealRow => ({ key: `k${i}`, complexName: `단지${i}`, href: null, date: "2026.10.28", spec: "", man });

test("① rankHomeDeals — 금액 높은 순 · 같은 금액은 최근 신고 순 · 0원 제외 · 상한", () => {
  const r = rankHomeDeals([row(116000, 0), row(510000, 1), row(0, 2), row(140000, 3), row(140000, 4), row(Number.NaN, 5)], 3);
  assert.deepEqual(r.map((x) => x.key), ["k1", "k3", "k4"]);
  assert.equal(rankHomeDeals([], 10).length, 0);
});

test("② 홈 — 12칸 격자 · 왼쪽 8 = 시장 한눈에(지역 화면 숫자 칸 · 시세 흐름 카드 그대로) · 오른쪽 4 = 순위 배너 + 지역 동향 표", () => {
  const home = strip(read("app/page.tsx"));
  assert.match(home, /className="mt-3 grid grid-cols-1 gap-3 md:mt-4 lg:grid-cols-12 lg:gap-4"/);
  assert.match(home, /lg:col-span-8 lg:gap-4">\s*\{dealsRegion && <HomeMarketBoard id=\{dealsRegion\.id\} name=\{dealsRegion\.name\} \/>\}/);
  const aside = home.slice(home.indexOf('<aside data-autotrim=""'), home.indexOf("</aside>"));
  assert.ok(aside.indexOf("<HomeRecentDeals") >= 0 && aside.indexOf("<HomeRecentDeals") < aside.indexOf("<HomeRegionTable"), "배너 → 표");
  let last = -1;
  for (const k of ["<HomeMyRail", "<HomeMarketBoard", "<HomeRecentDeals", "<HomeRegionTable", ">공개 임장노트</h2>", "<HomeHubLinks", "<HomeTownBlock", "<HomeTalkSection"]) {
    const i = home.indexOf(k);
    assert.ok(i > last, `순서: ${k}`);
    last = i;
  }
  assert.doesNotMatch(home, /<RegionPulseCards/, "회전 카드 → 표");
  const board = strip(read("app/components/home/HomeMarketBoard.tsx"));
  assert.match(board, /regionHeroTiles\(overview\)/, "지역 화면 머리와 같은 칸");
  assert.match(board, /<RegionTrendCard heading=\{`\$\{name\} 시세 흐름`\} datasets=\{datasets\} className="" \/>/);
  assert.match(board, /불러오기 실패 · 잠시 후 다시/);
  const hero = strip(read("app/region/[id]/RegionHero.tsx"));
  assert.match(hero, /export function regionHeroTiles\(overview: RegionOverview\): React\.ReactNode\[\]/);
  assert.match(hero, /const tiles = regionHeroTiles\(overview\);/);
});

test("③ 같은 숫자 한 곳 — 오늘의 시장 띠의 대표 지역 슬라이드 없음 · 표에서 대표 지역 제외", () => {
  const home = strip(read("app/page.tsx"));
  assert.match(home, /<HomeTodayLine\s+embedded\s+region=\{null\}/);
  assert.doesNotMatch(home, /kpiRegion/);
  assert.match(home, /const tableRegions = dealsRegion \? regions\.filter\(\(r\) => r\.id !== dealsRegion\.id\) : regions;/);
  assert.match(home, /<HomeRegionTable regions=\{tableRegions\} \/>/);
});

test("④ 순위 배너 · 표 — 한 줄씩 아래→위 · 멈춤 · 동작 줄이기 · 전체 순위는 닫힌 목록 · 표는 막대 + 숫자 열", () => {
  const t = strip(read("app/components/home/RankTicker.tsx"));
  assert.match(t, /"use client"/);
  assert.match(t, /home-roll__page/);
  assert.match(t, /prefers-reduced-motion: reduce/);
  assert.match(t, /document\.visibilityState === "hidden"/);
  assert.doesNotMatch(t, /aria-live/);
  const d = strip(read("app/components/home/HomeRecentDeals.tsx"));
  assert.doesNotMatch(d, /"use client"/);
  assert.match(d, /rankHomeDeals\(rows, 10\)/);
  assert.match(d, /<details className="group">/);
  assert.match(d, /최근 신고 \{rows\.length\.toLocaleString\("ko-KR"\)\}건 중 한 건 금액 높은 순/);
  const tb = strip(read("app/components/home/HomeRegionTableBody.tsx"));
  assert.match(tb, /<table className="w-full border-collapse">/);
  assert.match(tb, /bg-up" : pct! < 0 \? "bg-down"/);
  assert.match(tb, /\{r\.stale \? "실거래 평균" : "평균"\}/);
});
