import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  CONTRACT_CHECKED_MAX,
  countDone,
  currentStageId,
  emptyJourneyState,
  isIsoDay,
  isJourneyEmpty,
  JOURNEY_STAGE_IDS,
  JOURNEY_STATE_MAX_BYTES,
  journeyStateBytes,
  mergeJourneyStates,
  normalizeContractPlan,
  normalizeJourneyState,
  PRICE_MANWON_MAX,
  sameDealPlans,
  sameJourneyContent,
  toggleStageDone,
  withContractPlan,
  type ContractPlan,
  type JourneyState,
} from "../../lib/journey/state.ts";
import { budgetMapHref, JOURNEY_STAGES, journeyHowToSteps } from "../../lib/journey/stages.ts";
import {
  addDays,
  buildContractIcs,
  buildContractTimeline,
  CONTRACT_ITEMS,
  CONTRACT_PHASES,
  contractDateWarnings,
  daysBetween,
  ddayLabel,
  foldIcsLine,
  formatKoreanDay,
  formatManwon,
  hasCalendarEvents,
  formatKoreanDayRest,
  icsEscape,
  kstDayOf,
  kstToday,
  LAW_CHECKED_ON,
  nextDeadline,
  overdueLegalCount,
  phaseDue,
  phaseNominalDue,
  REST_DAY_RULE,
  restDayNote,
  type ContractDates,
} from "../../lib/journey/contract.ts";
import {
  HOLIDAY_YEARS,
  HOLIDAYS_CHECKED_ON,
  holidayName,
  isRestDay,
  knownHolidays,
  nextWorkday,
} from "../../lib/journey/holidays.ts";
import { applyJourneyOps, composeAccountState, type JourneyOp } from "../../lib/journey/sync.ts";
import {
  accountOwnerTag,
  clearAccountCopy,
  JOURNEY_ACCOUNT_KEY,
  JOURNEY_LOCAL_KEY,
  readAccountCopy,
  readLocalJourney,
  writeAccountCopy,
  writeLocalJourney,
} from "../../lib/journey/local.ts";
import { buildExportPayload, type ExportInput } from "../../app/api/me/export/shape.ts";
import { GLOSSARY_TERMS } from "../../lib/seo/glossary-terms.ts";
import { HOME_START_DOORS } from "../../lib/brand/home-copy.ts";
import { NAV } from "../../app/components/nav-data.ts";
import { PUBLIC_CACHE_RULES } from "../../lib/http/cache-policy.ts";

/* [1008 · J] 내 집 마련 여정 — 진행 상태 정규화·병합, 계약·잔금 일정표의 기한 계산·캘린더, 화면 계약(정적·링크·등록).
   법정 기한 숫자(30·60·14일)는 lib/journey/contract.ts 머리 주석의 원문 확인(2026-09-21)과 같아야 한다. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const T0 = "2026-09-21T03:00:00.000Z";
const T1 = "2026-09-22T03:00:00.000Z";

/* ───────────────────────── 상태: 정규화 ───────────────────────── */

test("normalizeJourneyState: 빈·비객체·배열 입력은 빈 상태", () => {
  for (const v of [undefined, null, 42, "x", [], [1, 2]]) {
    assert.deepEqual(normalizeJourneyState(v), emptyJourneyState());
  }
});

test("normalizeJourneyState: 모르는 단계·틀린 시각·모르는 키는 버린다", () => {
  const s = normalizeJourneyState({
    v: 9,
    done: { market: T0, budget: "yesterday", nope: T0, visit: 123, decide: "" },
    contract: null,
    extra: { a: 1 },
    updatedAt: "not-a-date",
  });
  assert.deepEqual(s.done, { market: T0 });
  assert.equal(s.v, 1);
  assert.equal(s.updatedAt, null);
  assert.equal("extra" in s, false);
});

test("isIsoDay: 달력에 있는 날만(윤년·월말·범위)", () => {
  assert.equal(isIsoDay("2024-02-29"), true);
  assert.equal(isIsoDay("2026-02-29"), false);
  assert.equal(isIsoDay("2026-04-31"), false);
  assert.equal(isIsoDay("2026-9-1"), false);
  assert.equal(isIsoDay("1999-12-31"), false);
  assert.equal(isIsoDay("2101-01-01"), false);
  assert.equal(isIsoDay(20260921), false);
});

test("normalizeContractPlan: 날짜·금액·체크를 스키마로, 비면 null", () => {
  assert.equal(normalizeContractPlan({}), null);
  assert.equal(normalizeContractPlan({ contractDate: "2026-02-30", priceManwon: 0, checked: [] }), null);
  const p = normalizeContractPlan({
    contractDate: "2026-09-01",
    midDate: "bad",
    balanceDate: "2026-11-30",
    moveInDate: null,
    priceManwon: 85000,
    checked: ["r-report", "r-report", "BAD ID", "x".repeat(41), 7, "a-tax"],
    updatedAt: T0,
    junk: true,
  });
  assert.ok(p);
  assert.deepEqual(p, {
    contractDate: "2026-09-01",
    midDate: null,
    balanceDate: "2026-11-30",
    moveInDate: null,
    priceManwon: 85000,
    checked: ["r-report", "a-tax"],
    updatedAt: T0,
  });
  /* 금액: 정수·양수·상한 */
  assert.equal(normalizeContractPlan({ priceManwon: 85000.5 }), null);
  assert.equal(normalizeContractPlan({ priceManwon: PRICE_MANWON_MAX + 1 }), null);
  assert.equal(normalizeContractPlan({ priceManwon: PRICE_MANWON_MAX })?.priceManwon, PRICE_MANWON_MAX);
});

test("체크 항목은 중복 없이 상한까지만 — 상태는 4KB 안쪽에 머문다", () => {
  const many = Array.from({ length: 500 }, (_, i) => `item-${i}`);
  const s = normalizeJourneyState({
    done: Object.fromEntries(JOURNEY_STAGE_IDS.map((id) => [id, T0])),
    contract: { contractDate: "2026-09-01", balanceDate: "2026-11-30", checked: many, priceManwon: 1 },
  });
  assert.equal(s.contract?.checked.length, CONTRACT_CHECKED_MAX);
  assert.ok(journeyStateBytes(s) <= JOURNEY_STATE_MAX_BYTES, `bytes ${journeyStateBytes(s)}`);
});

