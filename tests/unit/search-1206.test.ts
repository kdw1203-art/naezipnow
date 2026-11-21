/* [1206] 검색 무결과 — XML 글자 참조 · 행정동 → 법정동 · 실거래 키 안정 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeXmlEntities, encodeXmlText } from "@/lib/national-data/xml-entities";
import { adminDongToLegal, parseSearchIntent } from "@/lib/search/query-intent";

test("XML 글자 참조 — 단지명의 &amp; · &lt; · 숫자 참조를 한 번만 푼다", () => {
  assert.equal(decodeXmlEntities("철산역롯데캐슬&amp;SKVIEW클래스티지"), "철산역롯데캐슬&SKVIEW클래스티지");
  assert.equal(decodeXmlEntities("a&lt;b&gt;c&quot;d&#39;e&#x26;f"), "a<b>c\"d'e&f");
  assert.equal(decodeXmlEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeXmlEntities("그대로&없음"), "그대로&없음");
  assert.equal(decodeXmlEntities("&unknown;"), "&unknown;");
});

test("실거래 키 — 풀린 이름을 원천 표기로 되돌리면 수정 전 키와 같다", () => {
  const raw = "철산역롯데캐슬&amp;SKVIEW클래스티지";
  assert.equal(encodeXmlText(decodeXmlEntities(raw)), raw);
  const src = readFileSync("lib/market/molit-transactions.ts", "utf8");
  assert.match(src, /encodeXmlText\(name\)/);
});

test("XML 파서 셋이 모두 글자 참조를 푼다", () => {
  for (const f of ["lib/national-data/molit-api.ts", "lib/national-data/buildhub-api.ts", "lib/seoul/openapi-client.ts"]) {
    assert.match(readFileSync(f, "utf8"), /decodeXmlEntities\(/, f);
  }
});

test("행정동 → 법정동 — 번호 동만, 건물 번호는 그대로", () => {
  assert.equal(adminDongToLegal("개포3동"), "개포동");
  assert.equal(adminDongToLegal("상계10동"), "상계동");
  assert.equal(adminDongToLegal("역삼1·2동"), "역삼동");
  assert.equal(adminDongToLegal("래미안101동"), "래미안101동");
  assert.equal(adminDongToLegal("개포동"), "개포동");
  assert.equal(adminDongToLegal("목동7단지"), "목동7단지");
  assert.deepEqual(parseSearchIntent("개포3동 신축").rest, ["개포동"]);
});

test("붙여 쓴 지역+단지명 — planSearch 가 앞 2~4자를 지역으로 한 번 더 묻는다", () => {
  const src = readFileSync("lib/search/intent-server.ts", "utf8");
  assert.match(src, /splitGluedArea\(parsed\.rest\[0\]\)/);
  assert.match(src, /r\.kind !== "dong"/);
});

test("미리보기 환경 변수가 비면 미리보기 빌드 생략 · 운영은 그대로", async () => {
  // @ts-expect-error — .mjs 스크립트(타입 없음)
  const { shouldSkipBuild } = await import("../../scripts/vercel-ignore.mjs");
  assert.equal(shouldSkipBuild({ ref: "claude/x", changedFiles: ["app/page.tsx"], vercelEnv: "preview", previewEnvReady: false }).skip, true);
  assert.equal(shouldSkipBuild({ ref: "claude/x", changedFiles: ["app/page.tsx"], vercelEnv: "preview", previewEnvReady: true }).skip, false);
  assert.equal(shouldSkipBuild({ ref: "main", changedFiles: ["app/page.tsx"], vercelEnv: "production", previewEnvReady: false }).skip, false);
});
