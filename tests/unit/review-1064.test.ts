/* [1064] 레일포털(철도산업정보센터) 도시철도 연동 — 소유자가 승인 메일을 전달(2026-10-12). 잠그는 사실:
 *  W1 주소·키 — 주소는 승인받은 서비스·오퍼레이션만, 키는 메시지에 싣지 않는다(가린 꼴).
 *  W2 응답 읽기 — 규격을 모르는 응답에서 줄·결과 코드·열 이름을 꺼낸다(모양이 바뀌어도 죽지 않는다).
 *  W3 값 규칙 — 역 코드 없으면 버림 · 한국 밖 좌표 버림 · 시각 파싱 · 첫차·막차 요약.
 *  W4 하루 1회 — 돌아가며 받기(커서) · 크론은 ETL 하루 한 번 · 키 없으면 skipped.
 *  W5 키 취급 — 저장소 어디에도 키 값이 적혀 있지 않다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KRIC_BASE,
  isKricOk,
  kricUrl,
  normalizeStationRow,
  normalizeTransfers,
  parseKricPayload,
  redactUrl,
  rollingSlice,
  summarizeTimetable,
  toMinutes,
} from "@/lib/rail/kric-parse";

const read = (p: string) => readFileSync(p, "utf8");

test("W1 주소 — 승인받은 서비스·오퍼레이션 · 키는 가려서 적는다", () => {
  const url = kricUrl({ service: "trainUseInfo", operation: "subwayRouteInfo" }, "SECRET-KEY");
  assert.ok(url.startsWith(`${KRIC_BASE}/trainUseInfo/subwayRouteInfo?`), url);
  assert.match(url, /format=json/);
  assert.match(url, /serviceKey=SECRET-KEY/);
  /* 오류 메시지·로그에 실리는 꼴에는 키가 없다 */
  const safe = redactUrl(url);
  assert.doesNotMatch(safe, /SECRET-KEY/);
  assert.match(safe, /serviceKey=\*\*\*/);
  /* 빈 파라미터는 붙이지 않는다(역 코드가 없는 노선 줄이 빈 질의를 보내지 않게) */
  const withParams = kricUrl({ service: "trainUseInfo", operation: "subwayTimetable" }, "k", { stinCd: "133", lnCd: "" });
  assert.match(withParams, /stinCd=133/);
  assert.doesNotMatch(withParams, /lnCd=/);
});

test("W2 응답 — 어느 깊이에 있든 줄 묶음을 찾고 결과 코드·열 이름을 꺼낸다", () => {
  const nested = { header: { resultCode: "00", resultMsg: "NORMAL" }, body: { items: { item: [{ stinCd: "133", stinNm: "서울역" }] } } };
  const p = parseKricPayload(nested);
  assert.equal(p.rows.length, 1);
  assert.equal(p.code, "00");
  assert.equal(p.message, "NORMAL");
  assert.deepEqual(p.columns, ["stinCd", "stinNm"]);
  assert.equal(isKricOk(p), true);
  /* 문자열(본문)도 받는다 · JSON 이 아니면 메시지로 남기고 줄은 0 */
  assert.equal(parseKricPayload('{"rows":[{"a":1}]}').rows.length, 1);
  const bad = parseKricPayload("<html>error</html>");
  assert.equal(bad.rows.length, 0);
  assert.match(String(bad.message), /html/);
  assert.equal(isKricOk(bad), false);
  /* 코드가 없으면 줄 수로 본다(공급자마다 코드 유무가 다르다) */
  assert.equal(isKricOk(parseKricPayload([{ a: 1 }])), true);
  /* 실패 코드는 실패 */
  assert.equal(isKricOk(parseKricPayload({ resultCode: "30", rows: [] })), false);
});