test("toggleStageDone · countDone · currentStageId", () => {
  let s = emptyJourneyState();
  assert.equal(currentStageId(s), "market");
  s = toggleStageDone(s, "market", T0);
  s = toggleStageDone(s, "budget", T0);
  assert.equal(countDone(s), 2);
  assert.equal(currentStageId(s), "shortlist");
  s = toggleStageDone(s, "market", T1); // 다시 누르면 풀린다
  assert.equal(countDone(s), 1);
  assert.equal(currentStageId(s), "market");
  for (const id of JOURNEY_STAGE_IDS) if (!s.done[id]) s = toggleStageDone(s, id, T1);
  assert.equal(countDone(s), 6);
  assert.equal(currentStageId(s), null);
});

test("withContractPlan: 비운 일정표는 null, 채우면 updatedAt 이 찍힌다", () => {
  const s = withContractPlan(emptyJourneyState(), { contractDate: "2026-09-01" }, T0);
  assert.equal(s.contract?.contractDate, "2026-09-01");
  assert.equal(s.contract?.updatedAt, T0);
  assert.equal(isJourneyEmpty(s), false);
  const cleared = withContractPlan(s, null, T1);
  assert.equal(cleared.contract, null);
  assert.equal(isJourneyEmpty(cleared), true);
});

/* ───────────────────────── 상태: 병합(로그인 뒤 한 번) ───────────────────────── */

test("merge: 끝낸 단계는 합집합, 양쪽에 있으면 먼저 체크한 시각", () => {
  const local = normalizeJourneyState({ done: { market: T1, budget: T0 } });
  const server = normalizeJourneyState({ done: { market: T0, visit: T1 } });
  const m = mergeJourneyStates(local, server, T1);
  assert.deepEqual(m.done, { market: T0, budget: T0, visit: T1 });
});

test("merge: 같은 거래면 칸마다 합친다 — 더 최근 쪽 값이 이기고, 빈 칸은 다른 쪽 값으로, 체크는 합집합", () => {
  const base = { contractDate: "2026-09-01", balanceDate: "2026-11-30" };
  const local = normalizeJourneyState({ contract: { ...base, checked: ["a-tax"], updatedAt: T1 } });
  const server = normalizeJourneyState({ contract: { ...base, checked: ["r-report"], priceManwon: 90000, updatedAt: T0 } });
  const m = mergeJourneyStates(local, server, T1);
  assert.equal(m.contract?.priceManwon, 90000, "더 최근(로컬) 쪽이 비운 칸은 계정 값으로 채운다 — 데이터를 버리지 않는다");
  assert.deepEqual([...(m.contract?.checked ?? [])].sort(), ["a-tax", "r-report"]);
  /* 양쪽에 다 있는 값은 더 최근 쪽 */
  const local2 = normalizeJourneyState({ contract: { ...base, priceManwon: 95000, updatedAt: T1 } });
  assert.equal(mergeJourneyStates(local2, server, T1).contract?.priceManwon, 95000);
});

test("merge [리뷰 C race]: 매매가만 적은 더 최근 사본이 계정의 계약일·잔금일·체크를 지우지 않는다", () => {
  const server = normalizeJourneyState({
    done: { market: T0 },
    contract: {
      contractDate: "2026-09-15",
      balanceDate: "2026-11-30",
      checked: ["c-deposit"],
      updatedAt: T0,
    },
    updatedAt: T0,
  });
  /* 불러오는 사이 매매가 칸에 적은 것(예전엔 이것이 비회원 사본에 "매매가만 있는 일정표"로 적혔다) */
  const typed = withContractPlan(emptyJourneyState(), { priceManwon: 90000 }, T1);
  const m = mergeJourneyStates(typed, server, T1);
  assert.equal(m.contract?.contractDate, "2026-09-15");
  assert.equal(m.contract?.balanceDate, "2026-11-30");
  assert.deepEqual(m.contract?.checked, ["c-deposit"]);
  assert.equal(m.contract?.priceManwon, 90000);
  assert.deepEqual(m.done, { market: T0 });
  assert.equal(sameDealPlans(typed.contract as ContractPlan, server.contract as ContractPlan), true);
});

test("merge: 다른 거래의 체크는 섞지 않는다 · 한쪽만 있으면 그것", () => {
  const local = normalizeJourneyState({
    contract: { contractDate: "2026-10-01", balanceDate: "2026-12-01", checked: ["a-tax"], updatedAt: T1 },
  });
  const server = normalizeJourneyState({
    contract: { contractDate: "2026-09-01", balanceDate: "2026-11-30", checked: ["r-report"], updatedAt: T0 },
  });
  const m = mergeJourneyStates(local, server, T1);
  assert.equal(m.contract?.contractDate, "2026-10-01");
  assert.deepEqual(m.contract?.checked, ["a-tax"]);
  const onlyLocal = mergeJourneyStates(local, emptyJourneyState(), T1);
  assert.equal(onlyLocal.contract?.contractDate, "2026-10-01");
  const onlyServer = mergeJourneyStates(emptyJourneyState(), server, T1);
  assert.equal(onlyServer.contract?.contractDate, "2026-09-01");
});

test("sameJourneyContent: updatedAt·체크 순서는 무시, 내용 차이는 잡는다", () => {
  const a: JourneyState = normalizeJourneyState({
    done: { market: T0 },
    contract: { contractDate: "2026-09-01", checked: ["b", "a"], updatedAt: T0 },
    updatedAt: T0,
  });
  const b: JourneyState = normalizeJourneyState({
    done: { market: T0 },
    contract: { contractDate: "2026-09-01", checked: ["a", "b"], updatedAt: T1 },
    updatedAt: T1,
  });
  assert.equal(sameJourneyContent(a, b), true);
  assert.equal(sameJourneyContent(a, toggleStageDone(b, "budget", T1)), false);
});

