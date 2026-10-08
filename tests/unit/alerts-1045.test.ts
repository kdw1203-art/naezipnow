/* [1045] 운영 경보 해결 — 소유자 지시(2026-10-07, 관리 › 운영 화면 "심각 경보 3건 진행 중") "이것도 해결해줘".
 *
 * 잠그는 사실:
 *  ① 정비사업 사이트맵이 살아 있는 원천(서울시 결정 조서)을 싣고, <lastmod> 를 사실대로 다시 적는다.
 *  ② 결정고시 일자를 읽는다(시각이 붙은 꼴 — 예전엔 43,586건 전부 비어 있었다).
 *  ③ 회복 기록(ok)이 뒤따른 경보는 해소다 — 관리 화면 · 배너 · 경보 메일이 같은 판정을 쓴다.
 *  ④ 운영 DB 변경은 원장과 글자 하나까지 같은 파일로 남는다. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { upisAnnouncementToRecord, upisYmd } from "@/lib/seoul/upis";
import type { UpisRecord } from "@/lib/seoul/upis-display";
import {
  SEOUL_GU,
  SEOUL_GU_INDEX_HREF,
  digestGuRecords,
  guLastmod,
  seoulGuByName,
  seoulGuBySlug,
  seoulGuHref,
} from "@/lib/seoul/upis-gu";
import { alertTargetKey, criticalAlertNames, foldHealthAlerts, okCovers } from "@/lib/admin/health-alerts-fold";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── ② 결정고시 일자 ─────────────────────────────────────────────────────── */

test("upisYmd — 운영 API 가 내려 주는 시각 붙은 꼴을 읽는다(예전엔 전부 null)", () => {
  assert.equal(upisYmd("2026-07-24T09:00:00.000"), "2026-07-24", "운영 실측 꼴");
  assert.equal(upisYmd("20221205"), "2022-12-05");
  assert.equal(upisYmd("2022-12-05"), "2022-12-05");
  assert.equal(upisYmd("2022.12.05"), "2022-12-05");
  assert.equal(upisYmd("20260724090000"), "2026-07-24");
  assert.equal(upisYmd("2026-07-24 09:00"), "2026-07-24");
  for (const bad of ["", null, undefined, "202607", "2026-13-01", "20260732", "2026072409", "고시일 미상"]) {
    assert.equal(upisYmd(bad as string | null | undefined), null, String(bad));
  }
});

test("결정고시 행 — 고시일자가 채워진다", () => {
  const rec = upisAnnouncementToRecord({
    ANCMNT_MNG_CD: "99999NTC202609100006",
    PRJC_CD: "11000PPL202609100006",
    ANCMNT_NO: "2026-392",
    ANCMNT_YMD: "2026-07-24T09:00:00.000",
    TTL: "지정 및 지형도면등의 고시",
  });
  assert.equal(rec?.ancmnt_ymd, "2026-07-24");
  assert.equal(upisAnnouncementToRecord({ ANCMNT_MNG_CD: "X1", ANCMNT_YMD: "미상" })?.ancmnt_ymd, null, "못 읽으면 지어내지 않는다");
  assert.equal(upisAnnouncementToRecord({ ANCMNT_YMD: "2026-07-24" }), null, "기본키 없는 행은 버린다");
});

/* ── ① 자치구 화면 · 사이트맵 ─────────────────────────────────────────────── */

test("서울 자치구 25곳 — 주소 낱말은 지역 카탈로그 id · 겹치지 않는다", () => {
  assert.equal(SEOUL_GU.length, 25);
  assert.equal(new Set(SEOUL_GU.map((g) => g.slug)).size, 25);
  assert.equal(new Set(SEOUL_GU.map((g) => g.name)).size, 25);
  for (const g of SEOUL_GU) {
    assert.match(g.slug, /^[a-z-]+$/, g.slug);
    assert.match(g.name, /구$/, g.name);
  }
  assert.deepEqual(seoulGuBySlug("gangnam"), { slug: "gangnam", name: "강남구" });
  assert.equal(seoulGuByName("마포구")?.slug, "mapo");
  assert.equal(seoulGuBySlug("seongnam-bundang"), null, "서울 밖은 없다");
  assert.equal(seoulGuBySlug(""), null);
  assert.equal(seoulGuByName("구 미상"), null);
  assert.equal(seoulGuHref("gangnam"), "/redevelopment/seoul/gangnam");
  assert.equal(SEOUL_GU_INDEX_HREF, "/redevelopment/seoul");
});

