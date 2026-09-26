/**
 * [1010] 전송량(Fast Origin Transfer)·함수 호출 줄이기 — 회귀 잠금.
 *
 * 여기서 잠그는 것은 두 부류다.
 *  (1) 순수 로직: Web Vitals 세션 표본 추출(주사위를 세션마다 한 번만, 분포를 깨지 않게).
 *  (2) 계약(소스 읽기): TTL 을 올린 라우트마다 **비우는 쓰기 지점이 함께 있는지**.
 *      브리프 원칙 1 — "TTL 을 올리는 모든 라우트는 그 화면의 내용을 바꾸는 쓰기 지점에서
 *      즉시 비우는 코드가 반드시 함께 있어야 한다". 사람 말로만 두면 다음 사람이 무효화를
 *      지우고 TTL 만 남길 수 있으므로, 둘을 한 테스트에 묶어 둔다.
 *
 * 서버를 띄우지 않는다 — 소스 파일을 읽어서 검사한다(tests/unit/static-pages-1007.test.ts 관례).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VITALS_SAMPLE_KEY,
  VITALS_SAMPLE_RATE,
  decideVitalsSample,
  normalizeSampleRate,
} from "@/lib/metrics/vitals-sample";

const read = (p: string) => readFileSync(p, "utf8");

/* ───────────────────────── Web Vitals 표본 추출 ───────────────────────── */

test("[1010] 표본 비율은 0 초과 1 이하이고, 상수 한 곳에만 있다", () => {
  assert.ok(VITALS_SAMPLE_RATE > 0 && VITALS_SAMPLE_RATE <= 1);
  assert.equal(typeof VITALS_SAMPLE_KEY, "string");
  assert.ok(VITALS_SAMPLE_KEY.length > 0);

  /* 보내는 쪽·받는 쪽이 같은 모듈을 본다 — 숫자를 두 곳에 적으면 언젠가 갈라진다 */
  const reporter = read("app/components/WebVitalsReporter.tsx");
  const route = read("app/api/metrics/web-vitals/route.ts");
  assert.match(reporter, /@\/lib\/metrics\/vitals-sample/);
  assert.match(route, /@\/lib\/metrics\/vitals-sample/);
  /* 비율 리터럴이 리포터·라우트에 직접 박히지 않았는지 */
  assert.ok(!/Math\.random\(\)\s*<\s*0\./.test(reporter), "비율 리터럴이 리포터에 박혔다");
});

test("[1010] 주사위는 세션마다 한 번 — 저장된 답이 있으면 다시 굴리지 않는다", () => {
  /* 저장값이 있으면 roll 이 무엇이든 그 답을 그대로 쓰고, 다시 저장하지 않는다 */
  assert.deepEqual(decideVitalsSample("1", 0.99), { sampled: true, store: null });
  assert.deepEqual(decideVitalsSample("0", 0.0), { sampled: false, store: null });
});

test("[1010] 처음 여는 세션은 굴려서 답을 굳힌다", () => {
  const rate = 0.2;
  assert.deepEqual(decideVitalsSample(null, 0.0, rate), { sampled: true, store: "1" });
  assert.deepEqual(decideVitalsSample(null, 0.199, rate), { sampled: true, store: "1" });
  /* 경계: rate 자신은 표본이 아니다(roll < rate) — 그래야 기대 비율이 정확히 rate 다 */
  assert.deepEqual(decideVitalsSample(null, 0.2, rate), { sampled: false, store: "0" });
  assert.deepEqual(decideVitalsSample(null, 0.9999, rate), { sampled: false, store: "0" });
});

test("[1010] 난수가 이상하면 보내지 않는다 — 텔레메트리가 비용을 늘리는 쪽으로 기울지 않게", () => {
  assert.equal(decideVitalsSample(null, Number.NaN, 0.2).sampled, false);
  assert.equal(decideVitalsSample(null, -1, 0.2).sampled, false);
  assert.equal(decideVitalsSample(null, Number.POSITIVE_INFINITY, 0.2).sampled, false);
});

test("[1010] 기대 표본 비율이 설정값과 맞는다(분포를 깨지 않는다)", () => {
  const rate = VITALS_SAMPLE_RATE;
  let n = 0;
  const N = 100_000;
  /* 결정적인 의사 난수 — 균등 분포를 흉내 낸다(테스트가 흔들리지 않게) */
  for (let i = 0; i < N; i++) {
    if (decideVitalsSample(null, (i + 0.5) / N, rate).sampled) n += 1;
  }
  assert.ok(Math.abs(n / N - rate) < 0.001, `기대 ${rate}, 실측 ${n / N}`);
});

