import { formatKstDate } from "@/lib/format/kst";
import { seoAlternates } from "@/lib/seo/alternates";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui";
import { Icon } from "@/app/components/Icon";
import { AdZone } from "@/app/components/ads/AdZone";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";
import { postHref } from "@/lib/town/post-href";
import { listProjects, countBySigunguFrom } from "@/lib/redevelopment/store";
import { redevStageCounts } from "@/lib/redevelopment/map-layer";
import type { RedevelopmentProject } from "@/lib/redevelopment/types";
import { SEED_SOURCES } from "@/lib/redevelopment/seed";
import { logger } from "@/lib/log";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { MiniBar } from "@/app/components/compact/MiniBar";
import { Fineprint } from "@/app/components/Fineprint";
import { RedevelopmentMap } from "../RedevelopmentMap";
import { SeoulPlanSection } from "../SeoulPlanSection";
import { STAGE_GUIDES, REDEV_GLOSSARY } from "@/lib/redevelopment/stage-guide";

/* ============================================================
   정비사업 추적 라이트 (재개발닷컴 벤치마크 D2 축소판)
   — 도시정비법 일반 절차 기준 7단계 진행 트래커(정보성 콘텐츠)
     · 각 단계 설명·유의점·"이 단계에서 확인할 것" 체크리스트
   — board_posts 자동 수집 뉴스에서 재건축·재개발·정비사업 키워드
     매칭 최신 기사 리스트 (실데이터, 없으면 빈 상태)
   — 관심 등록 CTA → /my/saved-searches (실제 존재하는 저장 검색 알림)
   지도 구역·단계는 공개자료 취합 시드/DB 기반 참고값 — asOf(취합 시점)를
   마커·목록·면책에 함께 표기해 최신 고시와 다를 수 있음을 고지한다.
   ============================================================ */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 86_400;

export const metadata = {
  title: "정비사업 지도 | 내집나우",
  description:
    "재개발·재건축·소규모 정비사업 지도 · 서울시 도시계획 결정 조서(정비사업·도시개발·지구단위계획) · 7단계 절차 · 정비사업 뉴스.",
  /* [1031 · 운영 경보 seo.asset] 사이트맵 제출 페이지인데 canonical 이 없었다 — ?zone=·#id 변형 URL 로 색인이 갈라진다 */
  alternates: seoAlternates("/redevelopment"),
};

const NEWS_KEYWORD_RE = /재건축|재개발|정비사업/;
const NEWS_LIMIT = 10;

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/* [1054] 한국 날짜로 — 예전엔 서버(UTC) getDate() 라 00~09시(KST) 기사가 전날로 찍혔다 */
function shortDate(iso: string | undefined): string {
  return iso ? formatKstDate(iso) : "";
}

type NewsData = {
  news: Post[];
  /** 조회 자체가 실패했는가. false 면 "읽었고 매칭이 이만큼"이라는 뜻이다. */
  failed: boolean;
};

/**
 * board_posts에서 정비사업 키워드 매칭 최신 기사.
 *
 * readBoardPosts 는 이제 못 읽으면 던진다 — 아래 loadProjects 와 같은 이유로
 * 여기서 잡는다(프리렌더 중 던지면 배포가 깨진다). 다만 빈 배열로 뭉개지 않고
 * failed 를 들고 간다: "관련 기사가 아직 없어요"와 "못 불러왔어요"는 다른 사실이다.
 */
async function loadRedevelopmentNews(): Promise<NewsData> {
  try {
    const posts = await readBoardPosts();
    return {
      news: posts
        .filter((p) => NEWS_KEYWORD_RE.test(p.title) || NEWS_KEYWORD_RE.test(p.body))
        .sort((a, b) => displayTime(b) - displayTime(a))
        .slice(0, NEWS_LIMIT),
      failed: false,
    };
  } catch (e) {
    logger.error("[/redevelopment] 정비사업 뉴스 조회 실패", e);
    return { news: [], failed: true };
  }
}

type ProjectsData = {
  projects: RedevelopmentProject[];
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼"이라는 뜻이다. */
  loadError: string | null;
};

