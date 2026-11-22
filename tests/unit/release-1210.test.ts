/* [1210] 제안 50가지 중 여기서 한 것 — 설정 필요 경보 · 상세 원천 없음 · 노트 한 화면 기본 · 첫 입력 · AI 한 줄 판정 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSetupNeededAlert } from "@/lib/admin/health-alerts-fold";
import { VWORLD_ZONE_KEYWORDS, zoneCodeFromName, isRedevZoneName } from "@/lib/redevelopment/vworld-zone-shapes";

const read = (p: string) => readFileSync(p, "utf8");

test("설정 필요 — 키 미설정 · 활용신청 · 무효 키만, 진짜 장애는 아니다", () => {
  assert.equal(isSetupNeededAlert("rail 7일 성공 0 · skipped 7건 · 사유: KRIC_SERVICE_KEY 미설정"), true);
  assert.equal(isSetupNeededAlert("kapt-mgmt-fee · 사유: AptCmnuseManageCostServiceV3 활용신청 필요(HTTP 403)"), true);
  assert.equal(isSetupNeededAlert("kosis · 6개 표 모두 KOSIS err 11 유효하지 않은 인증KEY입니다."), true);
  assert.equal(isSetupNeededAlert("news 오류 뒤 성공 없음 · 사유: canceling statement due to statement timeout"), false);
  assert.equal(isSetupNeededAlert(null), false);
  assert.match(read("lib/admin/health-alerts.ts"), /!isSetupNeededAlert\(a\.detail\)/, "상단 critical 띠에서 뺀다");
});

test("상세 원천 없음 — 오류 없는 빈 응답만 세고 3번이면 absent", async () => {
  /* apartment-ingest 는 server-only 를 끌어오므로 순수 함수 몸통을 소스로 확인한다 */
  const src = read("lib/national-data/apartment-ingest.ts");
  assert.match(src, /export const DETAIL_ABSENT_EMPTY = 3;/);
  assert.match(src, /const detailEmpty = cleanEmpty \? base \+ 1 : base;/);
  assert.match(src, /nextDetailMissState\(o\.r\.metadata\?\.detailEmpty, !\("error" in o && o\.error\)\)/, "429 · 장애는 세지 않는다");
  assert.match(src, /\.eq\("metadata->>detailStatus", "absent"\)\s*\.lt\("metadata->>detailFetchedAt", cutoff\)/, "30일 지난 absent 만 다시");
});

test("노트 쓰기 — 새 노트는 한 화면 기본 · 템플릿 · 회차 · ?quick=0 은 3단계 · 첫 입력 단계", () => {
  const src = read("app/notes/new/NoteForm.tsx");
  assert.match(src, /useState\(!isEdit && \(quickStart \|\| \(!quickExplicit && !template && !revisitOf\)\)\)/);
  assert.match(src, /noteFunnel\("note_first_input", \{ guest: isGuest, what \}\)/);
  assert.match(read("app/admin/traffic/page.tsx"), /note_first_input:/);
  assert.match(read("app/complex/tx/[slug]/page.tsx"), /\/notes\/new\?\$\{new URLSearchParams\(\{ apt: complexName/);
});

test("정비구역 키워드 — 소규모 정비 포함 · 분류는 재개발 기본", () => {
  for (const k of ["가로주택", "소규모주택", "모아타운"]) assert.ok((VWORLD_ZONE_KEYWORDS as readonly string[]).includes(k), k);
  assert.equal(isRedevZoneName("면목동 모아타운 지구단위계획구역"), true);
  assert.equal(zoneCodeFromName("○○ 가로주택정비"), "UQ1221");
  assert.match(read("lib/redevelopment/vworld-zone-shapes-fetch.ts"), /"vworld-zone-shapes-v2"/, "키워드가 바뀌면 캐시 키도");
});

test("AI 한 줄 판정 — 한 요청(?tools=)에 판정만 · 단지 화면은 뷰포트 근접 지연", () => {
  const route = read("app/api/ai/context/route.ts");
  assert.match(route, /url\.searchParams\.get\("tools"\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, verdicts \}/);
  assert.match(read("app/complex/[id]/ComplexAiVerdictsLazy.tsx"), /useNearViewport\(ref, "200px 0px"\)/);
  assert.match(read("app/complex/[id]/page.tsx"), /<ComplexAiVerdictsLazy complexId=\{complexId\}/);
  assert.match(read("app/analysis/ai/[tool]/OtherVerdicts.tsx"), /&tools=\$\{others\.map/, "다른 판정도 한 요청");
});

test("폰 정리 — 쿠키 배너 한 줄 · 관리자 배너 자리 숨김 · 동 화면 정비사업 · 청약", () => {
  const banner = read("components/consent/cookie-consent-banner.tsx");
  assert.match(banner, /max-md:flex-row max-md:items-center/);
  assert.match(banner, /aria-label="필수만 허용"/, "e2e 이름 유지");
  assert.match(read("app/components/ads/AdminStripPlaceholder.tsx"), /max-md:!hidden/);
  const dong = read("app/dong/[region]/[dong]/page.tsx");
  assert.match(dong, /seoulGuHref\(gu\.slug\)/);
  assert.match(dong, /href="\/apply"/);
});
