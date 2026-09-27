import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TOWN_FEED_REGIONS,
  feedRegionLabel,
  isTownFeedRegionId,
  regionMatches,
  townFeedRegionById,
  townRegionChips,
} from "@/lib/town/feed-regions";
import { parseTownFeedFilters, townFeedFilterQuery, TOWN_FEED_DEFAULT_FILTERS } from "@/lib/town/feed-filters";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

/* [v4] 동네이야기 허브(/town) "한 화면 한 가지" 개편 — 소유자 지시("너무 복잡하고 뭐가 중요한지 … 어수선하다").
 *
 *  1) 순수 규칙 — 지역 줄이 동네 홈 링크 칩에서 **피드 필터 칩**이 됐다(lib/town/feed-regions · feed-filters ?region=).
 *  2) 화면 소스 — 머리(제목 + 작은 글쓰기) · 뉴스 한 행 · 지역 칩 · 밑줄 탭 · 1px 선 행 목록 · 맨 아래 "동네 자료" 한 줄.
 *     지운 것(네이비 히어로·통계 줄·"우리 동네 홈" 설명·카테고리 타일·하우스 광고·카드 배지·#태그·"N개 표시 중")이
 *     다시 들어오지 않게 잠근다. */

const read = (p: string): string => readFileSync(p, "utf8");
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* ── 1. 지역 칩(순수) ─────────────────────────────────────────────────────── */

test("[v4] regionMatches — 두 토막 이름은 두 토막 모두, 빈 지역은 어느 동네도 아니다", () => {
  assert.equal(regionMatches("서울 마포구 아현동", "마포구"), true);
  assert.equal(regionMatches("서울마포구", "마포구"), true);
  assert.equal(regionMatches("경기도 성남시 분당구 서현동", "성남 분당구"), true);
  assert.equal(regionMatches("경기 성남시 수정구", "성남 분당구"), false, "성남만 맞으면 안 된다");
  assert.equal(regionMatches("경기 용인시 분당구", "성남 분당구"), false, "분당구만 맞으면 안 된다");
  assert.equal(regionMatches("", "마포구"), false);
  assert.equal(regionMatches(null, "마포구"), false);
});

test("[v4] townRegionChips — 0건 동네는 빼고, 많은 순 · 같은 수면 목록 순", () => {
  const cards = [
    { region: "서울 강남구 대치동" },
    { region: "서울 마포구 아현동" },
    { region: "서울 마포구 성산동" },
    { region: "서울 노원구 월계동" },
    { region: "서울 동대문구 용두동" },
    { region: "전국" },
  ];
  assert.deepEqual(townRegionChips(cards), [
    { id: "mapo", name: "마포구", count: 2 },
    { id: "gangnam", name: "강남구", count: 1 },
    { id: "nowon", name: "노원구", count: 1 },
  ]);
  assert.deepEqual(townRegionChips([]), []);
  /* 칩 id 는 전부 동네 홈 경로(/town/{id})로 쓰이는 목록 안의 값 */
  for (const r of TOWN_FEED_REGIONS) assert.ok(isTownFeedRegionId(r.id));
  assert.equal(isTownFeedRegionId("seoul"), false);
  assert.equal(townFeedRegionById("mapo")?.name, "마포구");
  assert.equal(townFeedRegionById("x"), null);
});

test("[v4] feedRegionLabel — 메타 줄에는 동 토막을 뗀 동네, '전국'·빈 값은 비운다", () => {
  assert.equal(feedRegionLabel("서울 동대문구 용두동"), "서울 동대문구");
  assert.equal(feedRegionLabel("경기도 성남시 분당구 서현동"), "경기도 성남시 분당구");
  assert.equal(feedRegionLabel("경기 수원시 권선구"), "경기 수원시 권선구", "구로 끝나면 그대로");
  assert.equal(feedRegionLabel("서울 강남구"), "서울 강남구", "두 토막은 그대로");
  assert.equal(feedRegionLabel("전국"), "");
  assert.equal(feedRegionLabel(""), "");
  assert.equal(feedRegionLabel(undefined), "");
});

test("[v4] 피드 필터 URL — ?region= 은 아는 id 만, 기본값 모양은 그대로", () => {
  assert.deepEqual(parseTownFeedFilters("?region=mapo"), { ...TOWN_FEED_DEFAULT_FILTERS, region: "mapo" });
  assert.deepEqual(parseTownFeedFilters("?region=seoul"), TOWN_FEED_DEFAULT_FILTERS, "모르는 id 는 버린다");
  assert.equal("region" in parseTownFeedFilters(""), false, "지역이 없으면 키도 없다");
  assert.equal(townFeedFilterQuery({ ...TOWN_FEED_DEFAULT_FILTERS, region: "nowon" }), "?region=nowon");
  assert.equal(townFeedFilterQuery(TOWN_FEED_DEFAULT_FILTERS, "?region=mapo&ref_code=a"), "?ref_code=a", "전체로 돌아가면 지운다");
  const f = { kind: "note" as const, sort: "latest" as const, mine: false, region: "gangnam" as const };
  assert.deepEqual(parseTownFeedFilters(townFeedFilterQuery(f)), f);
});

