/* [1026c · 폰 배율 1] 문장 속 링크 24px 하한(py-[5px]) — 전 경로 폰 조작 검사에서 지적된 자리. */
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { Fineprint } from "../components/Fineprint";
import { FactTable } from "../components/compact/FactTable";
import { KeyPoints, type KeyPoint } from "../components/compact/KeyPoints";
import { KeywordChips } from "../components/compact/KeywordChips";
import {
  SIGNAL_FACTOR_META,
  SIGNAL_FACTOR_ORDER,
  SIGNAL_FORMULA_VERSION,
  SIGNAL_LEAN,
  type SignalFactorKey,
} from "@/lib/signals/engine";

export const metadata = buildPageMetadata({
  title: "데이터 방법론 — 실거래 집계 방식",
  description:
    "국토교통부 실거래 기반 시세 집계 방식, 해제거래 제외, 신고 지연 처리, 시장 온도 지표의 계산 공식을 공개합니다.",
  path: "/methodology",
});

/* G18·G9 — 데이터 방법론 공개 페이지.
   새로 만든 규칙이 아니라, 이미 코드가 하고 있는 처리를 문서화한 것이다.
   각 항목의 출처는 레포 커밋·모듈에 있다(해제거래 제외 #150, 시장 온도 timing 페이지).
   이 페이지는 정적(데이터 페칭 없음) — 구체적 수치는 시점에 묶이므로 적지 않고,
   방식만 적는다. 수치는 각 화면이 기준월과 함께 보여 준다. */

/* [1052] 다요인 분석 요인별 계산 — 판의 요인 이름이 여기(#signal-<key>)로 온다. 이름은 엔진 표(SIGNAL_FACTOR_META)에서 */
const SIGNAL_FACTOR_TEXT: Record<SignalFactorKey, string> = {
  sentiment:
    "한국부동산원 주간 매수우위지수(지역, 없으면 시도)와 한국은행 주택가격전망 CSI. 둘 다 100이 균형입니다. 매수우위는 100에서 7.5마다 1점, CSI는 12.5마다 1점이며 둘 다 있으면 평균합니다.",
  news:
    "최근 60일 동안 내집나우가 모은 지역 기사 제목의 오름·내림 낱말 수(내집나우가 자동으로 쓴 글 제외). 점수는 2 × (오름 − 내림) ÷ 방향 낱말 수(최소 3)입니다. 방향 낱말이 있는 제목이 없으면 0점이 아니라 미반영이고, 기사가 3건 미만이면 가중치 절반입니다.",
  interest:
    "지역 기사 최근 30일과 직전 30일 건수의 변화(합 3건 이상 · ±1.5 상한)와, 단지 화면이면 내집나우 단지 조회 최근 30일과 직전 30일의 변화(동의한 방문 표본 · 합 10회 이상 · ±1 상한)를 평균합니다. 둘 다 표본이 모자라면 미반영, 일부를 불러오지 못하면 \"불러오기 실패\"로 적습니다.",
  volume:
    "국토교통부 실거래 신고 건수(지역 아파트 매매). 신고 기한(30일)이 남은 이번 달과 지난달을 뺀 최근 3개월 합을 1년 전 같은 3개월(없으면 직전 3개월)과 비교해 25% 변화마다 1점입니다. 두 구간 합이 30건 미만이면 가중치 절반입니다.",
  trend:
    "한국부동산원 월간 아파트 매매지수의 1년 변화율, 5%마다 1점. 그 사이 한 달에 ±5% 넘게 튄 달(지수 기준 변경 흔적)이 있으면 비교하지 않습니다.",
  momentum:
    "한국부동산원 주간 아파트 매매지수의 최근 3주 평균 변동률, 주 0.08%마다 1점. 주간 지수가 없으면 월간 한 달 변동률(0.5%마다 1점 · 가중치 절반)로 대신합니다.",
  supply:
    "입주 예정 물량 ÷ 지역 세대수(0% → +1 · 1.5% → 0 · 3% → −1 · 4.5% 이상 → −2). 세대수가 없으면 연 환산 입주 ÷ 연 매매 신고(20% → +1 · 50% → 0 · 80% → −1)를 잣대로 씁니다. 기사 제목의 매물 늘어남·줄어듦 단서를 함께 평균합니다. 입주 예정 자료가 없거나, 0세대(공공데이터 미반영과 구분 불가)이거나, 잣대가 없으면 기사 단서만으로 점수를 매기지 않습니다(미반영).",
  rate:
    "예금은행 대출금리 4.5%를 0으로, 1%p 낮을 때마다 +1(최대 +1) · 높을 때마다 −1. 대출금리가 없으면 기준금리 3%를 0으로 봅니다. 한국은행 금리수준전망 CSI가 100보다 높으면(오를 거라는 응답이 많음) 최대 −0.5, 낮으면 최대 +0.5를 더합니다.",
};

