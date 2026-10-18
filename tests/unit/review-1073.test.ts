/* [1073] 소유자 2026-10-17 — "홈페이지 전반에 간격, 글씨크기, 글자 위치, 칸 조정, 여유공간, 타 사이트 참고, 디자인 개선, 디테일 보강,
 * 심플한 구성, 간편한 이용, 세련된 디자인 … 모든 페이지를 대상으로" (선택: 공통 틀 + 페이지별 세부, 여러 묶음).
 * 이 묶음은 공통 틀 — 페이지마다 고치지 않고 토큰·공통 부품에서 고쳐 모든 페이지에 한 번에 닿는다(docs/design-review-1073.md).
 *  C1 PC·태블릿 글자 단계 — 본문 14 · 보조 13 · 캡션 12 · 카드 제목 16 · 화면 제목 24 · 홈 헤드라인 30(폰 data-mscale 은 그대로).
 *  C2 간격 눈금 3.5 → 4px(8px 눈금) · 토큰 대신 px 로 적은 글자도 PC 에서 같은 단계로.
 *  C3 화면 제목 하나의 단계 — h1 은 t-title(법적 문서 9 · 다이제스트 · 없는 주소 · 전문가 신청 상태 · 카드 · 프로필 · 위젯 · 데이터 출처 · API).
 *  C4 헤더 "노트 쓰기" 한 줄 고정(1024px 두 줄 접힘).
 *  C5 푸터 — 링크 23개 한 덩어리 → 묶음 4개(서비스 · 데이터 · 회사·고객 · 약관·정책) · 사업자 고지는 그 아래 한 칸.
 *  C6 넘침 — /creators 폰 가로 넘침 539px · /auctions 입찰마감 날짜 칸 밖으로. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const css = read("app/globals.css");
const block = css.slice(css.indexOf("[1073 · 전 페이지 공통 틀"));

test("C1·C2 PC·태블릿 토큰 — 글자 단계 · 4px 눈금 · px 글자 매핑 · 폰은 건드리지 않는다", () => {
  assert.ok(block.length > 0, "1073 블록이 없다");
  /* 맨 뒤에 덧붙였다(append-only) — 앞선 정의를 지우지 않고 뒤에서 이긴다 */
  assert.ok(css.lastIndexOf("--fs-body: 14px;") > css.indexOf("[1026c · 폰 글자·상자 90%]"));
  const media = block.slice(block.indexOf("@media (min-width: 768px)"));
  for (const [k, v] of [
    ["--fs-display", "30px"],
    ["--fs-title", "24px"],
    ["--fs-section", "16px"],
    ["--fs-body", "14px"],
    ["--fs-sub", "13px"],
    ["--fs-caption", "12px"],
    ["--spacing", "0.25rem"],
  ]) {
    assert.match(media, new RegExp(`${k}: ${v.replace(".", "\\.")};`), k);
  }
  assert.match(media, /\.text-\\\[10px\\\] \{\s*font-size: var\(--fs-caption\);/);
  assert.match(media, /\.text-\\\[12px\\\],\s*\.text-xs \{\s*font-size: var\(--fs-sub\);/);
  assert.match(media, /\.text-\\\[13px\\\] \{\s*font-size: var\(--fs-body\);/);
  assert.match(media, /\.text-\\\[15px\\\] \{\s*font-size: var\(--fs-section\);/);
  /* 폰 값은 이 블록에 없다 — html[data-mscale] 를 다시 적지 않는다 */
  assert.doesNotMatch(block, /data-mscale\]\s*\{/);
  /* 12px 미만 캡션을 다시 만들지 않는다 */
  assert.doesNotMatch(media, /--fs-caption: (9|10|11)px/);
});

test("C3 화면 제목 하나의 단계 — h1 은 t-title", () => {
  const files = [
    "app/legal/page.tsx",
    "app/legal/terms/page.tsx",
    "app/legal/privacy/page.tsx",
    "app/legal/location/page.tsx",
    "app/legal/youth/page.tsx",
    "app/legal/fees/page.tsx",
    "app/legal/community/page.tsx",
    "app/legal/expert/page.tsx",
    "app/legal/privacy-request/page.tsx",
    "app/digest/(index)/page.tsx",
    "app/not-found.tsx",
    "app/complex/compare/[slug]/not-found.tsx",
    "app/my/expert-profile/page.tsx",
    "app/notes/[id]/card/page.tsx",
    "app/u/[handle]/page.tsx",
    "app/widget/page.tsx",
    "app/data-sources/page.tsx",
    "app/developers/page.tsx",
    "app/dev-deals/page.tsx",
  ];
  for (const f of files) {
    const s = read(f);
    const h1s = s.match(/<h1 className="[^"]*"/g) ?? [];
    assert.ok(h1s.length > 0, f);
    for (const h of h1s) {
      assert.match(h, /\bt-title\b/, `${f}: ${h}`);
      assert.doesNotMatch(h, /text-2xl|text-\[\d+px\]|\bt-section\b|\bt-display\b|md:text-/, `${f}: ${h}`);
    }
  }
});

test("C4 헤더 '노트 쓰기' — 한 줄 고정 · 줄지 않음", () => {
  const h = read("app/components/Header.tsx");
  assert.match(h, /className="btn-outline btn-cta press hidden shrink-0 whitespace-nowrap px-4 py-\[9px\] t-body/);
});

test("C5 푸터 — 묶음 4개 · 링크·목적지 그대로 · 사업자 고지·수익 보장 문구는 보인다", () => {
  const f = read("app/components/Footer.tsx");
  assert.match(f, /const LINK_GROUPS = \[/);
  for (const g of ['{ id: "service", title: "서비스" }', '{ id: "data", title: "데이터" }', '{ id: "help", title: "회사 · 고객" }', '{ id: "policy", title: "약관 · 정책" }']) {
    assert.ok(f.includes(g), g);
  }
  /* 링크 23개 모두 묶음이 있다 */
  const links = f.match(/\{ label: "[^"]+", href: "[^"]+", bold: (true|false), group: "(service|data|help|policy)" \}/g) ?? [];
  assert.equal(links.length, 23);
  for (const href of ["/legal/terms", "/legal/privacy", "/subscription", "/subscription/payment-methods", "/support", "/imjang", "/tx", "/analysis/temperature", "/developers"]) {
    assert.ok(f.includes(`href: "${href}"`), href);
  }
  /* 개인정보처리방침은 여전히 굵게 */
  assert.match(f, /label: "개인정보처리방침", href: "\/legal\/privacy", bold: true/);
  /* PC 4열 · 폰 2열 · 세로 피치(폰 gap-y-5) · 쿠키 설정은 약관 묶음 끝 */
  assert.match(f, /className="grid grid-cols-2 gap-x-4 gap-y-7 pb-5 pt-1 md:grid-cols-4 md:gap-x-8 md:pb-6"/);
  assert.match(f, /flex min-w-0 flex-col items-start gap-y-5 md:gap-y-2\.5/);
  assert.match(f, /g\.id === "policy" && <CookieSettingsLink \/>/);
  /* 사업자 고지 · 수익 보장 미기재 문구 · 출처 접기는 그대로 */
  for (const t of ["상호: {biz.legalName}", "사업자등록번호:", "통신판매업 신고번호", "대표전화: ", "{NO_PROFIT_GUARANTEE_TEXT}"]) assert.ok(f.includes(t), t);
  assert.match(f, /<Fineprint className="pe-\[68px\] md:pe-0" label="출처 · 운영 주체">/);
  /* 탭바 여유(pb-[76px])는 그대로 */
  assert.match(f, /px-5 pb-\[76px\] pt-6 md:pb-10 md:pt-10/);
});

test("C6 넘침 — /creators 단계 설명은 접히고 · /auctions 날짜는 칸 안에서 접힌다", () => {
  const c = read("app/creators/page.tsx");
  assert.match(c, /<div className="min-w-0">\s*<div className="t-sub font-bold text-ink">\{s\.title\}<\/div>\s*<p className="nz-wrap mt-0\.5 t-sub/);
  const a = read("app/auctions/AuctionsClient.tsx");
  assert.match(a, /<dd className="m-0 t-num t-section text-ink \[overflow-wrap:anywhere\]">\{f\.v\}<\/dd>/);
});
