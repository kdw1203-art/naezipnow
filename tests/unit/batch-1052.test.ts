/* [1052] 고도화·기능 개선 묶음(약 50가지) — 소유자 지시(2026-10-09): "지금까지 작업한 내용에 대해서 고도화 및 기능개선 등의 작업을 진행해줘 50가지 정도".
 * 이 파일: 실시간 토론 · 홈 · 임장노트 · AI 허브 · 계산기 · 탈퇴 · 관리 화면. (전문가 · 지도/마이/성장 · 시장 신호는 각자의 1052 시험 파일)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bumpBoardTalk,
  clipTalkInput,
  complexInRegion,
  countFreshPosts,
  filterTalkRegions,
  talkCountTone,
  talkSidoOf,
  TALK_MAX_LEN,
  type TalkBoard,
  type TalkBoardRegion,
  type TalkPost,
} from "@/lib/talk/rules";
import { isRegionNews, regionNewsTokens } from "@/lib/ai/region-parts";
import { stageStep } from "@/lib/ai/tool-stage-steps";
import { noteScoreBand, noteScoreBarClass, NOTE_SCORE_HIGH } from "@/lib/notes/score-band";

const code = (p: string) => readFileSync(p, "utf8");

const R = (id: string, name: string, sido: string, txName: string, extra: Partial<TalkBoardRegion> = {}): TalkBoardRegion => ({
  id, name, sido, txName, pct: null, indexYm: null, trades: null, tradesYm: null, talks: 0, lastTalkAt: null, ...extra,
});

test("토론 단지 붙이기 — 시·도가 다르면 같은 구 이름이어도 다른 지역(부산 강서구 ≠ 서울 강서구)", () => {
  assert.equal(complexInRegion("부산 강서구", "서울 강서구"), false);
  assert.equal(complexInRegion("서울 강서구", "서울 강서구"), true);
  assert.equal(complexInRegion("서울특별시 강서구", "서울 강서구"), true);
  assert.equal(complexInRegion("성남시 분당구", "성남 분당구"), true);
  assert.equal(complexInRegion("부산 중구", "서울 중구"), false);
  assert.equal(talkSidoOf("경기도 수원시"), "경기");
  assert.equal(talkSidoOf("광주시"), null, "경기 광주시는 시·도가 아니다");
  assert.equal(talkSidoOf("광주광역시 북구"), "광주");
  assert.equal(talkSidoOf("오산시"), null);
});

test("토론 지역 찾기 · 글자 자르기 · 남은 글자 · 새 글 수 · 올린 즉시 +1", () => {
  const regions = [R("songpa", "송파구", "서울", "서울 송파구"), R("seongnam-bundang", "성남시 분당구", "경기", "성남 분당구"), R("incheon-yeonsu", "연수구", "인천", "인천 연수구")];
  assert.deepEqual(filterTalkRegions(regions, "송파").map((r) => r.id), ["songpa"]);
  assert.deepEqual(filterTalkRegions(regions, "분당").map((r) => r.id), ["seongnam-bundang"]);
  assert.deepEqual(filterTalkRegions(regions, "인천").map((r) => r.id), ["incheon-yeonsu"]);
  assert.equal(filterTalkRegions(regions, " ").length, 3);
  const long = "가".repeat(TALK_MAX_LEN - 1) + "😀😀";
  const clipped = clipTalkInput(long);
  assert.equal([...clipped].length, TALK_MAX_LEN);
  assert.ok(!/[\uD800-\uDBFF]$/.test(clipped), "이모지를 반쪽으로 자르지 않는다");
  assert.equal(talkCountTone(10), "ok");
  assert.equal(talkCountTone(180), "warn");
  assert.equal(talkCountTone(TALK_MAX_LEN), "full");
  const p = (id: string, mine = false): TalkPost => ({ kind: "talk", id, author: "a", body: "bb", complexId: null, complexName: null, createdAt: "2026-10-09T00:00:00Z", ...(mine ? { mine: true } : {}) });
  assert.equal(countFreshPosts(new Set(["a"]), [p("a"), p("b"), p("c", true)]), 1, "내 글·이미 본 글은 세지 않는다");
  const board: TalkBoard = { regions, indexYm: null, tradesYm: null, totalTalks: 0 };
  const b2 = bumpBoardTalk(board, "songpa", "2026-10-09T01:00:00Z");
  assert.equal(b2.totalTalks, 1);
  assert.equal(b2.regions[0].talks, 1);
  assert.equal(b2.regions[0].lastTalkAt, "2026-10-09T01:00:00Z");
  assert.equal(bumpBoardTalk(board, "nope", "x"), board);
});

test("토론 판 — 늦게 온 앞 지역 응답 버림 · 지우기/신고 확인 · 폰 40px · 마지막 지역 기억 · 보이는 동안만 다시 받기", () => {
  const src = code("app/components/talk/TalkPanel.tsx");
  assert.match(src, /if \(wantRef\.current !== j\.regionId\) return;/);
  assert.match(src, /feedAbortRef\.current\?\.abort\(\)/);
  assert.match(src, /confirm\.kind === "remove" \? "지울까요\?" : "신고할까요\?"/);
  /* 전역 CSS 가 .min-h-10 을 40px 로 묶어(md+ 포함 · 층 밖 규칙) md:min-h-6 이 안 먹는다 → 임의값 40px */
  assert.match(src, /min-h-\[40px\] items-center px-1\.5 t-caption md:min-h-6/);
  assert.match(src, /TALK_LAST_REGION_KEY/);
  assert.match(src, /새 글 \{fresh\}개 ↑/);
  assert.match(src, /bumpBoardTalk\(b, selected\.id, post\.createdAt\)/);
  assert.doesNotMatch(src, /aria-live="polite">\s*\{feed\.status/, "목록 전체를 화면 읽기 알림에 걸지 않는다");
  assert.match(src, /visibilitychange/);
  assert.doesNotMatch(src, /maxLength=\{TALK_MAX_LEN\}/, "UTF-16 단위 maxLength 대신 글자 기준 자르기");
  assert.match(src, /callbackUrl=\$\{encodeURIComponent\(loginBack\)\}/);
});

