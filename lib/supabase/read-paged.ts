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
