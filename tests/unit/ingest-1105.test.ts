/* [1105] 실거래 빈 곳 메우기 낭비 — 정상 0건 응답을 "아직 안 채움"으로 읽어 같은 시군구 · 달을 매일 다시 묻던 것.
 *  운영 기록(market_ingest_log · 2026-10-01~11-03, dataset "아파트 매매·전월세 실거래 2026MM"): 202604~202608 이 각각 22~25회 ·
 *  매번 "slice=-1 시도=N 빈응답=N 오류=0" · 적재 0. 빈 곳(market_transactions 0행, 2026-11-04 조회)은 달마다 2~6곳 —
 *  옹진군 28720 · 울릉군 47940 · 신안군 12870 · 영양군 47760 · 봉화군 47920 · 화천군 51790.
 *  원인: GH ETL(etl.yml)이 매일 지난 1~6개월을 ?gaps=1 로 부르고, findCoverageGaps 는 "행 0 = 빈 곳"이라 정상 0건 응답(행 없음)이
 *  다음 날 또 빈 곳이 된다. 고침: 정상 0건 확인 시각만 적고(행은 만들지 않는다) 신고 창 안의 달은 7일마다 · 창 밖 달은 다시 묻지 않는다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canRecordEmpty,
  EMPTY_RECHECK_MS,
  freshEmptyCodes,
  isEmptyCheckFresh,
  mergeEmptyChecks,
  MOLIT_EMPTY_CAP,
  MOLIT_EMPTY_KEY,
  MOLIT_REDO_KEY,
  monthsBefore,
  redoTypesKey,
  shiftYm,
  type EmptyCheckEntry,
} from "@/lib/market/molit-core";
import { parseRunTally } from "@/lib/market/ingest-outcome";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const D = (iso: string) => new Date(iso);
const DAY = 86_400_000;
const APT = redoTypesKey(["apartment"]);
const entry = (code: string, ym: string, checkedAt: string, types = APT): EmptyCheckEntry => ({ code, ym, types, checkedAt });

test("monthsBefore · canRecordEmpty — 당월 · 미래 달은 적지 않는다(날마다 신고가 쌓이는 중)", () => {
  const now = D("2026-11-04T12:00:00Z");
  assert.equal(monthsBefore("202611", now), 0);
  assert.equal(monthsBefore("202610", now), 1);
  assert.equal(monthsBefore("202512", now), 11);
  assert.equal(monthsBefore("202612", now), -1);
  assert.equal(monthsBefore("2026-11", now), null);
  assert.equal(monthsBefore("202613", now), null);
  assert.equal(canRecordEmpty("202611", now), false);
  assert.equal(canRecordEmpty("202612", now), false);
  assert.equal(canRecordEmpty("202610", now), true);
  assert.equal(canRecordEmpty("202604", now), true);
});

test("isEmptyCheckFresh — 신고 창 안 7일 · 창 밖에서 확인했으면 계속 · 깨진 값은 믿지 않는다", () => {
  assert.equal(EMPTY_RECHECK_MS, 7 * DAY);
  const now = D("2026-11-04T12:00:00Z");
  /* 202609 = 2개월 전(창 안) — 7일 동안만 */
  assert.equal(isEmptyCheckFresh(entry("28720", "202609", "2026-11-01T12:00:00Z"), now), true);
  assert.equal(isEmptyCheckFresh(entry("28720", "202609", "2026-10-28T12:00:01Z"), now), true);
  assert.equal(isEmptyCheckFresh(entry("28720", "202609", "2026-10-28T12:00:00Z"), now), false, "딱 7일이면 다시 묻는다");
  /* 202606 — 창 밖에서 확인(10-02 기준 4개월 전) → 300일 뒤에도 믿는다 */
  assert.equal(isEmptyCheckFresh(entry("28720", "202606", "2026-10-02T12:00:00Z"), D("2027-07-29T12:00:00Z")), true);
  /* 202608 — 10-10 확인 땐 창 안(2개월 전) · 11-04 엔 창 밖이지만 마지막 확인이 창 안이었다 → 7일 지나 한 번 더 */
  assert.equal(isEmptyCheckFresh(entry("47940", "202608", "2026-10-10T12:00:00Z"), now), false);
  /* 창이 닫힌 뒤(11-01 · 3개월 전) 다시 확인했으면 계속 */
  assert.equal(isEmptyCheckFresh(entry("47940", "202608", "2026-11-01T00:00:00Z"), D("2027-03-01T00:00:00Z")), true);
  /* 당월 · 깨진 시각 · 미래 시각 · 형식 오류 */
  assert.equal(isEmptyCheckFresh(entry("28720", "202611", "2026-11-04T00:00:00Z"), now), false);
  assert.equal(isEmptyCheckFresh(entry("28720", "202606", "어제"), now), false);
  assert.equal(isEmptyCheckFresh(entry("28720", "202606", "2026-11-09T00:00:00Z"), now), false);
  assert.equal(isEmptyCheckFresh(entry("28720", "2026-06", "2026-11-01T00:00:00Z"), now), false);
});

