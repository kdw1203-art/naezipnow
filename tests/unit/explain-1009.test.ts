import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY_TERMS } from "@/lib/seo/glossary-terms";
import { EXPLAIN_TERM_NAMES, explainTermName } from "@/lib/explain/term-index";
import { SITE_NOTES } from "@/lib/explain/site-notes";

/* [1009] ⓘ 설명 버튼의 이름 목록이 용어사전 원본과 한 글자도 어긋나지 않는다 */

test("[1009] 용어 이름 목록 = 용어사전(슬러그·이름·개수)", () => {
  const names = EXPLAIN_TERM_NAMES as Record<string, string>;
  assert.equal(Object.keys(names).length, GLOSSARY_TERMS.length);
  for (const t of GLOSSARY_TERMS) assert.equal(names[t.slug], t.term, t.slug);
  assert.equal(explainTermName("jeonse-garyul"), "전세가율");
  assert.equal(explainTermName("없는-용어"), null);
});

test("[1009] 사이트 공통 읽는 법 — 보합 기준이 코드 상수와 같다", () => {
  const text = SITE_NOTES.delta.body.join(" ");
  assert.match(text, /±0\.05%/);
  assert.match(text, /변동 미상/);
});
