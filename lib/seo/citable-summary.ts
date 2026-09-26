/**
 * [1006 · E] 인용 가능한 요약(GEO) — 순수 함수. 서버 컴포넌트·테스트 양쪽에서 쓴다.
 *
 * 왜 따로 두나: AI 검색(ChatGPT·Perplexity·Claude)이 페이지를 인용할 때 가져가는 것은
 * 표가 아니라 **한 문단**이다. 그 문단은 떼어 놓아도 "무엇의·언제·어디 기준 값"인지가
 * 문단 안에 있어야 한다(G12). 지역 허브(/region/[id])는 이미 그런 첫 문단을 갖고 있고,
 * 단지 허브(/complex/[id])에는 없었다 — KPI 칸과 AI 요약 탭(클라이언트)뿐이라 서버
 * HTML 에 "잠실엘스 2026년 8월 평균 24.5억(12건)" 같은 완결 문장이 없었다.
 *
 * 규칙(llms.txt 인용 규칙과 같다):
 *  - 값·기준월·출처(국토교통부 실거래)를 한 문장에 넣는다.
 *  - 값이 없으면 그 문장을 **빼고**, 아무 값도 없으면 요약 자체를 만들지 않는다(null).
 *    "시세 준비 중"·"조회 실패"는 인용 문장이 아니다.
 *  - 평균은 단순 평균이고 호가가 아니라는 사실을 문장 밖(캡션)에 둔다 — 여기서는 숫자만.
 *
 * [1007 · P2] 문장 규칙의 단일 출처: 숫자를 고르고 얼굴을 정하는 규칙(12개월 건수·면적대
 * 중앙값·전세 중앙값·전세가율·표본 3건·억 단위)은 lib/complex/complex-facts.ts 의
 * **요약 조각**(SummaryFragments — 지도 패널 summaryLine 이 잇는 바로 그 조각)이다. 이 파일은
 * `facts` 를 받으면 그 조각으로 2~4번째 문장을 만들고(같은 숫자·같은 얼굴), 첫 문장(최신월
 * 평균)만 여기서 만든다 — 패널에는 최신월 평균이 없어서다. `facts` 없이 부르면(옛 호출·테스트)
 * 예전 입력(deals12m·households·buildYear)으로 예전 문장을 그대로 낸다.
 */

import { formatKrwManwon } from "@/lib/format/krw";
import type { SummaryFragments } from "@/lib/complex/complex-facts";

/** 화면과 JSON-LD(speakable.cssSelector)가 같은 블록을 가리키게 하는 셀렉터 */
export const AI_SUMMARY_SELECTOR = "[data-ai-summary]";

export interface ComplexCitableInput {
  name: string;
  /** "서울 송파구" — 시/도 + 시군구 (같은 이름의 단지가 다른 지역에 있을 수 있어 필수) */
  regionLabel: string;
  /** 읍면동("잠실동") — 없으면 null(지어내지 않는다) */
  emd?: string | null;
  /** 최신 집계월 yyyymm */
  latestYm: string | null | undefined;
  /** 최신월 실거래 평균(만원) */
  latestAvgManwon: number | null | undefined;
  /** 최신월 신고 건수 */
  latestDealCount?: number | null;
  /** 최근 12개월(달력 창) 신고 건수 */
  deals12m?: number | null;
  households?: number | null;
  buildYear?: number | null;
  /** 실거래 조회에 실패했으면 요약을 만들지 않는다 — 실패를 "없음"으로 적지 않기 위해 */
  txFailed?: boolean;
  /**
   * [1007] complex-facts 의 요약 조각(buildComplexFacts().summaryFragments). 있으면 2~4번째
   * 문장을 이 조각으로 만든다 — 지도 패널 한 줄 요약과 같은 숫자·같은 얼굴. 없으면 예전 입력.
   */
  fragments?: SummaryFragments | null;
}

export interface CitableSummary {
  /** 화면에 그리는 문장들(2~3개) */
  sentences: string[];
  /** 문장을 이어 붙인 한 문단 — JSON-LD description·테스트용 */
  text: string;
  /** 기준월 "2026-08" (ISO 월) */
  basisMonth: string;
  /** llms.txt 권장 형식의 인용 예문 한 줄 */
  citation: string;
}

/** "202608" → { label: "2026년 8월", iso: "2026-08" } — 형식이 아니면 null */
export function ymParts(ym: string | null | undefined): { label: string; iso: string } | null {
  if (!ym || !/^\d{6}$/.test(ym)) return null;
  const month = Number(ym.slice(4));
  if (month < 1 || month > 12) return null;
  return { label: `${ym.slice(0, 4)}년 ${month}월`, iso: `${ym.slice(0, 4)}-${ym.slice(4)}` };
}

