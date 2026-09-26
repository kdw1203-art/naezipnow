import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UI_PREFS,
  mergeUiPrefs,
  normalizeUiPrefs,
  type UiPrefs,
} from "../../lib/prefs/ui-prefs.ts";
import {
  AREA_UNIT_COOKIE,
  formatAreaBoth,
  formatAreaByUnit,
  isAreaUnit,
  m2ToPyeong,
  readAreaUnitCookie,
  writeAreaUnitCookie,
} from "../../lib/prefs/area-unit.ts";
import { parseUiPrefsPatch } from "../../lib/me/ui-prefs-request.ts";
import {
  deriveAccountFacts,
  hasEmailPassword,
  providerFromSessionSub,
  tossLinked,
} from "../../lib/me/account-facts.ts";
import { INVESTOR_ROLE_OPTIONS, investorRoleLabel } from "../../lib/me/ui-pref-labels.ts";

/* [1006] 설정 › 기록 기본값 — 스키마 정규화·PATCH 병합·요청 검증·면적 단위·계정 사실.
   lib/me/preferences-store 는 Supabase 클라이언트를 끌고 들어와 여기서 import 하지 않는다 —
   저장소가 부르는 normalize/merge 와 라우트가 부르는 parse 를 각각 잠근다. */

/* ── normalizeUiPrefs ── */
test("normalizeUiPrefs: 빈 입력·비객체는 기본값", () => {
  assert.deepEqual(normalizeUiPrefs(undefined), DEFAULT_UI_PREFS);
  assert.deepEqual(normalizeUiPrefs(null), DEFAULT_UI_PREFS);
  assert.deepEqual(normalizeUiPrefs("m2"), DEFAULT_UI_PREFS);
  assert.deepEqual(normalizeUiPrefs(42), DEFAULT_UI_PREFS);
});

test("normalizeUiPrefs: 틀린 값은 기본값으로, 모르는 키(옛 weeklyDigestEmail 포함)는 버린다", () => {
  const out = normalizeUiPrefs({
    areaUnit: "acre",
    noteVisibilityDefault: "friends",
    noteQuickDefault: "yes",
    investorRoleDefault: 42,
    weeklyDigestEmail: true,
    updatedAt: 123,
    extra: true,
  });
  assert.deepEqual(out, DEFAULT_UI_PREFS);
  assert.equal("extra" in out, false);
  assert.equal("weeklyDigestEmail" in out, false, "[리뷰 H1] 죽은 스위치 키는 스키마에 없다");
  /* 모르는 역할 **문자열**은 임의 역할로 승격하지 않고 null(노트마다 고른다) — base 가 있어도 같다 */
  assert.equal(normalizeUiPrefs({ investorRoleDefault: "whale" }).investorRoleDefault, null);
  assert.equal(
    normalizeUiPrefs({ investorRoleDefault: "whale" }, { ...DEFAULT_UI_PREFS, investorRoleDefault: "live" })
      .investorRoleDefault,
    null,
  );
});

test("[리뷰 H2] 기본 공개 범위는 비공개 — 저장한 적 없는 사람의 노트가 말없이 공개되지 않는다", () => {
  assert.equal(DEFAULT_UI_PREFS.noteVisibilityDefault, "private");
  assert.equal(normalizeUiPrefs({}).noteVisibilityDefault, "private");
  assert.equal(normalizeUiPrefs({ noteVisibilityDefault: "public" }).noteVisibilityDefault, "public");
});

