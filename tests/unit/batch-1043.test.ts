/* [1043] 뉴스룸 머리 통일 · 동네이야기 = 이웃 글만 · 임장노트 독자 평가 · 지오코딩 · 성능.
   순수 규칙은 실제 코드로, 화면·서버 배선은 소스 문자열로 고정한다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyMyRating,
  filledStars,
  filledWidthPx,
  parseStars,
  ratingFact,
  summarizeStars,
} from "@/lib/inspection/note-rating-math";
import {
  buildGeocodePlan,
  buildHintQueries,
  cleanLotAddress,
  expectedSidoKeys,
  GEOCODE_RULES_SINCE,
  hitInSido,
  isPlaceholderLot,
  sidoKeyOf,
  withFullSido,
} from "@/lib/map/geocode-query";
import { regionSido, regionSigunguByCode } from "@/lib/map/geocode-region";
import { isLegacyProbeSample, LEGACY_PROBE_UAS } from "@/lib/client/probe";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 임장노트 독자 평가 ─────────────────────────────────────────────────────── */

test("별점 — 정수 1~5 만 받는다(반올림하지 않는다)", () => {
  for (const ok of [1, 2, 3, 4, 5, "4"]) assert.equal(parseStars(ok), Number(ok));
  for (const bad of [0, 6, 4.5, "4.5", "", null, undefined, NaN, "abc", -1, {}]) assert.equal(parseStars(bad), null);
});

test("별점 요약 — 0명은 평균 없음(0점이라고 적지 않는다) · 소수 첫째 자리", () => {
  assert.deepEqual(summarizeStars([]), { count: 0, average: null });
  assert.deepEqual(summarizeStars([5, 4, 4]), { count: 3, average: 4.3 });
  assert.deepEqual(summarizeStars([5, 9, 0, 2.5]), { count: 1, average: 5 }, "범위 밖·소수는 세지 않는다");
  assert.equal(ratingFact(summarizeStars([])), null);
  assert.equal(ratingFact(summarizeStars([5, 4, 4])), "독자 평가 4.3 · 3명");
  assert.equal(filledStars(4.3), 4);
  assert.equal(filledStars(4.5), 5);
  assert.equal(filledStars(null), 0);
  /* 평균 별은 평균만큼만 채운다 — 4.5 를 꽉 찬 다섯 개로 그리지 않는다 */
  assert.equal(filledWidthPx(4.5, 18, 2), 89);
  assert.equal(filledWidthPx(5, 18, 2), 100);
  assert.equal(filledWidthPx(4, 18, 2), 80);
  assert.equal(filledWidthPx(null, 18, 2), 0);
  assert.equal(filledWidthPx(7, 18, 2), 100);
});

test("내 평가를 바꾸면 인원은 그대로, 처음이면 한 명 는다", () => {
  assert.deepEqual(applyMyRating({ count: 0, average: null }, null, 4), { count: 1, average: 4 });
  assert.deepEqual(applyMyRating({ count: 2, average: 4 }, null, 1), { count: 3, average: 3 });
  assert.deepEqual(applyMyRating({ count: 2, average: 4 }, 5, 3), { count: 2, average: 3 });
});

test("평가 API — 로그인 · 공개 노트 · 내 노트 불가 · 한 사람 한 번(유일 제약에 얹는다)", () => {
  const route = code("app/api/inspection/notes/[id]/rating/route.ts");
  assert.match(route, /if \(!email\) return NextResponse\.json\(\{ error: "로그인 필요" \}, \{ status: 401 \}\)/);
  assert.match(route, /if \(!note \|\| !note\.isPublic\) return NextResponse\.json\(\{ error: "없음" \}, \{ status: 404 \}\)/);
  assert.match(route, /code: "own_note" \}, \{ status: 403 \}/);
  assert.match(route, /parseStars\(body\.stars\)/);
  assert.match(route, /invalidateNoteCache\(id, "rating"\)/);
  const store = code("lib/inspection/note-ratings.ts");
  assert.match(store, /onConflict: "note_id,rater_email"/);
  assert.ok(!/rater_email[^\n]*NextResponse/.test(route), "누가 줬는지는 응답에 없다");
  const sql = read("supabase/migrations/20261006150529_1043_note_ratings.sql");
  assert.match(sql, /constraint note_ratings_note_rater_key unique \(note_id, rater_email\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.note_ratings from public, anon, authenticated/);
});

