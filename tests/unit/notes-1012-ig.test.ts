import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  RECENT_DAYS,
  feedHeaderStats,
  hasRecentNote,
  isRecentNote,
  regionHighlights,
  regionNameOf,
  regionShortOf,
} from "@/app/notes/region-chips";

/* [1012-IG] 소유자 지시 "임장노트는 인스타그램을 참조해줘"(범위 /notes 목록 · 기본 3열 격자).
 *
 * 1) 순수 함수 — 최근 7일 판정(시각 주입) · 지역 원 재료(표지 사진·링) · 머리 숫자 줄(0 칸 빼기).
 * 2) 소스 잠금 — 배치만 가져오고 그 서비스의 서명(그라데이션 링·이름)은 들이지 않는다. 동작 없는 아이콘 없음. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const DAY = 86_400_000;
const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** 게이트(scripts/check-ai-look.mjs)와 같은 방식 — 주석은 검사하지 않는다 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* ───────────── 1) 순수 함수 ───────────── */

test("[1012-IG] isRecentNote — 기준 시각 주입, 7일 경계는 미포함, 못 읽는 값은 새 노트가 아니다", () => {
  assert.equal(RECENT_DAYS, 7);
  assert.equal(isRecentNote(ago(0), NOW), true);
  assert.equal(isRecentNote(ago(6 * DAY), NOW), true);
  assert.equal(isRecentNote(ago(7 * DAY - 1), NOW), true);
  assert.equal(isRecentNote(ago(7 * DAY), NOW), false, "딱 7일 전은 최근 7일 밖");
  assert.equal(isRecentNote(ago(30 * DAY), NOW), false);
  /* 서버·브라우저 시계가 조금 어긋나 작성 시각이 기준보다 뒤여도 새 노트 */
  assert.equal(isRecentNote(new Date(NOW + 60_000).toISOString(), NOW), true);
  assert.equal(isRecentNote(undefined, NOW), false);
  assert.equal(isRecentNote("", NOW), false);
  assert.equal(isRecentNote("어제", NOW), false);
  /* 기준 시각이 없으면(마운트 전 · renderedAt 생략) 아무것도 새 노트라고 말하지 않는다 */
  assert.equal(isRecentNote(ago(0), Number.NaN), false);
  /* 기간 인자 */
  assert.equal(isRecentNote(ago(2 * DAY), NOW, 1), false);
});

test("[1012-IG] regionNameOf / regionShortOf — 원 아래 라벨(마지막 낱말) · 원 안 짧은 이름(행정 접미 떼기)", () => {
  assert.equal(regionNameOf("서울 마포구"), "마포구");
  assert.equal(regionShortOf("서울 마포구"), "마포");
  assert.equal(regionNameOf("안양시 동안구"), "동안구");
  assert.equal(regionShortOf("안양시 동안구"), "동안");
  assert.equal(regionShortOf("하남시"), "하남");
  assert.equal(regionShortOf("양평군"), "양평");
  /* 떼면 한 글자가 되는 이름·접미 없는 표기는 그대로 */
  assert.equal(regionShortOf("서울 중구"), "중구");
  assert.equal(regionShortOf("판교"), "판교");
  assert.equal(regionNameOf(""), "");
  assert.equal(regionShortOf(""), "");
});

test("[1012-IG] regionHighlights — 많은 곳부터 · 원 표지 = 그 지역 가장 최근의 실사진 · 최근 7일 새 노트면 링", () => {
  /* 입력은 최신순(서버 피드 순서) */
  const notes = [
    { region: "서울 마포구 합정동", coverUrl: null, createdAt: ago(1 * DAY) },
    { region: "서울 송파구 가락동", coverUrl: "https://x/s-new.jpg", createdAt: ago(20 * DAY) },
    { region: "서울 마포구 망원동", coverUrl: "https://x/m-old.jpg", createdAt: ago(10 * DAY) },
    { region: "서울특별시 송파구 잠실동", coverUrl: "https://x/s-old.jpg", createdAt: ago(40 * DAY) },
    { region: "서울 마포구", coverUrl: "https://x/m-older.jpg", createdAt: ago(50 * DAY) },
    { region: "", coverUrl: "https://x/none.jpg", createdAt: ago(0) },
  ];
  const items = regionHighlights(notes, NOW);
  assert.deepEqual(
    items.map((h) => [h.label, h.count, h.name, h.short, h.coverUrl, h.fresh]),
    [
      /* 마포 최신 노트엔 사진이 없다 → 그다음 최근 노트의 실사진. 1일 전 노트가 있어 링 */
      ["서울 마포구", 3, "마포구", "마포", "https://x/m-old.jpg", true],
      ["서울 송파구", 2, "송파구", "송파", "https://x/s-new.jpg", false],
    ],
  );
  /* 사진이 한 장도 없는 지역은 null(→ 한지 면 + 글자). 지어낸 표지 없음 */
  const bare = regionHighlights([{ region: "판교", coverUrl: null, createdAt: ago(9 * DAY) }], NOW);
  assert.deepEqual(bare, [{ label: "판교", count: 1, name: "판교", short: "판교", coverUrl: null, fresh: false }]);
  /* 기준 시각이 없으면 링 없음 */
  assert.ok(regionHighlights(notes, Number.NaN).every((h) => !h.fresh));
});

