/* [1094] 소유자 2026-10-26 "추가적인 기능, 디자인 등 대규모 개선을 진행해줘".
 *  기능 1 — 죽은 링크 6,003개: search_complex_mv(40,317곳)에는 전월세만 있는 단지가 6,003곳인데 단지 화면은 매매 실거래가 있어야 존재한다
 *  (complex/[id]/layout exists → trade · apartment). 동 화면 "나머지" 목록 · 3D 동네 지도 · 검색(이름 · 조건) 결과가 그 단지에 링크를 걸어
 *  404 였다(운영 실측 상계동 7곳 · 로컬 크롤 806 링크 중 11개 404 가 전부 이것). → 세 원천 모두 trade_count 0 을 뺀다(null 은 모름 → 둔다).
 *  기능 2 — 검색의 동 줄에 "실거래 ›"(법정동 실거래 화면 /dong · 1083) · 푸터 데이터 묶음에 "동별 실거래"(1069 와 같은 끊긴 묶음).
 *  디자인 — 공개 화면의 빈 상태 · 실패 문구 10곳을 사실 낱말로("○○ 없음" · "○○ 불러오기 실패 · 잠시 후 다시"). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("전월세만 있는 단지는 목록에서 뺀다 — 동 화면 · 3D 지도(loadDongComplexes) · 조건 검색 · 이름 검색 · null 은 모름(둔다)", () => {
  const dong = strip(read("lib/dong/landing.ts"));
  assert.match(dong, /for \(const r of rows\) \{\s*if \(num\(r\.trade_count\) === 0\) continue;/);
  /* 페이지 끝 판정은 RPC 행 수로 — 걸러낸 수로 하면 일찍 멈춘다 */
  assert.match(dong, /if \(rows\.length < RPC_PAGE \|\| offset \+ rows\.length >= total\) break;/);
  assert.doesNotMatch(dong, /out\.length >= total/);
  const filtered = strip(read("lib/search/intent-server.ts"));
  assert.match(filtered, /const tradeable = rows\.filter\(\(r\) => num\(r\.trade_count\) === null \|\| \(num\(r\.trade_count\) \?\? 0\) > 0\);\s*return \{\s*hits: tradeable\.map\(/);
  assert.match(filtered, /total: num\(rows\[0\]\?\.total_count\) \?\? 0,/, "총 개수는 MV 기준 그대로");
  const preview = strip(read("lib/search/complex-search.ts"));
  assert.match(preview, /\.filter\(\(r\) => r\.trade_count == null \|\| Number\(r\.trade_count\) > 0\);\s*return rankPreviewRows\(parseComplexQuery\(q\), rows\);/);
  /* 인근 단지(단지 화면 레일)는 매매 집계표(complex_tx_stats_base)라 원래 안전하다 */
  assert.match(strip(read("lib/complex/complex-store.ts")), /\.from\("complex_tx_stats_base"\)/);
});

