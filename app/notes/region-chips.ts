import { regionGroupOf } from "@/lib/notes/region-match";
import type { FeedNote } from "@/lib/notes/feed-note";

/* [1012] 공개 임장노트 피드 상단의 지역 칩 재료 — 순수 함수(유닛 테스트: tests/unit/notes-1012.test.ts).
 *
 * 인스타 스토리 줄(원형 아바타 + 링)을 걷고 /town 의 "우리 동네 홈" 칩과 같은 **지역명 + 노트 수**
 * 레일로 바꾸면서, 숫자를 세는 규칙을 한 곳에 둔다. 모수는 **손에 든 노트**(서버 첫 페이지 +
 * "더 보기" 로 붙인 것)이지 DB 전량이 아니다 — 그래서 화면에도 "이 피드 기준" 이라 적는다.
 * 지역 단위는 시·구(regionGroupOf — 내 노트 필터와 같은 잣대). 동까지 나누면 칩이 노트 수만큼 생긴다.
 *
 * [1012-IG] 소유자 지시 "임장노트는 인스타그램을 참조해줘"(범위: /notes 목록만) — 배치만 가져온다.
 * 칩 줄은 원형 하이라이트 줄이 되고, 머리에 숫자 줄이 붙는다. 그 재료(원 표지 사진·최근 7일 판정·
 * 숫자 칸)도 여기 순수 함수로 둔다 — 시각은 호출부가 주입한다(유닛 테스트: notes-1012-ig.test.ts).
 * 숫자는 전부 손에 든 노트를 센 값이다. 없는 값(0)은 칸을 만들지 않는다(지어내지 않는다). */

export type RegionChip = { label: string; count: number };

/** 노트의 지역 칩 라벨 — 시·구 단위("서울 송파구"). 구조를 못 읽는 표기는 원문. 빈 값은 "". */
export function regionChipOf(n: Pick<FeedNote, "region" | "regionGroup">): string {
  return n.regionGroup ?? regionGroupOf(n.region);
}

/** 손에 든 노트를 시·구 단위로 센다. 많은 곳부터, 같은 수는 먼저 나온 순서(임의 재배열 금지). */
export function countRegions(notes: ReadonlyArray<Pick<FeedNote, "region" | "regionGroup">>): RegionChip[] {
  const counts = new Map<string, { label: string; count: number; order: number }>();
  notes.forEach((n, order) => {
    const label = regionChipOf(n);
    if (!label) return;
    const cur = counts.get(label);
    if (cur) cur.count += 1;
    else counts.set(label, { label, count: 1, order });
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ label, count }) => ({ label, count }));
}

/** 헤더 부제 — "공개 노트 N건 · 지역 M곳". 0건이면 빈 문자열(숫자 없는 사실은 호출부가 적는다). */
export function feedSummaryLine(notes: ReadonlyArray<Pick<FeedNote, "region" | "regionGroup">>): string {
  if (notes.length === 0) return "";
  const regions = countRegions(notes).length;
  return regions > 0 ? `공개 노트 ${notes.length}건 · 지역 ${regions}곳` : `공개 노트 ${notes.length}건`;
}

/* ───────────── [1012-IG] 하이라이트 줄 · 숫자 줄 ───────────── */

/** "새 노트" 로 치는 기간(일) — 하이라이트 주홍 링과 숫자 줄 "최근 7일" 칸이 같은 값을 쓴다 */
export const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * 작성 시각이 `now` 기준 최근 `days` 일 안인가. 시각을 못 읽으면 false(새 노트라고 말하지 않는다).
 * 서버·클라이언트 시계가 조금 어긋나 작성 시각이 `now` 보다 뒤여도 새 노트로 본다.
 */
export function isRecentNote(
  createdAt: string | null | undefined,
  now: number,
  days: number = RECENT_DAYS,
): boolean {
  if (!createdAt || !Number.isFinite(now)) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return now - t < days * DAY_MS;
}

/** 원 아래 라벨의 지역명 — 시·구 라벨의 마지막 낱말("서울 마포구" → "마포구", "판교" → "판교") */
export function regionNameOf(label: string): string {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? "";
}