const SECTIONS: { id: string; q: string; a: string[]; items?: { id: string; label: string; text: string }[] }[] = [
  {
    id: "source",
    q: "시세 데이터는 어디서 오나요?",
    a: [
      "국토교통부 실거래가 공개시스템(공공데이터포털)의 아파트 매매·전월세 신고 자료를 사용합니다. 부동산 포털의 호가나 추정치가 아니라, 실제로 신고된 계약만 집계합니다.",
      "전국 시군구를 주기적으로 순회하며 수집하고, 모든 화면의 수치에는 기준월을 함께 표기합니다.",
    ],
  },
  {
    id: "cancelled",
    q: "해제(취소)된 거래는 어떻게 처리하나요?",
    a: [
      "계약 후 해제 신고된 거래는 시세 평균에서 제외합니다. 해제분을 섞으면 단지 평균가가 실제와 크게 달라질 수 있기 때문입니다. 실측 검증에서 해제거래를 포함하면 일부 단지의 평균가가 20% 이상 왜곡되는 것을 확인하고 전면 제외로 정했습니다.",
      "해제됐다는 사실 자체도 데이터이므로 원본 기록은 보존하되, \"이 단지가 얼마에 거래됐나\"를 답하는 화면에는 넣지 않습니다.",
    ],
  },
  {
    id: "lag",
    q: "최근 달 거래량이 적어 보이는 이유는?",
    a: [
      "실거래 신고 기한은 계약 후 30일입니다. 따라서 이번 달과 직전 달 수치는 아직 신고되지 않은 계약만큼 실제보다 적게 집계되며, 시간이 지나면서 채워집니다.",
      "거래량 차트에서는 이번 달을 다른 색으로 구분하고, 추세 계산(시장 온도)에서는 신고가 완결되지 않은 달을 제외합니다.",
    ],
  },
  {
    id: "average",
    q: "\"평균 매매가\"는 어떻게 계산하나요?",
    a: [
      "지역 평균은 해당 시군구의 기간 내 실거래를 단순 평균한 값입니다. 면적·타입을 구분하지 않은 평균이므로, 같은 지역이라도 어떤 평형이 많이 거래됐는지에 따라 체감과 다를 수 있습니다.",
      "그래서 단지 화면에서는 면적대별 시세를 따로 보여 주며, 평균과 함께 거래 건수를 항상 표기합니다. 3건짜리 평균과 300건짜리 평균은 신뢰도가 다르기 때문입니다.",
    ],
  },
  {
    id: "temperature",
    q: "\"시장 온도\"는 무엇인가요?",
    a: [
      "내집나우 고유 지표로, 지역 시장의 가격·거래 활동을 0~100으로 요약합니다. 50이 중립입니다.",
      "계산: 50점 기준에 ① 매매가격지수 모멘텀(최근 3개월 평균 변동률, 월 ±1%를 ±25점으로 환산)과 ② 거래량 추이(신고 완결월 기준 최근 구간 대비 직전 구간 증감, ±50%를 ±25점으로 환산)를 더합니다. 거래량 완결월이 4개 미만이면 지수 모멘텀만 반영하며, 화면에 그 사실을 표시합니다.",
      "시장 온도는 매수·매도 추천이 아니라 시장 상태의 서술이며, 계산에 쓰인 실측 입력값을 항상 함께 보여 줍니다.",
    ],
  },
  {
    /* [1048 · 1052] 다요인 분석 — lib/signals/engine.ts 를 그대로 적는다. 공식 번호 · 쪽 경계 · 요인 이름은 엔진 상수에서
       읽어 판과 어긋나지 않게 한다. 요인별 칸(#signal-<key>)은 판의 요인 이름 링크가 닿는 곳. */
    id: "signals",
    q: "\"다요인 분석(시장 신호)\"은 어떻게 계산하나요?",
    a: [
      `다요인 분석은 AI가 만든 판단이 아니라 정해진 규칙으로 계산하는 값입니다(현재 공식 v${SIGNAL_FORMULA_VERSION}). 단지 화면, 임장노트 결과, AI 분석 도구가 같은 계산식으로 아래 8가지 요인을 봅니다. AI 분석 도구는 이 결과를 확정 사실로 받아 서술에만 쓰고, 숫자를 고치거나 새로 만들지 않습니다.`,
      `요인마다 −2(내림 쪽)~+2(오름 쪽) 점수를 매기고, 가중 평균(심리·거래량·1년 추이·단기 추세 1, 매물·공급·금리 0.8, 뉴스·관심도 0.6 — 표본이 작으면 절반)에 22.5를 곱해 50에 더합니다(0~100, 5~95로 제한). 50이 중립입니다. 점수가 있는 요인이 3개 미만이면 종합 점수를 내지 않고 \"자료 부족\"으로 적습니다. 요인 점수가 ±${SIGNAL_LEAN.lean} 이상이면 \"오름 쪽·내림 쪽\"(끌어올림·누름 요인), ±${SIGNAL_LEAN.strong} 이상이면 \"강함\"으로 적습니다.`,
      "값이 없는 요인(자료 없음), 불러오지 못한 요인(불러오기 실패), 표본이 너무 작은 요인(표본 적음)은 0점(중립)으로 세지 않고 계산에서 뺍니다. 화면의 \"반영 n/8\"은 점수가 있는 요인 수이며, 빠진 요인은 까닭과 함께 적습니다.",
      "매물 수는 모으는 원천이 없어(포털 매물 자료는 이용 허락이 필요) 기사 제목의 매물 증가·감소 단서로 대신하고, 화면에 그 사실을 적습니다. 임장노트의 기록 점수는 시장 점수에 섞지 않고 \"현장\" 값으로 옆에 따로 보여 줍니다. 시장 신호는 가격·수요가 어느 쪽으로 기우는지에 대한 서술이며 매수·매도 추천이 아닙니다.",
    ],
    items: SIGNAL_FACTOR_ORDER.map((key) => ({
      id: `signal-${key}`,
      label: SIGNAL_FACTOR_META[key].label,
      text: SIGNAL_FACTOR_TEXT[key],
    })),
  },
  {
    id: "missing",
    q: "데이터가 없는 곳은 어떻게 보여 주나요?",
    a: [
      "없는 데이터는 비워 둡니다. 실거래가 없는 단지에 추정 시세를 만들지 않고, 좌표가 확인되지 않은 지역을 지도에 임의로 찍지 않으며, 데이터가 부족하면 화면에 \"아직 없다\"고 적습니다.",
      "AI 기능(에이전트·요약)도 같은 원칙을 따릅니다. 답변의 모든 수치는 DB 조회 결과에서만 인용하고, 조회한 데이터 목록을 답변과 함께 표시합니다.",
    ],
  },
];

