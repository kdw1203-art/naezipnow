/**
 * [1012 · R2] 동네이야기 카테고리 카드 부제(숫자 한 줄) — **순수 함수**(DB·server-only 없음,
 * tests/unit/town-1012.test.ts 가 그대로 import 한다).
 *
 * 2라운드 리뷰(채점 A −3): 카테고리 타일 여섯 장 중 숫자가 붙은 건 뉴스룸("오늘 기사 N건")뿐이고
 * 청약·공매·입주·정비사업 네 장은 이름만 서 있었다. 기준 사이트의 입구 카드는 이름 + 건수다.
 * 숫자의 원천은 lib/town/category-counts.ts(서버 · 하루 캐시)이고, 여기서는 **그 숫자를 한 줄로
 * 적기만** 한다. 값이 null(조회 실패·미설정)이거나 0 이면 부제를 만들지 않는다 — 없는 숫자를
 * 지어내지 않고, 0 은 "살아 있다"는 신호가 아니라 비었다는 고백이라 그리지 않는다(970 · C-30).
 */
import { kstParts } from "@/lib/format/kst";

export type TownCategoryCounts = {
  /** 오늘(KST)이 접수 기간 안인 청약 공고 수 — applyhome_announcements(rcept_bgnde ≤ 오늘 ≤ rcept_endde) */
  applyOpen: number | null;
  /** 온비드 입찰 중·예정 물건 수 — onbid_auctions, /auctions 히어로와 같은 셈(getActiveAuctionCount) */
  onbidActive: number | null;
  /** 이번 달(KST) 입주 예정 단지 수 — apartment_supply(move_in_ym = 이번 달) */
  supplyMonth: number | null;
  /** supplyMonth 가 센 달 "YYYYMM" */
  supplyYm: string | null;
  /** 정비사업 구역 수 — redevelopment_projects 전체(/redevelopment 지도에 실리는 모수와 같다) */
  redevZones: number | null;
};

/** href → 부제 한 줄. 값이 없는 칸은 키 자체가 없다. */
export type TownCategorySubs = Readonly<Partial<Record<string, string>>>;

/** epoch ms → KST "YYYY-MM-DD" */
export function kstDayOf(ms: number): string {
  const p = kstParts(ms);
  if (!p) return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** epoch ms → KST "YYYYMM" (apartment_supply.move_in_ym 과 같은 꼴) */
export function kstYmOf(ms: number): string {
  return kstDayOf(ms).slice(0, 7).replace("-", "");
}

const n = (v: number) => v.toLocaleString("ko-KR");
const positive = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 카드 여섯 장의 부제. 타일 폭이 96px(모바일)이라 **짧게** — "접수 중 12건" · "진행 1,130건" ·
 * "9월 입주 12곳" · "구역 214곳" · "오늘 기사 4건" · "이번 주 새 글 3".
 */
export function buildTownCategorySubs(input: {
  counts: TownCategoryCounts | null;
  /** 오늘 기사 수(뉴스룸 칸) — 화면이 손에 든 뉴스 목록에서 센 값 */
  todayNews?: number;
  /** 이번 주 새 글·노트 수(허브 칸) — 이 피드에 실린 카드 기준 */
  weekPosts?: number;
}): TownCategorySubs {
  const out: Partial<Record<string, string>> = {};
  const c = input.counts;
  if (positive(input.weekPosts)) out["/town"] = `이번 주 새 글 ${n(input.weekPosts)}`;
  if (positive(input.todayNews)) out["/town/news"] = `오늘 기사 ${n(input.todayNews)}건`;
  if (c) {
    if (positive(c.applyOpen)) out["/apply"] = `접수 중 ${n(c.applyOpen)}건`;
    if (positive(c.onbidActive)) out["/auctions"] = `진행 ${n(c.onbidActive)}건`;
    if (positive(c.supplyMonth) && c.supplyYm && /^\d{6}$/.test(c.supplyYm)) {
      out["/supply"] = `${Number(c.supplyYm.slice(4, 6))}월 입주 ${n(c.supplyMonth)}곳`;
    }
    if (positive(c.redevZones)) out["/redevelopment"] = `구역 ${n(c.redevZones)}곳`;
  }
  return out;
}
