import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * [986] 화면 사이 **딥링크 규약**을 지킨다.
 *
 * 이 세 쌍은 "보내는 쪽"과 "읽는 쪽"이 다른 파일에 있고, 타입으로 이어져 있지
 * 않다. 한쪽에서 파라미터 이름을 바꾸면 링크는 여전히 열리고 화면도 정상으로
 * 보이지만 **아무것도 넘어가지 않는다** — 조용히 죽는 종류의 결함이라, 사람이
 * 눈으로 볼 때까지 아무도 모른다. 이름이 갈리는 순간 여기서 깨진다.
 *
 * 문자열 검사인 이유: 읽는 쪽이 클라이언트 컴포넌트("use client")라 단위
 * 테스트에서 실행할 수 없다. 실행 대신 **계약이 양쪽에 적혀 있는지**를 본다.
 */
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const toolsRow = read("app/notes/[id]/NoteToolsRow.tsx");
const workbench = read("app/analysis/ai/[tool]/WorkbenchClient.tsx");
const agentChat = read("app/agent/AgentChat.tsx");

test("노트 → AI 도구: 보내는 파라미터를 워크벤치가 읽는다", () => {
  /* 보내는 쪽 */
  assert.match(toolsRow, /apt/, "NoteToolsRow 가 apt 를 싣지 않는다");
  assert.match(toolsRow, /region/, "NoteToolsRow 가 region 을 싣지 않는다");
  /* 읽는 쪽 — WorkbenchClient [OPT-48] 딥링크 */
  assert.match(workbench, /sp\.get\("apt"\)/, "워크벤치가 apt 를 읽지 않는다");
  assert.match(workbench, /sp\.get\("region"\)/, "워크벤치가 region 을 읽지 않는다");
});

test("노트 → 에이전트: 질문 파라미터 이름이 양쪽에서 같다", () => {
  assert.match(toolsRow, /\/agent\?q=/, "NoteToolsRow 가 /agent?q= 로 보내지 않는다");
  assert.match(agentChat, /get\("q"\)/, "AgentChat 이 q 를 읽지 않는다");
});

test("에이전트로 넘긴 질문을 **자동 전송하지 않는다** — 누르지 않은 질문에 한도가 깎이면 안 된다", () => {
  /* q 를 읽는 효과 안에서 send( 를 부르지 않아야 한다 */
  const i = agentChat.indexOf('get("q")');
  assert.ok(i > 0);
  const block = agentChat.slice(i, i + 400);
  assert.doesNotMatch(block, /\bsend\s*\(/, "q 를 읽자마자 전송하고 있다");
  assert.match(block, /setInput/, "입력칸에 채우지 않는다");
});

test("노트 도구 카드는 단지·지역이 하나도 없으면 그리지 않는다 — 빈 도구 화면으로 보내지 않는다", () => {
  assert.match(toolsRow, /if \(!apt && !reg\) return null;/);
});
