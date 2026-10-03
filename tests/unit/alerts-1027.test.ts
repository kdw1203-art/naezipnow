/* [1027 · 제안 5] 지역 알림 — 누르면 정말 구독되고, 적힌 알림이 정말 간다.
 *
 * 예전: "{지역} 시세 알림 받기"·"이 지역 알림 받기"는 알림함을 여는 링크였고(구독 없음),
 * 그 위 한 줄은 "실거래 등록·지수 변동 알림"(없는 알림)이었다. 그리고 지역 구독이 보내는 청약 알림은
 * 값 안에 "서울"·"경기" 글자가 있을 때만 갔다 — 지역 선택기가 넣는 "성남 분당구"·"과천시"는 한 건도 못 받았다.
 * 순수 함수는 실제 코드를 부르고, server-only 사슬(구독 저장·크론)은 소스 문자열로 잠근다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALERT_REGION_MAX_CHARS,
  alertRegionCatalogId,
  alertRegionDistrictToken,
  alertRegionSidos,
  alertRegionTarget,
  canonicalAlertRegion,
  listingRegionKeys,
  matchAnnouncementRegion,
} from "../../lib/alerts/region-value";
import { molitRegionLabel } from "../../lib/market/molit-core";
import { listLeafSigungu } from "../../lib/national-data/region-codes";
import { regionIdForName } from "../../lib/region/catalog";

const raw = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("[1027] 구독 값은 실거래 region_name 표기 하나로 — 화면마다 다른 표기가 같은 값이 된다", () => {
  /* 이미 그 표기면 그대로(지역 선택기·기존 구독 4건) */
  for (const v of ["서울 강남구", "성남 분당구", "안양 만안구", "과천시", "광주 광산구", "세종시", "부산 부산진구"]) {
    assert.equal(canonicalAlertRegion(v), v, v);
  }
  /* 온도·시세·타이밍 화면의 표기("<시/도> <정식 이름>") */
  assert.equal(canonicalAlertRegion("경기 안양시 만안구"), "안양 만안구");
  assert.equal(canonicalAlertRegion("경기 광명시"), "광명시");
  assert.equal(canonicalAlertRegion("경기 화성시 동탄구"), "화성 동탄구");
  assert.equal(canonicalAlertRegion("인천 계양구"), "인천 계양구");
  /* 운영 온도 표의 겹친 표기 — 시/도가 두 번(2026-07 폐지된 구라 실거래 표에는 없다 → 한 번으로만 정리) */
  assert.equal(canonicalAlertRegion("인천 인천 중구"), "인천 중구");
  assert.deepEqual(alertRegionSidos("인천 인천 중구"), ["인천"]);
  /* 카탈로그 이름(전세가율 화면) — 시/도 없이 */
  assert.equal(canonicalAlertRegion("강남구"), "서울 강남구");
  assert.equal(canonicalAlertRegion("안양시 만안구"), "안양 만안구");
  assert.equal(canonicalAlertRegion("해운대구"), "부산 해운대구");
  assert.equal(canonicalAlertRegion("부산진구"), "부산 부산진구");
  /* 시/도 없이 적힌, 여러 시/도에 있는 이름은 이 사이트의 표기 규칙대로 — 카탈로그·매물 등록 화면에서 시/도 없는
     "중구"는 서울 중구다(sidoOfRegionName). 화면의 버튼은 시/도를 붙여 보내므로 이 길은 옛 값·매물 이름에서만 탄다 */
  assert.equal(canonicalAlertRegion("중구"), "서울 중구");
  assert.equal(canonicalAlertRegion("부산 중구"), "부산 중구");
  /* 카탈로그에도 없는 모호한 이름은 손대지 않는다 */
  assert.equal(canonicalAlertRegion("동구"), "동구");
  assert.deepEqual(alertRegionSidos("동구"), []);
  /* 긴 시/도 이름 · 시/도 단위 구독 */
  assert.equal(canonicalAlertRegion("서울특별시 강남구"), "서울 강남구");
  assert.equal(canonicalAlertRegion("경기도 성남시 분당구"), "성남 분당구");
  assert.equal(canonicalAlertRegion("서울"), "서울");
  assert.equal(canonicalAlertRegion("서울특별시"), "서울");
  /* 공백 정리 · 모르는 값은 손대지 않는다(지어내지 않는다) */
  assert.equal(canonicalAlertRegion("  서울   강남구 "), "서울 강남구");
  assert.equal(canonicalAlertRegion("판교"), "판교");
  assert.equal(canonicalAlertRegion("서울 없는구"), "서울 없는구");
  assert.equal(canonicalAlertRegion(""), "");
  /* 구를 가진 시의 이름(구가 생기기 전의 실거래 표기 · 지역 선택기의 "경기 수원시")도 시/도는 분명하다 */
  assert.equal(canonicalAlertRegion("경기 수원시"), "수원시");
  assert.deepEqual(alertRegionSidos("화성시"), ["경기"]);
  assert.deepEqual(alertRegionSidos("성남시"), ["경기"]);
  /* 같은 표기가 두 시/도에 있는 "고성군" — 시/도를 붙여 온 값은 떼지 않는다(떼면 어느 고성인지 잃는다) */
  assert.equal(canonicalAlertRegion("강원 고성군"), "강원 고성군");
  assert.equal(canonicalAlertRegion("경남 고성군"), "경남 고성군");
  assert.deepEqual(alertRegionSidos("강원 고성군"), ["강원"]);
  assert.equal(alertRegionDistrictToken("강원 고성군"), "고성군");
  /* 같은 시/도가 거듭 적힌 값 · 객체 열쇠 이름 같은 값 · 지나치게 긴 값 — 터지지 않고, 지어내지 않는다 */
  assert.equal(canonicalAlertRegion("서울 서울 서울 강남구"), "서울 강남구");
  for (const odd of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(canonicalAlertRegion(odd), odd, odd);
    assert.deepEqual(alertRegionSidos(odd), [], odd);
    assert.equal(alertRegionTarget(odd), null, odd);
  }
  const long = Array(5000).fill("서울").join(" ");
  assert.equal(canonicalAlertRegion(long), long, "긴 값은 표를 뒤지지 않고 그대로");
  assert.deepEqual(alertRegionSidos(long), []);
  assert.equal(ALERT_REGION_MAX_CHARS, 60);
  /* 한 번 더 넣어도 같은 값 */
  for (const v of ["경기 안양시 만안구", "강남구", "인천 인천 중구", "서울특별시", "판교", "고성군", "강원 고성군", "경기 수원시", "중구"]) {
    assert.equal(canonicalAlertRegion(canonicalAlertRegion(v)), canonicalAlertRegion(v), v);
  }
});