function rec(over: Partial<UpisRecord>): UpisRecord {
  return {
    rptMngCd: "11680AGZ202605190001",
    service: "upisRebuild",
    prjcCd: "P1",
    rptType: "신설",
    lclsf: null,
    mclsf: "정비구역",
    sclsf: "재건축사업구역",
    pstnNm: "강남구 일원동 735번지 일원",
    rgnNm: "일원가람아파트",
    areaExs: 0,
    areaChgAftr: 41144.7,
    dcsnAncmntMngCd: null,
    sigungu: "강남구",
    emd: "일원동",
    codeDate: "2026-05-19",
    ...over,
  };
}

test("digestGuRecords — 손에 든 행에서만 센다", () => {
  const d = digestGuRecords([
    rec({}),
    rec({ rptMngCd: "b", rptType: "변경", codeDate: "2026-04-15", emd: "도곡동" }),
    rec({ rptMngCd: "c", service: "upisDistUnitPlan", prjcCd: "P2", rptType: "변경", codeDate: "2024-01-02", emd: null }),
    rec({ rptMngCd: "d", service: "upisUrbanDev", prjcCd: null, rptType: null, codeDate: null, emd: "일원동" }),
    rec({ rptMngCd: "e", prjcCd: "P2", codeDate: "날짜아님" }),
  ]);
  assert.equal(d.total, 5);
  assert.equal(d.zones, 2, "프로젝트 코드 없는 행은 사업 수에 넣지 않는다");
  assert.deepEqual(d.byService, { upisRebuild: 3, upisUrbanDev: 1, upisDistUnitPlan: 1 });
  assert.deepEqual(d.byType, [
    { label: "변경", n: 2 },
    { label: "신설", n: 2 },
  ]);
  assert.deepEqual(d.byEmd[0], { label: "일원동", n: 3 });
  assert.equal(d.lastDate, "2026-05-19");
  assert.equal(d.firstDate, "2024-01-02", "꼴이 틀린 날짜는 보지 않는다");
  assert.deepEqual(digestGuRecords([]).lastDate, null);
});

test("guLastmod — 가장 최근 결정일의 한국 시간 자정 · 없으면 null(추측한 날짜 없음)", () => {
  assert.equal(guLastmod("2026-09-09")?.toISOString(), "2026-09-08T15:00:00.000Z");
  for (const bad of [null, undefined, "", "2026-9-9", "20260909", "어제"]) assert.equal(guLastmod(bad), null, String(bad));
});

