/**
 * [1008 · S] 단지 검색 결과 한 줄의 모양 — 자동완성(/api/search/suggest)·통합 검색(/api/search/unified)이
 * 같은 필드로 내려주고, 단지 선택기·헤더·홈·지도·/search 가 같은 규칙으로 그린다.
 *
 * 왜: 같은 이름 단지가 전국에 여럿이다("은마" 3곳, "공작" 3곳, "롯데캐슬" 수십 곳). 이름·시군구만으로는
 * 고를 근거가 없어 일단 눌러 보고 되돌아오게 된다. 읍면동·세대수·최근 6개월 거래를 한 줄에 붙인다.
 * 모르는 값은 빼고 그린다 — 0 이나 "—" 로 채우면 없는 사실이 된다.
 * 클라이언트 번들에 실리는 파일이다(서버 import 금지 · 작게).
 */
export interface ComplexPreview {
  id: string;
  name: string;
  /** region_name ("안양 동안구") */
  region: string;
  /** 대표 지번의 읍면동("관양동") — 모르면 없음 */
  area?: string | null;
  households?: number | null;
  /** 최근 6개월 매매 건수 */
  recentTradeCount?: number | null;
  /** 전체 기간 평균 매매 실거래가(만원) */
  avgPriceManwon?: number | null;
  buildYear?: number | null;
  /** 이름·토큰으로 맞은 게 아니라 이름이 비슷한 후보(오타 추정) — "비슷한 이름" 으로 표시한다 */
  fuzzy?: boolean;
}

/** "안양 동안구 관양동" — 읍면동을 알면 붙인다 */
export function complexPlace(p: Pick<ComplexPreview, "region" | "area">): string {
  const region = (p.region ?? "").trim();
  const area = (p.area ?? "").trim();
  return area && !region.endsWith(area) ? `${region} ${area}`.trim() : region;
}

/** ["1,710세대", "6개월 거래 120건"] — 있는 값만 */
export function complexFacts(p: ComplexPreview): string[] {
  const out: string[] = [];
  if (p.households != null && p.households > 0) out.push(`${p.households.toLocaleString("ko-KR")}세대`);
  if (p.recentTradeCount != null) {
    out.push(p.recentTradeCount > 0 ? `6개월 거래 ${p.recentTradeCount}건` : "6개월 거래 없음");
  }
  return out;
}

/* ── 결과 없음 문구(소유자 지시 1008 — 단지 선택기·헤더·홈·지도·/search 가 같은 말을 쓴다) ── */
export const noMatchTitle = (q: string): string => `“${q}” 와 일치하는 단지가 없어요`;
export const NO_MATCH_HINT = "띄어쓰기 없이, 또는 동 이름 + 단지명으로 찾아보세요";
/** 예시 — 운영 DB 에서 이 형태로 1위가 나오는 것을 확인한 질의(tests/unit/complex-search-1008) */
export const NO_MATCH_EXAMPLE = "예: 목동 7단지 · 동탄 롯데캐슬";

/* ── 검색어 길이 상한([1008 · 리뷰 B]) ──
   /api/search/suggest·unified 는 80자 넘는 검색어에 400("검색어는 80자까지예요")을 낸다. 화면이 그걸
   "지금은 검색이 되지 않아요"(장애)로 그렸다 — 치는 쪽이 고칠 수 있는 일이다. 보내기 전에 막고 같은 말을 쓴다. */
export const SEARCH_QUERY_MAX = 80;
export const QUERY_TOO_LONG = "검색어는 80자까지예요";

/** 400 응답의 error 문구(있으면) — 없으면 null. 화면은 이 문구를 '장애' 대신 그대로 보여 준다. */
export async function badRequestNotice(res: Response): Promise<string | null> {
  if (res.status !== 400) return null;
  try {
    const j = (await res.json()) as { error?: unknown };
    return typeof j?.error === "string" && j.error ? j.error : QUERY_TOO_LONG;
  } catch {
    return QUERY_TOO_LONG;
  }
}