test("[1012-IG] hasRecentNote — '전체' 원의 링", () => {
  assert.equal(hasRecentNote([{ createdAt: ago(8 * DAY) }, { createdAt: ago(3 * DAY) }], NOW), true);
  assert.equal(hasRecentNote([{ createdAt: ago(8 * DAY) }, {}], NOW), false);
  assert.equal(hasRecentNote([], NOW), false);
});

test("[1012-IG] feedHeaderStats — 공개: 노트·지역·최근 7일, 0 칸은 빼고, 다 못 불러왔으면 숫자에 '+'", () => {
  const notes = [
    { region: "서울 마포구", createdAt: ago(1 * DAY) },
    { region: "서울 마포구 망원동", createdAt: ago(3 * DAY) },
    { region: "서울 송파구", createdAt: ago(12 * DAY) },
  ];
  assert.deepEqual(feedHeaderStats(notes, { now: NOW, mine: false, complete: true }), [
    { key: "total", value: 3, label: "공개 노트" },
    { key: "regions", value: 2, label: "지역" },
    { key: "recent", value: 2, label: "최근 7일" },
  ]);
  /* 첫 페이지가 꽉 찼고 아직 뒤가 있다 — 공개 노트 전체처럼 말하지 않는다 */
  /* [v4] "불러온 노트"(시스템 말) → "공개 노트" + 숫자 뒤 "+" */
  assert.equal(feedHeaderStats(notes, { now: NOW, mine: false, complete: false })[0].label, "공개 노트");
  assert.equal(feedHeaderStats(notes, { now: NOW, mine: false, complete: false })[0].more, true);
  /* 최근 7일 0건 · 지역 0곳 → 그 칸이 없다 */
  const old = [{ region: "", createdAt: ago(30 * DAY) }];
  assert.deepEqual(feedHeaderStats(old, { now: NOW, mine: false, complete: true }), [
    { key: "total", value: 1, label: "공개 노트" },
  ]);
  /* 0건이면 숫자 줄 자체가 없다 */
  assert.deepEqual(feedHeaderStats([], { now: NOW, mine: false, complete: true }), []);
});

test("[1012-IG] feedHeaderStats — 내 노트: 내 노트·공개(isPublic===true 만)·지역", () => {
  const mine = [
    { region: "서울 마포구", isPublic: true, createdAt: ago(1 * DAY) },
    { region: "서울 마포구", isPublic: false, createdAt: ago(2 * DAY) },
    { region: "판교", createdAt: ago(3 * DAY) } /* 공개 여부 모름 → 공개로 세지 않는다 */,
  ];
  assert.deepEqual(feedHeaderStats(mine, { now: NOW, mine: true, complete: true }), [
    { key: "total", value: 3, label: "내 노트" },
    { key: "public", value: 1, label: "공개" },
    { key: "regions", value: 2, label: "지역" },
  ]);
  const allPrivate = [{ region: "서울 마포구", isPublic: false }];
  assert.deepEqual(
    feedHeaderStats(allPrivate, { now: NOW, mine: true, complete: true }).map((s) => s.key),
    ["total", "regions"],
  );
});

/* ───────────── 2) 소스 잠금 ───────────── */

