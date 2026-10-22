/* [1083] 소유자 2026-10-21 — "잔여 사용량의 절반으로 큰 폭 개선" 1차(검색 유입·콘텐츠). 가이드 15 → 27편(+12 · 분류 2 추가 · 레거시 2 포함) · 용어 56 → 108개(+52) ·
 *  분류별 관련 링크 · 단지 상세 "읽을거리 · 용어" · 허브 설명문. 원칙: 해마다 바뀌는 수치는 적지 않는다 · 느낌표·권유형 없음 · 없는 주소 없음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES, GUIDE_BY_SLUG, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { guideRelatedLinks } from "@/lib/guides/related-links";
import { GLOSSARY_CATEGORY_ORDER, GLOSSARY_TERMS, findGlossaryTerm } from "@/lib/seo/glossary-terms";
import { EXPLAIN_TERM_NAMES } from "@/lib/explain/term-index";
import { glossaryMetaDescription, glossaryUsageLinks } from "@/lib/seo/glossary-related";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const NEW_GUIDES = [
  "jeonip-hwakjeong", "gaengsin-cheonggu", "gyeyakgeum-jangeum", "hwagin-seolmyeongseo", "jeonse-sagi-yuhyeong", "junggae-bosu",
  "jaegaebal-jaegeonchuk-jeolcha", "gwanlibi-ilkgi", "sajeon-jeomgeom", "imjang-dongseon", "soeum-nusu-gyeollo", "gongsi-vs-silgeorae",
];
const NEW_TERMS = [
  "jeonip-singo", "imdaecha-singo", "muksijeok-gaengsin", "jeonwolse-sanghan", "kkangtong-jeonse", "yeokjeonse", "jeonse-bojeung-boheom", "imchagwon-deunggi",
  "choeusun-byeonje", "jangi-suseon-chungdanggeum", "seonsu-gwanlibi", "pyojebu", "gapgu", "eulgu", "chaegwon-choegoaek", "gaapryu", "gacheobun", "gadeunggi",
  "sintak-deunggi", "jisanggwon", "gagyeyakgeum", "haeyakgeum", "jungdogeum", "jangeum", "hwagin-seolmyeongseo", "junggae-bosu", "daeji-jibun", "yongjeongnyul",
  "geonpyeyul", "bay", "balkoni-hwakjang", "pilloti", "bokdosik-gyedansik", "johap-seollip-inga", "saeop-sihaeng-inga", "gwalli-cheobun-inga", "gwolli-sanjeong-gijunil",
  "jeonmae-jehan", "silgeoju-uimu", "cheongyak-tongjang", "ipju-jijeong-gigan", "jipdan-daechul", "janggeum-daechul", "gijun-siga", "boyuse", "ipchal-bojeunggeum",
  "nakchalga-yul", "yuchal", "myeongdo", "malso-gijun-gwolli", "baedang-yogu-jonggi", "onbid",
];
const CALCULATOR_TOOL_IDS = [...read("app/calculator/tools.tsx").matchAll(/^\s+id: "([a-z-]+)",/gm)].map((m) => m[1]);
const STATIC_OK = new Set(["/tx", "/map", "/reports", "/calculator", "/apply", "/apply/calendar", "/supply", "/auctions", "/redevelopment", "/notes/new", "/notes", "/imjang", "/glossary", "/guides", "/analysis/temperature", "/analysis/gap", "/rent", "/methodology", "/data-sources"]);
function hrefOk(href: string): boolean {
  const path = href.split("?")[0];
  let m = /^\/glossary\/([^/]+)$/.exec(path);
  if (m) return findGlossaryTerm(m[1]) !== null;
  m = /^\/guides\/([^/]+)$/.exec(path);
  if (m) return GUIDE_BY_SLUG.has(m[1]) || LEGACY_GUIDES.some((g) => g.slug === m[1]);
  m = /^\/calculator\/([^/]+)$/.exec(path);
  if (m) return m[1] === "rent-vs-buy" || CALCULATOR_TOOL_IDS.includes(m[1]);
  return STATIC_OK.has(path);
}
const BANNED = /!|해 보세요|하세요|보세요|세요\.|대개 |통상 |흔히 /;

test("가이드 — 카탈로그 25 + 레거시 2 = 27편 · 12편 추가 · 분류 7 · 슬러그·링크 실재 · 문체 규칙", () => {
  assert.equal(GUIDES.length, 25);
  assert.equal(GUIDES.length + LEGACY_GUIDES.length, 27);
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, 25);
  for (const g of GUIDES) assert.ok(!LEGACY_GUIDES.some((l) => l.slug === g.slug), `${g.slug} 가 레거시와 겹친다`);
  const cats = new Set(GUIDES.map((g) => g.category));
  assert.deepEqual([...cats].sort(), ["경매·공매", "계약·권리", "실거래 읽기", "임장", "전세", "정비사업·관리", "청약·분양"].sort());
  for (const slug of NEW_GUIDES) {
    const g = GUIDE_BY_SLUG.get(slug);
    assert.ok(g, slug);
    assert.equal(g.updatedAt, "2026-10-21", slug);
    assert.ok(g.description.length <= 60, `${slug} description ${g.description.length}`);
    assert.ok(g.metaDescription.length >= 100 && g.metaDescription.length <= 160, `${slug} meta ${g.metaDescription.length}`);
    assert.ok(g.sections.length >= 3 && g.sections.length <= 4, `${slug} sections`);
    assert.ok(g.faq.length >= 2, `${slug} faq`);
    assert.equal(g.tools.length, 3, `${slug} tools`);
    for (const t of g.tools) assert.ok(hrefOk(t.href), `${slug} tool ${t.href}`);
    for (const r of g.related) assert.ok(GUIDE_BY_SLUG.has(r) || LEGACY_GUIDES.some((l) => l.slug === r), `${slug} related ${r}`);
    const text = [g.title, g.description, g.metaDescription, g.intro, ...(g.keyPoints ?? []).map((k) => `${k.k} ${k.v}`), ...g.sections.flatMap((s) => [s.heading, ...s.body, ...(s.keys ?? [])]), ...g.faq.flatMap((f) => [f.q, f.a, ...(f.keys ?? [])])].join("\n");
    for (const line of text.split("\n")) assert.doesNotMatch(line, BANNED, `${slug}: ${line.slice(0, 80)}`);
    assert.doesNotMatch(text, /\d{1,2}\.\d%\s*(세율|요율)/, `${slug}: 해마다 바뀌는 세율·요율 수치`);
  }
  /* 분류마다 관련 묶음이 있고 전부 실재 */
  for (const c of cats) {
    const r = guideRelatedLinks(c);
    assert.ok(r.terms.length >= 4 && r.tools.length === 3, c);
    for (const l of [...r.terms, ...r.tools]) assert.ok(hrefOk(l.href) || /^\/region\//.test(l.href), `${c} → ${l.href}`);
  }
  const order = /const CATEGORY_ORDER = \[([^\]]+)\]/.exec(read("app/guides/page.tsx"))?.[1] ?? "";
  for (const c of cats) assert.ok(order.includes(`"${c}"`), `가이드 목록 분류 순서에 ${c} 없음`);
});

