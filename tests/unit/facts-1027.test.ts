/* [1027 · 제안서 "먼저" 묶음] 틀린 숫자·문구, 공유 그림, 주소 정리 — 사실을 잠그는 테스트.
 *
 * 1  신고가 "직전 3년" → 실제 비교 구간       2  AI 경제·리스크·타이밍의 고정 예시 표 제거
 * 3  정비사업 추정 숫자 제거                   4  보낼 수 없는 이메일 칸 제거
 * 20 og:image 없는 쪽에 기본 그림              21 (보류 — 뉴스 사진은 소유자가 "원문 사진"으로 정한 일이라 바꾸지 않았다)
 * 22 자료 0건 쪽은 검색 제외                   23 사라진 비교 주소 301 · 단지 링크 정본 · 보관 주소 링크 제거
 * 그리고 운영 DB 에 적용한 1027 마이그레이션 4건의 사본.
 * (5 지역 알림 = alerts-1027 · 11 이력 채우기 = data-1025 · 27~29 = ops-1027)
 * 순수 함수는 실제 코드를 부르고, server-only 사슬·화면은 소스 문자열로 잠근다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { priceHighCopy, priorWindowLabel, threeYearsAgoYm, type PriceHighRow } from "../../lib/market/price-record-copy";
import { AI_PROMPT_VERSION } from "../../lib/ai/system-prompt";
import { analysisReferenceData } from "../../lib/ai/analysis-engine";

const ROOT = new URL("../../", import.meta.url);
const raw = (p: string) => readFileSync(new URL(p, ROOT), "utf8");
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const exists = (p: string) => existsSync(new URL(p, ROOT));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, ROOT))) {
    const rel = join(dir, name);
    if (statSync(new URL(rel, ROOT)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

/* ── 1 · 신고가 문구 ─────────────────────────────────────────────────────── */

test("[1027 · 1] 비교 구간 — 이력이 3년을 덮을 때만 '직전 3년', 아니면 가진 이력의 첫 달, 모르면 '수집 기간'", () => {
  const now = new Date(Date.UTC(2026, 9, 3)); // 2026-10-03
  assert.equal(threeYearsAgoYm(now), "202310");
  assert.equal(priorWindowLabel("202310", now), "직전 3년");
  assert.equal(priorWindowLabel("202101", now), "직전 3년");
  assert.equal(priorWindowLabel("202311", now), "2023.11 이후");
  assert.equal(priorWindowLabel("202501", now), "2025.01 이후");
  assert.equal(priorWindowLabel(null, now), "수집 기간");
  assert.equal(priorWindowLabel("2025-01", now), "수집 기간");
});

test("[1027 · 1] 신고가 글 — 머리·기준 문장에 '직전 3년' 없음 · 줄마다 제 구간 · 숫자는 입력 그대로", () => {
  const items: PriceHighRow[] = [
    { complex_name: "가락삼익맨숀", region_name: "서울 송파구", area: 85, deal_amount_krw: 2_730_000_000, prior_max: 2_610_000_000, prior_n: 31, contract_ym: "202609", contract_day: 28 },
    { complex_name: "강남데시앙포레", region_name: "서울 강남구", area: 85, deal_amount_krw: 2_550_000_000, prior_max: 2_450_000_000, prior_n: 14, contract_ym: "202609", contract_day: 27 },
  ];
  const { title, content, aiSummary } = priceHighCopy({ dateLabel: "10월 2일", items, windows: ["2025.01 이후", "직전 3년"] });
  /* 면적은 "전용 26평" — "26평형"(공급면적 기준으로 읽히는 말)이 아니다 */
  assert.equal(title, "오늘의 신고가 — 가락삼익맨숀 전용 26평 27.3억 등 2건");
  assert.ok(!content.includes("평형") && content.includes("85㎡(전용 26평)"));
  const lines = content.split("\n");
  assert.equal(lines[0], "10월 2일 국토교통부 실거래 신고분에서 이전 최고가를 넘긴 계약 2건이 확인됐습니다.");
  assert.ok(lines[2].includes("(2025.01 이후 최고 26.1억 대비 +4.6%, 비교 표본 31건)"), lines[2]);
  assert.ok(lines[3].includes("(직전 3년 최고 24.5억 대비 +4.1%, 비교 표본 14건)"), lines[3]);
  assert.ok(lines[2].includes("naezipnow.com/region/songpa"));
  const basis = lines[lines.length - 1];
  assert.ok(basis.startsWith("기준: 같은 단지·비슷한 면적(±2㎡)의 앞선 신고가와 비교했습니다(내집나우가 수집한 기간 안 · 최대 3년"), basis);
  assert.ok(!lines[0].includes("3년") && !basis.includes("직전 3년"));
  assert.equal(aiSummary, "10월 2일 실거래 신고분 중 이전 최고가 경신 2건 — 최고가는 가락삼익맨숀 27.3억입니다.");
  /* 구간을 못 받은 줄은 지어내지 않는다 */
  assert.ok(priceHighCopy({ dateLabel: "10월 2일", items, windows: [] }).content.includes("(수집 기간 최고 "));
});

