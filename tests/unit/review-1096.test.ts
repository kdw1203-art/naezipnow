/* [1096] 소유자 2026-10-26 "고도화 및 최적화 및 성능 및 디자인 향상을 진행해줘".
 *  고도화 — 실거래 허브의 시/도 묶음: 카탈로그만으로는 /tx 214곳 중 142곳(239,772건) · /dong 192곳 중 87곳이 "그 밖의 지역"이었다.
 *  시군구 코드 표(건축HUB)의 행마다 적재 표기 규칙(molitRegionLabel)으로 라벨을 만들어 시/도를 읽는다(sidoOfMarketRegionName) —
 *  지어낸 매핑 없음 · 같은 라벨이 두 시/도면(고성군) null · 알림의 sidoOfRegionName 은 그대로.
 *  최적화 — 비교 허브(1,842KB) 타일 1,119개 · 동 허브(420KB) 192줄 → 클라이언트 조각 + 압축 행(RSC 에 props 만).
 *  성능 — 고정 px sizes 썸네일(62px)이 384w 를 받던 것 → 그 칸의 1x·2x·3x 폭만(128w 2.5KB vs 384w 11.7KB · 노트 허브 82장).
 *  디자인 — 동 허브 192줄 한 목록 → 시/도 details(첫 묶음 펼침) · 비교 허브 칩이 가리키는 접힌 지역을 펼침 · 요약 줄 가운뎃점 홀로 남지 않게. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupBySido, sidoOfMarketRegionName, sidoOfRegionName, OTHER_SIDO_LABEL } from "../../lib/market/sido-group";
import { buildComplexPairSlug } from "../../lib/market/complex-pair-slug";
import { IMAGE_ALL_WIDTHS, IMAGE_SRCSET_WIDTHS, srcSetWidthsFor } from "../../lib/images/srcset";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("시/도 전수 해석 — 코드 표 라벨(molitRegionLabel)로 도 단위 시·군·구까지 · 모호한 라벨은 null · 알림용 sidoOfRegionName 은 그대로", () => {
  const CASES: [string, string | null][] = [
    ["목포시", "전남"],
    ["포항 남구", "경북"],
    ["청주 흥덕구", "충북"],
    ["천안 서북구", "충남"],
    ["전주 완산구", "전북"],
    ["김해시", "경남"],
    ["창원 마산회원구", "경남"],
    ["원주시", "강원"],
    ["제주시", "제주"],
    ["광주시", "경기"],
    ["부천 원미구", "경기"],
    ["화성 동탄구", "경기"],
    ["광주 광산구", "광주"],
    ["서울 강남구", "서울"],
    ["세종시", "세종"],
    /* 강원 고성군 · 경남 고성군 — 실거래 표기가 같아 모른다고 둔다 */
    ["고성군", null],
    ["", null],
  ];
  for (const [name, want] of CASES) assert.equal(sidoOfMarketRegionName(name), want, name);
  /* 998 규칙(카탈로그만 · 모르면 null)은 알림 구독 해석이 쓰므로 그대로 */
  assert.equal(sidoOfRegionName("목포시"), null);
  assert.equal(sidoOfRegionName("포항 남구"), null);
  /* 넷째 인자 — 기본은 종전 해석기(그 밖의 지역) · 허브는 전수 해석기 */
  const rows = [{ name: "김해시", tx: 5 }, { name: "서울 강남구", tx: 3 }];
  assert.deepEqual(groupBySido(rows, (r) => r.name, (r) => r.tx).map((g) => g.sido), ["서울", OTHER_SIDO_LABEL]);
  assert.deepEqual(groupBySido(rows, (r) => r.name, (r) => r.tx, sidoOfMarketRegionName).map((g) => g.sido), ["경남", "서울"]);
  const src = strip(read("lib/market/sido-group.ts"));
  assert.match(src, /const top = getSigunguInfo\(`\$\{info\.sigunguCd\.slice\(0, 2\)\}000`\);/, "시/도는 코드 앞 두 자리의 시도 행에서");
  assert.match(src, /else if \(prev !== short\) map\.set\(label, null\);/, "같은 라벨 두 시/도 → null");
  assert.match(strip(read("app/tx/page.tsx")), /groupBySido\(regions, \(r\) => r\.name, \(r\) => r\.txCount, sidoOfMarketRegionName\)/);
  assert.match(strip(read("lib/alerts/region-value.ts")), /import \{ sidoOfRegionName \} from "@\/lib\/market\/sido-group";/, "알림은 종전 해석기");
});

