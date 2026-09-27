import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { DEFAULT_LIMIT, MAX_LIMIT, PUBLIC_API_LICENSE } from "@/lib/api/public-aggregates";
import { jsonLdScript, publisherRef } from "@/lib/seo/jsonld";

export const metadata = buildPageMetadata({
  title: "공개 집계 API — 내집나우 실거래 집계를 JSON 으로",
  description:
    "내집나우가 국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역 집계를 인증 없이 JSON 으로 제공합니다. 엔드포인트·파라미터·인용 조건·한계를 공개합니다.",
  path: "/developers",
});

/* N20 — 공개 집계 JSON API 문서.
   이 페이지는 정적이다(데이터 페칭 없음). 수치는 적지 않고 규약만 적는다 —
   수치를 여기 적으면 갱신되지 않아 곧 거짓이 된다. 실제 값은 API 가 답한다.

   상수(MAX_LIMIT·DEFAULT_LIMIT·라이선스)는 API 구현과 같은 모듈에서 가져온다.
   문서와 구현이 따로 놀면 문서가 거짓말을 하기 때문이다. */

const BASE = "https://naezipnow.com/api/public/v1";

type Endpoint = {
  path: string;
  title: string;
  desc: string;
  params?: { name: string; desc: string }[];
  example: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    path: "/api/public/v1",
    title: "API 목차",
    desc: "제공 중인 엔드포인트와 파라미터, 호출 한도를 JSON 으로 돌려줍니다. 이 문서를 읽지 않아도 여기서 나머지를 찾을 수 있습니다.",
    example: `curl ${BASE}`,
  },
  {
    path: "/api/public/v1/months",
    title: "집계가 존재하는 월 목록",
    desc: "월별로 집계된 지역 수와 총 거래 건수를 최신순으로 돌려줍니다. 어느 구간을 요청할 수 있는지 먼저 확인하는 자리입니다.",
    example: `curl ${BASE}/months`,
  },
  {
    path: "/api/public/v1/regions/monthly",
    title: "지역×월 집계",
    desc: "시군구 단위 월간 집계입니다. 거래 건수, 평균 거래가, 평당가, 평당가의 전월 대비 변동률을 포함합니다.",
    params: [
      { name: "month", desc: `yyyymm 6자리. 생략하면 전체 월을 최신순으로 반환합니다.` },
      { name: "region", desc: "지역명 부분 일치. 예: region=강남" },
      { name: "limit", desc: `1~${MAX_LIMIT} (기본 ${DEFAULT_LIMIT})` },
      { name: "offset", desc: "0 이상. 응답의 total·hasMore 로 다음 페이지 여부를 판단합니다." },
    ],
    example: `curl "${BASE}/regions/monthly?month=202605&region=강남&limit=20"`,
  },
];

/* 응답 필드 — 이름과 뜻을 한 번만 정의하고 표로 렌더한다. */
const FIELDS: { name: string; desc: string }[] = [
  { name: "regionCode", desc: "법정동 코드 앞 5자리(시군구)" },
  { name: "regionName", desc: "국토교통부 신고 자료 표기 그대로의 지역명" },
  { name: "month", desc: "집계 기준월 (yyyymm)" },
  { name: "transactionCount", desc: "해당 월 신고된 매매 건수 (해제 신고분 제외)" },
  { name: "avgDealAmountKrw", desc: "평균 거래금액(원). 면적·층 가중 없는 단순 평균" },
  { name: "avgPricePerPyeongKrw", desc: "평당 평균가(원)" },
  { name: "trendDeltaPct", desc: "평당가 평균(거래 건별 단순 평균)의 전월 대비 변동률(%) · 두 달 모두 10건 이상일 때만(아니면 null)" },
  { name: "updatedAt", desc: "이 행이 마지막으로 갱신된 시각(ISO 8601)" },
  {
    name: "provisional",
    desc: "true 이면 신고 지연으로 아직 값이 늘어날 수 있는 달(이번 달·직전 달)입니다",
  },
  { name: "license", desc: "출처·인용 조건. 모든 응답 본문에 함께 실립니다" },
];