test("freshEmptyCodes — 같은 달 · 같은 유형 묶음만 · 깨진 줄은 무시", () => {
  const now = D("2026-11-04T12:00:00Z");
  const list: unknown[] = [
    entry("28720", "202606", "2026-11-03T13:22:00Z"),
    entry("47940", "202606", "2026-11-03T13:22:00Z"),
    entry("12870", "202605", "2026-11-03T13:22:00Z"),
    entry("41390", "202606", "2026-11-03T13:22:00Z", redoTypesKey(["officetel", "rowhouse", "house"])),
    { code: "1234", ym: "202606", types: APT, checkedAt: "2026-11-03T13:22:00Z" },
    null,
    "28720",
  ];
  assert.deepEqual([...freshEmptyCodes(list, "202606", APT, now)].sort(), ["28720", "47940"]);
  assert.deepEqual([...freshEmptyCodes(list, "202606", "house,officetel,rowhouse", now)], ["41390"]);
  assert.equal(freshEmptyCodes([], "202606", APT, now).size, 0);
});

test("mergeEmptyChecks — 같은 (구, 월, 유형)은 새 기록 하나 · 행이 생긴 곳 · 낡은 줄 · 당월 · 깨진 줄은 뺀다 · 상한", () => {
  const now = D("2026-11-04T12:00:00Z");
  const list: unknown[] = [
    entry("28720", "202606", "2026-10-02T12:00:00Z"), // 창 밖 확인 — 남는다
    entry("47940", "202609", "2026-10-20T12:00:00Z"), // 창 안 · 15일 — 낡음 → 빠진다
    entry("12870", "202609", "2026-11-02T12:00:00Z"), // 창 안 · 2일 — 남는다(아래 remove 로 빠진다)
    entry("51790", "202606", "2026-10-02T12:00:00Z"), // 아래 add 로 새 시각
    { code: "x", ym: "202606", types: APT, checkedAt: "2026-10-02T12:00:00Z" },
  ];
  const merged = mergeEmptyChecks(
    list,
    [entry("51790", "202606", now.toISOString()), entry("28720", "202611", now.toISOString())],
    [{ code: "12870", ym: "202609", types: APT }],
    now,
  );
  assert.deepEqual(
    merged.map((e) => `${e.code}@${e.ym}@${e.checkedAt.slice(0, 10)}`),
    ["28720@202606@2026-10-02", "51790@202606@2026-11-04"],
  );
  /* 상한 — 최근 것부터 */
  const many = Array.from({ length: 30 }, (_, i) => entry(String(10000 + i), "202606", `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`));
  assert.equal(mergeEmptyChecks(many, [], [], now, 10).length, 10);
  assert.equal(mergeEmptyChecks(many, [], [], now, 10)[9].code, "10029");
  assert.ok(MOLIT_EMPTY_CAP >= 1_000);
  /* 다시 받기 명단과 다른 키(서로 덮어쓰지 않는다) */
  assert.notEqual(MOLIT_EMPTY_KEY, MOLIT_REDO_KEY);
});

/* 운영 재연 — 2026-10-01~11-10 매일 12시(UTC) GH ETL 이 지난 1~6개월을 ?gaps=1 로 부른다. 빈 곳은 위 2026-11-04 조회 그대로.
   202609 의 두 곳(실측 11-01 에 행이 생긴 2곳 — 코드 대신 가짜 99001 · 99002)은 10-31 까지 비었다가 11-01 부터 행이 있다. */