/* ───────────────────────── 일정표: 날짜 계산 ───────────────────────── */

test("addDays·daysBetween — 월·해·윤년 경계", () => {
  assert.equal(addDays("2026-09-01", 30), "2026-10-01");
  assert.equal(addDays("2024-01-31", 30), "2024-03-01");
  assert.equal(addDays("2026-12-20", 14), "2027-01-03");
  assert.equal(addDays("2026-03-01", -30), "2026-01-30");
  assert.equal(daysBetween("2026-09-21", "2026-10-01"), 10);
  assert.equal(daysBetween("2026-10-01", "2026-09-21"), -10);
});

test("formatKoreanDay · ddayLabel · formatManwon", () => {
  assert.equal(formatKoreanDay("2026-09-21"), "9월 21일(월)");
  assert.equal(formatKoreanDay("2026-10-31"), "10월 31일(토)");
  assert.equal(ddayLabel(3), "D-3");
  assert.equal(ddayLabel(0), "D-day");
  assert.equal(ddayLabel(-2), "2일 지남");
  assert.equal(formatManwon(85000), "8억 5,000만 원");
  assert.equal(formatManwon(120000), "12억 원");
  assert.equal(formatManwon(9500), "9,500만 원");
});

test("오늘은 한국 날짜(KST) — 기기 시간대와 무관 [리뷰 C]", () => {
  /* UTC 15:00 = KST 다음 날 0시 */
  assert.equal(kstToday(Date.UTC(2026, 8, 21, 14, 59)), "2026-09-21");
  assert.equal(kstToday(Date.UTC(2026, 8, 21, 15, 0)), "2026-09-22");
  assert.equal(kstDayOf("2026-09-21T15:30:00.000Z"), "2026-09-22");
  assert.equal(kstDayOf("2026-12-31T14:59:59.000Z"), "2026-12-31");
  assert.equal(kstDayOf("not a date"), null);
  /* 화면은 기기 현지 날짜(getFullYear·getDate)를 쓰지 않는다 */
  for (const f of ["app/journey/JourneyBoard.tsx", "app/journey/contract/ContractPlanner.tsx", "lib/journey/dates.ts"]) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, /localToday|getFullYear\(\)|getDate\(\)/, f);
  }
});

const DATES: ContractDates = {
  contractDate: "2026-09-01",
  midDate: null,
  balanceDate: "2026-11-30",
  moveInDate: null,
};

test("법정 기한 — 거래신고 계약일+30 · 취득세·등기 잔금일+60 · 전입신고 입주일(없으면 잔금일)+14 (첫날 불산입)", () => {
  assert.equal(CONTRACT_PHASES.report.offsetDays, 30);
  assert.equal(CONTRACT_PHASES.afterBalance.offsetDays, 60);
  assert.equal(CONTRACT_PHASES.moveIn.offsetDays, 14);
  assert.equal(phaseDue("report", DATES), "2026-10-01");
  assert.equal(phaseDue("afterBalance", DATES), "2027-01-29");
  assert.equal(phaseDue("moveIn", DATES), "2026-12-14");
  /* 입주 12/5 + 14 = 12/19(토) → 다음 평일 12/21(월) */
  assert.equal(phaseNominalDue("moveIn", { ...DATES, moveInDate: "2026-12-05" }), "2026-12-19");
  assert.equal(phaseDue("moveIn", { ...DATES, moveInDate: "2026-12-05" }), "2026-12-21");
  assert.equal(phaseDue("before", DATES), "2026-09-01");
  assert.equal(phaseDue("mid", DATES), null);
  /* 권장(잔금 1~2개월 전)은 잔금-30, 그게 계약일보다 앞서면 계약일로 */
  assert.equal(phaseDue("preBalance", DATES), "2026-10-31");
  assert.equal(phaseDue("preBalance", { ...DATES, balanceDate: "2026-09-20" }), "2026-09-01");
  for (const k of ["report", "afterBalance", "moveIn"] as const) assert.equal(CONTRACT_PHASES[k].legal, true);
});

test("일정표 — 날짜순 정렬, 중도금은 날짜가 있을 때만, 상태(지남·오늘·임박·나중·완료)", () => {
  const today = "2026-09-28";
  const g = buildContractTimeline(DATES, new Set(["c-deposit", "c-terms", "c-papers"]), today);
  assert.deepEqual(
    g.map((x) => x.phase),
    ["before", "contractDay", "report", "preBalance", "balanceDay", "moveIn", "afterBalance"],
  );
  const byPhase = Object.fromEntries(g.map((x) => [x.phase, x]));
  assert.equal(byPhase.before.items[0].state, "overdue");
  assert.equal(byPhase.contractDay.allChecked, true);
  assert.equal(byPhase.contractDay.items[0].state, "done");
  assert.equal(byPhase.report.daysLeft, 3);
  assert.equal(byPhase.report.items[0].state, "soon");
  assert.equal(byPhase.afterBalance.items[0].state, "later");
  assert.equal(nextDeadline(g)?.phase, "report", "지난 것(계약 전)·끝낸 것(계약일)은 건너뛴다");

  const withMid = buildContractTimeline({ ...DATES, midDate: "2026-10-15" }, new Set(), "2026-10-15");
  const mid = withMid.find((x) => x.phase === "mid");
  assert.ok(mid);
  assert.equal(mid?.items[0].state, "today");
  assert.equal(withMid.findIndex((x) => x.phase === "mid") < withMid.findIndex((x) => x.phase === "preBalance"), true);

  const undated = buildContractTimeline({ contractDate: null, midDate: null, balanceDate: null, moveInDate: null }, new Set(), today);
  assert.ok(undated.every((x) => x.due === null && x.items.every((i) => i.state === "undated")));
  assert.equal(undated.some((x) => x.phase === "mid"), false);
  assert.equal(hasCalendarEvents(undated), false);
  /* today 를 모르면(서버 렌더·첫 렌더) 남은 날을 세지 않는다 */
  assert.ok(buildContractTimeline(DATES, new Set(), null).every((x) => x.daysLeft === null));
});