test("동 허브 — 시/도 details(첫 묶음 펼침) · 줄은 클라이언트 조각이 압축 행으로 · 지역마다 거래 많은 동은 최댓값으로", () => {
  const page = strip(read("app/dong/page.tsx"));
  assert.match(page, /groupBySido\(groups, \(g\) => g\.region, \(g\) => g\.total, sidoOfMarketRegionName\)/);
  assert.match(page, /const top = g\.items\.reduce\(\(m, d\) => \(d\.recentTradeCount > m\.recentTradeCount \? d : m\)\);/);
  assert.match(page, /return \[g\.regionSlug, g\.region, g\.items\.length, g\.total, top\.dong, top\.recentTradeCount\];/);
  assert.match(page, /<DongHubGroups groups=\{sidoGroups\} \/>/);
  assert.doesNotMatch(page, /dongPath\(|<li |IntentLink/, "줄 마크업은 서버 쪽에 없다");
  assert.match(page, /listSitemapDongs\(\)/);
  assert.match(page, /export const revalidate = 86_400;/);
  const c = strip(read("app/dong/DongHubGroups.tsx"));
  assert.match(c, /^"use client";/);
  assert.match(c, /export type DongHubRegionWire = \[string, string, number, number, string, number\];/);
  assert.match(c, /<details key=\{sido\} open=\{gi === 0\}/);
  assert.match(c, /<summary className="flex min-h-10 cursor-pointer/, "폰 탭 40px");
  assert.match(c, /href=\{dongPath\(region, topDong\)\}/);
  assert.match(c, /\{dongCount > 1 && \(/);
  assert.match(c, /\{n\(dongCount - 1\)\}곳 더 ›/);
  assert.doesNotMatch(c, /gradient|font-extrabold|font-black|!/, "그라데이션 · 800 · 느낌표 없음");
});

test("비교 허브 — 타일 1,119개는 클라이언트 조각(압축 행) · 주소는 이름·지역에서(비교 화면과 같은 규칙) · 칩이 가리키는 접힌 지역 펼침", () => {
  assert.equal(buildComplexPairSlug("래미안 A", "B단지", "seoul-gangnam"), `${encodeURIComponent("래미안 A")}--${encodeURIComponent("B단지")}--seoul-gangnam`);
  const pairs = strip(read("lib/market/complex-pairs.ts"));
  assert.match(pairs, /import \{ buildComplexPairSlug \} from "@\/lib\/market\/complex-pair-slug";/);
  assert.match(pairs, /export \{ buildComplexPairSlug \};/);
  assert.match(pairs, /return `\/complex\/compare\/\$\{buildComplexPairSlug\(pair\.complexA, pair\.complexB, pair\.region\.id\)\}`;/);
  const page = strip(read("app/complex/compare/page.tsx"));
  assert.match(page, /<ComparePairTiles\s+regionId=\{group\.regionId\}\s+pairs=\{group\.pairs\.map\(\(pair\): ComparePairWire => \[pair\.complexA, pair\.complexB, pair\.dong, pair\.tradeCountA, pair\.tradeCountB\]\)\}\s*\/>/);
  assert.doesNotMatch(page, /pair\.complexA\s*<span|complexPairPath\(pair\)/, "타일 마크업은 서버 쪽에 없다");
  /* 1074 · 1029 가 고정한 것은 그대로 — 칩 nav · details open · 지역 화면 링크 · groups.map 두 번 */
  assert.match(page, /aria-label="지역 바로가기"/);
  assert.match(page, /open=\{gi === 0\}/);
  assert.equal((page.match(/groups\.map\(/g) ?? []).length, 2);
  assert.match(page, /<OpenDetailsOnHash \/>/);
  /* 요약 줄 — 두 절 사이 가운뎃점 없이 간격(gap-x-3)으로(가운뎃점이 줄 끝·줄 머리에 홀로 남지 않는다) */
  assert.match(page, /<p className="rise-in mb-5 flex flex-wrap items-center gap-x-3 gap-y-0\.5 t-sub text-text-2 max-md:mb-3">/);
  assert.match(page, /\{lastYm && ` · \$\{lastYm\} 신고분까지`\}\s*<\/span>/);
  assert.doesNotMatch(page, /신고분까지`\} ·\{" "\}/);
  const tiles = strip(read("app/complex/compare/ComparePairTiles.tsx"));
  assert.match(tiles, /^"use client";/);
  assert.match(tiles, /export type ComparePairWire = \[string, string, string, number, number\];/);
  assert.match(tiles, /const slug = buildComplexPairSlug\(a, b, regionId\);/);
  assert.match(tiles, /<Link key=\{slug\} href=\{`\/complex\/compare\/\$\{slug\}`\} className="tile rounded-lg border border-border px-3 py-2\.5">/);
  assert.match(tiles, /\{dong\} · 12개월 \{n\(txA\)\}건 vs \{n\(txB\)\}건/);
  const open = strip(read("app/components/OpenDetailsOnHash.tsx"));
  assert.match(open, /^"use client";/);
  assert.match(open, /if \(el instanceof HTMLDetailsElement && !el\.open\) el\.open = true;/);
  assert.match(open, /window\.addEventListener\("hashchange", openHashDetails\);/);
  assert.match(open, /return null;/);
});

test("썸네일 srcset — 고정 px sizes 는 그 칸의 1x·2x·3x 허용 폭만 · vw 는 종전 목록 · 허용 폭 목록은 next.config 과 같다", () => {
  assert.deepEqual(srcSetWidthsFor("62px"), [64, 128, 256]);
  assert.deepEqual(srcSetWidthsFor("44px"), [48, 96, 256]);
  assert.deepEqual(srcSetWidthsFor("36px"), [48, 96, 128]);
  assert.deepEqual(srcSetWidthsFor("48px"), [48, 96, 256]);
  assert.deepEqual(srcSetWidthsFor("56px"), [64, 128, 256]);
  assert.deepEqual(srcSetWidthsFor(" 62px "), [64, 128, 256]);
  assert.deepEqual(srcSetWidthsFor("1000px"), [1080, 1920]);
  assert.deepEqual(srcSetWidthsFor("(max-width: 768px) 50vw, 33vw"), IMAGE_SRCSET_WIDTHS);
  assert.deepEqual(srcSetWidthsFor("100vw"), IMAGE_SRCSET_WIDTHS);
  assert.deepEqual(srcSetWidthsFor(undefined), IMAGE_SRCSET_WIDTHS);
  assert.deepEqual(srcSetWidthsFor("0px"), IMAGE_SRCSET_WIDTHS);
  /* 허용 폭 = next.config images.imageSizes ∪ deviceSizes(목록에 없는 w 는 400) */
  const cfg = read("next.config.ts");
  const arr = (key: string): number[] => {
    const m = new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`).exec(cfg);
    assert.ok(m, key);
    return m[1].split(",").map((v) => Number(v.trim())).filter((v) => v > 0);
  };
  const allowed = [...new Set([...arr("imageSizes"), ...arr("deviceSizes")])].sort((a, b) => a - b);
  assert.deepEqual([...IMAGE_ALL_WIDTHS], allowed);
  for (const w of IMAGE_SRCSET_WIDTHS) assert.ok(allowed.includes(w));
  const cover = strip(read("app/components/CoverImage.tsx"));
  assert.match(cover, /srcSet: buildImageSrcSet\(src as string, srcSetWidthsFor\(sizes\)\), sizes/);
  /* 노트 허브 썸네일(44px · 36px)은 CoverImage 를 거친다 — [1101] 62px 스토리 원 줄(StoryRail)은 목록과 같은 노트라 지웠다 */
  const feed = read("app/notes/notes-feed-client.tsx");
  for (const s of ['sizes="44px"']) assert.ok(feed.includes(s), s); /* [1115] 36px 레일 줄은 뺐다 */
  assert.ok(!feed.includes('sizes="62px"') && !feed.includes("function StoryRail"), "스토리 줄 없음");
});