/* 이 페이지는 revalidate 가 있고 동적 파라미터가 없어 `next build` 가
   빌드 타임에 프리렌더한다. 여기서 던지면 DB 가 잠깐 흔들린 것만으로 배포
   전체가 깨진다(/complex/compare 와 같은 사정). 그래서 store 는 실패를
   던지고, 페이지는 그 실패를 **실패라고 그린다** — 조용히 빈 지도로
   바꿔 그리지 않는다. 빈 지도는 "이 지역에 정비사업이 없다"는 다른 사실이다.

   noindex 까지 걸지는 않는다. 이 페이지는 7단계 가이드·용어·뉴스가 본문의
   대부분이고 지도는 그중 한 섹션이라, 조회가 실패해도 색인할 값이 남는다. */
async function loadProjects(): Promise<ProjectsData> {
  try {
    return { projects: await listProjects({ limit: 3000 }), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/redevelopment] 정비사업 구역을 읽지 못했습니다 (조회 실패):",
      message,
    );
    return { projects: [], loadError: message };
  }
}

export default async function RedevelopmentPage() {
  const [{ news, failed: newsFailed }, { projects, loadError }] = await Promise.all([
    loadRedevelopmentNews(),
    loadProjects(),
  ]);
  const sigunguCounts = countBySigunguFrom(projects);
  /* [1038 · 16] 단계별 구역 수 — 지도에 실린 구역(projects)만 센다. 0곳이면 막대를 그리지 않는다 */
  const stageCounts = projects.length > 0 ? redevStageCounts(projects, new Set()) : null;
  /* [1063 · 표·그래프] 단계 칩마다 박혀 있던 1px 막대 7개를 공용 비율 막대 한 장(MiniBar)으로 모았다 —
     같은 수를 같은 축에 세로로 세우면 어느 단계에 구역이 몰렸는지 한눈에 읽힌다(단위는 "곳" 하나뿐).
     값은 지도에 실린 구역에서 센 수 그대로다. */
  const stageRows = stageCounts
    ? STAGE_GUIDES.map((s) => ({ label: s.longLabel, value: stageCounts[s.key] }))
    : [];
  const topStage = stageRows.length > 0 ? stageRows.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  /* 머리 숫자 — 이 화면이 이미 들고 있는 배열에서 센 값만(새 조회·추정 없음) */
  const headFacts: { k: string; v: string }[] = [
    ...(sigunguCounts.length > 0
      ? [{ k: "시군구", v: `${sigunguCounts.length.toLocaleString("ko-KR")}곳` }]
      : []),
    ...(topStage && topStage.value > 0
      ? [{ k: `최다 단계 · ${topStage.label}`, v: `${topStage.value.toLocaleString("ko-KR")}곳` }]
      : []),
    { k: "정비사업 뉴스", v: `${news.length.toLocaleString("ko-KR")}건` },
  ];

  return (
    /* [972] 형제 8칸과 머리가 달랐다 — PageShell 의 title 을 쓰면 h1 이 **카테고리 줄
       위**에 그려져, 이 페이지만 제목이 102px 에 있고 나머지는 214px 에 있었다
       (Pixel 5 실측). 브레드크럼도 혼자 "홈 › …" 로 시작했다.
       9칸 공통 머리(TownPageHead: 아이콘 칩 + 제목 + 한 줄)로 맞춘다. */
    <PageShell breadcrumb="동네이야기 › 정비사업 지도" wide>
      {/* 카테고리 줄 고정 — 형제 카테고리 페이지(청약·입주·공매)와 동일 패턴 */}
      {/* [978] 통계는 이 화면이 이미 들고 있는 값만 쓴다 — 머리를 붙이면서 조회를
          새로 얹지 않는다(976 에서 줄인 DB 왕복을 되돌리는 짓이다). */}
      <TownHero
        href="/redevelopment"
        stats={[{ label: "지도에 실린 구역", value: projects.length, unit: "곳" }]}
      />
      <TownCategoryNav stick />
      {/* [1075 · 한 틀] 형제(공매·입주·청약)는 칸 전폭인데 이 화면만 1080px 가운데 — 같은 폭으로 */}
      <div className="flex w-full flex-col gap-6 max-md:gap-3">
        {/* ===== [1063 · 표·그래프] 요약 판 — 숫자 · 단계 막대 · 주 액션 =====
            소유자 지시 "표 및 그래프, 액션 적극 활용 · 글자크기 간결화"(10-12).
            첫 화면이 지도 → 조서 표 → 7단계 설명 벽으로 이어져, "지금 몇 구역이 어느 단계에 있나"를
            글로 읽어야 했다. 머리카락 선으로 나눈 숫자 석 칸과 단계 막대 한 장을 앞세우고,
            아래 레일 맨 끝에 있던 저장 검색 타일(이 화면의 단 하나뿐인 주 액션)을 여기로 올렸다.
            문장은 지우지 않았다 — 기준·세는 방법만 접기 뒤로 간다. */}
        <section className="rise-in card p-[var(--pad-card)]" aria-label="정비사업 요약">
          {/* [1063 고침] 폰에서는 숫자 줄과 액션을 위아래로 — 한 줄에 두면 단추가 줄어들지 않아 숫자 칸을 덮는다(390px 실측) */}
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between md:gap-x-4">
            <dl className="m-0 grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {headFacts.map((f) => (
                <div
                  key={f.k}
                  className="flex min-w-0 flex-col-reverse gap-0.5 sm:border-l sm:border-line sm:pl-3 sm:first:border-l-0 sm:first:pl-0"
                >
                  <dt className="t-caption text-text-3">{f.k}</dt>
                  <dd className="m-0 t-num t-section text-ink">{f.v}</dd>
                </div>
              ))}
            </dl>
            {/* 관심 등록 CTA — 실제 존재하는 기능(저장 검색 알림)으로만 연결.
                "정비사업 소식 알림"은 아직 없는 기능이라 약속하지 않는다(알림 범위는 단추 아래 한 줄). */}
            <div className="flex min-w-0 flex-col gap-1 md:shrink-0">
              <Link
                href="/my/watchlist?tab=searches"
                className="btn-primary inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 t-body no-underline md:min-h-9"
              >
                관심 지역 검색조건 저장하기
              </Link>
              <span className="t-caption text-text-2">새 매물 알림 · 저장 조건 기준 · 단계 변경 알림 미제공</span>
            </div>
          </div>

          {stageRows.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <h2 className="m-0 t-section font-bold text-ink">단계별 지도 구역</h2>
                <span className="t-caption text-text-3">도시정비법 일반 절차 기준</span>
              </div>
              {/* 1080px 전폭에서 막대가 늘어지지 않게 읽는 폭을 묶는다(.measure = 72ch) */}
              <MiniBar className="measure mt-2" rows={stageRows} unit="곳" label="단계별 구역 수" />
            </div>
          )}

          <Fineprint className="measure mt-3" label="기준 · 세는 방법">
            위 숫자와 막대는 이 화면이 지도에 실은 구역과 수집한 기사에서 센 값입니다. 구역이
            없는 단계는 0곳으로 적습니다.
          </Fineprint>
        </section>

        {/* ===== 정비사업 지도 히어로 ===== */}
        {/* [1015] 지도 위 사용법 문장("…걸러 원하는 구역만 골라보세요. 마커·목록을 누르면 …이동해요")은 걷었다
            (브리프 규칙 B) — 필터·마커는 화면이 스스로 말한다. */}
        <section className="rise-in flex flex-col gap-3">
          {loadError ? (
            /* 실패를 "구역 없음"으로 바꿔 그리지 않는다 — 둘은 다른 사실이다.
               원인 원문(cause)도 감추지 않고 그대로 보여 준다. */
            <ErrorState
              title="정비사업 구역 불러오기 실패"
              desc="잠시 후 다시 시도해 주세요."
              cause={loadError}
              className="rounded-2xl"
            />
          ) : (
            <RedevelopmentMap
              initialProjects={projects}
              sigunguCounts={sigunguCounts}
              sources={SEED_SOURCES}
            />
          )}
        </section>

        {/* [1029] 서울시 도시계획 결정 조서(열린데이터광장 UPIS) — 지도 바로 아래 전폭. 표가 비어 있으면 안 그린다. */}
        <SeoulPlanSection />

        {/* ===== 아래: 진행단계 가이드 + 뉴스(기존 콘텐츠 보존) =====
            [1015] 데스크톱은 2단 — 왼쪽 7단계 가이드, 오른쪽 340px 레일(정비사업 뉴스 · 용어 · 저장 검색 · 광고 1).
            760px 한 열이라 옆이 비던 화면(브리프 규칙 F). 카드는 그대로 옮겨 놓았다. 폰은 한 열 그대로. */}
        <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          {/* ===== 진행단계 개요 스트립 ===== */}
        {/* [1027] id — 구역 상세(/redevelopment/[id])의 "정비사업 7단계" 링크가 여기로 온다. 고정 헤더만큼 띄운다. */}
        <section id="stage-guide" className="rise-in card scroll-mt-24 rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
          <div className="flex items-baseline justify-between">
            {/* [1015] 물음·설명형 제목("…이렇게 7단계로 진행돼요") → 명사(브리프 규칙 D) */}
            <h2 className="t-section font-bold text-ink">정비사업 7단계</h2>
            <span className="t-caption text-text-3">도시정비법 일반 절차 기준</span>
          </div>
          {/* 가로 스텝 오버뷰 — 좁은 화면은 가로 스크롤.
              [1038 · 16] 단계 칩 아래 "지도에 실린 구역 수"를 막대로 — 어느 단계에 구역이 몰려 있는지 한 줄로
              [1063] 칩마다 박혀 있던 1px 막대는 머리 판의 비율 막대(MiniBar · 같은 stageCounts)로 모았다.
              이 줄은 절차의 **순서**만 말한다 — 수는 한 곳에서만 센다. */}
          <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1" tabIndex={0}>
            <ol className="flex min-w-max items-center gap-1">
              {STAGE_GUIDES.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1">
                  <span className="chip chip-soft flex items-center gap-1 px-2.5 py-1 t-sub" style={{ whiteSpace: "normal" }}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary t-caption font-bold text-white">
                      {i + 1}
                    </span>
                    <Icon name={s.icon} size={13} />
                    {s.longLabel}
                  </span>
                  {i < STAGE_GUIDES.length - 1 && (
                    <span className="shrink-0 t-sub text-text-3" aria-hidden="true">
                      ›
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          {/* [1015] "…아래에서 단계별로 정리했어요. …반드시 확인하세요" 안내 문단은 걷었다(브리프 규칙 B) —
              단계별 상세와 면책 한 줄이 바로 아래에 있다. */}
        </section>

        {/* ===== 단계별 상세 트래커(세로 스테퍼) ===== */}
        {/* [1063 · 표·그래프] 세로 스테퍼 7칸(칸마다 설명 한 문단 + 유의점 상자 + 체크 3줄 = 한 화면이 글로 덮였다)
            → 한 판 안 머리카락 선 7줄. 왼쪽은 번호·아이콘·단계 이름(굵게), 오른쪽은 소요 구간,
            설명·유의점·확인할 것은 줄마다 접기(기준 · 출처 접기와 같은 부품) 뒤에 **문장 그대로** 둔다.
            글은 한 줄도 지우지 않았다 — DOM 에 그대로 있고(검색·심사 문구 유지) 접혀만 있다. */}
        <section className="rise-in-1 card rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
          <h2 className="t-section font-bold text-ink">단계별 상세 · 이 단계에서 확인할 것</h2>
          {/* 줄 사이 선은 판이 아니라 선만(data-tone="plain") — 흰 카드 안에 색판이 또 들어가면 액자가 둘이다 */}
          <ol data-tone="plain" className="mt-2 flex list-none flex-col divide-y divide-line p-0">
            {STAGE_GUIDES.map((s, i) => (
              <li key={s.key} className="py-2.5">
                <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-1 md:min-h-6">
                  <h3 className="m-0 flex min-w-0 items-center gap-1.5 t-body font-bold text-ink">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary t-caption font-bold text-white">
                      {i + 1}
                    </span>
                    <Icon name={s.icon} size={14} className="shrink-0 text-primary" />
                    <span className="min-w-0">{s.longLabel}</span>
                  </h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(29,79,216,.06)] chip-pad t-caption font-semibold text-text-2">
                    <Icon name="clock" size={11} />
                    {s.period}
                  </span>
                </div>

                <Fineprint label="설명 · 유의점 · 확인할 것">
                  {/* [1030 · G2] 단계 설명·유의점은 목록 메타가 아니라 본문 — 폰 한 줄 규칙에서 뺀다(.mscale-wrap) */}
                  <p className="mscale-wrap mt-1 t-sub text-text-1">{s.desc}</p>

                  {/* 유의점 */}
                  <div className="mt-2 flex gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2">
                    <Icon
                      name="warning"
                      size={13}
                      className="mt-px shrink-0 text-warning"
                    />
                    <p className="mscale-wrap t-sub text-warning">
                      <span className="font-bold">유의점 </span>
                      {s.caution}
                    </p>
                  </div>

                  {/* 이 단계에서 확인할 것 */}
                  <div className="mt-2">
                    <div className="t-sub font-bold text-text-2">
                      이 단계에서 확인할 것
                    </div>
                    <ul className="mt-1 flex list-none flex-col gap-1 p-0">
                      {s.checklist.map((c) => (
                        <li key={c} className="flex gap-1.5">
                          <Icon
                            name="check"
                            size={13}
                            className="mt-px shrink-0 text-primary"
                          />
                          <span className="t-sub text-text-2">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Fineprint>
              </li>
            ))}
          </ol>

          {/* 면책 — [1063] 문장은 그대로 두고 접기 뒤로(아이콘·문구 유지) */}
          <Fineprint className="mt-3" label="면책 · 기준">
            <span className="flex gap-1.5">
              <Icon name="shield" size={13} className="mt-px shrink-0" />
              <span>
                일반 절차 기준의 개념 안내입니다. 실제 사업 단계·조합원 자격·분담금은 구역·조합마다
                다르므로 조합·구청·전문가 확인이 필요합니다. 구역별 실제 단계·일정은 지자체
                고시(정비사업 정보몽땅 등 공공 공개자료) 기준입니다.
              </span>
            </span>
          </Fineprint>
        </section>
        </div>

        {/* ===== 오른쪽 레일(데스크톱) — 뉴스 · 용어 · 저장 검색 · 광고 1 ===== */}
        <aside className="flex min-w-0 flex-col gap-4 max-md:gap-3">
        {/* ===== 정비사업 뉴스 (board_posts 실데이터) ===== */}
        <section className="rise-in-2 card flex flex-col gap-2.5 rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
          <div className="flex items-center justify-between">
            <h2 className="t-section font-bold text-ink">정비사업 뉴스</h2>
            <Link href="/town/news" className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary">
              뉴스룸 전체 ›
            </Link>
          </div>
          {news.length === 0 &&
            (newsFailed ? (
              /* 색은 배경이 지고, 문장은 text-ink 로 읽는다 — 11px 본문에서 가장 확실하다. */
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-center t-sub text-ink">
뉴스 불러오기 실패 · 잠시 후 다시
              </div>
            ) : (
              <div className="py-3 text-center t-sub text-text-3">
최근 수집된 재건축·재개발 관련 기사 없음
              </div>
            ))}
          {/* [1063] 기사 줄 — 제목 왼쪽(굵게) · 날짜 오른쪽, 줄 사이는 머리카락 선. 폰 탭 면 40px.
              출처·지역은 제목 아래 한 줄로 그대로 남는다(값은 같고 자리만 나눴다). */}
          {news.length > 0 && (
            <div data-tone="plain" className="flex flex-col divide-y divide-line">
              {news.map((n) => (
                <Link
                  key={n.id}
                  href={postHref(n)}
                  className="group flex min-h-[40px] items-baseline justify-between gap-2 py-2 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block t-sub font-bold text-ink group-hover:text-primary">
                      {n.title}
                    </span>
                    <span className="mt-[2px] block t-caption text-text-3">
                      {[n.sourceName || n.authorLabel, n.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap t-caption t-num text-text-3">
                    {shortDate(n.sourcePublishedAt || n.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {/* [1015] "…키워드 매칭 자동 수집 기사 — …확인하세요" 부연은 걷었다(브리프 규칙 C — "자동 수집" 라벨) */}
        </section>

        {/* ===== 자주 나오는 용어 ===== */}
        {/* [1063] 용어 카드(테두리 상자 여러 장) → 한 판 안 머리카락 선 줄. 낱말은 굵게, 뜻은 아래 한 줄.
            뜻 문장은 그대로다 — 상자만 걷었다. */}
        <section className="rise-in-3 card rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
          <h2 className="t-section font-bold text-ink">자주 나오는 용어</h2>
          <dl data-tone="plain" className="m-0 mt-2 flex flex-col divide-y divide-line">
            {REDEV_GLOSSARY.map((g) => (
              <div key={g.term} className="py-2">
                <dt className="t-sub font-bold text-ink">{g.term}</dt>
                <dd className="m-0 mt-0.5 t-caption text-text-2">{g.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ===== 관심 등록 CTA 는 머리 요약 판으로 올렸다([1063]) — 레일 맨 끝(폰에서는 화면 다섯 장 아래)에 있던
             이 화면의 유일한 주 액션을 첫 화면에 둔다. 링크·문구·알림 범위 한 줄은 그대로 옮겼다. */}

        {/* [1015] 광고 — 레일 1곳(첫 화면 밖). 이 화면에 광고 자리가 없었다(브리프 규칙 G: 폰 2·데스크톱 2 이하). */}
        <AdZone placement="sidebar" seed={0} plan={null} />
        </aside>
        </div>
      </div>
    </PageShell>
  );
}