test("[1027 · 1] 발행부 — 줄마다 그 단지·면적대 이력의 첫 달을 읽는다 · 글은 순수 모듈이 만든다 · 날짜는 UTC 로 고정", () => {
  const w = code("lib/market/price-record-watch.ts");
  assert.match(w, /import \{ priceHighCopy, priorWindowLabel, type PriceHighRow \} from "\.\/price-record-copy";/);
  assert.match(w, /\.select\("contract_ym"\)/);
  assert.match(w, /\.order\("contract_ym", \{ ascending: true \}\)/);
  assert.match(w, /const \{ title, content, aiSummary \} = priceHighCopy\(\{ dateLabel, items, windows \}\);/);
  assert.doesNotMatch(w, /직전 3년/);
  assert.match(w, /getUTCMonth\(\)/);
});

/* ── 2 · AI 고정 예시 표 ─────────────────────────────────────────────────── */

test("[1027 · 2] AI 엔진 — 고정 예시 표(경제지표·리스크 점수·타이밍 표)가 입력·내부 결과에 없다 · 프롬프트 v3 는 서버가 찍는다", () => {
  const engine = code("lib/ai/analysis-engine.ts");
  assert.doesNotMatch(engine, /ECONOMY_FULL|RISK_BLOCKS|TIMING_FULL|ECONOMY_THERMOMETER/);
  assert.match(raw("lib/ai/analysis-engine.ts"), /없는 수치\(금리·지수·거래량·순위·점수 등\)는 쓰지 마세요\. 값이 없으면 '자료 없음'이라고 적습니다\./);
  const consts = code("lib/ai/workbench-constants.ts");
  assert.doesNotMatch(consts, /export const (ECONOMY_FULL|RISK_BLOCKS|TIMING_FULL|ECONOMY_THERMOMETER|ECONOMY_MONITOR_CARD_IDS)\b/);
  assert.doesNotMatch(consts, /export function (computeRiskDashboardScores|riskScoreTier|economyRowsByMonitorOrder)\b/);
  assert.match(consts, /CHECKLIST_FULL/, "체크리스트(사람이 고르는 항목)는 그대로");
  /* 외부 모델에 넘기는 단지 — 실단지는 아는 값만(자리 채우기 0·등급 "B" 없음) · 샘플 단지는 id 를 명시했을 때만 */
  const live = analysisReferenceData("ai-diagnosis", {
    complexId: "7JWI7JaR",
    complexName: "래미안안양메가트리아",
    region: "안양 만안구",
    live: { priceKrw: 800_000_000 },
  }) as { complex: Record<string, unknown> | null; compositeScore: unknown; jeonseRatioPct: unknown };
  assert.deepEqual(live.complex, {
    id: "7JWI7JaR",
    name: "래미안안양메가트리아",
    region: "안양 만안구",
    priceSaleMan: 80000,
    jeonseDepositManFromRegionRatio: null,
  });
  assert.equal(live.compositeScore, null);
  assert.equal(live.jeonseRatioPct, null, "전세 값이 없으면 전세가율 0 을 싣지 않는다");
  assert.ok(!JSON.stringify(live).includes("aiGrade") && !JSON.stringify(live).includes("transitScore"));
  const none = analysisReferenceData("ai-diagnosis", {}) as { complex: unknown; compositeScore: unknown };
  assert.equal(none.complex, null, "단지를 고르지 않은 요청에 은마 예시를 끼워 넣지 않는다");
  assert.equal(none.compositeScore, null);
  const sample = analysisReferenceData("ai-diagnosis", { complexId: "c1" }) as { complex: { name?: string } | null; complexIsSample?: boolean };
  assert.equal(sample.complexIsSample, true);
  assert.equal(sample.complex?.name, "은마아파트");
  /* 수치 검증의 허용 목록 = 프롬프트가 써도 된다고 한 세 묶음(입력 · 서버 참고 데이터 · 공공데이터) */
  assert.match(code("app/api/ai/analysis/route.ts"), /buildNumberWhitelist\(\[\s*input,\s*analysisReferenceData\(tid, input\),\s*publicContext as unknown,\s*\]\)/);
  assert.equal(AI_PROMPT_VERSION, "v3");
  assert.match(code("app/api/ai/analysis/route.ts"), /input\._promptVersion = AI_PROMPT_VERSION;/);
  assert.doesNotMatch(code("app/analysis/ai/[tool]/WorkbenchClient.tsx"), /_promptVersion/);
  /* 예시 숫자를 그대로 내주던 시연용 API 와 그 계약 파일은 지웠다 */
  assert.equal(exists("app/api/economy/monitor/route.ts"), false);
  assert.equal(exists("lib/ai/economy-monitor-contract.ts"), false);
  for (const f of [...walk("app"), ...walk("lib")]) {
    assert.doesNotMatch(code(f), /economy-monitor-contract|api\/economy\/monitor/, f);
  }
});

