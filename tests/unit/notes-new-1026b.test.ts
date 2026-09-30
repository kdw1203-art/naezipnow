/* [1026b · 노트 쓰기] /notes/new 보강 — 순수 규칙 + 배선 잠금.
   · 이 단지 한눈에(응답에 있는 값만 · 없으면 칸을 뺀다 · 실패하면 null) · 내 지난 노트 한 줄(수정 화면은 지금 노트 제외)
   · 지난 체크 불러오기 = ?revisit= 프리필을 지금 입력 위에 합치기 · 브리핑 → 고려사항 담기 토글 · 메모 제안(2·3단계 같은 값)
   · 판단 제안에 구 단위 market · 미리보기·요약에 목적·시간대·날씨·만족도·태그 · 폰 5축 막대 값
   · 거짓 문구 삭제 · 음성 메모 비회원 · 번들 배선(새 UI 는 next/dynamic 조각, NoteForm 은 정적 import 없음) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { glanceFromDetail, latestTradeChip, myNotesLine, ymLabel } from "../../lib/notes/complex-glance.ts";
import {
  decisionMarketFromContext,
  hasTodoText,
  memoHintsFor,
  mergeRevisitSeed,
  toggleTodoText,
  type RevisitFormState,
} from "../../lib/notes/form-extras.ts";
import { finishSummaryRows, tagsLine, visitFactParts } from "../../lib/notes/finish-summary.ts";
import { axisBars } from "../../lib/notes/note-preview.ts";
import { composeScoresFromChecks } from "../../lib/notes/note-scores.ts";
import { suggestDecision } from "../../lib/inspection/decision.ts";
import { buildRevisitPrefill } from "../../lib/inspection/revisit-prefill.ts";
import { getChecklistForIntent } from "../../lib/inspection/checklist.ts";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 걷은 코드 — 설명 문장 속 낱말을 세지 않게 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ── 1. 이 단지 한눈에 ─────────────────────────────────────────────── */

const DETAIL = {
  complex: { name: "공작아파트", build_year: 1996, households: 1200, lat: 37.39, lng: 126.95 },
  areaBands: [
    { label: "60~85㎡", count: 30, latestManwon: 52000, latestYm: "202607" },
    { label: "85~102㎡", count: 4, latestManwon: 68500, latestYm: "202608" },
    { label: "~60㎡", count: 12, latestManwon: 41000, latestYm: "202608" },
  ],
  facts: {
    tradeSummary: { windowMonths: 12, count: 46 },
    jeonseRatio: { pct: 62.1, windowMonths: 6 },
  },
  notes: { count: 3, latest: null },
  mode: "db",
};

test("이 단지 한눈에 — 한 줄 결론(단지 · 준공 · 세대) + 사실 칩(최근 실거래 · 12개월 매매 · 전세가율 6개월) + 공개 노트 수 · 좌표", () => {
  const v = glanceFromDetail(DETAIL, "cid-1");
  assert.ok(v);
  assert.equal(v.headline, "공작아파트 · 1996년 · 1,200세대");
  assert.deepEqual(
    v.chips.map((c) => c.text),
    ["최근 실거래 4.1억 · 2026.08 · ~60㎡", "12개월 매매 46건", "전세가율 62.1%(6개월)"],
  );
  assert.equal(v.notesCount, 3);
  assert.equal(v.href, "/complex/cid-1");
  assert.deepEqual([v.lat, v.lng], [37.39, 126.95]);
});

test("최근 실거래 칩 — 가장 최근 계약월, 같은 달이면 거래 많은 면적대 · 깨진 행은 건너뛴다 · 없으면 null", () => {
  assert.equal(
    latestTradeChip([
      { label: "A", count: 1, latestManwon: 30000, latestYm: "202608" },
      { label: "B", count: 5, latestManwon: 31000, latestYm: "202608" },
      { label: "C", count: 9, latestManwon: 0, latestYm: "202609" },
      { label: "D", count: 9, latestManwon: 50000, latestYm: "2026-09" },
    ]),
    "최근 실거래 3.1억 · 2026.08 · B",
  );
  assert.equal(latestTradeChip([]), null);
  assert.equal(latestTradeChip(null), null);
  assert.equal(ymLabel("202601"), "2026.01");
  assert.equal(ymLabel("2026"), null);
});

