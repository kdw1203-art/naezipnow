/* [1212] 제안 50가지 1차 — 깔때기 측정 · 노트 첫 화면 · 뉴스 수집 시간 초과 · 지도 마커 상한 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("노트 깔때기 — 첫 탭 · 키 입력 뒤에만 열림을 세고, 기준선은 그 순간 값", () => {
  const f = read("app/notes/new/NoteForm.tsx");
  assert.match(f, /window\.addEventListener\("pointerdown", on, \{ once: true, passive: true \}\)/);
  assert.match(f, /if \(isGuest === null \|\| !interacted\) return;\s*noteFunnel\("note_form_open"/);
  assert.match(f, /if \(!firstInputBase\.current\) firstInputBase\.current = \{ \.\.\.latestInputs\.current \};/);
  assert.match(f, /if \(!base\) return;/);
});

test("노트 첫 화면 — 지도 고르기는 기본 접힘(한 번 펼치면 기억)", () => {
  const m = read("app/notes/new/NoteMapPick.tsx");
  assert.match(m, /return window\.localStorage\.getItem\(OPEN_KEY\) === "1";/);
  assert.match(m, /const \[open, setOpen\] = useState\(false\);/);
});

test("신고가 탐지 — 색인 칸만 한 번(id 키셋 쪽 넘김 없음)", () => {
  const ph = read("lib/market/price-highs.ts");
  assert.doesNotMatch(ph, /\.select\("id, complex_name/);
  assert.match(ph, /\.limit\(FRESH_PAGE_ROWS \* FRESH_MAX_PAGES\)/);
});

test("지도 — 넓게 본 화면의 정비구역 마커는 세대수 큰 순 300곳까지", () => {
  const map = read("app/map/map-client.tsx");
  assert.match(map, /const REDEV_WIDE_MAX = 300;/);
  assert.match(map, /const redevWide = Boolean\(viewBounds && viewBounds\.neLng - viewBounds\.swLng > 0\.25\);/);
});

test("2차 — 판정 근거 한 줄 · 지도 같은 동 비교 · 없는 자료 접힘 · 빈 매물엔 광고 없음 · 정비구역 가벼운 응답 · 사람 추정", () => {
  for (const f of ["app/complex/[id]/ComplexAiVerdicts.tsx", "app/analysis/ai/[tool]/OtherVerdicts.tsx"]) {
    assert.match(read(f), /\{r\.reason && <span className="block truncate t-caption text-text-3">\{r\.reason\}<\/span>\}/, f);
  }
  assert.match(read("app/map/ComplexInfoPanel.tsx"), /onClick=\{\(\) => onComparePair\(p\.slug\)\}/);
  assert.match(read("app/map/map-client.tsx"), /onComparePair=\{setPairSlug\}/);
  assert.match(read("app/api/map/complex-pairs/route.ts"), /\.filter\(\(p\) => p\.region === decoded\.region && \(p\.a === decoded\.name \|\| p\.b === decoded\.name\)\)/);
  assert.match(read("app/complex/[id]/ComplexFactsCard.tsx"), /<details className="group">\s*<summary[^>]*>\s*비어 있는 자료/);
  assert.match(read("app/listings/page.tsx"), /\{items !== null && items\.length > 0 && <AdZone placement="page_bottom"/);
  const api = read("app/api/redevelopment/projects/route.ts");
  assert.match(api, /items\.map\(\(\{ summary: _s, source: _src, isSample: _x, \.\.\.rest \}\) => rest\)/);
  assert.match(api, /s-maxage=600/);
  assert.match(read("app/map/map-client.tsx"), /\/api\/redevelopment\/projects\?limit=2000&view=map\$\{bbox\}/);
  assert.match(read("lib/metrics/page-count.ts"), /if \(r\.device\.startsWith\("m"\) \|\| r\.ref_host \|\| r\.utm_source\) human7 \+= n;/);
});
