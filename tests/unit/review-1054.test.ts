/* [1054] 홈페이지 전체 검토 — 진단해 고친 것들을 잠근다.
 *
 * 잠그는 사실:
 *  D1 날짜 — 완결 월(lastCompletedYm)·월별 집계(summarizeMonthly)는 한국 날짜 기준이고 31일·매월 1일 새벽에 어긋나지 않는다.
 *     청약 달력 요일·주차 표기는 UTC 넘침 없이 ISO 날짜 그대로. 다이제스트·재개발·실거래 갱신일은 KST 포맷.
 *  D2 동네 대비 — 단지 화면의 "동네 대비"는 같은 도시의 구를 찾는다(부산 중구가 서울 중구로 가지 않는다).
 *  D3 단지 실거래 — 집계는 120건, 표는 30건 · 12개월 건수가 120 에 닿으면 "이상".
 *  D4 표 — 옆으로 미는 표는 HScroll(끝 흐림 + "옆으로 밀어 전체 열 보기") · 실거래 구간표는 폰 폭에 맞춤(고정 폭 없음) ·
 *     입주 물량 목록은 폰에서 네 열이 틀 안 · 지역 허브 단지 목록 보조 줄은 조각 사이에서만 줄바꿈.
 *  D5 탭 — 헤더 벨·메뉴 40×40 실상자 · 오늘의 한 줄 점 40px 높이 · 지도 내 위치 44px(px) · ⓘ 폰 40px ·
 *     단독 텍스트 링크는 tap-line.
 *  D6 길 — "구독 관리" → /my/subscription · 홈 "내 지역으로 바꾸기" 앵커 존재 · 서울 밖 "다른 단지" → 지역 허브 ·
 *     로그인 뒤 돌아오는 주소(노트 삭제·공개 전환·댓글·소프트 벽·크리에이터) · 소프트 가입은 쿼리까지.
 *  D7 상태 — 쿠키 배너는 서버 HTML 에 있고 결정한 브라우저는 그리기 전에 숨김 · 동의는 저장소가 막혀도 메모리에 남음 ·
 *     노트 목록은 실패와 "없음"을 같이 적지 않음 · ?mine=1 이 0건이어도 칩으로 끌 수 있음 · 재설정 링크 확인 실패는 "다시 확인" ·
 *     홈 검색 네트워크 실패는 실패 줄 · 카운트업은 값이 바뀌면 새 값.
 *  D8 문구 — 실거래만 있는 화면의 제목·JSON-LD·설명에 "시세" 없음 · 오류 "○○ 불러오기 실패 · 잠시 후 다시" · 빈 상태 "○○ 없음" ·
 *     "~해 보세요" 없음 · 자료 조사 노트의 그림은 "자료" · 최근 실거래 머리는 해제 행과 어긋나지 않음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lastCompletedYm } from "@/lib/region/monthly-report";
import { summarizeMonthly, type ComplexTransactionRecord } from "@/lib/market/complex-transactions";
import { findCatalogRegionStrict } from "@/lib/region/catalog";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 지운 소스 — 고친 이유를 적은 주석에 옛 문구가 남아 있어도 코드만 본다 */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
const kst = (iso: string) => Date.parse(`${iso}+09:00`);

/* ---------- D1 날짜 ---------- */
test("D1 lastCompletedYm — 31일·매월 1일 새벽(KST)에도 지난달", () => {
  assert.equal(lastCompletedYm(kst("2026-10-31T23:30:00")), "202609");
  assert.equal(lastCompletedYm(kst("2026-10-01T00:30:00")), "202609"); // UTC 로는 9/30 15:30 — 예전엔 "202608"
  assert.equal(lastCompletedYm(kst("2026-03-31T12:00:00")), "202602");
  assert.equal(lastCompletedYm(kst("2026-01-15T12:00:00")), "202512");
});

test("D1 summarizeMonthly — 12칸이 이번 달(KST)로 끝나고 31일에 밀리지 않는다", () => {
  const row = (ym: string, krw: number): ComplexTransactionRecord => ({
    complexName: "A",
    regionName: "서울 강남구",
    address: null,
    contractYm: ym,
    contractDay: 1,
    dealAmountKrw: krw,
    areaM2: null,
    floor: null,
    buildYear: null,
    pricePerPyeongKrw: null,
  });
  const pts = summarizeMonthly([row("202610", 10), row("202610", 30), row("202511", 5)], kst("2026-10-31T23:00:00"));
  assert.equal(pts.length, 12);
  assert.equal(pts[0].ym, "202511");
  assert.equal(pts[11].ym, "202610");
  assert.equal(pts[11].count, 2);
  assert.equal(pts[11].avgAmountKrw, 20);
  assert.equal(pts[0].count, 1);
  /* 매월 1일 00:30 KST(UTC 전날) — 이번 달은 1일의 달 */
  assert.equal(summarizeMonthly([], kst("2026-11-01T00:30:00"))[11].ym, "202611");
});

