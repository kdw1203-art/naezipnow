import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { regionIdForName } from "@/lib/region/catalog";

/* [1023 · 동네] docs/review-1022.md 4장 ①·②·③ 잔여 항목이 소스에 실제로 적용됐는지 잠근다.
 *  · ① 동네 홈 머리 캡션(공개 임장노트 N · 최근 3건 — 추가 조회 없음)
 *  · ① 피드 카드 지역 → 동네 홈 링크(카탈로그 매핑이 있을 때만 · 중첩 앵커 없음)
 *  · ① 뉴스룸 주제 칩 줄이 머리 아래(레일의 중복 삭제)
 *  · ① 전문가 필터 URL 반영 replaceState 만
 *  · ① Q&A 상세 단지·지역 배지 링크(단지는 행의 id 만 · 노트는 동네 홈)
 *  · ② 피드 실패 고지 흰 카드 + "다시 시도"(40px · 같은 fetch)
 *  · ③ 빈 상태 꼬리 설명문 → 사실 한 줄 · 전문가 소개 카드의 중복 통계 삭제 */

const read = (p: string): string => readFileSync(p, "utf8");
/** 주석은 규칙 기록을 남기는 자리라 검사에서 뺀다 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/* ── 지역 이름 → 동네 홈 id 매핑(피드 카드·Q&A 배지가 같은 함수를 쓴다) ────────── */

test("[1023 · 동네 ①] regionIdForName — 카탈로그에 있는 이름만 id, 없으면 null(죽은 링크 없음)", () => {
  assert.equal(regionIdForName("강남구"), "gangnam");
  assert.equal(regionIdForName("서울 강남구"), "gangnam");
  assert.equal(regionIdForName("없는동네xyz"), null);
  assert.equal(regionIdForName(""), null);
});

/* ── 동네 홈 머리 캡션 ──────────────────────────────────────────────────────── */