test("[1027] 실거래 표기 전부가 제 시/도로 풀린다 — 표에서 읽는다(글자 찾기 아님)", () => {
  const leaf = listLeafSigungu();
  assert.ok(leaf.length > 200);
  let two = 0;
  for (const info of leaf) {
    const label = molitRegionLabel(info);
    assert.equal(canonicalAlertRegion(label), label, `${label} 은 이미 저장 표기`);
    const sidos = alertRegionSidos(label);
    assert.ok(sidos.length >= 1, `${label} 시/도 없음`);
    if (sidos.length > 1) two += 1;
  }
  /* 두 시/도에 걸친 표기는 "고성군"(강원·경남) 하나뿐 */
  assert.deepEqual(alertRegionSidos("고성군").sort(), ["강원", "경남"]);
  assert.equal(two, 2, "고성군 두 행");

  assert.deepEqual(alertRegionSidos("성남 분당구"), ["경기"]);
  assert.deepEqual(alertRegionSidos("과천시"), ["경기"]);
  assert.deepEqual(alertRegionSidos("안양 만안구"), ["경기"]);
  assert.deepEqual(alertRegionSidos("청주 상당구"), ["충북"]);
  assert.deepEqual(alertRegionSidos("목포시"), ["전남"]);
  assert.deepEqual(alertRegionSidos("광주 광산구"), ["광주"]);
  assert.deepEqual(alertRegionSidos("세종시"), ["세종"]);
  assert.deepEqual(alertRegionSidos("서울"), ["서울"]);
  /* 경기 광주시는 광주광역시가 아니다 — 예전 규칙(글자 "광주" 포함)은 광주 공고를 보냈다 */
  assert.deepEqual(alertRegionSidos("광주시"), ["경기"]);
  /* 뒤에 읍·동이 붙은 값은 앞 낱말부터 줄여 가며 표에서 찾는다 — 글자 "광주"를 찾지 않는다 */
  assert.deepEqual(alertRegionSidos("광주시 오포읍"), ["경기"]);
  /* 시/도를 앞에 적은 값은 그 시/도 */
  assert.deepEqual(alertRegionSidos("서울 없는구"), ["서울"]);
  /* 글자 포함으로 시/도를 짐작하지 않는다 — "강남 서울대입구" 는 서울이 아니다(모른다) */
  assert.deepEqual(alertRegionSidos("강남 서울대입구"), []);
  /* 통용 지명("판교")은 시군구가 아니다 — 모르는 것은 모른다고 둔다(sidoOfRegionName 은 정확 일치만) */
  assert.deepEqual(alertRegionSidos("판교"), []);
});