test("이 단지 한눈에 — 없는 값은 칸을 뺀다(— 로 채우지 않는다) · 단지 없음/실패/이름뿐이면 카드 없음 · 0,0 좌표는 없음", () => {
  const thin = glanceFromDetail(
    { complex: { name: "소규모빌라", build_year: null, households: 0, lat: 0, lng: 0 }, areaBands: [], facts: null, notes: { count: 0 } },
    "x",
  );
  assert.equal(thin, null, "이름만 있으면 위치 카드와 같은 말");
  const partial = glanceFromDetail({ complex: { name: "B단지", build_year: 2018, lat: 0, lng: 0 }, facts: { tradeSummary: { count: 0 } } }, "b");
  assert.ok(partial);
  assert.equal(partial.headline, "B단지 · 2018년");
  assert.deepEqual(partial.chips, []);
  assert.equal(partial.notesCount, null);
  assert.equal(partial.lat, null);
  for (const s of [partial.headline, ...partial.chips.map((c) => c.text)]) assert.ok(!s.includes("—"));
  assert.equal(glanceFromDetail({ complex: null, mode: "not_found" }, "x"), null);
  assert.equal(glanceFromDetail(null, "x"), null);
  /* 이름이 응답에 없으면 폼의 단지명 */
  assert.equal(glanceFromDetail({ complex: { build_year: 2001 } }, "x", " 폼단지 ")?.headline, "폼단지 · 2001년");
  /* 실거래만 있는 숫자 — "시세" 라는 말을 쓰지 않는다 */
  const all = glanceFromDetail(DETAIL, "cid-1");
  assert.ok(all && !JSON.stringify(all).includes("시세"));
});

/* ── 2. 내 지난 노트 ───────────────────────────────────────────────── */

test("내 지난 노트 — 'N개 · 마지막 방문일 · 점수 평균/5', 가장 최근 방문이 대상 · 수정 화면은 지금 노트 제외 · 0개면 없음", () => {
  const raw = {
    notes: [
      { id: "n1", visitDate: "2026-05-02", avgScore: 3.4, isPublic: false },
      { id: "n2", visitDate: "2026-09-01", avgScore: 4.2, isPublic: true },
      { id: "n3", visitDate: "2026-07-10", avgScore: null, isPublic: false },
    ],
    watching: null,
  };
  const l = myNotesLine(raw, null);
  assert.ok(l);
  assert.equal(l.count, 3);
  assert.equal(l.latestId, "n2");
  assert.equal(l.score, 3.8, "점수 있는 노트(3.4 · 4.2)의 평균");
  assert.equal(l.text, "이 단지 내 노트 3개 · 마지막 2026.09.01 · 점수 3.8/5");
  const edit = myNotesLine(raw, "n2");
  assert.equal(edit?.count, 2);
  assert.equal(edit?.latestId, "n3");
  assert.equal(edit?.text, "이 단지 내 노트 2개 · 마지막 2026.07.10 · 점수 3.4/5");
  assert.equal(myNotesLine({ notes: [{ id: "n9", visitDate: "2026-01-01", avgScore: null }] }, null)?.text, "이 단지 내 노트 1개 · 마지막 2026.01.01");
  assert.equal(myNotesLine({ notes: [{ id: "n1", visitDate: "2026-01-01" }] }, "n1"), null);
  assert.equal(myNotesLine({ notes: [] }, null), null);
  assert.equal(myNotesLine(null, null), null);
});

