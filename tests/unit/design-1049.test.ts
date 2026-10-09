/* [1049] 홈 · 임장노트 · AI 분석 · 마이 — 디자인 정리 · 그래프 · 표. 소유자 지시(2026-10-09):
 *   "홈, 임장노트, ai분석, 마이페이지 등 디자인 개선과 간결화, 그래프, 표 등을 적극 도입"
 *   답: 4곳 한 번에 · "기능 유지, 배치만 정리"(긴 카드 목록은 표·그래프로).
 *
 * 잠그는 사실:
 *  ① 홈 — 서울 25개 구 매매지수 전월 대비 양방향 막대(브리핑과 같은 기준월·같은 계산 · 새 조회 0 · 서버 조각).
 *  ② 임장노트 목록 — 표 보기(데스크톱 기본) · 피드(사진 카드)는 전환으로 그대로 · 폰은 격자 기본 + 목록 보기 · 지역 막대.
 *  ③ AI 분석 — 도구 12종 표 한 장(자주 쓰는 4종 위 · 그 밖의 8종 아래) · 왼쪽 색 띠 걷음 · 누르는 동작(지도 서랍) 그대로.
 *  ④ 마이 — 월별 기록 막대(6개월) · 평균 기록 점수 · 사용량 표(사용/한도 · 막대 · 남음).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { districtMovesFromIndexRows } from "@/lib/newui/home-briefing";
import { buildMyActivity } from "@/lib/me/my-activity";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("홈 구별 전월비 — 가장 많은 구가 가진 최신 달 · 바로 전 달이 있는 구만", () => {
  const rows = [
    { region_id: "gangnam", period: "2026-07-01", value: 100 },
    { region_id: "gangnam", period: "2026-08-01", value: 99.6 },
    { region_id: "jungnang", period: "2026-07-01", value: 100 },
    { region_id: "jungnang", period: "2026-08-01", value: 101.2 },
    { region_id: "mapo", period: "2026-06-01", value: 100 },
    { region_id: "mapo", period: "2026-08-01", value: 103 },
    { region_id: "late", period: "2026-07-01", value: 100 },
  ];
  const r = districtMovesFromIndexRows(rows);
  assert.equal(r?.period, "202608");
  const byId = new Map(r?.moves.map((m) => [m.id, m.pct]));
  assert.ok(Math.abs((byId.get("gangnam") ?? 0) - -0.4) < 1e-9);
  assert.ok(Math.abs((byId.get("jungnang") ?? 0) - 1.2) < 1e-9);
  assert.equal(byId.has("mapo"), false, "7월이 비면 두 달 치를 한 달로 세지 않는다");
  assert.equal(byId.has("late"), false, "기준월 값이 없는 구는 뺀다");
  assert.equal(districtMovesFromIndexRows([]), null);
});

test("홈 — 지역 동향 아래 서울 구별 막대 · 서버 조각 · 홈 데이터의 같은 행", () => {
  const page = code("app/page.tsx");
  assert.ok(page.indexOf("<HomeSeoulMoves") > page.indexOf("지역 동향"), "지역 동향 다음");
  assert.ok(page.indexOf("<HomeSeoulMoves") < page.indexOf("<HomeTownBlock"), "동네이야기 앞");
  const comp = read("app/components/home/HomeSeoulMoves.tsx");
  assert.doesNotMatch(comp, /"use client"/);
  assert.match(comp, /DivergingBars/);
  assert.match(code("lib/newui/home-data.ts"), /const seoulMoves = seoulMovesFromCardSeries\(cardSeries\)/);
  assert.doesNotMatch(read("app/components/viz/DivergingBars.tsx"), /"use client"/);
  assert.match(read("app/components/viz/DivergingBars.tsx"), /bg-up/);
  assert.match(read("app/components/viz/DivergingBars.tsx"), /bg-down/);
});

test("임장노트 목록 — 표(데스크톱 기본) · 피드는 전환 · 폰 목록 · 지역 막대", () => {
  const f = code("app/notes/notes-feed-client.tsx");
  assert.match(f, /type ViewMode = "grid" \| "feed" \| "table"/);
  assert.match(f, /useState<DeskView>\("table"\)/);
  assert.match(f, /useState<ViewMode>\("grid"\)/, "폰 기본은 격자 그대로");
  assert.match(f, /<NotesTable notes=\{visible\} \/>/);
  assert.match(f, /deskView === "feed" \? "md:flex" : "md:hidden"/, "피드 카드는 전환으로 남는다");
  assert.match(f, /aria-label="목록 보기"/);
  assert.match(f, /\{v === "table" \? "표" : "피드"\}/);
  assert.match(f, /window\.localStorage\.getItem\(DESK_VIEW_KEY\)/);
  assert.match(f, /\(r\.count \/ top\) \* 100/, "지역 레일 막대");
});

test("AI 분석 — 도구 12종 판 한 장(4종 표 + 8종 칸) · 왼쪽 색 띠 걷음 · 지도 서랍 동작 그대로", () => {
  const t = code("app/analysis/hub-tiers.tsx");
  assert.match(t, /<table className="w-full border-collapse">/);
  assert.match(t, /<tbody>\{core\.map\(row\)\}<\/tbody>/);
  assert.match(t, /그 밖의 도구 \{more\.length\}/);
  assert.match(t, /grid-cols-2 gap-x-2 p-0 md:grid-cols-4/, "그 밖의 8종은 촘촘한 칸(화면 길이)");
  assert.match(t, /openMap\(\{/);
  assert.doesNotMatch(t, /tool-rail/);
  assert.doesNotMatch(code("app/analysis/hub-tool-card.tsx"), /tool-rail/);
});

test("마이 — 월별 기록 막대 · 평균 점수 · 사용량 표", () => {
  const a = buildMyActivity(
    [
      { date: "2026-10-03", score100: 80, isPublic: true },
      { date: "2026-09-12", score100: 60, isPublic: false },
      { date: "2026-09-01", score100: null, isPublic: false },
      { date: "2026-03-01", score100: 40, isPublic: true },
      { date: "2026-08-31T20:00:00.000Z", score100: null, isPublic: false },
    ],
    "2026-10-09T03:00:00.000Z",
  );
  assert.deepEqual(a?.months.map((m) => m.label), ["5월", "6월", "7월", "8월", "9월", "10월"]);
  assert.deepEqual(a?.months.map((m) => m.count), [0, 0, 0, 0, 3, 1], "작성 시각은 한국 시간 달(8/31 20시 UTC = 9/1)");
  assert.equal(a?.recentTotal, 4);
  assert.equal(a?.avgScore, 60, "점수 있는 노트만 평균");
  assert.equal(a?.publicCount, 2);
  assert.equal(a?.total, 5);
  assert.equal(buildMyActivity([], "2026-10-09T03:00:00.000Z"), null);
  const v = code("app/my/MyHubView.tsx");
  assert.match(v, /<ColumnBars/);
  assert.match(v, /<UsageTable rows=\{usage\} \/>/);
  assert.match(code("app/my/page.tsx"), /activity: notesLoaded\.ok/);
});
