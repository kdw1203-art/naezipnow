import { strict as assert } from "node:assert";
import test from "node:test";

import {
  isDraftNewerThan,
  NOTE_DRAFT_KEY,
  noteDraftKey,
  stableStringify,
} from "../../lib/notes/draft-summary";
import {
  localDateIso,
  makeCoverPhoto,
  mergeUploadedPhotos,
  movePhoto,
  runWithConcurrency,
  uploadFailureLabel,
  uploadProgressLabel,
  visitDateFromTakenAt,
} from "../../lib/notes/note-form-utils";

/* [967] 임장노트 작성 폼의 순수 도우미 — 임시저장 키·사진 병합/순서·업로드 문구·방문일. */

test("[967 · 9] 임시저장 키 — 새 노트는 예전 키 그대로(홈 배너 호환), 수정은 노트별", () => {
  assert.equal(noteDraftKey(null), NOTE_DRAFT_KEY);
  assert.equal(noteDraftKey(undefined), NOTE_DRAFT_KEY);
  assert.equal(noteDraftKey(""), NOTE_DRAFT_KEY);
  assert.equal(noteDraftKey("  "), NOTE_DRAFT_KEY);
  assert.equal(noteDraftKey("abc"), "nz_note_draft:edit:abc");
  assert.notEqual(noteDraftKey("a"), noteDraftKey("b"));
});

test("[967 · 10] 초안이 노트 저장보다 나중일 때만 복원 제안", () => {
  assert.equal(isDraftNewerThan("2026-09-06T10:00:00Z", "2026-09-06T09:00:00Z"), true);
  assert.equal(isDraftNewerThan("2026-09-06T09:00:00Z", "2026-09-06T10:00:00Z"), false);
  assert.equal(isDraftNewerThan("2026-09-06T09:00:00Z", "2026-09-06T09:00:00Z"), false);
  /* updatedAt 을 모르면 초안을 믿는다 */
  assert.equal(isDraftNewerThan("2026-09-06T09:00:00Z", null), true);
  assert.equal(isDraftNewerThan("2026-09-06T09:00:00Z", "not-a-date"), true);
  /* 초안 시각이 깨졌으면 복원 제안 안 함 */
  assert.equal(isDraftNewerThan("nope", "2026-09-06T09:00:00Z"), false);
});

test("[967 · 10] stableStringify — 키 순서 무관, undefined 생략, 배열 순서는 유지", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: [1, 2], c: undefined } }),
    stableStringify({ a: { d: [1, 2] }, b: 1 }),
  );
  assert.notEqual(stableStringify({ a: [1, 2] }), stableStringify({ a: [2, 1] }));
  assert.equal(stableStringify(null), "null");
});

test("[967 · 1] 업로드 병합 — 실패가 섞여도 성공분은 남고, 중복·초과는 버린다", () => {
  assert.deepEqual(mergeUploadedPhotos(["a"], ["b", "c"], 10), ["a", "b", "c"]);
  assert.deepEqual(mergeUploadedPhotos(["a"], ["a", "b"], 10), ["a", "b"]);
  assert.deepEqual(mergeUploadedPhotos(["a", "b"], ["c", "d"], 3), ["a", "b", "c"]);
  assert.deepEqual(mergeUploadedPhotos([], ["", "x"], 10), ["x"]);
  /* 입력 배열은 건드리지 않는다 */
  const existing = ["a"];
  mergeUploadedPhotos(existing, ["b"], 10);
  assert.deepEqual(existing, ["a"]);
});

test("[967 · 6] 진행·실패 문구 — 실제 집계만", () => {
  assert.equal(uploadProgressLabel(2, 5), "2/5 업로드 중…");
  assert.equal(uploadProgressLabel(5, 5), null);
  assert.equal(uploadProgressLabel(0, 0), null);
  assert.equal(uploadFailureLabel(3, 1), "3장 중 1장 실패");
  assert.equal(uploadFailureLabel(3, 0), null);
  assert.equal(uploadFailureLabel(0, 0), null);
});

test("[967 · 5] 사진 순서 — 앞/뒤 한 칸, 끝에서는 그대로", () => {
  const list = ["a", "b", "c"];
  assert.deepEqual(movePhoto(list, 1, -1), ["b", "a", "c"]);
  assert.deepEqual(movePhoto(list, 1, 1), ["a", "c", "b"]);
  assert.deepEqual(movePhoto(list, 0, -1), ["a", "b", "c"]);
  assert.deepEqual(movePhoto(list, 2, 1), ["a", "b", "c"]);
  assert.deepEqual(movePhoto(list, 9, 1), ["a", "b", "c"]);
  assert.deepEqual(list, ["a", "b", "c"]);
});

test("[967 · 5] 대표 사진 — index 를 맨 앞으로(= photos[0] 이 목록 커버)", () => {
  assert.deepEqual(makeCoverPhoto(["a", "b", "c"], 2), ["c", "a", "b"]);
  assert.deepEqual(makeCoverPhoto(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(makeCoverPhoto(["a", "b", "c"], 5), ["a", "b", "c"]);
});

test("[967 · 6] 제한 동시 실행 — 최대 limit 개만 동시에, 결과는 입력 순서", async () => {
  let active = 0;
  let peak = 0;
  const out = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 8 - n));
    active -= 1;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(peak, 3);
  assert.deepEqual(await runWithConcurrency([], 3, async () => 1), []);
  /* limit 이 0 이하여도 최소 1개 레인으로 돈다 */
  assert.deepEqual(await runWithConcurrency(["x"], 0, async (s) => s + "!"), ["x!"]);
});

test("[967 · 2] 방문일 — 로컬 달력 YYYY-MM-DD, 촬영일은 오늘 이후면 무시", () => {
  assert.equal(localDateIso(new Date(2026, 8, 6, 23, 30)), "2026-09-06");
  assert.equal(localDateIso(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  assert.equal(visitDateFromTakenAt("2026-09-01T14:33:00", "2026-09-06"), "2026-09-01");
  assert.equal(visitDateFromTakenAt("2026-09-06T14:33:00", "2026-09-06"), "2026-09-06");
  assert.equal(visitDateFromTakenAt("2026-09-07T00:00:00", "2026-09-06"), null);
  assert.equal(visitDateFromTakenAt("2026:09:01 14:33:00", "2026-09-06"), null);
  assert.equal(visitDateFromTakenAt(null, "2026-09-06"), null);
  assert.equal(visitDateFromTakenAt("", "2026-09-06"), null);
});
