import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const metadata = buildPageMetadata({
  title: "데이터 방법론 — 내집나우 시세는 이렇게 계산합니다",
  description:
    "국토교통부 실거래 기반 시세 집계 방식, 해제거래 제외, 신고 지연 처리, 시장 온도 지표의 계산 공식을 공개합니다.",
  path: "/methodology",
});

/* G18·G9 — 데이터 방법론 공개 페이지.
   새로 만든 규칙이 아니라, 이미 코드가 하고 있는 처리를 문서화한 것이다.
   각 항목의 출처는 레포 커밋·모듈에 있다(해제거래 제외 #150, 시장 온도 timing 페이지).
   이 페이지는 정적(데이터 페칭 없음) — 구체적 수치는 시점에 묶이므로 적지 않고,
   방식만 적는다. 수치는 각 화면이 기준월과 함께 보여 준다. */

const SECTIONS: { id: string; q: string; a: string[] }[] = [
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
      "계약 후 해제 신고된 거래는 시세 평균에서 제외합니다. 해제분을 섞으면 단지 평균가가 실제와 크게 달라질 수 있기 때문입니다 — 실측 검증에서 해제거래를 포함하면 일부 단지의 평균가가 20% 이상 왜곡되는 것을 확인하고 전면 제외로 정했습니다.",
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
      "그래서 단지 화면에서는 면적대별 시세를 따로 보여 주며, 평균과 함께 거래 건수를 항상 표기합니다 — 3건짜리 평균과 300건짜리 평균은 신뢰도가 다르기 때문입니다.",
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
    id: "missing",
    q: "데이터가 없는 곳은 어떻게 보여 주나요?",
    a: [
      "없는 데이터는 비워 둡니다. 실거래가 없는 단지에 추정 시세를 만들지 않고, 좌표가 확인되지 않은 지역을 지도에 임의로 찍지 않으며, 데이터가 부족하면 화면에 \"아직 없다\"고 적습니다.",
      "AI 기능(에이전트·요약)도 같은 원칙을 따릅니다 — 답변의 모든 수치는 DB 조회 결과에서만 인용하고, 조회한 데이터 목록을 답변과 함께 표시합니다.",
    ],
  },
];

/* 웹11 — 방법론 최근 변경 이력. "바뀌면 이 페이지를 갱신합니다"라는 하단 약속을
   실제 목록으로 이행한다. 실제로 일어난 변경만, 커밋 날짜 그대로 적는다
   (각 항목의 출처 커밋: #150 해제거래, 5ecb5d2 온도 아카이브, 208abe8 집계 복구,
   a9f530e 면적대 표). 여기 새 항목을 추가할 때도 같은 규칙 — 배포된 변경만. */
const CHANGELOG: { date: string; text: string }[] = [
  {
    date: "2026-08-03",
    text: "면적대별 시세표에 기준 기간(첫 계약월~마지막 계약월)과 표본 건수를 명기 — 석 달치 평균과 삼 년치 평균이 같은 얼굴을 하지 않도록.",
  },
  {
    date: "2026-08-02",
    text: "시세 집계 자동 갱신 작업의 스키마 오류를 복구 — 중단됐던 지역·단지 집계 갱신이 재개됨.",
  },
  {
    date: "2026-07-26",
    text: "시장 온도를 매주 아카이브로 저장 시작 — 현재 값만이 아니라 시점별 추세를 확인할 수 있게 됨.",
  },
  {
    date: "2026-07-25",
    text: "해제(취소) 신고된 실거래 402건을 시세 집계에서 전면 제외 — 일부 단지 평균가가 20% 이상 왜곡되던 문제를 정정.",
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
      acceptedAnswer: { "@type": "Answer", text: s.a.join(" ") },
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
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 항목 6개(질문 굵게 + 답 문단, 1px 선으로만 가름) → 최근 변경 행 →
          정정 이력 한 줄 → 면책 캡션. 지운 것: 정의형 소개 문단(→ 사실 줄), 항목마다 12px 카드, "최근 변경" 설명 문장,
          회색 안내 상자(→ 캡션). 굵기 800(font-extrabold) → 700. 앵커(#temperature · #corrections 등)는 그대로. */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">내집나우 시세는 이렇게 계산합니다</h1>
          <p className="t-sub text-text-3">
            국토교통부 실거래 · 항목 {SECTIONS.length}개 · 변경 {CHANGELOG.length}건 · 코드가 실제로 하는 처리 그대로
          </p>
        </header>

        <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 py-4">
              <h2 className="t-section text-ink">{s.q}</h2>
              {s.a.map((p, j) => (
                <p key={j} className="mt-1.5 t-body leading-[1.75] text-text-1">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* 웹11 — 방법론 최근 변경. CHANGELOG 배열(실제 배포된 변경만) 렌더. [v4] 구분선 행(날짜 = 보조 줄) */}
        <section id="changelog" className="flex scroll-mt-24 flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            최근 변경 <span className="t-num text-text-3">{CHANGELOG.length}</span>
          </h2>
          <ul className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {CHANGELOG.map((c) => (
              <li key={`${c.date}-${c.text.slice(0, 8)}`} className="py-3">
                <span className="block t-sub font-bold tabular-nums text-text-3">{c.date}</span>
                <span className="mt-0.5 block t-body leading-[1.7] text-text-1">{c.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* G21 — 정정 이력. 데이터·집계 오류를 고치면 여기 남긴다. 아직 0건이라고 정직하게 적는다. [v4] 카드 → 한 줄 */}
        <section id="corrections" className="flex scroll-mt-24 flex-col gap-1">
          <h2 className="t-section text-ink">정정 이력</h2>
          <p className="t-body text-text-1">
            기록된 정정 0건(2026년 7월 공개 이후) · 정정하면 날짜·내용을 여기 남김 · 오류 제보는{" "}
            <Link href="/support" className="tap-line font-bold text-primary no-underline">
              고객센터
            </Link>
          </p>
        </section>

        <p className="t-caption leading-[1.7] text-text-3">
          방식이 바뀌면 이 페이지를 갱신 · 시세·분석 결과는 참고용 정보이며 투자 판단의 책임은 이용자 본인에게 있습니다
        </p>
      </div>
    </PageShell>
  );
}
