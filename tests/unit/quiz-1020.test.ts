import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/* [1020 · 게임 /quiz] 시안(quiz-d/m.png)대로 고도화 — 구조를 못 박는다(소스 문자열 검사, 렌더 없음).
 *  · page.tsx: 폭 560 한 열 → lg 두 열(가운데 minmax(0,1fr) + 레일 300px), 네이비 히어로 없음
 *  · QuizGame: 대결판 한 카드(md+ A | 56px VS | B) · 답 줄 "B가 더 싸요/비싸요" · 폰 sticky 는 md:hidden · 공개 전 "?억 ?,???만"
 *  · QuizReveal: 가격 막대(qz-bar) · 3.3㎡당 · 다음 버튼은 md+ 만(hidden … md:block) — 파일당 채움 파랑 1개
 *  · QuizRail: lg 전용 sticky 레일, 로그인 안내 없음(기록은 기기 저장이 사실)
 *  · globals.css: `[1020 · 게임 /quiz]` 블록(qz-vs · qz-bar) 이 파일 끝쪽에 추가돼 있다 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 게이트(scripts/check-ai-look.mjs)와 같은 방식 — 주석은 검사하지 않는다 */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

test("[1020] /quiz page.tsx — lg 두 열(가운데 + 레일 300px) · base grid-cols-1 · 히어로 없음", () => {
  const src = strip(read("app/quiz/page.tsx"));
  assert.match(src, /lg:grid grid-cols-1 lg:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.ok(src.includes("max-w-[1080px]") && !src.includes("max-w-[560px]"));
  assert.ok(!src.includes("hub-hero") && !src.includes("brand-navy-card"));
  assert.ok(src.includes("<h1 className=\"t-title text-ink\">실거래가 게임</h1>"), "제목은 page.tsx 그대로");
});

test("[1020] QuizGame — 대결판 한 카드(md+ A|VS|B) · 답 줄 문구 · 폰 sticky 만 md:hidden · 공개 전 물음표 가격", () => {
  const src = strip(read("app/quiz/QuizGame.tsx"));
  assert.ok(src.includes('className="contents"'), "루트는 contents — page 그리드의 칸이 된다");
  assert.match(src, /grid grid-cols-1 md:grid-cols-\[minmax\(0,1fr\)_56px_minmax\(0,1fr\)\]/);
  assert.ok(src.includes('className="qz-vs"'));
  assert.ok(src.includes("▼ B가 더 싸요") && src.includes("▲ B가 더 비싸요"));
  assert.ok(src.includes("?억 ?,???만"), "공개 전 B 가격");
  assert.ok(src.includes("hidden grid-cols-2 gap-2 border-t border-line bg-bg p-3 md:grid"), "md+ 답 줄은 카드 안 고정");
  assert.match(src, /sticky bottom-\[calc\(var\(--nz-tabbar-offset\)\+8px\)\] z-10 md:hidden/, "폰 엄지 영역만 sticky");
  assert.ok(src.includes("· 맞힘 {correct}"), "첫 줄 N / 10 · 맞힘 M");
  assert.ok(!src.includes("hub-hero") && !/font-extrabold|font-black/.test(src));
  assert.equal(count(src, /\bbtn-primary\b/g), 2, "채움 파랑: 결과 공유 + 폰 sticky 다음");
  /* 기존 로직이 그대로인가 — 키보드·공유·다시 풀기·조각·첫 판만 기록 */
  for (const s of ["ArrowLeft", "navigator.share", "다시 풀기", "njnConfetti", "recordQuizResult("]) assert.ok(src.includes(s), s);
});

test("[1020] QuizReveal — 가격 막대 둘 · 3.3㎡당 · 준공/층 차이는 값이 둘 다 있을 때만 · 다음 버튼은 md+ 만", () => {
  const src = strip(read("app/quiz/QuizReveal.tsx"));
  assert.ok(src.includes('className="qz-bar"'));
  assert.ok(src.includes('<Bar tag="A"') && src.includes('<Bar tag="B"'));
  assert.ok(src.includes("3.3㎡당") && src.includes("3.3058"));
  assert.ok(src.includes("a.buildYear && b.buildYear") && src.includes("a.floor && b.floor"));
  assert.ok(src.includes('className="hidden px-4 pb-4 md:block"'), "카드 안 다음 버튼은 md+ 만(폰은 sticky)");
  assert.equal(count(src, /\bbtn-primary\b/g), 1);
  assert.ok(src.includes("결과 보기") && src.includes("다음 문제 ("));
  assert.ok(!/[가-힣]!(?![=])/.test(src), "느낌표 없음");
});

test("[1020] QuizRail — lg 전용 sticky 레일 · 기록은 있는 값만 · 로그인 안내 없음 · 공개 전 B 는 이름만", () => {
  const src = strip(read("app/quiz/QuizRail.tsx"));
  assert.match(src, /hidden lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-\[76px\] lg:self-start/);
  assert.ok(!src.includes("로그인"), "기록은 기기 저장이 사실 — 로그인 유도 없음");
  assert.ok(src.includes("Object.keys(store.days).length"));
  assert.ok(src.includes("rows.length > 0 &&"), "줄이 없으면 기록 카드 생략");
  assert.ok(src.includes("hiddenIdx"), "공개 전 B 는 링크 없이 이름만");
  assert.ok(!/이번 주|전체 정답률/.test(src), "저장소에 없는 값은 그리지 않는다");
});

test("[1020] globals.css — 게임 블록은 파일 끝쪽에 추가됐고 qz-vs · qz-bar 규칙이 있다", () => {
  const css = read("app/globals.css");
  const at = css.indexOf("[1020 · 게임 /quiz]");
  assert.ok(at > 0);
  const block = css.slice(at);
  assert.ok(block.includes(".qz-vs::before") && block.includes(".qz-bar i") && block.includes(".qz-ans--picked"));
  assert.ok(!/linear-gradient|font-weight:\s*[89]00/.test(block));
});