/**
 * 원 안 글자(사진 없는 원) — 지역명에서 행정 접미(구·군·시)를 뗀 짧은 이름("마포구" → "마포").
 * 떼고 나면 한 글자가 되는 이름("중구")과 접미가 없는 표기("판교")는 그대로 둔다.
 */
export function regionShortOf(label: string): string {
  const name = regionNameOf(label);
  const m = name.match(/^(.+)[구군시]$/);
  return m && m[1].length >= 2 ? m[1] : name;
}

export type RegionHighlight = RegionChip & {
  /** 원 아래 라벨("마포구") */
  name: string;
  /** 사진 없는 원 안 글자("마포") */
  short: string;
  /** 그 지역에서 가장 최근 노트의 실사진(입력 순서 = 최신순). 없으면 null → 한지 면 + 글자 */
  coverUrl: string | null;
  /** 최근 RECENT_DAYS 일 안에 새 노트가 있다 → 주홍 링 */
  fresh: boolean;
};

type HighlightInput = Pick<FeedNote, "region" | "regionGroup" | "coverUrl" | "createdAt">;

/**
 * 하이라이트 원 재료 — countRegions 와 같은 순서(많은 곳부터). 입력은 최신순이어야 한다
 * (공개 피드는 서버가 created_at 내림차순으로 주고, "더 보기" 는 더 오래된 것을 뒤에 붙인다).
 */
export function regionHighlights(notes: ReadonlyArray<HighlightInput>, now: number): RegionHighlight[] {
  const cover = new Map<string, string>();
  const fresh = new Set<string>();
  for (const n of notes) {
    const label = regionChipOf(n);
    if (!label) continue;
    if (n.coverUrl && !cover.has(label)) cover.set(label, n.coverUrl);
    if (isRecentNote(n.createdAt, now)) fresh.add(label);
  }
  return countRegions(notes).map((c) => ({
    ...c,
    name: regionNameOf(c.label),
    short: regionShortOf(c.label),
    coverUrl: cover.get(c.label) ?? null,
    fresh: fresh.has(c.label),
  }));
}

/** 손에 든 노트 중 최근 RECENT_DAYS 일 안에 쓰인 것이 하나라도 있는가("전체" 원의 링) */
export function hasRecentNote(notes: ReadonlyArray<Pick<FeedNote, "createdAt">>, now: number): boolean {
  return notes.some((n) => isRecentNote(n.createdAt, now));
}

export type FeedStat = { key: "total" | "public" | "regions" | "recent"; value: number; label: string; more?: boolean };

/**
 * 머리 숫자 줄(굵은 숫자 위 · 작은 라벨 아래). 값이 0 인 칸은 만들지 않는다.
 *  · 공개 피드: 노트 수 · 지역 수 · 최근 7일. 아직 뒤에 더 있으면 숫자에 "+"(`more`)를 붙여
 *    첫 페이지 30건을 공개 노트 전체처럼 말하지 않는다. [v4] 라벨 "불러온 노트"는 시스템 말이라 "공개 노트" + "30+" 로.
 *  · 내 노트: 내 노트 수 · 그중 공개 · 지역 수(공개 여부를 모르는 노트는 공개로 세지 않는다).
 */
export function feedHeaderStats(
  notes: ReadonlyArray<Pick<FeedNote, "region" | "regionGroup" | "createdAt" | "isPublic">>,
  opts: { now: number; mine: boolean; complete: boolean },
): FeedStat[] {
  const regions = countRegions(notes).length;
  const stats: FeedStat[] = opts.mine
    ? [
        { key: "total", value: notes.length, label: "내 노트" },
        { key: "public", value: notes.filter((n) => n.isPublic === true).length, label: "공개" },
        { key: "regions", value: regions, label: "지역" },
      ]
    : [
        { key: "total", value: notes.length, label: "공개 노트", ...(opts.complete ? {} : { more: true }) },
        { key: "regions", value: regions, label: "지역" },
        {
          key: "recent",
          value: notes.filter((n) => isRecentNote(n.createdAt, opts.now)).length,
          label: `최근 ${RECENT_DAYS}일`,
        },
      ];
  return stats.filter((s) => s.value > 0);
}
