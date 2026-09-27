import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { countRegions, feedSummaryLine, regionChipOf } from "@/app/notes/region-chips";

/* [1012] B 축(임장노트 · 내 집 마련 · 마이) — "AI 가 만든 사이트" 신호 걷기.
 *
 * 1) 공개 노트 피드의 지역 칩 재료(countRegions)는 순수 함수 — 손에 든 노트를 시·구 단위로 세고
 *    많은 곳부터, 같은 수는 먼저 나온 순서(임의 재배열 금지).
 * 2) 소스 잠금 — 인스타 스토리 링·이모지·800 굵기·금지 문구가 담당 경로에 되돌아오지 않게. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const B_DIRS = [
  "app/notes",
  "app/imjang",
  "app/journey",
  "app/quiz",
  "app/my",
  "app/points",
  "app/payment",
  "app/u",
  "app/calculator",
  "app/guides",
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walkTsx(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** 게이트(scripts/check-ai-look.mjs)와 같은 방식 — 주석 줄은 검사하지 않는다 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* ───────────── 1) 지역 칩 재료 ───────────── */

test("[1012] countRegions — 시·구 단위로 세고 많은 곳부터, 같은 수는 먼저 나온 순서", () => {
  const notes = [
    { region: "서울 송파구 가락동" },
    { region: "경기 안양시 동안구 관양동" },
    { region: "서울특별시 송파구 잠실동" },
    { region: "서울 마포구" },
    { region: "경기 안양시 동안구" },
    { region: "" },
    { region: "판교" },
  ];
  const chips = countRegions(notes);
  assert.deepEqual(chips, [
    { label: "서울 송파구", count: 2 },
    { label: "안양시 동안구", count: 2 },
    { label: "서울 마포구", count: 1 },
    { label: "판교", count: 1 },
  ]);
  /* 빈 지역은 칩이 되지 않는다 — "" 라벨 없음 */
  assert.ok(chips.every((c) => c.label.length > 0));
});

test("[1012] regionChipOf — 내 노트 뷰가 이미 채운 regionGroup 이 있으면 그것을, 없으면 region 에서 접는다", () => {
  assert.equal(regionChipOf({ region: "서울 송파구 가락동", regionGroup: "서울 송파구" }), "서울 송파구");
  assert.equal(regionChipOf({ region: "서울 송파구 가락동" }), "서울 송파구");
  assert.equal(regionChipOf({ region: undefined }), "");
});

test("[1012] feedSummaryLine — 노트 수 · 지역 수. 0건이면 빈 문자열(숫자를 지어내지 않는다)", () => {
  assert.equal(feedSummaryLine([]), "");
  assert.equal(feedSummaryLine([{ region: "" }, { region: "" }]), "공개 노트 2건");
  assert.equal(
    feedSummaryLine([{ region: "서울 송파구" }, { region: "서울 송파구 잠실동" }, { region: "서울 마포구" }]),
    "공개 노트 3건 · 지역 2곳",
  );
});

/* ───────────── 2) 소스 잠금 ───────────── */

