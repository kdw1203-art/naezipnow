/* [1051] 검토 뒤 묶음 — 홈 실시간 토론 · 배포 막힘(노트 상세 용량) · 단지 화면 자동 재시도 · 폰 광고 지연.
 * 소유자 지시(2026-10-09): "추가로 개선할 부분에 대해 검토" → 답: 배포 막힘 해결 · 단지 화면 시간 초과 · 홈·지도 속도 +
 *   "홈 하단에 이런 실시간 토론을 할 수 있는 창"(네이버 증권 '오늘의 종목 토론') — 답: 지역 + 단지 · 자동 소식 섞기 · 홈 창에서 바로 한 줄.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  checkTalkBody,
  complexInRegion,
  defaultTalkTab,
  mergeIncomingPosts,
  mergeTalkFeed,
  rankTalkBoard,
  signedPct,
  talkAuthorLabel,
  talkTimeLabel,
  ymMonthLabel,
  TALK_MAX_LEN,
  type TalkBoardRegion,
  type TalkFact,
  type TalkPost,
} from "@/lib/talk/rules";
import { TALK_REGIONS, talkRegionById, talkRegionNoteTokens } from "@/lib/talk/regions";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = (id: string, o: Partial<TalkBoardRegion> = {}): TalkBoardRegion => ({
  id,
  name: id,
  sido: "서울",
  txName: `서울 ${id}`,
  pct: null,
  indexYm: null,
  trades: null,
  tradesYm: null,
  talks: 0,
  lastTalkAt: null,
  ...o,
});

test("한 줄 규칙 — 공백 정리 · 2~200자 · 표시 이름 마스킹", () => {
  assert.deepEqual(checkTalkBody("  송파   전세  \n 많이 빠졌네요 "), { ok: true, body: "송파 전세 많이 빠졌네요" });
  assert.deepEqual(checkTalkBody(""), { ok: false, reason: "empty" });
  assert.deepEqual(checkTalkBody("가"), { ok: false, reason: "too_short" });
  assert.deepEqual(checkTalkBody("가".repeat(TALK_MAX_LEN + 1)), { ok: false, reason: "too_long" });
  assert.equal(checkTalkBody("가".repeat(TALK_MAX_LEN)).ok, true);
  assert.equal(talkAuthorLabel("홍길동", "a@b.c"), "홍길동");
  assert.equal(talkAuthorLabel(null, "kd1203@x.com"), "kd** 이웃");
});

test("순위 — 값이 없는 지역은 그 탭에서 뺀다(0 으로 세우지 않는다) · 처음 탭", () => {
  const regions = [
    R("a", { pct: 2.28, trades: 100 }),
    R("b", { pct: -0.42, trades: null }),
    R("c", { pct: null, trades: 300 }),
    R("d", { pct: 0.4, trades: 50, talks: 2, lastTalkAt: "2026-10-09T01:00:00Z" }),
  ];
  assert.deepEqual(rankTalkBoard(regions, "up").map((r) => r.id), ["a", "d"]);
  assert.deepEqual(rankTalkBoard(regions, "down").map((r) => r.id), ["b"]);
  assert.deepEqual(rankTalkBoard(regions, "volume").map((r) => r.id), ["c", "a", "d"]);
  assert.deepEqual(rankTalkBoard(regions, "hot").map((r) => r.id), ["d"]);
  assert.equal(defaultTalkTab({ regions, indexYm: "202608", tradesYm: "202608", totalTalks: 0 }), "up", "글이 없으면 상승");
  assert.equal(defaultTalkTab({ regions, indexYm: "202608", tradesYm: "202608", totalTalks: 2 }), "hot");
  assert.equal(signedPct(2.281), "+2.28%");
  assert.equal(signedPct(-0.42), "−0.42%");
  assert.equal(ymMonthLabel("202608"), "8월");
});

test("글 목록 — 사람 글(최신 순) 위 · 자동 소식 아래 · 방금 쓴 글은 1분 붙든다", () => {
  const p = (id: string, at: string, mine = false): TalkPost => ({ kind: "talk", id, author: "x", body: "yy", complexId: null, complexName: null, createdAt: at, ...(mine ? { mine } : {}) });
  const f: TalkFact = { kind: "fact", id: "index-a", label: "지수", text: "8월 …", href: "/region/a", at: null, source: "한국부동산원" };
  const merged = mergeTalkFeed([p("1", "2026-10-09T01:00:00Z"), p("2", "2026-10-09T02:00:00Z")], [f]);
  assert.deepEqual(merged.map((i) => i.id), ["2", "1", "index-a"]);
  const fresh = p("mine", new Date().toISOString(), true);
  const kept = mergeIncomingPosts([fresh, p("old", "2026-10-01T00:00:00Z")], [p("1", "2026-10-09T01:00:00Z")]);
  assert.deepEqual(kept.map((x) => x.id), ["mine", "1"], "서버 목록에 아직 없는 내 새 글은 남기고, 지워진 남의 글은 뺀다");
  assert.equal(talkTimeLabel("2026-10-09T01:00:00Z", Date.parse("2026-10-09T01:00:30Z")), "방금");
  assert.equal(talkTimeLabel("2026-10-09T01:00:00Z", Date.parse("2026-10-09T01:05:00Z")), "5분 전");
  assert.equal(talkTimeLabel("2026-10-09T01:00:00Z", Date.parse("2026-10-09T04:00:00Z")), "3시간 전");
});

test("단지 붙이기 — 그 지역 단지만(짧은 구 이름은 시·도까지)", () => {
  assert.equal(complexInRegion("서울 송파구", "서울 송파구"), true);
  assert.equal(complexInRegion("성남 분당구", "성남 분당구"), true);
  assert.equal(complexInRegion("서울 강남구", "서울 송파구"), false);
  assert.equal(complexInRegion("부산 중구", "서울 중구"), false, "중구는 시·도까지 같아야");
  assert.equal(complexInRegion("서울 중구", "서울 중구"), true);
});

test("토론 지역 — 서울 25개 구 + 경기·인천 · 폐지 구 제외 · 실거래 이름 후보", () => {
  const seoul = TALK_REGIONS.filter((r) => r.sido === "서울");
  assert.equal(seoul.length, 25);
  assert.ok(TALK_REGIONS.filter((r) => r.sido === "경기").length >= 25);
  assert.ok(TALK_REGIONS.filter((r) => r.sido === "인천").length >= 3);
  assert.equal(new Set(TALK_REGIONS.map((r) => r.id)).size, TALK_REGIONS.length);
  assert.deepEqual(talkRegionById("songpa")?.txNames.slice(0, 1), ["서울 송파구"]);
  assert.equal(talkRegionById("seongnam-bundang")?.txNames[0], "성남 분당구");
  assert.ok(talkRegionById("siheung")?.txNames.includes("경기 시흥시"), "신고 건수 표의 '경기 시흥시' 행");
  assert.equal(talkRegionById("nowhere"), null);
  assert.deepEqual(talkRegionNoteTokens(talkRegionById("jung")!), { sido: "서울", token: "중구" });
});

test("DB — 새 표 2개 · RLS · anon/authenticated 권한 회수 · 신고 함수 public 회수 · drop 없음", () => {
  const f = readdirSync("supabase/migrations").find((n) => n.endsWith("_1051_region_talks.sql"));
  assert.ok(f, "미러 파일");
  const sql = read(`supabase/migrations/${f}`);
  assert.doesNotMatch(sql, /\bdrop\b/i);
  assert.match(sql, /alter table public\.region_talks enable row level security;/);
  assert.match(sql, /revoke all on table public\.region_talks from public, anon, authenticated;/);
  assert.match(sql, /revoke all on table public\.region_talk_reports from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.report_region_talk\(uuid, text, text, integer\) from public, anon, authenticated;/);
  assert.match(sql, /check \(char_length\(body\) between 2 and 200\)/);
});

test("API — 읽기 누구나 · 쓰기 로그인 · 금칙어 · 도배 · 단지는 그 지역만 · 이메일 비노출", () => {
  const r = code("app/api/talk/route.ts");
  for (const m of ["GET", "POST", "DELETE"]) assert.match(r, new RegExp(`export async function ${m}\\(`));
  assert.match(r, /findBlockedWord\(body\)/);
  assert.match(r, /judgeFlood\(/);
  assert.match(r, /rateLimit\(`region-talk:\$\{email\}`/);
  assert.match(r, /complexInRegion\(decoded\.region, n\)/);
  assert.match(r, /"Cache-Control": "no-store"/);
  const store = code("lib/talk/store.ts");
  assert.doesNotMatch(store.slice(store.indexOf("function toPost"), store.indexOf("export async function listRegionTalks")), /author_email:/, "응답 모양에 이메일 없음");
  assert.match(code("app/api/talk/report/route.ts"), /reportRegionTalk\(id, email, reason\)/);
  assert.match(code("app/api/talk/board/route.ts"), /s-maxage=30/);
});

test("홈 — 맨 아래 실시간 토론(전폭) · 판은 화면 가까이 오면 받는 청크 · 서버 HTML 에 사용자 글 없음", () => {
  const page = code("app/page.tsx");
  assert.ok(page.indexOf("<HomeTalkSection />") > page.indexOf("<HomeTownBlock"), "동네이야기 다음");
  assert.ok(page.indexOf("<HomeTalkSection />") < page.indexOf("</main>"));
  const lazy = read("app/components/talk/TalkPanelLazy.tsx");
  assert.match(lazy, /nextDynamic\(\(\) => import\("\.\/TalkPanel"\)/);
  assert.match(lazy, /ssr: false/);
  assert.match(lazy, /IntersectionObserver/);
  assert.doesNotMatch(read("app/components/home/HomeTalkSection.tsx"), /"use client"/);
  const panel = code("app/components/talk/TalkPanel.tsx");
  assert.match(panel, /TALK_POLL_MS/);
  assert.match(panel, /document\.visibilityState === "visible"/);
  assert.match(panel, /사람 글 없음 · 아래는 자동 소식/);
  assert.equal((panel.match(/btn-primary/g) ?? []).length, 1);
  assert.match(code("app/talk/page.tsx"), /noIndex: true/);
});

test("배포 막힘 — 노트 상세의 댓글·음성 도구·가입 배너를 따로 받는 청크로 · 예산 검사 여유 경고", () => {
  const page = code("app/notes/[id]/page.tsx");
  assert.match(page, /from "\.\/NoteLazyParts"/);
  assert.doesNotMatch(page, /import \{ NoteComments, /);
  assert.doesNotMatch(page, /from "\.\/NoteSoftWall"/);
  const lazy = read("app/notes/[id]/NoteLazyParts.tsx");
  for (const m of ["./NoteComments", "./NoteAudioTools", "./NoteSoftWall"]) assert.ok(lazy.includes(`import("${m}")`), m);
  assert.doesNotMatch(lazy, /ssr: false/, "서버 렌더는 그대로");
  const budget = read("scripts/check-bundle-budget.mjs");
  assert.match(budget, /const NEAR_KB = 2\.5;/);
  assert.match(budget, /495: 실측 457KB|"\/page": 495/, "예산은 올리지 않는다");
});

test("단지·지역 화면 시간 초과 — 서버 렌더 오류면 한 번만 저절로 다시(2분에 한 번)", () => {
  const e = code("app/error.tsx");
  assert.match(e, /\^\\\/\(complex\|region\)\\\//);
  assert.match(e, /router\.refresh\(\);\s*reset\(\);/);
  assert.match(e, /Date\.now\(\) - last < 120_000/);
  assert.match(e, /if \(!error\?\.digest\) return;/);
});

test("폰 광고 — load 뒤 첫 입력 또는 6초 뒤(데스크톱은 그대로 즉시)", () => {
  const b = read("lib/ads/adsense-boot.ts");
  assert.match(b, /export const ADSENSE_MOBILE_DELAY_MS = 6000;/);
  assert.match(b, /\["scroll", "pointerdown", "keydown", "touchstart"\]/);
});
