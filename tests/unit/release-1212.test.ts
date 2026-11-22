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
