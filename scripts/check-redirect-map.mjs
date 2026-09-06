#!/usr/bin/env node
/**
 * N6 — 리다이렉트 맵 검증 게이트
 *
 * lib/seo/redirect-map.ts 의 규칙표가 실제 라우트와 어긋나지 않는지 본다.
 * 리다이렉트는 틀려도 화면이 깨지지 않아서 사람이 알아채기 어렵다. 실제로
 * "/reports": "/analysis" 규칙 하나가 월간 리포트 허브를 통째로 가리고 있었고,
 * 사이트맵과 llms.txt 가 그 URL 을 광고하는 동안 아무 에러도 나지 않았다.
 * 그 사고를 잡는 것이 아래 검사 1번이다.
 *
 * 검사 항목
 *  1. from 이 아직 살아 있는 라우트인가 (미들웨어가 파일 시스템보다 먼저 돌아
 *     멀쩡한 페이지를 가리는 경우) — 가장 중요한 검사
 *  2. to 가 실존 라우트인가 (정적/동적 모두 매칭)
 *  3. 2단 홉 — to 가 다른 규칙의 from 인가
 *  4. from === to 자기 참조
 *  5. 형식 — 앞 "/", 뒤 슬래시 없음, from 에 쿼리·해시 없음
 *  6. reason·since 가 채워져 있는가 (since 는 YYYY-MM-DD, 미래 날짜 금지)
 *  7. 배선 — middleware.ts 가 이 표를 import 해서 쓰는가
 *  9. [967 · 30d] 접두 규칙표(PREFIX_REDIRECTS) — to(rest) 가 실존 라우트·1홉인지,
 *     접두가 살아 있는 라우트를 가리지 않는지, 미들웨어가 resolvePrefixRedirect() 를 쓰는지
 *
 * from 중복은 redirect-map.ts 가 모듈 로드 시점에 스스로 던지므로, 이 스크립트가
 * import 하는 순간 함께 잡힌다(아래 8번에서 개수로 한 번 더 확인).
 */

/* Node 가 .ts 를 직접 읽을 때 나오는 MODULE_TYPELESS_PACKAGE_JSON 경고를 지운다.
   게이트 출력에 섞이면 실제 실패처럼 보인다. */
process.removeAllListeners("warning");

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app");

const errors = [];
const fail = (msg) => errors.push(msg);

/* ── 1. 실제 라우트 수집 ────────────────────────────────────────────────────
   Next 앱 라우터 규칙: (group) 은 URL 에 안 나오고, @slot·_private 은 라우트가
   아니다. [id]·[...all]·[[...opt]] 는 동적 세그먼트. */
const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const ROUTE_FILES = ["route.ts", "route.js", "route.tsx"];

const staticRoutes = new Set();
const dynamicRoutes = []; // { pattern: RegExp, source: string }

function hasRouteFile(dir) {
  return [...PAGE_FILES, ...ROUTE_FILES].some((f) => existsSync(path.join(dir, f)));
}