test("[1027] 청약 공고 맞추기 — 같은 시/도면 알리고, 주소에 시군구가 있으면 먼저 · 두 시/도에 걸친 값은 주소가 맞을 때만", () => {
  const bundang = alertRegionTarget("성남 분당구")!;
  assert.deepEqual(bundang, { value: "성남 분당구", sidos: ["경기"], district: "분당구" });
  assert.deepEqual(matchAnnouncementRegion(bundang, { region: "경기", address: "경기도 성남시 분당구 정자동 1" }), { hit: true, strong: true });
  assert.deepEqual(matchAnnouncementRegion(bundang, { region: "경기", address: "경기도 화성시 동탄구" }), { hit: true, strong: false });
  assert.deepEqual(matchAnnouncementRegion(bundang, { region: "서울", address: "서울특별시 강남구" }), { hit: false, strong: false });

  /* 예전에도 되던 값은 그대로 */
  const gangnam = alertRegionTarget("서울 강남구")!;
  assert.equal(gangnam.district, "강남구");
  assert.equal(matchAnnouncementRegion(gangnam, { region: "서울", address: "서울특별시 강남구 대치동" }).strong, true);

  /* 시/도만 구독 — 시군구 낱말 없음 */
  assert.equal(alertRegionDistrictToken("서울"), "");
  assert.deepEqual(matchAnnouncementRegion(alertRegionTarget("서울")!, { region: "서울", address: "서울특별시 중구" }), { hit: true, strong: false });

  /* 시·군 단위 값 — 그 이름이 곧 시군구 낱말 */
  assert.equal(alertRegionDistrictToken("과천시"), "과천시");

  /* 고성군 — 강원·경남 어느 쪽이든 주소에 "고성군"이 있을 때만 */
  const goseong = alertRegionTarget("고성군")!;
  assert.equal(matchAnnouncementRegion(goseong, { region: "강원", address: "강원특별자치도 고성군 간성읍" }).hit, true);
  assert.equal(matchAnnouncementRegion(goseong, { region: "경남", address: "경상남도 창원시 성산구" }).hit, false);

  /* 시/도를 못 푼 값은 청약 알림 대상이 아니다 */
  assert.equal(alertRegionTarget("우리동네"), null);
  assert.equal(alertRegionTarget(""), null);
});

