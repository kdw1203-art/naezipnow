/* [1050] 펼침 두 단계 · 홈 중복 검토. 소유자 지시(2026-10-09):
 *   "임장노트는 해당 노트를 누르면 펼쳐지기가 되어서 기존 피드의 카드 형태가 먼저 보이고 한 번 더 누르면 노트를 볼 수 있도록 /
 *    ai분석에서도 해당 기능을 누르면 펼쳐지기가 되어서 기능의 내용이 보이고 한 번 더 누르면 기능을 사용할 수 있도록 /
 *    홈에서는 중복되지 않을까? 다시 검토"
 *
 * 잠그는 사실:
 *  ① 임장노트 표(데스크톱 기본 · 폰 목록) · 폰 격자 — 첫 누름 = 그 자리에 피드 카드(PostCard) · 다시 누름 = 링크 그대로(노트).
 *     새 탭(수정키 · 가운데 단추)은 가로채지 않는다 · 접기 단추 · 펼침은 한 번에 하나.
 *  ② AI 분석 12종 — 첫 누름 = 내용(하는 일 · 결과 · 분석 순서 4단계 · 시장 신호) · 다시 누름(또는 "열기") = 예전 동작(지도 서랍/도구).
 *     내용은 서버 조각(hub-tool-detail) — tool-persona · tool-identity · 신호 엔진 · 내용 마크업을 클라이언트 번들에 싣지 않는다.
 *  ③ 홈 — 서울 구별 막대는 따로 칸이 아니라 지역 동향 안 접힘 · 접힌 줄은 브리핑 숫자(몇 곳 상승 · 평균)를 되풀이하지 않는다 ·
 *     관심 지역 없는 사람의 오늘 한 줄은 지역 동향 첫 카드와 같은 지역·거래 문장을 다시 말하지 않는다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stageStep } from "@/lib/ai/tool-stage-steps";
import { TOOL_PERSONAS } from "@/lib/ai/tool-persona";
import { AI_TOOL_IDS } from "@/lib/ai/ai-tools";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("분석 순서 — 실행 중 문구를 단계 이름으로(설명 걷기 · ~는 중 → ~기 · 목적격 조사)", () => {
  assert.equal(stageStep("국토부 실거래 불러오는 중 — 점수의 기준을 잡아요"), "국토부 실거래 불러오기");
  assert.equal(stageStep("전월세·입주 예정 확인 중 — 수요와 공급을 봐요"), "전월세·입주 예정 확인");
  assert.equal(stageStep("이웃 임장노트·뉴스를 읽는 중 — 사람이 본 것을 더해요"), "이웃 임장노트·뉴스 읽기");
  assert.equal(stageStep("신호등 3개를 켜는 중"), "신호등 3개 켜기");
  assert.equal(stageStep("위험 신호 5가지를 하나씩 점검하는 중"), "위험 신호 5가지를 하나씩 점검하기", "조사가 동사 바로 앞이 아니면 그대로");
  assert.equal(stageStep(""), "");
  for (const id of AI_TOOL_IDS) {
    const steps = TOOL_PERSONAS[id].runStages.map(stageStep);
    assert.equal(steps.length, 4, id);
    for (const s of steps) {
      assert.ok(s.length >= 4, `${id} · ${s}`);
      assert.doesNotMatch(s, / — |중$/, `${id} · ${s}`);
    }
  }
});

test("임장노트 — 표 · 폰 격자: 첫 누름 펼침(피드 카드) · 다시 누름 노트 · 새 탭은 그대로", () => {
  const f = code("app/notes/notes-feed-client.tsx");
  assert.match(f, /function firstTapExpands\(/);
  assert.match(f, /if \(isOpen \|\| e\.defaultPrevented \|\| e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey\) return;/);
  assert.match(f, /const \[openId, setOpenId\] = useState<string \| null>\(null\)/, "표 — 펼침 하나");
  assert.match(f, /onClick=\{\(e\) => firstTapExpands\(e, isOpen, \(\) => setOpenId\(n\.id\)\)\}/);
  /* [1052] 펼친 칸에 role=region · Esc 접기가 붙었다 */
  assert.match(f, /<td\s+colSpan=\{span\}\s+className="bg-bg p-2 md:p-3"[\s\S]{0,500}?<PostCard n=\{n\} \/>/, "펼친 줄 = 피드 카드 그대로");
  assert.match(f, /if \(isOpen\) router\.push\(href\);/, "링크 밖을 다시 눌러도 노트");
  assert.match(f, /grid grid-flow-row-dense grid-cols-3/, "격자 — 누른 줄 아래에 펼침");
  assert.match(f, /<GridTile n=\{n\} priority=\{i === 0\} open=\{gridOpen === n\.id\} onOpen=\{\(\) => setGridOpen\(n\.id\)\} \/>/);
  assert.match(f, /className="col-span-3 bg-bg px-2 pb-1 pt-2">\s*<PostCard n=\{n\} \/>/);
  assert.match(f, /접기 ▴/);
  assert.match(f, /노트 열기 ›/, "펼친 줄 · 펼친 타일에 다음 동작");
});