function toRegExp(urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  let body = "";
  for (const seg of parts) {
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) body += "(?:/.+)?"; // [[...opt]] — 없어도 됨
    else if (/^\[\.\.\..+\]$/.test(seg)) body += "/.+"; // [...all] — 한 조각 이상
    else if (/^\[.+\]$/.test(seg)) body += "/[^/]+";
    else body += `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }
  return new RegExp(`^${body || "/"}$`);
}

function walk(dir, urlPath) {
  if (hasRouteFile(dir)) {
    const url = urlPath || "/";
    if (url.includes("[")) dynamicRoutes.push({ pattern: toRegExp(url), source: url });
    else staticRoutes.add(url);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name.startsWith("@") || name === "node_modules") continue;
    const isGroup = /^\(.*\)$/.test(name);
    walk(path.join(dir, name), isGroup ? urlPath : `${urlPath}/${name}`);
  }
}

if (!existsSync(APP_DIR)) {
  console.error("✗ app/ 디렉터리를 찾을 수 없습니다.");
  process.exit(1);
}
walk(APP_DIR, "");

function matchesDynamic(p) {
  return dynamicRoutes.find((r) => r.pattern.test(p));
}

/* ── 2. 규칙표 읽기 ─────────────────────────────────────────────────────────
   .ts 를 그대로 import 한다(Node 22 의 타입 스트리핑). 정규식으로 긁는 것보다
   정확하고, 표가 스스로 던지는 중복 검사도 같이 태울 수 있다.
   redirect-map.ts 는 의존성이 하나도 없어서 이게 가능하다. */
const MAP_PATH = path.join(ROOT, "lib/seo/redirect-map.ts");
let REDIRECT_RULES;
let EXACT_REDIRECTS;
let PREFIX_REDIRECTS;
let resolvePrefixRedirect;
try {
  const mod = await import(`file://${MAP_PATH}`);
  REDIRECT_RULES = mod.REDIRECT_RULES;
  EXACT_REDIRECTS = mod.EXACT_REDIRECTS;
  PREFIX_REDIRECTS = mod.PREFIX_REDIRECTS;
  resolvePrefixRedirect = mod.resolvePrefixRedirect;
} catch (err) {
  console.error(
    `✗ lib/seo/redirect-map.ts 를 읽지 못했습니다 — ${err.message}\n` +
      `  현재 Node: ${process.version} · 필요: v22.18 이상(.ts 타입 스트리핑 기본 활성)`,
  );
  process.exit(1);
}

if (!Array.isArray(REDIRECT_RULES) || REDIRECT_RULES.length === 0) {
  console.error("✗ REDIRECT_RULES 가 비어 있습니다.");
  process.exit(1);
}

const sources = new Set(REDIRECT_RULES.map((r) => r.from));
const stripQuery = (p) => p.split("?")[0].split("#")[0];
const today = new Date().toISOString().slice(0, 10);