test("지난 체크 불러오기 — ?revisit= 프리필과 같은 항목을 지금 입력 위에 합친다(지금 것은 지우지 않는다)", () => {
  const seed = buildRevisitPrefill(
    {
      id: "prev",
      region: "경기 안양시 동안구",
      aptName: "공작아파트",
      visitDate: "2026-06-01",
      scores: { location: 4, school: 0, transport: 3, facility: 0, future: 0 },
      checklist: [
        { label: "지하철역 도보 10분 이내", done: true },
        { label: "주차 만차 시간대 재확인", done: true },
        { label: "관리비 내역 확인", done: false },
      ],
      sections: { pros: "역세권 · 대단지", cons: "도로 소음" },
      metadata: { complexId: "cid-1", propertyType: "아파트", visitPurpose: "투자", todoLevels: { "관리비 내역 확인": "중요" } },
    },
    "2026-09-29",
  );
  const cur: RevisitFormState = {
    visit: { 유형: "아파트", 시간대: "저녁", 목적: "실거주" },
    tags: ["초품아", "역세권"],
    tagDefs: [
      { label: "초품아", tone: "pos" },
      { label: "역세권", tone: "pos" },
    ],
    todoItems: [{ text: "주차 만차 시간대 재확인", level: "중요" }],
    groupChecked: { c7: true, c1: false },
  };
  const m = mergeRevisitSeed(cur, seed);
  assert.deepEqual(m.visit, { 유형: "아파트", 시간대: "저녁", 목적: "투자" }, "유형·목적은 지난 값, 시간대는 지금 것");
  assert.deepEqual(m.tags, ["초품아", "역세권", "대단지", "도로 소음"]);
  assert.deepEqual(
    m.tagDefs.find((d) => d.label === "도로 소음"),
    { label: "도로 소음", tone: "neg" },
  );
  assert.deepEqual(
    m.todoItems.map((t) => `${t.text}:${t.level}`),
    ["주차 만차 시간대 재확인:중요", "관리비 내역 확인:중요"],
    "지금 목록 + 지난 목록(없던 것만)",
  );
  assert.equal(m.groupChecked.c7, true, "지금 체크는 남는다");
  assert.equal(m.groupChecked.c1, false, "지금 끈 것이 지난 완료를 이긴다");
  /* 원본은 건드리지 않는다(비우기가 되돌릴 값) */
  assert.deepEqual(cur.tags, ["초품아", "역세권"]);
  assert.equal(cur.visit["목적"], "실거주");
});

/* ── 3. 판단 근거에 실거래·지역 근거 ──────────────────────────────────── */

test("판단 제안 — 구 단위 응답의 market(전월비 · 전세가율)을 지역명과 함께 넘긴다 · 없으면 null", () => {
  const ctx = { district: "동안구", market: { source: "reb", period: "2026-08", saleChangeMonthly: -0.42, jeonseRatio: 61.6 } };
  const m = decisionMarketFromContext(ctx);
  assert.deepEqual(m, { momPct: -0.42, jeonseRatio: 61.6, area: "동안구" });
  const s = suggestDecision({ checks: { 채광: "좋음" }, scores: composeScoresFromChecks({ 채광: "좋음" }), market: m });
  assert.ok(s.reasons.includes("동안구 전월비 ▼0.4% · 전세가율 62%"), s.reasons.join(" / "));
  assert.equal(decisionMarketFromContext({ district: "x", market: { perM2Sale: 900 } }), null);
  assert.equal(decisionMarketFromContext(null), null);
  assert.equal(decisionMarketFromContext({ market: null }), null);
  /* area 없이 부르던 곳은 예전 문장 그대로 */
  assert.deepEqual(suggestDecision({ market: { priceLabel: "12.5억", momPct: -1.4 } }).reasons[1], "실거래 평균 12.5억 · 전월비 ▼1.4%");
});

/* ── 4. 브리핑 → 고려사항 담기 ─────────────────────────────────────── */

test("브리핑 칩 — 누르면 고려사항 끝에 '보통'으로 담고, 다시 누르면 뺀다 · 이미 있으면 체크", () => {
  const hint = "주차 — 방문·거주 주차 난이도 확인";
  const a = toggleTodoText([{ text: "기존", level: "중요" }], hint);
  assert.equal(a.added, true);
  assert.deepEqual(a.items.at(-1), { text: hint, level: "보통" });
  assert.equal(hasTodoText(a.items, ` ${hint} `), true);
  const b = toggleTodoText(a.items, hint);
  assert.equal(b.added, false);
  assert.deepEqual(b.items, [{ text: "기존", level: "중요" }]);
  assert.equal(hasTodoText(b.items, hint), false);
  assert.equal(toggleTodoText([], "x".repeat(100)).items[0].text.length, 80, "고려사항 상한(80)");
  assert.equal(toggleTodoText([], "   ").items.length, 0);
});

/* ── 5. 메모 제안 ──────────────────────────────────────────────────── */