test("입력 점검 — 순서가 뒤집힌 날짜를 알린다", () => {
  assert.deepEqual(contractDateWarnings(DATES), []);
  assert.equal(contractDateWarnings({ ...DATES, balanceDate: "2026-08-01" }).length, 1);
  assert.equal(contractDateWarnings({ ...DATES, midDate: "2026-12-01" }).length, 1);
  assert.equal(contractDateWarnings({ ...DATES, moveInDate: "2026-11-01" }).length, 1);
});

test("항목 — id 유일·형식, 법정 단계엔 근거 법령(국가법령정보센터), 용어 링크는 실재 슬러그", () => {
  const ids = CONTRACT_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,40}$/);
  for (const item of CONTRACT_ITEMS) {
    if (CONTRACT_PHASES[item.phase].legal) assert.ok(item.laws && item.laws.length > 0, `${item.id} 근거 법령`);
    for (const l of item.laws ?? []) assert.ok(l.href.startsWith("https://www.law.go.kr/법령/"), l.href);
    /* 공식 누리집만 — 정부(.go.kr·gov.kr)·정책브리핑(korea.kr) */
    for (const l of item.links ?? []) {
      assert.match(l.href, /^https:\/\/([a-z0-9-]+\.)*(go\.kr|gov\.kr|korea\.kr)(\/|$)/, l.href);
    }
  }
  const slugs = new Set(GLOSSARY_TERMS.map((t) => t.slug));
  for (const item of CONTRACT_ITEMS) {
    const href = item.more?.href ?? "";
    if (href.startsWith("/glossary/")) assert.ok(slugs.has(href.slice("/glossary/".length)), href);
  }
  assert.equal(LAW_CHECKED_ON, "2026-09-21");
  /* 법률 서비스(법무사·변호사) 연결·추천 금지 — 화면 문구에 없다(주석 설명은 허용) */
  const visible = CONTRACT_ITEMS.map((i) => `${i.title} ${i.desc}`).join(" ");
  assert.doesNotMatch(visible, /법무사|변호사/);
});

/* ───────────────────────── 캘린더(.ics) ───────────────────────── */

test("ics — CRLF·75옥텟 접기·이스케이프·종일 일정·법정 기한 알림·다 끝낸 단계 제외", () => {
  const groups = buildContractTimeline(DATES, new Set(["c-deposit", "c-terms", "c-papers"]), "2026-09-21");
  const ics = buildContractIcs(groups, { now: new Date(T0), pageUrl: "https://naezipnow.com/journey/contract" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/, "맨 LF 줄바꿈이 없다");
  const enc = new TextEncoder();
  for (const line of ics.split("\r\n")) assert.ok(enc.encode(line).length <= 75, `75옥텟 초과: ${line}`);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002/);
  assert.match(unfolded, /UID:jr-report-20261001@naezipnow\.com/);
  assert.match(unfolded, /SUMMARY:\[내 집 마련\] 부동산 거래신고 기한/);
  assert.match(unfolded, /TRIGGER:-P2DT15H/); // 법정 기한 — 사흘 전 오전 9시
  assert.match(unfolded, /TRIGGER:-PT15H/); // 잔금일 — 전날 오전 9시
  assert.doesNotMatch(unfolded, /UID:jr-contractDay-/, "다 체크한 단계는 싣지 않는다");
  assert.match(unfolded, /DTSTAMP:20260921T030000Z/);
  assert.doesNotMatch(unfolded, /UID:jr-before-/, "이미 지난 날(계약 전, 9/1)은 싣지 않는다");
  const events = unfolded.match(/BEGIN:VEVENT/g)?.length ?? 0;
  assert.equal(events, groups.filter((g) => g.due && !g.allChecked && (g.daysLeft ?? 0) >= 0).length);
  assert.equal(events, 5);
  assert.equal(hasCalendarEvents(groups), true);
});

test("icsEscape(RFC 5545 3.3.11) · foldIcsLine — 글자를 쪼개지 않는다", () => {
  /* 역슬래시·세미콜론·쉼표 앞에 역슬래시, 줄바꿈은 \\n [리뷰 C: 세미콜론이 이스케이프되지 않았다] */
  assert.equal(icsEscape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  assert.equal(icsEscape(";"), "\\;");
  const long = `DESCRIPTION:${"가".repeat(60)}`;
  const folded = foldIcsLine(long);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.equal(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(""), long);
});

/* ───────────────────────── 여정 단계 · 링크 ───────────────────────── */

/** app/ 아래 실제 라우트(정적·동적) — check-route-links 와 같은 판정(간이) */
function routeExists(href: string): boolean {
  const p = (href.split("?")[0] ?? href).replace(/\/$/, "") || "/";
  const segs = p.split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return existsSync(path.join(dir, "page.tsx")) || existsSync(path.join(dir, "route.ts"));
    if (existsSync(path.join(dir, segs[i])) && walk(path.join(dir, segs[i]), i + 1)) return true;
    return readdirSync(dir, { withFileTypes: true }).some(
      (d) => d.isDirectory() && /^\[[^.]+\]$/.test(d.name) && walk(path.join(dir, d.name), i + 1),
    );
  };
  return walk(path.join(ROOT, "app"), 0);
}
/** 같은 판에 다른 담당이 만드는 화면 — 통합 전에는 없을 수 있다 */
const SAME_RELEASE = new Set(["/quiz"]);

