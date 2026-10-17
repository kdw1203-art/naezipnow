/* [1072] 소유자 2026-10-16 — "세부디자인도 개선해줘". /analysis 허브(1071)에 이어 도구 화면(/analysis/ai/[tool], 12종 공통)의 세부.
 * 로컬 1240px · 390px 캡처(고르기 전 · 은마로 고른 뒤 6종)에서 본 것과 잠그는 것:
 *  D1 경로 줄 하나 — 단지 분석 4종 머리에 "AI 분석 › 단지 분석" 이 PageShell 경로 줄 바로 아래 한 번 더 있었다.
 *  D2 빈 상태 — 고르기가 먼저(폰은 회색 견본을 숨겨 검색이 첫 화면 위로) · 제목 "단지 고르기" + 고르는 방법 한 줄 ·
 *     견본은 옅은 면 + "결과가 들어갈 자리"(로딩 뼈대로 읽히지 않게) · "단지 선택 → 결과" 화살표 문장 없음.
 *  D3 다른 도구 줄 — 결론과 그림 사이 알약 다섯 개 → 결론 카드 맨 위 탭 줄(지금 도구 = 파란 밑줄).
 *  D4 핵심 숫자 — 카드 밖 회색 칸 넷 + 떠 있는 출처 줄 → 카드 하나(칸 사이 가는 선 · 출처는 아랫단) · 값 없는 칸은 "자료 없음" 한 번.
 *  D5 접힘 — 근거·출처 / 자세히 보기 카드 두 장 → 카드 하나 안의 두 줄 · 접힘 줄마다 "펼치기 ▾ / 접기 ▴" ·
 *     그릴 달이 없는 실거래 흐름은 접힘 카드 대신 제목 | "최근 매매 실거래 없음" 한 줄.
 *  D6 면책 — 문장 그대로(compliance 낱말) · 회색 면 150자 줄 → 위 가는 선 + t-caption + 72자 폭. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const DIR = "app/analysis/ai/[tool]/";
const page = read(`${DIR}page.tsx`);
const workbench = read(`${DIR}WorkbenchClient.tsx`);
const sig = read(`${DIR}signature-cards.tsx`);
const board = read(`${DIR}VerdictBoard.tsx`);
const card = read(`${DIR}VerdictCard.tsx`);
const result = read(`${DIR}ResultView.tsx`);
const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test("D1 경로 줄 하나 — 4종 머리의 둘째 경로 줄(nav · header.crumb)이 없다", () => {
  const head = between(workbench, "{header && (", "<StepLine");
  assert.doesNotMatch(head, /<nav\b/);
  assert.doesNotMatch(workbench, /header\.crumb|crumb: string/);
  assert.doesNotMatch(page, /crumb:/);
  /* 경로 줄은 PageShell 의 것 하나 */
  assert.match(page, /<PageShell breadcrumb=\{`AI 분석 › \$\{identity\.title\}`\}>/);
  /* 제목·사실 한 줄은 그대로 */
  assert.match(head, /<h1 className="t-title text-ink">\{title\}<\/h1>/);
});

test("D2 빈 상태 — 고르기 먼저 · 제목 + 고르는 방법 한 줄 · 견본은 옆 면(폰 숨김) · 화살표 문장 없음", () => {
  assert.doesNotMatch(page, /"[a-z-]+": "단지 선택/);
  assert.doesNotMatch(workbench, /\{emptyLine\}<\/p>\s*\)\}\s*\{isPortfolio/, "예전 한 문장 자리(제목 없이 굵은 한 줄)");
  assert.match(page, /const PICK_WAYS = "이름 검색 · 지도에서 찾기";/);
  /* 비교·자산 구성은 그 도구에 실제로 있는 단추를 앞에 */
  assert.match(page, /"ai-compare": `2~3곳 담기 · \$\{PICK_WAYS\}`/);
  assert.match(page, /"ai-portfolio": `관심 단지 불러오기 · \$\{PICK_WAYS\}`/);
  assert.match(workbench, /isCompare && compareTray\.length < 2/, "비교는 2곳이 찰 때까지 고르기 카드");
  assert.match(workbench, /내 관심 단지 불러오기/);
  const pick = between(workbench, 'aria-label="단지 고르기"', "{/* [1008 · 리뷰 A-3]");
  /* 고르기(제목 → 검색)가 견본보다 먼저 */
  const at = ["단지 고르기</h2>", "<ComplexPicker", "<EmptyFrame tool={tool} />"].map((k) => pick.indexOf(k));
  for (const i of at) assert.ok(i > 0);
  assert.ok(at[0] < at[1] && at[1] < at[2], "제목 → 검색 → 견본 순서");
  /* 견본 면 — 폰에서는 숨긴다 · 자리라는 한 줄 · 장식(aria-hidden) */
  assert.match(pick, /className="flex flex-col items-center justify-center gap-2 border-line bg-bg p-6 max-md:hidden md:border-l" aria-hidden="true"/);
  assert.match(pick, /결과가 들어갈 자리/);
  /* 거래 많은 단지 — 행(이름 · 지역 | 건수) · 48px */
  assert.match(pick, /최근 6개월 거래가 많은 단지 \{quickPicks\.length\}곳/);
  assert.match(pick, /press flex min-h-\[48px\] min-w-0 items-center justify-between/);
  /* 견본 그림 자체는 그대로 — 글자·숫자 없음 */
  assert.doesNotMatch(read(`${DIR}empty-frames.tsx`), /<text/);
});

