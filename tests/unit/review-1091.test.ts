/* [1091] 소유자 2026-10-25 "추가로 더 진행해줘" + "최적화에는 성능뿐만 아니라 문구 · 글씨체 · 정렬 · 위치 · 구성 등 디자인 요소,
 *  기능적 요소도 포함" — 비용(계속) + 화면 점검(주요 16화면 폰 · 데스크톱 캡처 · 빈 여백 · 탭 크기 · 문구 규칙).
 *  비용: 404 몸체를 클라이언트 조각으로(모든 화면 RSC −4KB×2) · 단지 월별 집계 전송 압축(RSC 12KB → 약 4KB) · 실거래 적재는 바뀐 행만
 *  넣고 그 단지만 비움(지역 태그는 id 비움이 상한에 걸린 날에만 · 그때도 지역 안 묶음). 화면: 단지 화면 "실거래 없음" 세 번 → 한 번 · 토론 칸 빈 상태 110px 공백 · 동 화면 7열 표 첫 열 고정 ·
 *  매물 비교 트레이 권유문 · 임의 px. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPLEX_BUCKETS,
  COMPLEX_BUCKET_TAG_MAX,
  complexBucket,
  complexBucketTag,
  complexInvalidationTagsFor,
  complexRegionTag,
} from "../../lib/complex/region-tag";
import { fromHubTradeWire, toHubTradeWire, toHubTrades, type TxMonthLike } from "../../lib/complex/hub-trades";
import { pickChangedRows } from "../../lib/market/molit-core";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/* ── 비용 ─────────────────────────────────────────────────────────────── */

