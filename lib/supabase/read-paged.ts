/* [1055] PostgREST 응답 상한(max-rows 1,000)을 넘어 끝까지 읽는다.
 *
 * 왜: `.limit(3000)` 한 번은 조용히 1,000행만 돌려주고, `rows.length >= 3000` 같은 "표본 상한" 판정은 영원히 거짓이다.
 * 운영 실측(2026-10-11): 전월세 3개월 표본이 1,000행을 넘는 지역 12곳+(평택 2,329 · 강남 1,996 …) — "신고분 1,000건 기준"을
 * 사실처럼 적고 중앙값은 임의의 1,000행에서 나왔다. 1009 가 리포트 목록·입주 물량에 한 방식(range 로 쪽 나누기)을 공통 함수로.
 *
 * page(from, to) 는 매 쪽 **새 빌더**로 같은 조건·같은 정렬에 `.range(from, to)` 를 붙여 돌려준다(정렬은 유일 열까지 — 쪽이
 * 겹치거나 빠지지 않게). maxRows 에 닿으면 truncated=true(화면은 "N건 이상"·"표본 상한"으로 적는다). */
export type PagedResult<T> = { rows: T[]; truncated: boolean };

export const POSTGREST_MAX_ROWS = 1000;

export async function readPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows: number,
  pageSize: number = POSTGREST_MAX_ROWS,
): Promise<PagedResult<T>> {
  const size = Math.min(pageSize, POSTGREST_MAX_ROWS);
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += size) {
    const to = Math.min(from + size, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const got = data ?? [];
    for (const r of got) rows.push(r);
    if (got.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/* [1103] 최근 N개월 원본 표본을 **달마다 한 번씩, 나란히** 읽는다 — 정렬 없이(인덱스 순서 그대로).
 *
 * 왜(운영 2026-11-02T16:06 · /region/gangseo·songpa·gangdong "곁다리 섹션 공유 예산 8000ms 초과"): 위 readPaged 는 쪽이
 * 겹치지 않게 (contract_ym, id) 로 정렬한다. 그런데 표본 인덱스(mt_rent_region_ym_cov_idx · mt_trade_region_recent_cov2_idx)에
 * id 가 없어서 **쪽마다** 3개월 행 전부를 힙에서 다시 읽고 정렬했다 — 송파 3개월 1,981행 · 쪽당 195ms · 힙 읽기 275블록,
 * 그게 2~4쪽 **직렬**이었다(EXPLAIN ANALYZE 실측). 몰린 렌더에서는 이 한 섹션이 8초 예산을 먼저 다 썼다.
 * 달 하나(contract_ym = 그 달)는 정렬 없이 인덱스만 읽는다 — 송파 2026.10 984행 0.66ms · 힙 0(같은 실측).
 *
 * 규칙: months 는 최신 달부터. 첫 달은 "그 달 이후"(gte — 예전 `gte(from)` 과 같은 집합이 되도록), 나머지는 그 달만(eq).
 * 한 달이 한 쪽(1,000행)을 꽉 채우면 그 달만 예전 방식(page 에 ordered=true · 유일 정렬 · 쪽 나누기)으로 다시 읽는다 —
 * 큰 구의 큰 달(동탄 2026.09 1,686행 등)도 빠짐없이 센다. 합친 뒤 maxRows 를 넘으면 최신 달부터 남기고 truncated.
 * 실패는 던진다(빈 배열로 위장하지 않는다 — readPaged 와 같은 계약). */
export async function readRecentMonths<T>(
  months: readonly string[],
  page: (
    ym: string,
    opts: { newest: boolean; ordered: boolean },
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows: number,
  pageSize: number = POSTGREST_MAX_ROWS,
): Promise<PagedResult<T>> {
  const size = Math.min(pageSize, POSTGREST_MAX_ROWS);
  const parts = await Promise.all(
    months.map(async (ym, i): Promise<PagedResult<T>> => {
      const newest = i === 0;
      const first = await page(ym, { newest, ordered: false }, 0, size - 1);
      if (first.error) throw new Error(first.error.message);
      const got = first.data ?? [];
      if (got.length < size) return { rows: got, truncated: false };
      return readPaged<T>((f, t) => page(ym, { newest, ordered: true }, f, t), maxRows, size);
    }),
  );
  const rows: T[] = [];
  let truncated = false;
  for (const p of parts) {
    if (p.truncated) truncated = true;
    for (const r of p.rows) {
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      rows.push(r);
    }
  }
  return { rows, truncated };
}
