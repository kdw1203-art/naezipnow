import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVED_PREFIXES, isArchivedPath } from "../../lib/seo/archived-routes";
import { embedSnippet, embedSrc } from "../../lib/embed/snippet";

/* [992 · A1] 보관(비노출) 목록과 위젯 스니펫 — 브라우저 없이 확인 가능한 사실 */

test("[992] isArchivedPath — 세그먼트 prefix 로만 덮는다", () => {
  assert.equal(isArchivedPath("/town/experts"), true);
  assert.equal(isArchivedPath("/town/experts/abc"), true);
  assert.equal(isArchivedPath("/town/experts/"), true);
  assert.equal(isArchivedPath("/town/expertsx"), false);
  assert.equal(isArchivedPath("/town"), false);
  assert.equal(isArchivedPath("/town/news"), false);
  /* 노트 출력 3종 중 card 만 남긴다 */
  assert.equal(isArchivedPath("/notes/abc/deck"), true);
  assert.equal(isArchivedPath("/notes/abc/print"), true);
  assert.equal(isArchivedPath("/notes/abc/card"), false);
  assert.equal(isArchivedPath("/notes/abc"), false);
  /* 쪽지함(모임 채팅 안내 화면)도 보관 */
  assert.equal(isArchivedPath("/messages"), true);
});

test("[992] 보관 목록 — 정체성(임장노트·지도·AI 분석) 경로는 절대 들어가지 않는다", () => {
  for (const p of ARCHIVED_PREFIXES) {
    assert.ok(p.startsWith("/"), p);
    assert.ok(!/^\/(notes|map|analysis|complex|region|subscription|my)$/.test(p), `핵심 경로가 보관됨: ${p}`);
  }
  for (const live of ["/notes", "/notes/new", "/map", "/analysis", "/analysis/ai/ai-diagnosis", "/subscription", "/my", "/complex/browse", "/calculator/gap", "/embed/complex/x"]) {
    assert.equal(isArchivedPath(live), false, live);
  }
});

test("[992] 위젯 스니펫 — 옛 생성기(/widget)와 같은 형식, id 는 URL 인코딩", () => {
  assert.equal(embedSrc("complex", "서울 강남구/래미안"), "https://naezipnow.com/embed/complex/%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC%2F%EB%9E%98%EB%AF%B8%EC%95%88");
  const s = embedSnippet("region", "seoul-gangnam");
  assert.ok(s.startsWith('<iframe src="https://naezipnow.com/embed/region/seoul-gangnam"'));
  assert.ok(s.includes('height="260"'));
  assert.ok(s.includes('title="내집나우 지역 시세 위젯"'));
  assert.ok(embedSnippet("complex", "x", 300).includes('height="300"'));
  assert.ok(embedSnippet("complex", "x").includes("내집나우 실거래 시세 위젯"));
});