test("메모 제안 — 지금 목적의 체크리스트에 있는 항목만 · 이미 체크한 것은 뺀다 · 빈 메모는 없음", () => {
  const live = getChecklistForIntent("실거주");
  const memo = "(음성) 주차가 좁고 층간 소음이 있음. 곰팡이 흔적";
  const ids = memoHintsFor(memo, live, {}).map((h) => h.id);
  assert.deepEqual(ids, ["ci_l1", "c7"], "곰팡이(ci_r1)는 전월세 체크리스트에만 있다");
  assert.deepEqual(memoHintsFor(memo, live, { c7: true }).map((h) => h.id), ["ci_l1"]);
  assert.deepEqual(memoHintsFor(memo, getChecklistForIntent("전월세"), {}).map((h) => h.id), ["c7", "ci_r1"]);
  assert.deepEqual(memoHintsFor("  ", live, {}), []);
});

/* ── 8. 미리보기·저장 전 요약 ──────────────────────────────────────── */

const BASE = {
  aptName: "공작아파트",
  region: "경기 안양시 동안구",
  visitDate: "2026-09-29",
  scores: { location: 4, school: 0, transport: 0, facility: 0, future: 0 },
  checklistDone: 1,
  checklistTotal: 39,
  photoCount: 0,
  memo: "",
  decisionLabel: null,
};

