/* [1078] 소유자 2026-10-19 — "같은 내용(말투 정리)으로 아직 검토 못한 부분이 있다면 모든 페이지에 적용 · 실 사용자가 이용하는 데
 * 불편하거나 어색하거나 순서적으로 이상한 부분도 확인해서 개선 · 변경 전후를 이미지로".
 *  S1 말투 2차 — 짧은 라벨·제목 전수(app·lib 데이터 상수): 404 "이 집은 이사 갔어요" → "페이지 없음" · 로그인 환영 "다시 오셨네요" → "로그인 완료" ·
 *     홈 시작 문 넷("구경하러 왔어요" …) → 표준 이름 · 노트 덱 카드 제목 넷 · 통찰 제목 다섯(낱말 꼴) · 여정·초대·해지·계산 안내 제목 …
 *  S2 노트 상세 순서 — 열면 점수·레이더·AI 단추가 먼저, 제목이 그 아래(운영 실측) → 머리(칩·제목·방문 메타)가 판단 카드 앞.
 *  S3 노트 상세 중복 — 규칙 기반 "요약" 남색 판(링 72 + 칩)은 맨 위 판단 카드와 같은 수 → 그리지 않음(AI 모델 요약만 남색 판).
 *  S4 노트 목록 표 — 굵은 글자가 단지 이름뿐이라 무엇을 말하는 노트인지 펼쳐야 알았다 → 제목(한 줄 총평)이 굵게, 단지 이름은 아랫줄.
 *  S5 빈 블록 순서 — 동네 홈·동네 허브·홈에서 "이웃 글 없음" 빈 카드가 내용 있는 블록보다 위에 섰다 → 0건이면 아래로(order) · 한 줄.
 *  S6 폰 노트 격자 3열 → 2열(연구소 커버 글자가 128px 에서 읽히지 않음). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
/* 주석은 빼고 본다 — 옛 말투는 주석의 설명에 남아 있을 수 있다 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("S1 말투 2차 — 짧은 라벨·제목", () => {
  const checks: Array<[string, string, string]> = [
    ["app/not-found.tsx", "페이지 없음<span", "이 집은 이사 갔어요"],
    ["app/login/LoginClient.tsx", 'title: "로그인 완료"', "다시 오셨네요"],
    ["lib/brand/home-copy.ts", 'HOME_START_DOORS_TITLE = "시작 지점"', 'HOME_START_DOORS_TITLE = "어디서부터'],
    ["lib/brand/home-copy.ts", 'title: "둘러보기"', "구경하러 왔어요"],
    ["lib/brand/home-copy.ts", 'title: "후보 단지 진단"', "후보가 있어요"],
    ["lib/brand/home-copy.ts", 'title: "계약 준비"', "계약을 앞두고 있어요"],
    ["app/components/JourneyBanner.tsx", ">지금 단계<", "지금 어디부터 할까요"],
    ["lib/inspection/note-deck.ts", 'title: "장점"', "여기가 마음에 들었어요"],
    ["lib/inspection/note-deck.ts", 'title: "문제점"', "이건 걸렸어요"],
    ["lib/inspection/note-deck.ts", 'title: "미확인 항목"', "이건 아직 안 봤어요"],
    ["lib/inspection/deep-dive.ts", 'eyebrow: "현재 가격 위치"', "지금 가격이 어디쯤인가"],
    ["app/notes/new/FieldBriefCard.tsx", ">이 지역 현황<", "지금 이 지역은"],
    ["app/notes/new/FieldBriefCard.tsx", ">이 지역 중점 확인 항목<", ">이 지역에서 특히 볼 것<"],
    ["app/complex/[id]/AiBriefingCard.tsx", ">현장 확인 사항<", "현장에서 확인할 것"],
    ["app/analysis/temperature/page.tsx", "현재 시장 온도 보기 ›", "지금 이 순간의 시장 온도 보기"],
    ["lib/guides/catalog.ts", 'heading: "전세가율이 높을 때 — 두 가지 해석"', "두 가지 얼굴"],
    ["lib/guides/catalog.ts", '"아파트 임장 체크리스트 — 현장 확인 사항"', "꼭 확인할 것들"],
    ["app/imjang/(index)/page.tsx", "데이터로 확인되지 않는 항목", "데이터로는 알 수 없는 것"],
    ["lib/listings/staleness.ts", 'title: "매물 끌어올리기 시점"', "끌어올릴 시간이에요"],
    ["app/my/points/ReferralSection.tsx", ">초대 방법<", "이렇게 초대돼요"],
    ["app/my/subscription/SubscriptionManageClient.tsx", ">해지 시 변경 사항<", "해지하면 이렇게 돼요"],
    ["app/components/explain/ExplainSheet.tsx", ">계산 방법<", "이렇게 계산했어요"],
    ["app/about/page.tsx", 'title: "판단은 사용자가 합니다"', "사용자의 것입니다"],
    ["app/region/[id]/page.tsx", "요약 · 지수 · 거래 · 뉴스", "한 줄 이야기 · 지수"],
    ["app/complex/[id]/page.tsx", "이 단지 토론 · 새 글 30초마다", "이 단지 한 줄 ·"],
    ["app/my/consultations/CloseConsult.tsx", "상담 종료", "더 기다리지 않을래요"],
    ["app/notes/[id]/AiPendingCard.tsx", "AI 정리 지연 중", "늦어지고 있어요"],
    ["app/notes/[id]/AiPendingCard.tsx", "나중에 보기", "나중에 볼게요"],
    ["app/analysis/ai/[tool]/ResultView.tsx", 'aria-label="도움됨"', 'aria-label="도움 됐어요"'],
    ["app/analysis/ai/[tool]/ResultView.tsx", 'aria-label="도움 안 됨"', 'aria-label="아쉬워요"'],
    ["lib/ai/insight-blocks.ts", 'title: "거래 드묾"', "거래가 드물어요"],
    ["lib/ai/insight-blocks.ts", 'title: "입주 물량 많음"', "입주 물량이 많아요"],
    ["app/invite/[code]/page.tsx", "친구 초대 · 가입하면 둘 다 300P", "친구가 초대했어요 ·"],
    ["lib/reengagement/candidates.ts", 'title: "작성 중인 임장노트"', "쓰다 만 임장노트"],
    ["app/journey/JourneyBoard.tsx", 'title: "6단계 완료"', '"여정 완주"'],
  ];
  for (const [f, now, old] of checks) {
    const src = strip(read(f));
    assert.ok(src.includes(now), `${f}: ${now}`);
    assert.ok(!src.includes(old), `${f}: 옛 말투 "${old}" 남음`);
  }
});

test("S2·S3 노트 상세 — 머리가 판단 카드 앞 · 규칙 기반 요약 판 없음", () => {
  const p = read("app/notes/[id]/page.tsx");
  const head = p.indexOf("{/* ① 지역·단지 칩 */}");
  const verdict = p.indexOf("<NoteVerdictCard");
  const h1 = p.indexOf('<h1 className="t-title text-ink">');
  assert.ok(head > 0 && verdict > 0 && h1 > 0);
  assert.ok(head < verdict && h1 < verdict, "칩·제목이 판단 카드보다 앞");
  assert.match(p, /\[1078\] 머리\(지역 칩 · 제목 · 방문 메타\)를 판단 카드 \*\*앞\*\*으로/);
  assert.match(p, /const aiSummaryPanel = v\.aiBadge\.startsWith\("규칙"\) \? \(/);
  assert.match(p, /AI 요약 없음 · 기록 점수는 위 판단 카드/);
  assert.doesNotMatch(p, /<ScoreRing score=\{v\.totalScore\} size=\{72\}/);
});