const OBSERVED_EMPTY: Record<string, string[]> = {
  "202604": ["28720", "47940", "51790"],
  "202605": ["12870", "28720", "47760", "47940"],
  "202606": ["12870", "28720", "47760", "47920", "47940", "51790"],
  "202607": ["12870", "28720"],
  "202608": ["12870", "28720", "47940"],
  "202609": ["28720", "47940"],
};
const LATE: Record<string, { ym: string; from: string }> = {
  "99001": { ym: "202609", from: "2026-11-01" },
  "99002": { ym: "202609", from: "2026-11-01" },
};

function replay(withRecord: boolean) {
  let list: unknown[] = [];
  let asks = 0;
  const asksByYm: Record<string, number> = {};
  const filledOn: Record<string, string> = {};
  for (let t = D("2026-10-01T12:00:00Z").getTime(); t <= D("2026-11-10T12:00:00Z").getTime(); t += DAY) {
    const now = new Date(t);
    const day = now.toISOString().slice(0, 10);
    const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    for (let k = 1; k <= 6; k += 1) {
      const ym = shiftYm(cur, -k);
      if (!OBSERVED_EMPTY[ym]) continue; // 202610 은 아직 채우는 중인 달 — 이 기록의 대상(202604~09)만
      const late = Object.keys(LATE).filter((c) => LATE[c].ym === ym && !filledOn[c]);
      const gaps = [...OBSERVED_EMPTY[ym], ...late];
      const skip = withRecord ? freshEmptyCodes(list, ym, APT, now) : new Set<string>();
      const add: EmptyCheckEntry[] = [];
      const done: { code: string; ym: string; types: string }[] = [];
      for (const code of gaps) {
        if (skip.has(code)) continue;
        asks += 1;
        asksByYm[ym] = (asksByYm[ym] ?? 0) + 1;
        const hasData = LATE[code] && day >= LATE[code].from;
        if (hasData) {
          filledOn[code] = day;
          done.push({ code, ym, types: APT });
        } else if (canRecordEmpty(ym, now)) {
          add.push({ code, ym, types: APT, checkedAt: now.toISOString() });
        }
      }
      if (withRecord) list = mergeEmptyChecks(list, add, done, now);
    }
  }
  return { asks, asksByYm, filledOn };
}

test("운영 재연 — 같은 빈 곳을 매일 묻던 것이 창 밖 달은 한 번 · 창 안 달은 주 1회로 · 늦게 온 신고는 7일 안에 잡는다", () => {
  const before = replay(false);
  const after = replay(true);
  /* 예전: 41일 × 달마다 빈 곳 수(10월 202604~09 · 11월 202605~09) — 실측 로그(~11-03)의 달마다 22~25회와 같은 모양 */
  assert.equal(before.asksByYm["202606"], 41 * 6);
  assert.equal(before.asksByYm["202604"], 31 * 3, "202604 는 10월에만 대상");
  /* 창 밖 달(10월 기준 202604~202607)은 한 번씩만 */
  assert.equal(after.asksByYm["202604"], 3);
  assert.equal(after.asksByYm["202605"], 4);
  assert.equal(after.asksByYm["202606"], 6);
  assert.equal(after.asksByYm["202607"], 2);
  /* 202608 — 10월엔 창 안(주 1회 · 10-01 · 08 · 15 · 22 · 29 = 5번 × 3곳). 11월엔 창 밖 — 마지막 확인(10-29)이 창 안이라
     7일 뒤(11-05) 한 번 더 묻고 그 뒤로는 묻지 않는다 */
  assert.equal(after.asksByYm["202608"], 6 * 3);
  /* 202609 — 창 안 내내 주 1회(10-01 · 08 · 15 · 22 · 29 · 11-05 = 6번) × (빈 두 곳 + 늦게 온 두 곳 · 늦게 온 곳은 11-05 에 행을 찾고 끝) */
  assert.equal(after.asksByYm["202609"], 6 * 4);
  assert.ok(after.asks * 10 < before.asks, `${after.asks} vs ${before.asks}`);
  /* 늦게 온 신고: 예전엔 그날 · 지금은 7일 안(신고 창 안 슬라이스 회전 · 전월 보강은 따로 매일 돈다) */
  assert.equal(before.filledOn["99001"], "2026-11-01");
  const delay = (D(after.filledOn["99001"]).getTime() - D("2026-11-01").getTime()) / DAY;
  assert.ok(delay >= 0 && delay < 7, `99001 ${after.filledOn["99001"]}`);
  assert.equal(after.filledOn["99002"], after.filledOn["99001"]);
});