test("normalizeUiPrefs: 맞는 값은 그대로 · investorRoleDefault null 은 null 로", () => {
  const out = normalizeUiPrefs({
    areaUnit: "pyeong",
    noteVisibilityDefault: "public",
    noteQuickDefault: true,
    investorRoleDefault: null,
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.deepEqual(out, {
    areaUnit: "pyeong",
    noteVisibilityDefault: "public",
    noteQuickDefault: true,
    investorRoleDefault: null,
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(normalizeUiPrefs({ investorRoleDefault: "flip" }).investorRoleDefault, "flip");
});

test("normalizeUiPrefs: base 를 주면 빠진 키는 base 값을 따른다", () => {
  const base: UiPrefs = { ...DEFAULT_UI_PREFS, areaUnit: "pyeong", noteQuickDefault: true };
  const out = normalizeUiPrefs({ noteVisibilityDefault: "public" }, base);
  assert.equal(out.areaUnit, "pyeong");
  assert.equal(out.noteQuickDefault, true);
  assert.equal(out.noteVisibilityDefault, "public");
});

/* ── mergeUiPrefs ── */
test("mergeUiPrefs: patch 에 있는 키만 바뀐다(PATCH 의미)", () => {
  const base: UiPrefs = { ...DEFAULT_UI_PREFS, areaUnit: "pyeong", investorRoleDefault: "live" };
  const out = mergeUiPrefs(base, { noteQuickDefault: true });
  assert.equal(out.areaUnit, "pyeong");
  assert.equal(out.investorRoleDefault, "live");
  assert.equal(out.noteQuickDefault, true);
});

test("mergeUiPrefs: 틀린 patch 값은 base 를 지킨다 · 비객체 patch 는 무변화", () => {
  const base: UiPrefs = { ...DEFAULT_UI_PREFS, areaUnit: "pyeong" };
  assert.equal(mergeUiPrefs(base, { areaUnit: "nope" }).areaUnit, "pyeong");
  assert.deepEqual(mergeUiPrefs(base, null), base);
  assert.deepEqual(mergeUiPrefs(base, "x"), base);
  /* updatedAt 은 patch 로 못 바꾼다 — 서버가 저장 시각을 찍는다 */
  assert.equal(mergeUiPrefs(base, { updatedAt: "2099-01-01T00:00:00Z" }).updatedAt, base.updatedAt);
});

test("mergeUiPrefs: investorRoleDefault 를 null 로 되돌릴 수 있다", () => {
  const base: UiPrefs = { ...DEFAULT_UI_PREFS, investorRoleDefault: "invest" };
  assert.equal(mergeUiPrefs(base, { investorRoleDefault: null }).investorRoleDefault, null);
});

/* ── parseUiPrefsPatch (PATCH /api/me/preferences 입력 검증) ── */
test("parseUiPrefsPatch: 정상 patch 는 허용 키만 골라 넘긴다", () => {
  const r = parseUiPrefsPatch({
    uiPrefs: { areaUnit: "pyeong", noteQuickDefault: true, updatedAt: "hack", other: 1 },
  });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.patch, { areaUnit: "pyeong", noteQuickDefault: true });
});

test("parseUiPrefsPatch: 틀린 값은 저장하지 않고 거절한다(조용히 기본값으로 바꾸지 않는다)", () => {
  const cases: unknown[] = [
    { uiPrefs: { areaUnit: "pyeong2" } },
    { uiPrefs: { noteVisibilityDefault: "friends" } },
    { uiPrefs: { noteQuickDefault: "true" } },
    { uiPrefs: { investorRoleDefault: "whale" } },
    { uiPrefs: { investorRoleDefault: undefined } },
  ];
  for (const body of cases) {
    const r = parseUiPrefsPatch(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    if (!r.ok) assert.ok(r.error.length > 0);
  }
});

test("parseUiPrefsPatch: 형식 오류·빈 patch 는 400 감", () => {
  /* 옛 weeklyDigestEmail 만 보낸 요청도 "변경할 항목 없음" — 저장되지 않는다 */
  for (const body of [null, "x", [], {}, { uiPrefs: null }, { uiPrefs: [] }, { uiPrefs: {} }, { uiPrefs: { junk: 1 } }, { uiPrefs: { weeklyDigestEmail: true } }]) {
    const r = parseUiPrefsPatch(body);
    assert.equal(r.ok, false, JSON.stringify(body));
  }
});

test("parseUiPrefsPatch: investorRoleDefault null 은 허용(노트마다 선택)", () => {
  const r = parseUiPrefsPatch({ uiPrefs: { investorRoleDefault: null } });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.patch, { investorRoleDefault: null });
});

test("parseUiPrefsPatch → mergeUiPrefs: 검증 통과한 patch 는 그대로 저장된다", () => {
  const r = parseUiPrefsPatch({ uiPrefs: { areaUnit: "pyeong", noteVisibilityDefault: "private" } });
  assert.ok(r.ok);
  if (!r.ok) return;
  const saved = mergeUiPrefs(DEFAULT_UI_PREFS, r.patch);
  assert.equal(saved.areaUnit, "pyeong");
  assert.equal(saved.noteVisibilityDefault, "private");
  assert.equal(saved.noteQuickDefault, DEFAULT_UI_PREFS.noteQuickDefault);
});

/* ── 면적 단위 ── */
test("area-unit: isAreaUnit · 환산 · 표기", () => {
  assert.equal(isAreaUnit("m2"), true);
  assert.equal(isAreaUnit("pyeong"), true);
  assert.equal(isAreaUnit("py"), false);
  assert.equal(Math.round(m2ToPyeong(33.058) * 100) / 100, 10);
  assert.equal(formatAreaByUnit(84.97, "m2"), "85㎡");
  assert.equal(formatAreaByUnit(84.97, "pyeong"), "25.7평");
  assert.equal(formatAreaByUnit(null, "m2"), "—");
  assert.equal(formatAreaByUnit(Number.NaN, "pyeong"), "—");
  assert.equal(formatAreaBoth(84.97), "85㎡ · 25.7평");
});

test("area-unit: 브라우저 밖에서는 읽기 m2 · 쓰기 무해", () => {
  assert.equal(AREA_UNIT_COOKIE, "nz_area_unit");
  assert.equal(readAreaUnitCookie(), "m2");
  assert.doesNotThrow(() => writeAreaUnitCookie("pyeong"));
});

/* ── 라벨: store-db 의 ROLE_WEIGHT_PRESETS 와 같은 말 ── */
test("투자자 역할 라벨은 노트 저장소의 프리셋 이름과 같다", () => {
  const labels = Object.fromEntries(INVESTOR_ROLE_OPTIONS.map((o) => [String(o.value), o.label]));
  assert.equal(labels.live, "실거주");
  assert.equal(labels.invest, "투자");
  assert.equal(labels.flip, "단기매매");
  assert.equal(labels.rent, "임대수익");
  assert.equal(labels.balanced, "균형형");
  assert.equal(investorRoleLabel(null), "노트마다 선택");
  assert.equal(investorRoleLabel("rent"), "임대수익");
});

/* ── 계정 사실(연결된 로그인) ── */
test("providerFromSessionSub: auth.ts 가 만드는 sub 모양대로", () => {
  assert.equal(providerFromSessionSub("kakao:12345"), "kakao");
  assert.equal(providerFromSessionSub("toss:abc"), "toss");
  assert.equal(providerFromSessionSub("108234567890123456789"), "google");
  assert.equal(providerFromSessionSub("6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b"), "email");
  assert.equal(providerFromSessionSub("dev@example.com"), "email");
  assert.equal(providerFromSessionSub(""), null);
  assert.equal(providerFromSessionSub(undefined), null);
  assert.equal(providerFromSessionSub("test-user"), null);
});

test("hasEmailPassword: bcrypt·Supabase 이메일 가입만 참, 소셜 표식은 거짓", () => {
  assert.equal(hasEmailPassword("$2b$12$abcdefghijklmnopqrstuv"), true);
  assert.equal(hasEmailPassword("supabase-auth-linked"), true);
  assert.equal(hasEmailPassword("kakao-oauth-no-password"), false);
  assert.equal(hasEmailPassword("toss-login-no-password"), false);
  assert.equal(hasEmailPassword(""), false);
  assert.equal(hasEmailPassword(null), false);
});

test("tossLinked: 해제 시각이 연결보다 뒤면 연결 아님", () => {
  assert.equal(tossLinked({ toss_linked_at: "2026-01-01T00:00:00Z", toss_unlinked_at: null }), true);
  assert.equal(
    tossLinked({ toss_linked_at: "2026-01-01T00:00:00Z", toss_unlinked_at: "2026-02-01T00:00:00Z" }),
    false,
  );
  assert.equal(
    tossLinked({ toss_linked_at: "2026-03-01T00:00:00Z", toss_unlinked_at: "2026-02-01T00:00:00Z" }),
    true,
  );
  assert.equal(tossLinked({ toss_linked_at: null }), false);
});

test("deriveAccountFacts: 열 사실 + 현재 세션 · 설정 안 된 소셜은 줄을 안 그린다", () => {
  const facts = deriveAccountFacts(
    {
      created_at: "2026-05-01T09:00:00Z",
      consent_updated_at: "2026-06-01T09:00:00Z",
      marketing_agreed: true,
      location_agreed: false,
      password_hash: "kakao-oauth-no-password",
      kakao_linked_at: "2026-05-01T09:00:00Z",
      toss_linked_at: null,
    },
    { sessionSub: "kakao:1", providersConfigured: ["kakao", "toss"] },
  );
  assert.equal(facts.createdAt, "2026-05-01T09:00:00Z");
  assert.equal(facts.consentUpdatedAt, "2026-06-01T09:00:00Z");
  assert.equal(facts.marketing, true);
  assert.equal(facts.location, false);
  assert.equal(facts.currentProvider, "kakao");
  const by = Object.fromEntries(facts.logins.map((l) => [l.provider, l]));
  assert.equal(by.email.linked, false);
  assert.equal(by.kakao.linked, true);
  assert.equal(by.kakao.current, true);
  assert.equal(by.kakao.at, "2026-05-01T09:00:00Z");
  /* 토스는 토스 로그인이 직접 적는 열이 있다 → 설정돼 있으면 "연결 안 됨"을 말해도 된다 */
  assert.equal(by.toss.linked, false);
  /* 구글은 이 세션이 구글이 아니면 알 수 없다 → 줄 없음(연결 안 됨을 단언하지 않는다) */
  assert.equal("google" in by, false);
});

test("[리뷰 M4] 기록 없는 카카오·구글은 세션이 그 수단이 아니면 줄을 그리지 않는다", () => {
  const facts = deriveAccountFacts(
    { password_hash: "$2b$12$abc", kakao_linked_at: null, toss_linked_at: null },
    { sessionSub: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", providersConfigured: ["kakao", "google", "toss"] },
  );
  assert.deepEqual(
    facts.logins.map((l) => [l.provider, l.linked]),
    [
      ["email", true],
      ["toss", false],
    ],
  );
});

test("deriveAccountFacts: 행이 없어도(구글 전용 계정) 세션이 말해 주는 만큼은 그린다", () => {
  const facts = deriveAccountFacts(null, {
    sessionSub: "108234567890123456789",
    providersConfigured: ["google"],
  });
  const by = Object.fromEntries(facts.logins.map((l) => [l.provider, l]));
  assert.equal(by.google.linked, true);
  assert.equal(by.google.current, true);
  assert.equal(by.google.at, null);
  assert.equal(by.email.linked, false);
  assert.equal(facts.createdAt, null);
});

test("deriveAccountFacts: 이메일 계정 — 비밀번호 해시가 사실", () => {
  const facts = deriveAccountFacts(
    { password_hash: "$2b$12$abc", created_at: "not-a-date" },
    { sessionSub: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", providersConfigured: [] },
  );
  const by = Object.fromEntries(facts.logins.map((l) => [l.provider, l]));
  assert.equal(by.email.linked, true);
  assert.equal(by.email.current, true);
  assert.equal(facts.createdAt, null, "파싱 안 되는 날짜는 null");
  assert.deepEqual(Object.keys(by), ["email"]);
});
