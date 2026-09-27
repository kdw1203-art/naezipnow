import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [1013] globals.css 가 정의하지 않은 변수를 fallback 없이 쓰면(var(--line)) 그 선언이 통째로 무효가 된다 —
   리퀴드 목록의 행 사이 선이 글자색(짙은 남회색)으로, 판 테두리·유리 카드 테두리는 아예 사라졌었다.
   인라인 style 로만 넣는 애니메이션 변수(--dx·--dy·--rot)만 예외. */
test("[1013] globals.css — fallback 없는 var() 는 모두 정의된 변수", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const INLINE_ONLY = new Set(["--dx", "--dy", "--rot"]);
  const missing = [...css.matchAll(/var\((--[\w-]+)\s*\)/g)]
    .map((m) => m[1])
    .filter((v) => !defined.has(v) && !INLINE_ONLY.has(v));
  assert.deepEqual([...new Set(missing)], []);
});