test("S4 노트 목록 표 — 제목이 굵게 · 단지 이름은 아랫줄", () => {
  assert.match(read("lib/notes/feed-note.ts"), /headline: string;/);
  assert.match(read("lib/notes/feed-note.ts"), /headline: n\.title,/);
  const c = read("app/notes/notes-feed-client.tsx");
  assert.match(c, /<span className="truncate t-body font-bold text-ink">\{n\.headline \|\| n\.title\}<\/span>/);
  assert.match(c, /\{n\.aptName && n\.headline && n\.headline !== n\.title \? `\$\{n\.title\} · ` : ""\}/);
});

test("S5 빈 블록 순서 — 동네 홈 · 동네 허브 · 홈", () => {
  const r = read("app/town/[region]/page.tsx");
  assert.match(r, /const storiesEmpty = !postsFailed && communityPosts\.length === 0;/);
  assert.match(r, /<div className=\{storiesEmpty \? "order-2 mt-6 max-md:mt-3" : ""\}>/);
  assert.match(r, /<section className=\{`rise-in-3 \$\{storiesEmpty \? "order-1" : "mt-6 max-md:mt-3"\}`\}>/);
  assert.match(r, /<p className="m-0 t-body text-text-2">\{region\.name\} 이웃 글 없음<\/p>/);
  const t = read("app/town/page.tsx");
  assert.match(t, /<div className=\{!loadFailed && firstPage\.length === 0 \? "order-2" : ""\}>\s*<TownFeed/);
  assert.match(t, /<div className=\{!loadFailed && firstPage\.length === 0 \? "order-1" : ""\}>\s*<TownIndex \/>/);
  assert.match(read("app/components/home/HomeTownBlock.tsx"), /storiesEmpty \? "order-2 card flex flex-col gap-2 rounded-2xl px-4 py-3 md:col-span-2/);
});

test("S6 폰 노트 격자 2열", () => {
  const c = read("app/notes/notes-feed-client.tsx");
  assert.match(c, /className="-mx-3\.5 grid grid-flow-row-dense grid-cols-2 gap-0\.5 md:hidden"/);
  assert.match(c, /priority=\{i < 2\}/);
  assert.match(c, /className="col-span-2 bg-bg px-2 pb-1 pt-2"/);
});