test("W3 값 — 역 코드 없으면 버리고, 한국 밖 좌표는 쓰지 않는다", () => {
  assert.equal(normalizeStationRow({ stinNm: "이름만" }), null);
  const ok = normalizeStationRow({ stinCd: "133", stinNm: "서울역", lnCd: "1", lnNm: "1호선", stinLat: "37.5546", stinLot: "126.9707", stinConsOrdr: "3" });
  assert.equal(ok?.stinNm, "서울역");
  assert.equal(ok?.lat, 37.5546);
  assert.equal(ok?.order, 3);
  /* (0,0) · 자리바꿈은 지도에 올리지 않는다 */
  assert.equal(normalizeStationRow({ stinCd: "1", lat: "0", lon: "0" })?.lat, null);
  assert.equal(normalizeStationRow({ stinCd: "1", lat: "126.97", lon: "37.55" })?.lat, null);

  const transfers = normalizeTransfers([
    { stinCd: "222", stinNm: "강남", trnsitLnNm: "2호선" },
    { stinCd: "222", stinNm: "강남", trnsitLnNm: "신분당선" },
    { stinCd: "222", stinNm: "강남", trnsitLnNm: "2호선" },
    { stinNm: "코드없음" },
  ]);
  assert.equal(transfers.length, 1);
  assert.deepEqual(transfers[0].lines, ["2호선", "신분당선"]);

  assert.equal(toMinutes("053000"), 5 * 60 + 30);
  assert.equal(toMinutes("05:30"), 330);
  assert.equal(toMinutes("25:10"), 25 * 60 + 10); // 다음 날 새벽 표기를 그대로
  assert.equal(toMinutes(""), null);
  assert.equal(toMinutes("x"), null);

  const sum = summarizeTimetable([
    { dayCd: "8", dptTm: "053000" },
    { dayCd: "8", dptTm: "240500" },
    { dayCd: "8", arvTm: "120000" },
    { dayCd: "7", dptTm: "060000" },
    { dayCd: "8", dptTm: "" },
  ]);
  assert.equal(sum.byDay["8"].first, "05:30");
  assert.equal(sum.byDay["8"].last, "24:05");
  assert.equal(sum.byDay["8"].trains, 3);
  assert.equal(sum.byDay["7"].trains, 1);
});

test("W4 하루 1회 — 돌아가며 받기 · 크론은 ETL 에서 하루 한 번 · 키 없으면 건너뜀", () => {
  const all = ["a", "b", "c", "d", "e"];
  const r1 = rollingSlice(all, 0, 2);
  assert.deepEqual(r1.slice, ["a", "b"]);
  assert.equal(r1.nextCursor, 2);
  const r2 = rollingSlice(all, 4, 3); // 끝에서 처음으로 돌아간다
  assert.deepEqual(r2.slice, ["e", "a", "b"]);
  assert.equal(r2.nextCursor, 2);
  assert.deepEqual(rollingSlice([], 0, 10).slice, []);

  const store = read("lib/rail/store.ts");
  assert.match(store, /TIMETABLE_PER_RUN = 60/);
  assert.match(store, /kv_store_99a854cb/); // 표를 새로 만들지 않는다(마이그레이션 없음)
  const route = read("app/api/cron/rail-sync/route.ts");
  assert.match(route, /authorizeCron/);
  assert.match(route, /skipped: "no-key"/);
  const etl = read(".github/workflows/etl.yml");
  assert.match(etl, /rail-sync/);
  /* 하루 한 번 — 호출 줄이 하나뿐이다(반복 호출 금지) */
  assert.equal((etl.match(/cron\/rail-sync/g) ?? []).length, 1);
  const env = read("scripts/validate-env.mjs");
  assert.match(env, /KRIC_SERVICE_KEY/);
});

test("W5 키 — 저장소에 값이 적혀 있지 않다", () => {
  for (const p of ["lib/rail/kric-parse.ts", "lib/rail/store.ts", "app/api/cron/rail-sync/route.ts", "app/admin/data/page.tsx", "docs/release-1064.md"]) {
    const src = read(p);
    /* bcrypt 꼴($2a$…)·긴 base64 키가 코드·문서에 박히지 않았는지 */
    assert.doesNotMatch(src, /\$2[aby]\$\d\d\$/, `${p} 에 키 값이 있다`);
  }
  /* 키는 환경변수에서만 읽는다 */
  assert.match(read("lib/rail/store.ts"), /process\.env\.KRIC_SERVICE_KEY/);
});