test("토론 소식 — 조각마다 캐시 · 한 조각 실패가 다른 소식을 지우지 않는다", () => {
  const b = code("lib/talk/board.ts");
  assert.match(b, /Promise\.allSettled\(\[\s*readMarketPartCached\(\),\s*readNewsFactsCached\(r\.id\),\s*readNoteFactsCached\(r\.id\),?\s*\]\)/);
  assert.doesNotMatch(b, /talk-region-facts-v1/);
  const route = code("app/api/talk/route.ts");
  assert.match(route, /factsFailed: !facts \|\| facts\.failed\.length > 0/);
});

test("지역 뉴스 낱말 — 지명이 아닌 낱말 속 지역 이름은 빼고(성수기 · 경상수지 · 1분당), 지명이면 그대로", () => {
  const sd = regionNewsTokens("서울 성동구");
  assert.equal(isRegionNews({ title: "추석 성수기 앞두고 이사 수요", summary: null }, sd), false);
  assert.equal(isRegionNews({ title: "성수동 트리마제 신고가", summary: null }, sd), true);
  assert.equal(isRegionNews({ title: "성수기 앞둔 성수 전략정비구역 속도", summary: null }, sd), true, "다른 자리에 지명으로 나오면 그 지역 기사");
  const sj = regionNewsTokens("용인 수지구");
  assert.equal(isRegionNews({ title: "8월 경상수지 흑자 지속", summary: null }, sj), false);
  assert.equal(isRegionNews({ title: "수지 풍덕천동 리모델링 속도", summary: null }, sj), true);
  const bd = regionNewsTokens("성남 분당구");
  assert.equal(isRegionNews({ title: "1분당 3건 계약 몰려", summary: null }, bd), false);
  assert.equal(isRegionNews({ title: "분당 재건축 선도지구 2차", summary: null }, bd), true);
});