test("404 — 몸체는 클라이언트 조각(모든 화면 RSC 에서 빠진다) · not-found.tsx 는 메타 + 참조만 · 문구 · 폼 · 링크 그대로", () => {
  const shell = strip(read("app/not-found.tsx"));
  assert.match(shell, /import NotFoundBody from "\.\/components\/NotFoundBody";/);
  assert.match(shell, /export default function NotFound\(\) \{\s*return <NotFoundBody \/>;\s*\}/);
  assert.doesNotMatch(shell, /"use client"|<main|<form|cookies\(|headers\(/);
  const body = read("app/components/NotFoundBody.tsx");
  assert.match(body, /^"use client";/);
  assert.match(body, /<main id="main-content" data-nz-noads=""/);
  assert.match(body, /<form\s+action="\/search"\s+method="get"/);
  assert.match(body, /페이지 없음<span className="text-brand-red">\.<\/span>/);
  for (const href of ["/complex/browse", "/tx", "/town/news", "/town", "/notes", "/map"]) assert.ok(body.includes(`"${href}"`), href);
});

test("단지 월별 집계 전송 압축 — fromHubTradeWire(toHubTradeWire(tx)) 는 toHubTrades(tx) 와 같다 · 바이트는 절반 아래", () => {
  const tx: TxMonthLike[] = [
    { yyyymm: "202607", avg_manwon: 201000, min_manwon: 201000, max_manwon: 201000, deal_count: 1, bands: [{ slug: "under-60", avg_manwon: 201000, min_manwon: 201000, max_manwon: 201000, deal_count: 1 }] },
    { yyyymm: "202608", avg_manwon: 309000, min_manwon: 289000, max_manwon: 347000, deal_count: 4, area_m2: 84.95, bands: [
      { slug: "60-85", avg_manwon: 300000, min_manwon: 289000, max_manwon: 310000, deal_count: 3 },
      { slug: "102-135", avg_manwon: 347000, min_manwon: 347000, max_manwon: 347000, deal_count: 1 },
    ] },
    { yyyymm: "202609", avg_manwon: 293125, min_manwon: 269000, max_manwon: 328000, deal_count: 4, bands: [] },
    { yyyymm: "202610", avg_manwon: 300000, min_manwon: null, max_manwon: null, deal_count: 2 },
  ];
  const wire = toHubTradeWire(tx);
  assert.deepEqual(fromHubTradeWire(wire), toHubTrades(tx));
  assert.deepEqual(wire[1], ["202608", 309000, 4, 289000, 347000, 84.95, [["60-85", 300000, 289000, 310000, 3], ["102-135", 347000, 347000, 347000, 1]]]);
  assert.deepEqual(wire[3], ["202610", 300000, 2, null, null, null, []]);
  const before = JSON.stringify(toHubTrades(tx)).length;
  const after = JSON.stringify(wire).length;
  assert.ok(after < before * 0.5, `${after} < ${before}/2`);
  /* 배선: 서버는 압축 행을 넘기고, 탭은 받아서 편다 */
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.match(page, /tradesWire=\{v\.tradesWire\}/);
  assert.doesNotMatch(page, /trades=\{v\.trades\}/);
  const hub = strip(read("app/complex/[id]/hub-client.tsx"));
  assert.match(hub, /const trades: HubTrade\[\] = useMemo\(\(\) => fromHubTradeWire\(tradesWire\), \[tradesWire\]\);/);
});

test("지역 안 묶음 태그 — 같은 이름은 같은 묶음 · 적재는 묶음만(상한 안) 아니면 지역 · 화면은 지역 + 묶음 두 태그", () => {
  assert.equal(COMPLEX_BUCKETS, 32);
  assert.equal(complexBucket("헬리오시티"), complexBucket(" 헬리오시티 "), "공백 정규화");
  assert.ok(complexBucket("헬리오시티") >= 0 && complexBucket("헬리오시티") < 32);
  const names = Array.from({ length: 400 }, (_, i) => `단지${i}`);
  const used = new Set(names.map((n) => complexBucket(n)));
  assert.ok(used.size >= 28, `400개 이름이 묶음 ${used.size}개에 퍼진다`);
  assert.equal(complexBucketTag("서울 송파구", "헬리오시티"), `${complexRegionTag("서울 송파구")}:${complexBucket("헬리오시티")}`);
  assert.equal(complexBucketTag("서울 송파구", ""), null);
  const few = complexInvalidationTagsFor([{ region: "서울 송파구", name: "헬리오시티" }, { region: "서울 송파구", name: "헬리오시티" }, { region: "안양 동안구", name: "래미안" }]);
  assert.equal(few.mode, "bucket");
  assert.equal(few.tags.length, 2);
  const many = complexInvalidationTagsFor(Array.from({ length: COMPLEX_BUCKET_TAG_MAX + 50 }, (_, i) => ({ region: `지역${i % 200}`, name: `단지${i}` })));
  assert.equal(many.mode, "region");
  assert.ok(many.tags.length <= 200);
  assert.ok(many.tags.every((t) => !/:\d+$/.test(t)), "지역 태그는 묶음 번호가 없다");
  const cache = strip(read("lib/complex/region-tag-cache.ts"));
  assert.match(cache, /const bucket = complexBucketTag\(region, name\);\s*const tags = bucket \? \[tag, bucket\] : \[tag\];/);
});

test("실거래 적재 — 받은 행 가운데 DB 와 다른 행만(새 키 · 해제 표식 변경) 넣고 그 단지만 건드린 단지로 센다 · 읽기 실패면 전부", () => {
  const existing = new Map<string, boolean>([
    ["molit-cron:a", false],
    ["molit-cron:b", false],
    ["molit-cron:c", true],
  ]);
  const rows = [
    { external_key: "molit-cron:a", is_cancelled: false, complex_name: "같음" },
    { external_key: "molit-cron:b", is_cancelled: true, complex_name: "해제됨" },
    { external_key: "molit-cron:c", is_cancelled: true, complex_name: "같음(해제)" },
    { external_key: "molit-cron:d", is_cancelled: false, complex_name: "새 거래" },
  ];
  assert.deepEqual(
    pickChangedRows(rows, existing).map((r) => r.complex_name),
    ["해제됨", "새 거래"],
  );
  assert.equal(pickChangedRows(rows, new Map()).length, 4, "기존 행이 없으면 전부 새 행");
  const tx = strip(read("lib/market/molit-transactions.ts"));
  assert.match(tx, /export async function readExistingKeys\(/);
  assert.match(tx, /\.select\("external_key,is_cancelled"\)\s*\.eq\("region_code", regionCode\)\s*\.eq\("contract_ym", yyyymm\)\s*\.in\("property_type", propertyTypes\)\s*\.range\(page \* PAGE, page \* PAGE \+ PAGE - 1\);/);
  assert.match(tx, /if \(error\) return null;/, "읽기 실패 → null → 전부 넣는다");
  assert.match(tx, /const existing = \(count \?\? 0\) > 0 \? await readExistingKeys\(sb, info\.sigunguCd, yyyymm, propertyTypes\) : new Map<string, boolean>\(\);\s*const payload = existing \? pickChangedRows\(fetched, existing\) : fetched;/);
  assert.match(tx, /if \(payload\.length === 0\) \{[\s\S]*?status: "unchanged" \}\);\s*continue;\s*\}/);
  /* upsert 성공 뒤 · 바뀐 행(payload)의 단지만 */
  assert.match(tx, /result\.inserted \+= payload\.length;\s*for \(const r of payload\) touched\.note\(regionName, String\(r\.complex_name \?\? ""\)\);/);
  assert.match(tx, /같음=\$\{result\.unchanged\}행/);
  /* 크론: 바뀐 행이 0 이면 비움 없음(그대로) · 태그 비움은 id 비움이 상한에 걸린 날에만 */
  const route = strip(read("app/api/cron/molit-transactions-ingest/route.ts"));
  assert.match(route, /if \(run\.value\.inserted > 0\) \{\s*invalidateAfterIngest\("molit"\);\s*touchedStats = await invalidateTouchedComplexes\(run\.value\);\s*\}/); // [1093] 비교 조합 좁히기로 async
  assert.match(route, /if \(stats\.truncated \|\| result\.touchedTruncated\) \{\s*const inv = complexInvalidationTagsFor\(result\.touchedComplexes\);/);
});

/* ── 화면 ─────────────────────────────────────────────────────────────── */

test("단지 화면 — 실거래 없는 단지에서 같은 문장 셋 → 그래프 자리 안내 카드 제거(머리 줄 · 최근 실거래 표가 말한다)", () => {
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.match(page, /\{trend && <TxTrendLazy data=\{trend\} complexName=\{v\.name\} \/>\}/);
  assert.doesNotMatch(page, /신고된 매매·전월세 실거래 없음/);
  assert.match(read("app/complex/[id]/RecentDealsTable.tsx"), /아직 신고된 매매 실거래 없음/);
});

test("토론 칸 — min-h 160 은 뼈대 동안만(빈 상태 · 실패 안내는 제 높이)", () => {
  const src = strip(read("app/components/talk/TalkPanel.tsx"));
  assert.match(src, /className=\{`relative flex-1 overflow-y-auto \$\{feedMax\} \$\{feed\.status !== "ok" \|\| feed\.regionId !== selectedId \? "min-h-\[160px\]" : ""\}`\}/);
});

test("옆으로 미는 표 — 첫 열 고정(HScroll stickyFirst) · 동 화면 단지 표 두 벌에 적용 · 밀린 뒤에만 선", () => {
  const h = strip(read("app/components/HScroll.tsx"));
  assert.match(h, /stickyFirst = false,/);
  assert.match(h, /setScrolled\(el\.scrollLeft > 2\);/);
  assert.match(h, /\$\{stickyFirst \? "nz-hscroll-sticky" : ""\} \$\{stickyFirst && scrolled \? "nz-hscroll-scrolled" : ""\}/);
  /* [1092] 표는 클라이언트 조각(DongComplexTable · 압축 행)으로 — 같은 두 표 · 같은 고정 열 */
  const dong = strip(read("app/dong/[region]/[dong]/DongComplexTable.tsx"));
  assert.equal((dong.match(/<HScroll className="lq-panel mt-[23] max-md:mt-2" stickyFirst>|<HScroll className="lq-panel mt-2" stickyFirst>/g) ?? []).length, 2);
  const css = read("app/globals.css");
  assert.match(css, /\.nz-hscroll-sticky table :is\(th, td\):first-child \{\s*position: sticky;\s*left: 0;/);
  assert.match(css, /\.nz-hscroll-scrolled table :is\(th, td\):first-child \{\s*box-shadow: 1px 0 0 var\(--border\);/);
  /* 1022 뒤 globals.css 규칙 — raw hex · gradient · 800 · px 글자 없음 */
  const tail = css.slice(css.indexOf("[1091] 옆으로 미는 표"));
  assert.doesNotMatch(tail, /#[0-9a-fA-F]{6}\b|gradient|font-weight:\s*8|font-size:\s*\d/);
});

test("매물 비교 트레이 — 권유문 · 임의 px 없음(사실 낱말 · 램프)", () => {
  const src = strip(read("components/ListingCompareTray.tsx"));
  assert.doesNotMatch(src, /해 보세요|있어요|뺐어요|비웠어요|text-\[1\dpx\]/);
  assert.match(src, /\{canCompare \? "비교 가능" : `\$\{MIN_COMPARE\}개부터 비교`\}/);
  assert.match(src, /showToast\("비교함에서 제외"/);
});
