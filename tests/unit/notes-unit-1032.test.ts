/* [1032] 임장노트 1단계 — 지도에서 고르기 · 임장한 타입(실거래 전용면적) · 동·층·향 · 평면도(사진 역할) · 세부 기록.
   규칙: 타입 목록은 실거래에서만(지어내지 않는다) · 빈 값은 키 없음 · 저장 metadata 와 초안이 같은 파서를 쓴다 ·
   세 조각(지도·타입·세부 기록)은 /notes/new 첫 로드에 들어가지 않는다(next/dynamic). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMPTY_UNIT,
  FIELD_CHOICE_GROUPS,
  FIELD_NUMBER_GROUPS,
  areaTypeLabel,
  complexFactChips,
  fieldDetailForSave,
  fieldDetailFromMetadata,
  isEmptyUnit,
  photoRolesForSave,
  photoRolesFromMetadata,
  tradeTuplesFrom,
  unitForSave,
  unitFromMetadata,
  unitSummary,
  unitTypesFromTrades,
} from "../../lib/notes/unit-detail.ts";
import { fieldDetailLines, unitTypeSubline } from "../../lib/notes/unit-detail-lines.ts";
import { draftComparable, parseDraft } from "../../lib/notes/draft-summary.ts";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/* ── 타입: 실거래 전용면적에서만 ─────────────────────────────────────── */
test("tradeTuplesFrom — 모양이 틀린 행은 버린다(신뢰 경계)", () => {
  const t = tradeTuplesFrom({
    trades: [
      ["202608", 84.97, 85000, 12],
      ["202607", 59.98, 61000, null],
      ["2026", 84.97, 85000, 1], // 연월 형식 아님
      ["202606", 0, 85000, 3], // 면적 0
      ["202605", 84.97, -1, 3], // 금액
      "x",
      ["202604", 84.95, 80000, 0], // 층 0 → null
    ],
  });
  assert.equal(t.length, 3);
  assert.deepEqual(t[2], ["202604", 84.95, 80000, null]);
  assert.deepEqual(tradeTuplesFrom(null), []);
  assert.deepEqual(tradeTuplesFrom({ trades: "no" }), []);
});

test("unitTypesFromTrades — 정수부로 묶고 면적 오름차순 · 대표 면적은 최빈 정확값 · 최근 건 · 층 범위", () => {
  const types = unitTypesFromTrades(
    tradeTuplesFrom({
      trades: [
        ["202608", 84.97, 85000, 12],
        ["202607", 84.95, 82000, 3],
        ["202606", 84.97, 83000, 24],
        ["202605", 59.98, 61000, null],
        ["202603", 114.5, 120000, 7],
      ],
    }),
  );
  assert.deepEqual(
    types.map((t) => t.label),
    ["59㎡", "84㎡", "114㎡"],
  );
  const t84 = types[1];
  assert.equal(t84.areaM2, 84.97);
  assert.equal(t84.count, 3);
  assert.equal(t84.latestManwon, 85000);
  assert.equal(t84.latestYm, "202608");
  assert.equal(t84.floorMin, 3);
  assert.equal(t84.floorMax, 24);
  assert.equal(types[0].floorMin, null);
  assert.equal(unitTypeSubline(t84), "최근 8.5억 · 2026.08 · 3건 · 3~24층");
  assert.equal(unitTypeSubline(types[2]), "최근 12억 · 2026.03 · 1건 · 7층");
  assert.deepEqual(unitTypesFromTrades([]), []);
});

test("areaTypeLabel — 국내 관행(소수점 버림)", () => {
  assert.equal(areaTypeLabel(84.97), "84㎡");
  assert.equal(areaTypeLabel(59.5), "59㎡");
});

/* ── unit 저장형·파서·요약 ────────────────────────────────────────────── */
test("unitFromMetadata/unitForSave — 빈 값은 키 없음 · 범위 밖은 버림 · 요약은 있는 것만", () => {
  assert.ok(isEmptyUnit(unitFromMetadata(null)));
  assert.ok(isEmptyUnit(unitFromMetadata({ unit: { areaM2: 0, floor: 200, direction: "위" } })));
  const u = unitFromMetadata({ unit: { areaM2: 84.97, dong: " 103동 ", floor: 12, direction: "남" } });
  assert.deepEqual(u, { areaM2: 84.97, areaLabel: "84㎡", dong: "103동", floor: 12, direction: "남" });
  assert.equal(unitSummary(u), "84㎡ · 103동 · 12층 · 남향");
  assert.equal(unitSummary({ ...EMPTY_UNIT, dong: "103" }), "103동");
  assert.equal(unitSummary(EMPTY_UNIT), null);
  assert.equal(unitForSave(EMPTY_UNIT), undefined);
  assert.deepEqual(unitForSave({ ...EMPTY_UNIT, floor: 3 }), { floor: 3 });
});