/* [1062 · 글 줄이기] 항목별 핵심 요약(2~4줄) — 접힌 본문(SECTIONS.a)을 대신 보여 준다. 낱말·숫자는 본문에 있는 것만
   (본문에 없는 말 금지). 본문은 지우지 않고 "자세히" 접기 아래 그대로 둔다(JSON-LD·검사 문장·앵커 유지). */
const SECTION_POINTS: Record<string, KeyPoint[]> = {
  source: [
    { k: "출처", v: "국토교통부 실거래가 공개시스템(공공데이터포털)의 아파트 매매·전월세 신고 자료" },
    { k: "집계", v: "호가·추정치가 아니라 실제로 신고된 계약만" },
    { k: "기준월", v: "전국 시군구를 주기적으로 순회 수집 · 모든 화면의 수치에 기준월 표기" },
  ],
  cancelled: [
    { k: "해제거래", v: "시세 평균에서 제외" },
    { k: "근거", v: "실측 검증에서 해제거래를 포함하면 일부 단지 평균가가 20% 이상 왜곡" },
    { k: "원본", v: "해제 사실도 데이터 · 원본 기록은 보존" },
  ],
  lag: [
    { k: "신고 기한", v: "계약 후 30일" },
    { k: "이번 달·직전 달", v: "아직 신고되지 않은 계약만큼 실제보다 적게 집계" },
    { k: "처리", v: "거래량 차트는 이번 달을 다른 색으로 · 시장 온도는 신고가 완결되지 않은 달 제외" },
  ],
  average: [
    { k: "지역 평균", v: "해당 시군구의 기간 내 실거래 단순 평균 · 면적·타입 구분 없음" },
    { k: "단지 화면", v: "면적대별 시세 따로 · 평균과 함께 거래 건수 항상 표기" },
  ],
  temperature: [
    { k: "범위", v: "0~100 · 50이 중립" },
    { k: "계산", v: "50점 기준에 ① 매매가격지수 모멘텀(월 ±1%를 ±25점으로 환산) ② 거래량 추이(±50%를 ±25점으로 환산)" },
    { k: "거래량 완결월", v: "4개 미만이면 지수 모멘텀만 반영 · 화면에 그 사실을 표시" },
    { k: "뜻", v: "매수·매도 추천이 아니라 시장 상태의 서술 · 실측 입력값 함께 표시" },
  ],
  signals: [
    { k: "방식", v: `AI가 만든 판단이 아니라 정해진 규칙으로 계산 · 현재 공식 v${SIGNAL_FORMULA_VERSION} · 8가지 요인` },
    { k: "점수", v: "요인마다 −2~+2 · 가중 평균에 22.5를 곱해 50에 더함(0~100, 5~95로 제한) · 50이 중립" },
    { k: "반영", v: "점수가 있는 요인이 3개 미만이면 \"자료 부족\" · 자료 없음·불러오기 실패·표본 적음은 계산에서 뺌" },
    { k: "쪽", v: `±${SIGNAL_LEAN.lean} 이상 오름 쪽·내림 쪽 · ±${SIGNAL_LEAN.strong} 이상 강함 · 매수·매도 추천 아님` },
  ],
  missing: [
    { k: "없는 데이터", v: "비워 둠 · 추정 시세를 만들지 않음 · 화면에 \"아직 없다\"고 적음" },
    { k: "AI 기능", v: "모든 수치는 DB 조회 결과에서만 인용 · 조회한 데이터 목록을 답변과 함께 표시" },
  ],
};

