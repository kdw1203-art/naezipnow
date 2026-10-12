/* [1059] 임장노트·매물 저장 — DB 제약(bookmarks CHECK) 을 바꾸지 않고 프로필 설정 jsonb 로 저장한다. 잠그는 사실:
 *  S1 순수 규칙 — 설정에서 saved 묶음 읽기(모양 어긋난 값 버림 · 중복 제거) · 넣기(중복 무시 · 맨 앞 · 상한) · 빼기.
 *  S2 저장소 분기 — note·listing 은 settings-store 로, 나머지는 bookmarks 표로 · 한도는 합산.
 *  S3 API — type=note 허용 · ?type=&id= 저장 여부 · DELETE 실패 503.
 *  S4 화면 — 노트 상세 저장 단추(남의 공개 노트) · 마이 저장한 노트 실조회 · 관심 › 저장 탭 둘째 묶음 · 크리에이터 저장 수. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SAVED_CAP_PER_KIND, readSavedBag, withSaved, withoutSaved } from "@/lib/bookmarks/settings-store";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

test("S1 readSavedBag — 모양 어긋난 값은 버리고 중복 id 는 하나만", () => {
  assert.deepEqual(readSavedBag(null), {});
  assert.deepEqual(readSavedBag({ saved: "x" }), {});
  const bag = readSavedBag({
    saved: { note: [{ id: "a", at: "2026-10-12T00:00:00Z" }, { id: "a", at: "x" }, { id: "", at: "y" }, 3, { id: "b", at: "2026-10-11T00:00:00Z", label: "제목" }], listing: "no" },
  });
  assert.deepEqual(bag, { note: [{ id: "a", at: "2026-10-12T00:00:00Z", label: null }, { id: "b", at: "2026-10-11T00:00:00Z", label: "제목" }] });
});

test("S1 withSaved/withoutSaved — 중복 무시 · 맨 앞 · 상한 · 빼기", () => {
  const e = (id: string) => ({ id, at: `2026-10-12T00:00:${id.padStart(2, "0")}Z`, label: null });
  let bag = withSaved({}, "note", e("1")).bag;
  const dup = withSaved(bag, "note", e("1"));
  assert.equal(dup.added, false);
  bag = withSaved(bag, "note", e("2")).bag;
  assert.deepEqual(bag.note?.map((x) => x.id), ["2", "1"]);
  for (let i = 3; i <= SAVED_CAP_PER_KIND + 5; i++) bag = withSaved(bag, "note", e(String(i))).bag;
  assert.equal(bag.note?.length, SAVED_CAP_PER_KIND);
  assert.equal(bag.note?.[0]?.id, String(SAVED_CAP_PER_KIND + 5));
  const r = withoutSaved(bag, "note", "9");
  assert.equal(r.removed, true);
  assert.equal(withoutSaved(r.bag, "note", "9").removed, false);
  assert.deepEqual(withSaved({}, "listing", e("L")).bag.listing?.map((x) => x.id), ["L"]);
});

test("S2 저장소 분기 — note·listing 은 설정 jsonb · 한도 합산", () => {
  const s = code("lib/bookmarks/store.ts");
  assert.match(s, /\| "note";/);
  assert.match(s, /SAVED_KINDS\.has\(type\)/);
  assert.match(s, /if \(isSettingsKind\(input\.targetType\)\)[\s\S]*addSaved\(/);
  assert.match(s, /if \(isSettingsKind\(type\)\) \{\s*await removeSaved\(/);
  assert.match(s, /return \(count \?\? 0\) \+ \(await countSaved\(em\)\);/);
  const st = code("lib/bookmarks/settings-store.ts");
  assert.match(st, /from\("profiles"\)/);
  assert.match(st, /\.eq\("updated_at", row\.updatedAt\)/);
  assert.match(st, /\.contains\("settings", \{ saved: \{ \[kind\]: \[\{ id \}\] \} \}\)/);
  assert.doesNotMatch(st, /from\("bookmarks"\)/);
});

test("S3 API — note 허용 · ?type=&id= · DELETE 503", () => {
  const r = code("app/api/bookmarks/route.ts");
  assert.match(r, /v === "note"/);
  assert.match(r, /if \(type && id\) \{[\s\S]*isBookmarked\(session\.user\.email, type, id\)/);
  assert.match(r, /dbUnavailable\("bookmark-remove"/);
});

test("S4 화면 — 노트 저장 단추 · 마이 · 관심 › 저장 · 크리에이터", () => {
  const btn = code("app/notes/[id]/NoteSaveButton.tsx");
  assert.match(btn, /aria-pressed=\{saved\}/);
  assert.match(btn, /min-h-\[40px\][^"]*md:min-h-6/);
  assert.match(btn, /readAuthedHint\(\)/);
  assert.doesNotMatch(btn, /[가-힣]!|해 보세요/);
  const act = code("app/notes/[id]/note-actions.tsx");
  assert.match(act, /\{!isOwner && isPublic && <NoteSaveButton/);
  const my = code("app/my/page.tsx");
  assert.match(my, /listBookmarks\(email, "note"\)/);
  assert.match(my, /loadSavedNotes\(email\)/);
  const tab = code("app/my/watchlist/page.tsx");
  assert.match(tab, /<SavedNotesSection email=\{email\} \/>/);
  const sec = code("app/my/watchlist/SavedNotesSection.tsx");
  assert.match(sec, /저장한 노트 없음/);
  assert.match(sec, /저장한 노트 불러오기 실패/);
  const cr = code("app/my/creator/page.tsx");
  assert.match(cr, /countSavedForTarget\("note", n\.id\)/);
  assert.doesNotMatch(code("app/my/creator/creator-client.tsx"), /저장 집계 없음/);
});