test("D1 청약 달력 — 요일은 ISO 날짜에서 UTC 로 계산(시간대 넘침 없음) · 주차 표기 · KST 오늘", () => {
  const cal = read("app/apply/calendar/page.tsx");
  assert.match(cal, /iso\.split\("-"\)\.map\(Number\)/);
  assert.match(cal, /Date\.UTC\(y, m - 1, d\)\)\.getUTCDay\(\)/);
  const week = read("app/apply/calendar/[week]/page.tsx");
  assert.match(week, /주차 \(/);
  assert.match(week, /9 \* 3_?600_?000|9 \* 60 \* 60 \* 1000/);
  assert.match(read("app/digest/page.tsx"), /formatKstShortDate\(/);
  assert.match(read("app/redevelopment/page.tsx"), /formatKstDate\(/);
  assert.match(read("app/tx/[region]/page.tsx"), /formatKstDate\(region\.lastDataAt\)/);
});

/* ---------- D2 동네 대비 ---------- */
test("D2 getRegionRelative — 도시 포함 이름으로 카탈로그를 찾는다(부산 중구 ≠ 서울 중구)", () => {
  const src = read("lib/complex/complex-store.ts");
  assert.match(src, /findCatalogRegionStrict\(dec\.region\)/);
  assert.match(src, /city === "서울" \? findCatalogRegionStrict\(district\)/);
  assert.match(src, /\.eq\("region_name", catalogRegion\.name\)/);
  /* 카탈로그 자체 — "부산 중구"와 "중구"(서울)는 다른 지역 */
  const busan = findCatalogRegionStrict("부산 중구");
  const seoul = findCatalogRegionStrict("중구");
  assert.ok(busan && seoul);
  assert.notEqual(busan!.id, seoul!.id);
});

/* ---------- D3 단지 실거래 ---------- */
test("D3 /complex/tx — 집계 120건 · 표 30건 · 12개월 건수 상한 표시", () => {
  const src = read("app/complex/tx/[slug]/page.tsx");
  assert.match(src, /listComplexTransactions\(parsed\.complexName, region, 120\)/);
  assert.match(src, /transactions\.slice\(0, 30\)/);
  assert.match(src, /count12mCapped/);
  assert.match(src, /labelIdx\.has\(i\)/); // 폰에서 평균가 글자 셋만
  const hub = read("app/complex/[id]/page.tsx");
  assert.match(hub, /dealsCapped/);
});

/* ---------- D4 표 ---------- */
test("D4 HScroll — 넘칠 때만 끝 흐림·안내, 끝에 닿으면 '표 끝' · 그라데이션 유틸 없음", () => {
  const src = read("app/components/HScroll.tsx");
  assert.match(src, /ResizeObserver/);
  assert.match(src, /nz-hscroll-fade/);
  assert.match(src, /표 끝/);
  assert.match(src, /옆으로 밀어 전체 열 보기/);
  assert.doesNotMatch(src, /bg-gradient-to-|linear-gradient\(/);
  const css = read("app/globals.css");
  const fade = css.slice(css.indexOf(".nz-hscroll-fade {"));
  assert.match(fade, /mask-image: url\("data:image\/png;base64,/);
  assert.match(fade, /mask-size: calc\(100% - 28px\) 100%, 28px 100%/);
  assert.doesNotMatch(fade, /gradient/i);
  for (const f of [
    "app/tx/[region]/page.tsx",
    "app/tx/[region]/[kind]/[band]/page.tsx",
    "app/complex/tx/[slug]/page.tsx",
    "app/complex/compare/[slug]/page.tsx",
    "app/rent/[region]/page.tsx",
    "app/digest/[week]/page.tsx",
    "app/supply/SupplyClient.tsx",
    "app/auctions/AuctionsClient.tsx",
    "app/apply/ApplySearchClient.tsx",
    "app/region/[id]/page.tsx",
    "app/region/[id]/report/[ym]/page.tsx",
    "app/components/ComplexSummaryTable.tsx",
    "app/notes/best/[ym]/page.tsx",
    "app/calculator/BrokerageFeeCalc.tsx",
  ]) {
    assert.match(read(f), /<HScroll/, f);
  }
});

test("D4 실거래 구간표 — 고정 폭 없음 · 칸 nowrap · 구간 링크 40px", () => {
  const src = code("app/tx/[region]/page.tsx");
  assert.doesNotMatch(src, /min-w-\[460px\]/);
  assert.match(src, /<table className="w-full whitespace-nowrap text-left t-body">/);
  assert.match(src, /min-h-\[40px\] items-center font-bold text-primary underline md:min-h-6/);
});

test("D4 입주 물량 목록 — 폰은 네 열이 틀 안(이름 열만 가변 · 값 열 고정 폭) · md 부터 520px", () => {
  const src = read("app/supply/SupplyClient.tsx");
  assert.match(src, /md:min-w-\[520px\]/);
  assert.doesNotMatch(src, /<div className="min-w-\[520px\]">/);
  assert.match(src, /grid-cols-\[minmax\(0,1fr\)_54px_40px_48px\]/);
  assert.match(src, /thisQuarterIsNow \? "이번 분기 입주" : "다음 입주 분기"/);
});

test("D4 지역 허브 단지 목록 — 구분점은 nowrap 밖", () => {
  const src = read("app/region/[id]/RegionComplexList.tsx");
  assert.match(src, /\{i > 0 \? " · " : ""\}\s*<span className="whitespace-nowrap">\{m\}<\/span>/);
});

/* ---------- D5 탭 ---------- */
test("D5 탭 크기 — 헤더 벨·메뉴 h-10/w-10 · 점 40px · 내 위치 44px · ⓘ 폰 40px · tap-line", () => {
  assert.match(read("app/components/NotificationBell.tsx"), /-my-\[2px\] flex h-10 w-10/);
  const menu = read("app/components/MobileMenu.tsx");
  assert.match(menu, /-my-\[2px\] flex h-10 w-10 items-center justify-center rounded-xl text-text-1/);
  assert.match(menu, /flex h-10 w-10 items-center justify-center rounded-xl text-text-2/);
  assert.doesNotMatch(menu, /after:-inset-1\.5/);
  assert.match(read("app/components/Header.tsx"), /-mr-\[8px\] flex shrink-0 items-center gap-0/);
  const today = read("app/components/home/HomeTodayLine.tsx");
  assert.match(today, /min-h-\[40px\] min-w-\[28px\]/);
  assert.match(today, /-mb-\[10px\] -mt-\[6px\]/);
  assert.match(read("components/map/NaverMap.tsx"), /h-\[44px\] w-\[44px\]/);
  assert.match(read("app/globals.css"), /@media \(pointer: coarse\) \{\s*\.explain-btn \{\s*min-width: 40px;\s*min-height: 40px;/);
  for (const f of [
    "app/page.tsx",
    "app/components/home/HomeTownBlock.tsx",
    "app/components/home/HomeMyRail.tsx",
    "app/components/AreaError.tsx",
    "app/error.tsx",
    "app/components/BetaNoticeModal.tsx",
  ]) {
    assert.match(read(f), /tap-line/, f);
  }
  assert.match(read("app/components/BetaNoticeModal.tsx"), /min-h-\[40px\] min-w-\[40px\]/);
  /* 운영 전수 점검(폰)에서 남은 20px 소식 링크·밀집 글 링크·✕ */
  assert.match(read("app/components/talk/TalkPanel.tsx"), /tap-line mt-0\.5 block t-sub no-underline/);
  assert.match(read("app/login/LoginClient.tsx"), /inline-flex h-10 w-10 items-center justify-center text-\[15px\] text-text-3" aria-label="닫기"/);
  for (const f of ["app/login/LoginClient.tsx", "app/signup/SignupClient.tsx", "app/search/search-client.tsx", "app/analysis/page.tsx", "app/complex/browse/page.tsx"]) {
    assert.match(read(f), /tap-line/, f);
  }
  assert.match(read("app/error.tsx"), /<main id="main-content"/);
});

/* ---------- D6 길 ---------- */
test("D6 링크 목적지 — 구독 관리 · 내 지역 앵커 · 서울 밖 다른 단지 · 로그인 뒤 돌아오기", () => {
  assert.match(read("app/components/HeaderAuth.tsx"), /\{ label: "구독 관리", href: "\/my\/subscription" \}/);
  assert.match(read("app/my/settings/SettingsClient.tsx"), /id="region"/);
  assert.match(read("app/components/home/HomeTodayLine.tsx"), /href="\/my\/settings#region"/);
  const tx = read("app/complex/tx/[slug]/page.tsx");
  assert.match(tx, /region\.city === "서울"\s*\?\s*`\/complex\/browse\?district=/);
  assert.match(tx, /`\/region\/\$\{region\.id\}#complexes`/);
  assert.match(read("app/region/[id]/page.tsx"), /id="complexes"/);
  assert.match(read("app/notes/[id]/note-actions.tsx"), /loginHrefWithNext\(`\/notes\/\$\{encodeURIComponent\(noteId\)\}`\)/);
  assert.doesNotMatch(read("app/notes/[id]/note-actions.tsx"), /router\.push\("\/login"\)/);
  assert.match(read("app/notes/[id]/NoteComments.tsx"), /#comments`\)/);
  assert.match(read("app/town/news/[id]/CommentThread.tsx"), /loginHrefWithNext\(`\/town\/news\//);
  assert.match(read("app/notes/[id]/NoteSoftWall.tsx"), /loginHrefWithNext\(`\/notes\//);
  assert.match(read("app/my/creator/page.tsx"), /\/login\?callbackUrl=%2Fmy%2Fcreator/);
  assert.match(read("app/signup/SignupClient.tsx"), /loginHref\.replace\(\/\^\\\/login\/, "\/forgot-password"\)/);
  const soft = read("app/components/soft-signup/SoftSignupProvider.tsx");
  assert.match(soft, /setSearch\(window\.location\.search\)/);
  assert.match(soft, /`\$\{pathname \?\? "\/"\}\$\{search\}`/);
  assert.match(read("app/components/DesktopSideNav.tsx"), /open \? "pointer-events-none opacity-0"/);
});

/* ---------- D7 상태 ---------- */
test("D7 쿠키 배너 — 서버 HTML 에 있고(data-cc 로 숨김) · 동의 메모리 사본", () => {
  const banner = read("components/consent/cookie-consent-banner.tsx");
  assert.match(banner, /const visible = state\.status !== "decided"/);
  assert.match(banner, /data-consent-banner/);
  const layout = read("app/layout.tsx");
  assert.match(layout, /nz_cookie_consent/);
  assert.match(layout, /data-cc/);
  assert.match(read("app/globals.css"), /html\[data-cc="1"\] \[data-consent-banner\] \{\s*display: none;/);
  const hook = read("components/consent/use-cookie-consent.ts");
  assert.match(hook, /let memoryConsent: CookieConsent \| null = null/);
});

test("D7 목록 상태 — 노트 실패≠없음 · 동네 ?mine=1 · 재설정 링크 확인 실패 · 홈 검색 실패 · 카운트업 새 값 · 롤링 터치", () => {
  const notes = read("app/notes/notes-feed-client.tsx");
  assert.match(notes, /\) : activeLoadError \? \(\s*\/\*[^*]*\*\/\s*null/);
  assert.match(notes, /priority=\{i < 3\}/);
  const feed = read("app/town/feed-client.tsx");
  assert.match(feed, /\(mineCount > 0 \|\| onlyMine\)/);
  assert.match(feed, /if \(onlyMine && myRegions !== null && myRegions\.length === 0\) setOnlyMine\(false\)/);
  const reset = read("app/reset-password/page.tsx");
  assert.match(reset, /"unreachable"/);
  assert.match(reset, /if \(r\.status >= 500\) throw/);
  assert.match(reset, /링크 확인 실패 · 잠시 후 다시/);
  const hero = read("app/components/home/HomeHeroSearch.tsx");
  assert.match(hero, /\.catch\(\(\) => \{[\s\S]*?if \(ac\.signal\.aborted\) return;[\s\S]*?setFailed\(true\)/);
  assert.match(hero, /<span aria-hidden="true">⌕ <\/span>/);
  const pulse = read("app/components/home/RegionPulseCards.tsx");
  assert.match(pulse, /if \(doneRef\.current\) setText\(price\);\s*\}, \[price\]\)/);
  const roll = read("app/components/home/RollingPanel.tsx");
  assert.match(roll, /e\.pointerType === "mouse"/);
  assert.match(roll, /onTouchStart=\{\(\) => setPaused\(true\)\}/);
  assert.doesNotMatch(roll, /onMouseEnter/);
  const groups = read("app/town/groups/GroupsClient.tsx");
  assert.match(groups, /Math\.floor\(\(whenTs \+ KST\) \/ 86_400_000\) - Math\.floor\(\(nowMs \+ KST\) \/ 86_400_000\)/);
});

test("D7 홈 데이터 — 지수 대체값에 주 표기 · 지수 출처 reb · 브리핑 방향은 deltaDir", () => {
  assert.match(read("lib/newui/home-data.ts"), /\.eq\("source", "reb"\)/);
  const brief = read("lib/newui/home-briefing.ts");
  assert.match(brief, /deltaDir\(d\) === "down"/);
  assert.match(brief, /deltaDir\(d\) === "up"/);
  const page = read("app/page.tsx");
  assert.match(page, /baseRateAsOf/);
  assert.match(page, /loanRateAsOf/);
});

/* ---------- D8 문구 ---------- */
test("D8 '시세' — 단지 제목·JSON-LD·단지 실거래 설명·지역 허브 제목·내 기록·뉴스 링크에 없음", () => {
  const hub = read("app/complex/[id]/page.tsx");
  const titleLine = hub.split("\n").filter((l) => l.includes("| 내집나우`"));
  assert.ok(titleLine.length >= 2);
  for (const l of titleLine) assert.doesNotMatch(l, /시세/, l);
  assert.match(hub, /name: `\$\{v\.name\} 실거래가·임장노트`/);
  assert.doesNotMatch(read("app/complex/tx/[slug]/page.tsx").split("const description")[1].split(";")[0], /시세/);
  assert.match(read("app/region/[id]/RegionHero.tsx"), /아파트 실거래·가격지수 한눈에/);
  assert.doesNotMatch(read("app/complex/[id]/MyRecordsTab.tsx"), /시세/);
  assert.match(read("app/town/news/[id]/page.tsx"), /실거래 보기 ›/);
});

test("D8 오류·빈 상태·권유 문구", () => {
  const town = read("app/components/home/HomeTownBlock.tsx");
  assert.match(town, /이웃 글 불러오기 실패 · 잠시 후 다시/);
  assert.match(town, /뉴스 불러오기 실패 · 잠시 후 다시/);
  assert.match(read("app/analysis/price/page.tsx"), /실거래 집계 불러오기 실패 · 잠시 후 다시/);
  assert.match(read("app/analysis/error.tsx"), /분석 화면 불러오기 실패 · 잠시 후 다시/);
  assert.match(read("app/digest/[week]/page.tsx"), /이 주 시장 온도 스냅샷 없음/);
  assert.match(read("app/tx/[region]/[kind]/[band]/page.tsx"), /이 구간 단지별 내역 없음/);
  for (const f of [
    "app/analysis/compare/MyCriteriaRank.tsx",
    "app/analysis/error.tsx",
    "app/notes/[id]/deck/DeckViewer.tsx",
    "app/components/home/HomeToolPick.tsx",
  ]) {
    assert.doesNotMatch(read(f), /해 보세요/, f);
  }
  assert.doesNotMatch(code("app/notes/new/VoiceMemoRecorder.tsx"), /✍/);
  assert.match(read("app/region/[id]/report/[ym]/page.tsx"), /새 실거래 신고분이 들어오면 갱신/);
  assert.doesNotMatch(read("app/region/[id]/report/[ym]/page.tsx"), /하루 1회 갱신 ·/);
});

test("D8 자료 조사 노트 그림 = '자료' · 최근 실거래 머리 · 재개발 평단가 억 단위", () => {
  const notes = read("app/notes/notes-feed-client.tsx");
  assert.match(notes, /\{n\.lab \? "자료" : "사진"\} \{n\.photoCount\}/);
  assert.match(read("app/notes/[id]/page.tsx"), /label=\{v\.lab \? "자료 이미지" : "현장 사진"\}/);
  const deals = read("app/complex/[id]/RecentDealsTable.tsx");
  assert.match(deals, /건\(해제 제외\)/);
  assert.match(deals, /해제 신고는 취소선/);
  assert.doesNotMatch(code("app/redevelopment/[id]/page.tsx"), /만\/평/);
  assert.match(read("app/redevelopment/[id]/page.tsx"), /formatKrwShort\(c\.avgPerPyeongKrw\)\}\/평/);
});
