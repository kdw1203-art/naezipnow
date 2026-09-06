import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PREFIX_REDIRECTS, resolvePrefixRedirect } from "../../lib/seo/redirect-map";
import { parsePairSlugLoose } from "../../lib/market/complex-pair-slug";
import {
  findByRegionNameCandidates,
  marketRegionNameCandidates,
} from "../../lib/market/region-name-candidates";

/* [967 · 30d] 접두 리다이렉트 — 2026-09-06 404 로그의 실제 경로로 검사한다. */
test("/area/<한글 지역명> 은 디코딩해서 통합 검색으로 보낸다", () => {
  // /area/%EA%B0%95%EB%82%A8%EA%B5%AC = /area/강남구 (7일 404 로그 3회)
  assert.equal(
    resolvePrefixRedirect("/area/%EA%B0%95%EB%82%A8%EA%B5%AC"),
    `/search?q=${encodeURIComponent("강남구")}`,
  );
  // 이미 디코딩된 경로가 와도 같은 결과
  assert.equal(resolvePrefixRedirect("/area/강남구"), `/search?q=${encodeURIComponent("강남구")}`);
  // 하위 세그먼트는 첫 조각만 검색어로
  assert.equal(resolvePrefixRedirect("/area/x/y"), "/search?q=x");
});

test("/community/tag/<태그> 는 태그와 무관하게 /town/news 로 간다", () => {
  assert.equal(resolvePrefixRedirect("/community/tag/%EC%9E%AC%EA%B0%9C%EB%B0%9C"), "/town/news");
  assert.equal(resolvePrefixRedirect("/community/tag/a-b"), "/town/news");
});

test("꼬리가 없거나 공백뿐이면 규칙이 살지 않는다(404 가 맞다)", () => {
  assert.equal(resolvePrefixRedirect("/area"), null);
  assert.equal(resolvePrefixRedirect("/area/%20"), null);
  assert.equal(resolvePrefixRedirect("/community/tag"), null);
  assert.equal(resolvePrefixRedirect("/community/tags/x"), null);
  assert.equal(resolvePrefixRedirect("/glossary/georae-ryang"), null, "용어집은 살아 있는 라우트");
});

test("깨진 퍼센트 인코딩은 원문 그대로 다시 인코딩해 넘긴다(던지지 않는다)", () => {
  assert.equal(resolvePrefixRedirect("/area/%EA"), "/search?q=%25EA");
});

test("접두 표의 형식 — 앞뒤 슬래시, since 는 날짜", () => {
  for (const rule of PREFIX_REDIRECTS) {
    assert.ok(rule.fromPrefix.startsWith("/") && rule.fromPrefix.endsWith("/"), rule.fromPrefix);
    assert.match(rule.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(rule.reason.trim().length > 0);
  }
});

/* [967 · 30e] 단지 비교 슬러그 파서(클라이언트 안전판) */
test("비교 슬러그에서 두 단지 이름과 지역 id 를 꺼낸다", () => {
  const slug = `${encodeURIComponent("래미안 퍼스티지")}--${encodeURIComponent("반포자이")}--seoul-seocho`;
  assert.deepEqual(parsePairSlugLoose(slug), {
    first: "래미안 퍼스티지",
    second: "반포자이",
    regionId: "seoul-seocho",
  });
  // usePathname 이 이미 디코딩된 값을 줘도 같다
  assert.deepEqual(parsePairSlugLoose("래미안 퍼스티지--반포자이--seoul-seocho"), {
    first: "래미안 퍼스티지",
    second: "반포자이",
    regionId: "seoul-seocho",
  });
});

test("형태가 아니면 null — 지역 id 없음·구분자 부족·빈 이름", () => {
  assert.equal(parsePairSlugLoose("a--b"), null);
  assert.equal(parsePairSlugLoose("a--b--"), null);
  assert.equal(parsePairSlugLoose("--b--seoul-x"), null);
  assert.equal(parsePairSlugLoose("a--b--서울"), null, "지역 id 는 [a-z0-9-]");
  assert.equal(parsePairSlugLoose(""), null);
});

/* [967 · 28b] 지역 시세 표기 → 실거래 표기 후보 */
test("서울 구는 '서울 ' 접두, 인천 구는 '인천 ' 접두, 시·구 두 단어는 '시' 를 뗀다", () => {
  assert.deepEqual(marketRegionNameCandidates("seoul-gangnam", "강남구"), ["강남구", "서울 강남구"]);
  assert.deepEqual(marketRegionNameCandidates("incheon-yeonsu", "연수구"), ["연수구", "인천 연수구"]);
  assert.deepEqual(marketRegionNameCandidates("goyang-deogyang", "고양시 덕양구"), [
    "고양시 덕양구",
    "고양 덕양구",
  ]);
  // 변환이 이름을 바꾸지 못하면 중복 없이 하나만
  assert.deepEqual(marketRegionNameCandidates("sejong", "세종시"), ["세종시"]);
  assert.deepEqual(marketRegionNameCandidates("x", "   "), []);
});

test("후보 순서대로 실제 목록과 대조해 첫 일치를 돌려준다 — 없으면 null", () => {
  const list = [
    { name: "서울 강남구", lastDataAt: new Date("2026-09-05T19:00:00Z") },
    { name: "고양 덕양구", lastDataAt: null },
  ];
  assert.equal(findByRegionNameCandidates(list, "seoul-gangnam", "강남구")?.name, "서울 강남구");
  assert.equal(findByRegionNameCandidates(list, "goyang-deogyang", "고양시 덕양구")?.name, "고양 덕양구");
  assert.equal(findByRegionNameCandidates(list, "busan-haeundae", "해운대구"), null);
});

/* [967 · 30a·30b·30c] 정적 파일 — 형식이 틀리면 크롤러가 조용히 무시한다 */
const PUBLIC = path.resolve(process.cwd(), "public");
const read = (p: string) => readFileSync(path.join(PUBLIC, p), "utf8");

test("GSC 인증 파일은 구글 규격 한 줄이다", () => {
  assert.equal(read("googleb17db51603958760.html"), "google-site-verification: googleb17db51603958760.html");
});

test("security.txt — RFC 9116 필수 필드, 두 위치 동일, Expires 는 미래의 RFC3339", () => {
  const canonical = read(".well-known/security.txt");
  assert.equal(read("security.txt"), canonical, "루트 사본은 정식 위치와 같아야 한다");
  const fields = new Map(
    canonical
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf(":");
        return [l.slice(0, i), l.slice(i + 1).trim()] as const;
      }),
  );
  assert.equal(fields.get("Contact"), "mailto:nuguzip@naver.com");
  assert.equal(fields.get("Canonical"), "https://naezipnow.com/.well-known/security.txt");
  assert.equal(fields.get("Preferred-Languages"), "ko, en");
  const expires = fields.get("Expires") ?? "";
  assert.match(expires, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.ok(Date.parse(expires) > Date.now(), `Expires 가 지났다: ${expires} — 갱신해야 한다`);
});

test("app-ads.txt 는 애드센스 게시자 선언 한 줄(주석 제외)", () => {
  const lines = read("app-ads.txt").split("\n").filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(lines, ["google.com, pub-6291134577962996, DIRECT, f08c47fec0942fa0"]);
});
