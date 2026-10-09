/* [1040] 운영 경보·적재 부분 실패·뉴스→지역 연결 — 규칙을 실제 코드로 고정한다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chunkRows,
  isStatementTimeout,
  mergeRedo,
  redoCodesFor,
  redoTypesKey,
  UPSERT_CHUNK_ROWS,
  type RedoEntry,
} from "@/lib/market/molit-core";
import { failureReasonLabel, firstErrorOf } from "@/lib/market/ingest-outcome";
import {
  newsSidoOf,
  newsTitleRegions,
  resolveNewsRegion,
  strictNewsRegion,
  tallyNewsRegions,
} from "@/lib/news/region-link";

const read = (p: string) => readFileSync(p, "utf8");

test("chunkRows — 500행씩 · 나머지 · 빈 배열", () => {
  const rows = Array.from({ length: 1234 }, (_, i) => i);
  const chunks = chunkRows(rows);
  assert.deepEqual(chunks.map((c) => c.length), [500, 500, 234]);
  assert.equal(chunks.flat().length, 1234);
  assert.deepEqual(chunkRows([]), []);
  assert.equal(UPSERT_CHUNK_ROWS, 500);
});

test("isStatementTimeout — 57014·문구 둘 다", () => {
  assert.equal(isStatementTimeout("canceling statement due to statement timeout"), true);
  assert.equal(isStatementTimeout("57014"), true);
  assert.equal(isStatementTimeout("duplicate key value"), false);
  assert.equal(isStatementTimeout(null), false);
});

test("다시 받기 명단 — 더하기·빼기·중복 없음·월·유형별 조회", () => {
  const a: RedoEntry = { code: "41390", ym: "202311", types: "apartment" };
  const b: RedoEntry = { code: "11680", ym: "202311", types: "apartment" };
  const list = mergeRedo([], [a, a, b], []);
  assert.equal(list.length, 2);
  assert.deepEqual(redoCodesFor(list, "202311", "apartment"), ["41390", "11680"]);
  assert.deepEqual(redoCodesFor(list, "202312", "apartment"), []);
  assert.deepEqual(mergeRedo(list, [], [a]), [b]);
  /* 같은 실행에서 다시 실패한 것은 남는다 */
  assert.equal(mergeRedo(list, [a], [a]).length, 2);
  assert.equal(mergeRedo([{ code: "x", ym: "202311", types: "apartment" }], [], []).length, 0);
  assert.equal(redoTypesKey(["rowhouse", "apartment", "apartment"]), "apartment,rowhouse");
});

