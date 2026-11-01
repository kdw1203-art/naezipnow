/* [1098] 소유자 2026-11-01 "광고판이 너무 깜박거려" · "광고 배너 공간도 마련해 줘".
 *  깜박임 — 공유 캐시 화면은 광고 카드를 HTML 에 싣고 하이드레이션 뒤 세션을 읽어 유료 플랜이면 숨겼다(AdFreeGate) → 유료 플랜(소유자
 *  계정 enterprise)은 화면마다 광고판이 그려졌다 사라졌다. 판정을 localStorage(nz_ad_free)에 기억하고 그리기 전 인라인 스크립트가
 *  html[data-ad-free="1"] 을 세워 CSS 로 숨긴다. 관리자는 광고 자리를 확인해야 하므로 유료 플랜이어도 본다(adFreeForViewer).
 *  배너 공간 — 상단 띠 배너 자리(TopBanner · 허브 7곳 머리 아래 · 폰 64 · PC 90px · 이미지 URL 이 있는 배너). 비면 관리자에게만 점선 자리.
 *  관리 › 배너에 "띠 배너 이미지 URL" 입력 + 미리보기. 카드 자리(AdSlot)는 이미지 배너를 뺀다(같은 배너 두 번 금지). DB 변경 없음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { adFreeForViewer, isAdFreePlan } from "../../lib/ads/ad-free";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("광고 제거 판정 — 유료 플랜은 광고 없음 · 관리자는 유료여도 본다 · 비회원은 광고 있음", () => {
  assert.equal(isAdFreePlan("enterprise"), true);
  assert.equal(adFreeForViewer({ plan: "pro", role: "user" }), true);
  assert.equal(adFreeForViewer({ plan: "enterprise", role: "admin" }), false, "관리자는 광고 자리를 본다");
  assert.equal(adFreeForViewer({ plan: "free", role: "user" }), false);
  assert.equal(adFreeForViewer(null), false);
});

test("깜박임 — 판정을 기억(nz_ad_free) · 그리기 전 인라인 스크립트 · CSS 가 광고 자리를 숨긴다 · 게이트는 data-ad-gate", () => {
  const flag = strip(read("lib/client/ad-free-flag.ts"));
  assert.match(flag, /export const AD_FREE_STORAGE_KEY = "nz_ad_free";/);
  assert.match(flag, /localStorage\.setItem\(AD_FREE_STORAGE_KEY, adFree \? "1" : "0"\);/);
  assert.match(flag, /if \(adFree\) document\.documentElement\.setAttribute\(AD_FREE_ATTR, "1"\);\s*else document\.documentElement\.removeAttribute\(AD_FREE_ATTR\);/);
  const layout = read("app/layout.tsx");
  assert.match(layout, /const AD_FREE_SCRIPT =\s*"\(function\(\)\{try\{if\(localStorage\.getItem\('nz_ad_free'\)==='1'\)document\.documentElement\.setAttribute\('data-ad-free','1'\)\}catch\(e\)\{\}\}\)\(\);";/);
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: AD_FREE_SCRIPT \}\} \/>/);
  assert.ok(layout.indexOf("__html: AD_FREE_SCRIPT") < layout.indexOf("</head>"), "head 안(그리기 전)");
  const css = read("app/globals.css");
  assert.match(css, /html\[data-ad-free="1"\] :is\(\.ad-zone, \.ad-strip, \[data-ad-gate\]\) \{\s*display: none;\s*\}/);
  const gate = strip(read("app/components/ads/AdFreeGate.tsx"));
  assert.match(gate, /if \(j === null && readAuthedHint\(\)\) return;\s*const free = adFreeForViewer\(j\?\.user \?\? null\);\s*rememberAdFree\(free\);\s*if \(!cancelled && free\) setHidden\(true\);/);
  assert.match(gate, /<div data-ad-gate="" className="contents">/);
  assert.doesNotMatch(gate, /isAdFreePlan\(/, "보는 사람 기준(adFreeForViewer)으로");
});

test("상단 띠 배너 자리 — 이미지 배너만 · 높이 예약(64/90) · 광고 라벨 · 빈 자리는 관리자에게만 · 허브 7곳 · 카드 자리는 이미지 배너를 뺀다", () => {
  const top = strip(read("app/components/ads/TopBanner.tsx"));
  assert.match(top, /export function isStripBanner\(b: Pick<Banner, "imageUrl">\): boolean \{\s*return Boolean\(b\.imageUrl && b\.imageUrl\.trim\(\)\);/);
  assert.match(top, /if \(!isStripBanner\(b\)\) return false;/);
  assert.match(top, /if \(!banner\) return <AdminStripPlaceholder placement=\{placement\} className=\{className\} \/>;/);
  assert.match(top, /<span className="ad-strip__label">광고<\/span>/);
  assert.match(top, /rel="noopener noreferrer nofollow"/);
  assert.match(top, /\{plan == null \? <AdFreeGate>\{body\}<\/AdFreeGate> : body\}/);
  const ph = strip(read("app/components/ads/AdminStripPlaceholder.tsx"));
  assert.match(ph, /^"use client";/);
  assert.match(ph, /if \(alive && \(s\?\.user\?\.role \?\? ""\) === "admin"\) setAdmin\(true\);/);
  assert.match(ph, /if \(!admin\) return null;/);
  assert.match(ph, /등록된 띠 배너 없음 · 관리자에게만 보이는 표시/);
  /* 화면 글에 느낌표 · "준비 중" 없음(코드의 ! 연산자는 제외 — JSX 글만) */
  const phText = (ph.match(/>([^<>{}]+)</g) ?? []).join(" ");
  assert.doesNotMatch(phText, /!|준비 중/);
  const css = read("app/globals.css");
  assert.match(css, /\.ad-strip__box \{[\s\S]*?height: 64px;[\s\S]*?border: 1px solid var\(--border\);/);
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.ad-strip__box,\s*\.ad-strip__placeholder \{\s*height: 90px;/);
  const tail = css.slice(css.indexOf("[1098 · 배너]"));
  assert.doesNotMatch(tail, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8|font-size:\s*\d/, "1022 뒤 append 규칙");
  const slot = strip(read("app/components/ads/AdSlot.tsx"));
  assert.match(slot, /if \(isStripBanner\(b\)\) return false;/);
  const pages: [string, string][] = [
    ["app/page.tsx", 'placement="home_feed"'],
    ["app/town/news/(index)/page.tsx", 'placement="page_bottom"'],
    ["app/dong/page.tsx", 'placement="page_bottom"'],
    ["app/complex/compare/page.tsx", 'placement="page_bottom"'],
    ["app/town/page.tsx", 'placement="community_feed"'],
    ["app/tx/page.tsx", 'placement="page_bottom"'],
    ["app/analysis/page.tsx", 'placement="page_bottom"'],
  ];
  for (const [p, pl] of pages) {
    const s = strip(read(p));
    assert.match(s, new RegExp(`<TopBanner ${pl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} plan=\\{null\\}`), p);
    assert.equal((s.match(/<TopBanner /g) ?? []).length, 1, `${p}: 띠 배너 자리는 한 곳`);
  }
  assert.ok(existsSync("app/components/ads/TopBanner.tsx"));
});

test("관리 › 배너 — 띠 배너 이미지 URL 입력 · 저장 · 미리보기(실제 자리와 같은 클래스)", () => {
  const c = strip(read("app/admin/banners/BannersClient.tsx"));
  assert.match(c, /imageUrl: string;/);
  assert.match(c, /imageUrl: b\.imageUrl \?\? "",/);
  assert.match(c, /imageUrl: draft\.imageUrl\.trim\(\) \|\| null,/);
  assert.match(c, /띠 배너 이미지 URL/);
  assert.match(c, /onChange=\{\(e\) => set\("imageUrl", e\.target\.value\)\}/);
  assert.match(c, /\{draft\.imageUrl\.trim\(\) && \(\s*<div className="ad-strip" aria-label="띠 배너 미리보기">\s*<span className="ad-strip__box"/);
  assert.match(read("app/api/admin/banners/route.ts"), /imageUrl: body\.imageUrl \? String\(body\.imageUrl\) : null,/);
});