/* ── 단지 사실 줄 ─────────────────────────────────────────────────────── */
test("complexFactChips — 응답에 있는 값만 · 0/빈 문자열은 빠진다", () => {
  assert.deepEqual(complexFactChips(null), []);
  const chips = complexFactChips({
    build_year: 1996,
    households: 1200,
    building_count: 12,
    total_floors: 25,
    parking_count: 1300,
    parking_per_hh: 1.08,
    heating: "지역난방",
    elevator_count: 0,
    builder_name: "",
    manage_type: "위탁관리",
  });
  assert.deepEqual(chips, ["준공 1996년", "1,200세대", "12개동", "최고 25층", "주차 1.1대/세대", "지역난방", "위탁관리"]);
  assert.deepEqual(complexFactChips({ parking_count: 300 }), ["주차 300대"]);
});

/* ── 세부 기록 ────────────────────────────────────────────────────────── */
test("fieldDetail — 선택지 밖·범위 밖은 버리고 저장형은 빈 키 없음 · 상세 줄", () => {
  const d = fieldDetailFromMetadata({
    fieldDetail: { roadNoise: "약간", parkingNow: "모름", subwayWalkMin: 7, schoolWalkMin: 999, askingManwon: 85000, heard: "  관리실 — 누수 보수 완료 " },
  });
  assert.deepEqual(d, { roadNoise: "약간", subwayWalkMin: 7, askingManwon: 85000, heard: "관리실 — 누수 보수 완료" });
  assert.deepEqual(fieldDetailLines(d), [
    ["도로 소음", "약간"],
    ["지하철 도보", "7분"],
    ["들은 호가", "8.5억"],
    ["들은 말", "관리실 — 누수 보수 완료"],
  ]);
  assert.equal(fieldDetailForSave({}), undefined);
  assert.equal(fieldDetailForSave({ heard: "  " }), undefined);
  assert.deepEqual(fieldDetailForSave({ sunlight: "밝음", elevatorWaitSec: 30 }), { sunlight: "밝음", elevatorWaitSec: 30 });
  /* 선택지·숫자 그룹의 키는 서로 겹치지 않는다 */
  const keys = [...FIELD_CHOICE_GROUPS.map((g) => g.key), ...FIELD_NUMBER_GROUPS.map((g) => g.key)];
  assert.equal(new Set(keys).size, keys.length);
});

/* ── 사진 역할(평면도) ────────────────────────────────────────────────── */
test("photoRoles — 아는 역할만 · 저장은 노트에 남은 사진만", () => {
  assert.deepEqual(photoRolesFromMetadata({ photoRoles: { "https://a/1.jpg": "floorplan", "https://a/2.jpg": "cover" } }), {
    "https://a/1.jpg": "floorplan",
  });
  assert.deepEqual(photoRolesForSave({ "https://a/1.jpg": "floorplan", "https://a/9.jpg": "floorplan" }, ["https://a/1.jpg"]), {
    "https://a/1.jpg": "floorplan",
  });
  assert.equal(photoRolesForSave({ "https://a/9.jpg": "floorplan" }, []), undefined);
});

/* ── 초안 ─────────────────────────────────────────────────────────────── */
test("parseDraft — unit·fieldDetail·photoRoles 는 객체 그대로(빈 객체는 없음) · 복원은 NoteForm 이 unit-detail 파서로 · comparable 에 포함", () => {
  const base = {
    v: 1,
    savedAt: "2026-10-04T00:00:00.000Z",
    checks: {},
    visit: {},
    tags: [],
    doneTodos: [],
    satisfaction: null,
    memo: "",
  };
  const a = parseDraft(JSON.stringify({ ...base, unit: { areaM2: 84.97, floor: 12 }, fieldDetail: { roadNoise: "큼" }, photoRoles: { u: "floorplan" } }));
  assert.ok(a);
  assert.deepEqual(a!.unit, { areaM2: 84.97, floor: 12 });
  assert.deepEqual(unitFromMetadata({ unit: a!.unit }), { areaM2: 84.97, areaLabel: "84㎡", dong: null, floor: 12, direction: null });
  assert.deepEqual(a!.fieldDetail, { roadNoise: "큼" });
  assert.deepEqual(a!.photoRoles, { u: "floorplan" });
  const b = parseDraft(JSON.stringify({ ...base, unit: {}, fieldDetail: [], photoRoles: null }));
  assert.equal(b!.unit, undefined);
  assert.equal(b!.fieldDetail, undefined);
  assert.equal(b!.photoRoles, undefined);
  assert.notEqual(draftComparable(a!), draftComparable(b!));
  /* 홈 "이어서 보기"에도 실리는 모듈 — unit-detail 런타임 의존이 없어야 한다(번들: 홈 495KB · /notes/new 470KB) */
  const ds = src("lib/notes/draft-summary.ts");
  assert.match(ds, /import type \{ FieldDetail, NoteUnit, PhotoRole \} from "@\/lib\/notes\/unit-detail";/);
  assert.ok(!/^import \{[^}]*\} from "@\/lib\/notes\/unit-detail"/m.test(ds));
});