test("저장 전 요약 — 목적 · 시간대·날씨(방문일 줄) · 만족도(입력했을 때) · 태그 최대 3(+N), 입력한 것만 줄이 된다", () => {
  const rows = finishSummaryRows({
    ...BASE,
    purpose: "실거주",
    timeSlot: "오후",
    weather: "맑음",
    satisfaction: 7.5,
    tags: ["초품아", "역세권", "대단지", "이중주차", "도로 소음"],
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["단지", "방문일", "목적", "점수", "만족도", "체크", "사진", "판단", "태그", "메모"],
  );
  const v = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(v["방문일"], "2026-09-29 · 오후 · 맑음");
  assert.equal(v["목적"], "실거주");
  assert.equal(v["만족도"], "7.5 / 10");
  assert.equal(v["태그"], "초품아 · 역세권 · 대단지 +2");

  /* 만족도 미입력 · 날씨 없음 · 태그 없음 → 그 줄이 없다(— 로 채우지 않는다) */
  const lean = finishSummaryRows({ ...BASE, purpose: "투자", timeSlot: "오전", weather: "", satisfaction: null, tags: [] });
  assert.deepEqual(lean.map((r) => r.label), ["단지", "방문일", "목적", "점수", "체크", "사진", "판단", "메모"]);
  assert.equal(lean[1].value, "2026-09-29 · 오전");
  /* 넘기지 않으면 예전 7줄 그대로([1023] 계약) */
  assert.deepEqual(finishSummaryRows(BASE).map((r) => r.label), ["단지", "방문일", "점수", "체크", "사진", "판단", "메모"]);
});

test("미리보기 카드 조각 — 목적 · 시간대 · 날씨 · 만족도(입력했을 때), 태그 3개 + 나머지 수", () => {
  assert.deepEqual(visitFactParts({ purpose: "실거주", timeSlot: "오후", weather: " 흐림 ", satisfaction: 8 }), ["실거주", "오후", "흐림", "만족도 8"]);
  assert.deepEqual(visitFactParts({ purpose: "투자", timeSlot: "", weather: null, satisfaction: null }), ["투자"]);
  assert.deepEqual(visitFactParts({ satisfaction: 0 }), ["만족도 0"], "0 은 입력한 값");
  assert.equal(tagsLine(["a", "b"]), "a · b");
  assert.equal(tagsLine(["a", "b", "c", "d"]), "a · b · c +1");
  assert.equal(tagsLine([]), "");
  assert.equal(tagsLine(null), "");
});

/* ── 9. 폰 5축 막대 ───────────────────────────────────────────────── */

test("폰 5축 막대 — 입지·학군·교통·시설·미래가치, 체크하면 바로(×20 %) · 미입력 축은 pct null · '—'", () => {
  const none = axisBars(composeScoresFromChecks({}));
  assert.deepEqual(none.map((b) => b.label), ["입지", "학군", "교통", "시설", "미래가치"]);
  assert.ok(none.every((b) => b.pct === null && b.text === "—"));
  const some = axisBars(composeScoresFromChecks({ 교통: "좋음", 학군: "아쉬움", 채광: "보통" }));
  assert.deepEqual(
    some.map((b) => [b.label, b.pct, b.text]),
    [
      ["입지", 100, "100"],
      ["학군", 20, "20"],
      ["교통", 100, "100"],
      ["시설", 60, "60"],
      ["미래가치", null, "—"],
    ],
  );
});

/* ── 배선 잠금 ─────────────────────────────────────────────────────── */

test("거짓 문구 삭제 — '체크 항목은 다음 임장에도 유지'가 작성 화면 어디에도 없다 · '저장할 때만 로그인'은 비회원에게만", () => {
  for (const f of readdirSync("app/notes/new")) {
    if (!/\.tsx?$/.test(f)) continue;
    assert.ok(!code(`app/notes/new/${f}`).includes("다음 임장에도 유지"), f);
  }
  const form = code("app/notes/new/NoteForm.tsx");
  assert.ok(form.includes('{isGuest !== false && <div className="text-center t-sub text-text-3">저장할 때만 로그인</div>}'));
});

test("NoteForm — 새 UI 는 next/dynamic 조각(ssr:false), lib 규칙·키워드 모듈은 정적 import 없음 · 채움 파랑 늘지 않음", () => {
  const src = code("app/notes/new/NoteForm.tsx");
  assert.match(src, /const ComplexGlance = nextDynamic\(\(\) => import\("\.\/ComplexGlance"\)[\s\S]*?ssr: false/);
  for (const mod of [
    "./ComplexGlance",
    "@/lib/notes/complex-glance",
    "@/lib/notes/form-extras",
    "@/lib/notes/note-preview",
    "@/lib/inspection/voice-checklist-keywords",
  ]) {
    const esc = mod.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    assert.ok(!new RegExp(`^import (?!type )[^;]*from "${esc}"`, "m").test(src), `${mod} 정적 import 없음`);
  }
  assert.ok(!src.includes("checklistHintsFromVoice") && !src.includes("onMemoBlur"), "메모 제안은 조각이 메모에서 바로");
  assert.ok((src.match(/\bbtn-primary\b/g) ?? []).length <= 2);
  assert.ok(src.includes("{loc.complexId && (") && src.includes("<ComplexGlance"));
  assert.ok(src.includes("onRevisit={(seed, merged, before) => {") && src.includes("revisitBeforeRef.current = before;"));
  assert.ok(src.includes("const before = revisitBeforeRef.current;"), "비우기 = 불러오기 전으로");
  assert.ok(src.includes('isEdit || typeof loc.lat === "number"'), "좌표 채움은 새 노트 · 폼 좌표가 비었을 때만");
  assert.ok(src.includes("context={fieldContext}"), "판단 제안에 market");
  assert.ok(src.includes("<FieldBriefCard context={fieldContext} todoItems={todoItems} setTodoItems={setTodoItems} />"));
  assert.ok(src.includes("axisScores={showRail ? null : composeScoresFromChecks(checks)}"), "5축 막대는 레일 없는 화면만");
  assert.ok(src.includes('satisfaction === null ? "accent-line-strong opacity-40" : "accent-primary"'), "만족도 미입력 = 회색·흐림");
  assert.ok(src.includes("facts={facts}"), "레일 미리보기 사실(단지 사실은 1단계 카드 한 곳)");
  assert.ok(src.includes("...facts,"), "3단계 요약에도 같은 사실");
});

test("ComplexGlance — 두 조회는 조각 안 · 비회원은 내 노트를 부르지 않는다 · 채움 파랑 없음 · ?revisit= 과 같은 로더", () => {
  const src = code("app/notes/new/ComplexGlance.tsx");
  assert.ok(read("app/notes/new/ComplexGlance.tsx").startsWith('"use client"'));
  assert.ok(src.includes('import { fetchRevisit } from "./NoteNewEntry";'));
  assert.ok(src.includes("mergeRevisitSeed(before, seed)"));
  assert.ok(src.includes("{!p.editId && ("), "수정 화면에는 불러오기 없음");
  assert.ok(src.includes("{line && !p.linked && ("), "이미 이어받았으면 띠 없음");
  assert.equal((src.match(/\bbtn-primary\b/g) ?? []).length, 0);
  assert.ok(src.includes("btn-outline btn-md"));
  assert.ok(!/text-\[\d/.test(src), "램프 유틸만");
  const lib = code("lib/notes/complex-glance.ts");
  assert.ok(lib.includes("if (!readAuthedHint()) return null;"));
  assert.ok(lib.includes("/api/complex/${encodeURIComponent(id)}/detail") && lib.includes("/api/me/complex-records?complexId="));
  const rail = code("app/notes/new/NotePreviewRail.tsx");
  assert.ok(!rail.includes("ComplexGlanceRail"), "단지 사실은 1단계 폼 카드 한 곳(레일은 레이더가 보이게)");
  assert.ok(read("app/notes/new/NoteNewEntry.tsx").includes('import("@/lib/inspection/revisit-prefill")'), "프리필 판정은 여전히 동적 import");
});

test("조각 배선 — 판단(market) · 브리핑 칩(aria-pressed · 토스트) · 3단계 메모 제안 · 5축 막대 lg 숨김 · 음성 비회원 로그인", () => {
  const dec = code("app/notes/new/DecisionStep.tsx");
  assert.ok(dec.includes("market: decisionMarketFromContext(context)"));
  const brief = code("app/notes/new/FieldBriefCard.tsx");
  assert.ok(brief.includes("aria-pressed={has}") && brief.includes("toggleTodoText(prev, c)"));
  assert.ok(brief.includes('"고려사항에 담았어요"') && brief.includes('"고려사항에서 뺐어요"'));
  assert.ok(brief.includes('name={has ? "check" : "plus"}'));
  const finish = code("app/notes/new/NoteFinishStep.tsx");
  assert.ok(finish.includes("memoHintsFor(p.memo, p.checklistGroups, p.groupChecked)"));
  assert.ok(finish.includes("메모에서 찾은 점검 제안"));
  assert.ok(finish.includes("facts={p.summary}"));
  const detail = code("app/notes/new/NoteDetailFields.tsx");
  assert.ok(detail.includes("memoHintsFor(memo, checklistGroups, groupChecked)"));
  assert.ok(detail.includes('aria-label="5축 점수"') && detail.includes("lg:hidden") && detail.includes("axisBars(axisScores)"));
  const voice = code("app/notes/new/VoiceMemoRecorder.tsx");
  assert.ok(voice.includes("const needLogin = guest || state === \"login\";"));
  assert.ok(voice.includes('setState(res.status === 401 ? "login" : "error")'), "401 은 실패가 아니라 로그인 안내");
  assert.ok(voice.includes("window.location.pathname + window.location.search"), "callbackUrl = 지금 주소");
  const card = code("app/notes/new/NotePreviewCard.tsx");
  assert.ok(card.includes("visitFactParts(p.facts)") && card.includes("tagsLine(p.facts.tags)"));
  for (const f of ["ComplexGlance", "FieldBriefCard", "NoteFinishStep", "NoteDetailFields", "VoiceMemoRecorder", "NotePreviewCard", "DecisionStep"]) {
    const s = code(`app/notes/new/${f}.tsx`);
    assert.ok(!/font-extrabold|font-black|gradient/.test(s), f);
    assert.equal((s.match(/\bbtn-primary\b/g) ?? []).length, 0, `${f} 채움 파랑 없음`);
  }
});

test("[1026b · 노트 쓰기] 표식 — 손댄 파일·새 파일 머리", () => {
  for (const f of [
    "app/notes/new/NoteForm.tsx",
    "app/notes/new/ComplexGlance.tsx",
    "app/notes/new/NoteNewEntry.tsx",
    "app/notes/new/NotePreviewRail.tsx",
    "app/notes/new/NotePreviewCard.tsx",
    "app/notes/new/NoteFinishStep.tsx",
    "app/notes/new/NoteDetailFields.tsx",
    "app/notes/new/FieldBriefCard.tsx",
    "app/notes/new/DecisionStep.tsx",
    "app/notes/new/VoiceMemoRecorder.tsx",
    "lib/notes/complex-glance.ts",
    "lib/notes/form-extras.ts",
    "lib/notes/finish-summary.ts",
    "lib/notes/note-preview.ts",
    "lib/inspection/decision.ts",
  ]) {
    assert.ok(read(f).slice(0, 400).includes("[1026b · 노트 쓰기]"), f);
  }
});