test("노트 상세 — 평가 칸이 댓글과 한 카드 · 목록 바닥줄은 있을 때만", () => {
  const page = code("app/notes/[id]/page.tsx");
  assert.match(page, /getNoteRating\(realNote\.id, viewerEmail\)/);
  /* 평가 부품은 따로 받는 청크(NoteRatingLazy) — /notes/[id] 라우트 번들 상한(495KB) 안에 머문다 */
  assert.match(page, /<NoteRatingLazy/);
  assert.ok(!page.includes('from "./NoteRating"'), "page 는 본체를 직접 import 하지 않는다");
  assert.ok(page.indexOf("<NoteRatingLazy") < page.indexOf("<NoteComments"), "평가가 댓글 위");
  const feed = code("lib/notes/feed-note.ts");
  assert.match(feed, /if \(fact\) c\.footer\.push\(fact\);/);
  assert.match(feed, /if \(n > 0\) c\.footer\.push\(`댓글 \$\{n\.toLocaleString\("ko-KR"\)\}`\);/);
  const ui = code("app/notes/[id]/NoteRating.tsx");
  assert.match(ui, /role="radiogroup"/);
  assert.match(ui, /h-10 w-10/, "별 하나 40px");
  assert.match(ui, /\{!isOwner && \(/, "내 노트에는 누르는 별이 없다");
});

/* ── 동네이야기 · 뉴스룸 ────────────────────────────────────────────────────── */

test("동네이야기 피드는 이웃 글만 — 노트를 읽지 않는다 · 유형 칸 없음", () => {
  const feed = code("lib/town/feed.ts");
  assert.ok(!feed.includes("listPublicNotes("), "피드가 공개 노트를 읽지 않는다");
  assert.match(feed, /export async function loadTownFeed\(\): Promise<TownFeedSource>/);
  const page = code("app/town/page.tsx");
  assert.ok(!page.includes("임장노트 쓰기"));
  assert.ok(!page.includes("Lab 노트"));
  assert.match(page, /sub="이웃 글 · 동네 단위"/);
  const client = code("app/town/feed-client.tsx");
  assert.ok(!client.includes('aria-label="글 유형"'), "전체·임장노트·이야기 칸 없음");
  assert.ok(client.includes("이웃 글 없음"));
  const hub = TOWN_CATEGORY_LINKS.find((l) => l.href === "/town");
  assert.ok(hub && !hub.desc.includes("노트") && !hub.headSub.includes("노트"));
});

test("뉴스룸 머리 — 다른 동네 카테고리와 같은 부품(PageHead 한 줄) · 숫자 줄 없음", () => {
  const news = code("app/town/news/page.tsx");
  /* [1044] 뉴스가 동네에서 떨어져 나와 머리를 TownHero(카테고리 목록) 대신 NewsHead 에서 받는다 — 부품은 같은 PageHead */
  assert.match(news, /<NewsHead \/>/);
  assert.match(code("app/town/news/NewsHead.tsx"), /<PageHead/);
  assert.ok(!news.includes("<PageHead"), "화면 안에 따로 짠 머리 없음");
  for (const s of ["같은 사건 묶어", "최근 <b", "todayCount"]) assert.ok(!news.includes(s), `숫자 줄 없음: ${s}`);
  /* 같은 부품을 쓰는 화면들 */
  for (const p of ["app/apply/page.tsx", "app/supply/page.tsx", "app/auctions/page.tsx", "app/redevelopment/page.tsx"]) {
    assert.match(code(p), /<TownHero/, p);
  }
  const town = code("app/town/page.tsx");
  assert.ok(!town.includes("오늘 기사"), "동네 홈의 뉴스룸 칸에도 숫자 없음");
});

/* ── 지오코딩 ───────────────────────────────────────────────────────────────── */

test("지번 자리가 블록 표기·숫자 없음이면 주소가 아니다", () => {
  for (const a of ["평택시 지제동 가-", "용인 수지구 동천동 BL-", "포항시 북구 흥해읍 이인리 BL-24-7", "구로구 항동 가-238", "광양시 황금동", "", null]) {
    assert.equal(isPlaceholderLot(a), true, String(a));
  }
  for (const a of ["계양구 방축동 37-2", "남구 신정동 산107-50", "평택시 지제동 1048"]) assert.equal(isPlaceholderLot(a), false, a);
});

test("분양 공고 주소 — 꼬리를 떼고, 지번이 없으면 빈 값", () => {
  assert.equal(cleanLotAddress("경기도 과천시 별양동 7번지 일원"), "경기도 과천시 별양동 7");
  assert.equal(cleanLotAddress("부산광역시 수영구 광안동 971번지 외 157필지"), "부산광역시 수영구 광안동 971");
  assert.equal(cleanLotAddress("서울특별시 강동구 상일동 43번지 일원(서울고덕강일 공공주택지구 12블럭)"), "서울특별시 강동구 상일동 43");
  assert.equal(cleanLotAddress("충청북도 청주시 상당구 용암동 산222 일원"), "충청북도 청주시 상당구 용암동 산222");
  assert.equal(cleanLotAddress("서울특별시 성동구 홍익동 119-1,2"), "서울특별시 성동구 홍익동 119-1");
  assert.equal(cleanLotAddress("대전광역시 유성구 용계동 70대 일원"), "대전광역시 유성구 용계동 70");
  for (const a of ["부산광역시 강서구 대저2동  0-0", "부산광역시 강서구 에코델타시티 공동주택용지 31BL", "경기도 화성시 화성비봉 공공택지지구 B-1블록", "충청북도 음성군 대소면 삼정지구 A3블록", ""]) {
    assert.equal(cleanLotAddress(a), "", a);
  }
});

test("시·도 검증 — 다른 시·도면 버리고, 모르면 통과", () => {
  assert.equal(sidoKeyOf("경기도 광주시 오포읍"), "경기");
  assert.equal(sidoKeyOf("전남광주통합특별시 동구"), "전남");
  assert.equal(sidoKeyOf("강원특별자치도 춘천시"), "강원");
  assert.equal(sidoKeyOf("평택시 지제동"), null);
  assert.deepEqual(expectedSidoKeys("전남광주통합특별시"), ["전남", "광주"]);
  assert.deepEqual(expectedSidoKeys("광주광역시"), ["전남", "광주"]);
  assert.deepEqual(expectedSidoKeys(""), []);
  assert.equal(hitInSido("경상남도 사천시 동서동 1", ["인천"]), false, "인천 계양구 '동서' → 312km 밖");
  assert.equal(hitInSido("인천광역시 서구 가정로 437", ["인천"]), true);
  assert.equal(hitInSido("가정로 437", ["인천"]), true, "시·도를 못 읽으면 통과");
  assert.equal(hitInSido("부산광역시 해운대구 x", []), true, "기대를 모르면 통과");
});

test("지역 표기 → 시·도 — 겹치는 이름은 모른다고 답한다", () => {
  assert.equal(regionSido("평택시"), "경기도");
  assert.equal(regionSido("서울 종로구"), "서울특별시");
  assert.equal(regionSido("수원 영통구"), "경기도");
  assert.equal(regionSido("고성군"), null, "강원·경남에 같은 이름");
  assert.equal(regionSido("경기"), "경기", "분양 단지의 region 은 시·도 짧은 이름");
  assert.equal(regionSido(""), null);
  assert.deepEqual(regionSigunguByCode("41220"), { sido: "경기도", sigungu: "평택시" });
  /* 구가 있는 시의 구 — 표의 sido 칸은 "용인시"지만 시·도는 경기도다 */
  assert.deepEqual(regionSigunguByCode("41465"), { sido: "경기도", sigungu: "용인시 수지구" });
  assert.equal(regionSido("용인 수지구"), "경기도");
  assert.equal(regionSigunguByCode("41000"), null, "시·도 행은 시군구가 아니다");
  assert.equal(regionSigunguByCode("abc"), null);
});

test("후보 — 단지명으로는 묻지 않는다 · 거래 원본 단서는 도로명이 먼저", () => {
  assert.deepEqual(buildGeocodePlan({ region: "평택시", name: "지제역더샵센트럴시티", address: "평택시 지제동 가-", sido: "경기도" }), []);
  assert.deepEqual(
    buildGeocodePlan({ region: "평택시", name: "x", address: "평택시 지제동 1048", sido: "경기도" }).map((q) => q.query),
    ["경기도 평택시 지제동 1048", "평택시 지제동 1048"],
  );
  assert.deepEqual(
    buildHintQueries({ sido: "경기도", sigungu: "용인시 수지구", roadName: "고기로45번길 40-18", lotAddress: "용인 수지구 동천동 가-" }),
    [{ query: "경기도 용인시 수지구 고기로45번길 40-18", kind: "road" }],
  );
  assert.deepEqual(
    buildHintQueries({ sido: "인천광역시", sigungu: "서해구", roadName: "가정로 437", lotAddress: "서해구 가정동 608" }).map((q) => q.query),
    ["인천광역시 서해구 가정로 437", "인천광역시 가정로 437", "인천광역시 서해구 가정동 608"],
  );
  assert.deepEqual(buildHintQueries({ sido: "경기도", sigungu: "평택시", roadName: "지제동삭1로", lotAddress: null }), [], "건물번호 없는 도로명은 쓰지 않는다");
  assert.equal(withFullSido("경기도", "광주시 오포읍 1"), "경기도 광주시 오포읍 1");
  assert.equal(withFullSido("경기도", "경기도 평택시 x 1"), "경기도 평택시 x 1");
  assert.ok(Number.isFinite(Date.parse(GEOCODE_RULES_SINCE)));
});

test("지오코딩 배선 — 화면은 캐시만 · 백필은 v2 줄 · 진행률은 같은 모집단", () => {
  const page = code("app/complex/[id]/page.tsx");
  assert.match(page, /getCachedCoord\(dec\.region, dec\.name\)/);
  assert.ok(!page.includes("geocodeAndCache("), "화면을 그리는 길에서 외부 지오코더를 부르지 않는다");
  assert.match(code("app/complex/[id]/brief/load.ts"), /getCachedCoord\(dec\.region, dec\.name\)/);
  const lib = code("lib/map/complex-geocode.ts");
  assert.match(lib, /sb\.rpc\("complexes_needing_geocode_v2", \{\s+p_limit: limit,\s+p_retry_before: GEOCODE_RULES_SINCE,/);
  assert.match(lib, /naverGeocode\(query, 1, \{ fresh: true \}\)/);
  assert.match(lib, /if \(!hitInSido\(where, allowed\)\)/);
  assert.match(lib, /sb\.rpc\("geocode_coverage"\)/);
  assert.match(code("lib/admin/data-health-extras.ts"), /sb\.rpc\("geocode_coverage"\)/);
  const sql = read("supabase/migrations/20261006152844_1043_geocode_coverage_and_requeue.sql");
  assert.match(sql, /create or replace function public\.geocode_coverage\(\)/);
  assert.match(sql, /create or replace function public\.complexes_needing_geocode_v2\(/);
  assert.match(sql, /revoke all on function public\.geocode_coverage\(\) from public, anon, authenticated/);
  const supply = code("lib/market/supply-geocode.ts");
  assert.match(supply, /retryNotfound: true/);
});

/* ── 성능 ───────────────────────────────────────────────────────────────────── */

test("점검 로봇 표본 — 기한 안의 고정 UA 만 뺀다", () => {
  const ua = LEGACY_PROBE_UAS[0];
  assert.equal(isLegacyProbeSample(ua, "2026-10-03T23:44:18Z"), true);
  assert.equal(isLegacyProbeSample(ua, "2026-10-09T00:00:00Z"), false, "기한 뒤의 같은 UA 는 사람으로 본다");
  assert.equal(isLegacyProbeSample("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36", "2026-10-03T00:00:00Z"), false);
  assert.equal(isLegacyProbeSample(null, "2026-10-03T00:00:00Z"), false);
  assert.match(code("app/components/WebVitalsReporter.tsx"), /if \(isProbeSession\(\)\) return;/);
  assert.match(code("app/admin/perf/page.tsx"), /isLegacyProbeSample\(r\.user_agent, r\.created_at\)/);
  for (const p of ["scripts/review/probe-prod.mjs", "scripts/review/design-probe.mjs"]) {
    assert.ok(read(p).includes('localStorage.setItem("nz_probe", "1")'), p);
  }
});

test("직렬 조회를 함께 띄운다 — 뉴스 상세 · 단지 상세 · 타입 탭은 단추 먼저", () => {
  const news = code("app/town/news/[id]/page.tsx");
  assert.ok(news.indexOf("const hiddenP = isPostHidden(uuid)") < news.indexOf("await getTownPost(uuid);\n  if (!post) notFound();"));
  assert.match(news, /const \[relatedSiteHref, tagComplexHrefs\] = await Promise\.all\(\[/);
  const store = code("lib/newui/board-posts.ts");
  assert.match(store, /const boardP = getBoardPost\(id\);\s+boardP\.catch\(\(\) => \{\}\);/);
  const complex = code("app/complex/[id]/page.tsx");
  assert.match(complex, /const \[dealMarks, dealsWithCancelled\] = dealsKnown\s+\? await Promise\.all\(\[/);
  assert.match(code("app/complex/[id]/TxTrendSection.tsx"), /const shownKey = useDeferredValue\(typeKey\);/);
  const sw = read("public/sw.js");
  assert.match(sw, /self\.registration\.navigationPreload\.enable\(\)/);
  assert.match(sw, /navigateNetworkFirst\(req, event\.preloadResponse\)/);
});
