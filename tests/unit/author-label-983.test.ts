import test from "node:test";
import assert from "node:assert/strict";
import {
  isLabAuthor,
  displayAuthorLabel,
  LAB_AUTHOR_LABEL,
} from "../../lib/notes/author-label.ts";

/* 983 — 작성자 표기.
   실측(2026-09-09): Lab 노트 25건의 author_label 이 7종으로 갈라져 있었다.
   그 7종을 그대로 고정해 둔다 — 새 표기가 생기면 여기서 걸린다. */

const REAL_LAB_LABELS = [
  "내집나우 Lab · AI 임장노트 편집부",
  "내집나우 Lab",
  "내집나우 Lab · AI 임장노트",
  "내집나우 Lab 편집장",
  "내집나우 Lab 에디터",
  "내집나우 Lab AI 에디터",
  "내집나우 lab · AI 임장노트 편집장",
];

test("실제로 쓰인 Lab 표기 7종이 전부 Lab 으로 잡힌다", () => {
  for (const l of REAL_LAB_LABELS) assert.equal(isLabAuthor(l), true, l);
  assert.equal(new Set(REAL_LAB_LABELS).size, 7);
});

test("7종이 화면에서는 하나로 모인다", () => {
  const shown = new Set(REAL_LAB_LABELS.map(displayAuthorLabel));
  assert.deepEqual([...shown], [LAB_AUTHOR_LABEL]);
});

test("일반 사용자 이름은 그대로 둔다 — 남의 이름을 고치지 않는다", () => {
  assert.equal(displayAuthorLabel("JangHun Bae"), "JangHun Bae");
  assert.equal(displayAuthorLabel("  테스트 계정  "), "테스트 계정");
  assert.equal(isLabAuthor("JangHun Bae"), false);
});

test("lab 이 단어의 일부이면 Lab 이 아니다", () => {
  assert.equal(isLabAuthor("Lablanc"), false);
  assert.equal(isLabAuthor("collaborate"), false);
  assert.equal(displayAuthorLabel("Lablanc"), "Lablanc");
});

test("이름이 비면 빈 자리를 남기지 않는다", () => {
  assert.equal(displayAuthorLabel(""), "익명");
  assert.equal(displayAuthorLabel(null), "익명");
  assert.equal(displayAuthorLabel(undefined), "익명");
  assert.equal(displayAuthorLabel("   "), "익명");
});
