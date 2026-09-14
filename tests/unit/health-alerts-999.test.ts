import test from "node:test";
import assert from "node:assert/strict";
import { activeWindowHours, foldHealthAlerts } from "@/lib/admin/health-alerts-fold";

/* [999] 운영 경보 판 — "울린 것"만 쌓이는 로그에서 진행 중/해소를 가른다.
   고정값은 2026-09-14 05:50 UTC 운영 로그 실측 모양을 따른다. */

const NOW = new Date("2026-09-14T05:50:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function row(check: string, sev: string, at: string, detail = "") {
  return { check_name: check, severity: sev, checked_at: at, detail, age_hours: 1 };
}

test("activeWindowHours — 시간 단위 검사는 3h, 일 단위(또는 1건뿐)는 27h", () => {
  assert.equal(activeWindowHours([1, 1, 1]), 3);
  assert.equal(activeWindowHours([6, 6]), 27, "6시간 스로틀 검사는 일 단위로 본다");
  assert.equal(activeWindowHours([24, 24]), 27);
  assert.equal(activeWindowHours([]), 27, "1건뿐이면 보수적으로 27h");
  assert.equal(activeWindowHours([0, NaN, 1]), 3, "0·NaN 간격은 무시");
});

test("foldHealthAlerts — 매시 울리던 watchdog_self 는 1시간 전이 마지막이면 진행 중", () => {
  const rows = [0, 1, 2, 3, 4, 5].map((h) => row("ops.watchdog_self", "critical", hoursAgo(1 + h)));
  const [a] = foldHealthAlerts(rows, NOW);
  assert.equal(a.checkName, "ops.watchdog_self");
  assert.equal(a.count, 6);
  assert.equal(a.active, true);
  assert.equal(a.sinceLastHours, 1);
});

test("foldHealthAlerts — 매시 울리다 5일 전에 그친 matview 경보는 해소", () => {
  const rows = [0, 1, 2, 3].map((h) => row("cron.matview-warm-daily", "critical", hoursAgo(108 + h)));
  const [a] = foldHealthAlerts(rows, NOW);
  assert.equal(a.active, false);
  assert.equal(a.sinceLastHours, 108);
});

test("foldHealthAlerts — 일 단위 검사(seo.asset)는 어제 저녁 1건이어도 진행 중, 3일 전이면 해소", () => {
  const [fresh] = foldHealthAlerts([row("seo.asset", "critical", hoursAgo(8))], NOW);
  assert.equal(fresh.active, true, "1건뿐(주기 모름) → 27h 창");
  const [stale] = foldHealthAlerts([row("seo.cwv_page", "critical", hoursAgo(80))], NOW);
  assert.equal(stale.active, false);
});

test("foldHealthAlerts — 정렬: 진행 중 먼저, 그 안에서 critical → warn, 최근 순 · 접기는 검사|심각도 단위", () => {
  const rows = [
    row("ops.cron_job", "warn", hoursAgo(4)), // 매시 검사인데 4h 전이 마지막 → 해소
    row("ops.cron_job", "warn", hoursAgo(5)),
    row("ops.cron_job", "critical", hoursAgo(5.7)), // 마지막 5.7h 전, 매시 → 해소
    row("ops.cron_job", "critical", hoursAgo(6.7)),
    row("ops.watchdog_self", "critical", hoursAgo(1)), // 진행 중 critical
    row("ops.watchdog_self", "critical", hoursAgo(2)),
    row("ingest.apt_master_ok", "critical", hoursAgo(10)), // 매시 울리다 10h 전에 그침 → 해소
    row("ingest.apt_master_ok", "critical", hoursAgo(11)),
  ];
  const out = foldHealthAlerts(rows, NOW);
  assert.deepEqual(
    out.map((a) => `${a.checkName}|${a.severity}|${a.active ? "on" : "off"}`),
    [
      "ops.watchdog_self|critical|on",
      "ops.cron_job|critical|off",
      "ingest.apt_master_ok|critical|off",
      "ops.cron_job|warn|off",
    ],
  );
  /* 해소 critical 둘의 순서 = 마지막 발생이 더 최근인 것(5.7h) 먼저 */
  const offCrit = out.filter((a) => !a.active && a.severity === "critical").map((a) => a.checkName);
  assert.deepEqual(offCrit, ["ops.cron_job", "ingest.apt_master_ok"]);
  /* warn 4h 전인데 매시 검사(간격 1h) → 3h 창 밖 → 해소 */
  assert.equal(out.find((a) => a.severity === "warn")?.active, false);
});

test("foldHealthAlerts — 첫 발생·마지막 발생·limit", () => {
  const rows = [0, 1, 2].map((h) => row("x", "warn", hoursAgo(h + 1), `d${h}`));
  rows.push(row("y", "warn", hoursAgo(50)));
  const out = foldHealthAlerts(rows, NOW, 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].checkName, "x");
  assert.equal(out[0].detail, "d0", "최신 행의 detail 이 대표");
  assert.equal(out[0].checkedAt, hoursAgo(1));
  assert.equal(out[0].firstAt, hoursAgo(3));
});