test("탈퇴 접수 — 실시간 토론 글도 즉시 숨김(지우지 않음 · 취소하면 되살림)", () => {
  const src = code("app/api/me/delete-account/route.ts");
  assert.match(src, /from\("region_talks"\)\s*\.update\(\{ hidden_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("author_email", email\)/);
  assert.match(code("docs/ops/privacy-requests.md"), /region_talks\.hidden_at/);
});

test("관리 화면 — 토론 신고·숨김 목록 · 되살리기/지우기(관리자만 · 하드 삭제 없음)", () => {
  const api = code("app/api/admin/talk/route.ts");
  assert.match(api, /isAdmin\(session\)/);
  assert.match(api, /restoreRegionTalk\(id\)/);
  assert.match(api, /softDeleteRegionTalk\(id, \{ email, isAdmin: true \}\)/);
  assert.doesNotMatch(api, /\.delete\(\)/);
  const store = code("lib/talk/store.ts");
  assert.match(store, /\.or\("report_count\.gt\.0,hidden_at\.not\.is\.null"\)/);
  assert.match(store, /\.update\(\{ hidden_at: null, report_count: 0 \}\)/);
  assert.match(code("app/admin/moderation/page.tsx"), /<TalkFlagged items=\{talks\.rows\} \/>/);
});

test("지역 화면 — 그 지역 실시간 토론으로 가는 한 줄(토론 지역만 · JS 없음)", () => {
  const src = code("app/region/[id]/page.tsx");
  assert.match(src, /\{talkRegionById\(id\) && \(/);
  assert.match(src, /href=\{`\/talk\?region=\$\{encodeURIComponent\(id\)\}`\}/);
});

test("홈 — 거래 원천을 한쪽으로 단정하지 않는다 · 오늘의 한 줄 roving tabindex · 문장형 문구 정리 · 막대 40px", () => {
  const home = code("app/page.tsx");
  assert.doesNotMatch(home, /거래 = 그 달 신고 건수\(국토교통부\)/);
  assert.match(home, /거래 = 그 달 아파트 매매 건수\(카드 끝 표기/);
  assert.doesNotMatch(home, /오늘 브리핑을 아직 만들지 못했어요/);
  assert.doesNotMatch(home, /text-\[12px\]/);
  const today = code("app/components/home/HomeTodayLine.tsx");
  assert.match(today, /tabIndex=\{n === i \? 0 : -1\}/);
  assert.match(today, /aria-controls="home-today-slide"/);
  assert.doesNotMatch(today, /예요\.`|이에요\.`/);
  assert.match(code("app/components/viz/DivergingBars.tsx"), /min-h-\[40px\] items-center gap-2\.5 rounded-md no-underline md:min-h-8/);
});

test("임장노트 표 — 목록이 바뀌면 펼침 닫기 · 펼친 칸 화면 안으로 · 점수 머리 정렬 · 점수 막대는 방향 색이 아님", () => {
  const src = code("app/notes/notes-feed-client.tsx");
  assert.match(src, /useEffect\(\(\) => \{\s*setOpenId\(null\);\s*\}, \[idsKey\]\);/);
  assert.match(src, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(src, /aria-sort=\{onScoreSort \? \(scoreSorted \? "descending" : "none"\) : undefined\}/);
  assert.doesNotMatch(src, /n\.score < 50 \? "bg-down"/);
  assert.match(src, /PHONE_VIEW_KEY/);
  assert.match(src, /if \(!\(n\.region \?\? ""\)\.trim\(\)\) continue;/, "지역 없는 노트가 레일 '지역'에 제목 조각으로 섞이지 않는다");
  assert.equal(noteScoreBand(NOTE_SCORE_HIGH), "high");
  assert.equal(noteScoreBand(49), "low");
  assert.equal(noteScoreBand(60), "mid");
  assert.equal(noteScoreBarClass(30), "bg-line-strong");
  assert.match(code("lib/newui/home-data.ts"), /hot: score >= NOTE_SCORE_HIGH/);
});

test("노트 상세 — 감각 축(채광·소음·주차)을 다른 축 점수로 지어내지 않는다 · 도구 딥링크에 단지 id", () => {
  const page = code("app/notes/[id]/page.tsx");
  assert.match(page, /axisOrNull\("채광", \["채광", "햇빛", "일조", "남향"\], 0\)/);
  assert.match(page, /axisOrNull\("소음", \["소음", "시끄", "조용"\], 0\)/);
  assert.match(page, /axisOrNull\("주차", \["주차", "이중주차"\], 0\)/);
  assert.match(page, /axisOrNull\("교통", \[\], s\.transport\)/);
  assert.match(page, /complexId=\{complexIdFromHref \?\? \(visitComplexId \|\| null\)\}/);
  assert.match(code("app/notes/[id]/NoteToolsRow.tsx"), /\.\.\.\(cid \? \{ complexId: cid \} : \{\}\)/);
});

test("AI 허브 — 펼침 단추가 할 일을 말한다 · 분석 순서 ㄹ 탈락 동사 · 쓰지 않는 좁은 화면 상태 제거", () => {
  const tiers = code("app/analysis/hub-tiers.tsx");
  assert.match(tiers, /picked \? `\$\{picked\.name\} \$\{c\.title\} 열기 ›` : `단지 고르고 \$\{c\.title\} 열기 ›`/);
  assert.match(tiers, /role="region"/);
  assert.doesNotMatch(code("app/analysis/hub-hero.tsx"), /setNarrow/);
  assert.equal(stageStep("추정값에 표시를 다는 중"), "추정값에 표시 달기");
  assert.equal(stageStep("목록을 만드는 중"), "목록 만들기");
  assert.equal(stageStep("신호등 3개를 켜는 중"), "신호등 3개 켜기");
  assert.equal(stageStep("국토부 실거래 불러오는 중 — 점수의 기준을 잡아요"), "국토부 실거래 불러오기");
  assert.match(code("app/analysis/hub-tool-detail.tsx"), /key=\{`\$\{i\}-\$\{st\}`\}/);
});

test("계산기 — 최대 대출 계산식 카드는 따로 받는 청크(서버 렌더 유지)", () => {
  const src = code("app/calculator/calculator-client.tsx");
  assert.match(src, /const LoanRuleCard = nextDynamic\(\(\) => import\("\.\/LoanRuleCard"\)/);
  assert.doesNotMatch(src, /ssr: false,\s*loading: \(\) => <div aria-hidden className="card min-h-\[320px\]/);
  assert.match(code("app/calculator/LoanRuleCard.tsx"), /최대 대출 계산식/);
});

test("지도 반경 손잡이 — 끌어서 바꿀 곳이 있을 때만", () => {
  const src = code("components/map/NaverMap.tsx");
  assert.match(src, /const radiusDraggable = Boolean\(onRadiusCenterDragEnd \|\| onRadiusEdgeDragEnd\);/);
  assert.match(src, /if \(!circle \|\| !radiusDraggable\) \{/);
});

test("AI 서술 월 예산 — 달의 시작은 한국 시간", () => {
  assert.match(code("app/api/ai/analysis/route.ts"), /const monthStart = kstMonthStart\(\);/);
});

test("번들 — 모든 화면 레이아웃의 기록기는 가입 경로 규칙을 로그인 뒤에만 받는다 · 내 노트 필터 줄은 따로 받는 청크", async () => {
  const src = code("app/components/TrafficRecorder.tsx");
  assert.doesNotMatch(src, /^import[^;]*from "@\/lib\/growth\/attribution-retry";/m);
  assert.match(src, /await import\(\s*"@\/lib\/growth\/attribution-retry"\s*\)/);
  const { LEGACY_ATTR_DONE_KEY } = await import("@/lib/growth/attribution-retry");
  assert.match(src, new RegExp(`const LEGACY_ATTR_DONE_KEY = "${LEGACY_ATTR_DONE_KEY}";`));
  assert.match(code("app/notes/notes-feed-client.tsx"), /const MineFilterBar = nextDynamic\(\(\) => import\("\.\/mine-filter-bar"\)/);
});

test("반응형 누름 면 — 전역 .min-h-10(40px · md+ 포함) 때문에 md:/lg:min-h-* 와 함께 쓰는 곳은 min-h-[40px]", () => {
  const files = [
    "app/components/ExpertBadge.tsx", "app/components/signals/SignalBoard.tsx", "app/components/viz/DivergingBars.tsx",
    "app/components/talk/TalkPanel.tsx", "app/notes/notes-feed-client.tsx", "app/complex/[id]/ComplexAreaMap.tsx", "app/analysis/hub-tool-detail.tsx",
  ];
  for (const f of files) {
    const bad = code(f).split("\n").filter((l) => /\bmin-h-10\b/.test(l) && /(?:md|lg):min-h-\d/.test(l));
    assert.deepEqual(bad, [], `${f} — md:/lg: 로 줄이는 줄에 min-h-10`);
  }
});