test("[1023 · 동네 ①] 동네 홈 머리 — 공개 임장노트 N · 최근 3건 캡션, 추가 조회 없음", () => {
  const src = read("app/town/[region]/page.tsx");
  assert.match(src, /^\/\* \[1023/m, "[1023] 표식");
  const c = code("app/town/[region]/page.tsx");
  assert.ok(c.includes("이 동네 공개 임장노트"), "캡션 문구");
  assert.match(c, /regionNotes\.slice\(0, 3\)/, "최근 3건은 이미 읽은 배열의 앞 3편");
  assert.match(c, /regionNotes\.length > 0 \?/, "0편이면 캡션을 그리지 않는다");
  assert.equal((c.match(/listPublicNotes\(/g) ?? []).length, 1, "노트 조회는 예전처럼 한 번");
  assert.ok(c.includes('min-h-[24px]'), "최근 노트 링크 24px 하한");
  assert.match(c, /export const revalidate = 604_800;/, "ISR 정책 유지");
});

/* ── 피드 카드 지역 링크 · 실패 고지 · 빈 상태 ──────────────────────────────── */

test("[1023 · 동네 ①] 피드 카드 지역 → 동네 홈 — 카탈로그 매핑이 있을 때만, 카드 <Link> 안이라 중첩 <a> 대신 role=link", () => {
  const src = read("app/town/feed-client.tsx");
  assert.ok(/^\s*"use client";/.test(src), '"use client" 첫 줄 유지');
  const c = code("app/town/feed-client.tsx");
  assert.match(c, /import \{ regionIdForName \} from "@\/lib\/region\/catalog"/);
  assert.match(c, /function RegionChip\(/);
  assert.match(c, /if \(!regionId\) return <span className=\{className\}>\{region\}<\/span>;/, "매핑 없으면 글자만");
  assert.match(c, /role="link"/);
  assert.ok(c.includes("min-h-[24px]"), "인라인 링크 24px 하한");
  assert.equal((c.match(/<RegionChip /g) ?? []).length, 2, "이야기 카드·노트 카드 둘 다");
  /* 카드 전체가 <Link> 다 — 그 안에 <Link>/<a> 를 넣지 않는다 */
  assert.ok(!/href=\{`\/town\/\$\{regionId\}`\}/.test(c), "중첩 앵커 없음");
});

test("[1023 · 동네 ②] 피드 실패 고지 — 흰 카드(bg-danger-soft 없음) + 다시 시도 40px, 더 보기와 같은 fetch", () => {
  const c = code("app/town/feed-client.tsx");
  assert.ok(!c.includes("bg-danger-soft"), "위험색 면 없음");
  assert.match(c, /const fetchPage = useCallback\(/, "한 장 fetch 를 공유");
  assert.match(c, /const retryFeed = useCallback\(/);
  assert.match(c, /await fetchPage\(Date\.now\(\), 0\)/, "다시 시도는 첫 장(경계 = 지금)");
  assert.match(c, /await fetchPage\(oldest, allCards\.length\)/, "더 보기는 예전 경계 그대로");
  assert.equal((c.match(/\/api\/town\/feed\?before=/g) ?? []).length, 1, "API 주소는 한 곳");
  assert.equal((c.match(/onClick=\{retryFeed\}/g) ?? []).length, 2, "고지·빈 상태 둘 다 다시 시도");
  assert.match(c, /"다시 시도"/);
  /* 다시 시도 버튼은 btn-md(40px) */
  assert.match(c, /onClick=\{retryFeed\}[\s\S]{0,200}btn-soft btn-md/);
  assert.ok(!c.includes("새로고침해 주세요"), "권유문 없음");
});

test("[1023 · 동네 ③] 피드 빈 상태 — 설명문 꼬리 삭제, 사실 한 줄(이 피드 · … 0건) · 채움 파랑은 머리 하나", () => {
  const c = code("app/town/feed-client.tsx");
  for (const s of ["바로 보여요", "가장 먼저 노출돼요", "이어서 볼 수 있어요", "데이터 조회가 실패했어요"]) {
    assert.ok(!c.includes(s), `설명문 없음: ${s}`);
  }
  assert.ok(c.includes("이 피드 · "), "사실 한 줄");
  assert.ok(!c.includes("btn-primary"), "피드 안 채움 파랑 없음(/town 머리의 이야기 쓰기 하나)");
});

/* ── 뉴스룸 주제 칩 줄 ─────────────────────────────────────────────────────── */

test("[1023 · 동네 ①] 뉴스룸 — 주제 칩 줄이 머리 바로 아래(카테고리 줄 앞), 레일의 같은 칩은 없다", () => {
  const src = read("app/town/news/page.tsx");
  assert.match(src, /^\/\* \[1023/m);
  const c = code("app/town/news/page.tsx");
  const head = c.indexOf("<PageHead");
  const chips = c.indexOf("NEWS_TAGS.map(");
  const nav = c.indexOf("<TownCategoryNav stick />");
  assert.ok(head > 0 && chips > head && nav > chips, "PageHead → 주제 칩 → 카테고리 줄 순서");
  assert.equal((c.match(/NEWS_TAGS\./g) ?? []).length, 1, "주제 칩은 한 번만 그린다");
  assert.match(c, /aria-label="주제별 뉴스"/);
  assert.ok(c.includes("min-h-[24px]"), "칩 24px 하한");
  assert.match(c, /export const revalidate = 86_400;/, "ISR 정책 유지");
});

/* ── 전문가 ────────────────────────────────────────────────────────────────── */

test("[1023 · 동네 ①] 전문가 필터 URL — replaceState 만(pushState 없음) · 첫 값은 마운트 뒤 location.search", () => {
  const src = read("app/town/experts/ExpertsClient.tsx");
  assert.ok(/^\s*"use client";/.test(src));
  const c = code("app/town/experts/ExpertsClient.tsx");
  assert.ok(!c.includes("pushState"), "pushState 없음");
  assert.match(c, /window\.history\.replaceState\(/);
  assert.ok(c.includes("window.location.search"));
  assert.ok(!c.includes("useSearchParams"), "정적 셸 규칙");
});

test("[1023 · 동네 ③] 전문가 소개 카드 — 머리(TownHero)와 겹치는 통계 칸 삭제, 평점만 한 줄", () => {
  const c = code("app/town/experts/page.tsx");
  assert.ok(!c.includes("CountUp"), "CountUp 칸 없음");
  assert.ok(!c.includes(">답변 완료 상담<"), "머리와 겹치는 칸 없음");
  assert.ok(!c.includes("후기 아직 없음"), "빈 칸 대신 생략");
  assert.equal((c.match(/평균 후기 평점/g) ?? []).length, 1);
  assert.match(c, /avgRating !== null \? \(/, "평점은 후기가 있을 때만");
  /* 머리 통계는 그대로(API 불변) */
  assert.match(c, /label: "인증 전문가", value: verified\.length/);
  assert.match(c, /label: "누적 상담 답변", value: answered/);
});

/* ── Q&A 상세 ──────────────────────────────────────────────────────────────── */

test("[1023 · 동네 ①] Q&A 상세 — 단지 배지는 행의 complexId 가 있을 때만 링크, 지역 배지·공개 노트는 동네 홈(/notes?q= 없음)", () => {
  const src = read("app/qna/[id]/page.tsx");
  assert.match(src, /^\/\* \[1023/m);
  const c = code("app/qna/[id]/page.tsx");
  assert.match(c, /const complexIdHref = question\.complexId \? `\/complex\/\$\{encodeURIComponent\(question\.complexId\)\}` : null;/);
  assert.match(c, /const regionId = question\.region \? regionIdForName\(question\.region\) : null;/);
  assert.match(c, /href=\{complexIdHref\}/, "단지 배지 링크");
  assert.match(c, /href=\{townHref\}/, "지역 배지 링크");
  assert.ok(!c.includes("/notes?q="), "/notes 에 검색 파라미터가 없으므로 쓰지 않는다");
  assert.ok(c.includes("min-h-[24px]"), "배지 링크 24px 하한");
  assert.match(c, /export const revalidate = 604_800;/, "ISR 정책 유지");
});