/* ── 3 · 정비사업 추정 숫자 ─────────────────────────────────────────────── */

test("[1027 · 3] 정비사업 — 면적÷85㎡ '예상 세대수'와 '가장 가까운 준공 연도' 추정이 어디에도 없다", () => {
  for (const p of ["lib/seoul/adapters/upis-rebuild.ts", "lib/inspection/session-public-context.ts"]) {
    assert.doesNotMatch(code(p), /estimatedUnits|nearestCompletionYear/, p);
  }
  /* 공공데이터 캐시 쪽에 남는 건 옛 응답에서 그 두 칸을 지우는 두 줄뿐 — 만들거나 읽는 곳은 없다 */
  const pubRest = code("lib/public-data/index.ts").replace(/delete copy\.(estimatedUnits|nearestCompletionYear);/g, "");
  assert.doesNotMatch(pubRest, /estimatedUnits|nearestCompletionYear/);
  const ds = code("lib/datasources/redevelopment.ts");
  assert.match(ds, /expectedUnits: number \| null;/);
  assert.match(ds, /expectedUnits: null,/);
  assert.doesNotMatch(ds, /\/ ?85\b/);
  assert.match(code("lib/inspection/session-public-context.ts"), /\[정비사업\] \$\{/);
  /* 구 이름의 끝 "구"만 떼고 두 글자 이상일 때만 구역명에서 찾는다 — "구로구" → "로구"(종로구가 걸린다) 가 아니다 */
  const upis = code("lib/seoul/adapters/upis-rebuild.ts");
  assert.match(upis, /const stem = district\.replace\(\/구\$\/, ""\);/);
  assert.match(upis, /\(stem\.length >= 2 && p\.zoneName\.includes\(stem\)\)/);
  assert.doesNotMatch(upis, /district\.replace\("구", ""\)/);
  /* 캐시(7일)에 남은 옛 응답에서도 지운 칸을 뺀다 */
  const pub = code("lib/public-data/index.ts");
  assert.match(pub, /data: dropRetiredFields\(source, cached\) as T,/);
  assert.match(pub, /delete copy\.estimatedUnits;\s*delete copy\.nearestCompletionYear;/);
});

/* ── 4 · 이메일 칸 ──────────────────────────────────────────────────────── */

test("[1027 · 4] 검색 무결과 카드 — 이메일 칸·'알려드릴게요' 약속 없음 · 제보 한 번만", () => {
  const c = code("app/search/CoverageRequestCard.tsx");
  assert.doesNotMatch(c, /type="email"|이메일|알려드릴게요|순차 확장/);
  assert.match(c, /body: JSON\.stringify\(\{ query, source: "search" \}\)/);
  assert.match(c, /빠진 단지 제보/);
  assert.equal((c.match(/\bbtn-primary\b/g) ?? []).length, 1);
  /* 받는 쪽도 주소를 저장하지 않는다 — 배포 전에 받아 둔 옛 화면이 보내와도 */
  const route = code("app/api/coverage/request/route.ts");
  assert.match(route, /await recordRegionDemand\(\{ query, source, email: null \}\);/);
  assert.doesNotMatch(route, /body\.email|sanitizeDemandEmail/);
});

/* ── 20 · 공유 그림 ─────────────────────────────────────────────────────── */

/** `openGraph: {` 에서 짝이 맞는 `}` 까지 */
function openGraphBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /openGraph:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

/** 객체 글자(`openGraph: { … }`)의 **맨 바깥 층**에 그 열쇠가 있는가 — 괄호·중괄호·대괄호 안쪽은 보지 않는다 */
function hasTopLevelKey(block: string, key: string): boolean {
  const body = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (depth === 0 && body.startsWith(key, i) && !/[\w$.]/.test(body[i - 1] ?? " ") && /^\s*[:,}]?$|^\s*[:,]/.test(body.slice(i + key.length, i + key.length + 3))) {
      return true;
    }
  }
  return false;
}

