/**
 * [1046 · 성장] IndexNow 로 알릴 단지 고르기 — 순수 함수(서버 전용 모듈을 끌어오지 않는다, 단위 시험용).
 *
 * 왜: IndexNow 크론이 하루 5개 안팎(허브 3 · 월간 리포트 2 · 최근 노트)만 알리고, 유입의 46%가 착지하는
 * 단지 페이지는 한 번도 알리지 않았다. 네이버·빙은 IndexNow 로 받은 URL 을 먼저 수집한다.
 *
 * 무엇을: "실제로 바뀐" 단지만 — 지난 하루 사이에 **최근 계약월(당월·전월) 거래**가 새로 적재된 단지.
 * 같은 날 들어오는 옛 연도 이력 백필(하루 수만 건)은 고르지 않는다. 화면이 바뀐 건 맞지만 검색자에게
 * 새 소식이 아니고, 하루 수천 개를 밀어 넣으면 프로토콜 남용으로 읽힌다(lib/seo/indexnow.ts 원칙).
 *
 * 순서: 가장 최근 계약월 → 새로 들어온 거래 수 → 이름. 상한(cap)에서 자른다.
 */

export type FreshTradeRow = {
  region_name: string | null;
  complex_name: string | null;
  contract_ym: string | null;
};

export type FreshComplex = { region: string; name: string; latestYm: string; newTrades: number };

/** 하루 상한 — 허브·리포트·노트와 합쳐 IndexNow 한 번 제출 상한(1,000) 안에 든다 */
export const INDEXNOW_COMPLEX_DAILY_CAP = 900;

/** yyyymm 에서 n 개월 전. 형식이 아니면 빈 문자열 */
export function ymMinus(yyyymm: string, months: number): string {
  if (!/^\d{6}$/.test(yyyymm)) return "";
  const d = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1 - months, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 새로 적재된 거래 행 → 알릴 단지 목록.
 * minYm 보다 이른 계약월(이력 백필)은 버리고, 단지별로 묶어 최근 순으로 cap 개.
 */
export function pickFreshComplexes(
  rows: FreshTradeRow[],
  opts: { minYm: string; cap?: number },
): FreshComplex[] {
  const cap = Math.max(0, Math.floor(opts.cap ?? INDEXNOW_COMPLEX_DAILY_CAP));
  const byKey = new Map<string, FreshComplex>();
  for (const r of rows) {
    const region = (r.region_name ?? "").trim();
    const name = (r.complex_name ?? "").trim();
    const ym = (r.contract_ym ?? "").trim();
    if (!region || !name || !/^\d{6}$/.test(ym)) continue;
    if (opts.minYm && ym < opts.minYm) continue;
    const key = `${region}\u0000${name}`;
    const hit = byKey.get(key);
    if (hit) {
      hit.newTrades += 1;
      if (ym > hit.latestYm) hit.latestYm = ym;
    } else {
      byKey.set(key, { region, name, latestYm: ym, newTrades: 1 });
    }
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        b.latestYm.localeCompare(a.latestYm) ||
        b.newTrades - a.newTrades ||
        a.region.localeCompare(b.region, "ko") ||
        a.name.localeCompare(b.name, "ko"),
    )
    .slice(0, cap);
}
