/* [1069] 2026-10-15 운영 검토 세 가지(소유자 선택 "세 가지 전부").
 *  V1 끊긴 묶음 — 사이트맵에는 있는데 어디서도 링크되지 않던 /imjang · /tx · /analysis/temperature 로 가는 길.
 *  V2 지역 → 임장 — 단지 → 지역 → 임장 가이드 사슬을 잇는다(같은 지역 원천·같은 slug).
 *  V3 수정일 — 확인된 시각이 있는 곳만 채운다(추측 금지 원칙은 그대로).
 *  V4 허브 검색어 — 제목 앞자리에 사람이 치는 말.
 *
 * 실측 근거(2026-10-15 · 운영): 홈·단지 상세·지역 상세·헤더·푸터 어디에도 /imjang 링크 0개
 * (임장노트 목록 한 곳 제외) · 단지 상세에서 /tx 링크 0개 · 월간 리포트 30쪽 <lastmod> 0개. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("V1 끊긴 묶음 — 푸터가 모든 화면에서 세 묶음으로 길을 낸다", () => {
  const src = read("app/components/Footer.tsx");
  for (const href of ['href: "/imjang"', 'href: "/tx"', 'href: "/analysis/temperature"']) {
    assert.ok(src.includes(href), `푸터에 ${href} 없음`);
  }
  /* 라벨은 목적지를 그대로 — 기능 이름이 아니라 그 묶음의 이름 */
  assert.match(src, /label: "임장 가이드", href: "\/imjang"/);
});

test("V2 지역 상세 — 같은 지역 임장 가이드로 가는 링크", () => {
  const src = read("app/region/[id]/page.tsx");
  assert.match(src, /href=\{`\/imjang\/\$\{encodeURIComponent\(txBandRegion\.slug\)\}`\}/);
  /* 실거래 구간 링크는 그대로 — 둘이 한 줄에 선다 */
  assert.match(src, /href=\{`\/tx\/\$\{encodeURIComponent\(txBandRegion\.slug\)\}`\}/);
});

test("V3 수정일 — 확인된 시각이 있는 곳만", () => {
  const src = read("lib/seo/build-sitemap.ts");
  /* 월간 리포트: 그 달 집계의 실측 갱신 시각 */
  assert.match(src, /const at = monthAt\(m\.updatedAt\)/);
  assert.match(src, /newestMonthAt \? \{ lastModified: newestMonthAt \}/);
  /* 지역 리포트 인덱스: 지역 페이지와 같은 시각 */
  assert.match(src, /url: `\$\{BASE_URL\}\/region\/\$\{s\.regionId\}\/report`,\s*\n\s*\.\.\.\(at \? \{ lastModified: at \} : \{\}\)/);
  /* 끝난 달(/report/<ym>)에는 적지 않는다 — 바뀌지 않는 표에 "방금 바뀌었다"를 적지 않는다(G6 원칙) */
  const past = src.slice(src.indexOf("for (const slug of reportSlugs)"));
  const block = past.slice(0, past.indexOf("}") + 1);
  assert.ok(!block.includes("lastModified"), "지난달 리포트에 lastmod 가 붙었다");
});

test("V4 허브 제목 — 검색되는 말이 앞", () => {
  const CASES: [string, string, string][] = [
    ["app/town/page.tsx", "동네 아파트 시세", "동네이야기"],
    ["app/notes/(index)/page.tsx", "아파트 임장 후기·체크리스트", "임장노트"],
    ["app/map/page.tsx", "아파트 실거래가 지도", "지도에서 비교"],
  ];
  for (const [p, key, old] of CASES) {
    const src = read(p);
    const line = src.split("\n").find((l) => l.includes("title:") && l.includes(key));
    assert.ok(line, `${p}: 제목에 "${key}" 없음`);
    assert.ok(!line.trim().startsWith(`title: "${old}"`), `${p}: 옛 제목 그대로`);
  }
  /* 설명도 발췌가 설 만큼은 길다(옛 /town 은 25자였다) */
  const town = read("app/town/page.tsx");
  /* 주석이 사이에 끼어도 찾도록 — 설명은 "지역별 동네 홈" 으로 시작하는 한 줄이다 */
  const d = /"(지역별 동네 홈[^"]+)"/.exec(town);
  assert.ok(d, "/town 설명을 찾지 못했다");
  assert.ok(d[1].length >= 60, `/town 설명이 짧다: ${d[1].length}자`);
  /* [1044] 이 화면은 기사를 싣지 않는다 — 설명에도 "뉴스"가 없어야 한다 */
  assert.ok(!d[1].includes("뉴스"), "/town 설명에 뉴스");
});