test("[1027 · 20] 화면이 openGraph 를 직접 적으면 그림도 같이 적는다 — 빠지면 루트의 og:image 까지 사라진다", () => {
  const files = [...walk("app"), ...walk("lib")].filter((f) => /\.tsx?$/.test(f));
  let blocks = 0;
  for (const f of files) {
    for (const block of openGraphBlocks(code(f))) {
      blocks += 1;
      /* 조건부 펼침(...(사진 ? { images } : {})) 안의 images 는 세지 않는다 — 사진이 없으면 그림이 통째로 빠진다 */
      assert.ok(hasTopLevelKey(block, "images"), `${f} — openGraph 에 조건 없는 images 가 없다`);
    }
  }
  assert.ok(blocks >= 30, `openGraph 블록 ${blocks}개`);
  /* 검사기 자체 — 조건부 펼침은 세지 않는다 */
  assert.equal(hasTopLevelKey("openGraph: { title, images: X }", "images"), true);
  assert.equal(hasTopLevelKey("openGraph: {\n  title,\n  images,\n}", "images"), true);
  assert.equal(hasTopLevelKey("openGraph: { title, ...(p ? { images: [p] } : {}) }", "images"), false);
  assert.equal(hasTopLevelKey("openGraph: { title, ogimages: 1 }", "images"), false);
  const meta = code("lib/seo/page-metadata.ts");
  assert.match(meta, /export const DEFAULT_OG_IMAGES = \[\{ url: "\/og-image", width: 1200, height: 630, alt: SITE_NAME \}\];/);
});

/* ── 21 · 뉴스 사진(보류) ───────────────────────────────────────────────── */

test("[1027 · 21 보류] 뉴스 사진은 그대로 — 소유자가 정한 '뉴스는 원문 사진'(1013·1015)을 이 묶음이 뒤집지 않는다", () => {
  const shared = code("lib/town/shared.ts");
  assert.match(shared, /\/\^https\?:\\\/\\\/\/\.test\(value\.trim\(\)\)/, "기사 사진 주소(http·https)는 예전처럼 통과");
  assert.doesNotMatch(shared, /isOwnImageUrl/);
  /* 사진 없는 기사는 기본 공유 카드(제안 20) */
  assert.match(code("app/town/news/[id]/page.tsx"), /images: ogImage \? \[\{ url: ogImage \}\] : DEFAULT_OG_IMAGES/);
});

/* ── 22 · 빈 쪽 ─────────────────────────────────────────────────────────── */

test("[1027 · 22] 자료 0건 쪽은 검색 제외·사이트맵 제외 — 한 건이라도 들어오면 다시 색인", () => {
  const page = code("app/data/records/page.tsx");
  /* 검색 제외는 읽어서 0건임을 확인했을 때만 — 조회 실패(ok=false)를 0건으로 치지 않는다 */
  assert.match(page, /\.\.\.\(ok && totalRows === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}\),/);
  assert.match(page, /const loadStats = cache\(getPublicRecordDatasetStatsResult\);/);
  const lib = code("lib/market/public-records.ts");
  assert.match(lib, /if \(!sb\) return \{ ok: false, stats: base \};/);
  assert.match(lib, /if \(error \|\| !Array\.isArray\(data\)\) return \{ ok: false, stats: base \};/);
  assert.match(page, /export const revalidate = 86_400;/);
  const sitemap = code("lib/seo/build-sitemap.ts");
  assert.doesNotMatch(sitemap, /"\/data\/records"/);
  /* 정비사업 지도는 0건이 아니다(운영 40곳) — 사이트맵에 그대로 */
  assert.match(sitemap, /"\/redevelopment"/);
});