const QA: { q: string; a: string }[] = [
  {
    q: "인증 키가 필요한가요?",
    a: "필요 없습니다. 인증 없이 GET 으로 호출할 수 있고 CORS 가 열려 있어 브라우저에서 바로 부를 수 있습니다. 대신 IP 당 분당 120회 제한이 있으며, 초과하면 429 를 반환합니다.",
  },
  {
    q: "데이터를 어디까지 공개하나요?",
    a: "국토교통부 실거래 신고 자료로 만든 아파트 매매(trade/apartment)의 시군구×월 집계만 공개합니다. 개별 실거래 행(단지·동·층·계약일 단위), 전월세 집계, 이용자가 작성한 임장노트·회원·모임 데이터는 API 에 포함되지 않습니다. 화면에 공개되지 않은 것을 API 로 먼저 열지 않는다는 원칙입니다.",
  },
  {
    q: "조회에 실패하면 어떤 응답이 오나요?",
    a: "빈 배열이 아니라 503 과 error.code=upstream_unavailable 이 옵니다. \"데이터가 없다\"와 \"조회가 실패했다\"는 다른 사실이고, 실패를 빈 값으로 돌려주면 받아 간 쪽이 \"그 달에 거래가 없었다\"고 잘못 인용하게 되기 때문입니다. 요청 자체가 잘못된 경우(월 형식 오류 등)는 400 과 함께 무엇이 왜 틀렸는지 적어 보냅니다.",
  },
  {
    q: "최근 달 거래 건수가 유난히 적은데 맞나요?",
    a: "실거래 신고 기한이 계약일로부터 30일이라 이번 달과 직전 달은 아직 채워지는 중입니다. 해당 행에는 provisional: true 가 붙습니다. 이 값으로 \"거래가 급감했다\"고 해석하면 안 됩니다.",
  },
  {
    q: "얼마나 자주 갱신되나요?",
    a: "수집 크론이 하루 두 번(한국시간 09:00·18:00 전후) 돌고 그 뒤 집계를 갱신합니다. 응답은 CDN 에서 최대 1시간 캐시되며, 각 행의 updatedAt 으로 실제 갱신 시각을 확인할 수 있습니다.",
  },
  {
    q: "상업적으로 써도 되나요?",
    a: "출처를 표기하면 상업적 이용을 포함해 자유롭게 쓸 수 있습니다. 원자료는 국토교통부 공개 자료이고, 내집나우는 그 위의 집계를 제공합니다. 표기 예: \"내집나우(naezipnow.com) 집계, 국토교통부 실거래 기반, 2026년 5월 기준\". 다만 집계 방식의 한계(단순 평균·신고 지연)를 함께 밝혀 주시기를 권합니다.",
  },
  {
    q: "엔드포인트가 바뀔 수도 있나요?",
    a: "경로에 v1 이 들어 있습니다. 필드를 추가하는 변경은 v1 안에서 하지만, 기존 필드의 이름·의미를 바꾸거나 없애는 변경은 v2 로 분리합니다. 중단이 필요하면 이 페이지에 먼저 공지합니다.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebAPI",
        name: "내집나우 공개 집계 API",
        description:
          "국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역 집계를 인증 없이 제공하는 JSON API",
        documentation: "https://naezipnow.com/developers",
        url: BASE,
        /* [1007 · P2] 전역 Organization 참조 — 인라인 노드를 두 번 만들지 않는다(publisherRef 와 같은 @id) */
        provider: publisherRef(),
        termsOfService: "https://naezipnow.com/legal/terms",
      },
      {
        "@type": "FAQPage",
        mainEntity: QA.map((x) => ({
          "@type": "Question",
          name: x.q,
          acceptedAnswer: { "@type": "Answer", text: x.a },
        })),
      },
    ],
  };
}