test("[1010] sampleRate 정규화 — 모르는 값은 null(옛 번들 호환)", () => {
  assert.equal(normalizeSampleRate(0.2), 0.2);
  assert.equal(normalizeSampleRate("0.2"), 0.2);
  assert.equal(normalizeSampleRate(1), 1);
  assert.equal(normalizeSampleRate(undefined), null);
  assert.equal(normalizeSampleRate(0), null);
  assert.equal(normalizeSampleRate(-0.5), null);
  assert.equal(normalizeSampleRate(1.5), null);
  assert.equal(normalizeSampleRate("abc"), null);
});

test("[1010] 표본이 아닌 세션은 리스너조차 걸지 않는다(비콘만 막는 게 아니다)", () => {
  const src = read("app/components/WebVitalsReporter.tsx");
  const i = src.indexOf("isSampledSession()");
  const onLCP = src.indexOf("onLCP(");
  assert.ok(i > 0 && onLCP > 0);
  assert.ok(i < onLCP, "표본 판정이 web-vitals 리스너 등록보다 앞이어야 한다");
  /* 보내는 줄에 비율이 실려야 집계가 개수를 되돌릴 수 있다 */
  assert.match(src, /sampleRate:\s*VITALS_SAMPLE_RATE/);
});

test("[1010] 개수를 쓰는 대시보드에 보정 주석이 남아 있다", () => {
  const perf = read("app/admin/perf/page.tsx");
  assert.match(perf, /VITALS_SAMPLE_RATE/);
  assert.match(perf, /p75 는 보정하지 않는다/);
});

/* ───────────────── TTL 과 "비우는 쓰기 지점"이 함께 있는지 ───────────────── */

/** page.tsx 의 `export const revalidate = N` 을 읽는다(밑줄 구분자 허용) */
function revalidateOf(file: string): number {
  const m = read(file).match(/export const revalidate\s*=\s*([0-9_]+)/);
  assert.ok(m, `${file} 에 revalidate 가 없다`);
  return Number(m![1].replace(/_/g, ""));
}

const INVALIDATE_SRC = "lib/cache/invalidate.ts";

test("[1010] molit 적재가 비우는 경로의 TTL만 올렸다 — /map · /data/records", () => {
  const inv = read(INVALIDATE_SRC);
  /* SOURCE_MAP.molit 에 이 경로들이 실제로 들어 있는지 */
  for (const p of ["/map", "/data/records"]) {
    assert.ok(inv.includes(`"${p}"`), `SOURCE_MAP 에 ${p} 가 없다 — TTL 을 올리면 안 된다`);
  }
  assert.equal(revalidateOf("app/map/page.tsx"), 21_600);
  assert.equal(revalidateOf("app/data/records/page.tsx"), 86_400);
});

test("[1010] supply 적재가 비우는 경로의 TTL만 올렸다 — /supply · /apply", () => {
  const inv = read(INVALIDATE_SRC);
  assert.match(inv, /supply:\s*\{[^}]*paths:\s*\[[^\]]*"\/apply"[^\]]*"\/supply"/s);
  assert.equal(revalidateOf("app/supply/page.tsx"), 86_400);
  assert.equal(revalidateOf("app/apply/page.tsx"), 86_400);
});

test("[1010] /apply/calendar — 분양공고 적재가 비우므로 TTL 을 올렸다", () => {
  /* 통합 단계에서 SOURCE_MAP.supply 에 경로와 라우트를 더했다. 주 경계(이번 주 계산)가
     렌더 시각에 매여 있어 하루(86_400)까지는 올리지 않는다 — 6시간이면 주가 바뀌는 순간의
     오차가 최대 6시간이고, 그래도 종전 1,800초 대비 재렌더는 12분의 1이다. */
  const inv = read(INVALIDATE_SRC);
  assert.ok(inv.includes('"/apply/calendar"'), "SOURCE_MAP.supply 가 /apply/calendar 를 비워야 한다");
  assert.ok(
    inv.includes('"/apply/calendar/[week]"'),
    "주차 상세는 pageRoutes 로 라우트 단위 비움이 필요하다",
  );
  assert.equal(revalidateOf("app/apply/calendar/page.tsx"), 21_600);
  assert.equal(revalidateOf("app/apply/calendar/[week]/page.tsx"), 86_400);
});