/* ── 폼 배선 ──────────────────────────────────────────────────────────── */
test("NoteForm — 세 조각은 next/dynamic · 1단계에 지도·타입, 2단계에 세부 기록 · 페이로드 metadata 에 unit/fieldDetail/photoRoles", () => {
  const s = src("app/notes/new/NoteForm.tsx");
  for (const name of ["NoteMapPick", "NoteUnitPick", "NoteFieldDetail"]) {
    assert.match(s, new RegExp(`const ${name} = nextDynamic\\(\\(\\) => import\\("./${name}"\\)`), `${name} 지연 조각`);
  }
  assert.match(s, /\{step === 1 && <NoteMapPick value=\{loc\} onPick=\{setLoc\} fallbackCenter=\{carryOverCenter\} \/>\}/);
  /* [1033] 단지 id 없는 위치(빌라·오피스텔)도 타입 카드 — 위치가 정해지면(renderUnitPick · 1단계와 퀵모드가 같은 것) */
  assert.match(s, /const renderUnitPick = \(\) =>\s*loc\.aptName\.trim\(\) \? \(\s*<NoteUnitPick/);
  assert.match(s, /complexId=\{loc\.complexId \?\? null\}/);
  assert.match(s, /\{step === 2 && <NoteFieldDetail value=\{fieldDetail\} onChange=\{setFieldDetail\} \/>\}/);
  /* [1033] 비면 null 로 보낸다 — PATCH 가 기존 metadata 위에 덮어쓰므로 "비움"이 전달돼야 한다(서버 sanitizeUnitMeta 가 키를 지운다) */
  assert.match(s, /unit: unitForSave\(unit\) \?\? null,\s*fieldDetail: fieldDetailLooseForSave\(fieldDetail\) \?\? null,\s*photoRoles: photoRolesForSave\(photoRoles, savePhotos\) \?\? null,/);
  /* 초안: 쓰기·복원·의존성 */
  assert.match(s, /unit: unitForSave\(unit\) as NoteUnit \| undefined,/);
  assert.match(s, /if \(pendingDraft\.unit\) setUnit\(unitFromMetadata\(\{ unit: pendingDraft\.unit \}\)\);/);
  /* 사진 고르기는 역할을 적어 두고 연다 — 보통 사진은 null 로 비운다 */
  assert.equal((s.match(/openPicker\(null/g) ?? []).length, 4);
  assert.match(s, /openPicker\("floorplan"\)/);
  assert.ok(!/fileRef\.current\?\.click\(\)/.test(s.replace(/\(capture \? captureRef : fileRef\)\.current\?\.click\(\)/, "")));
  /* 평면도 토글은 사진 줄에 */
  assert.match(s, /roles=\{photoRoles\}\s*onToggleFloorplan=\{toggleFloorplan\}/);
});

test("NoteMapPick — /map 과 같은 재료(/api/map/clusters · PICK_DEFAULT_LEVEL) · 마커 → NoteLocation · 묶음은 확대", () => {
  const s = src("app/notes/new/NoteMapPick.tsx");
  assert.match(s, /from "@\/components\/map\/NaverMapLazy"/);
  assert.match(s, /\/api\/map\/clusters\?/);
  assert.match(s, /PICK_DEFAULT_LEVEL/);
  assert.match(s, /decodeNameIdSafe\(m\.id\)/);
  assert.match(s, /if \(view\.mode === "clusters"\) \{\s*setCenter/);
  assert.match(s, /enableGeolocation/);
  /* 실패를 "없음"으로 그리지 않는다 */
  assert.match(s, /단지 목록 불러오기 실패/);
  assert.match(s, /지도 불러오기 실패/);
});

test("NoteUnitPick — 실거래 타입은 /api/complex/[id]/trades 에서만 · 없으면 직접 입력 · 평면도는 공공 자료 없음이라 말한다", () => {
  const s = src("app/notes/new/NoteUnitPick.tsx");
  assert.match(s, /\/api\/complex\/\$\{encodeURIComponent\(id\)\}\/trades/);
  assert.match(s, /unitTypesFromTrades\(tradeTuplesFrom\(raw\)\)/);
  assert.match(s, /실거래 타입 없음/);
  assert.match(s, /평면도 · 공공 자료 없음/);
  assert.match(s, /NOTE_DIRECTIONS\.map/);
  assert.ok(!/btn-primary/.test(s), "채움 파랑 버튼은 저장 하나뿐");
});

test("노트 상세 — 임장한 타입·세부 기록 블록은 값이 있을 때만", () => {
  const s = src("app/notes/[id]/page.tsx");
  assert.match(s, /임장한 타입 · 세부 기록/);
  assert.match(s, /if \(!u && lines\.length === 0 && planN === 0\) return null;/);
});

test("사진 줄 — 평면도 토글은 onToggleFloorplan 이 있을 때만(구 호출부 호환)", () => {
  const s = src("app/notes/new/NotePhotoBlocks.tsx");
  assert.match(s, /\{onToggleFloorplan && \(/);
  assert.match(s, /평면도로 표시/);
});