test("여정 6단계 — 순서·이름·할 일 2~3개, 링크는 실재 화면(같은 판 /quiz 제외)", () => {
  assert.deepEqual(
    JOURNEY_STAGES.map((s) => s.id),
    [...JOURNEY_STAGE_IDS],
  );
  JOURNEY_STAGES.forEach((s, i) => assert.equal(s.n, i + 1));
  for (const s of JOURNEY_STAGES) {
    const n = s.tasks.length + (s.budgetChips ? 1 : 0);
    assert.ok(n >= 2 && n <= 3, `${s.id} 할 일 ${n}개`);
    assert.ok(s.why.length > 10 && s.why.length < 70, `${s.id} 한 줄`);
    for (const t of s.tasks) {
      if (SAME_RELEASE.has(t.href)) continue;
      assert.ok(routeExists(t.href), `${s.id}: ${t.href}`);
    }
  }
  assert.equal(budgetMapHref(5), "/map?priceMax=5");
  const steps = journeyHowToSteps();
  assert.equal(steps.length, 6);
  assert.ok(steps.every((x) => x.name && x.text.includes("할 일:")));
});

test("홈 입구 — 문 넷, 실재 화면으로", () => {
  assert.equal(HOME_START_DOORS.length, 4);
  for (const d of HOME_START_DOORS) {
    if (SAME_RELEASE.has(d.href)) continue;
    assert.ok(routeExists(d.href), d.href);
  }
  const page = read("app/page.tsx");
  assert.match(page, /<HomeStartDoors \/>/);
  /* [991] 첫 화면은 정적 — 입구 조각에 클라이언트 JS 없음 */
  assert.doesNotMatch(read("app/components/home/HomeStartDoors.tsx"), /"use client"/);
});

test("내비 — 맨 앞 '내 집 마련' → /journey, 하위에 일정표·게임 · 푸터 링크", () => {
  assert.equal(NAV[0].label, "내 집 마련");
  assert.equal(NAV[0].href, "/journey");
  const kids = (NAV[0].children ?? []).map((c) => c.href);
  assert.deepEqual(kids, ["/journey", "/journey/contract", "/quiz"]);
  assert.equal(NAV.length, 6);
  const footer = read("app/components/Footer.tsx");
  assert.match(footer, /href: "\/journey"/);
  assert.match(footer, /href: "\/journey\/contract"/);
  for (const f of ["app/components/DesktopSideNav.tsx", "app/components/MobileMenu.tsx"]) {
    assert.match(read(f), /"내 집 마련": "key"/, f);
  }
});

/* ───────────────────────── 정적·캐시·등록·저장 계약 ───────────────────────── */

const SERVER_PERSONALIZATION = [
  "safeAuth",
  'from "@/auth"',
  "auth()",
  "cookies()",
  "headers()",
  "searchParams",
  "getUser(",
  "getSession(",
];

test("/journey · /journey/contract — force-static, 서버 개인화 읽기 없음, 공개 캐시·사이트맵·llms 등록", () => {
  for (const f of ["app/journey/page.tsx", "app/journey/contract/page.tsx"]) {
    const src = stripComments(read(f));
    assert.match(src, /export const dynamic = "force-static"/, f);
    for (const m of SERVER_PERSONALIZATION) assert.equal(src.includes(m), false, `${f}: ${m}`);
  }
  const paths = new Set(PUBLIC_CACHE_RULES.map((r) => r.path));
  for (const p of ["/journey", "/journey/contract", "/quiz"]) assert.ok(paths.has(p), p);
  const sections = read("lib/seo/sitemap-sections.ts");
  for (const p of ["/journey", "/journey/contract", "/quiz"]) assert.match(sections, new RegExp(`path: "${p}"`));
  assert.match(sections, /slug: "pages"[^\n]*load: loadPagesEntries/);
  const llms = read("app/llms.txt/route.ts");
  assert.match(llms, /naezipnow\.com\/journey\b/);
  assert.match(llms, /naezipnow\.com\/journey\/contract/);
});

test("신호 — 최근 본 단지·실거래가 게임 키가 원본과 같다", () => {
  const rc = read("app/components/RecentComplexes.tsx");
  const key = /const KEY = "([^"]+)"/.exec(rc)?.[1];
  assert.equal(key, "nz_recent_complexes");
  const signals = read("lib/journey/signals.ts");
  assert.match(signals, new RegExp(`RECENT_COMPLEXES_KEY = "${key}"`));
  /* 실거래가 게임은 같은 판 Q 의 모듈 — 있으면 키를 대조한다(이름이 바뀌면 여기서 드러난다) */
  if (existsSync(path.join(ROOT, "lib/quiz/price-game.ts"))) {
    const quizKey = /export const QUIZ_STORE_KEY = "([^"]+)"/.exec(read("lib/quiz/price-game.ts"))?.[1];
    assert.ok(quizKey, "QUIZ_STORE_KEY 선언을 찾지 못함");
    assert.match(signals, new RegExp(`QUIZ_STORE_KEY_MIRROR = "${quizKey}"`));
  }
  /* 자동 신호는 '진행 중'까지만 — 완료(done)를 쓰는 코드가 없다 */
  assert.doesNotMatch(stripComments(signals), /done|updateJourney|toggleStageDone/);
});

test("클라이언트 저장소 — 로그인 힌트 없으면 요청 없이 이 기기, 옛 배너 키와 겹치지 않는다", () => {
  const store = stripComments(read("lib/journey/client-store.ts"));
  const hintAt = store.indexOf("readAuthedHint()");
  const fetchAt = store.indexOf("loadAccount()");
  assert.ok(hintAt > 0 && fetchAt > hintAt, "힌트 판정이 계정 조회보다 먼저");
  assert.match(store, /getSessionLite\(\)/);
  const local = read("lib/journey/local.ts");
  const key = /JOURNEY_LOCAL_KEY = "([^"]+)"/.exec(local)?.[1];
  assert.ok(key && key !== "nz_journey" && key !== "nz_journey_loop", key);
});

test("API — 세션 필수·본문/상태 상한·no-store, 저장소는 journey_state 칸만", () => {
  const route = read("app/api/me/journey/route.ts");
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /export async function PUT\(req: Request\)/);
  assert.equal((route.match(/, 401\)/g) ?? []).length, 2);
  assert.match(route, /JOURNEY_BODY_MAX_BYTES/);
  assert.match(route, /journeyStateBytes\(state\) > JOURNEY_STATE_MAX_BYTES/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  const store = stripComments(read("lib/journey/store.ts"));
  assert.match(store, /\.select\("journey_state"\)/);
  assert.match(store, /\.update\(\{ journey_state: next, updated_at: now \}\)/);
  assert.doesNotMatch(store, /ui_prefs|persona:|risk_tolerance|holding_years/);
});

