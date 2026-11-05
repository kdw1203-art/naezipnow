/* [1107] 소유자 2026-11-05 캡처 다섯 장(소개 · 푸터 · 단지 다요인 분석 · 단지 요약 · 입주물량) "글씨크기 글자수 디자인 표 등 전체적인
 * 개선과 통합 간결화". 잠그는 사실:
 *  D1 다요인 분석 — 요인 한 줄 표(넓은 판) · 풀이 · 출처 · 계산식은 접힘 하나 · 권유 아님 문구 유지.
 *  D2 단지 요약 — 문단 → 숫자 네 칸(같은 사실 두 곳 없음) · "내 기록" 카드 중복 제거 · 고지 문구 유지.
 *  D3 입주물량 — 표(단지 · 위치 · 입주 · 세대) · 위치는 동 하나.
 *  D4 소개 — 숫자 칸 기준 한 번 · 원칙은 공용 사실 표 · 푸터와 같은 링크 칩 없음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { supplyPlaceLabel } from "@/lib/supply/place-label";
import { buildSummaryTiles } from "@/lib/complex/summary-tiles";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

test("D1 다요인 분석 — 한 줄 표 · 근거 접힘 · 권유 아님", () => {
  const board = code("app/components/signals/SignalBoard.tsx");
  assert.match(board, /@xl:grid-cols-\[4\.5rem_minmax\(0,1fr\)_7rem_5\.5rem\]/, "넓은 판은 이름 · 사실 · 막대 · 낱말 한 줄");
  assert.match(board, /<Fineprint label=\{`근거 · 출처\$\{latest \? ` · 최신 자료 \$\{latest\}` : ""\}`\}/);
  assert.match(board, /출처 \{f\.source\}/, "출처는 접힘 안에 그대로");
  assert.match(board, /요인 점수 −2~\+2 가중 평균 → 0~100\(50 중립\) · 점수 없는 요인 제외/);
  assert.match(board, /매수·매도 권유 아님/);
  /* 요인 줄에는 출처 줄이 없다(접힘으로 옮김) — 줄 안 <p> 는 사실 하나 */
  const rows = board.slice(board.indexOf("report.factors.map((f) => {"), board.indexOf("<Fineprint"));
  assert.doesNotMatch(rows, /출처 \{f\.source\}/);
  assert.doesNotMatch(rows, /f\.note/);
});

test("D2 단지 요약 — 숫자 네 칸 · 비교 칸 금액/비율 분리 · 표본 적은 전세", () => {
  const tiles = buildSummaryTiles({
    headline: {
      kind: "rep",
      priceManwon: 57667,
      basis: "unit",
      unitM2: 37,
      bandLabel: null,
      sampleSize: 6,
      firstYm: "202609",
      latestYm: "202610",
      deal: null,
      base: { avgManwon: 34033, count: 6, firstYm: "202311", latestYm: "202312" },
    },
    tradeSummary: { windowMonths: 12, fromYm: "202511", toYm: "202610", count: 186, medianKrw: 500_000_000, band: null, latestYm: "202610" },
    rentSummary: {
      windowMonths: 12,
      fromYm: "202511",
      toYm: "202610",
      jeonseCount: 2,
      jeonseMedianKrw: 250_000_000,
      wolseCount: 0,
      wolseMedianDepositKrw: null,
      wolseMedianMonthlyKrw: null,
      latest: null,
    },
  });
  assert.deepEqual(
    tiles.map((t) => t.key),
    ["price", "change", "trades", "jeonse"],
  );
  assert.equal(tiles[0].value, "5억 7,667만");
  assert.equal(tiles[0].sub, "전용 37㎡ · 최근 6건 평균");
  assert.equal(tiles[1].label, "23.11~12 대비");
  assert.equal(tiles[1].value, "▲2억 3,634만");
  assert.equal(tiles[1].tone, "up");
  assert.equal(tiles[1].sub, "69.4% · 6건 평균 비교");
  assert.equal(tiles[1].title, "23.11~12 6건 평균 3억 4,033만");
  assert.equal(tiles[2].value, "186건");
  assert.equal(tiles[3].label, "전세", "표본 3건 미만이면 중앙값을 말하지 않는다");
  assert.equal(buildSummaryTiles({ headline: null, tradeSummary: null, rentSummary: null }).length, 0);

  const hub = code("app/complex/[id]/hub-client.tsx");
  assert.match(hub, /summaryTiles && summaryTiles\.length >= 2 \?/);
  assert.match(hub, /국토교통부 실거래 · 공공데이터 기준 · 투자 권유 아님 · 현장 확인 후 판단/);
  assert.doesNotMatch(hub, /myRecordCard|임장노트 회차별 모음/, "탭 줄의 '내 기록'과 같은 입구 — 카드 제거");
  assert.match(code("app/complex/[id]/page.tsx"), /summaryTiles=\{buildSummaryTiles\(\{ headline, tradeSummary: facts\.tradeSummary, rentSummary: facts\.rentSummary \}\)\}/);
  /* 같은 사실 두 곳 — 준공 · 세대 · 전세가율은 칸에 없다 */
  const tilesSrc = code("lib/complex/summary-tiles.ts");
  assert.doesNotMatch(tilesSrc, /준공|세대|전세가율/);
});

test("D3 입주물량 — 표 · 위치는 동 하나", () => {
  assert.equal(supplyPlaceLabel("경기도 안양시 동안구 관양동 521번지 일원 (안양 관양고 주변 도시개발사업 내 A1BL)"), "관양동");
  assert.equal(supplyPlaceLabel("경기도 안양시 동안구 비산3동 354-10번지"), "비산3동");
  assert.equal(supplyPlaceLabel("서울특별시 송파구 가락동 913"), "가락동");
  assert.equal(supplyPlaceLabel("부산광역시 해운대구 우동"), "우동");
  assert.equal(supplyPlaceLabel(""), "");
  assert.equal(supplyPlaceLabel(null), "");
  const sup = code("app/complex/[id]/UpcomingSupply.tsx");
  assert.match(sup, /<table className="w-full t-sub">/);
  assert.match(sup, /supplyPlaceLabel\(i\.address\) \|\| i\.region \|\| "—"/);
  assert.match(sup, /공공 공급 데이터 기준 · 일정은 변동될 수 있음/);
  assert.match(code("app/complex/[id]/ComplexRentSection.tsx"), /출처 국토교통부 전월세 신고 · 최근 1~2개월은 적게 잡힐 수 있음/);
});

test("D4 소개 — 기준 한 번 · 공용 사실 표 · 링크 칩 없음", () => {
  const about = code("app/about/page.tsx");
  assert.equal((about.match(/국토부 신고 기준|국토교통부 신고 기준/g) ?? []).length, 1);
  assert.match(about, /<FactTable dense/);
  assert.doesNotMatch(about, /<FaqCompact/);
  assert.doesNotMatch(about, /href="\/glossary"|href="\/reports"|href="\/support"/, "푸터와 같은 링크는 푸터에만");
  assert.match(about, /href="\/methodology"/);
  for (const fact of ["신고된 실거래만 집계", "추정 가격 만들지 않음", "해제거래 제외", "매수 · 매도 추천하지 않음"]) {
    assert.ok(about.includes(fact), fact);
  }
});
