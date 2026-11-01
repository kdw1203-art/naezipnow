/* [1099] 소유자 2026-11-01 운영 경보 캡처(critical 7종 진행 중 · 37회씩) "개선 작업을 해 줘".
 *  원인(DB 실측 ops.health_alert_log · market_ingest_log): 10-22 19:54 ~ 11-01 00:50 호스팅 정지(DEPLOYMENT_PAUSED) 동안 Vercel 크론 · GitHub Actions
 *  ETL 이 전부 503 → ETL 7종 · 사이트맵 · 알림 스윕 경보. 재개 뒤 Vercel 크론(apt-master · apt-detail · geocode · reb · outbox)은 스스로 회복(ok 기록).
 *  남은 것: ① molit 당월(202611) 빈 응답 16 · 적재 0 — 전월은 GitHub ETL 만 받는데 그 잡이 10-22 뒤 안 돌았다 → 크론이 당월이 비면 전월을 이어받는다.
 *  ② GitHub Actions 만 돌리던 plan-expiry · points-expiry 스윕 → Vercel 크론도 돈다(결제 만료는 하루를 못 기다린다).
 *  ③ KV PING 실패 279h — 이유(http_401 · 429 · timeout)를 /api/health 가 말한다. ④ 운영 콘솔: 정지 구간에 시작된 경보를 한 줄로 묶어 설명. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { outageWindowOf, type HealthAlertRow } from "../../lib/admin/health-alerts-fold";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const row = (o: Partial<HealthAlertRow> & { checkName: string }): HealthAlertRow => ({
  severity: "critical",
  detail: null,
  ageHours: null,
  checkedAt: "2026-11-01T11:30:00Z",
  count: 1,
  active: true,
  sinceLastHours: 1,
  firstAt: "2026-10-23T00:30:00Z",
  recoveredAt: null,
  target: "",
  ...o,
});

test("정지 구간 — 사이트 탐침 경보의 첫 발생~회복 확인을 구간으로 · 그 구간에 시작된 경보만 표식 · 탐침 자체·구간 밖은 제외", () => {
  const alerts: HealthAlertRow[] = [
    row({ checkName: "site.http_probe", firstAt: "2026-10-22T11:00:00Z", recoveredAt: "2026-11-01T02:33:00Z", active: false }),
    row({ checkName: "app.health_endpoint", firstAt: "2026-10-22T13:25:00Z", recoveredAt: "2026-11-01T01:33:00Z", active: false }),
    row({ checkName: "ingest.molit", firstAt: "2026-10-24T00:30:00Z" }),
    row({ checkName: "alerts.sweep_heartbeat", firstAt: "2026-10-23T12:30:00Z" }),
    row({ checkName: "ingest.molit", firstAt: "2026-10-24T00:30:00Z", severity: "warn" }),
    /* 구간 뒤에 시작 — 다른 원인 */
    row({ checkName: "app.health_check_false", firstAt: "2026-11-01T05:00:00Z", severity: "warn" }),
    /* 구간 2시간 앞까지는 같은 원인으로 본다(탐침 주기) */
    row({ checkName: "ingest.onbid", firstAt: "2026-10-22T09:30:00Z" }),
    row({ checkName: "seo.asset", firstAt: "2026-10-01T00:00:00Z" }),
  ];
  const w = outageWindowOf(alerts);
  assert.ok(w);
  assert.equal(w.from, "2026-10-22T11:00:00Z");
  assert.equal(w.to, "2026-11-01T02:33:00Z", "가장 늦은 회복 확인");
  assert.deepEqual(w.markedChecks, ["ingest.molit", "alerts.sweep_heartbeat", "ingest.onbid"]);
  /* 탐침이 아직 진행 중이면 구간 끝은 없음(진행 중) */
  const open = outageWindowOf([row({ checkName: "site.outage", firstAt: "2026-11-01T00:00:00Z" }), row({ checkName: "ingest.ecos", firstAt: "2026-11-01T03:00:00Z" })]);
  assert.equal(open?.to, null);
  assert.deepEqual(open?.markedChecks, ["ingest.ecos"]);
  assert.equal(outageWindowOf([row({ checkName: "ingest.ecos" })]), null, "탐침 경보가 없으면 구간 없음");
  const ops = strip(read("app/admin/ops/page.tsx"));
  assert.match(ops, /const outage = outageWindowOf\(alerts\);/);
  assert.match(ops, /\{outage && outage\.markedChecks\.length > 0 && \(/);
  assert.match(ops, /\{outage\?\.markedChecks\.includes\(a\.checkName\) && \(/);
});

test("molit 크론 — 자동 당월이 전부 빈 응답(적재 0 · 기존 커버 0)이면 같은 슬라이스로 전월을 이어받는다 · 수동 월·gaps 는 그대로", () => {
  const r = strip(read("app/api/cron/molit-transactions-ingest/route.ts"));
  assert.match(r, /import \{ currentTargetMonth, defaultTargetMonth, ingestMolitTransactions, type MolitIngestResult \} from "@\/lib\/market\/molit-transactions";/);
  assert.match(r, /run\.state === "ok" &&\s*!yyyymm &&\s*!gapsFirst &&\s*run\.value\.yyyymm === currentTargetMonth\(\) &&\s*run\.value\.attempted > 0 &&\s*run\.value\.inserted === 0 &&\s*run\.value\.alreadyCovered === 0 &&\s*run\.value\.empty === run\.value\.attempted/);
  assert.match(r, /const remaining = CRON_WORK_BUDGET_MS - \(Date\.now\(\) - startedAt\);\s*if \(remaining > 30_000\) \{\s*fallbackMonth = defaultTargetMonth\(\);/);
  assert.match(r, /if \(second\.state === "ok"\) run = second;/);
  assert.match(r, /\.\.\.\(fallbackMonth \? \{ fallbackMonth \} : \{\}\),/);
  /* 라우트 파일 export 규칙 */
  const exports = [...r.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]);
  for (const e of exports) assert.ok(["GET", "POST", "runtime", "dynamic", "maxDuration"].includes(e), e);
});

test("Vercel 크론 — plan-expiry · points-expiry 스윕이 GitHub Actions 와 별개로 하루 1회 돈다", () => {
  const v = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
  const plan = v.crons.find((c) => c.path === "/api/cron/plan-expiry-sweep");
  const points = v.crons.find((c) => c.path === "/api/cron/points-expiry-sweep");
  assert.equal(plan?.schedule, "25 3 * * *");
  assert.equal(points?.schedule, "35 3 * * *");
  assert.ok(v.crons.length <= 40, "Pro 플랜 크론 상한 40");
  for (const p of ["app/api/cron/plan-expiry-sweep/route.ts", "app/api/cron/points-expiry-sweep/route.ts"]) {
    assert.match(read(p), /authorizeCron\(req\)/, `${p}: Vercel 크론(Authorization: Bearer) 도 받는 공용 인가`);
  }
});

test("/api/health — KV 실패 이유 한 낱말(키 재료 없음)", () => {
  const kv = strip(read("lib/kv/rest.ts"));
  assert.match(kv, /export async function kvPingDetail\(timeoutMs = DEFAULT_TIMEOUT_MS\): Promise<\{ ok: boolean; reason: string \| null \}>/);
  assert.match(kv, /if \(!cfg\) return \{ ok: false, reason: "unconfigured" \};/);
  assert.match(kv, /if \(!res\.ok\) return \{ ok: false, reason: `http_\$\{res\.status\}` \};/);
  assert.match(kv, /reason: name === "TimeoutError" \|\| name === "AbortError" \? "timeout" : "network"/);
  const h = strip(read("app/api/health/route.ts"));
  assert.match(h, /kv: \{ configured: boolean; ok: boolean; reason: string \| null \};/);
  assert.match(h, /kv: \{ configured: kvConfigured, ok: kvOk, reason: kvReason \},/);
  assert.doesNotMatch(h, /kvPipeline/);
});
