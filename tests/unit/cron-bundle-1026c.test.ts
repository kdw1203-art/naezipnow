import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [1026c] ① 관리비 크론 — 2026-09-30 실행이 200곳 전부 "AptCmnuseManageCostServiceV3 HTTP 403"(data.go.kr 활용신청 전).
   첫 단지 한 곳으로 403 을 확인하면 멈추고 신청할 서비스 이름을 로그에 남긴다.
   ② 번들 — 1026b 배포 빌드가 /my/settings 496KB > 미등재 상한 495KB 로 실패. 예산은 올리지 않고 탭 전용 조각을 뗀다. */

test("관리비 크론 — 403(서비스 미신청)이면 첫 단지에서 멈추고 skipped · 신청할 서비스 이름", () => {
  const src = readFileSync("lib/national-data/kapt-mgmt-fee-ingest.ts", "utf8");
  assert.ok(src.includes('skipped: "not-registered"'));
  assert.ok(src.includes("await fetchKaptMgmtFee(picked.rows[0].kapt_code, ym);"));
  assert.ok(src.indexOf('skipped: "not-registered"') < src.indexOf("mapWithConcurrency(picked.rows"), "200곳 병렬 호출 전에 확인");
  const route = readFileSync("app/api/cron/kapt-mgmt-fee-ingest/route.ts", "utf8");
  assert.ok(route.includes('r.skipped === "not-registered"'));
});

test("/my/settings — 표시·기록 탭과 푸시 구독은 next/dynamic(첫 로드에서 뺀다)", () => {
  const src = readFileSync("app/my/settings/SettingsClient.tsx", "utf8");
  assert.ok(!/^import \{ RecordPrefsTab \} from/m.test(src));
  assert.ok(!/^import \{ PushSubscribe \} from/m.test(src));
  assert.ok(src.includes('nextDynamic(() => import("./RecordPrefsTab")'));
  assert.ok(src.includes('nextDynamic(() => import("@/components/PushSubscribe")'));
});

test("/complex/[id] — 방문 기록기는 작은 모듈, 거리뷰 버튼은 지연 조각", () => {
  const page = readFileSync("app/complex/[id]/page.tsx", "utf8");
  assert.ok(page.includes('from "../../components/RecentComplexRecorder"'));
  assert.ok(page.includes('from "@/components/map/RoadviewButtonLazy"'));
  const rec = readFileSync("app/components/RecentComplexRecorder.tsx", "utf8");
  assert.ok(!rec.includes("useToast") && !rec.includes("next/link"), "칩·토스트 없이 기록만");
  const shared = readFileSync("app/components/RecentComplexes.tsx", "utf8");
  assert.ok(shared.includes('export { RecentComplexRecorder } from "./RecentComplexRecorder";'), "기존 import 호환");
});
