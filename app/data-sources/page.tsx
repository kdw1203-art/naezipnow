import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { seoAlternates } from "@/lib/seo/alternates";
import { formatCount, loadHomeCoverage } from "@/lib/newui/home-coverage";
import {
  freshnessLabel,
  isStale,
  loadDataFreshness,
} from "@/lib/newui/data-freshness";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* [945 · 실사용50 #33] 데이터 출처·갱신 주기·한계 — 한 장짜리 신뢰 문서.
   화면 곳곳의 각주("국토부 신고 기준" 등)를 한 페이지로 모은다.
   갱신 주기는 실제 파이프라인(etl.yml·크론) 기준으로 적는다 — 여기 적힌
   주기와 코드가 어긋나면 코드가 아니라 이 페이지를 고칠 일이 먼저인지 본다.
   계산 공식은 /methodology 가 원천이다(중복 서술 금지 — 링크로 넘긴다). */

/* [987 · 신뢰 근거] force-static → 실수치를 읽어야 해서 서버 렌더로 바꾼다.
   숫자 자체는 6시간 캐시(loadHomeCoverage·loadDataFreshness)라 매 요청마다
   DB 를 두드리지 않는다. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "데이터 출처와 한계 | 내집나우",
  description:
    "내집나우가 사용하는 데이터의 원천(국토교통부·한국부동산원·KB·온비드·청약홈 등), 갱신 주기, 알려진 한계, AI 생성·추정 콘텐츠 라벨 정책을 공개합니다.",
  alternates: seoAlternates("/data-sources"),
};

type SourceRow = {
  name: string;
  origin: string;
  cadence: string;
  used: string;
  limits: string;
};

const SOURCES: SourceRow[] = [
  {
    name: "아파트 실거래 (매매·전월세)",
    origin: "국토교통부 실거래가 공개시스템 (공공데이터포털)",
    cadence: "매일 수집",
    used: "지도 시세, 단지 실거래 추이, 신고가 소식, 관심단지 알림",
    limits:
      "신고는 계약 후 30일 이내라 최신 계약이 늦게 보일 수 있음. 해제(취소) 신고분은 집계에서 제외. 호가가 아니라 신고가만 실음.",
  },
  {
    name: "시세 지수",
    origin: "한국부동산원 주간·월간 지수, KB 시세",
    cadence: "매일 확인 (발표는 기관 일정 — 주간·월간)",
    used: "지역 페이지 지수 추이, 홈 시장 브리핑, 주간 시황 글",
    limits: "표본 기반 상대지수 — 개별 단지 가격이 아님. 두 기관 값은 조사 방식 차이로 다를 수 있음.",
  },
  {
    name: "공매 물건",
    origin: "온비드 (한국자산관리공사)",
    cadence: "매일 동기화 (수도권·5대 광역시)",
    used: "지도 공매 레이어, 공매 목록",
    limits: "진행 상태·최저가는 회차에 따라 변동 — 입찰 전 온비드 원문 확인 필수. 권리분석은 제공하지 않음.",
  },
  {
    name: "분양·입주 예정",
    origin: "청약홈 분양공고",
    cadence: "매일 수집",
    used: "청약 캘린더, 지역 입주 예정 물량, 동네 브리핑",
    limits: "입주 시기는 공고 기준 예정 — 실제 입주는 지연될 수 있음.",
  },
  {
    name: "정비사업 (재개발·재건축)",
    origin: "서울 열린데이터광장",
    cadence: "주기 확인 (원천 갱신이 비정기)",
    used: "지도·지역의 정비사업 표시",
    limits: "서울만 제공. 단계 표기는 고시 반영 시차가 있음.",
  },
  {
    name: "부동산 뉴스",
    origin: "언론사 공개 기사 (출처·원문 링크 명기)",
    cadence: "매일 08:00 수집",
    used: "동네 뉴스, 뉴스 요약(AI), 주간 다이제스트",
    limits: "요약은 AI 생성물 — 원문이 항상 우선. 전문은 싣지 않고 링크로 안내.",
  },
  {
    name: "학교·지하철 위치",
    origin: "공공데이터포털 (활용신청 승인 대기 중)",
    cadence: "승인 후 주기 동기화 예정",
    used: "지도 학교·지하철 레이어",
    limits: "승인 전에는 레이어가 '준비 중'으로 표시됨 — 없는 데이터를 그리지 않음.",
  },
  {
    name: "거시 지표 (금리 등)",
    origin: "한국은행 ECOS, KOSIS",
    cadence: "매일 확인 (발표는 기관 일정)",
    used: "AI 분석 컨텍스트, 경제지표 알림",
    limits: "발표 지연·개정치 반영 시차 존재.",
  },
  {
    name: "시장 온도",
    origin: "내집나우 자체 산출 (실거래·지수·거래량 합성)",
    cadence: "주 1회 스냅샷",
    used: "지도 온도 레이어, 지역 카드",
    limits: "자체 지표 — 공식 통계가 아니며 산출식은 방법론 페이지에 공개.",
  },
  {
    name: "임장노트·동네 글",
    origin: "사용자 작성 (사람)",
    cadence: "실시간",
    used: "임장노트, 동네이야기, 단지 Q&A",
    limits: "개인 경험·의견 — 사실 검증 대상이 아님. 자동 발행 글은 아래 라벨 정책대로 구분 표시.",
  },
];

const AI_POLICY: Array<{ label: string; rule: string }> = [
  {
    label: "“AI 생성” 배지",
    rule: "노트 요약·뉴스 요약 등 LLM이 만든 문장에는 AI 생성 표시를 붙입니다. 규칙 기반 요약은 별도로 구분합니다.",
  },
  {
    label: "“AI 추정 (현장 확인 전)” 라벨",
    rule: "AI가 제안한 체크 점수·만족도에는 추정 라벨과 산출 근거 한 줄이 반드시 함께 보입니다. 근거를 서술하지 못한 점수는 서버가 버립니다.",
  },
  {
    label: "봇 명의 자동 글",
    rule: "주간 시황·동네 데이터 브리핑 등 자동 발행 글은 자동 집계 계정 명의로만 올라가며(is_automated), 사람 글로 위장하지 않습니다. 가짜 이웃 글·가짜 후기는 만들지 않습니다.",
  },
  {
    label: "숫자에는 출처·시점",
    rule: "AI가 언급하는 수치는 수집된 실데이터 컨텍스트 안의 값만 허용하고, 출처와 기준 시점을 함께 표기합니다. 컨텍스트에 없는 수치를 지어내는 것은 차단 대상 결함으로 다룹니다.",
  },
  {
    label: "투자 권유 금지",
    rule: "모든 AI 출력에는 참고용 고지가 붙고, 매수·매도 권유 문장은 생성 단계에서 금지됩니다. 투자 판단의 책임은 이용자 본인에게 있습니다.",
  },
];

export default async function DataSourcesPage() {
  /* 실패하면 null 이고, 아래에서 그 줄을 통째로 뺀다 — 추정치로 채우지 않는다 */
  const [coverage, freshness] = await Promise.all([
    loadHomeCoverage(),
    loadDataFreshness(),
  ]);
  const now = Date.now();

  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb="데이터 출처">
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(지금 가진 실거래 신고 수 t-display) + 마지막 적재 행 →
          원천 10곳 접힘 행(이름 + 주기 / 펼치면 원천·쓰임·한계) → AI 라벨 정책 행 → 캡션 한 줄.
          지운 것: 소개 문단(세 문장 → 사실 줄), 숫자 상자 3칸(→ 주인공 + 한 줄), 원천마다 테두리 카드(→ 접힘 행),
          정책 설명 문단·정책 카드(→ 행). 전부 실카운트 · 못 읽은 줄은 뺀다(그대로). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">이 숫자, 어디서 왔나요</h1>
            <p className="t-sub text-text-3">
              원천 {SOURCES.length}곳 · 갱신 주기·한계 공개 · 계산 공식은{" "}
              <Link href="/methodology" className={LINK}>
                데이터 방법론 ›
              </Link>
            </p>
          </header>

          {/* ── [987 · 신뢰 근거] 지금 실제로 가진 것 — 이 페이지를 열 때 DB 에서 센 실카운트. 못 읽은 줄은 뺀다 ── */}
          {coverage.txCount !== null ? (
            <section aria-label="지금 가진 데이터" className="flex flex-col gap-0.5">
              <p className="m-0 t-caption text-text-3">실거래 신고분(취소 제외) · 지금 센 값</p>
              <p className="m-0 t-display t-num text-ink">{formatCount(coverage.txCount)}</p>
              {(coverage.complexCount !== null || coverage.regionCount !== null) && (
                <p className="m-0 t-sub text-text-2">
                  {[
                    coverage.complexCount !== null ? `실거래 있는 단지 ${formatCount(coverage.complexCount)}` : null,
                    coverage.regionCount !== null ? `시군구 ${formatCount(coverage.regionCount)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </section>
          ) : (
            (coverage.complexCount !== null || coverage.regionCount !== null) && (
              <p className="t-sub text-text-2">
                {[
                  coverage.complexCount !== null ? `실거래 있는 단지 ${formatCount(coverage.complexCount)}` : null,
                  coverage.regionCount !== null ? `시군구 ${formatCount(coverage.regionCount)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )
          )}
          {/* 못 읽었을 때 — 조용히 비우지 않는다. 숫자가 없는 것과 못 읽은 것은 다르다 */}
          {coverage.txCount === null && !freshness && (
            <p className="t-sub text-text-3">수치를 불러오지 못함 · 아래 원천·한계 설명은 그대로 유효</p>
          )}
        </div>

        {freshness && freshness.some((f) => f.lastOkAt) && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">마지막으로 들어온 때</h2>
            <ul className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {freshness.map((f) => {
                if (!f.lastOkAt) return null;
                const label = freshnessLabel(f.lastOkAt, now);
                if (!label) return null;
                const stale = isStale(f.lastOkAt, now);
                return (
                  <li key={f.source} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 t-body text-text-1">{f.label}</span>
                    <span className={`shrink-0 t-sub tabular-nums ${stale ? "font-bold text-warning" : "text-text-3"}`}>
                      {label}
                      {stale ? " · 밀림" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="t-caption text-text-3">성공한 적재만 셈 · 48시간 넘으면 &ldquo;밀림&rdquo;</p>
          </section>
        )}

        {/* 원천 — [v4 · 규칙 3·5] 테두리 카드 → 접힘 행(이름 + 주기 / 펼치면 원천·쓰이는 곳·한계) */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            원천 <span className="t-num text-text-3">{SOURCES.length}</span>
          </h2>
          <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {SOURCES.map((s) => (
              <details key={s.name} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 t-body font-bold text-ink">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="t-sub text-text-3">{s.cadence.split(" (")[0]}</span>
                    <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </span>
                </summary>
                <dl className="m-0 flex flex-col gap-1 pb-3 t-sub text-text-2">
                  <div>
                    <dt className="inline font-bold text-text-1">원천</dt> <dd className="m-0 inline">{s.origin}</dd>
                  </div>
                  <div>
                    <dt className="inline font-bold text-text-1">주기</dt> <dd className="m-0 inline">{s.cadence}</dd>
                  </div>
                  <div>
                    <dt className="inline font-bold text-text-1">쓰이는 곳</dt> <dd className="m-0 inline">{s.used}</dd>
                  </div>
                  <div className="text-text-3">
                    <dt className="inline font-bold">한계</dt> <dd className="m-0 inline">— {s.limits}</dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
        </section>

        {/* AI 콘텐츠 라벨 정책 — [v4] 설명 문단 → 사실 한 줄, 정책 카드 → 구분선 행 */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">AI 콘텐츠 라벨 정책</h2>
          <p className="t-sub text-text-3">AI·사람, 실측·추정을 화면에서 구분 · 코드 게이트로 강제(라벨 없는 AI 수치는 배포에서 막힘)</p>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {AI_POLICY.map((p) => (
              <div key={p.label} className="py-3">
                <dt className="t-body font-bold text-ink">{p.label}</dt>
                <dd className="m-0 mt-0.5 t-sub leading-[1.65] text-text-2">{p.rule}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="t-caption leading-[1.7] text-text-3">
          주기는 수집 파이프라인 기준 · 원천 기관 발표 일정에 따라 실제 최신 시점은 다를 수 있음 · 파이프라인이 멈추면 신선도 감시가 경보 ·{" "}
          <Link href="/support" className={LINK}>
            고객센터
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
