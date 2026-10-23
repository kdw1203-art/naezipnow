/* [1071] 소유자 2026-10-16 — "부족해 더 개선해줘 특히 ai분석 관련 디자인을 더 개선해줘" · "디자인 개선을 제대로 해줘".
 * 화면 전체 캡처(로컬 1240px)에서 본 것: 세 계열이 세 가지 모양이었다(표 · 큰 카드 4장 · 카드+실행 카드+단추 셋)
 * + 혼자 어두운 남색 띠. 잠그는 것:
 *  T1 한 가지 꼴 — 지역 시세·내 임장노트도 단지 분석과 같은 표(ToolRows)로 그린다.
 *  T2 칸 맞춤 — 세 표가 같은 칸 폭 상수(tool-cols)를 쓴다 · 그 파일은 import 0(클라이언트 묶음 예산).
 *  T3 사실 보존 — 실측 값 · 출처 · 추세선 · 지역 바꿔 보기 · 내 노트 수 · 비교 후보 수가 표 칸으로 옮겨 왔다.
 *  T4 조용하게 — 남색 띠(ai-panel) 대신 흰 판 한 줄 · 게스트 블록은 단추 하나 + 글자 링크 둘. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("T1 한 가지 꼴 — 시장·기록 계열도 같은 표", () => {
  const page = read("app/analysis/page.tsx");
  assert.match(page, /<ToolRows\s+tools=\{MARKET_LIVE\}\s+nowLabel="지금 값"/);
  assert.match(page, /<ToolRows\s+tools=\{RECORD_LIVE\}\s+nowLabel="내 기록"/);
  /* 시장·기록 계열에 카드가 남아 있지 않다(예시 계산 접힌 칸의 카드는 그대로) */
  const market = page.slice(page.indexOf('id="tier-market"'), page.indexOf('id="tier-record"'));
  assert.ok(!market.includes("<ToolCard"), "시장 계열에 카드가 남았다");
  const record = page.slice(page.indexOf('id="tier-record"'), page.indexOf('href="/agent"'));
  assert.ok(!record.includes("<ToolCard"), "기록 계열에 카드가 남았다");
  /* 줄 전체가 눌린다 — 단지 분석 표와 같은 손맛 */
  const rows = read("app/analysis/hub-tool-rows.tsx");
  assert.match(rows, /<ClickRow/);
  assert.match(read("app/analysis/hub-click-row.tsx"), /closest\("a,button"\)/);
});

test("T2 칸 맞춤 — 세 표가 같은 칸 폭 상수를 쓴다", () => {
  const cols = read("app/analysis/tool-cols.ts");
  assert.doesNotMatch(cols, /^import /m, "tool-cols 는 import 0 이어야 한다(클라이언트 묶음)");
  for (const p of ["app/analysis/hub-tiers.tsx", "app/analysis/hub-tool-rows.tsx"]) {
    const s = read(p);
    assert.match(s, /from "\.\/tool-cols"/, p);
    assert.match(s, /\$\{TOOL_COL_NAME\}/, p);
    assert.match(s, /\$\{TOOL_COL_RESULT\}/, p);
    assert.match(s, /md:table-fixed/, p);
  }
  /* 단지 분석 표(클라이언트)는 페르소나 모듈을 끌어오지 않는다 — 예산(980 주석) */
  assert.doesNotMatch(read("app/analysis/hub-tiers.tsx"), /from "[^"]*(tool-persona|hub-tool-rows)"/);
});

test("T3 사실 보존 — 카드에 있던 것이 표 칸으로", () => {
  const rows = read("app/analysis/hub-tool-rows.tsx");
  assert.match(rows, /teaser\.deltaPct != null/);
  assert.match(rows, /\{teaser\.caption\}/);
  assert.match(rows, /<Sparkline values=\{spark\}/);
  assert.match(rows, /marketPersonaByHref\(t\.href\)/);
  assert.match(rows, /ACCEPTS_COMPLEX\.has\(t\.href\)/);
  const page = read("app/analysis/page.tsx");
  assert.match(page, /"\/notes": <HubMyNoteTeaser bare \/>/);
  assert.match(page, /"\/analysis\/compare": <CompareTrayCount bare \/>/);
  assert.match(page, /<HubNoteAnalysis \/>/);
});

test("T4 조용하게 — 남색 띠 걷음 · 게스트 블록 단추 하나", () => {
  const page = read("app/analysis/page.tsx");
  const agent = page.slice(page.indexOf('href="/agent"') - 40, page.indexOf("에이전트</span>") + 20);
  assert.doesNotMatch(agent, /ai-panel/);
  assert.match(agent, /className="card press/);
  const guest = page.slice(page.indexOf("공개된 AI 정리 없음") - 300, page.indexOf("임장노트 쓰고 AI 받기") + 40);
  assert.equal((guest.match(/className="btn-/g) ?? []).length, 1, "게스트 블록의 단추는 하나");
  assert.match(guest, /공개 노트 보기 ›/);
  assert.match(guest, /로그인 ›/);
});

test("T5 임장노트 AI 분석 — 표와 같은 머리줄 · 할 일 하나 · 흐린 대형 단추 없음", () => {
  const card = read("app/analysis/ai-note-analysis.tsx");
  /* 머리줄: 칩 · 이름 | 오른쪽 할 일 하나(로그인이면 분석 실행, 아니면 로그인) */
  assert.match(card, /<div className="flex min-h-11 items-center gap-2\.5">/);
  assert.match(card, /className="btn-primary btn-md shrink-0 disabled:opacity-60"/);
  /* [1086 · A4] 로그인 링크는 지금 화면으로 돌아오게(useReturnHref) — 모양은 그대로 */
  assert.match(card, /<Link href=\{loginHref\} className="btn-outline btn-md shrink-0 no-underline">/);
  /* 로그아웃이면 머리줄이 말한다 — 아래 띠는 세션 만료(로그인으로 알았는데 서버가 거절)일 때만 */
  assert.match(card, /state\.kind === "login" && loggedIn \? \(/);
  /* 화면 폭만 한 단추(btn-cta)는 없다 */
  assert.doesNotMatch(card, /btn-cta/);
  /* 자리표시자도 같은 머리줄 — 바꿔 끼울 때 덜컹거리지 않게 */
  assert.match(read("app/analysis/hub-picker.tsx"), /<div className="flex min-h-11 items-center gap-2\.5">/);
  assert.doesNotMatch(read("app/analysis/hub-picker.tsx"), /btn-cta/);
  /* 에이전트 칩은 흰 판에서 보이는 색 */
  const page = read("app/analysis/page.tsx");
  const agent = page.slice(page.indexOf('href="/agent"'), page.indexOf("에이전트</span>"));
  assert.match(agent, /bg-primary-soft text-primary/);
  assert.doesNotMatch(agent, /className="[^"]*ai-chip/);
  /* 시작 상자 최소 높이 — 데스크톱 한 줄 높이로(뒤에 덧붙인 규칙) */
  assert.match(read("app/globals.css"), /\[1071 · AI 분석 한 가지 꼴\][\s\S]{0,400}\.hub-start \{\s*min-height: 4\.5rem;/);
});