test("적재 코드 — 조각 upsert · 다시 받기 명단을 맨 앞에", () => {
  const src = read("lib/market/molit-transactions.ts");
  assert.match(src, /export async function upsertInChunks\(/);
  assert.match(src, /const up = await upsertInChunks\(sb, payload\);/);
  assert.doesNotMatch(src, /\.upsert\(payload, \{ onConflict: "external_key" \}\)/);
  assert.match(src, /!redoCodes\.has\(info\.sigunguCd\)/);
  assert.match(src, /writeCursor\(MOLIT_REDO_KEY/);
});

test("firstErrorOf · failureReasonLabel — 로그의 첫오류를 사유 한 줄로", () => {
  const msg = "slice=-1 시도=22 기존커버=0 빈응답=0 오류=1 raw=미저장 첫오류=41390: canceling statement due to statement timeout";
  assert.equal(firstErrorOf(msg), "41390: canceling statement due to statement timeout");
  assert.equal(firstErrorOf("slice=1 시도=16 오류=0"), null);
  assert.equal(failureReasonLabel(firstErrorOf(msg)), "DB 시간 제한(8초) · 다음 실행 자동 재시도");
  assert.equal(
    failureReasonLabel("41370: 국토부 API 응답 실패(RTMSDataSvcRHRent 30 등록되지 않은 서비스키)"),
    "공공데이터포털 활용신청 필요",
  );
  assert.equal(failureReasonLabel(""), null);
  assert.match(read("app/admin/page.tsx"), /사유 · \{p\.reason\}/);
});

test("newsSidoOf — 시·도만 인정", () => {
  assert.equal(newsSidoOf("서울특별시"), "서울");
  assert.equal(newsSidoOf("경기도"), "경기");
  assert.equal(newsSidoOf("경남"), "경남");
  assert.equal(newsSidoOf("경상남도"), "경남");
  assert.equal(newsSidoOf("수도권"), null);
  assert.equal(newsSidoOf("강남구"), null);
  assert.equal(newsSidoOf(""), null);
});

test("strictNewsRegion — 부분 일치 없음 · 겹치는 이름은 시·도가 있어야", () => {
  assert.equal(strictNewsRegion("강남구", "서울")?.id, "gangnam");
  assert.equal(strictNewsRegion("서울 강남구 대치동", null)?.id, "gangnam");
  assert.equal(strictNewsRegion("분당구", null)?.id, "seongnam-bundang");
  assert.equal(strictNewsRegion("성남시 분당구 정자동", "경기")?.id, "seongnam-bundang");
  assert.equal(strictNewsRegion("수원 영통구", null)?.id, "suwon-yeongtong");
  assert.equal(strictNewsRegion("중구", null), null);
  assert.equal(strictNewsRegion("중구", "서울")?.id, "jung");
  assert.equal(strictNewsRegion("중구", "부산")?.id, "busan-jung");
  assert.equal(strictNewsRegion("부산 해운대구", null)?.id, "busan-haeundae");
  assert.equal(strictNewsRegion("강서구", null), null);
  assert.equal(strictNewsRegion("서울", null), null);
  assert.equal(strictNewsRegion("경기", null), null);
  assert.equal(strictNewsRegion("성남시", "경기"), null);
  /* 시·도가 어긋나면 붙이지 않는다 */
  assert.equal(strictNewsRegion("강남구", "부산"), null);
});

test("newsTitleRegions — 제목에서 구·시 · 통용 지명 · 다른 낱말의 일부는 아님", () => {
  assert.deepEqual(newsTitleRegions("강남구 재건축 속도… 압구정 3구역 시공사 선정", "서울"), ["gangnam"]);
  assert.deepEqual(newsTitleRegions("송파 헬리오시티 84㎡ 신고가", null), ["songpa"]);
  assert.deepEqual(newsTitleRegions("성남 분당구 리모델링 첫 삽", "경기"), ["seongnam-bundang"]);
  assert.deepEqual(newsTitleRegions("부산 중구·대구 중구 원도심 정비", null), ["busan-jung", "daegu-jung"]);
  assert.deepEqual(newsTitleRegions("중구난방 대책에 시장 혼선", "서울"), []);
  assert.deepEqual(newsTitleRegions("강남권 전세 품귀", "서울"), []);
  assert.deepEqual(newsTitleRegions("강남 3구 거래량 반등", "서울"), []);
  assert.deepEqual(newsTitleRegions("강북 아파트값 상승 전환", "서울"), []);
  assert.deepEqual(newsTitleRegions("기준금리 동결… 주택담보대출 금리는", null), []);
  assert.deepEqual(newsTitleRegions("구리 가격 급등에 건설 원가 부담", null), []);
  assert.deepEqual(newsTitleRegions("판교·동탄 오피스 공실률 하락", "경기"), ["seongnam-bundang", "hwaseong-dongtan"]);
  /* 서울 기사에서 "분당"은 붙이지 않는다(시·도가 다르다) */
  assert.deepEqual(newsTitleRegions("분당 따라잡는 서울 외곽", "서울"), []);
  assert.deepEqual(newsTitleRegions("해운대구 엘시티 실거래", "서울"), ["busan-haeundae"]);
});

test("resolveNewsRegion — region(시·도) → geo → 태그 → 제목 순 · 종합 기사는 풀지 않는다", () => {
  assert.deepEqual(resolveNewsRegion({ region: "서울", title: "기준금리 동결" }), { id: null, via: null, sido: "서울" });
  assert.equal(resolveNewsRegion({ region: "서울", geo: { sido: "서울특별시", sigungu: "마포구" } }).via, "sigungu");
  assert.equal(resolveNewsRegion({ region: "경기", geo: { places: ["경기도 성남시 분당구 정자동"] } }).id, "seongnam-bundang");
  assert.equal(resolveNewsRegion({ region: "", tags: ["재건축", "노원구"], title: "상계주공 재건축" }).id, "nowon");
  assert.equal(resolveNewsRegion({ region: "서울", title: "용산 정비창 개발 본궤도" }).via, "title");
  assert.equal(resolveNewsRegion({ region: "수도권", title: "과천 지식정보타운 청약" }).id, "gwacheon");
  assert.equal(resolveNewsRegion({ region: "서울 강남구" }).via, "region");
  assert.equal(
    resolveNewsRegion({ region: "서울", title: "강남구·서초구·송파구·용산구 토지거래허가 연장" }).id,
    null,
  );
  assert.deepEqual(resolveNewsRegion({ region: "", title: "전국 아파트값 보합" }), { id: null, via: null, sido: null });
});

test("resolveNewsRegion — 수집 메타의 실제 꼴(배열·빈 배열·엉뚱한 값)에 넘어지지 않는다", () => {
  assert.equal(resolveNewsRegion({ region: "서울", geo: { sido: "서울", sigungu: ["송파구"] } }).id, "songpa");
  assert.equal(resolveNewsRegion({ region: "서울", geo: { sido: "서울", sigungu: [] }, title: "금리 동결" }).id, null);
  assert.equal(resolveNewsRegion({ region: "서울", geo: { sigungu: ["강남구", "서초구", "송파구"] }, title: "강남구 재건축" }).id, null);
  assert.equal(resolveNewsRegion({ region: "대전", geo: { sido: "대전", sigungu: "서구" } }).id, "daejeon-seo");
  assert.equal(resolveNewsRegion({ region: "인천", geo: { sido: "인천", sigungu: "서구" } }).id, null); // 2026-07 분구로 폐지된 이름
  assert.equal(resolveNewsRegion({ region: "", geo: { sido: 3, sigungu: { a: 1 }, places: "서울 강남구 대치동" } }).id, "gangnam");
  assert.equal(resolveNewsRegion({ region: "", geo: { places: ["서울", "전국", "서울 양천구 목동"] } }).via, "place");
  assert.equal(resolveNewsRegion({ region: "평촌신도시" }).id, "anyang-dongan");
  assert.equal(resolveNewsRegion({ region: "수도권", geo: { sido: "수도권", sigungu: "강서구" } }).id, null);
});

test("tallyNewsRegions — 연결 · 시·도만 · 지역 없음", () => {
  const t = tallyNewsRegions([
    { region: "서울", title: "마포 래미안 신고가" },
    { region: "서울", title: "서울 아파트값 3주 연속 상승" },
    { region: "", title: "금리 동결" },
    { region: "경기", geo: { sigungu: "하남시" } },
  ]);
  assert.deepEqual([t.total, t.linked, t.sidoOnly, t.noRegion], [4, 2, 1, 1]);
  assert.equal(t.via.title, 1);
  assert.equal(t.via.sigungu, 1);
});

test("뉴스 상세 · 관리 화면이 같은 해석기를 쓴다", () => {
  const page = read("app/town/news/[id]/page.tsx");
  assert.match(page, /resolveNewsRegion\(\{/);
  assert.match(page, /\{regionLinkName \?\? region\} 시세 보기 ›/);
  const loader = read("lib/admin/news-region-link.ts");
  assert.match(loader, /geo:automation_meta->geo/);
  assert.match(loader, /tallyNewsRegions\(inputs\)/);
});

/* ── 색인 기준 · 보관 화면 · 사이트맵 ─────────────────────────────────── */
import {
  complexIndexTier,
  complexPageIndexable,
  complexShowsAds,
  isRecentContractYm,
  kstYm,
  tierInSitemap,
} from "@/lib/seo/complex-index-policy";
import { ARCHIVED_PREFIXES, ARCHIVED_ROBOTS } from "@/lib/seo/archived-routes";

test("complexIndexTier — 전 기간 3건 + 최근 12개월 거래가 있어야 사이트맵", () => {
  const now = "202610";
  assert.equal(complexIndexTier(0, null, now), "none");
  assert.equal(complexIndexTier(2, "202609", now), "sparse");
  assert.equal(complexIndexTier(40, "202509", now), "stale");
  assert.equal(complexIndexTier(3, "202511", now), "full"); // 12개월 창의 첫 달(당월 포함 12칸)
  assert.equal(complexIndexTier(3, "202510", now), "stale");
  assert.equal(complexIndexTier(120, "202610", now), "full");
  assert.deepEqual(["full", "stale", "sparse", "none"].map((t) => tierInSitemap(t as never)), [true, false, false, false]);
  assert.equal(isRecentContractYm("2026-09", now), false);
  assert.equal(kstYm(Date.UTC(2026, 8, 30, 15, 0, 0)), "202610"); // UTC 9/30 15:00 = KST 10/1 00:00
});

test("사이트맵 ⊂ 색인 — 사이트맵에 실린 단지는 페이지 색인 조건을 반드시 통과한다", () => {
  /* full 은 최근 12개월에 1건 이상 → complexPageIndexable(*, ≥1) = true */
  assert.equal(complexPageIndexable(1, 1), true);
  assert.equal(complexPageIndexable(3, 0), true);
  assert.equal(complexPageIndexable(2, 0), false);
  assert.equal(complexPageIndexable(0, 0), false);
  assert.equal(complexShowsAds(null), true);
  assert.equal(complexShowsAds(2), false);
  assert.equal(complexShowsAds(3), true);
  const page = read("app/complex/[id]/page.tsx");
  assert.match(page, /const hasSubstance = tx\.length > 0 && complexPageIndexable\(windowDeals, n12\);/);
  assert.match(page, /\{complexShowsAds\(v\.dealCount\) && \(/);
  const build = read("lib/seo/build-sitemap.ts");
  assert.match(build, /tierInSitemap\(tier\) && c\.tradeCount >= SITEMAP_MIN_TRADE_COUNT/);
  /* 마지막 계약월 열을 못 읽으면 최근 거래 기준 없이 싣는다(사이트맵을 비우지 않는다) */
  assert.match(build, /c\.lastContractYm === undefined \? nowYm : c\.lastContractYm/);
  assert.match(read("lib/seo/sitemap-entries.ts"), /error\.code === "42703"/);
});

test("정비사업 구역 사이트맵 — [1040] lastmod 생략은 [1045] 에서 되돌렸다(감시를 끈 것이었다)", () => {
  /* 1040 은 낡은 lastmod(2026-07-22) 경보를 없애려고 <lastmod> 자체를 뺐다. 운영 점검(seo.sitemap_source · lastmod_vanish)이
     "수리 없이 꺼진 경보"라고 짚었고, 맞는 말이다. 1045 는 살아 있는 원천을 싣고 날짜를 사실대로 다시 적는다
     (자세한 고정은 tests/unit/alerts-1045.test.ts). 여기서는 되돌려졌다는 사실만 남긴다. */
  const build = read("lib/seo/build-sitemap.ts");
  const at = build.indexOf("export async function loadRedevelopmentEntries()");
  const body = build.slice(at, build.indexOf("/** N14", at));
  assert.ok(at > 0);
  assert.match(body, /lastModified/);
  assert.match(body, /priority: 0\.5/);
});

test("보관 화면 — 메타 robots 가 머리(X-Robots-Tag)와 같은 noindex, follow", () => {
  assert.deepEqual(ARCHIVED_ROBOTS, { index: false, follow: true });
  /* page-metadata 는 next/headers 사슬이라 node:test 가 부르지 못한다 — 소스로 고정 */
  assert.match(read("lib/seo/page-metadata.ts"), /: input\.archived\s+\? \{ robots: \{ index: false, follow: true \} \}/);
  const files = [
    "app/qna/page.tsx",
    "app/qna/[id]/page.tsx",
    "app/notes/templates/page.tsx",
    "app/notes/templates/[id]/page.tsx",
    "app/notes/market/page.tsx",
    /* [1047] 전문가 세 화면은 보관 해제(소유자 지시 2026-10-09) — 목록에서 뺐다 */
    "app/town/groups/page.tsx",
    "app/town/library/page.tsx",
    "app/town/library/[id]/page.tsx",
    "app/town/prompt/[idx]/page.tsx",
    "app/dev-deals/page.tsx",
    "app/dev-deals/[id]/page.tsx",
    "app/dev-deals/fees/page.tsx",
    "app/dev-deals/partners/page.tsx",
    "app/partners/page.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.ok(/ARCHIVED_ROBOTS|archived: true/.test(src), f);
    assert.doesNotMatch(src, /robots: \{ index: true, follow: true \}/, f);
    assert.ok(ARCHIVED_PREFIXES.some((p) => `/${f.replace(/^app\//, "")}`.startsWith(`${p}/`)), f);
  }
});

test("색인 대상인데 사이트맵에 없던 화면 — AI 도구는 싣고 결정 카드는 색인하지 않는다", () => {
  const build = read("lib/seo/build-sitemap.ts");
  assert.match(build, /for \(const tool of AI_TOOL_IDS\) \{\s+entries\.push\(\{ url: `\$\{BASE_URL\}\/analysis\/ai\/\$\{tool\}`/);
  assert.match(read("app/decide/page.tsx"), /noIndex: true,/);
});

import { needsServiceApproval } from "@/lib/market/ingest-outcome";

test("활용신청 대기는 고장이 아니다 — skipped 로 적고 사유를 가른다", () => {
  assert.equal(needsServiceApproval("활용신청 필요 — RTMSDataSvcRHRent: 공공데이터포털"), true);
  assert.equal(needsServiceApproval("41370: 국토부 API 응답 실패(RTMSDataSvcRHRent 30 등록되지 않은 서비스키)"), true);
  assert.equal(needsServiceApproval("41390: canceling statement due to statement timeout"), false);
  assert.equal(needsServiceApproval(null), false);
  const tx = read("lib/market/molit-transactions.ts");
  assert.match(tx, /aborted && notRegistered && result\.inserted === 0\s+\? "skipped"/);
  assert.match(tx, /중단=활용신청 필요\(\$\{notRegistered\} · 남은 시군구 미시도\)/);
  assert.match(read("lib/market/molit-nonapt.ts"), /needsServiceApproval\(result\.reason\) && result\.inserted === 0/);
});

test("DB 점검 미러 — 원장과 같은 글(md5) · 금칙 낱말 없음", async () => {
  const { createHash } = await import("node:crypto");
  const sql = read("supabase/migrations/20261006083402_1040_alert_checks_follow_sitemap_policy.sql");
  assert.equal(createHash("md5").update(sql).digest("hex"), "4e4de441fb813b9d2f09db4eb9527749");
  assert.equal(sql.endsWith("\n"), false);
  assert.match(sql, /where not v_use_policy or \(m\.trade_count >= 3 and m\.last_contract_ym >= v_recent\);/);
  assert.match(sql, /v_lost <= least\(30, greatest\(2, ceil\(active_cnt \* 0\.03\)\)\) and v_added >= v_lost and v_net >= 0/);
});
