/* [1057 · B] 관심·저장·알림·토론 묶음 검토 — 고친 사실을 잠근다.
 *
 *  B1  단지 화면 관심 해제 — 즉시 DELETE 가 아니라 지연 삭제 제어기(createDeferredRemover) · 되돌리기 = 취소.
 *  B2  /my/watchlist — 전체 수(count)를 머리에 · ?page= 쪽 나누기(30곳).
 *  B3  listBookmarks — 실패를 [] 로 접지 않고 던진다.
 *  B4  저장 검색 — 저장소가 던짐 · API 503 · 화면은 목록 유지 + "불러오기 실패" · 되돌리기에 alertEnabled · "검색 열기 ›".
 *  B5  알림 분류 — 새 실거래→매물 · 포인트 만료·초대 성사→포인트 · 임장 일정·출석→활동 · 읽은 알림(갈 곳 없음)은 버튼이 아니다.
 *  B6  모두 읽음 — 저장소가 던짐 · 라우트 503 · 화면은 응답 뒤에만 읽음 처리.
 *  B7  구독 조회 실패는 "없음"이 아니다 · 미읽음 수는 countUnreadInbox(unread-count) · 창 밖이면 "최근 100건".
 *  B8  토론 — countRecentTalks 는 readPaged · GET ?complexId= · 단지 칩은 complexHrefFromId · TalkPanel scope · 단지 화면 지연 섹션.
 *  B9  관심 단지 POST — try/catch → 503 · 재등록이 알림 범위를 null 로 덮지 않는다.
 *  B10 AlertRangeEditor — 억 입력 두 칸 · PATCH · 40px 누름 면.
 *  B11 notifyPriceChange(죽은 코드) 없음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertRangeLabel, alertRangeOrdered, eokInputFromKrw, parseEokInput } from "@/lib/watchlist/alert-range";
import { talkScopeForComplex } from "@/lib/talk/regions";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 지운 소스 — 고친 이유를 적은 주석에 옛 문구가 남아 있어도 코드만 본다 */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