test("적재 코드 — 빈 곳 메우기만 기록을 믿고 · 상한 채우기 전에 거른다 · 정상 0건 + DB 0행일 때만 적는다 · 실패는 그대로 오류", () => {
  const raw = read("lib/market/molit-transactions.ts");
  const tx = strip(raw);
  /* 빈 곳 찾기 — skip 은 상한 검사 직후 · HEAD 카운트 전 */
  const gaps = tx.slice(tx.indexOf("export async function findCoverageGaps("), tx.indexOf("function pricePerPyeong("));
  assert.match(gaps, /if \(out\.length >= limit\) break;\s*if \(skip\?\.has\(info\.sigunguCd\)\) \{\s*if \(stats\) stats\.skipped \+= 1;\s*continue;\s*\}\s*let q = sb/);
  /* 슬라이스 회전 · 수동 codes 는 건너뛰지 않는다 */
  assert.match(tx, /const knownEmptyCodes = opts\.gapsFirst \? freshEmptyCodes\(await loadEmptyList\(\), yyyymm, typesKey, now\) : new Set<string>\(\);/);
  assert.equal((tx.match(/findCoverageGaps\(sb, yyyymm, (infos|all), sliceSize, propertyTypes, knownEmptyCodes, gapStats\)/g) ?? []).length, 2);
  assert.match(tx, /targets = infos\.slice\(0, 60\);/, "수동 codes(빈 곳 메우기 아님)는 예전처럼 전부 묻는다");
  /* 적는 조건 — 모든 유형이 정상 0건 · DB 0행 · 당월 아님 */
  assert.match(tx, /if \(!\(res\.deals\.length === 0 && \(res\.reason === "empty" \|\| \(res\.mode === "live" && !res\.reason\)\)\)\) allTypesEmpty = false;/);
  assert.match(tx, /if \(allTypesEmpty && \(count \?\? 0\) === 0 && canRecordEmpty\(yyyymm, now\)\) \{\s*emptyAdd\.push\(\{ code: info\.sigunguCd, ym: yyyymm, types: typesKey, checkedAt: now\.toISOString\(\) \}\);/);
  /* 키 없음 · 응답 실패 분기는 빈 응답 기록보다 먼저 끝난다(continue) — 실패를 "비었다"로 적지 않는다 */
  const notConf = tx.indexOf("if (notConfigured) {");
  const failed = tx.indexOf("if (fetchFailed) {");
  const record = tx.indexOf("emptyAdd.push(");
  assert.ok(notConf > 0 && failed > notConf && record > failed);
  assert.match(tx.slice(failed, record), /result\.errors \+= 1;[\s\S]*?continue;/);
  /* 행이 생긴 곳은 닫는다 · 쓰기는 바뀐 게 있을 때만 */
  assert.equal((tx.match(/emptyDone\.push\(redoEntry\);/g) ?? []).length, 2);
  assert.match(tx, /if \(emptyAdd\.length > 0 \|\| emptyStore\.list\) \{\s*const before = await loadEmptyList\(\);\s*const merged = mergeEmptyChecks\(before, emptyAdd, emptyDone, now\);\s*if \(emptyAdd\.length > 0 \|\| merged\.length !== before\.length\) \{\s*await writeCursor\(MOLIT_EMPTY_KEY,/);
  /* 행을 만들지 않는다 — 빈 응답 경로에 upsert 없음 */
  const emptyBranch = tx.slice(tx.indexOf("if (mode !== \"live\" || rows.length === 0) {"), tx.indexOf("const dedup = new Map"));
  assert.doesNotMatch(emptyBranch, /upsert|market_transactions/);
  /* 로그 — 0 이면 예전 문구 그대로 · 있으면 빈곳기록= (빈응답= 집계를 흐리지 않는다) */
  assert.match(tx, /\(result\.knownEmpty > 0 \? ` 빈곳기록=\$\{result\.knownEmpty\}` : ""\)/);
  assert.match(tx, /knownEmpty: gapStats\.skipped/);
  assert.deepEqual(parseRunTally("slice=-1 시도=0 기존커버=0 빈응답=0 오류=0 같음=0행 빈곳기록=6"), { attempted: 0, failed: 0, empty: 0, covered: 0 });
});
