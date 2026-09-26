/* [1010] 실거래 적재가 "이번 실행에서 실제로 바꾼 단지"를 모으는 순수 수집기.
 *
 * 적재 루프(lib/market/molit-transactions.ts) 안에 두면 서버 전용 의존(supabase) 때문에
 * 단위 테스트가 붙지 않는다. 규칙(중복 제거·순서 보존·상한)은 여기서 고정한다.
 */
/**
 * [1010] 한 실행이 결과에 담는 "바뀐 단지" 상한.
 *
 * 기본 슬라이스는 시군구 16곳이고, 최근 달은 이미 채워졌어도 다시 upsert 한다
 * (isRecent 분기). 그래서 한 실행의 서로 다른 단지 수는 보통 수백~수천이다.
 * 2,000 을 넘으면 더 담지 않는다 — 목록은 크론 응답에도, 메모리에도 얹히고,
 * 그만큼의 revalidatePath 는 어차피 무효화 상한(REVALIDATE_BUDGET)에서 잘린다.
 */
export const TOUCHED_COMPLEX_CAP = 2_000;

export interface TouchedComplexSink {
  /** upsert 가 성공한 행 하나를 센다. 중복·빈 값·상한 초과는 조용히 버린다. */
  note(region: string, name: string): void;
  /** 적재 순서 그대로의 목록 — 무효화 상한에 걸려 잘려도 "먼저 적재된 시군구부터"가 유지된다 */
  list(): { region: string; name: string }[];
  /** 상한에 걸려 버린 단지가 있는가 */
  truncated(): boolean;
}

/**
 * [1010] "이번 실행이 실제로 바꾼 단지" 수집기.
 *
 * 적재 루프 안에 두면 검증할 수 없어서 따로 뺐다(tests/unit/complex-1010.test.ts).
 * 키는 `지역\u0001단지명` — encodeComplexId 와 같은 구분자 규칙이라 지역·단지명에
 * 나타날 수 없는 문자다.
 */
export function createTouchedComplexSink(cap = TOUCHED_COMPLEX_CAP): TouchedComplexSink {
  const seen = new Map<string, { region: string; name: string }>();
  let truncated = false;
  return {
    note(region: string, name: string): void {
      const r = typeof region === "string" ? region.trim() : "";
      const n = typeof name === "string" ? name.trim() : "";
      if (!r || !n) return;
      const key = `${r}\u0001${n}`;
      if (seen.has(key)) return;
      if (seen.size >= cap) {
        truncated = true;
        return;
      }
      seen.set(key, { region: r, name: n });
    },
    list: () => [...seen.values()],
    truncated: () => truncated,
  };
}