test("SQL 초안 — 칸 하나 추가, 권한 새로 열지 않음", () => {
  const sql = read("supabase/migrations/20260921002000_1008_user_preferences_journey_state.sql");
  const body = sql.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.equal(
    body,
    "alter table public.user_preferences\n  add column if not exists journey_state jsonb not null default '{}'::jsonb;",
  );
  assert.doesNotMatch(body, /\bgrant\b/i);
});

/* ───────────────────────── [리뷰 C] 쉬는 날 연장 · 공휴일 목록 ───────────────────────── */

test("공휴일 목록 — 공식 월력요항의 관공서 공휴일 수와 맞는다(2026·2027 모두 72일)", () => {
  assert.deepEqual([...HOLIDAY_YEARS], [2026, 2027]);
  assert.equal(HOLIDAYS_CHECKED_ON, "2026-09-21");
  const all = knownHolidays();
  for (const d of Object.keys(all)) {
    assert.ok(isIsoDay(d), d);
    assert.ok(HOLIDAY_YEARS.includes(Number(d.slice(0, 4))), d);
  }
  for (const year of HOLIDAY_YEARS) {
    /* 관공서 공휴일 = 일요일 + 일요일이 아닌 공휴일 */
    let sundays = 0;
    for (let d = `${year}-01-01`; d.startsWith(String(year)); d = addDays(d, 1)) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) sundays++;
    }
    const offSunday = Object.keys(all).filter(
      (d) => d.startsWith(`${year}-`) && new Date(`${d}T00:00:00Z`).getUTCDay() !== 0,
    ).length;
    /* 2026: 「2026년 월력요항」 70일 + 노동절·제헌절(2026. 5. 공휴일 지정) = 72 · 2027: 「2027년 월력요항」 72일 */
    assert.equal(sundays + offSunday, 72, `${year}`);
    /* 주 5일제 휴일(토·일 + 평일 공휴일) — 우주항공청 「2027년 월력요항」 보도자료: 2026년 120일(노동절·제헌절 반영), 2027년 119일 */
    let rest = 0;
    for (let d = `${year}-01-01`; d.startsWith(String(year)); d = addDays(d, 1)) if (isRestDay(d)) rest++;
    assert.equal(rest, year === 2026 ? 120 : 119, `${year} 주5일제 휴일`);
  }
  assert.equal(holidayName("2026-10-03"), "개천절");
  assert.equal(holidayName("2026-10-05"), "대체공휴일");
  assert.equal(holidayName("2026-05-01"), "노동절");
  assert.equal(holidayName("2026-07-17"), "제헌절");
  assert.equal(holidayName("2027-05-13"), "부처님 오신 날");
  assert.equal(holidayName("2026-10-06"), null);
});

test("nextWorkday — 토·일·공휴일이 이어지면 계속 미룬다, 모르는 해는 토·일만", () => {
  assert.equal(nextWorkday("2026-10-03"), "2026-10-06"); // 토·개천절 → 일 → 대체공휴일 → 화
  assert.equal(nextWorkday("2026-09-24"), "2026-09-28"); // 추석 연휴 목·금·토 → 일 → 월
  assert.equal(nextWorkday("2027-02-06"), "2027-02-10"); // 설 연휴 토·일(설날)·월 + 대체 화 → 수
  assert.equal(nextWorkday("2026-10-01"), "2026-10-01"); // 평일은 그대로
  assert.equal(isRestDay("2026-10-04"), true);
  /* 2028 년은 공휴일 목록이 없다 — 주말만 넘긴다(실제보다 이르게 보일 수는 있어도 늦게 보이지 않는다) */
  assert.equal(nextWorkday("2028-10-03"), "2028-10-03");
  assert.equal(nextWorkday("2028-10-07"), "2028-10-09");
});

test("법정 기한 연장 — 계약 2026-09-03 → 30일째 10/3(토·개천절) → 실제 기한 10/6, '지남'은 그 뒤부터", () => {
  const d: ContractDates = { contractDate: "2026-09-03", midDate: null, balanceDate: null, moveInDate: null };
  assert.equal(phaseNominalDue("report", d), "2026-10-03");
  assert.equal(phaseDue("report", d), "2026-10-06");
  const on = (today: string) => buildContractTimeline(d, new Set(), today).find((g) => g.phase === "report");
  assert.equal(on("2026-10-05")?.daysLeft, 1);
  assert.equal(on("2026-10-05")?.items[0].state, "soon");
  assert.equal(on("2026-10-06")?.items[0].state, "today");
  assert.equal(on("2026-10-07")?.items[0].state, "overdue");
  const g = on("2026-09-21");
  assert.ok(g);
  assert.equal(g?.nominalDue, "2026-10-03");
  assert.equal(restDayNote(g!), "원래 10월 3일(토·개천절)이지만 쉬는 날이라 다음 평일까지예요");
  assert.equal(formatKoreanDayRest("2026-10-03"), "10월 3일(토·개천절)");
  assert.equal(formatKoreanDayRest("2026-10-10"), "10월 10일(토)");
  /* 내가 정한 날(계약일·잔금일)은 주말이어도 옮기지 않는다 */
  assert.equal(phaseDue("contractDay", { ...d, contractDate: "2026-10-03" }), "2026-10-03");
  assert.equal(phaseDue("balanceDay", { ...d, balanceDate: "2026-10-03" }), "2026-10-03");
  /* 평일이면 설명 없음 */
  const plain = buildContractTimeline(DATES, new Set(), "2026-09-21").find((x) => x.phase === "report");
  assert.equal(restDayNote(plain!), null);
  assert.match(REST_DAY_RULE, /토·일·공휴일이면 다음 평일까지 — 민법 제161조·지방세기본법 제24조/);
});

