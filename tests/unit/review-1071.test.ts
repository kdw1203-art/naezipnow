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

test("T1 한 가지 꼴 — [1110] 기록 계열 표는 임장노트 분석 화면에 · 지역 시세는 고르는 자리(표는 시/도 필터 안)", () => {
  const page = read("app/analysis/page.tsx");
  assert.doesNotMatch(page, /<ToolRows/, "허브에는 시장·기록 표가 없다(1110)");
  assert.match(page, /<RegionSiseEntry data=\{regionSise\} \/>/);
  const notes = read("app/notes/analysis/page.tsx");
  assert.match(notes, /<ToolRows tools=\{RECORD_LIVE\} nowLabel="내 기록"/);
  assert.ok(!page.includes("<ToolCard") && !notes.includes("<ToolCard"), "카드가 남았다");
  /* 지역 시세 표도 같은 칸 폭(tool-cols) · 줄은 링크 */
  const entry = read("app/analysis/region-sise-entry.tsx");
  assert.match(entry, /from "\.\/tool-cols"/);
  assert.match(entry, /\$\{TOOL_COL_NAME\}/);
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

test("T3 사실 보존 — [1110] 지금 값은 지역 시세 표의 칸으로(평균 매매가 · 전세가율 · 온도) · 기록 칸은 임장노트 분석 화면으로", () => {
  const rows = read("app/analysis/hub-tool-rows.tsx");
  assert.doesNotMatch(rows, /teaser\.|<Sparkline/, "티저 · 추세선 배선은 지역 시세 분석으로 넘어갔다");
  assert.match(rows, /marketPersonaByHref\(t\.href\)/);
  assert.match(rows, /ACCEPTS_COMPLEX\.has\(t\.href\)/);
  const entry = read("app/analysis/region-sise-entry.tsx");
  for (const needle of ["평균 매매가", "전세가율", "시장 온도", "formatKrwShort(r.avgSaleKrw)", "r.jeonseRatio.toFixed(1)", "r.temp.score"]) assert.ok(entry.includes(needle), needle);
  const notes = read("app/notes/analysis/page.tsx");
  assert.match(notes, /"\/analysis\/compare": <CompareTrayCount bare \/>/);
  assert.match(notes, /<HubNoteAnalysis \/>/);
});

test("T4 조용하게 — [1110] 에이전트는 임장노트 분석 표의 한 줄 · 게스트 블록 단추 하나", () => {
  const page = read("app/analysis/page.tsx");
  assert.ok(!page.includes('href="/agent"'), "허브에 에이전트 줄 없음(1110)");
  const cat = read("app/analysis/tool-catalog.ts");
  assert.match(cat, /href: "\/agent",\s*title: "에이전트",[\s\S]{0,200}tier: "record"/);
  const notes = read("app/notes/analysis/page.tsx");
  const guest = notes.slice(notes.indexOf("공개된 AI 정리 없음") - 300, notes.indexOf("임장노트 쓰고 AI 받기") + 40);
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
  /* [1110] 에이전트는 임장노트 분석 표의 한 줄 — 칩은 계열 색(TIERS.record iconClass) · ai-chip(어두운 판 전용) 아님 */
  const rows = read("app/analysis/hub-tool-rows.tsx");
  assert.match(rows, /TIERS\[t\.tier\]\.iconClass/);
  assert.doesNotMatch(rows, /ai-chip/);
  /* 시작 상자 최소 높이 — 데스크톱 한 줄 높이로(뒤에 덧붙인 규칙) */
  assert.match(read("app/globals.css"), /\[1071 · AI 분석 한 가지 꼴\][\s\S]{0,400}\.hub-start \{\s*min-height: 4\.5rem;/);
});