test("[1012-IG] 목록 배치 — 기본 격자 · 정사각 3열(모바일 끝까지 2px · md 4px · 반경 0) · 폭 전체 아이콘 탭", () => {
  const src = read("app/notes/notes-feed-client.tsx");
  const body = stripComments(src);
  assert.ok(body.includes('useState<ViewMode>("grid")'), "기본 보기 = 격자");
  assert.ok(body.includes('className="-mx-3.5 grid grid-cols-3 gap-0.5 md:mx-0 md:gap-1"'), "3열 · 2px/4px · 모바일 끝까지");
  assert.ok(!/md:grid-cols-[45]|xl:grid-cols-5/.test(body), "데스크톱도 3열");
  assert.ok(body.includes('className="press group relative block aspect-square overflow-hidden bg-divider"'), "정사각 타일 · 반경·테두리 없음");
  assert.ok(!body.includes("aspect-[3/4]"), "3:4 카드 없음");
  /* 탭: 폭 전체 반씩 · 아이콘 · aria-pressed · 현재 탭 = 잉크 선 */
  assert.ok(body.includes('aria-label="보기 방식" className="-mx-3.5 grid grid-cols-2 border-t border-line md:mx-0"'));
  assert.ok(body.includes('<Icon name="grid-3x3"') && body.includes('<Icon name="gallery-vertical"'));
  assert.ok(body.includes('active ? "border-ink text-ink" : "border-transparent text-text-3"'));
  /* 정렬 토글 = 40px 터치 · 선택 = 한지 + 남색 */
  assert.ok(body.includes('className="inline-flex h-10 items-center px-0.5"'));
  assert.ok(body.includes('on ? "bg-brand-hanji font-bold text-brand-hanji-ink" : "text-text-3"'));
});

test("[1012-IG] 하이라이트 원 — 64px · 새 노트 = 주홍 단색 링 · 선택 = 남색 링 · 그라데이션 링 없음", () => {
  const body = stripComments(read("app/notes/notes-feed-client.tsx"));
  assert.ok(body.includes("h-[64px] w-[64px] rounded-full"));
  assert.ok(body.includes('"border-2 border-brand-hanji-ink"') && body.includes('"border-2 border-brand-red"'));
  assert.ok(body.includes('"border border-line"'));
  /* 그라데이션은 사진 위 가독 오버레이 한 곳뿐(from-black) — 링·아바타·커버에 없음 */
  const gradients = body.match(/bg-gradient-to-[a-z]+|linear-gradient\(|conic-gradient\(|radial-gradient\(/g) ?? [];
  assert.deepEqual(gradients, ["bg-gradient-to-t"]);
  assert.ok(body.includes("bg-gradient-to-t from-black/60 to-transparent"));
  /* 그 서비스의 이름·용어를 UI 문자열에 들이지 않는다 */
  for (const word of ["인스타", "스토리", "릴스", "Instagram", "instagram"]) {
    assert.ok(!body.includes(word), `UI 문자열에 "${word}" 없음`);
  }
});

test("[1012-IG] 피드 카드 — 행동 줄은 동작하는 것만(댓글 #comments · 공용 공유 · 단지), 저장 아이콘 없음", () => {
  const body = stripComments(read("app/notes/notes-feed-client.tsx"));
  assert.ok(body.includes("href={`/notes/${n.id}#comments`}"), "댓글 = 상세 댓글 자리로 이동");
  assert.ok(body.includes("<ShareLinkButton"), "공유 = 공용 ShareLinkButton(시트 → 복사 → 토스트 · 이벤트)");
  assert.ok(body.includes("utm_source=share&utm_medium=note"), "상세 공유 링크와 같은 주소");
  assert.ok(!body.includes('name="bookmark"') && !body.includes('name="heart"'), "노트 저장·좋아요 기능이 없으니 아이콘도 없다");
  /* 비공개 내 노트에는 공유·댓글을 그리지 않는다 */
  assert.ok(body.includes("const publicNote = !n.isExample && (!mine || n.isPublic === true);"));
  /* 아바타 32px 원 · 남색 + 한지 글자 */
  assert.ok(body.includes("h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand-navy"));
  /* CTA 는 동사 + 대상 — "더 보기" 가 아니라 "노트 전체 읽기" */
  assert.ok(body.includes("노트 전체 읽기") && !body.includes(">더 보기<"));
});

test("[1012-IG] 새 아이콘은 Icon.tsx 에 있고, 페이지는 첫 렌더 기준 시각을 넘긴다", () => {
  const icon = read("app/components/Icon.tsx");
  for (const name of ['"grid-3x3":', '"gallery-vertical":', "images:", '"message-circle":']) {
    assert.ok(icon.includes(name), `ICON_PATHS ${name}`);
  }
  const page = stripComments(read("app/notes/page.tsx"));
  assert.ok(page.includes("renderedAt={renderedAt}"));
  /* 빌더가 사진 장수·(내 노트) 공개 여부를 싣는다 */
  const builder = read("lib/notes/feed-note.ts");
  assert.ok(builder.includes("photoCount: Array.isArray(n.photos) ? n.photos.length : 0"));
  assert.ok(builder.includes("isPublic: n.isPublic"));
});