test("검색 — 동 줄은 두 갈래(단지 보기 · 실거래 ›) · 주소는 서버가 같은 원천(regions[0] · dong)으로 만든다", () => {
  const server = strip(read("lib/search/intent-server.ts"));
  assert.match(server, /import \{ dongPath \} from "@\/lib\/dong\/format";/);
  assert.match(server, /href: r\.kind === "dong" && r\.dong && r\.regions\.length === 1 \? dongPath\(r\.regions\[0\], r\.dong\) : null,/);
  assert.match(server, /href: string \| null;/);
  assert.match(read("app/search/unified-suggest.ts"), /href\?: string \| null;/);
  const client = strip(read("app/search/search-client.tsx"));
  assert.match(client, /\{a\.href && \(\s*<Link\s+href=\{a\.href\}\s+className="inline-flex min-h-10 shrink-0 items-center self-center rounded-full border border-line px-3 t-sub font-bold text-ink no-underline hover:border-primary hover:text-primary"\s*>\s*실거래 ›\s*<\/Link>\s*\)\}/);
  assert.match(client, /<span className="shrink-0 t-sub font-bold text-primary">단지 보기 ›<\/span>/);
  /* 범위 줄(ScopeBar) — 검색어가 동으로 해석되면 지역 줄이 숨고 범위 줄이 선다(운영 실측 "상계동") → 거기에도 "<동> 실거래 ›" */
  assert.match(server, /href: s\.kind === "dong" && s\.dong && s\.regions\.length === 1 \? dongPath\(s\.regions\[0\], s\.dong\) : null,/);
  assert.match(read("app/search/unified-suggest.ts"), /scope: \{ label: string; kind: string; q: string; lat: number \| null; lng: number \| null; href\?: string \| null \} \| null;/);
  const scope = strip(read("app/search/SearchScope.tsx"));
  assert.match(scope, /\{intent\.scope\?\.href && \(\s*<Link\s+href=\{intent\.scope\.href\}\s+prefetch=\{false\}/);
  assert.match(scope, /\{intent\.scope\.label\.split\(" "\)\.at\(-1\)\} 실거래 ›/);
  /* 동 화면 주소 규칙은 하나(lib/dong/format dongPath · 공백 → 하이픈) */
  assert.match(read("lib/dong/format.ts"), /export function dongPath\(region: string, dong: string\): string \{\s*return `\/dong\/\$\{encodeURIComponent\(regionSlugOf\(region\)\)\}\/\$\{encodeURIComponent\(dong\)\}`;/);
});

test("동별 실거래(/dong) 입구 — [1108] 푸터에서 상단 메뉴 실거래 하위로(실거래 구간 바로 다음) · 푸터 묶음 4개 그대로", () => {
  const nav = read("app/components/nav-data.ts");
  assert.match(nav, /\{ label: "실거래 구간", href: "\/tx" \},\s*\{ label: "동별 실거래", href: "\/dong" \}/);
  const f = read("app/components/Footer.tsx");
  assert.doesNotMatch(f, /href: "\/dong"/);
  assert.match(f, /const LINK_GROUPS = \[/);
});

test("문구 — 공개 화면의 빈 상태 · 실패 안내는 사실 낱말(권유 · 구어 없음)", () => {
  const CASES: [string, string, string[]][] = [
    ["app/complex/[id]/PriceTab.tsx", "이 면적대 실거래 없음", ["이 면적대의 실거래가 표에 없어요"]],
    ["app/town/news/NewsListClient.tsx", '관련 기사 {more ? "받은 목록에 없음" : "없음"}', ["지금까지 받은 목록엔 없어요", "아직 없어요"]],
    ["app/map/map-client.tsx", "조건에 맞는 등록 매물 없음", ["등록 매물이 이 화면에 없어요"]],
    ["app/map/map-client.tsx", "회사 위치 확인 실패 · 잠시 후 다시", ["회사 위치를 확인할 수 없어요"]],
    ["app/complex/[id]/MyRecordsTab.tsx", "내 기록 불러오기 실패 · 잠시 후 다시", ["지금은 내 기록을 불러올 수 없어요"]],
    ["app/complex/[id]/AskingCheckPanel.tsx", "최근 24개월 이 단지 매매 실거래 신고 없음 · 비교할 거래 없음", ["위치를 말할 수 없어요"]],
    ["app/town/groups/[id]/page.tsx", "모임 없음</div>", ["모임을 찾을 수 없어요</div>", "정원이 차서"]],
    ["app/town/groups/[id]/chat/page.tsx", "모임 없음</div>", ["모임을 찾을 수 없어요</div>"]],
    ["app/analysis/MapPickDrawer.tsx", "지도 불러오기 실패 · 아래 목록이나 검색으로 선택", ["지도를 불러오지 못했어요"]],
    ["app/components/ui/EmptyState.tsx", 'title = "불러오기 실패 · 잠시 후 다시"', ["지금은 불러올 수 없어요"]],
  ];
  for (const [p, want, gone] of CASES) {
    const s = strip(read(p));
    assert.ok(s.includes(want), `${p}: ${want}`);
    for (const g of gone) assert.ok(!s.includes(g), `${p}: 남은 옛 문구 ${g}`);
  }
});