test("AI 분석 — 첫 누름 내용 · 다시 누름 예전 동작 · 내용은 서버 조립", () => {
  const t = code("app/analysis/hub-tiers.tsx");
  assert.match(t, /if \(openId === c\.id\) return open\(c\)\(e\);/, "다시 누름 = 예전 동작(지도 서랍 · 도구)");
  assert.match(t, /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return;/);
  assert.match(t, /setOpenId\(c\.id\)/);
  assert.match(t, /\{details\[c\.id\]\}/, "내용은 서버 조각");
  const d = read("app/analysis/hub-tool-detail.tsx");
  assert.ok(!d.trimStart().startsWith('"use client"') && !/^"use client"/m.test(d), "서버 조각(클라이언트 JS 0)");
  assert.match(d, /steps\.map\(/, "분석 순서 4단계");
  assert.match(d, /분석 순서/);
  assert.match(d, /시장 신호/);
  /* [1052] 단추가 할 일을 말한다 — 고른 단지 이름 · 없으면 "단지 고르고" */
  assert.match(t, /\$\{c\.title\} 열기 ›/);
  assert.match(t, /grid-flow-row-dense grid-cols-2/, "그 밖의 8종 — 누른 줄 아래");
  assert.match(t, /<td colSpan=\{4\}/);
  assert.doesNotMatch(t, /from "@\/lib\/ai\/tool-persona"|from "@\/lib\/ai\/tool-identity"|from "@\/lib\/signals\//, "번들 — 서버에서 조립");
  const w = code("app/analysis/workbench-cards.ts");
  assert.match(w, /return TOOL_PERSONAS\[id\]\.runStages\.map\(stageStep\)\.filter\(Boolean\)/);
  assert.match(w, /WORKBENCH_SIGNAL_LABELS: readonly string\[\] = Object\.values\(SIGNAL_FACTOR_META\)/);
  assert.match(code("app/analysis/page.tsx"), /<ToolDetailBody key=\{c\.id\} c=\{c\} steps=\{workbenchSteps\(c\.id\)\} signalLabels=\{WORKBENCH_SIGNAL_LABELS\}/);
  assert.ok(!read("app/analysis/workbench-cards.ts").trimStart().startsWith('"use client"'), "서버 모듈");
});

test("홈 중복 검토 — 구별 막대는 지역 동향 안 접힘 · 브리핑 숫자 되풀이 없음 · 손님 오늘 한 줄", () => {
  const page = code("app/page.tsx");
  const sec = page.slice(page.indexOf('<h2 className="t-section text-ink">지역 동향</h2>'), page.indexOf("<HomeTownBlock"));
  assert.ok(sec.includes("<HomeSeoulMoves data={data.seoulMoves} />"), "지역 동향 칸 안");
  assert.ok(sec.indexOf("<HomeSeoulMoves") < sec.indexOf('<Fineprint label="기준 · 출처">'), "기준·출처 앞");
  assert.equal(page.split("<HomeSeoulMoves").length - 1, 1, "한 곳만");
  const comp = code("app/components/home/HomeSeoulMoves.tsx");
  assert.doesNotMatch(comp, /"use client"/);
  assert.match(comp, /<details id="seoul-moves"/);
  assert.doesNotMatch(comp, /평균|상승 \{|하락 \{/, "브리핑의 '몇 곳 상승 · 평균'을 다시 말하지 않는다");
  assert.match(comp, /최고 \{top\.label\}/);
  assert.match(comp, /최저 \{bottom\.label\}/);
  const line = code("app/components/home/HomeTodayLine.tsx");
  assert.match(line, /if \(shown && personalized\) out\.push\(\{ key: "region"/);
  assert.match(line, /const tradeText = shown && personalized \? todayTradeSentence\(shown\) : null;/);
  assert.match(line, /\[shown, personalized, temp, saleIndex, baseRate, loanRate, publicNotes\]/);
  assert.doesNotMatch(line, /"대표 지역"/, "지역 문장이 없으면 대표 지역 배지도 없다");
  assert.match(line, /\{personalized && \(/);
});