/** "202509","202608" → "2025-09/2026-08" (schema.org temporalCoverage). 둘 중 하나라도 형식이 아니면 null */
export function ymRangeToTemporalCoverage(
  firstYm: string | null | undefined,
  lastYm: string | null | undefined,
): string | null {
  const a = ymParts(firstYm);
  const b = ymParts(lastYm);
  if (!a || !b) return null;
  return `${a.iso}/${b.iso}`;
}

/**
 * 신선도 캡션 "2026.09.19"(getMarketFreshnessDateLabel) → ISO 날짜 "2026-09-19".
 * JSON-LD dateModified 는 **집계가 실제로 갱신된 날**이어야 한다(렌더 시각이 아니다) —
 * 이 값은 market_ingest_log 의 마지막 성공 적재일이라 그 조건을 만족한다.
 * 형식이 아니거나 달력에 없는 날(2026.02.31)이면 null — 날짜를 지어내지 않는다.
 */
export function freshnessLabelToIsoDate(label: string | null | undefined): string | null {
  if (!label) return null;
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** 만원 → "24.5억" · "9,800만" (단지 허브 표기 eok1 과 같은 얼굴) */
function priceLabel(manwon: number): string {
  return formatKrwManwon(manwon, { style: "eok1" });
}

function count(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * 단지 허브 인용 요약. 실거래 최신월 평균이 없으면 null — 껍데기 문단을 만들지 않는다.
 */
export function buildComplexCitableSummary(input: ComplexCitableInput): CitableSummary | null {
  if (input.txFailed) return null;
  const ym = ymParts(input.latestYm);
  const avg = input.latestAvgManwon;
  if (!ym || typeof avg !== "number" || !Number.isFinite(avg) || avg <= 0) return null;

  const name = input.name.trim();
  const region = input.regionLabel.trim();
  const emd = input.emd?.trim() || null;
  const place = [region, emd].filter(Boolean).join(" ");
  const price = priceLabel(avg);

  const sentences: string[] = [];

  const dealCount =
    typeof input.latestDealCount === "number" && input.latestDealCount > 0
      ? input.latestDealCount
      : null;
  sentences.push(
    `${place} ${name}의 ${ym.label} 아파트 매매 실거래 평균은 ${price}입니다` +
      (dealCount ? `(해당 월 신고 ${count(dealCount)}건, ` : "(") +
      "국토교통부 실거래가 공개시스템 기준, 해제 신고분 제외).",
  );

  const f = input.fragments ?? null;
  if (f) {
    /* [1007] 조각 = 패널 한 줄 요약과 같은 문자열. 문장 꼬리만 여기서 붙인다. */
    if (f.trades) {
      sentences.push(`이 단지는 ${f.trades}입니다(매매 신고 기준, 중앙값은 면적 미가중).`);
    }
    const rent = [f.jeonse, f.jeonseRatio].filter((v): v is string => Boolean(v));
    if (rent.length > 0) {
      sentences.push(
        `전월세 신고 기준 ${rent.join(" · ")}입니다` +
          (f.jeonseRatio
            ? "(전세가율 = 최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 중앙값, 각 표본 3건 이상일 때만)."
            : "."),
      );
    }
    const specs = [f.households, f.buildYear].filter((v): v is string => Boolean(v));
    if (specs.length > 0) {
      sentences.push(`${name}는 ${specs.join(", ")} 단지입니다(공동주택 공공데이터 기준).`);
    }
  } else {
    if (typeof input.deals12m === "number" && input.deals12m > 0) {
      sentences.push(`최근 12개월에 신고된 이 단지의 매매 거래는 ${count(input.deals12m)}건입니다.`);
    }

    const specs: string[] = [];
    if (typeof input.households === "number" && input.households > 0) {
      specs.push(`총 ${count(input.households)}세대`);
    }
    if (typeof input.buildYear === "number" && input.buildYear > 1900) {
      specs.push(`${input.buildYear}년 준공`);
    }
    if (specs.length > 0) {
      sentences.push(`${name}는 ${specs.join(", ")} 단지입니다(공동주택 공공데이터 기준).`);
    }
  }

  const citation =
    `내집나우(naezipnow.com) 집계에 따르면, ${place} ${name}의 ${ym.label} 아파트 매매 실거래 평균은 ` +
    `${price}이다(${ym.label} 기준, 국토교통부 실거래 기반).`;

  return { sentences, text: sentences.join(" "), basisMonth: ym.iso, citation };
}
