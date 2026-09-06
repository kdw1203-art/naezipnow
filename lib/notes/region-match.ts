/* [967 · 13] 임장노트 지역 매칭 — 순수 함수(유닛 테스트: tests/unit/note-detail-967.test.ts).
 *
 * 노트의 region 은 자유 텍스트다: "경기 안양시 동안구 관양동" 처럼 동까지 적히기도,
 * "서울 강남구" 처럼 구에서 끝나기도, "서울특별시 송파구" 처럼 광역 접미가 붙기도
 * 한다. 상세의 관련 노트(RelatedNotes)는 `region ===` 정확 일치라 "서울 송파구
 * 가락동" 노트 옆에 "서울 송파구 잠실동" 노트가 나오지 않았고, 목록(/notes)의
 * 관심 지역 칩은 별도의 포함 매칭을 갖고 있어 두 화면의 "같은 지역" 이 달랐다.
 * 여기 한 곳으로 모은다.
 *
 * 규칙
 *  · 광역 접미(특별시·광역시)·도 표기는 lib/imjang/region-label 과 같은 방식으로 접는다.
 *  · 동 > 구 > 시 순으로 촘촘한 단위가 같을수록 관련도가 높다(3·2·1). 동이 같아도
 *    구가 서로 다르게 적혀 있으면 우연한 동명(중동·신촌동…)으로 보고 동 일치를 주지
 *    않는다 — 어긋난 지역을 "같은 동네" 라고 말하는 것보다 안 잡는 편이 낫다.
 *  · 구조 파싱이 안 되는 표기(예: "판교")는 공백을 지운 양방향 부분 포함으로만 본다
 *    (= 예전 /notes matchesInterest 의 규칙). 관련도 1.
 */

export type RegionParts = {
  /** 시·도 또는 시 — "서울" · "안양시". 도(경기·강원…)는 시가 없을 때만 남는다 */
  si: string;
  /** 구·군 — "송파구" · "양평군" */
  gu: string;
  /** 동·읍·면·리 — "가락동" · "진접읍" */
  dong: string;
};

const METRO_RE = /^(서울|부산|대구|인천|광주|대전|울산|세종)(특별자치시|특별시|광역시)?$/;
const PROVINCE_RE =
  /^(경기도?|강원(특별자치도|도)?|충청북도|충북|충청남도|충남|전라북도|전북(특별자치도)?|전라남도|전남|경상북도|경북|경상남도|경남|제주(특별자치도)?)$/;

/** 공백 제거·정규화 — 부분 포함 비교용 키. "서울특별시 송파구" → "서울송파구" */
export function regionKey(region: string | null | undefined): string {
  return tokensOf(region)
    .map((t, i) => {
      if (i !== 0) return t;
      const m = t.match(METRO_RE);
      return m ? m[1] : t;
    })
    .join("");
}

function tokensOf(region: string | null | undefined): string[] {
  return String(region ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** 자유 텍스트 지역 → 시·구·동 조각. 못 찾은 칸은 빈 문자열. */
export function parseRegionParts(region: string | null | undefined): RegionParts {
  const tokens = tokensOf(region);
  let si = "";
  let gu = "";
  let dong = "";
  let province = "";
  tokens.forEach((raw, i) => {
    const metro = i === 0 ? raw.match(METRO_RE) : null;
    const t = metro ? metro[1] : raw;
    if (i === 0 && PROVINCE_RE.test(t)) {
      province = t;
      return;
    }
    if (metro) {
      si = t;
      return;
    }
    if (/[시]$/.test(t) && t.length >= 2) {
      /* "안양시" — 시가 여러 개 적히는 일은 없지만, 뒤에 오는 것을 우선한다
         (앞이 도 표기를 시로 잘못 적은 경우: "경기시"?) — 실데이터에는 없다 */
      si = t;
      return;
    }
    if (/[구군]$/.test(t) && t.length >= 2) {
      gu = t;
      return;
    }
    if (/[동읍면리가]$/.test(t) && t.length >= 2) {
      dong = t;
      return;
    }
  });
  /* 시가 없고 도만 있으면("경기 하남시" 는 시가 있으니 제외) 도를 시 칸에 둔다 —
     "경기 광주시" 와 "광주" 광역시가 섞이지 않게, 도는 시가 없을 때만 쓴다 */
  if (!si && province) si = province;
  return { si, gu, dong };
}

/** 두 지역의 관련도 — 3: 같은 동 · 2: 같은 구 · 1: 같은 시(또는 부분 포함) · 0: 무관 */
export function regionAffinity(
  a: string | null | undefined,
  b: string | null | undefined,
): 0 | 1 | 2 | 3 {
  const ka = regionKey(a);
  const kb = regionKey(b);
  if (!ka || !kb) return 0;
  const pa = parseRegionParts(a);
  const pb = parseRegionParts(b);
  const compatible = (x: string, y: string) => !x || !y || x === y;
  const sameSi = Boolean(pa.si && pa.si === pb.si);
  const sameGu = Boolean(pa.gu && pa.gu === pb.gu && compatible(pa.si, pb.si));
  const sameDong = Boolean(
    pa.dong && pa.dong === pb.dong && compatible(pa.gu, pb.gu) && compatible(pa.si, pb.si),
  );
  if (sameDong) return 3;
  if (sameGu) return 2;
  if (sameSi) return 1;
  /* 구조가 안 잡히는 표기 — 예전 /notes 관심 지역 칩의 양방향 포함 규칙 */
  if (ka.includes(kb) || kb.includes(ka)) return 1;
  return 0;
}

/**
 * 노트 지역 ↔ 관심(구독) 지역 매칭 — /notes 의 "내 관심 지역" 칩.
 * 구독값은 "서울" 처럼 넓게도, "안양시 동안구" 처럼 좁게도 들어온다.
 */
export function matchesInterest(
  region: string | null | undefined,
  interests: ReadonlyArray<string>,
): boolean {
  if (!regionKey(region) || interests.length === 0) return false;
  return interests.some((raw) => regionAffinity(region, raw) > 0);
}

/**
 * 관련 노트 정렬 — 같은 동 → 같은 구 → 같은 시 순, 같은 단계 안에서는 입력 순서
 * (호출부가 최신순으로 준다) 유지. 자기 자신은 뺀다. 관련도 0 은 넣지 않는다.
 */
export function rankRelatedNotes<T extends { id: string; region: string }>(
  notes: ReadonlyArray<T>,
  current: { id: string; region: string },
  cap = 6,
): T[] {
  const scored: Array<{ n: T; score: number; order: number }> = [];
  notes.forEach((n, order) => {
    if (n.id === current.id) return;
    const score = regionAffinity(current.region, n.region);
    if (score === 0) return;
    scored.push({ n, score, order });
  });
  scored.sort((x, y) => y.score - x.score || x.order - y.order);
  return scored.slice(0, Math.max(0, cap)).map((s) => s.n);
}