/* 웹11 — 방법론 최근 변경 이력. "바뀌면 이 페이지를 갱신합니다"라는 하단 약속을
   실제 목록으로 이행한다. 실제로 일어난 변경만, 커밋 날짜 그대로 적는다
   (각 항목의 출처 커밋: #150 해제거래, 5ecb5d2 온도 아카이브, 208abe8 집계 복구,
   a9f530e 면적대 표). 여기 새 항목을 추가할 때도 같은 규칙 — 배포된 변경만. */
const CHANGELOG: { date: string; text: string }[] = [
  {
    date: "2026-10-09",
    /* [1052] 1판(1048)은 운영 배포 전이었다(1047·1048 배포 실패) — 공개 항목을 2판으로 고쳐 적는다(배포된 변경만 규칙) */
    text: "다요인 분석(시장 신호 · 규칙 계산) 공개 — 심리·뉴스·관심도·거래량·1년 추이·단기 추세·매물·공급·금리 8요인, 계산식 2판(자료가 없거나 표본이 적은 요인은 점수에 넣지 않음). 단지 화면·임장노트 결과·AI 분석 도구가 같은 식을 씀.",
  },
  {
    date: "2026-08-03",
    text: "면적대별 시세표에 기준 기간(첫 계약월~마지막 계약월)과 표본 건수를 명기. 석 달치 평균과 삼 년치 평균이 같은 얼굴을 하지 않도록.",
  },
  {
    date: "2026-08-02",
    text: "시세 집계 자동 갱신 작업의 스키마 오류를 복구. 중단됐던 지역·단지 집계 갱신이 재개됨.",
  },
  {
    date: "2026-07-26",
    text: "시장 온도를 매주 아카이브로 저장 시작. 현재 값만이 아니라 시점별 추세를 확인할 수 있게 됨.",
  },
  {
    date: "2026-07-25",
    text: "해제(취소) 신고된 실거래 402건을 시세 집계에서 전면 제외. 일부 단지 평균가가 20% 이상 왜곡되던 문제를 정정.",
  },
];