test("캘린더 — 미뤄진 기한은 실제 기한 날짜로, 설명에 원래 날과 근거", () => {
  const d: ContractDates = { contractDate: "2026-09-03", midDate: null, balanceDate: null, moveInDate: null };
  const groups = buildContractTimeline(d, new Set(), "2026-09-21");
  const unfolded = buildContractIcs(groups, { now: new Date(T0), pageUrl: "https://naezipnow.com/journey/contract" }).replace(
    /\r\n /g,
    "",
  );
  assert.match(unfolded, /UID:jr-report-20261006@naezipnow\.com/);
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261006/);
  assert.match(unfolded, /원래 10월 3일\(토·개천절\)이지만 쉬는 날이라 다음 평일까지예요\(민법 제161조·지방세기본법 제24조\)/);
});

test("요약 — 기한이 모두 지났고 체크가 없으면 '다 했어요'가 아니라 지난 법정 기한의 할 일 수 [리뷰 C]", () => {
  const d: ContractDates = { contractDate: "2026-06-01", midDate: null, balanceDate: "2026-07-15", moveInDate: null };
  const g = buildContractTimeline(d, new Set(), "2026-09-21");
  assert.equal(nextDeadline(g), null);
  assert.equal(hasCalendarEvents(g), false);
  /* 거래신고 1 + 취득세·등기 2 + 전입신고 1 */
  assert.equal(overdueLegalCount(g), 4);
  const allDone = buildContractTimeline(d, new Set(CONTRACT_ITEMS.map((i) => i.id)), "2026-09-21");
  assert.equal(overdueLegalCount(allDone), 0);
  /* 화면 문구: 지난 법정 기한 수 · 모두 체크 · 남은 기한 없음 — 옛 "남은 날짜의 할 일을 모두 체크했어요"는 없다 */
  const planner = read("app/journey/contract/ContractPlanner.tsx");
  assert.match(planner, /지난 법정 기한에 체크하지 않은 일이 \$\{overdue\}개 있어요/);
  assert.match(planner, /남은 기한이 없어요/);
  assert.doesNotMatch(planner, /남은 날짜의 할 일을 모두 체크했어요/);
});

/* ───────────────────────── [리뷰 C] 불러오는 사이의 변경 · 계정 사본 ───────────────────────── */

const EMPTY_PLAN_T = {
  contractDate: null,
  midDate: null,
  balanceDate: null,
  moveInDate: null,
  priceManwon: null,
  checked: [] as string[],
  updatedAt: null,
};
const setPriceOp =
  (n: number): JourneyOp =>
  (s) =>
    withContractPlan(s, { ...(s.contract ?? EMPTY_PLAN_T), priceManwon: n }, T1);

const SERVER_STATE = normalizeJourneyState({
  done: { market: T0 },
  contract: { contractDate: "2026-09-15", balanceDate: "2026-11-30", checked: ["c-deposit"], updatedAt: T0 },
  updatedAt: T0,
});

test("composeAccountState — 불러오는 동안 적은 매매가는 계정 상태 위에 칸 하나로 다시 적용된다(race2.mjs)", () => {
  const next = composeAccountState({
    server: SERVER_STATE,
    copy: null,
    guest: emptyJourneyState(),
    ops: [setPriceOp(90000)],
    nowIso: T1,
  });
  assert.equal(next.contract?.contractDate, "2026-09-15");
  assert.equal(next.contract?.balanceDate, "2026-11-30");
  assert.deepEqual(next.contract?.checked, ["c-deposit"]);
  assert.equal(next.contract?.priceManwon, 90000);
  assert.deepEqual(next.done, { market: T0 });
  /* 순서대로 적용 — 마지막 값이 남는다 */
  assert.equal(applyJourneyOps(SERVER_STATE, [setPriceOp(1), setPriceOp(2)]).contract?.priceManwon, 2);
});

test("composeAccountState — 비회원 사본은 합치고, 저장 못 한 계정 사본은 서버가 그대로면 통째로(지운 칸도)", () => {
  const guest = normalizeJourneyState({ done: { budget: T1 } });
  const withGuest = composeAccountState({ server: SERVER_STATE, copy: null, guest, ops: [], nowIso: T1 });
  assert.deepEqual(Object.keys(withGuest.done).sort(), ["budget", "market"]);
  assert.equal(withGuest.contract?.contractDate, "2026-09-15");

  /* 사본이 서버 T0 에서 갈라졌고 서버가 그대로 — 사용자가 잔금일을 지운 것까지 사본대로 */
  const edited = withContractPlan(SERVER_STATE, { ...(SERVER_STATE.contract as ContractPlan), balanceDate: null }, T1);
  const ff = composeAccountState({
    server: SERVER_STATE,
    copy: { state: edited, base: T0 },
    guest: emptyJourneyState(),
    ops: [],
    nowIso: T1,
  });
  assert.equal(ff.contract?.balanceDate, null);
  /* 그 사이 다른 기기가 저장했으면(서버 버전이 다름) 합친다 — 잃지 않는 쪽 */
  const merged = composeAccountState({
    server: SERVER_STATE,
    copy: { state: edited, base: "2026-09-10T00:00:00.000Z" },
    guest: emptyJourneyState(),
    ops: [],
    nowIso: T1,
  });
  assert.equal(merged.contract?.balanceDate, "2026-11-30");
});

/** node 에서 localStorage 흉내 — lib/journey/local.ts 는 부를 때마다 window 를 본다 */
function withFakeStorage(fn: (store: Map<string, string>) => void | Promise<void>) {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const done = () => {
    g.window = prev;
  };
  const r = fn(store);
  if (r && typeof (r as Promise<void>).then === "function") return (r as Promise<void>).finally(done);
  done();
  return undefined;
}

