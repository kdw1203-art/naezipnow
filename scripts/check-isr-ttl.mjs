#!/usr/bin/env node
/**
 * [1089 · 비용] ISR 실효 수명 게이트 — 롱테일 ISR 화면의 번들 안 데이터 캐시가 화면 수명을 끌어내리거나
 * 전역 태그로 통째로 비워지게 하면 빌드를 멈춘다. `next build` 뒤(.next/server)에 돈다.
 *
 * ── 왜 ────────────────────────────────────────────────────────────────
 * Next 는 렌더 중 읽은 unstable_cache · fetch 의 revalidate 가운데 **가장 작은 값**을 그 화면의 revalidate 로 쓰고,
 * 읽은 캐시의 tags 를 화면에 붙인다(revalidateTag 가 화면까지 비운다). 1089 실측(로컬 빌드 · 응답 Cache-Control):
 * 단지 화면은 `export const revalidate = 604_800`(7일)인데 s-maxage=3600 — 결과 요약 · 다요인 분석 · 인증 전문가 캐시가
 * 1시간 · 6시간이었고, "market" 태그(실거래 · 부동산원 · KB 적재가 하루 세 번 비운다)가 붙어 2.4만 쪽이 날마다 통째로 비워졌다.
 * 코드 리뷰로는 안 보인다(수명이 화면 파일이 아니라 몇 단계 아래 모듈에 있다) — 그래서 빌드 산출물을 본다.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────────
 *  · 대상 라우트의 서버 번들(page.js + 그 청크)에 든 unstable_cache 의 revalidate(숫자)가 화면 revalidate 보다 작으면 실패.
 *  · NO_GLOBAL_TAGS 라우트는 번들의 unstable_cache 에 전역 적재 태그("market" · "economy")가 있으면 실패.
 *  · 번들에 들었지만 그 화면 렌더에서 부르지 않는 캐시는 ALLOW 에 이유와 함께 적는다(청크는 여러 화면이 나눠 쓴다).
 *  · revalidate 가 변수(축약된 이름)라 값을 못 읽은 캐시 · fetch 의 짧은 revalidate 는 경고만.
 *  · 산출물 모양이 바뀌어 아무것도 못 읽으면 경고만 하고 통과(게이트가 빌드를 잘못 세우지 않게) — 경고를 보면 이 파일을 고친다.
 * 사용: node ./scripts/check-isr-ttl.mjs (npm run build 체인 — next build 뒤)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(root, ".next", "server");
const TAG = "[check-isr-ttl]";

/** 롱테일 ISR 화면(크롤러가 가장 많이 여는 곳) */
const ROUTES = [
  "complex/[id]",
  "town/news/[id]",
  "dong/[region]/[dong]",
  "tx/[region]",
  "tx/[region]/[kind]/[band]",
  "region/[id]",
  "complex/compare/[slug]",
  "complex/tx/[slug]",
  "imjang/[slug]",
  "reports/[ym]",
];

/** 전역 적재 태그가 붙으면 안 되는 화면 — 바뀐 단지 · 기사만 비운다(lib/cache/invalidate · complex-invalidate) */
const NO_GLOBAL_TAGS = new Set(["complex/[id]", "town/news/[id]"]);
const GLOBAL_TAGS = ["market", "economy"];

/** 번들에만 있고 그 화면 렌더에서 부르지 않는 캐시 — "라우트|키" → 이유 */
const ALLOW = {
  "town/news/[id]|related-notes-pool-v1": "공개 노트 상세(RelatedNotes)만 부른다 — 같은 청크에 함께 묶였다",
};

const declaredRevalidate = (route) => {
  const p = join(root, "app", route, "page.tsx");
  if (!existsSync(p)) return null;
  const m = readFileSync(p, "utf8").match(/export const revalidate\s*=\s*([0-9_]+)/);
  return m ? Number(m[1].replace(/_/g, "")) : null;
};