test("정비사업 사이트맵 — 자치구 화면을 싣고 lastmod 를 다시 적는다 · 적재 시각은 쓰지 않는다", () => {
  const c = code("lib/seo/build-sitemap.ts");
  const i = c.indexOf("export async function loadRedevelopmentEntries");
  const fn = c.slice(i, c.indexOf("export function loadGlossaryEntries", i));
  assert.ok(i > 0 && fn.length > 200);
  assert.match(fn, /listUpisGuLastDates\(SEOUL_GU\.map/);
  assert.match(fn, /guLastmod\(lastDates\.get\(g\.name\)\)/);
  assert.match(fn, /p\.updatedAt \? new Date\(p\.updatedAt\)/, "구역 40곳 = 행을 정리한 시점");
  assert.equal((fn.match(/lastModified/g) ?? []).length, 3, "목차 · 자치구 · 구역");
  assert.ok(!fn.includes("fetched"), "적재 시각 금지");
  /* 조회는 읽기 전용 클라이언트 · 구마다 맨 위 한 행 */
  const store = code("lib/seoul/upis-store.ts");
  assert.match(store, /export async function listUpisGuLastDates/);
  assert.match(store, /export async function listUpisRecordsForGu/);
  assert.ok(!store.includes("getServiceSupabase"), "공개 읽기 표 — 서비스 키를 쓰지 않는다");
});

test("자치구 화면 — 25곳만 받는다(없는 구는 정적 404) · 빌드 중 조회 실패로 배포를 깨지 않는다 · 원문 출처 표기", () => {
  const page = code("app/redevelopment/seoul/[gu]/page.tsx");
  /* 요청 때 만드는 방식(빈 목록 + notFound())은 운영에서 없는 주소에 200 을 준다 — 낱말이 정해져 있으니 목록으로 닫는다 */
  assert.match(page, /export const dynamicParams = false;/);
  assert.match(page, /return SEOUL_GU\.map\(\(g\) => \(\{ gu: g\.slug \}\)\);/);
  assert.match(page, /if \(!gu\) notFound\(\);/);
  assert.match(page, /if \(!IS_BUILD_PHASE\) throw e;/, "운영 재검증 실패는 던져서 직전 화면을 지킨다");
  assert.match(page, /listUpisRecordsForGu\(gu\.name\)/);
  assert.match(page, /UPIS_SOURCE_URL/);
  assert.match(page, /참고용\(법적 효력 없음\)/);
  assert.ok(!page.includes("btn-primary"), "채움 파랑 버튼 없음(조서 검색은 테두리형)");
  assert.ok(!page.includes('"use client"'), "서버 조각만 — 번들에 얹히는 것 0");
  const index = code("app/redevelopment/seoul/page.tsx");
  assert.match(index, /SEOUL_GU\.map/);
  assert.match(index, /catch \(e\)/, "목차는 빌드 때 만들어진다 — 조회 실패로 배포를 깨지 않는다");
  /* 들어가는 길: 정비사업 지도의 조서 칸 · 지역 화면 */
  assert.match(code("app/redevelopment/SeoulPlanSection.tsx"), /seoulGuHref\(g\.slug\)/);
  assert.match(code("app/region/[id]/page.tsx"), /seoulGuHref\(seoulGuByName\(shortName\)!\.slug\)/);
});

/* ── ③ 회복 기록 ─────────────────────────────────────────────────────────── */

test("alertTargetKey — 심각도 · 해시 · 숫자 값만 뺀다(운영 기록 실측 꼴)", () => {
  const k = alertTargetKey;
  assert.equal(k("… #sig:smsrc|t=/sitemap-redevelopment.xml|k=dead_source|sev=critical"), "smsrc|t=/sitemap-redevelopment.xml|k=dead_source");
  assert.equal(k("… #sig:path=/sitemap-complexes.xml|sev=ok|drop=0.0"), "path=/sitemap-complexes.xml");
  assert.equal(k("… #sig:path=/sitemap-complexes.xml|sev=critical|drop=22.7"), "path=/sitemap-complexes.xml");
  assert.equal(k("… #sig:sm=/sitemap-complexes.xml|lost=9688|roll=0|sev=critical|h=3f9b7c60"), "sm=/sitemap-complexes.xml");
  assert.equal(k("… #sig:unsub|kind=ix|n=6|h=d673b210|sev=warn"), "unsub|kind=ix");
  assert.equal(k("… #sig:unsub|kind=ix|n=0|h=none|sev=ok"), "unsub|kind=ix");
  assert.equal(k("… #sig:etltr|sev=warn|src=molit"), "etltr|src=molit");
  assert.equal(k("… #sig:page=/analysis/ai/ai-prediction|metric=CLS|sev=ok|poor=0.0"), "page=/analysis/ai/ai-prediction|metric=CLS");
  assert.equal(k("… #sig:thin|sev=ok|b=1"), "thin");
  assert.equal(k("https://naezipnow.com/sitemap-complexes.xml → URL 22726건"), "", "서명 없음");
  assert.equal(k(null), "");
  /* 모르는 토막은 남긴다 — 잘못 빼면 남의 회복 기록이 경보를 닫는다 */
  assert.equal(k("#sig:x|zone=a|sev=warn"), "x|zone=a");
});

test("okCovers — 같은 대상이거나 ok 가 더 넓을 때만", () => {
  assert.equal(okCovers("etltr", "etltr|src=molit"), true);
  assert.equal(okCovers("etltr", "etltr"), true);
  assert.equal(okCovers("etltr|src=molit", "etltr"), false, "좁은 ok 가 넓은 경보를 닫지 않는다");
  assert.equal(okCovers("unsub|kind=ix", "unsub|kind=unk"), false);
  assert.equal(okCovers("thin", "thinner"), false, "토막 경계");
  assert.equal(okCovers("", "x"), false);
});

const NOW = new Date("2026-10-07T15:40:00Z");
const row = (check: string, sev: string, at: string, detail = "") => ({ check_name: check, severity: sev, checked_at: at, detail, age_hours: null });

test("foldHealthAlerts — 2026-10-07 소유자 화면: seo.loc_drift 는 7분 뒤 ok 가 남았다 → 해소", () => {
  const rows = [
    row("seo.thin_content", "ok", "2026-10-06T22:54:00Z", "회복 #sig:thin|sev=ok|b=1"),
    row("seo.loc_drift", "ok", "2026-10-06T22:42:42Z", "조건 해소 #sig:path=/sitemap-complexes.xml|sev=ok|drop=0.0"),
    row("seo.sitemap_source", "critical", "2026-10-06T22:42:42Z", "lastmod #sig:smsrc|t=/sitemap-redevelopment.xml|k=lastmod_vanish|sev=critical"),
    row("seo.sitemap_source", "critical", "2026-10-06T22:42:42Z", "dead #sig:smsrc|t=/sitemap-redevelopment.xml|k=dead_source|sev=critical"),
    row("seo.loc_drift", "critical", "2026-10-06T22:35:00Z", "감소 #sig:path=/sitemap-complexes.xml|sev=critical|drop=22.7"),
    row("seo.sitemap_url", "critical", "2026-10-06T22:24:00Z", "은퇴 #sig:sm=/sitemap-complexes.xml|lost=9688|roll=0|sev=critical|h=3f9b7c60"),
    row("seo.thin_content", "warn", "2026-10-05T05:21:10Z", "얇은 #sig:thin|sev=warn|b=7"),
  ];
  const out = foldHealthAlerts(rows, NOW);
  assert.ok(out.every((a) => a.severity !== "ok"), "ok 줄은 경보로 오르지 않는다");
  const drift = out.find((a) => a.checkName === "seo.loc_drift");
  assert.equal(drift?.active, false);
  assert.equal(drift?.recoveredAt, "2026-10-06T22:42:42Z");
  const thin = out.find((a) => a.checkName === "seo.thin_content");
  assert.equal(thin?.recoveredAt, "2026-10-06T22:54:00Z");
  /* 한 검사의 두 문제는 두 줄 */
  const src = out.filter((a) => a.checkName === "seo.sitemap_source");
  assert.equal(src.length, 2);
  assert.ok(src.every((a) => a.active && a.recoveredAt === null && a.count === 1));
  /* 회복 기록이 없는 경보는 예전대로 시간 창(일 단위 27h) */
  assert.equal(out.find((a) => a.checkName === "seo.sitemap_url")?.active, true);
  const criticals = out.filter((a) => a.severity === "critical" && a.active);
  assert.deepEqual(criticalAlertNames(criticals), ["seo.sitemap_source(2)", "seo.sitemap_url"]);
});

test("foldHealthAlerts — ok 가 경보보다 먼저면 닫지 않는다 · 다시 울리면 다시 진행 중", () => {
  const rows = [
    row("seo.loc_drift", "critical", "2026-10-07T14:00:00Z", "#sig:path=/a.xml|sev=critical|drop=30.1"),
    row("seo.loc_drift", "ok", "2026-10-06T22:42:42Z", "#sig:path=/a.xml|sev=ok|drop=0.0"),
    row("seo.loc_drift", "critical", "2026-10-06T22:35:00Z", "#sig:path=/a.xml|sev=critical|drop=22.7"),
  ];
  const [a] = foldHealthAlerts(rows, NOW);
  assert.equal(a.active, true);
  assert.equal(a.recoveredAt, null);
  assert.equal(a.count, 2);
  /* 다른 대상의 ok 는 닫지 않는다 */
  const other = foldHealthAlerts(
    [row("seo.loc_drift", "ok", "2026-10-07T15:00:00Z", "#sig:path=/b.xml|sev=ok|drop=0.0"), row("seo.loc_drift", "critical", "2026-10-07T14:00:00Z", "#sig:path=/a.xml|sev=critical|drop=30.1")],
    NOW,
  );
  assert.equal(other[0].active, true);
  /* 넓은 ok(etltr)는 소스별 경보를 닫는다 */
  const etl = foldHealthAlerts(
    [row("app.etl_troubled", "ok", "2026-10-07T11:40:00Z", "회복 #sig:etltr|sev=ok"), row("app.etl_troubled", "warn", "2026-10-07T03:40:00Z", "#sig:etltr|sev=warn|src=molit")],
    NOW,
  );
  assert.equal(etl[0].active, false);
  assert.equal(etl[0].recoveredAt, "2026-10-07T11:40:00Z");
  /* 서명 없는 ok 는 아무것도 닫지 않고, 서명 없는 경보는 예전대로 검사|심각도 단위 */
  const bare = foldHealthAlerts([row("x", "ok", "2026-10-07T15:00:00Z", "회복"), row("x", "critical", "2026-10-07T14:00:00Z", "문제"), row("x", "warn", "2026-10-07T13:00:00Z", "주의")], NOW);
  assert.deepEqual(bare.map((b) => `${b.severity}|${b.active}`), ["critical|true", "warn|true"]);
});

test("관리 화면 · 배너 · 경보 메일이 같은 판정을 쓴다", () => {
  assert.match(code("app/admin/layout.tsx"), /criticalAlertNames\(criticals\)/);
  const mail = code("app/api/cron/alert-email/route.ts");
  assert.match(mail, /foldHealthAlerts\(/);
  assert.match(mail, /a\.severity === "critical" && a\.active/);
  assert.ok(!mail.includes('.filter((r) => String(r.severity ?? "") === "critical")'), "24시간 critical 줄 전부를 싣던 옛 규칙 없음");
  assert.match(code("app/admin/ops/page.tsx"), /a\.recoveredAt/);
});

/* ── ④ 운영 DB 변경의 미러 ───────────────────────────────────────────────── */

test("1045 마이그레이션 — 원장과 같은 글자(md5) · 끝 줄바꿈 없음 · 표를 지우는 문장 없음", () => {
  const p = "supabase/migrations/20261007153942_1045_sitemap_lastmod_cadence_and_roster_recheck.sql";
  const sql = read(p);
  assert.equal(createHash("md5").update(sql, "utf8").digest("hex"), "7f7d612586130afcd7d4b73ccd3ca6d0");
  assert.ok(!sql.endsWith("\n"));
  assert.ok(!/\b(delete\s+from|truncate)\b/i.test(sql), "행을 지우지 않는다");
  assert.match(sql, /create table if not exists ops\.sitemap_lastmod_cadence/);
  assert.match(sql, /'\/sitemap-redevelopment\.xml', 1080, 1800/);
  assert.match(sql, /revoke all on ops\.sitemap_lastmod_cadence from public, anon, authenticated;/);
  /* 함수는 통째로 다시 적지 않는다 — 살아 있는 정의에 한 군데만 끼워 넣는다(다른 손이 고친 부분을 덮어쓰지 않게) */
  assert.match(sql, /pg_get_functiondef\(p\.oid\)/);
  assert.match(sql, /if position\('sitemap_lastmod_cadence' in v\) > 0 then\s+return;/);
});
