/**
 * [1051 · 홈 실시간 토론] 토론 지역 목록 — 서버 전용(카탈로그 · 이름 후보표가 무겁다 · 화면에는 /api/talk/board 가 이름만 보낸다).
 *
 * 수도권: 서울 25개 구 + 경기·인천(lib/map/seoul-districts METRO_EXPLORE_DISTRICTS · 폐지된 구 제외).
 * 지수(한국부동산원)·신고 건수(국토교통부)가 이 id·이름으로 적재돼 있다. 없는 값은 화면이 "모름"으로 둔다.
 */
import { METRO_EXPLORE_DISTRICTS, SEOUL_DISTRICTS, type SeoulDistrictInfo } from "@/lib/map/seoul-districts";
import { marketRegionNameCandidates } from "@/lib/market/region-name-candidates";

export type TalkRegion = {
  id: string;
  name: string;
  sido: "서울" | "경기" | "인천";
  /** 실거래 지역 이름 후보 — 첫 값이 대표("서울 송파구" · "성남 분당구" · "남양주시") */
  txNames: string[];
};

function sidoOf(info: SeoulDistrictInfo): TalkRegion["sido"] | null {
  const c = (info.city ?? "서울").trim();
  if (c === "서울" || c === "경기" || c === "인천") return c;
  return null;
}

function txNamesOf(info: SeoulDistrictInfo, sido: TalkRegion["sido"]): string[] {
  const out = new Set<string>();
  const base = marketRegionNameCandidates(info.id, info.name);
  /* 대표는 "시·도 구"(서울·인천) 또는 "시 구"(경기 일반구) 꼴이 먼저 오게 */
  const preferred = base.find((n) => n.includes(" ") && !/^\S+시 /.test(n)) ?? base[0];
  if (preferred) out.add(preferred);
  for (const n of base) out.add(n);
  /* 신고 건수 표에는 "경기 시흥시"처럼 도 이름이 붙은 행도 있다(2026-10 실측) */
  if (!info.name.includes(" ")) out.add(`${sido} ${info.name}`);
  for (const a of info.aliases ?? []) out.add(a);
  return [...out];
}

function build(): TalkRegion[] {
  const out: TalkRegion[] = [];
  const seen = new Set<string>();
  for (const info of [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS]) {
    if (info.retired || seen.has(info.id)) continue;
    const sido = sidoOf(info);
    if (!sido) continue;
    seen.add(info.id);
    out.push({ id: info.id, name: info.name, sido, txNames: txNamesOf(info, sido) });
  }
  return out;
}

export const TALK_REGIONS: readonly TalkRegion[] = build();
const BY_ID = new Map(TALK_REGIONS.map((r) => [r.id, r]));

export function talkRegionById(id: string | null | undefined): TalkRegion | null {
  return BY_ID.get(String(id ?? "").trim()) ?? null;
}

/** 노트·글의 지역 표기에서 찾을 낱말 — 마지막 낱말("분당구" · "남양주시"), 두 글자 구(중구·서구)는 시·도까지 */
export function talkRegionNoteTokens(r: TalkRegion): { sido: string | null; token: string } {
  const token = r.name.split(" ").slice(-1)[0] ?? r.name;
  return { sido: token.length <= 2 ? r.sido : null, token };
}