test("[1027] 새 매물 알림 — 매물 화면이 적는 '강남구'가 구독 값 '서울 강남구'와 맞는다(예전에는 한 번도 안 맞았다)", () => {
  /* 매물 등록 화면은 구 이름만 적는다(app/listings/new/ListingForm) · 구독은 실거래 표기로 저장된다 */
  assert.deepEqual(listingRegionKeys("강남구"), ["강남구", "서울 강남구", "서울"]);
  assert.ok(listingRegionKeys("강남구").includes(canonicalAlertRegion("서울 강남구")));
  /* 이미 실거래 표기로 적힌 매물 · 옛 표기(구 이름만)로 저장된 구독도 계속 맞는다 */
  assert.deepEqual(listingRegionKeys("서울 강남구"), ["서울 강남구", "강남구", "서울"]);
  assert.deepEqual(listingRegionKeys("안양 만안구"), ["안양 만안구", "만안구", "경기"]);
  assert.ok(listingRegionKeys("성남시 분당구").includes("성남 분당구"));
  /* 그 시/도 전체를 구독한 사람(알림함의 구독 칸은 시/도만 고른다)도 받는다 */
  assert.ok(listingRegionKeys("과천시").includes("경기"));
  /* 두 시/도에 같은 표기 — 시/도를 붙인 구독 둘 다 · 시/도 전체 구독자에게는 보내지 않는다(어느 도인지 모른다) */
  assert.deepEqual(listingRegionKeys("고성군"), ["고성군", "강원 고성군", "경남 고성군"]);
  assert.deepEqual(listingRegionKeys("강원 고성군"), ["강원 고성군", "고성군", "강원"]);
  /* 모르는 이름은 적힌 그대로만 */
  assert.deepEqual(listingRegionKeys("우리동네"), ["우리동네"]);
  assert.deepEqual(listingRegionKeys(""), []);
  const alerts = code("lib/notifications/region-alerts.ts");
  assert.match(alerts, /const keys = listingRegionKeys\(regionName\)\.map\(\(v\) => `\$\{ALERT_PREFIX\}region:\$\{v\}`\);/);
  assert.doesNotMatch(alerts, /function regionCandidates/);
});

test("[1027] 요약의 지역 찾기 — 정확 일치만(비슷한 이름으로 다른 동네 숫자를 싣지 않는다)", () => {
  assert.equal(alertRegionCatalogId("서울 강남구"), "gangnam");
  assert.equal(alertRegionCatalogId("강남구"), "gangnam");
  assert.equal(alertRegionCatalogId("대구 달서구"), "daegu-dalseo");
  assert.equal(alertRegionCatalogId("부산 해운대구"), "busan-haeundae");
  assert.equal(alertRegionCatalogId("남양주시"), "namyangju");
  assert.equal(alertRegionCatalogId("경기 안양시 만안구"), alertRegionCatalogId("안양 만안구"));
  assert.ok(alertRegionCatalogId("안양 만안구"));
  /* 카탈로그에 없는 곳은 null — 예전 함수는 "글자가 들어 있는" 첫 지역을 돌려줬다 */
  assert.equal(alertRegionCatalogId("양주시"), null);
  assert.equal(alertRegionCatalogId("판교"), null);
  assert.equal(alertRegionCatalogId(""), null);
  assert.equal(regionIdForName("양주시"), "namyangju", "예전 함수의 문제(글자 포함) — 남양주가 나온다");
  assert.notEqual(regionIdForName("대구 달서구"), "daegu-dalseo", "예전 함수의 문제 — '서구'가 걸린다");
  assert.match(code("lib/digest/personal.ts"), /const regionId = alertRegionCatalogId\(name\);/);
  assert.doesNotMatch(code("lib/digest/personal.ts"), /regionIdForName/);
  assert.match(code("lib/market/watchlist-brief.ts"), /const regionId = alertRegionCatalogId\(regionName\);/);
  assert.doesNotMatch(code("lib/market/watchlist-brief.ts"), /regionIdForName/);
});