test("D3 다른 도구 줄 — 결론 카드 맨 위 탭 줄(지금 도구 파란 밑줄) · 결론과 그림 사이에는 없다", () => {
  const line = between(sig, "export function SummaryLine(", "function scoreTone(");
  /* 탭 줄이 결론(h2)보다 먼저 · 카드 안쪽 여백만큼 펼친다(SigCard p-4 md:p-5) */
  const tabsAt = line.indexOf("{tools && <div");
  const headAt = line.indexOf('<h2 className="cxw-sum-h');
  assert.ok(tabsAt > 0 && tabsAt < headAt, "탭 줄이 결론 위에 있다");
  assert.match(line, /-mx-4 -mt-4 mb-2\.5 border-b border-line px-1\.5 md:-mx-5 md:-mt-5 md:px-2\.5/);
  assert.match(sig, /className=\{`card cxw-sig rounded-2xl p-4 md:p-5 \$\{className\}`\}/);
  /* 결론 아래 {tools} 는 없다(한 번만) */
  assert.equal((line.match(/\{tools\}/g) ?? []).length, 1);
  const chips = between(board, "export function VerdictChips(", "/* ── ③ 내 임장노트 칩");
  assert.match(chips, /border-b-2/);
  assert.match(chips, /aria-current="page" className=\{`\$\{chip\} border-primary text-ink`\}/);
  assert.match(chips, /press border-transparent text-text-2 hover:text-ink/);
  /* 판정 없는 칸에 "—" 를 그리지 않는다 · 탭에 없는 도구는 "같은 단지" 머리 */
  assert.doesNotMatch(chips, />—</);
  assert.match(chips, /같은 단지/);
  /* 테두리 알약 모양(chip ... border px-3)은 걷었다 */
  assert.doesNotMatch(chips, /"chip inline-flex/);
});

test("D4 핵심 숫자 — 카드 하나 · 칸 사이 가는 선 · 출처는 아랫단 · 값 없는 칸은 '자료 없음' 한 번", () => {
  const tiles = between(card, "export function VerdictTiles(", "export function VerdictCard(");
  assert.match(tiles, /grid grid-cols-2 gap-px bg-line/);
  assert.match(tiles, /className="flex min-w-0 flex-col bg-surface px-4 py-3 max-md:px-3\.5"/);
  assert.doesNotMatch(tiles, /rounded-lg bg-bg/, "바탕과 같은 회색 칸");
  assert.match(tiles, /<b className="t-body font-bold text-text-3">자료 없음<\/b>/);
  assert.doesNotMatch(tiles, />—</);
  assert.match(tiles, /const caption = t\.value \? tileCaption\(t, when\) : \(t\.note \?\? ""\);/);
  /* 홀수 칸 — 폰에서 마지막 칸이 두 칸(빈 회색 칸 없음) */
  assert.match(tiles, /\[&>li:last-child:nth-child\(odd\)\]:col-span-2/);
  const view = between(result, "{tiles.length > 0 && (", "{/* 폰 한 열");
  assert.match(view, /<section className="card overflow-hidden rounded-2xl" aria-label="핵심 숫자">/);
  assert.match(view, /<p className="border-t border-line px-4 py-2\.5 t-caption text-text-3 break-words max-md:px-3\.5">/);
  assert.match(view, /공공데이터 자동 계산/);
});

test("D5 접힘 — 근거·출처 + 자세히 보기는 카드 하나 · 접힘 줄마다 펼치기/접기 · 빈 실거래 흐름은 한 줄", () => {
  const more = between(result, 'data-testid="cxw-more"', "    </div>\n  );\n}");
  /* 카드 안 목록 — 전역 lq 판(색 면)을 부르지 않게 plain · 카드 면은 바깥 하나 */
  assert.match(more, /^data-testid="cxw-more">\s*<div className="flex flex-col divide-y divide-line" data-tone="plain">/);
  assert.ok(more.indexOf("<EvidenceCard") > 0 && more.indexOf("<Details") > more.indexOf("<EvidenceCard"));
  /* 두 details 는 카드 면을 벗는다(바깥 카드가 감싼다) */
  const ev = between(result, "function EvidenceCard(", "export function ResultView(");
  assert.match(ev, /<details className="group px-4 max-md:px-3\.5" aria-label="근거 · 출처">/);
  assert.doesNotMatch(ev, /<details[^>]*\sopen/, "근거는 닫힌 채");
  const det = between(result, "function Details(", "function EvidenceCard(");
  assert.match(det, /<details className="group px-4 max-md:px-3\.5">/);
  assert.doesNotMatch(det + ev, /<details className="card/);
  /* 펼치기/접기 표시 — 접힘 셋 모두(실거래 흐름 · 근거 · 자세히) · 글자는 summary 안 */
  const word = between(result, "function FoldWord(", "function FoldCard(");
  assert.match(word, /group-open:hidden">펼치기 ▾</);
  assert.match(word, /hidden group-open:inline">접기 ▴</);
  assert.match(word, /dead-control-ok: 늘 <details><summary> 안에서만/);
  for (const [name, seg] of [
    ["FoldCard", between(result, "function FoldCard(", "function PriceFlowCard(")],
    ["Details", det],
    ["EvidenceCard", ev],
  ] as const) {
    const sum = seg.slice(seg.indexOf("<summary"), seg.indexOf("</summary>"));
    assert.match(sum, /<FoldWord \/>/, name);
  }
  /* 그릴 달이 없으면 한 줄 카드 · "○○ 없음" 말투 · 예전 문장 없음 */
  const flow = between(result, "function PriceFlowCard(", "/* ── 다음 할 일");
  assert.match(flow, /if \(months\.length === 0\) \{/);
  assert.match(flow, /"최근 매매 실거래 없음"/);
  assert.doesNotMatch(result, /그래프를 그리지 않았어요/);
  /* 순서는 그대로 — 실거래 흐름 → 근거 → 자세히 */
  assert.ok(result.indexOf("<PriceFlowCard") < result.indexOf("<EvidenceCard") && result.indexOf("<EvidenceCard") < result.indexOf("<Details"));
});

test("D6 면책 — 문장·마커 그대로 · 선 + 작은 글씨 + 72자 폭", () => {
  assert.equal((page.match(/data-ai-compliance="notice"/g) ?? []).length, 1);
  assert.match(page, /data-ai-compliance="notice"\s+className="max-w-\[72ch\] border-t border-line pt-3 t-caption text-text-3"/);
  for (const w of ["투자 권유·수익 보장·법률·세무", "최종 판단과 책임은 이용자 본인에게 있습니다", "[AI 서술]"]) assert.ok(page.includes(w), w);
  assert.doesNotMatch(page, /rounded-lg bg-bg px-4 py-3 t-sub text-text-3/);
});

test("규칙 — 기호·이모지 없음 · 굵기 700 까지 · 채움 단추 늘지 않음", () => {
  for (const [name, s] of [
    ["workbench", workbench],
    ["result", result],
    ["board", board],
    ["card", card],
    ["sig", sig],
  ] as const) {
    assert.doesNotMatch(s, /[✓★🍂🎉✍️]/u, name);
    assert.doesNotMatch(s, /font-extrabold|font-black/, name);
  }
  /* 이번에 더한 줄에 채움 단추(btn-primary)는 없다 — 1071 과 같은 수(결과 본문은 한도 초과 안내의 주간권 하나뿐) */
  assert.equal((workbench.match(/btn-primary/g) ?? []).length, 0);
  assert.equal((result.match(/className="btn-primary/g) ?? []).length, 1);
  assert.match(result, /className="btn-primary btn-md no-underline"\s*>\s*주간권 1,100원으로 계속하기/);
});