/* ── B1 ───────────────────────────────────────────────────────────────── */
test("[1057·B1] 단지 화면 관심 해제 — 지연 삭제 제어기, 즉시 DELETE 없음", () => {
  const hub = code("app/complex/[id]/hub-client.tsx");
  assert.match(hub, /createDeferredRemover<WatchItem>\(/, "제어기 사용");
  assert.match(hub, /from "@\/app\/my\/watchlist\/deferred-remove"/);
  /* 예전: apply(false) 가 바로 fetch(... DELETE). 지금 DELETE 는 제어기의 sendDelete 안에만(keepalive 인자) */
  const deletes = hub.match(/method: "DELETE"/g) ?? [];
  assert.equal(deletes.length, 1, "DELETE 호출은 sendDelete 한 곳");
  assert.match(hub, /method: "DELETE", keepalive/);
  assert.match(hub, /remover\.undo\(removal\)/, "되돌리기 = 제어기 undo");
  /* 기다리는 삭제가 있을 때 다시 켜면 POST 가 아니라 취소 */
  assert.match(hub, /pending\.state === "pending"/);
  assert.match(hub, /addEventListener\("pagehide"/);
});

/* ── B2 ───────────────────────────────────────────────────────────────── */
test("[1057·B2] /my/watchlist — 전체 수를 머리에 · ?page= 쪽 나누기", () => {
  const page = code("app/my/watchlist/page.tsx");
  assert.match(page, /listWatchlistPage\(email, \{ offset, limit: PAGE_SIZE \}\)/);
  assert.match(page, /<WatchlistRows initial=\{rows\} total=\{total\} offset=\{offset\} \/>/);
  assert.doesNotMatch(page, /slice\(0, MAX_ROWS\)/, "앞 30곳 자르기 없음");
  assert.match(page, /pageHref\(pageNum \+ 1\)/, "다음 쪽 링크");
  const rows = code("app/my/watchlist/WatchlistRows.tsx");
  assert.match(rows, /total: number;/);
  assert.match(rows, /\{shownTotal\}<\/span>곳/, "머리는 전체 수");
  const store = code("lib/watchlist/store-db.ts");
  assert.match(store, /count: "exact"/);
  assert.match(store, /\.order\("id", \{ ascending: true \}\)[\s\S]*?\.range\(offset, offset \+ limit - 1\)/, "유일 정렬 + range");
});

/* ── B3 ───────────────────────────────────────────────────────────────── */
test("[1057·B3] listBookmarks — 실패를 던진다", () => {
  const s = code("lib/bookmarks/store.ts");
  const fn = s.slice(s.indexOf("export async function listBookmarks"), s.indexOf("export async function countBookmarks"));
  assert.doesNotMatch(fn, /if \(error\) return \[\];/);
  assert.match(fn, /if \(error\) throw new Error\(/);
});

/* ── B4 ───────────────────────────────────────────────────────────────── */
test("[1057·B4] 저장 검색 — 저장소 던짐 · API 503 · 화면 유지 · 되돌리기 alertEnabled · 검색 열기", () => {
  const store = code("lib/saved-search/store.ts");
  const fn = store.slice(store.indexOf("export async function listSavedSearches"), store.indexOf("export async function listAlertEnabledSavedSearches"));
  assert.match(fn, /throw new Error\(`saved_searches 조회 실패/);
  assert.doesNotMatch(fn, /return \[\];\s*\}\s*\}\s*$/, "오류를 [] 로 접지 않음");
  const api = code("app/api/saved-searches/route.ts");
  assert.match(api, /dbUnavailable\("saved-searches 목록 조회 실패"/);
  assert.match(api, /scopeActionUrl\(s\.scope, s\.query\)/);
  const client = code("app/my/watchlist/SavedSearchClient.tsx");
  assert.match(client, /alertEnabled: item\.alertEnabled,/, "되돌리기 POST 에 alertEnabled");
  assert.match(client, /검색 열기 ›/);
  assert.match(client, /href=\{item\.actionUrl\}/);
  /* refresh 실패는 목록을 비우지 않는다 — setItems([]) 가 catch 에 없다 */
  const refresh = client.slice(client.indexOf("async function refresh"), client.indexOf("async function handleCreate"));
  assert.doesNotMatch(refresh, /setItems\(\[\]\)/);
  assert.match(refresh, /setError\(LOAD_FAILED\)/);
  assert.match(client, /저장한 검색 불러오기 실패 · 잠시 후 다시/);
  const section = code("app/my/watchlist/SavedSearchesSection.tsx");
  assert.match(section, /initialFailed=\{failed\}/);
});

/* ── B5 ───────────────────────────────────────────────────────────────── */
/** page.tsx 의 classifyInbox 본문을 그대로 평가한다(1056 시험이 함수를 그 파일 안에 잠가 두어 모듈로 빼지 않았다) */
function loadClassifyInbox(): (title: string, body: string) => string {
  const src = code("app/notifications/page.tsx");
  const fn = src.slice(src.indexOf("function classifyInbox"), src.indexOf("function foldOps"));
  const js = fn.replace(/\(title: string, body: string\): Category/, "(title, body)");
  return new Function(`${js}; return classifyInbox;`)() as (title: string, body: string) => string;
}

test("[1057·B5] classifyInbox — 새 실거래→매물 · 포인트 만료·초대 성사→포인트 · 임장 일정·출석→활동 (1056 규칙 유지)", () => {
  const classifyInbox = loadClassifyInbox();
  assert.equal(classifyInbox("관심단지 새 실거래 3건", "래미안 2건(…) — 국토부 신고 기준"), "매물");
  assert.equal(classifyInbox("관심 단지 가격 변동", "현재가 8.5억 · 기준가 대비 +1.2%"), "매물");
  assert.equal(classifyInbox("포인트 기한 만료 안내", "유효기간이 지난 300P가 만료 처리됐어요."), "포인트");
  assert.equal(classifyInbox("포인트 만료 7일 전", "500P가 7일 뒤 만료돼요 · 상점에서 사용 가능"), "포인트");
  assert.equal(classifyInbox("친구 초대 성사 · +500P", "2026.10.11 · 초대 코드로 가입한 친구 1명 · 500P 적립"), "포인트");
  assert.equal(classifyInbox("내일 임장 일정", "10.12(일) 14:00 · 래미안 · 서울 송파구"), "활동");
  assert.equal(classifyInbox("오늘 출석 전", "출석 10P · 연속 3일 20P · 7일 50P"), "활동");
  /* 1056 */
  assert.equal(classifyInbox("댓글 채택", "…"), "활동");
  assert.equal(classifyInbox("새 팔로워", "…"), "활동");
  assert.equal(classifyInbox("관심 지역 새 매물", "서울 송파구 3건"), "관심지역");
  assert.equal(classifyInbox("매물 승인", "…"), "매물");
  const page = code("app/notifications/page.tsx");
  assert.match(page, /t\.includes\("실거래"\)/);
  assert.match(page, /t\.includes\("초대 성사"\)\) return "포인트"/);
  assert.match(page, /t\.includes\("임장 일정"\)/);
  /* 읽은 알림(갈 곳 없음) = 버튼 아님 */
  assert.match(page, /if \(isPoint \|\| \(item\.read && !item\.actionUrl\)\) return <div className=\{wrapper\}>\{card\}<\/div>;/);
});

/* ── B6 ───────────────────────────────────────────────────────────────── */
test("[1057·B6] 모두 읽음 — 저장소 던짐 · 라우트 503 · 화면은 응답 뒤에만", () => {
  const inbox = code("lib/notifications/inbox.ts");
  const fn = inbox.slice(inbox.indexOf("export async function markAllInboxRead"), inbox.indexOf("export async function countUnreadInbox"));
  assert.match(fn, /const \{ error \} = await q;/);
  assert.match(fn, /throw new Error\(`user_inbox_notifications 읽음 처리 실패/);
  const route = code("app/api/notifications/read-all/route.ts");
  assert.match(route, /dbUnavailable\("notifications read-all"/);
  const page = code("app/notifications/page.tsx");
  const mark = page.slice(page.indexOf("const markAllRead = async"), page.indexOf("const onOpen = async"));
  /* fetch → ok 확인 → 그 뒤 setInbox·emit(0). 실패면 토스트만 */
  assert.ok(mark.indexOf("await fetch(") < mark.indexOf("setInbox("), "fetch 가 setInbox 보다 먼저");
  assert.ok(mark.indexOf("if (!res.ok) throw") < mark.indexOf("emitNotificationsRead(0)"));
  assert.match(mark, /showToast\("읽음 처리 실패 · 잠시 후 다시"\)/);
});

/* ── B7 ───────────────────────────────────────────────────────────────── */
test("[1057·B7] 구독 실패 상태 · 미읽음은 unread-count · 창 밖이면 최근 100건", () => {
  const page = code("app/notifications/page.tsx");
  assert.match(page, /구독 불러오기 실패 · 잠시 후 다시/);
  assert.match(page, /setLoadFailed\(true\)/);
  assert.match(page, /fetch\("\/api\/notifications\/unread-count"/);
  assert.match(page, /unreadTotal \?\? windowUnread/);
  assert.match(page, /최근 100건/);
});

/* ── B8 ───────────────────────────────────────────────────────────────── */
test("[1057·B8] 토론 — readPaged · complexId 필터 · complexHrefFromId · scope · 단지 화면 지연 섹션", () => {
  const store = code("lib/talk/store.ts");
  assert.match(store, /readPaged<\{ region_id: string; created_at: string \}>\(/);
  assert.doesNotMatch(store, /\.limit\(5000\)/);
  assert.match(store, /\.order\("id", \{ ascending: true \}\)[\s\S]*?\.range\(from, to\)/);
  assert.match(store, /complexId: string \| null = null,/);
  assert.match(store, /if \(complexId\) q = q\.eq\("complex_id", complexId\);/);
  const api = code("app/api/talk/route.ts");
  assert.match(api, /searchParams\.get\("complexId"\)/);
  assert.match(api, /listRegionTalks\(region\.id, email, 40, complexId\)/);
  const panel = code("app/components/talk/TalkPanel.tsx");
  assert.match(panel, /href=\{complexHrefFromId\(p\.complexId\)\}/, "단지 칩 = 정규 주소");
  assert.doesNotMatch(panel, /href=\{`\/complex\/\$\{encodeURIComponent\(p\.complexId\)\}`\}/);
  assert.match(panel, /scope\?: TalkScope \| null;/);
  assert.match(panel, /complexId: scope\?\.complexId \?\? complex\?\.id \?\? null/, "단지 범위에서 쓴 글은 그 단지로");
  assert.match(panel, /&complexId=\$\{encodeURIComponent\(scopeComplexId\)\}/);
  const lazy = code("app/complex/[id]/ComplexTalkLazy.tsx");
  assert.match(lazy, /nextDynamic\(\(\) => import\("@\/app\/components\/talk\/TalkPanel"\)/);
  assert.match(lazy, /ssr: false/);
  const page = code("app/complex/[id]/page.tsx");
  assert.match(page, /talkScopeForComplex\(complexId, regionId\)/);
  assert.match(page, /<ComplexTalkLazy scope=\{talkScope\} \/>/);
  assert.doesNotMatch(page, /from "@\/app\/components\/talk\/TalkPanel"/, "판 본체는 라우트 번들 밖");
});

test("[1057·B8] talkScopeForComplex — 토론 지역의 해독 가능한 단지만", () => {
  const id = Buffer.from(`서울 송파구\u0001헬리오시티`, "utf8").toString("base64url");
  const s = talkScopeForComplex(id, "songpa");
  assert.ok(s, "송파구 단지");
  assert.equal(s?.regionId, "songpa");
  assert.equal(s?.complexName, "헬리오시티");
  assert.equal(talkScopeForComplex(id, "gangnam"), null, "다른 지역이면 null");
  assert.equal(talkScopeForComplex("kapt.A10027875", "songpa"), null, "kapt id 는 해독 불가");
  assert.equal(talkScopeForComplex(id, null), null);
  assert.equal(talkScopeForComplex(id, "busan-haeundae"), null, "토론 지역 밖");
});

/* ── B9 ───────────────────────────────────────────────────────────────── */
test("[1057·B9] 관심 단지 POST — try/catch 503 · 재등록이 알림 범위를 덮지 않음", () => {
  const route = code("app/api/me/watchlist/route.ts");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));
  assert.match(post, /try \{\s*item = await addToWatchlist\(/);
  assert.match(post, /관심 단지 저장 실패 · 잠시 후 다시/);
  const store = code("lib/watchlist/store-db.ts");
  const add = store.slice(store.indexOf("export async function addToWatchlist"), store.indexOf("export async function removeFromWatchlist"));
  assert.doesNotMatch(add, /alert_price_min: alertPriceMin \?\? null/, "null 로 덮지 않음");
  assert.match(add, /if \(alertPriceMin !== undefined\) payload\.alert_price_min = alertPriceMin;/);
});

/* ── B10 ──────────────────────────────────────────────────────────────── */
test("[1057·B10] AlertRangeEditor — 억 두 칸 · PATCH · 40px", () => {
  const ed = code("app/my/watchlist/AlertRangeEditor.tsx");
  assert.match(ed, /^"use client";/);
  assert.match(ed, /실거래 알림 범위 · 억/);
  assert.match(ed, /method: "PATCH"/);
  assert.match(ed, /min-h-\[40px\] md:min-h-6/);
  assert.match(ed, /알림 범위 저장 실패 · 잠시 후 다시/);
  assert.doesNotMatch(ed, /btn-primary/, "행마다 있는 보조 조작 — 채움 파랑 아님");
  const rows = code("app/my/watchlist/WatchlistRows.tsx");
  assert.match(rows, /<AlertRangeEditor/);
  const route = code("app/api/me/watchlist/route.ts");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /setWatchlistAlertRange\(session\.user\.email, complexId, min, max\)/);
});

test("[1057·B10] parseEokInput / eokInputFromKrw / alertRangeOrdered / alertRangeLabel", () => {
  assert.deepEqual(parseEokInput("8.5"), { ok: true, krw: 850_000_000 });
  assert.deepEqual(parseEokInput(" 12 "), { ok: true, krw: 1_200_000_000 });
  assert.deepEqual(parseEokInput("8.5억"), { ok: true, krw: 850_000_000 });
  assert.deepEqual(parseEokInput("0.05"), { ok: true, krw: 5_000_000 });
  assert.deepEqual(parseEokInput(""), { ok: true, krw: null }, "빈 칸 = 지움");
  assert.deepEqual(parseEokInput("abc"), { ok: false, reason: "nan" });
  assert.deepEqual(parseEokInput("-1"), { ok: false, reason: "nan" });
  assert.deepEqual(parseEokInput("0"), { ok: false, reason: "range" });
  assert.deepEqual(parseEokInput("1001"), { ok: false, reason: "range" });
  assert.equal(eokInputFromKrw(850_000_000), "8.5");
  assert.equal(eokInputFromKrw(1_200_000_000), "12");
  assert.equal(eokInputFromKrw(null), "");
  assert.equal(eokInputFromKrw(0), "");
  assert.equal(alertRangeOrdered(850_000_000, 950_000_000), true);
  assert.equal(alertRangeOrdered(950_000_000, 850_000_000), false);
  assert.equal(alertRangeOrdered(null, 850_000_000), true);
  assert.equal(alertRangeLabel(null, null), null);
  assert.equal(alertRangeLabel(850_000_000, 950_000_000), "알림 범위 8.5억~9.5억");
  assert.equal(alertRangeLabel(850_000_000, null), "알림 범위 8.5억~");
  assert.equal(alertRangeLabel(null, 1_200_000_000), "알림 범위 ~12억");
});

/* ── B11 ──────────────────────────────────────────────────────────────── */
test("[1057·B11] notifyPriceChange(죽은 코드) 없음 · 전용 import 도 없음", () => {
  const store = code("lib/watchlist/store-db.ts");
  assert.doesNotMatch(store, /notifyPriceChange/);
  assert.doesNotMatch(store, /pushInboxNotification|WATCHERS_LIMIT/);
});