test("[1027] 저장·크론·주간 요약이 같은 함수를 쓴다 — 예전 글자 찾기(normalizeApplyhomeRegion)는 걷었다", () => {
  const subs = code("lib/alerts/subscriptions.ts");
  assert.match(subs, /const value = type === "region" \? canonicalAlertRegion\(normalized\) : normalized;/);
  /* 길이는 표기 맞추기 전에 · 이미 구독한 값은 개수 상한보다 먼저(같은 지역을 다시 눌러도 오류가 아니다) */
  assert.ok(subs.indexOf("normalized.length > ALERT_REGION_MAX_CHARS") < subs.indexOf("canonicalAlertRegion(normalized)"));
  assert.ok(subs.indexOf("if (already) return { ok: true, item: already };") > 0);
  assert.ok(subs.indexOf("if (already) return { ok: true, item: already };") < subs.indexOf("MAX_ALERT_SUBSCRIPTIONS}개까지"));
  const cron = code("app/api/cron/applyhome-alerts/route.ts");
  assert.match(cron, /const target = value \? alertRegionTarget\(value\) : null;/);
  assert.match(cron, /return matchAnnouncementRegion\(sub, a\);/);
  assert.doesNotMatch(cron, /normalizeApplyhomeRegion/);
  assert.doesNotMatch(code("lib/alerts/region-value.ts"), /normalizeApplyhomeRegion/, "글자 포함으로 시/도를 짐작하는 옛 규칙은 어디에도 없다");
  const digest = code("lib/digest/personal.ts");
  assert.match(digest, /\.map\(\(name\) => alertRegionTarget\(name\)\)/);
  assert.match(digest, /const m = matchAnnouncementRegion\(t, a\);/);
  assert.doesNotMatch(digest, /normalizeApplyhomeRegion/);
  /* 순수 모듈 — server-only 사슬 밖(이 테스트가 직접 부른다) */
  assert.doesNotMatch(code("lib/alerts/region-value.ts"), /server-only|supabase|fetch\(/);
  /* 실거래 표기 규칙은 한 곳(molit-core) — molit-transactions 는 다시 내보낸다 */
  assert.equal((code("lib/market/molit-transactions.ts").match(/export function molitRegionLabel/g) ?? []).length, 0);
  assert.match(raw("lib/market/molit-transactions.ts"), /molitRegionLabel,\n  NONAPT_PROPERTY_TYPES,/);
});

test("[1027] 버튼 — 누르면 구독(기존 API) · 문구는 실제로 오는 알림 · 없는 알림 문구는 화면에 없다", () => {
  const btn = code("app/components/RegionAlertButton.tsx");
  assert.match(btn, /fetch\("\/api\/me\/alerts", \{\s*method: "POST"/);
  assert.match(btn, /body: JSON\.stringify\(\{ type: "region", value \}\)/);
  /* 로그인 뒤 돌아올 주소는 401 을 받은 순간의 경로+쿼리(?region= · ?complexId= 를 잃지 않게) */
  assert.match(btn, /if \(res\.status === 401\) \{\s*setLoginHref\(`\/login\?callbackUrl=\$\{encodeURIComponent\(window\.location\.pathname \+ window\.location\.search\)\}`\);\s*setPhase\("need-login"\);/);
  /* 버튼이 상태 글·링크로 바뀌면 초점을 그 자리의 링크로(키보드로 눌렀을 때만) */
  assert.match(btn, /hadFocusRef\.current = e\.detail === 0;/);
  assert.match(btn, /followRef\.current\?\.focus\(\);/);
  assert.match(btn, /`\$\{label\} 청약·매물 알림 받기`/);
  assert.equal((btn.match(/\bbtn-primary\b/g) ?? []).length, 1, "채움 파랑 리터럴 하나(상수)");
  /* 지역을 모르는 화면은 구독 대신 알림함으로 — 글자도 그렇게 */
  assert.match(btn, /알림함에서 지역 고르기/);

  /* 지역 페이지 — "시세 알림 받기" 링크가 구독 버튼으로 */
  const region = code("app/region/[id]/page.tsx");
  assert.match(region, /<RegionAlertButton region=\{mapRegion\} name=\{name\} \/>/);
  assert.doesNotMatch(region, /시세 알림 받기/);

  /* 없는 알림 문구 — 화면 코드 어디에도 */
  for (const p of [
    "app/analysis/timing/region-verdict.tsx",
    "app/analysis/ai/[tool]/ResultRail.tsx",
    "app/region/[id]/page.tsx",
    "app/notes/[id]/page.tsx",
  ]) {
    assert.doesNotMatch(code(p), /실거래 등록·지수 변동|시세 알림 받기/, p);
  }
  assert.match(code("app/notes/[id]/page.tsx"), /로그인하고 실거래 알림 받기/);
});