/* ── 23 · 주소 정리 ─────────────────────────────────────────────────────── */

test("[1027 · 23] 사라진 비교 주소는 그 단지 화면으로 이동(임시) · 단지 링크는 정본 · 보관 주소 링크 없음", () => {
  const cmp = code("app/complex/compare/[slug]/page.tsx");
  assert.match(cmp, /const loadGoneTarget = cache\(async \(slug: string\): Promise<string \| null> => \{/);
  assert.match(cmp, /for \(const name of \[parsed\.first, parsed\.second\]\) \{/);
  assert.match(cmp, /if \(regionName\) return complexHrefFromNames\(regionName, name\);/);
  /* 임시 이동(307) — 20건 경계의 조합은 다음 날 돌아올 수 있다. 정규 주소로 가는 기존 이동(순서 뒤바뀜)만 영구 */
  assert.match(cmp, /if \(!data\) \{\s*const goneTarget = await loadGoneTarget\(slug\);\s*if \(goneTarget\) redirect\(goneTarget\);\s*notFound\(\);\s*\}/);
  assert.match(cmp, /if \(needsRedirect\) permanentRedirect\(`\/complex\/compare\/\$\{canonicalSlug\}`\);/);
  assert.match(cmp, /side\.latest\?\.regionName\s*\?\s*complexHrefFromNames\(side\.latest\.regionName, side\.name\)/);
  assert.equal((cmp.match(/\/complex\/tx\/\$\{buildComplexTxSlug\(/g) ?? []).length, 1, "우회 주소는 region_name 이 빈 예외 한 곳뿐");
  assert.doesNotMatch(code("app/notes/notes-feed-client.tsx"), /href="\/notes\/templates"/);
});

/* ── 운영 DB 에 적용한 변경의 사본 ──────────────────────────────────────── */

test("[1027] 마이그레이션 사본 4건 — 원장 버전 이름 그대로 · 끝 줄바꿈 없음(원장 원문과 같은 바이트)", () => {
  const files = {
    "supabase/migrations/20261003050958_1027_price_high_posts_window_wording.sql": /where external_key like 'price-high:%'/,
    "supabase/migrations/20261003051021_1027_redev_zone_coords_from_complex_geocode.sql": /\('seed-yeouido-sibeom', 37\.5206991, 126\.937101\)/,
    "supabase/migrations/20261003051034_1027_temperature_label_dedupe_sido.sql": /set region_label = '인천 중구'\nwhere region_label = '인천 인천 중구';$/,
    "supabase/migrations/20261003051059_1027_search_fn_hardening.sql":
      /alter function market_agg\.addr_dong\(text\) set search_path = '';\nrevoke execute on function public\.search_complex_facets\(text\[\], text, text\[\], int\) from anon, authenticated;$/,
  } as const;
  for (const [p, re] of Object.entries(files)) {
    const s = raw(p);
    assert.match(s, re, p);
    assert.ok(!s.endsWith("\n"), `${p} 끝 줄바꿈 없음`);
    assert.doesNotMatch(s, /drop table|drop column|truncate/i, p);
  }
  /* 구역 좌표 — 코드 시드와 DB 가 같은 값 */
  const seed = raw("lib/redevelopment/seed.ts");
  for (const frag of [
    'id: "seed-eunma"', "lat: 37.4974142, lng: 127.0653097",
    'id: "seed-jamsil5"', "lat: 37.5153365, lng: 127.0929752",
    'id: "seed-yeouido-sibeom"', "lat: 37.5206991, lng: 126.937101",
    'id: "seed-mokdong6"', "lat: 37.534648, lng: 126.8848191",
  ]) {
    assert.ok(seed.includes(frag), frag);
  }
  /* 온도 라벨 — 이름에 시/도가 이미 붙은 항목은 다시 붙이지 않는다 */
  assert.match(code("lib/market/temperature.ts"), /label: d\.name\.startsWith\(`\$\{city\} `\) \? d\.name : `\$\{city\} \$\{d\.name\}`/);
});