test("[1010] /auctions — 온비드 적재가 물건이 들어왔을 때만 비운다", () => {
  const cron = read("app/api/cron/onbid-sync/route.ts");
  assert.match(cron, /invalidatePathList\(\["\/auctions"\]/);
  /* 0건 적재로 재렌더를 태우지 않는다 */
  assert.match(cron, /if \(anyOk && inserted > 0\)/);
  assert.equal(revalidateOf("app/auctions/page.tsx"), 21_600);
});

test("[1010] /listings — 목록을 바꾸는 쓰기 네 곳이 전부 비운다", () => {
  const sites = [
    "app/api/listings/[id]/route.ts",
    "app/api/listings/[id]/sold/route.ts",
    "app/api/listings/[id]/boost/route.ts",
    "app/api/admin/listings/route.ts",
  ];
  for (const f of sites) {
    assert.match(read(f), /invalidateListingsIndex\(\)/, `${f} 에 /listings 무효화가 없다`);
  }
  assert.match(read("lib/listings/invalidate-listings.ts"), /"\/listings"/);
  /* 사람이 쓴 것이 바로 보여야 하는 화면이라 다른 목록보다 짧게 둔다 */
  assert.equal(revalidateOf("app/listings/page.tsx"), 1_800);
});

test("[1010] /dev-deals · /dev-deals/partners — 등록 API 가 비운다", () => {
  assert.match(read("app/api/dev-deals/deal/route.ts"), /invalidatePathList\(\["\/dev-deals"\]/);
  assert.match(
    read("app/api/dev-deals/partner/route.ts"),
    /invalidatePathList\(\["\/dev-deals\/partners"\]/,
  );
  assert.equal(revalidateOf("app/dev-deals/page.tsx"), 21_600);
  assert.equal(revalidateOf("app/dev-deals/partners/page.tsx"), 21_600);
});

test("[1010] 조회가 없는 고정 문서는 하루", () => {
  for (const f of ["app/about/page.tsx", "app/subscription/page.tsx", "app/lp/imjang/page.tsx"]) {
    assert.equal(revalidateOf(f), 86_400, f);
  }
});

test("[1010] /calculator 는 금리 데이터 캐시(24시간)와 눈금이 같다", () => {
  const rates = read("lib/finance/mortgage-rates.ts");
  assert.match(rates, /TTL_MS\s*=\s*24 \* 3_600_000/);
  assert.equal(revalidateOf("app/calculator/page.tsx"), 86_400);
});

test("[1010] /quiz 는 날짜에 매인 화면이라 하루로 올리지 않는다", () => {
  /* 오늘·내일 두 판만 싣는다(lib/quiz/load-price-game) — HTML 이 하루를 넘겨 묵으면
     클라이언트가 "오늘"로 고를 판이 사라진다. 6시간을 유지한다. */
  const loader = read("lib/quiz/load-price-game.ts");
  assert.match(loader, /addDaysIso\(today, 1\)/);
  assert.ok(revalidateOf("app/quiz/page.tsx") <= 21_600);
});

/* ─────────────────────────── OG 카드 캐시 ─────────────────────────── */

test("[1010] 내용 주소 OG 카드는 7일 + immutable", () => {
  const cache = read("lib/og/cache.ts");
  assert.match(cache, /s-maxage=604800/);
  assert.match(cache, /immutable/);
  for (const f of [
    "app/api/og/route.tsx",
    "app/api/og/complex/route.tsx",
    "app/api/og/listing/route.tsx",
    "app/api/og/note/route.tsx",
    "app/api/og/invite/route.tsx",
  ]) {
    const s = read(f);
    assert.match(s, /OG_STATIC_CACHE_CONTROL/, f);
    assert.ok(!/s-maxage=86400/.test(s), `${f} 에 옛 하루 눈금이 남았다`);
  }
});

test("[1010] 같은 URL 의 그림이 바뀌는 카드에는 immutable 을 붙이지 않는다", () => {
  /* market-card: 고정 URL · 서버가 데이터를 직접 읽는다. trend: 쿼리는 같은데 실거래가 쌓인다. */
  const market = read("app/api/og/market-card/route.tsx");
  const header = market.match(/"Cache-Control":\s*"([^"]+)"/);
  assert.ok(header, "market-card 에 Cache-Control 이 없다");
  assert.ok(
    !header![1].includes("immutable"),
    "고정 URL 카드에 immutable 을 붙이면 한 번 공유된 카드가 영영 안 바뀐다",
  );
  assert.match(header![1], /s-maxage=21600/);
  const trend = read("app/api/og/complex-trend/route.tsx");
  assert.match(trend, /OG_DYNAMIC_CACHE_CONTROL/);
  assert.ok(!read("lib/og/cache.ts").split("OG_DYNAMIC_CACHE_CONTROL")[1].includes("immutable"));
});
