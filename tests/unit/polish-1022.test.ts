/* [1022 · 정렬·글씨·테마] 담당 J — 임장노트·지도·AI 분석 허브·동네의 머리 통일 · 램프 글자 · 테마 잠금.
   소유자 지시 4(2026-09-28): "전체적으로 정렬을 맞추고 글씨크기, 글씨체, 전체 테마 등도 맞춰줘".
   구조 잠금만 — 렌더는 하지 않고 소스를 읽는다(다른 1022 테스트와 같은 방식). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string): string => readFileSync(p, "utf8");
/** 주석은 코드가 아니다 — 지시 요약 주석에 옛 문구가 인용돼 있어도 잠금이 울리면 안 된다 */
const code = (p: string): string => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** 담당 J 범위 — 다른 담당 폴더(analysis/ai·price·timing·temperature·gap, components/home·viz)는 뺀다 */
function scopedFiles(): string[] {
  const files = [
    ...walk("app/components").filter((p) => !p.startsWith("app/components/home") && !p.startsWith("app/components/viz")),
    ...walk("app/notes"),
    ...walk("app/map"),
    ...walk("app/town"),
    "app/analysis/page.tsx",
    "app/analysis/tool-cards-client.tsx",
    "app/analysis/AnalysisCrossLinks.tsx",
    ...readdirSync("app/analysis")
      .filter((n) => n.startsWith("hub-") && n.endsWith(".tsx"))
      .map((n) => `app/analysis/${n}`),
  ];
  return files;
}

test("[1022] PageHead — 아이콘 칩 40px + h1.t-title + 사실 한 줄(t-sub) | 오른쪽 액션, 캡션 줄은 t-caption", () => {
  const src = read("app/components/PageHead.tsx");
  assert.match(src, /h-10 w-10 shrink-0 items-center justify-center rounded-xl/);
  assert.match(src, /className="t-title text-ink"/);
  assert.match(src, /t-sub text-text-2/);
  assert.match(src, /justify-end gap-2/);
  assert.match(src, /t-caption text-text-3/);
  assert.ok(!/text-\[\d+px\]/.test(src), "머리 부품에 임의 px 없음");
  assert.ok(!/font-extrabold|font-black|800/.test(src), "굵기 800 없음");
});

test("[1022] 머리 한 모양 — 허브·동네 9칸·동네 홈·임장노트·뉴스룸·동네 홈 상세가 PageHead 를 쓴다", () => {
  for (const p of [
    "app/analysis/hub-hero.tsx",
    "app/town/TownHero.tsx",
    "app/town/TownPageHead.tsx",
    "app/town/page.tsx",
    "app/notes/notes-feed-client.tsx",
    "app/notes/best/page.tsx",
    "app/notes/best/[ym]/page.tsx",
    "app/notes/compare/page.tsx",
    "app/notes/market/page.tsx",
    "app/town/news/page.tsx",
    "app/town/news/tag/[tag]/page.tsx",
    "app/town/[region]/page.tsx",
    "app/town/write/page.tsx",
  ]) {
    assert.match(read(p), /components\/PageHead"/, `${p} 가 PageHead 를 쓴다`);
  }
  /* 화면 제목은 t-title 하나 — 뉴스룸의 t-display 머리는 걷었다 */
  assert.ok(!code("app/town/news/page.tsx").includes("t-display"), "뉴스룸 머리 t-display 없음");
  /* TownHero 호출부(청약·입주·공매·정비사업·Q&A)는 그대로 — API 불변 */
  for (const p of ["app/apply/page.tsx", "app/auctions/page.tsx", "app/supply/page.tsx", "app/redevelopment/page.tsx", "app/qna/page.tsx"]) {
    assert.match(read(p), /<TownHero/, `${p} TownHero 유지`);
  }
});

test("[1022] 글자 — 담당 J 범위에 임의 px(text-[NNpx])·text-xs·굵기 800 이 없다(램프 유틸만)", () => {
  const bad: string[] = [];
  for (const p of scopedFiles()) {
    const src = read(p).replace(/\/\*[\s\S]*?\*\//g, "");
    if (/(?<![\w-])text-\[\d+(?:\.\d+)?px\]/.test(src)) bad.push(`${p}: text-[px]`);
    if (/(?<![\w:-])text-xs(?![\w-])/.test(src)) bad.push(`${p}: text-xs`);
    if (/font-extrabold|font-black|font-\[800\]|fontWeight:\s*800/.test(src)) bad.push(`${p}: 800`);
    if (/(?<![\w-])md:t-(?:caption|sub|body|section|title|display)(?![\w-])/.test(src)) bad.push(`${p}: md:t-* (효과 없는 변형)`);
  }
  assert.deepEqual(bad, []);
});

test("[1022] 테마 — 전문가 3화면의 네이비 면(brand-navy-card·워터마크)이 흰 카드로, 지도 패널 실패 고지는 흰 카드", () => {
  for (const p of ["app/town/experts/page.tsx", "app/town/experts/join/page.tsx", "app/town/experts/[id]/page.tsx"]) {
    const src = read(p);
    assert.ok(!src.includes("brand-navy-card"), `${p} 네이비 카드 없음`);
    assert.ok(!src.includes("BrandWatermark"), `${p} 워터마크 없음`);
    assert.ok(!/text-on-dark/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), `${p} on-dark 글자 토큰 없음`);
  }
  const panel = read("app/map/ComplexInfoPanel.tsx");
  assert.ok(!panel.includes("bg-warning-soft px"), "실패 고지의 경고색 면 없음");
});

test("[1022] 문구 — 권유문·부연 라벨 제거(동네 피드 빈 상태 · 뉴스 댓글 · 뉴스 상세 · 노트 카드 · 노트 상세)", () => {
  assert.ok(!code("app/town/feed-client.tsx").includes("남겨 보세요"));
  assert.ok(!code("app/town/news/[id]/CommentThread.tsx").includes("남겨보세요"));
  assert.ok(!code("app/town/news/[id]/page.tsx").includes("공유해 보세요"));
  assert.ok(!code("app/notes/[id]/card/NoteCardStudio.tsx").includes("넘겨 보세요"));
  assert.ok(!code("app/notes/[id]/page.tsx").includes("실데이터 기준 ·"));
  assert.ok(!code("app/town/experts/join/page.tsx").includes(">전문가 모집<"));
});

test("[1022] globals.css — append-only 블록: 캡션 11px 하한 · 표 숫자 셀 오른쪽 정렬", () => {
  const css = read("app/globals.css");
  const i = css.indexOf("[1022 · 정렬·글씨·테마]");
  assert.ok(i > 0, "블록이 있다");
  const block = css.slice(i);
  assert.match(block, /--fs-caption:\s*11px/);
  assert.match(block, /:is\(td, th\)\.t-num\s*\{\s*text-align:\s*right/);
  assert.ok(!/font-size:\s*\d+px/.test(block), "블록 안에 임의 px 글자 크기 없음");
});