const bundleFiles = (route) => {
  const page = join(SERVER, "app", route, "page.js");
  if (!existsSync(page)) return null;
  const src = readFileSync(page, "utf8");
  const m = src.match(/X\(0,\[([0-9,]+)\]/);
  if (!m) return [page];
  return [page, ...m[1].split(",").map((id) => join(SERVER, "chunks", `${id}.js`)).filter((f) => existsSync(f))];
};

/** unstable_cache 호출마다 { key, revalidate(숫자|null|"var"), tags[] } */
function cachesIn(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf("unstable_cache)(", i)) >= 0) {
    const win = text.slice(i, i + 4000);
    const key = win.match(/\[("([^"]{1,80})"|`([^`]{1,80})`)/);
    const opts = win.match(/\],\{((?:revalidate|tags)[^}]{0,240})\}/);
    let revalidate = null;
    let tags = [];
    if (opts) {
      const r = opts[1].match(/revalidate:([^,}]+)/);
      if (r) revalidate = /^[0-9]+(e[0-9]+)?$/.test(r[1]) ? Number(r[1]) : "var";
      const t = opts[1].match(/tags:\[([^\]]*)\]/);
      if (t) tags = [...t[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    }
    out.push({ key: key ? key[2] ?? key[3] : "?", revalidate, tags });
    i += 16;
  }
  return out;
}

let failed = 0;
let warned = 0;
let analyzed = 0;
for (const route of ROUTES) {
  const declared = declaredRevalidate(route);
  const files = bundleFiles(route);
  if (!declared || !files) {
    warned++;
    console.warn(`${TAG} WARN — ${route}: ${!declared ? "revalidate 선언을 못 읽음" : "빌드 산출물 없음"}(건너뜀)`);
    continue;
  }
  analyzed++;
  const seen = new Map();
  let shortFetch = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const c of cachesIn(text)) seen.set(c.key, c);
    for (const m of text.matchAll(/next:\{revalidate:([0-9]+)\}/g)) if (Number(m[1]) < declared) shortFetch++;
  }
  for (const c of seen.values()) {
    const allow = ALLOW[`${route}|${c.key}`];
    if (allow) continue;
    if (c.revalidate === "var") {
      warned++;
      console.warn(`${TAG} WARN — ${route}: "${c.key}" revalidate 를 값으로 못 읽음(변수) — 화면 ${declared}s 보다 작지 않은지 확인`);
    } else if (typeof c.revalidate === "number" && c.revalidate < declared) {
      failed++;
      console.error(`${TAG} FAIL — ${route}: "${c.key}" revalidate ${c.revalidate}s < 화면 ${declared}s — 화면 수명이 ${c.revalidate}s 로 내려간다`);
    }
    if (NO_GLOBAL_TAGS.has(route)) {
      const bad = c.tags.filter((t) => GLOBAL_TAGS.includes(t));
      if (bad.length > 0) {
        failed++;
        console.error(`${TAG} FAIL — ${route}: "${c.key}" 태그 ${bad.join(",")} — 적재 때마다 이 화면 전부가 비워진다`);
      }
    }
  }
  if (shortFetch > 0) {
    warned++;
    console.warn(`${TAG} WARN — ${route}: 화면보다 짧은 fetch revalidate ${shortFetch}곳(번들에만 있을 수 있다 · 응답 s-maxage 로 확인)`);
  }
}

if (analyzed === 0) {
  console.warn(`${TAG} WARN — 분석한 라우트 0개(빌드 산출물 모양이 바뀌었을 수 있다) — 통과시키지만 이 파일을 고칠 것`);
  process.exit(0);
}
if (failed > 0) {
  console.error(`${TAG} ${failed}건 — 빌드를 멈춥니다. 캐시 수명을 화면 수명 이상으로 올리거나, 그 조회를 화면 렌더 밖(사람이 볼 때 받는 API)으로 옮긴다.`);
  process.exit(1);
}
console.info(`${TAG} PASS — 라우트 ${analyzed}개 · 경고 ${warned}건`);