export default function DevelopersPage() {
  return (
    <PageShell breadcrumb="공개 집계 API">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd()) }}
      />
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(한 줄 호출 예시) → 엔드포인트 행 → 응답 필드 행 → 상태 코드 행 →
          인용 조건 → 자주 묻는 질문 행 → 캡션. 지운 것: 소개 문단(→ 사실 줄), 절마다 12px 카드, 굵기 800, 회색 안내 상자(→ 캡션).
          문서 본문(엔드포인트·필드·코드·Q&A)은 그대로 — 참조 문서라 내용이 곧 기능이다. */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">공개 집계 API</h1>
            <p className="t-sub text-text-3">
              아파트 매매 월간 지역 집계 · 인증 없음 · JSON · IP 당 분당 120회
            </p>
          </header>
          {/* 시작하기 — 키 발급·등록 없음. 한 줄이면 최신 월 집계 */}
          <section aria-label="시작하기" className="flex flex-col gap-1">
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-3 text-[12px] leading-[1.6] text-text-1">
              <code>{`curl "${BASE}/regions/monthly?limit=5"`}</code>
            </pre>
            <p className="t-caption text-text-3">
              기본 주소 <code className="text-text-2">{BASE}</code> · UTF-8 JSON · 키 발급·등록 없음
            </p>
          </section>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            엔드포인트 <span className="t-num text-text-3">{ENDPOINTS.length}</span>
          </h2>
          <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="t-sub font-bold text-primary">GET</code>
                  <code className="t-body font-bold text-ink">{e.path}</code>
                </div>
                <p className="mt-1 t-body font-bold text-ink">{e.title}</p>
                <p className="mt-1 t-body leading-[1.75] text-text-1">{e.desc}</p>
                {e.params ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {e.params.map((p) => (
                      <li key={p.name} className="t-sub leading-[1.7] text-text-2">
                        <code className="font-bold text-ink">{p.name}</code> — {p.desc}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 text-[12px] leading-[1.6] text-text-1">
                  <code>{e.example}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            응답 필드 <span className="t-num text-text-3">{FIELDS.length}</span>
          </h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {FIELDS.map((f) => (
              <div key={f.name} className="py-2.5">
                <dt className="t-sub font-bold text-ink">
                  <code>{f.name}</code>
                </dt>
                <dd className="m-0 mt-0.5 t-sub leading-[1.7] text-text-2">{f.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">상태 코드</h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4 t-sub leading-[1.7] text-text-2">
            <div className="py-2.5">
              <dt className="font-bold text-ink">
                <code>200</code>
              </dt>
              <dd className="m-0">정상 · rows 가 빈 배열이면 “그 조건의 데이터가 없다”는 사실</dd>
            </div>
            <div className="py-2.5">
              <dt className="font-bold text-ink">
                <code>400</code>
              </dt>
              <dd className="m-0">요청이 잘못됨 · 무엇이 왜 틀렸는지 error.message · error.hint</dd>
            </div>
            <div className="py-2.5">
              <dt className="font-bold text-ink">
                <code>429</code>
              </dt>
              <dd className="m-0">호출 한도 초과 · Retry-After 참고</dd>
            </div>
            <div className="py-2.5">
              <dt className="font-bold text-ink">
                <code>503</code>
              </dt>
              <dd className="m-0">
                저희가 조회에 실패 · 데이터가 없다는 뜻이 <b>아님</b> · 잠시 후 다시 호출
              </dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">인용 조건</h2>
          <p className="t-body leading-[1.75] text-text-1">
            출처를 표기하면 상업적 이용을 포함해 자유롭게 쓸 수 있습니다 · 같은 내용이 모든 응답의 <code>license</code> 필드에도
            실려 출처가 함께 이동합니다.
          </p>
          <div className="rounded-lg border border-line bg-surface p-3 text-[12px] leading-[1.7] text-text-1">
            내집나우(naezipnow.com) 집계, {PUBLIC_API_LICENSE.sources[0].name} 자료 기반, ○○○○년 ○월 기준
          </div>
          <p className="t-caption text-text-3">
            단순 평균(면적·층 가중 없음) · 최근 1~2개월은 신고 지연으로 늘어남 — 인용 때 함께 밝혀 주세요 ·{" "}
            <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
              데이터 방법론
            </Link>
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            자주 묻는 질문 <span className="t-num text-text-3">{QA.length}</span>
          </h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {QA.map((x) => (
              <div key={x.q} className="py-3">
                <dt className="t-body font-bold text-ink">{x.q}</dt>
                <dd className="m-0 mt-1 t-body leading-[1.75] text-text-1">{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="t-caption leading-[1.7] text-text-3">
          제공 범위·한도가 바뀌면 이 페이지를 먼저 갱신 · 오류 제보·이용 문의는{" "}
          <Link href="/support" className="tap-line font-bold text-primary no-underline">
            고객센터
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
