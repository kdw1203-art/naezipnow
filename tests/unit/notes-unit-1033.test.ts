/* [1033] 1032 보완 — 단지 없는 위치의 타입 카드 · 실패≠없음 · 재방문이 타입을 잇는다 · 요약·목록·AI 입력·회차 비교에 타입/세부 기록 ·
   서버가 폼과 같은 파서로 거르고 빈 키는 지운다(PATCH 덮어쓰기) · 관리비·역 이름 · 퀵모드에도 지도·타입 · 완성도 "타입" 항목(선택) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fieldDetailFromMetadata, sanitizeUnitMeta, unitFromMetadata, unitSummary } from "../../lib/notes/unit-detail.ts";
import { fieldDetailLines } from "../../lib/notes/unit-detail-lines.ts";
import { finishSummaryRows } from "../../lib/notes/finish-summary.ts";
import { noteCompleteness } from "../../lib/notes/form-progress.ts";
import { buildRevisitPrefill } from "../../lib/inspection/revisit-prefill.ts";
import { noteContentHash } from "../../lib/notes/content-hash.ts";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("sanitizeUnitMeta — 폼과 같은 파서 · 빈 값·모양 아님은 키 삭제 · 없는 키는 손대지 않음", () => {
  const meta: Record<string, unknown> = {
    unit: { areaM2: 84.97, dong: " 103동 ", floor: 12, direction: "위", junk: 1 },
    fieldDetail: { roadNoise: "약간", parkingNow: "모름", heard: "x".repeat(300), nearestStation: "송파역" },
    photoRoles: { "https://a/1.jpg": "floorplan", "https://a/2.jpg": "cover" },
    decision: { choice: "buy" },
  };
  sanitizeUnitMeta(meta);
  assert.deepEqual(meta.unit, { areaM2: 84.97, areaLabel: "84㎡", dong: "103동", floor: 12 });
  assert.deepEqual(meta.fieldDetail, { roadNoise: "약간", heard: "x".repeat(200), nearestStation: "송파역" });
  assert.deepEqual(meta.photoRoles, { "https://a/1.jpg": "floorplan" });
  assert.deepEqual(meta.decision, { choice: "buy" });
  const cleared: Record<string, unknown> = { unit: null, fieldDetail: {}, photoRoles: null, other: 1 };
  sanitizeUnitMeta(cleared);
  assert.deepEqual(cleared, { other: 1 });
  const untouched: Record<string, unknown> = { other: 1 };
  sanitizeUnitMeta(untouched);
  assert.deepEqual(untouched, { other: 1 });
  /* 두 API 라우트가 같은 함수를 부른다 */
  assert.match(src("app/api/inspection/notes/route.ts"), /sanitizeUnitMeta\(out\);/);
  assert.match(src("app/api/inspection/notes/[id]/route.ts"), /sanitizeUnitMeta\(meta\);/);
});

test("세부 기록 — 월 관리비 · 역 이름은 지하철 도보 줄에 붙는다 · 역만 있으면 따로", () => {
  const d = fieldDetailFromMetadata({ fieldDetail: { subwayWalkMin: 7, nearestStation: "송파역", maintenanceFeeManwon: 25 } });
  assert.deepEqual(fieldDetailLines(d), [
    ["지하철 도보", "7분(송파역)"],
    ["월 관리비", "25만원"],
  ]);
  assert.deepEqual(fieldDetailLines(fieldDetailFromMetadata({ fieldDetail: { nearestStation: "송파역" } })), [["가까운 역", "송파역"]]);
  assert.equal(fieldDetailFromMetadata({ fieldDetail: { maintenanceFeeManwon: 5000 } }).maintenanceFeeManwon, undefined, "상한 밖");
});

test("재방문 프리필 — 지난 노트의 unit 을 그대로 싣는다(비면 null) · 폼은 비어 있을 때만 잇는다", () => {
  const base = {
    id: "n1",
    region: "서울 송파구",
    aptName: "헬리오시티",
    visitDate: "2026-08-10",
    scores: { location: 4, school: 3, transport: 4, facility: 3, future: 4 },
    checklist: [],
    sections: {},
  };
  const withUnit = buildRevisitPrefill({ ...base, metadata: { unit: { areaM2: 84.97, floor: 12 } } } as never, "2026-10-05");
  assert.deepEqual(withUnit.unit, { areaM2: 84.97, floor: 12 });
  assert.equal(unitSummary(unitFromMetadata({ unit: withUnit.unit })), "84㎡ · 12층");
  const without = buildRevisitPrefill({ ...base, metadata: { unit: {} } } as never, "2026-10-05");
  assert.equal(without.unit, null);
  const s = src("app/notes/new/NoteForm.tsx");
  assert.match(s, /revisitSeed\?\.unit\s*\?\s*unitFromMetadata\(\{ unit: revisitSeed\.unit \}\)/);
  assert.match(s, /if \(seed\.unit\) setUnit\(\(cur\) => \(isEmptyUnit\(cur\) \? unitFromMetadata\(\{ unit: seed\.unit \}\) : cur\)\);/);
  assert.match(s, /위치·타입·태그·체크 이어받음/);
});