test("용어사전 — 108개 · 52개 추가 · 분류·관련·링크 실재 · 설명 155자 · ⓘ 이름 목록 일치", () => {
  assert.equal(GLOSSARY_TERMS.length, 108);
  assert.equal(new Set(GLOSSARY_TERMS.map((t) => t.slug)).size, 108);
  for (const slug of NEW_TERMS) assert.ok(findGlossaryTerm(slug), slug);
  const cats = new Set<string>(GLOSSARY_CATEGORY_ORDER);
  for (const t of GLOSSARY_TERMS) {
    assert.ok(cats.has(t.category), `${t.slug} 분류 ${t.category}`);
    assert.ok(t.short.length <= 60 && /\.$/.test(t.short), `${t.slug} short`);
    assert.ok(t.def.length >= 80, `${t.slug} def`);
    for (const r of t.related ?? []) {
      assert.ok(findGlossaryTerm(r), `${t.slug} related ${r} 없음`);
      assert.notEqual(r, t.slug, `${t.slug} 자기 링크`);
    }
    if (t.href) assert.ok(hrefOk(t.href) || /^\/analysis\//.test(t.href), `${t.slug} href ${t.href}`);
    assert.ok(glossaryMetaDescription(t.short, t.def).length <= 155, t.slug);
    assert.doesNotMatch([t.short, t.def, t.extra ?? ""].join("\n"), /!|해 보세요|하세요/, t.slug);
    assert.ok(glossaryUsageLinks(t.category).length >= 3, t.category);
  }
  const names = EXPLAIN_TERM_NAMES as Record<string, string>;
  assert.equal(Object.keys(names).length, 108);
  for (const t of GLOSSARY_TERMS) assert.equal(names[t.slug], t.term, t.slug);
  /* 예전 오타 janggeum(없는 슬러그) → jangeum */
  assert.deepEqual(findGlossaryTerm("junggangeum-daechul")?.related, ["bunyanggwon", "jangeum"]);
});

test("단지 상세 읽을거리 — 가이드 4·용어 4 실재 · 서버 조각 · 마운트", () => {
  const src = read("app/complex/[id]/ComplexReadMore.tsx");
  assert.doesNotMatch(src, /"use client"/);
  for (const m of src.matchAll(/const GUIDE_SLUGS = \[([^\]]+)\]/g)) for (const s of m[1].match(/"[^"]+"/g) ?? []) assert.ok(GUIDE_BY_SLUG.has(s.slice(1, -1)), s);
  for (const m of src.matchAll(/const TERM_SLUGS = \[([^\]]+)\]/g)) for (const s of m[1].match(/"[^"]+"/g) ?? []) assert.ok(findGlossaryTerm(s.slice(1, -1)), s);
  assert.match(strip(read("app/complex/[id]/page.tsx")), /<ComplexReadMore \/>/);
  /* 허브 설명문 — 새 분류·용어를 말한다 */
  assert.match(read("app/guides/page.tsx"), /계약갱신청구권/);
  assert.match(read("app/glossary/page.tsx"), /말소기준권리/);
});
