import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_NAME_MAX,
  buildProfilePatch,
  groupRegionOptions,
  isKnownRegion,
  regionOptionLabel,
  validateProfileDraft,
} from "@/app/my/profile-fields";
import {
  EXPORT_LEDGER_LIMIT,
  buildExportPayload,
  exportFilename,
  settledToSource,
  type ExportInput,
} from "@/app/api/me/export/shape";
import { SAVE_TOAST_GAP_MS, shouldShowSaveToast } from "@/app/my/settings/save-toast";

/* ── 프로필 편집 시트 규칙 ── */

test("validateProfileDraft — 이름은 다듬어서 1~50자(서버와 동일), 지역 빈값은 그대로 빈 문자열", () => {
  const r = validateProfileDraft({ name: "  임장  러 ", primaryRegion: "  " });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.draft, { name: "임장 러", primaryRegion: "" });

  const empty = validateProfileDraft({ name: "   ", primaryRegion: "" });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.field, "name");

  const long = validateProfileDraft({ name: "가".repeat(PROFILE_NAME_MAX + 1), primaryRegion: "" });
  assert.equal(long.ok, false);
  if (!long.ok) assert.match(long.error, /50자/);

  const exact = validateProfileDraft({ name: "가".repeat(PROFILE_NAME_MAX), primaryRegion: "" });
  assert.ok(exact.ok);

  const control = validateProfileDraft({ name: "ab", primaryRegion: "" });
  assert.equal(control.ok, false);
});

test("buildProfilePatch — 바뀐 필드만, 지역 비움은 null, 변화 없으면 null", () => {
  const initial = { name: "홍길동", primaryRegion: "강남구" };
  assert.equal(buildProfilePatch({ name: "홍길동", primaryRegion: "강남구" }, initial), null);
  assert.deepEqual(buildProfilePatch({ name: "홍길동", primaryRegion: "" }, initial), {
    primaryRegion: null,
  });
  assert.deepEqual(buildProfilePatch({ name: "새이름", primaryRegion: "강남구" }, initial), {
    name: "새이름",
  });
  assert.deepEqual(
    buildProfilePatch({ name: "새이름", primaryRegion: "마포구" }, { name: null, primaryRegion: null }),
    { name: "새이름", primaryRegion: "마포구" },
  );
});

test("지역 선택지 — 서울은 city 없이, 광역시는 이름에 이미 시/도가 있어 중복 접두를 붙이지 않는다", () => {
  const catalog = [
    { id: "gangnam", name: "강남구" },
    { id: "seongnam-bundang", name: "성남시 분당구", city: "경기" },
    { id: "busan-jung", name: "부산 중구", city: "부산" },
    { id: "busan-yeongdo", name: "영도구", city: "부산" },
  ];
  assert.equal(regionOptionLabel(catalog[0]!), "서울 강남구");
  assert.equal(regionOptionLabel(catalog[1]!), "경기 성남시 분당구");
  assert.equal(regionOptionLabel(catalog[2]!), "부산 중구");
  assert.equal(regionOptionLabel(catalog[3]!), "부산 영도구");

  const groups = groupRegionOptions(catalog);
  assert.deepEqual(
    groups.map((g) => g.city),
    ["서울", "경기", "부산"],
  );
  /* 저장값은 라벨이 아니라 name — /api/me/profile 이 자유 텍스트로 받고 화면이 그대로 쓴다 */
  assert.deepEqual(groups[2]!.options.map((o) => o.value), ["부산 중구", "영도구"]);

  assert.equal(isKnownRegion("강남구", catalog), true);
  assert.equal(isKnownRegion("", catalog), true);
  assert.equal(isKnownRegion(null, catalog), true);
  assert.equal(isKnownRegion("옛날에 손으로 적은 동네", catalog), false);
});

/* ── 내 데이터 내보내기 ── */

function baseInput(over: Partial<ExportInput> = {}): ExportInput {
  return {
    email: "Me@Example.com",
    generatedAt: "2026-09-14T00:00:00.000Z",
    profile: {
      ok: true,
      value: { email: "me@example.com", name: "나", plan: "pro", createdAt: "2026-01-01", primaryRegion: "강남구" },
    },
    notes: { ok: true, value: [] },
    bookmarks: { ok: true, value: [] },
    watchlist: { ok: true, value: [] },
    alerts: { ok: true, value: [] },
    points: { ok: true, value: [] },
    payments: { ok: true, value: [] },
    notificationPrefs: { ok: true, value: {} },
    ...over,
  };
}