test("3단계 요약 — 타입 줄은 단지 다음, 비면 없음", () => {
  const input = {
    aptName: "헬리오시티",
    region: "서울 송파구",
    visitDate: "2026-10-05",
    scores: { location: 0, school: 0, transport: 0, facility: 0, future: 0 },
    checklistDone: 0,
    checklistTotal: 0,
    photoCount: 0,
    memo: "",
    decisionLabel: null,
  };
  const rows = finishSummaryRows({ ...input, unit: { areaM2: 84.97, areaLabel: "84㎡", dong: null, floor: 12, direction: "남" } });
  assert.equal(rows[0].label, "단지");
  assert.deepEqual(rows[1], { label: "타입", value: "84㎡ · 12층 · 남향" });
  assert.ok(!finishSummaryRows(input).some((r) => r.label === "타입"));
});

test("완성도 — unitSet 을 넘길 때만 '타입' 항목(8항목) · 안 넘기면 예전 7항목", () => {
  const base = { located: true, checkedItems: 0, satisfactionSet: false, memo: "", tagCount: 0, checklistDone: 0, photoCount: 0, decided: false };
  assert.equal(noteCompleteness(base).total, 7);
  const c = noteCompleteness({ ...base, unitSet: true });
  assert.equal(c.total, 8);
  assert.deepEqual(c.items[1], { key: "unit", label: "타입", done: true, required: false, step: 1 });
  assert.match(src("app/notes/new/NoteForm.tsx"), /unitSet: !isEmptyUnit\(unit\),/);
});

test("AI 분석 입력 해시 — unit·fieldDetail 은 있을 때만 들어간다(없는 노트의 해시 불변)", () => {
  const note = {
    title: "t",
    region: "r",
    visitDate: "2026-10-05",
    scores: { location: 1, school: 1, transport: 1, facility: 1, future: 1 },
    sections: {},
    checklist: [],
    photos: [],
    metadata: {},
  } as never;
  const a = noteContentHash(note, "실거주");
  const b = noteContentHash({ ...(note as object), metadata: { unit: {}, other: 1 } } as never, "실거주");
  const c = noteContentHash({ ...(note as object), metadata: { unit: { areaM2: 84 } } } as never, "실거주");
  assert.equal(a, b);
  assert.notEqual(a, c);
  const ai = src("lib/inspection/ai-report.ts");
  assert.match(ai, /\.\.\.\(unit \? \{ unit \} : \{\}\),/);
  assert.match(ai, /fieldDetail: Object\.fromEntries\(detailLines/);
});

test("회차 비교 — 세부 기록은 양쪽에 같은 항목이 있을 때만 · 들은 말은 비교 안 함", () => {
  const s = src("lib/inspection/revisit.ts");
  assert.match(s, /if \(label === "들은 말"\) continue;/);
  assert.match(s, /changes\.push\(`\$\{label\} \$\{before\}→\$\{val\}`\)/);
});

test("폼 첫 로드 — NoteForm 은 unit-core 만 정적으로(선택지 목록·실거래 타입은 지연 조각) · unit-detail 은 core 를 다시 내보낸다", () => {
  const f = src("app/notes/new/NoteForm.tsx");
  assert.match(f, /from "@\/lib\/notes\/unit-core";/);
  assert.ok(!/from "@\/lib\/notes\/unit-detail"/.test(f));
  assert.match(src("lib/notes/unit-detail.ts"), /export \* from "@\/lib\/notes\/unit-core";/);
});

test("타입 카드 — 단지 id 없이도 · 실패와 없음을 가른다 · 퀵모드에도 지도·타입 · 목록 바닥줄 · 캐러셀 평면도 표식", () => {
  const u = src("app/notes/new/NoteUnitPick.tsx");
  assert.match(u, /complexId: string \| null;/);
  assert.match(u, /단지 연결 없음 · 면적 직접 입력/);
  assert.match(u, /실거래 타입 불러오기 실패 · 직접 입력/);
  assert.match(u, /실거래 타입 없음 · 직접 입력/);
  const f = src("app/notes/new/NoteForm.tsx");
  assert.equal((f.match(/<NoteMapPick value=\{loc\} onPick=\{setLoc\} fallbackCenter=\{carryOverCenter\} \/>/g) ?? []).length, 2, "퀵모드 + 1단계");
  assert.equal((f.match(/\{renderUnitPick\(\)\}/g) ?? []).length, 2, "퀵모드 + 1단계");
  const m = src("app/notes/new/NoteMapPick.tsx");
  assert.match(m, /st\.state !== "granted"/, "위치 권한을 이미 준 기기만 — 권한 창을 띄우지 않는다");
  assert.match(m, /fallbackCenter \?\? DEFAULT_CENTER/);
  assert.match(src("lib/notes/feed-note.ts"), /unitSummary\(unitFromMetadata\(n\.metadata\)\)/);
  assert.match(src("app/notes/[id]/NotePhotoCarousel.tsx"), /roles\?\.\[photos\[idx\]\] === "floorplan"/);
  assert.match(src("app/notes/[id]/page.tsx"), /roles=\{photoRolesFromMetadata\(realNote\.metadata\)\}/);
  const fd = src("app/notes/new/NoteFieldDetail.tsx");
  assert.match(fd, /가까운 역/);
  assert.match(fd, /formatKrwManwon\(value\.askingManwon/);
});