test("[v4] 카테고리 카탈로그 — 허브 밖 다섯 칸에 짧은 이름(맨 아래 '동네 자료' 한 줄)", () => {
  const shorts = TOWN_CATEGORY_LINKS.filter((l) => l.href !== "/town").map((l) => l.short);
  assert.deepEqual(shorts, ["뉴스룸", "청약", "공매", "입주", "정비사업"]);
});

/* ── 2. 화면 소스 ─────────────────────────────────────────────────────────── */

test("[v4] /town — 머리 · 뉴스 한 행 · 피드 · 동네 홈 전체 · 동네 자료 한 줄, 광고·타일·설명 없음", () => {
  const code = stripComments(read("app/town/page.tsx"));
  assert.doesNotMatch(code, /AdZone|AdSlot/, "v4 규칙 9 — 하우스 광고 제거");
  assert.doesNotMatch(code, /우리 동네 홈|최근 노트·글 기준/, "설명 라벨 제거");
  assert.doesNotMatch(code, /TownCategoryNav|TownNewsStrip |loadTownCategoryCounts/, "타일 줄·스트립·타일 집계 없음");
  assert.match(code, /<TownNewsRow today=\{todayNews\} headline=\{newsRows\[0\]\?\.title \?\? null\} \/>/);
  assert.match(code, /<TownFeed cards=\{firstPage\} hasMore=\{hasMore\} loadFailed=\{loadFailed\} \/>/);
  assert.match(code, /max-w-\[760px\]/, "데스크톱도 가운데 한 줄");
  assert.match(code, /동네 자료 —/);
  assert.match(code, /\{l\.short \?\? l\.label\}/);
  assert.match(code, /<TownIndex \/>/);
  assert.match(code, /export const revalidate = 86_400;/);
});

test("[v4] 오늘 뉴스 행 — 한 행 · 오늘 0건이면 없음 · 배지 없음", () => {
  const src = stripComments(read("app/town/TownNewsStrip.tsx"));
  const row = src.slice(src.indexOf("export function TownNewsRow"), src.indexOf("export function TownNewsStrip"));
  assert.ok(row.length > 0);
  assert.match(row, /if \(!Number\.isFinite\(today\) \|\| today <= 0\) return null;/);
  assert.match(row, /오늘 뉴스 <span className="t-num">/);
  assert.match(row, /border-y border-line/);
  assert.doesNotMatch(row, /자동 수집|news-strip|<Icon/, "배지·스트립 재질·아이콘 없음");
});

test("[v4] 피드 — 행(72px 썸네일 · 제목 2줄 · 메타 한 줄), 배지·태그·상태 문장 없음, 필터 칩은 한지+남색", () => {
  const code = stripComments(read("app/town/feed-client.tsx"));
  assert.match(code, /h-\[72px\] w-\[72px\] shrink-0 overflow-hidden rounded-lg bg-divider/, "사진 없으면 --divider 단면");
  assert.match(code, /clamp-2 t-section text-ink/);
  assert.doesNotMatch(code, /"Lab 데이터"|직접 방문|badge-new|>NEW</, "설명 배지 없음(v4 규칙 6)");
  assert.doesNotMatch(code, /#\{t\}|card\.tags\.slice/, "#태그 없음");
  assert.doesNotMatch(code, /개 표시 중|마지막이에요|사람 노트 \$\{/, "상태·구성 문장 없음");
  assert.doesNotMatch(code, /bg-primary-soft/, "지역 알약 없음");
  assert.match(code, /chip-active/, "선택 칩 = 한지 + 남색");
  assert.doesNotMatch(code, /ad\?: ReactNode|AD_AFTER_INDEX/, "피드 중간 광고 자리 없음");
  /* 기능 유지 — 필터 URL 동기화 · 더 보기 · 스크롤 복원 · 관심지역 칩 */
  assert.match(code, /townFeedFilterQuery\(filters, window\.location\.search\)/);
  assert.match(code, /\/api\/town\/feed\?before=/);
  assert.match(code, /useScrollRestore\(/);
  assert.match(code, /내 관심지역/);
  assert.match(code, /\{selectedRegion\.name\} 동네 홈 보기 ›/, "지역을 고르면 동네 홈으로 가는 길");
});

test("[v4] 글쓰기 — 작은 아웃라인 하나 + 메뉴(동네이야기 · 임장노트), 채움 파랑은 빈 화면 하나뿐", () => {
  const code = stripComments(read("app/town/feed-client.tsx"));
  const menu = code.slice(code.indexOf("export function TownWriteMenu"), code.indexOf("function recommendScore"));
  assert.match(menu, /btn-outline btn-sm/);
  assert.doesNotMatch(menu, /btn-primary/);
  assert.match(menu, /\/town\/write\?region=\$\{encodeURIComponent\(myRegion\)\}/, "관심지역 미리 채움(B22)");
  assert.match(menu, /href="\/notes\/new"/);
  assert.equal((code.match(/btn-primary/g) ?? []).length, 1, "빈 화면 CTA 하나");
});