for (const rule of REDIRECT_RULES) {
  const { from, to, reason, since } = rule;

  // 5. 형식
  if (!from.startsWith("/")) fail(`from "${from}" — "/" 로 시작해야 합니다.`);
  if (from.length > 1 && from.endsWith("/")) fail(`from "${from}" — 뒤 슬래시를 빼세요(미들웨어는 벗긴 경로로 조회합니다).`);
  if (/[?#]/.test(from)) fail(`from "${from}" — 쿼리·해시는 넣을 수 없습니다(정확 경로만 비교합니다).`);
  if (!to.startsWith("/")) fail(`to "${to}" (from "${from}") — 사이트 내부 경로만 허용합니다.`);

  // 4. 자기 참조
  if (stripQuery(to) === from) fail(`"${from}" 이 자기 자신으로 리다이렉트합니다(무한 루프).`);

  // 1. from 이 살아 있는 라우트인가 — 가장 중요한 검사
  if (staticRoutes.has(from)) {
    fail(
      `"${from}" 은 실제로 살아 있는 라우트입니다(app${from}/page.tsx 등). ` +
        `미들웨어가 파일 시스템 라우트보다 먼저 돌기 때문에 이 규칙이 그 페이지를 통째로 가립니다. ` +
        `규칙을 지우거나, 페이지를 지우세요.`,
    );
  } else {
    const shadowed = matchesDynamic(from);
    if (shadowed) {
      fail(
        `"${from}" 은 동적 라우트 "${shadowed.source}" 에 잡히는 경로입니다. ` +
          `이 규칙이 그 라우트의 해당 URL 을 가립니다.`,
      );
    }
  }

  // 2. to 가 실존 라우트인가
  const target = stripQuery(to);
  if (!staticRoutes.has(target) && !matchesDynamic(target)) {
    fail(`to "${to}" (from "${from}") — 대응하는 라우트가 없습니다. 리다이렉트가 404 로 떨어집니다.`);
  }

  // 3. 2단 홉
  if (sources.has(target)) {
    fail(
      `"${from}" → "${to}" 는 2단 홉입니다("${target}" 이 다시 "${EXACT_REDIRECTS[target]}" 로 갑니다). ` +
        `최종 목적지로 직행시키세요 — 홉이 늘수록 색인 이관이 새어 나갑니다.`,
    );
  }

  // 6. 메타데이터
  if (!reason || !reason.trim()) fail(`"${from}" — reason 이 비었습니다. 왜 죽은 경로인지 적어야 나중에 지울지 판단할 수 있습니다.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) fail(`"${from}" — since 는 YYYY-MM-DD 형식이어야 합니다(받은 값: ${JSON.stringify(since)}).`);
  else if (Number.isNaN(Date.parse(since))) fail(`"${from}" — since "${since}" 는 존재하지 않는 날짜입니다.`);
  else if (since > today) fail(`"${from}" — since "${since}" 가 미래입니다(오늘: ${today}).`);
}

// 8. 평탄화 손실 확인 (표에는 있는데 조회표에 없는 항목)
if (Object.keys(EXACT_REDIRECTS).length !== REDIRECT_RULES.length) {
  fail(
    `EXACT_REDIRECTS(${Object.keys(EXACT_REDIRECTS).length}개) 와 REDIRECT_RULES(${REDIRECT_RULES.length}개) 의 ` +
      `개수가 다릅니다 — from 중복으로 규칙이 조용히 덮였을 수 있습니다.`,
  );
}

// 7. 배선 — 미들웨어가 이 표를 실제로 쓰는가
const middlewareSrc = readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
if (!/from\s+"@\/lib\/seo\/redirect-map"/.test(middlewareSrc)) {
  fail("middleware.ts 가 @/lib/seo/redirect-map 을 import 하지 않습니다 — 표를 만들어 두고 안 쓰는 상태입니다.");
}
if (!/EXACT_REDIRECTS\[/.test(middlewareSrc)) {
  fail("middleware.ts 에서 EXACT_REDIRECTS 조회가 보이지 않습니다 — 리다이렉트가 실제로 동작하지 않습니다.");
}
if (!/legacyRedirectStatus\(/.test(middlewareSrc)) {
  fail("middleware.ts 가 legacyRedirectStatus() 를 쓰지 않습니다 — 상태 코드 정책이 표와 따로 놉니다.");
}

/* ── 9. [967 · 30d] 접두 규칙(PREFIX_REDIRECTS) ──────────────────────────────
   정확 일치 표와 같은 세 원칙을 접두 표에도 건다.
   (a) to(rest) 가 실존 라우트로 간다 — 한글·공백이 섞인 꼬리로 호출해 본다.
   (b) 접두가 살아 있는 라우트를 가리지 않는다 — 접두로 시작하는 정적 라우트, 그리고
       접두 뒤에 한 조각(또는 두 조각)을 붙인 경로를 잡는 동적 라우트가 없어야 한다.
   (c) 2단 홉 금지 — to() 의 결과가 정확 일치 표의 from 이거나 다른 접두에 걸리면 안 된다.
   (d) 형식·메타데이터 — 접두는 "/" 로 시작·끝나고, since 는 정확 일치 표와 같은 규칙. */
if (!Array.isArray(PREFIX_REDIRECTS)) {
  fail("PREFIX_REDIRECTS 가 export 되지 않았습니다.");
} else {
  const PROBES = ["x", "강남구", "동네%20이야기", "a-b_c"];
  for (const rule of PREFIX_REDIRECTS) {
    const { fromPrefix, to, reason, since } = rule;
    const label = `접두 "${fromPrefix}"`;

    if (typeof fromPrefix !== "string" || !fromPrefix.startsWith("/") || !fromPrefix.endsWith("/") || fromPrefix.length < 3) {
      fail(`${label} — 접두는 "/" 로 시작하고 "/" 로 끝나야 합니다(예: "/area/").`);
      continue;
    }
    if (typeof to !== "function") {
      fail(`${label} — to 는 (rest) => string 함수여야 합니다.`);
      continue;
    }

    // (b) 그림자 — 정적
    for (const r of staticRoutes) {
      if (r === fromPrefix.slice(0, -1) || r.startsWith(fromPrefix)) {
        fail(`${label} 은 살아 있는 라우트 "${r}" 을 가립니다 — 규칙을 지우거나 페이지를 지우세요.`);
      }
    }
    // (b) 그림자 — 동적
    for (const probe of [`${fromPrefix}probe`, `${fromPrefix}probe/probe`]) {
      const shadowed = matchesDynamic(probe);
      if (shadowed) {
        fail(`${label} 은 동적 라우트 "${shadowed.source}" 에 잡히는 경로("${probe}")를 가립니다.`);
      }
    }

    // (a)·(c) 대상 검사 — 여러 꼬리로 호출해 전부 실존 라우트·1홉인지 본다
    for (const probe of PROBES) {
      let target;
      try {
        target = resolvePrefixRedirect(`${fromPrefix}${probe}`);
      } catch (err) {
        fail(`${label} — to("${probe}") 가 던졌습니다: ${err.message}`);
        continue;
      }
      if (typeof target !== "string" || !target.startsWith("/")) {
        fail(`${label} — to("${probe}") 결과 "${target}" 는 사이트 내부 경로가 아닙니다.`);
        continue;
      }
      const dest = stripQuery(target);
      if (!staticRoutes.has(dest) && !matchesDynamic(dest)) {
        fail(`${label} — to("${probe}") = "${target}" 에 대응하는 라우트가 없습니다(404 로 떨어집니다).`);
      }
      if (sources.has(dest)) {
        fail(`${label} — to("${probe}") = "${target}" 는 정확 일치 표의 from 이라 2단 홉입니다.`);
      }
      if (dest.startsWith(fromPrefix) || PREFIX_REDIRECTS.some((o) => dest.startsWith(o.fromPrefix))) {
        fail(`${label} — to("${probe}") = "${target}" 가 다시 접두 규칙에 걸립니다(루프·2단 홉).`);
      }
    }
    // 빈 꼬리는 규칙이 살지 않아야 한다(/area → 404 가 맞다. /area/ 는 미들웨어가 슬래시를 벗긴다)
    if (resolvePrefixRedirect(fromPrefix.slice(0, -1)) !== null || resolvePrefixRedirect(`${fromPrefix}%20`) !== null) {
      fail(`${label} — 꼬리가 비었는데도 규칙이 적용됩니다.`);
    }

    // (d) 메타데이터
    if (!reason || !reason.trim()) fail(`${label} — reason 이 비었습니다.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) fail(`${label} — since 는 YYYY-MM-DD 형식이어야 합니다(받은 값: ${JSON.stringify(since)}).`);
    else if (Number.isNaN(Date.parse(since))) fail(`${label} — since "${since}" 는 존재하지 않는 날짜입니다.`);
    else if (since > today) fail(`${label} — since "${since}" 가 미래입니다(오늘: ${today}).`);
  }
  // 정확 일치 표의 from 이 접두에 걸리면 정확 일치가 먼저 이기므로 동작은 하지만, 표가 둘로 갈린다.
  for (const rule of REDIRECT_RULES) {
    const hit = PREFIX_REDIRECTS.find((p) => rule.from.startsWith(p.fromPrefix));
    if (hit) fail(`정확 일치 "${rule.from}" 이 접두 "${hit.fromPrefix}" 안에 있습니다 — 한쪽으로 합치세요.`);
  }
  // 배선
  if (!/resolvePrefixRedirect\(/.test(middlewareSrc)) {
    fail("middleware.ts 가 resolvePrefixRedirect() 를 쓰지 않습니다 — 접두 표가 실제로 동작하지 않습니다.");
  }
}

if (errors.length > 0) {
  console.error(`✗ 리다이렉트 맵 검사 실패 — ${errors.length}건`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ 리다이렉트 맵 검사 통과 — 정확 일치 ${REDIRECT_RULES.length}개 · 접두 ${PREFIX_REDIRECTS.length}개 전부 1홉 · 실라우트 타깃 · ` +
    `살아 있는 페이지를 가리지 않음 (정적 라우트 ${staticRoutes.size} · 동적 ${dynamicRoutes.length} 대조)`,
);
