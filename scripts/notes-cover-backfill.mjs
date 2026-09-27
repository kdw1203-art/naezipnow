#!/usr/bin/env node
/**
 * 기존 공개 Lab 임장노트 썸네일(metadata.cover) 백필 SQL 생성기 — **DB 에 접속하지 않는다. SQL 을 출력만 한다.**
 *
 * 쓰는 법(저장소 루트에서):
 *   1) 입력 뽑기(읽기 전용 SELECT 를 출력):
 *        node --no-warnings scripts/notes-cover-backfill.mjs --print-select
 *      → Supabase SQL 편집기에서 실행하고, 결과 한 칸(JSON 배열)을 rows.json 으로 저장.
 *   2) SQL 만들기:
 *        node --no-warnings scripts/notes-cover-backfill.mjs --input rows.json > cover-backfill.sql
 *      선택: --chosen-at 2026-09-27T00:00:00.000Z (고른 시각 고정 — 같은 입력이면 같은 SQL)
 *            --overwrite   (이미 cover 가 있는 노트도 덮어쓴다 — 기본은 건너뜀)
 *            --include-non-lab (사람 노트도 — 기본은 Lab 만. 사람 노트는 작성자가 고른다)
 *   3) cover-backfill.sql 을 검토(머리 주석에 노트별 제목·사실·변형이 있다)한 뒤 통합자가 적용.
 *
 * 문구 규칙은 앱의 규칙 폴백과 **같은 코드**(lib/notes/cover/*)를 그대로 불러 쓴다 — 두 벌로 늙지 않게.
 * .ts 를 불러오려고 테스트와 같은 해석 훅(tests/unit/resolve-hook.mjs: @/ 별칭·확장자 보충)을 등록한다.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";

process.removeAllListeners("warning");
register("../tests/unit/resolve-hook.mjs", import.meta.url);

const { planBackfill, backfillSql, BACKFILL_SELECT_SQL } = await import("../lib/notes/cover/backfill.ts");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag("--print-select")) {
  process.stdout.write(`${BACKFILL_SELECT_SQL}\n`);
  process.exit(0);
}

const input = value("--input");
if (!input) {
  console.error("사용: node scripts/notes-cover-backfill.mjs --input rows.json [--chosen-at ISO] [--overwrite] [--include-non-lab]");
  console.error("      node scripts/notes-cover-backfill.mjs --print-select   (입력 JSON 을 뽑는 SELECT)");
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(input, "utf8"));
} catch (e) {
  console.error(`[notes-cover-backfill] 입력을 읽지 못했습니다: ${input} — ${e instanceof Error ? e.message : e}`);
  process.exit(2);
}
/* SQL 편집기 결과를 그대로 저장한 모양들 — 배열 · {notes:[…]} · [{coalesce:[…]}] · [{json_agg:[…]}] */
let rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.notes) ? parsed.notes : [];
if (rows.length === 1 && rows[0] && typeof rows[0] === "object" && !("id" in rows[0])) {
  const inner = Object.values(rows[0])[0];
  if (Array.isArray(inner)) rows = inner;
}

const chosenAt = value("--chosen-at") ?? new Date().toISOString();
if (!Number.isFinite(Date.parse(chosenAt))) {
  console.error(`[notes-cover-backfill] --chosen-at 이 ISO 시각이 아닙니다: ${chosenAt}`);
  process.exit(2);
}
const overwrite = flag("--overwrite");
const plan = planBackfill(rows, { chosenAt, overwrite, includeNonLab: flag("--include-non-lab") });
process.stdout.write(backfillSql(plan, { overwrite, generatedAt: new Date().toISOString() }));
console.error(`[notes-cover-backfill] 입력 ${rows.length}행 → UPDATE ${plan.items.length}건 · 건너뜀 ${plan.skipped.length}건 (DB 에는 아무것도 쓰지 않았습니다)`);