test("계정 사본 — 비회원 키와 따로, 주인만 읽고 다른 계정·비회원은 지운다(leak.mjs)", async () => {
  await withFakeStorage(async (store) => {
    const a = await accountOwnerTag("A@Example.com ");
    const a2 = await accountOwnerTag("a@example.com");
    const b = await accountOwnerTag("b@example.com");
    assert.equal(a, a2, "대소문자·공백과 무관한 같은 주인");
    assert.notEqual(a, b);
    assert.doesNotMatch(a, /example/, "이메일 원문을 적지 않는다");

    writeAccountCopy(a, T0, SERVER_STATE);
    assert.equal(store.has(JOURNEY_ACCOUNT_KEY), true);
    assert.equal(store.has(JOURNEY_LOCAL_KEY), false, "계정 진행은 비회원 키에 적히지 않는다");
    assert.equal(isJourneyEmpty(readLocalJourney()), true, "비회원이 읽는 사본은 비어 있다");

    /* 다른 계정 — 읽지 않고 지운다 */
    assert.equal(readAccountCopy(b), null);
    assert.equal(store.has(JOURNEY_ACCOUNT_KEY), false);

    /* 주인 — 읽는다 */
    writeAccountCopy(a, T0, SERVER_STATE);
    const back = readAccountCopy(a);
    assert.equal(back?.base, T0);
    assert.equal(back?.state.contract?.contractDate, "2026-09-15");
    clearAccountCopy();
    assert.equal(store.has(JOURNEY_ACCOUNT_KEY), false);

    /* 비회원 사본은 그대로 따로 */
    writeLocalJourney(normalizeJourneyState({ done: { market: T0 } }));
    assert.equal(store.has(JOURNEY_LOCAL_KEY), true);
    assert.equal(readAccountCopy(a), null);
  });
});

test("클라이언트 저장소 — 비회원 키는 비회원 경로에서만 쓰고, 비회원 화면은 계정 사본을 지운다", () => {
  const src = stripComments(read("lib/journey/client-store.ts"));
  assert.equal((src.match(/writeLocalJourney\(/g) ?? []).length, 2, "becomeGuest · guest 분기 두 곳뿐");
  const guestFn = src.slice(src.indexOf("function becomeGuest"), src.indexOf("async function putState"));
  assert.match(guestFn, /clearAccountCopy\(\)/);
  assert.doesNotMatch(guestFn, /readAccountCopy/);
  /* 실패 경로는 계정 사본(주인 표식)에 */
  const runPut = src.slice(src.indexOf("async function runPut"), src.indexOf("function flushPut"));
  assert.match(runPut, /writeAccountCopy\(owner, serverVersion, snap\.state\)/);
  /* 불러오는 중의 변경은 줄 세운다 */
  assert.match(src, /pendingOps\.push\(fn\)/);
  /* 비회원 사본은 그 사이 바뀌지 않았을 때만 지운다 */
  assert.match(src, /if \(readLocalRaw\(\) === guestRaw\) clearLocalJourney\(\)/);
});

test("일정표 입력 — 불러오는 동안 막고, 날짜 칸은 달력에 있는 날만 저장(중간값·일부 지움은 무시)", () => {
  const src = read("app/journey/contract/ContractPlanner.tsx");
  assert.match(src, /<DateField[\s\S]*?disabled=\{!ready\}/);
  const price = src.slice(src.indexOf('id="jr-price"'), src.indexOf('id="jr-price"') + 400);
  assert.match(price, /disabled=\{!ready\}/);
  const field = src.slice(src.indexOf("function DateField"), src.indexOf("export function ContractPlanner"));
  assert.match(field, /if \(isIsoDay\(v\)\) onCommit\(v\)/);
  assert.match(field, /validity\.badInput/);
  /* 중간값("0002-11-30")은 저장 규칙이 받지 않는다 — 그래서 칸에서 걸러야 한다 */
  assert.equal(isIsoDay("0002-11-30"), false);
  assert.equal(isIsoDay("2027-11-30"), true);
});

/* ───────────────────────── [리뷰 C] 내 데이터 내보내기 ───────────────────────── */

test("내보내기 — user_preferences 의 표시·기록 기본값과 여정을 싣고, 못 읽으면 errors 에 남긴다", () => {
  const base: ExportInput = {
    email: "me@example.com",
    generatedAt: T0,
    profile: { ok: true, value: { email: "me@example.com", name: "나", plan: "free", createdAt: null } },
    notes: { ok: true, value: [] },
    bookmarks: { ok: true, value: [] },
    watchlist: { ok: true, value: [] },
    alerts: { ok: true, value: [] },
    points: { ok: true, value: [] },
    payments: { ok: true, value: [] },
    notificationPrefs: { ok: true, value: {} },
  };
  const withPrefs = buildExportPayload({
    ...base,
    preferences: {
      ok: true,
      value: { uiPrefs: { areaUnit: "pyeong", updatedAt: T0 }, journey: SERVER_STATE as unknown as Record<string, unknown> },
    },
  });
  assert.deepEqual(withPrefs.preferences?.displayDefaults, { areaUnit: "pyeong", updatedAt: T0 });
  assert.equal((withPrefs.preferences?.journey as { contract?: { contractDate?: string } }).contract?.contractDate, "2026-09-15");
  /* 저장한 적 없는 표시 기본값(저장 시각 없음)은 null — 기본값을 내 설정처럼 내보내지 않는다 */
  const untouched = buildExportPayload({
    ...base,
    preferences: { ok: true, value: { uiPrefs: { areaUnit: "m2", updatedAt: null }, journey: null } },
  });
  assert.deepEqual(untouched.preferences, { displayDefaults: null, journey: null });
  const failed = buildExportPayload({ ...base, preferences: { ok: false, error: "user_preferences 조회 실패" } });
  assert.equal(failed.preferences, null);
  assert.deepEqual(failed.errors.map((e) => e.source), ["preferences"]);
  const route = read("app/api/me/export/route.ts");
  assert.match(route, /getUiPrefs\(email\)/);
  assert.match(route, /getJourneyState\(email\)/);
  assert.match(route, /preferences: settledToSource\(userPrefs\)/);
});

test("저장소 — insert 가 기본키 충돌(23505)이면 update 를 한 번 더(update→insert 사이 경쟁)", () => {
  const store = stripComments(read("lib/journey/store.ts"));
  assert.match(store, /insErr\.code === "23505"/);
  assert.match(store, /await update\(\)/);
});
