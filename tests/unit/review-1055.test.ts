/* [1055] 추가 검토(소유자 "추가로 더 검토해줘") — 진단해 고친 것들을 잠근다.
 *
 * 잠그는 사실:
 *  P1 PostgREST 상한(1,000행) — 쪽을 나눠 끝까지 읽는 readPaged · 상한에 닿아야만 truncated. 전월세(지역·단지·비아파트) ·
 *     월간 리포트 중앙값 표본 · 계절 리포트 · 공개 API 월 목록 · 면적대가 모두 이 함수를 쓴다(limit 한 번 금지).
 *  P2 달 산술 한 곳(lib/format/ym) — 한국 달 · 31일 넘침 없음. 12개월 창·입주 "향후"·매물 비교·관심단지 브리핑·OG 추이·
 *     리포트 목록·AI 문맥·에이전트 도구가 이 함수를 쓴다.
 *  P3 한국 시간 경계 — 다이제스트 주차 · 적재일 · AI 한도 월 · 포인트 일/월 상한 · 미션 주 · 기상청 발표 시각 · 공매 "오늘" ·
 *     PDF/인쇄/초안 날짜 · 준공 연차 · 공표 지연.
 *  P4 분석 비교 — 12개월 건수는 exact 로 세고 창은 이번 달 포함 12·6개월.
 *  S1 가입 API 는 새 계정이 만들어진 뒤에만 동의를 기록한다 · 매물 등록 API 는 공인중개사만 · 속도 제한은 검증 뒤 ·
 *     커뮤니티 글 서버 상한 · 지오코딩 중계에 속도 제한.
 *  F1 폼 — 동네 글은 사진 올리는 중 등록 금지 · 상담 답변 busy 해제 · 동의/표시 설정 실패 문구 · 지오코딩 실패≠없음 ·
 *     노트 쓰기 로그인 링크에 쿼리 · 재설정 429 는 "다시 확인" · 녹음 단추 글자 = MAX_SEC · 오류 문구 꼴.
 *  H1 Permissions-Policy microphone=(self) — 음성 메모가 운영에서 늘 거부되던 원인.
 *  U1 지도 검색 — 고른 뒤 목록이 다시 열리지 않음 · 지도 두 dialog 는 Esc·초점 · 닫기 40px · 검색 "더 보기" 늦은 응답 차단 ·
 *     필터 바꾸면 가리키던 자리 해제.
 *  A1 접근성 — 칩 묶음 aria-pressed · 단지 탭 id/aria-controls/←→ · 시트 셋 스크롤 잠금+초점 · 토스트 라이브 영역 하나 ·
 *     RegionPicker activedescendant · 출석 결과 role=status · 안 읽음 점 role=img · 검색 입력은 콤보박스 표식 대신 aria-current.
 *  M1 단지 제목 60자 안 · /my noindex. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentYm, ymMonthsBefore, ymDotLabel } from "@/lib/format/ym";
import { readPaged, POSTGREST_MAX_ROWS } from "@/lib/supabase/read-paged";
import { kstDayStart, kstMonthStart } from "@/lib/subscriptions/usage-period";
import { weekLabelOf } from "@/lib/newui/week-label";
import { monthsBehind } from "@/lib/newui/as-of-label";
import { isoWeekKey } from "@/lib/missions/missions";
import { isPastBidEnd } from "@/lib/onbid/store";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
const kst = (iso: string) => Date.parse(`${iso}+09:00`);

/* ---------- P2 달 산술 ---------- */
test("P2 currentYm/ymMonthsBefore — 한국 달 · 31일·1일 새벽 넘침 없음", () => {
  assert.equal(currentYm(new Date(kst("2026-11-01T00:30:00"))), "202611"); // UTC 로는 10/31 15:30
  assert.equal(currentYm(new Date(kst("2026-10-31T23:59:00"))), "202610");
  assert.equal(ymMonthsBefore("202610", 11), "202511");
  assert.equal(ymMonthsBefore("202601", 1), "202512");
  assert.equal(ymMonthsBefore("202603", 0), "202603");
  assert.equal(ymMonthsBefore("202603", 24), "202403");
  assert.equal(ymDotLabel("202610"), "2026.10");
  /* 한 곳으로 모였다 — 각자 적던 setMonth 셈이 남아 있지 않다 */
  for (const f of [
    "lib/market/rent.ts",
    "lib/market/area-bands-lite.ts",
    "lib/market/complex-transactions.ts",
    "lib/listings/price-compare.ts",
    "lib/market/watchlist-brief.ts",
    "lib/digest/personal.ts",
    "app/api/og/complex-trend/route.tsx",
    "app/api/analysis/complex-compare/route.ts",
    "lib/agent/tools.ts",
    "lib/ai/live-context.ts",
    "lib/region/monthly-report.ts",
    "lib/region/changed-region-paths.ts",
  ]) {
    const src = code(f);
    assert.doesNotMatch(src, /setMonth\(|setUTCMonth\(/, f);
    assert.match(src, /lib\/format\/ym/, f);
  }
  for (const f of ["app/complex/[id]/UpcomingSupply.tsx", "app/api/map/supply-markers/route.ts", "lib/inspection/quota.ts"]) {
    assert.match(read(f), /from "@\/lib\/format\/ym"/, f);
    assert.doesNotMatch(code(f), /new Date\(\)\.getMonth\(\)|d\.getMonth\(\) \+ 1/, f);
  }
  assert.match(read("lib/complex/complex-facts.ts"), /export \{ currentYm, ymMonthsBefore \}/);
});

/* ---------- P1 쪽 나눠 읽기 ---------- */
test("P1 readPaged — 1,000행씩 끝까지 · 상한에 닿아야 truncated · 오류는 던짐", async () => {
  const total = 2345;
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return Promise.resolve({ data: rows, error: null });
  };
  const r = await readPaged(page, 10_000);
  assert.equal(r.rows.length, total);
  assert.equal(r.truncated, false);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(POSTGREST_MAX_ROWS, 1000);

  const r2 = await readPaged(page, 2000);
  assert.equal(r2.rows.length, 2000);
  assert.equal(r2.truncated, true);

  const r3 = await readPaged(page, 3500, 5000); // 쪽 크기는 1,000 을 넘지 못한다
  assert.equal(r3.rows.length, total);
  assert.equal(r3.truncated, false);

  await assert.rejects(readPaged(() => Promise.resolve({ data: null, error: { message: "boom" } }), 1000), /boom/);
});

test("P1 limit 한 번이던 자리가 전부 readPaged — 전월세(지역·단지·비아파트) · 리포트 중앙값 · 계절 · 공개 API · 면적대", () => {
  for (const [f, cap] of [
    ["lib/market/rent.ts", "SAMPLE_CAP"],
    ["lib/market/complex-rent.ts", "ROW_CAP"],
    ["lib/market/rent-nonapt.ts", "NONAPT_SAMPLE_CAP"],
    ["lib/region/monthly-report.ts", "SAMPLE_CAP"],
    ["lib/reports/seasonal.ts", "20_000"],
    ["lib/api/public-aggregates.ts", "20_000"],
    ["lib/market/area-bands-lite.ts", "CAP"],
  ] as const) {
    const src = code(f);
    assert.match(src, /readPaged/, f);
    assert.match(src, /\.range\(/, f);
    assert.match(src, new RegExp(`${cap.replace(/[_]/g, "_")}`), f);
    assert.doesNotMatch(src, /\.limit\((SAMPLE_CAP|ROW_CAP|NONAPT_SAMPLE_CAP|CAP|20_000|3000|4000)\)/, f);
  }
  assert.match(read("lib/market/complex-rent.ts"), /const ROW_CAP = 4000/);
  /* truncated 는 쪽 읽기 결과에서 — rows.length >= CAP 셈은 사라졌다 */
  assert.doesNotMatch(code("lib/market/rent.ts"), /rows\.length >= SAMPLE_CAP/);
  assert.doesNotMatch(code("lib/region/monthly-report.ts"), /rows\.length >= SAMPLE_CAP/);
  /* 중앙값 표본은 (금액 desc, id) 로 유일 정렬 */
  assert.match(read("lib/region/monthly-report.ts"), /\.order\("deal_amount_krw", \{ ascending: false \}\)\s*\.order\("id"/);
});

/* ---------- P4 분석 비교 ---------- */
test("P4 complex-compare — 12개월 건수 exact · 창은 이번 달 포함", () => {
  const src = read("app/api/analysis/complex-compare/route.ts");
  assert.match(src, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(src, /windowFromYm\(12\)/);
  assert.match(src, /windowFromYm\(6\)/);
  assert.match(src, /ymMonthsBefore\(currentYm\(\), months - 1\)/);
  assert.doesNotMatch(code(src === "" ? "" : "app/api/analysis/complex-compare/route.ts"), /\.limit\(300\)/);
  assert.match(read("lib/agent/tools.ts"), /count_12m_capped/);
});

/* ---------- P3 한국 시간 경계 ---------- */
test("P3 KST 경계 — 주차 · 일/월 시작 · 미션 주 · 공표 지연 · 공매 오늘", () => {
  assert.equal(weekLabelOf(new Date(kst("2026-10-01T00:30:00"))), "10월 1주차"); // UTC 로는 9/30
  assert.equal(weekLabelOf(new Date(kst("2026-10-08T01:00:00"))), "10월 2주차");
  assert.equal(kstMonthStart(kst("2026-10-01T00:30:00")).toISOString(), "2026-09-30T15:00:00.000Z");
  assert.equal(kstDayStart(kst("2026-10-12T08:59:00")).toISOString(), "2026-10-11T15:00:00.000Z");
  assert.equal(isoWeekKey(new Date(kst("2026-10-12T00:30:00"))), "2026-w42"); // 월요일 새벽 = 이번 주
  assert.equal(isoWeekKey(new Date(kst("2026-10-11T23:30:00"))), "2026-w41");
  assert.equal(monthsBehind("202607", new Date(kst("2026-10-01T00:30:00"))), 3); // UTC 달(9월)이면 2
  assert.equal(isPastBidEnd("20261011", new Date(kst("2026-10-12T00:30:00"))), true); // UTC 날짜(10/11)면 false
  assert.equal(isPastBidEnd("20261012", new Date(kst("2026-10-12T23:30:00"))), false);
  for (const f of [
    "lib/newui/freshness.ts",
    "lib/inspection/report-pdf.ts",
    "app/notes/[id]/print/page.tsx",
    "lib/ai/note-draft-core.ts",
  ]) {
    assert.match(read(f), /formatKstDate\(/, f);
  }
  assert.match(read("lib/national-data/kma-api.ts"), /kstParts\(Date\.now\(\)\)/);
  assert.doesNotMatch(code("lib/national-data/kma-api.ts"), /now\.getHours\(\)/);
  assert.match(read("lib/agent/quota.ts"), /kstMonthStart\(\)\.toISOString\(\)/);
  assert.match(read("lib/points/ledger.ts"), /kstDayStart\(now\)/);
  assert.match(read("app/complex/[id]/page.tsx"), /function kstYear\(\)/);
  assert.doesNotMatch(code("app/complex/[id]/page.tsx"), /new Date\(\)\.getFullYear\(\)/);
  assert.match(read("lib/landing/data.ts"), /timeZone: "Asia\/Seoul"/);
});

/* ---------- S1 API ---------- */
test("S1 API — 가입 동의는 새 계정 뒤 · 매물 등록 중개사만 · 속도 제한은 검증 뒤 · 글 상한 · 지오코딩 속도 제한", () => {
  const reg = code("app/api/auth/register/route.ts");
  assert.match(reg, /onNewAccount\?: \(\) => Promise<void>/);
  assert.match(reg, /if \(onNewAccount\) await onNewAccount\(\)/);
  assert.equal((reg.match(/\(\) => recordConsent\(sb, email, consent, ip, ua\)/g) ?? []).length, 2);
  assert.doesNotMatch(reg, /if \(!resendOnly\) await recordConsent/);
  const listings = code("app/api/listings/route.ts");
  assert.match(listings, /getExpertStatus\(session\.user\.email\)/);
  assert.match(listings, /status: 403/);
  assert.ok(listings.indexOf("agreeResponsibility") < listings.indexOf("rateLimit(`listing-create:"), "검증 뒤에 속도 제한");
  const posts = code("app/api/community/posts/route.ts");
  assert.match(posts, /title\.length > 80/);
  assert.match(posts, /content\.length > 20_000/);
  assert.match(read("app/api/map/geocode/route.ts"), /applyRateLimit\(req, READ_RATE_LIMIT\)/);
  for (const f of ["app/api/inspection/notes/route.ts", "app/api/me/consents/route.ts", "app/api/experts/[id]/consult/route.ts"]) {
    assert.doesNotMatch(code(f), /error: e instanceof Error \? e\.message|error: cErr\.message/, f);
  }
  assert.match(read("app/api/inspection/notes/[id]/route.ts"), /노트 없음 · 삭제됐을 수 있음/);
});

/* ---------- F1 폼 ---------- */
test("F1 폼 — 올리는 중 등록 금지 · busy 해제 · 실패 문구 · 지오코딩 · 로그인 링크 쿼리 · 429 · 녹음 글자", () => {
  const town = read("app/town/write/page.tsx");
  assert.match(town, /if \(uploading > 0\) \{/);
  assert.match(town, /disabled=\{submitting \|\| uploading > 0\}/);
  assert.match(read("app/my/consultations/ConsultReply.tsx"), /\} finally \{\s*\/\*[^*]*\*\/\s*setBusy\(false\);/);
  const settings = read("app/my/settings/SettingsClient.tsx");
  assert.match(settings, /setSaveError\("동의 저장 실패 · 잠시 후 다시"\)/);
  assert.match(read("app/my/settings/RecordPrefsTab.tsx"), /class ServerMessage extends Error/);
  const lf = read("app/listings/new/ListingForm.tsx");
  assert.match(lf, /주소 검색 실패 · 잠시 후 다시/);
  assert.match(lf, /if \(!res\.ok\) \{\s*setGeoMsg\("주소 검색 실패/);
  assert.match(read("app/notes/new/NoteForm.tsx"), /loginBasePath \+ window\.location\.search/);
  assert.match(read("app/reset-password/page.tsx"), /if \(!r\.ok && r\.status !== 400\) throw/);
  assert.match(read("app/notes/new/VoiceMemoRecorder.tsx"), /\{MAX_SEC\}초 녹음/);
  assert.match(read("app/town/news/[id]/CommentThread.tsx"), /댓글 없음/);
  for (const f of [
    "app/support/SupportContactForm.tsx",
    "app/my/consultations/CloseConsult.tsx",
    "app/my/consultations/ReviewForm.tsx",
    "app/my/consultations/ProposeQuote.tsx",
    "app/notes/[id]/NoteComments.tsx",
    "app/town/news/[id]/CommentThread.tsx",
    "app/my/ProfileEditSheet.tsx",
    "app/my/settings/SettingsClient.tsx",
    "app/town/write/page.tsx",
    "app/listings/new/ListingForm.tsx",
    "app/notes/new/AiDraftPanel.tsx",
    "app/login/LoginClient.tsx",
  ]) {
    assert.doesNotMatch(code(f), /네트워크 오류가 발생했어요|잠시 후 다시 시도해 주세요/, f);
  }
});

/* ---------- H1 헤더 ---------- */
test("H1 Permissions-Policy — microphone=(self)", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg, /camera=\(\), microphone=\(self\), geolocation=\(self\)/);
  assert.doesNotMatch(cfg.replace(/\/\*[\s\S]*?\*\//g, ""), /microphone=\(\)/);
});

/* ---------- U1 지도·검색 ---------- */
test("U1 지도 검색 — 고른 뒤 재열림 없음 · dialog Esc/초점 · 닫기 40px · 더 보기 늦은 응답 · 필터 바꾸면 자리 해제", () => {
  const box = read("app/map/MapSearchBox.tsx");
  assert.match(box, /const suppressOpenRef = useRef<string \| null>\(null\)/);
  assert.match(box, /if \(picked === null \|\| picked\.trim\(\) !== q\) setOpen\(true\)/);
  assert.equal((box.match(/suppressOpenRef\.current = (c\.name|a\.address|p\.name|a\.q);/g) ?? []).length, 4);
  const mc = read("app/map/map-client.tsx");
  assert.match(mc, /if \(e\.key === "Escape"\) setSelectedId\(null\)/);
  assert.match(mc, /detailPanelRef\.current\?\.focus\(\)/);
  assert.match(mc, /aria-label="패널 닫기"\s+className="-mr-\[10px\] -mt-\[6px\] inline-flex h-10 w-10/);
  const panel = read("app/map/ComplexInfoPanel.tsx");
  assert.match(panel, /if \(e\.key === "Escape"\) onClose\(\)/);
  assert.match(panel, /sheetRef\.current\?\.focus\(\)/);
  const sc = read("app/search/search-client.tsx");
  assert.match(sc, /if \(asked !== settledQueryRef\.current\) return;/);
  assert.match(sc, /useEffect\(\(\) => setActiveIdx\(-1\), \[results, filter\]\)/);
});

/* ---------- A1 접근성 ---------- */
test("A1 접근성 — aria-pressed · 단지 탭 · 시트 잠금/초점 · 토스트 · RegionPicker · 출석 · 안 읽음 · 검색 입력", () => {
  for (const [f, n] of [
    ["app/notifications/page.tsx", 1],
    ["app/map/map-client.tsx", 3],
    ["app/notes/notes-feed-client.tsx", 1],
    ["app/my/creator/creator-client.tsx", 1],
    ["app/notes/templates/TemplateBrowser.tsx", 1],
    ["app/town/write/page.tsx", 1],
  ] as const) {
    assert.ok((read(f).match(/aria-pressed=\{/g) ?? []).length >= n, f);
  }
  const hub = read("app/complex/[id]/hub-client.tsx");
  assert.match(hub, /id=\{`hub-tab-\$\{i\}`\}/);
  assert.match(hub, /aria-controls="hub-tabpanel"/);
  assert.equal((hub.match(/id="hub-tabpanel" aria-labelledby=/g) ?? []).length, 5);
  assert.match(hub, /e\.key !== "ArrowRight" && e\.key !== "ArrowLeft"/);
  for (const f of ["app/components/soft-signup/SoftSignupProvider.tsx", "app/components/UpgradePaywall.tsx", "app/components/CoachmarkTour.tsx"]) {
    const src = read(f);
    assert.match(src, /useScrollLockLazy\(/, f);
    assert.match(src, /restoreTo\?\.focus\?\.\(\)/, f);
  }
  const toast = code("app/components/toast/ToastProvider.tsx");
  assert.equal((toast.match(/role="status"/g) ?? []).length, 0);
  assert.match(toast, /aria-live="polite"/);
  const rp = read("app/components/RegionPicker.tsx");
  assert.match(rp, /aria-activedescendant=\{open && cursor >= 0/);
  assert.match(rp, /id=\{`\$\{inputId\}-opt-\$\{i\}`\}/);
  assert.match(rp, /aria-selected=\{i === cursor\}/);
  assert.match(rp, /aria-checked=\{active\}/);
  assert.match(read("app/my/points/AttendanceButton.tsx"), /role="status"\s+className=\{`text-center/);
  assert.equal((read("app/notifications/page.tsx").match(/role="img"/g) ?? []).length, 2);
  const sc = read("app/search/search-client.tsx");
  assert.doesNotMatch(sc, /role="combobox"|aria-activedescendant/);
  assert.match(sc, /aria-describedby="search-kbd-hint"/);
  assert.equal((sc.match(/aria-current=\{active \? "true" : undefined\}/g) ?? []).length, 4);
  assert.match(read("app/map/HistogramRangeSlider.tsx"), /after:-inset-\[6px\]/);
});

/* ---------- M1 메타 ---------- */
test("M1 단지 제목 60자 안 · /my noindex", () => {
  const hub = read("app/complex/[id]/page.tsx");
  assert.match(hub, /`\$\{name\} 실거래가 \$\{price\} · \$\{emdPrefix\}실거래·거래 이력 \| 내집나우`/);
  assert.doesNotMatch(code(hub === "" ? "" : "app/complex/[id]/page.tsx"), /titleParen/);
  const sample = `${"헬리오시티"} 실거래가 ${"29억 6,750만원"} · ${"가락동 "}실거래·거래 이력 | 내집나우`;
  assert.ok(sample.length <= 60, `${sample.length}자`);
  assert.match(read("app/my/page.tsx"), /robots: \{ index: false, follow: false \}/);
});
