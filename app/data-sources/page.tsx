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

  return (
    <PageShell breadcrumb="데이터 출처">
      <div className="mx-auto w-full max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.3] text-ink">
          이 숫자, 어디서 왔나요
        </h1>
        <p className="rise-in-1 mt-2 t-body leading-[1.75] text-text-2">
          내집나우의 모든 수치는 아래 원천에서 자동 수집됩니다. 각 원천의 갱신 주기와
          <b className="text-ink"> 알려진 한계</b>까지 함께 적습니다 — 한계를 모르는 숫자는
          틀린 숫자보다 위험하기 때문입니다. 계산 공식이 궁금하면{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          을 보세요.
        </p>

        {/* ── [987 · 신뢰 근거] 지금 실제로 가진 것 ──────────────────────────
            이 페이지는 출처와 주기를 **글로** 적어 두었지만, 실제로 얼마나 있고
            마지막에 언제 들어왔는지는 어디에도 없었다. 주기를 적어 두면 사람은
            그 주기가 지켜지고 있다고 읽는다 — 982에서 단지 대장 적재가 13일간
            실패하는 동안 화면에는 아무 표시도 없었다.

            후기가 아직 한 건도 없는 서비스가 "왜 믿어야 하나"에 답하는 방법은
            지어낸 추천사가 아니라 **가진 것을 그대로 보여 주는 것**이다.
            전부 실카운트이고, 못 읽은 줄은 뺀다. 밀린 것은 밀렸다고 적는다. */}
        <div className="rise-in-1 card mt-5 flex flex-col gap-4 rounded-[18px] p-5">
          <div>
            <h2 className="t-section text-ink">지금 실제로 가지고 있는 것</h2>
            <p className="mt-1 t-sub text-text-3">
              아래 수치는 이 페이지를 열 때 데이터베이스에서 직접 센 값입니다 —
              소개용으로 적어 둔 숫자가 아닙니다.
            </p>
          </div>

          {(coverage.txCount !== null ||
            coverage.complexCount !== null ||
            coverage.regionCount !== null) && (
            <div className="grid grid-cols-3 gap-2">
              {coverage.txCount !== null && (
                <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg px-3 py-2.5">
                  <span className="t-num t-section text-ink">
                    {formatCount(coverage.txCount)}
                  </span>
                  <span className="t-caption text-text-3">실거래 신고분(취소 제외)</span>
                </div>
              )}
              {coverage.complexCount !== null && (
                <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg px-3 py-2.5">
                  <span className="t-num t-section text-ink">
                    {formatCount(coverage.complexCount)}
                  </span>
                  <span className="t-caption text-text-3">실거래 있는 단지</span>
                </div>
              )}
              {coverage.regionCount !== null && (
                <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg px-3 py-2.5">
                  <span className="t-num t-section text-ink">
                    {formatCount(coverage.regionCount)}
                  </span>
                  <span className="t-caption text-text-3">실거래 있는 시군구</span>
                </div>
              )}
            </div>
          )}

          {freshness && freshness.some((f) => f.lastOkAt) && (
            <div className="flex flex-col gap-1.5">
              <span className="t-sub font-extrabold text-text-3">마지막으로 들어온 때</span>
              <ul className="flex flex-col gap-1">
                {freshness.map((f) => {
                  if (!f.lastOkAt) return null;
                  const label = freshnessLabel(f.lastOkAt, now);
                  if (!label) return null;
                  const stale = isStale(f.lastOkAt, now);
                  return (
                    <li key={f.source} className="flex items-baseline justify-between gap-3 t-sub">
                      <span className="min-w-0 text-text-2">{f.label}</span>
                      <span
                        className={`shrink-0 tabular-nums ${
                          stale ? "font-bold text-warning" : "text-text-3"
                        }`}
                      >
                        {label}
                        {stale ? " · 밀림" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="t-caption text-text-3">
                성공한 적재만 셉니다 — 실패한 시도를 &ldquo;갱신됨&rdquo;으로 적지 않습니다.
                48시간이 넘으면 밀렸다고 표시합니다.
              </p>
            </div>
          )}

          {/* 못 읽었을 때 — 조용히 비우지 않는다. 숫자가 없는 것과 못 읽은 것은 다르다 */}
          {coverage.txCount === null && !freshness && (
            <p className="t-sub text-text-3">
              지금은 수치를 불러오지 못했어요. 아래 원천·한계 설명은 그대로 유효합니다.
            </p>
          )}
        </div>

        <div className="rise-in-2 mt-6 flex flex-col gap-3">
          {SOURCES.map((s) => (
            <section key={s.name} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="t-body font-extrabold text-ink">{s.name}</h2>
                <span className="t-caption font-bold text-primary">{s.cadence}</span>
              </div>
              <p className="mt-1 t-sub text-text-2">
                <span className="font-bold text-text-1">원천</span> {s.origin}
              </p>
              <p className="mt-0.5 t-sub text-text-2">
                <span className="font-bold text-text-1">쓰이는 곳</span> {s.used}
              </p>
              <p className="mt-1.5 t-sub leading-[1.65] text-text-3">
                <span className="font-bold">한계</span> — {s.limits}
              </p>
            </section>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="text-[19px] font-extrabold text-ink">AI 콘텐츠 라벨 정책</h2>
          <p className="mt-1.5 t-body leading-[1.7] text-text-2">
            내집나우는 AI가 만든 것과 사람이 쓴 것, 실측과 추정을 화면에서 구분합니다.
            이 정책은 코드 게이트로 강제됩니다 — 라벨 없는 AI 수치는 배포 단계에서 막힙니다.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {AI_POLICY.map((p) => (
              <div key={p.label} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="t-body font-extrabold text-ink">{p.label}</div>
                <p className="mt-1 t-sub leading-[1.65] text-text-2">{p.rule}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-8 t-caption leading-[1.7] text-text-3">
          갱신 주기는 수집 파이프라인 기준이며, 원천 기관의 발표 일정에 따라 실제 최신
          시점은 다를 수 있습니다. 파이프라인이 멈추면 내부 신선도 감시가 경보를
          울리고, 각 화면은 마지막 갱신 시점을 함께 표기합니다. 문의:{" "}
          <Link href="/support" className="font-bold text-primary">
            고객센터
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
