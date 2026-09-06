import { strict as assert } from "node:assert";
import test from "node:test";

import {
  NOTE_CACHE_REVALIDATE_SEC,
  NOTE_COMMENTS_CACHE_REVALIDATE_SEC,
  PUBLIC_NOTES_LIST_TAG,
  isNoteCacheTag,
  noteCacheTags,
  noteCommentsCacheTags,
  noteCommentsTag,
  noteTag,
  noteVisitsCacheTags,
  tagsToRevalidate,
  type NoteMutation,
} from "../../lib/inspection/note-cache-tags";

/* [969 · 20] 공개 노트 상세 데이터 캐시 태그 — 만들 때와 비울 때 같은 문자열이어야 한다 */

const ID = "3f2b1c44-9a1e-4d0f-8c6a-1b2c3d4e5f60";

test("noteTag / noteCommentsTag — 사양 문자열 그대로, 공백은 접는다", () => {
  assert.equal(noteTag(ID), `note:${ID}`);
  assert.equal(noteCommentsTag(ID), `note-comments:${ID}`);
  assert.equal(noteTag(`  ${ID}\n`), `note:${ID}`, "앞뒤 공백은 같은 노트다");
  assert.notEqual(noteTag(ID), noteCommentsTag(ID), "행 태그와 댓글 태그는 다르다");
});

test("revalidate 값 — 노트 300초 · 댓글 60초(요청 사양)", () => {
  assert.equal(NOTE_CACHE_REVALIDATE_SEC, 300);
  assert.equal(NOTE_COMMENTS_CACHE_REVALIDATE_SEC, 60);
});

test("캐시에 붙이는 태그 — 행은 note:<id>, 댓글은 note:<id>+note-comments:<id>", () => {
  assert.deepEqual(noteCacheTags(ID), [`note:${ID}`]);
  assert.deepEqual(noteCommentsCacheTags(ID), [`note:${ID}`, `note-comments:${ID}`]);
  assert.deepEqual(noteVisitsCacheTags(ID), [`note:${ID}`, PUBLIC_NOTES_LIST_TAG]);
});

test("tagsToRevalidate — 변경 종류마다 캐시에 붙인 태그가 빠짐없이 비워진다", () => {
  /* 내용 변경: 행 + 목록 성격(관련 풀·회차) */
  assert.deepEqual(tagsToRevalidate(ID, "content"), [`note:${ID}`, PUBLIC_NOTES_LIST_TAG]);
  /* 소유자용 부가 정보(AI 분석·카드 구성): 행만 */
  assert.deepEqual(tagsToRevalidate(ID, "metadata"), [`note:${ID}`]);
  /* 삭제: 행·댓글·목록 전부 */
  assert.deepEqual(tagsToRevalidate(ID, "delete"), [
    `note:${ID}`,
    `note-comments:${ID}`,
    PUBLIC_NOTES_LIST_TAG,
  ]);
  /* 댓글: note-comments:<id> 와 note:<id> (요청 사양) */
  assert.deepEqual(tagsToRevalidate(ID, "comment"), [`note-comments:${ID}`, `note:${ID}`]);
});

test("tagsToRevalidate — 어떤 변경이든 캐시된 태그를 덮는다(누락 검사)", () => {
  const mutations: NoteMutation[] = ["content", "metadata", "delete", "comment"];
  for (const m of mutations) {
    const tags = tagsToRevalidate(ID, m);
    assert.ok(tags.length > 0, `${m}: 비울 태그가 있어야 한다`);
    assert.equal(new Set(tags).size, tags.length, `${m}: 중복 없음`);
    assert.ok(tags.every(isNoteCacheTag), `${m}: 이 모듈이 만든 태그만`);
    /* 노트 행 캐시(note:<id>)는 모든 변경에서 비워진다 — 댓글 변경도 사양상 포함 */
    assert.ok(tags.includes(noteTag(ID)), `${m}: 행 태그 포함`);
  }
  /* 댓글 캐시에 붙는 두 태그 중 하나는 comment/delete 에서 반드시 비워진다 */
  for (const m of ["comment", "delete"] as const) {
    const tags = tagsToRevalidate(ID, m);
    assert.ok(
      noteCommentsCacheTags(ID).some((t) => tags.includes(t)),
      `${m}: 댓글 캐시가 비워진다`,
    );
  }
  /* 회차 캐시(note:<id> + public-notes)는 content/delete 에서 둘 다 비워진다 */
  for (const m of ["content", "delete"] as const) {
    const tags = tagsToRevalidate(ID, m);
    assert.ok(noteVisitsCacheTags(ID).every((t) => tags.includes(t)), `${m}: 회차 캐시`);
  }
});

test("isNoteCacheTag — 형태 검사", () => {
  assert.ok(isNoteCacheTag(noteTag(ID)));
  assert.ok(isNoteCacheTag(noteCommentsTag(ID)));
  assert.ok(isNoteCacheTag(PUBLIC_NOTES_LIST_TAG));
  assert.equal(isNoteCacheTag("market"), false);
  assert.equal(isNoteCacheTag("note:"), false, "id 없는 태그는 아니다");
});

test("태그는 revalidateTag 제한(256자) 안이고 공백이 없다", () => {
  for (const t of [...tagsToRevalidate(ID, "delete"), ...noteCommentsCacheTags(ID)]) {
    assert.ok(t.length <= 256);
    assert.equal(/\s/.test(t), false);
  }
});
