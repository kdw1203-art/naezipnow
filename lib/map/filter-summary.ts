/**
 * [967 · 23] 접힌 필터 바의 요약 — 지금 걸려 있는 필터를 짧은 토막으로.
 *
 * 순수 함수. 입력은 app/map/map-client.tsx 의 실제 필터 상태(키 + 범위)이고,
 * 출력은 "매매", "10억 이하", "84㎡ 이상" 같은 토막 배열이다. 토막 하나 = 걸린 축
 * 하나라, 배열 길이가 곧 map-client 의 activeCount 와 같다(둘이 어긋나면 배지의
 * 숫자와 요약이 서로 다른 말을 하게 된다 — 테스트로 못박는다).
 *
 * 기본값("all"·"off"·양끝 null)은 토막을 만들지 않는다. 라벨은 map-client 의 칩
 * 문구와 같은 말을 쓴다(사용자가 눌렀던 글자 그대로 요약에 보여야 한다).
 */
export type RangeSel = [number | null, number | null];

export type MapFilterSummaryInput = {
  /** 매물 거래유형 — "all" | "sale" | "jeonse" | "monthly" */
  tradeKey: string;
  /** 건물 유형 — "all" | "apartment" | "villa" | "detached" | "officetel" | "commercial" */
  propertyKindKey: string;
  /** 방 수 하한 — "all" | "1".."7" */
  roomsKey: string;
  /** 욕실 수 하한 — "all" | "1".."4" */
  bathroomsKey: string;
  /** 주차 대수 하한 — "all" | "1".."3" */
  parkingKey: string;
  /** 출퇴근 상한(분) — "off" | "30" | "45" | "60" */
  commuteKey: string;
  ranges: {
    /** 만원 단위 */
    price: RangeSel;
    /** ㎡ */
    area: RangeSel;
    /** 준공연도 */
    year: RangeSel;
    /** 세대수 */
    households: RangeSel;
  };
};

const TRADE_LABEL: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

const KIND_LABEL: Record<string, string> = {
  apartment: "아파트",
  villa: "빌라",
  detached: "단독주택",
  officetel: "오피스텔",
  commercial: "상가",
};

/** 만원 → "12.3억" / "8,200만" (map-client 의 manwonShort 와 같은 규칙) */
export function manwonLabel(manwon: number): string {
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok) : Number(eok.toFixed(1))}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function isSet(sel: RangeSel | undefined): sel is RangeSel {
  return Boolean(sel) && (sel![0] !== null || sel![1] !== null);
}

/**
 * 범위 한 축을 한 토막으로. 양끝이 다 있으면 "A~B", 한쪽만 있으면 "A 이상"/"B 이하".
 * `fmt` 는 숫자 하나를 단위 붙여 적고, `both` 는 양끝을 같이 적는 방법(단위를
 * 한 번만 붙이려고 — "59~84㎡" 이지 "59㎡~84㎡" 가 아니다).
 */
function rangeLabel(
  sel: RangeSel,
  fmt: (n: number) => string,
  both: (lo: number, hi: number) => string,
  words: { min: string; max: string } = { min: "이상", max: "이하" },
): string {
  const [lo, hi] = sel;
  if (lo !== null && hi !== null) return both(lo, hi);
  if (lo !== null) return `${fmt(lo)} ${words.min}`;
  return `${fmt(hi as number)} ${words.max}`;
}

export function summarizeMapFilters(s: MapFilterSummaryInput): string[] {
  const out: string[] = [];

  if (s.tradeKey !== "all") out.push(TRADE_LABEL[s.tradeKey] ?? s.tradeKey);

  const r = s.ranges;
  if (isSet(r.price)) {
    out.push(rangeLabel(r.price, manwonLabel, (lo, hi) => `${manwonLabel(lo)}~${manwonLabel(hi)}`));
  }
  if (isSet(r.area)) {
    out.push(rangeLabel(r.area, (n) => `${Math.round(n)}㎡`, (lo, hi) => `${Math.round(lo)}~${Math.round(hi)}㎡`));
  }
  if (isSet(r.year)) {
    out.push(
      rangeLabel(
        r.year,
        (n) => `${Math.round(n)}년`,
        (lo, hi) => `${Math.round(lo)}~${Math.round(hi)}년`,
        { min: "이후", max: "이전" },
      ),
    );
  }
  if (isSet(r.households)) {
    out.push(
      rangeLabel(
        r.households,
        (n) => `${Math.round(n).toLocaleString("ko-KR")}세대`,
        (lo, hi) => `${Math.round(lo).toLocaleString("ko-KR")}~${Math.round(hi).toLocaleString("ko-KR")}세대`,
      ),
    );
  }

  if (s.propertyKindKey !== "all") out.push(KIND_LABEL[s.propertyKindKey] ?? s.propertyKindKey);
  if (s.roomsKey !== "all") out.push(`방 ${s.roomsKey}개+`);
  if (s.bathroomsKey !== "all") out.push(`욕실 ${s.bathroomsKey}개+`);
  if (s.parkingKey !== "all") out.push(`주차 ${s.parkingKey}대+`);
  if (s.commuteKey !== "off") out.push(`출퇴근 ≤${s.commuteKey}분`);

  return out;
}