test("buildExportPayload — 본인 행만 남기고 남의 행은 버린다(대소문자 무시)", () => {
  const note = {
    id: "n1",
    authorEmail: "ME@example.com",
    title: "첫 임장",
    region: "서울 강남구",
    aptName: "래미안",
    visitDate: "2026-09-01",
    isPublic: true,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    summary: "좋았다",
    metadata: { decision: { choice: "buy", reasons: ["역세권"], decidedAt: "2026-09-02T00:00:00Z" } },
  };
  const other = { ...note, id: "n2", authorEmail: "someone@else.com" };
  const payload = buildExportPayload(
    baseInput({
      notes: { ok: true, value: [note, other] },
      bookmarks: {
        ok: true,
        value: [
          { userEmail: "me@example.com", targetType: "complex", targetId: "c1", createdAt: "2026-09-01" },
          { userEmail: "x@y.com", targetType: "complex", targetId: "c2", createdAt: "2026-09-01" },
        ],
      },
      watchlist: {
        ok: true,
        value: [
          { userEmail: "me@example.com", complexId: "c1", complexName: "래미안", createdAt: "2026-09-01" },
          { userEmail: "x@y.com", complexId: "c9", complexName: "남의 것", createdAt: "2026-09-01" },
        ],
      },
    }),
  );
  assert.equal(payload.format, "naezipnow-export");
  assert.equal(payload.account.email, "Me@Example.com");
  assert.deepEqual(payload.notes.map((n) => n.id), ["n1"]);
  assert.deepEqual(payload.notes[0]!.decision, {
    choice: "buy",
    reasons: ["역세권"],
    decidedAt: "2026-09-02T00:00:00Z",
  });
  assert.equal(payload.notes[0]!.complex, "래미안");
  assert.deepEqual(payload.bookmarks.map((b) => b.targetId), ["c1"]);
  assert.deepEqual(payload.watchlist.map((w) => w.complexId), ["c1"]);
  assert.deepEqual(payload.errors, []);
});

test("buildExportPayload — 실패한 원천은 빈 배열이 아니라 errors 에 남고, 나머지는 그대로 내려간다", () => {
  const payload = buildExportPayload(
    baseInput({
      points: { ok: false, error: "point_ledger 조회 실패: timeout" },
      profile: { ok: false, error: "" },
      payments: {
        ok: true,
        value: [
          {
            id: "p1", orderId: "o1", plan: "pro", billing: "monthly", amount: 2900, status: "paid",
            method: "card", receiptUrl: "https://example.com/r", requestedAt: "2026-09-01", paidAt: "2026-09-01", cancelledAt: null,
          },
        ],
      },
    }),
  );
  assert.deepEqual(payload.points, []);
  assert.equal(payload.profile, null);
  assert.deepEqual(
    payload.errors.map((e) => e.source),
    ["profile", "points"],
  );
  assert.equal(payload.errors[0]!.message, "조회 실패");
  assert.equal(payload.errors[1]!.message, "point_ledger 조회 실패: timeout");
  assert.equal(payload.payments.length, 1);
  assert.equal(payload.payments[0]!.amount, 2900);
  /* 결제 행에 빌링키 같은 비밀 필드가 새로 붙어도 출력 모양은 고정 키만 */
  assert.deepEqual(Object.keys(payload.payments[0]!).sort(), [
    "amount", "billing", "cancelledAt", "id", "method", "orderId", "paidAt", "plan", "receiptUrl", "requestedAt", "status",
  ]);
});

test("buildExportPayload — 포인트는 최근 500건까지, 알림 설정의 내부 필드는 뺀다", () => {
  const rows = Array.from({ length: EXPORT_LEDGER_LIMIT + 20 }, (_, i) => ({
    delta: 10, reason: "attendance", refId: null, balance: 10 * (i + 1), createdAt: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`, expiresAt: null,
  }));
  const payload = buildExportPayload(
    baseInput({
      points: { ok: true, value: rows },
      notificationPrefs: {
        ok: true,
        value: { userEmail: "me@example.com", updatedAt: "x", smsConsentAt: "y", emailComments: true, pushLikes: false },
      },
    }),
  );
  assert.equal(payload.points.length, EXPORT_LEDGER_LIMIT);
  assert.deepEqual(payload.notificationPrefs, { emailComments: true, pushLikes: false });
});

test("exportFilename — 한국 날짜 YYYYMMDD (UTC 자정 직전은 KST 로 다음 날)", () => {
  assert.equal(exportFilename(new Date("2026-09-14T03:00:00Z")), "naezipnow-export-20260914.json");
  assert.equal(exportFilename(new Date("2026-09-14T16:30:00Z")), "naezipnow-export-20260915.json");
});

test("settledToSource — fulfilled 는 값, rejected 는 오류 메시지", () => {
  assert.deepEqual(settledToSource({ status: "fulfilled", value: 1 }), { ok: true, value: 1 });
  assert.deepEqual(settledToSource({ status: "rejected", reason: new Error("boom") }), {
    ok: false,
    error: "boom",
  });
  assert.deepEqual(settledToSource({ status: "rejected", reason: 42 }), { ok: false, error: "조회 실패" });
});

/* ── 설정 저장 토스트 간격 ── */

test("shouldShowSaveToast — 첫 토스트는 즉시, 1.5초 안 연타는 건너뛴다", () => {
  assert.equal(shouldShowSaveToast(0, 10_000), true);
  assert.equal(shouldShowSaveToast(10_000, 10_000 + SAVE_TOAST_GAP_MS - 1), false);
  assert.equal(shouldShowSaveToast(10_000, 10_000 + SAVE_TOAST_GAP_MS), true);
  assert.equal(shouldShowSaveToast(Number.NaN, 5), true);
});