/* FAQPage JSON-LD — 위 본문과 같은 내용(내용 불일치 금지: 같은 배열에서 생성) */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SECTIONS.map((s) => ({
      "@type": "Question",
      name: s.q,
      acceptedAnswer: { "@type": "Answer", text: [...s.a, ...(s.items ?? []).map((it) => `${it.label}: ${it.text}`)].join(" ") },
    })),
  };
}

export default function MethodologyPage() {
  return (
    <PageShell breadcrumb="데이터 방법론">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd()) }}
      />
      <div className="mx-auto max-w-[760px]">
        {/* [1015 · 규칙 D] 제목은 명사 */}
        <h1 className="rise-in t-title text-ink">데이터 방법론</h1>
        {/* G12 — 정의형 첫 문단: 이 페이지가 무엇인지 완결 문장으로 */}
        <p className="rise-in-1 mt-2 t-body leading-[1.7] text-text-2">
          이 페이지는 내집나우(naezipnow.com)이 국토교통부 실거래 데이터를 수집·집계해
          시세와 지표를 만드는 방식을 공개한 문서입니다. 새로 만든 규칙이 아니라,
          서비스가 실제로 동작하는 방식을 그대로 적었습니다.
        </p>

        {/* [1062 · 글 줄이기] 항목마다 문단 2~4개가 늘 펼쳐져 있던 것 → 핵심 요약(SECTION_POINTS) 먼저, 본문은 "자세히" 접기.
            글은 지우지 않는다(JSON-LD · 시장 온도 ⓘ 와 대조하는 문장 · 앵커 #id 그대로). */}
        <div className="mt-6 flex flex-col gap-4 max-md:mt-4 max-md:gap-3">
          {SECTIONS.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              className={`rise-in-${Math.min(i + 2, 6)} card scroll-mt-24 rounded-3xl p-6 max-md:p-4`}
            >
              <h2 className="t-section text-ink">{s.q}</h2>
              {SECTION_POINTS[s.id] ? <KeyPoints className="mt-2" points={SECTION_POINTS[s.id]} /> : null}
              {/* [1052 · 1062] 요인 이름 칩 — 접힌 요인별 칸을 대신 보여 준다(이름은 엔진 표 SIGNAL_FACTOR_META 그대로) */}
              {s.items ? <KeywordChips className="mt-2" label="요인" items={s.items.map((it) => it.label)} /> : null}
              <Fineprint className="mt-2" label="자세히">
                {s.a.map((p, j) => (
                  <p key={j} className={`${j > 0 ? "mt-2" : ""} m-0 t-sub leading-[1.7] text-text-2`}>
                    {p}
                  </p>
                ))}
              </Fineprint>
              {/* [1052] 요인별 칸 — 다요인 분석 판의 요인 이름 링크(#signal-<key>)가 닿는 자리.
                  [1062] 접기 안에 둔다 — 조각 링크로 들어오면 브라우저가 감싼 details 를 펼친다(id 는 details 안쪽 div). */}
              {s.items ? (
                <Fineprint className="mt-1" label={`요인별 계산 방법 · ${s.items.length}`}>
                  <dl className="m-0 flex flex-col divide-y divide-line" data-tone="plain">
                    {s.items.map((it) => (
                      <div key={it.id} id={it.id} className="scroll-mt-24 py-2.5">
                        <dt className="t-sub font-bold text-ink">{it.label}</dt>
                        <dd className="m-0 mt-1 t-sub leading-[1.7] text-text-2">{it.text}</dd>
                      </div>
                    ))}
                  </dl>
                </Fineprint>
              ) : null}
            </section>
          ))}
        </div>

        {/* 웹11 — 방법론 최근 변경. CHANGELOG 배열(실제 배포된 변경만) 렌더.
            [1062] 날짜 + 문장 행 → "날짜 | 변경" 표(문구 그대로) */}
        <section id="changelog" className="card mt-6 scroll-mt-24 rounded-3xl p-6 max-md:mt-4 max-md:p-4">
          <h2 className="t-section text-ink">최근 변경</h2>
          <FactTable
            dense
            className="mt-3"
            rows={CHANGELOG.map((c) => ({ label: c.date, value: c.text }))}
          />
        </section>

        {/* G21 — 정정 이력. 데이터·집계 오류를 고치면 여기 남긴다.
            아직 0건이라고 정직하게 적는 것부터가 이 제도의 시작이다.
            [1062] 요약 두 줄 먼저, 문단은 접기(문구 그대로) */}
        <section id="corrections" className="card mt-6 scroll-mt-24 rounded-3xl p-6 max-md:mt-4 max-md:p-4">
          <h2 className="t-section text-ink">정정 이력</h2>
          <KeyPoints
            className="mt-2"
            points={[
              { k: "기록", v: "오류를 발견해 정정하면 날짜와 내용을 이 목록에 남김" },
              { k: "현황", v: "이 페이지 공개(2026년 7월) 이후 기록된 정정은 아직 없음 · 오류 제보는 고객센터로" },
            ]}
          />
          <Fineprint className="mt-2" label="자세히">
            공개된 수치·집계에서 오류를 발견해 정정하면 날짜와 내용을 이 목록에
            남깁니다. 이 페이지 공개(2026년 7월) 이후 기록된 정정은 아직 없습니다.
            오류 제보는 고객센터로 부탁드립니다.
          </Fineprint>
        </section>

        {/* [1062] 하단 고지 문단 → 접기(글·링크 그대로) */}
        <Fineprint className="mt-6 max-md:mt-4" label="고지 · 문의">
          본 문서의 방식은 서비스 개선에 따라 바뀔 수 있으며, 바뀌면 이 페이지를
          갱신합니다. 집계·분석 결과는 참고용 정보이며 투자 판단의 책임은 이용자
          본인에게 있습니다. 문의:{" "}
          <Link href="/support" className="inline-block py-[5px] font-bold text-primary">
            고객센터
          </Link>
        </Fineprint>
      </div>
    </PageShell>
  );
}