test("[1012] 공개 노트 피드 — 인스타 스토리 링을 걷고 지역 칩 레일(지역명 + 노트 수)로", () => {
  const src = read("app/notes/notes-feed-client.tsx");
  assert.ok(!src.includes("StoryRail"), "스토리 줄 컴포넌트가 사라졌다");
  assert.ok(!src.includes("IG_RING"), "링 색 상수가 사라졌다");
  assert.ok(src.includes("function RegionRail("), "지역 레일");
  /* [1012-IG] 레일은 원형 하이라이트 줄이 됐다 — 숫자는 여전히 손에 든 노트를 센 값(countRegions 를 품은 regionHighlights) */
  assert.ok(src.includes("regionHighlights(allNotes, now)"), "원 숫자는 손에 든 노트를 센 값");
  assert.ok(src.includes('aria-label="지역별 노트"'));
  /* 카드: 그림자 없음 (규칙 2). [1012-IG] 피드 카드는 테두리도 없이 여백으로 가른다(게시물 카드) */
  assert.ok(!/shadow-\[0_/.test(stripComments(src)), "손으로 적은 카드 그림자 없음");
  assert.ok(src.includes('<article className="mx-auto w-full max-w-[468px]">'), "피드 카드 = 테두리·그림자 없음");
  /* CTA 는 동사 + 대상 (규칙 5) */
  assert.ok(src.includes("`다음 노트 ${pageSize}건 보기`"), '"더 보기" → "다음 노트 N건 보기"');
  assert.ok(!stripComments(src).includes(">더 보기<"));
  /* 이모지 없음 (규칙 4) */
  assert.ok(!/📷/.test(stripComments(src)));
});

test("[1012] 노트 상세 — 이모지 배지·축 아이콘이 선 아이콘 이름·글자로, 현장 인증은 사실 명사 배지", () => {
  const src = stripComments(read("app/notes/[id]/page.tsx"));
  assert.ok(!/[📷📍🔊🚇]/u.test(src), "상세 페이지 UI 문자열에 이모지 없음");
  /* [v4 · 규칙 7] 축 앞 장식 아이콘까지 걷었다 — 이름 + 상/중/하 글자만(아이콘은 조작 버튼에만) */
  assert.ok(src.includes('{ label: "채광"') && src.includes('{ label: "교통"'));
  assert.ok(!src.includes("<Icon"), "상세 페이지 본문에 장식 아이콘 없음");
  assert.ok(/현장 인증\s*<\/span>/.test(src), '"현장 인증" 글자(사실 줄 끝)');
  /* [v4 · 규칙 2] 점수 도넛(conic-gradient)·축 막대 → 판단 덩어리의 큰 숫자(t-display) + 축 점수 한 줄 */
  assert.ok(!src.includes("conic-gradient("), "점수 도넛 제거");
  const verdict = stripComments(read("app/notes/[id]/NoteVerdictCard.tsx"));
  assert.ok(verdict.includes('className="t-display t-num text-ink"'), "기록 점수 = 주인공 숫자");
  const actions = stripComments(read("app/notes/[id]/note-actions.tsx"));
  /* [v4] 글자 버튼 한 줄에 다섯 개가 들어가게 — "이 노트로 카드 만들기" → "카드 만들기"(동사 + 대상) */
  assert.ok(actions.includes('"카드 만들기"') && !actions.includes("🎨"));
  const comments = stripComments(read("app/notes/[id]/NoteComments.tsx"));
  assert.ok(comments.includes("rounded-full bg-divider") && !comments.includes("bg-gradient-to-br"), "아바타 자리표시자 단색");
});

test("[1012] 노트 쓰기 — AI 초안·녹음 버튼에서 반짝이·마이크 이모지 제거, 음성 접두는 글자", () => {
  const draft = stripComments(read("app/notes/new/AiDraftPanel.tsx"));
  assert.ok(!draft.includes("✨") && draft.includes('"AI 초안 받기"'));
  const voice = stripComments(read("app/notes/new/VoiceMemoRecorder.tsx"));
  assert.ok(!voice.includes("🎙") && voice.includes('<Icon name="mic"'));
  const form = stripComments(read("app/notes/new/NoteForm.tsx"));
  assert.ok(!form.includes("🎙") && form.includes("`(음성) ${text}`"));
  const tpl = stripComments(read("app/notes/templates/page.tsx"));
  assert.ok(!tpl.includes("시작하세요"));
  assert.ok(tpl.includes("체크리스트 ${items.length}개 중 하나를 고르면"), "템플릿 수는 실제 목록 길이");
});

test("[1012] 마이·포인트·결제·프로필·베스트 — 대상 명시 CTA · 네이비 단색 헤더 · 글자 순위 배지", () => {
  const hub = stripComments(read("app/my/MyHubView.tsx"));
  assert.ok(hub.includes("남은 할 일 {nextStep.total - nextStep.done}/{nextStep.total}"));
  assert.ok(!hub.includes("시작하기 {nextStep.done}"));
  assert.ok(stripComments(read("app/points/shop/page.tsx")).includes("로그인하고 포인트 보기"));
  assert.ok(stripComments(read("app/my/creator/page.tsx")).includes("로그인하고 내 노트 성과 보기"));
  const pay = stripComments(read("app/payment/success/page.tsx"));
  assert.ok(pay.includes("단지 종합 진단 받기") && !pay.includes("바로 AI 분석 시작하기"));
  const profile = stripComments(read("app/u/[handle]/page.tsx"));
  assert.ok(!profile.includes("linear-gradient") && profile.includes("rounded-t-lg bg-brand-navy"), "프로필 커버 = 네이비 단색");
  const best = stripComments(read("app/notes/best/page.tsx"));
  assert.ok(!/[🥇🥈🥉]/u.test(best) && best.includes("{i + 1}위"), "메달 이모지 → N위 글자 배지");
});

test("[1012] 담당 경로 전체 — 굵기 800 이상 0 · 임의 반경 0 · 카드 그림자 0 · 금지 문구 0 · UI 이모지 0", () => {
  const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]|[\u{2728}\u{2B50}\u{2705}\u{274C}\u{2757}]/u;
  const BANNED = ["지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로"];
  const files = B_DIRS.flatMap((d) => walkTsx(path.join(ROOT, d)));
  assert.ok(files.length > 100, `담당 tsx ${files.length}개`);
  const bad: string[] = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const src = stripComments(readFileSync(abs, "utf8"));
    if (/font-extrabold|font-black/.test(src)) bad.push(`${rel}: 굵기 800+`);
    if (/rounded(?:-[a-z]{1,2})?-\[\d+px\]/.test(src)) bad.push(`${rel}: 임의 반경`);
    if (/shadow-\[0_/.test(src) && !rel.includes("NotePhotoLightbox")) bad.push(`${rel}: 손으로 적은 그림자`);
    for (const ph of BANNED) if (src.includes(ph)) bad.push(`${rel}: 금지 문구 "${ph}"`);
    if (EMOJI_RE.test(src.replace(/name=\{?"[^"]*"\}?/g, ""))) bad.push(`${rel}: 이모지`);
  }
  assert.deepEqual(bad, []);
});

test("[1012] 느낌표 금지(규칙 6) — 담당 경로의 한국어 UI 문자열에 '!' 가 없다", () => {
  const files = B_DIRS.flatMap((d) => walkTsx(path.join(ROOT, d)));
  const hits: string[] = [];
  for (const abs of files) {
    const src = stripComments(readFileSync(abs, "utf8"));
    src.split("\n").forEach((line, i) => {
      /* 한글 바로 뒤의 느낌표만 — `!==`·`!x` 같은 코드는 한글 뒤에 오지 않는다 */
      if (/[가-힣]!(?![=])/.test(line)) hits.push(`${path.relative(ROOT, abs)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});
