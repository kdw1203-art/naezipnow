import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui";
import { readBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";
import { postHref } from "@/lib/town/post-href";
import { listProjects, countBySigunguFrom } from "@/lib/redevelopment/store";
import type { RedevelopmentProject } from "@/lib/redevelopment/types";
import { SEED_SOURCES } from "@/lib/redevelopment/seed";
import { logger } from "@/lib/log";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero, TownSources } from "@/app/town/TownHero";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { RedevelopmentMap } from "./RedevelopmentMap";
import { DataSourceCard } from "./DataSourceCard";
import { STAGE_GUIDES, REDEV_GLOSSARY } from "@/lib/redevelopment/stage-guide";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

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
    /* [1012] 규칙 5 — "확인하세요" 제거 */
    "재개발·재건축·소규모 정비사업을 사업종류별 마커로 보는 정비사업 지도. 사업종류·진행단계 필터, 7단계 진행 절차, 최신 정비사업 뉴스를 한곳에.",
};

const NEWS_KEYWORD_RE = /재건축|재개발|정비사업/;
const NEWS_LIMIT = 10;

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
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
      "[/redevelopment] 정비사업 구역을 읽지 못했습니다 — 구역이 없는 것이 아니라 조회가 실패했습니다:",
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

  return (
    /* [972] 형제 8칸과 머리가 달랐다 — PageShell 의 title 을 쓰면 h1 이 **카테고리 줄
       위**에 그려져, 이 페이지만 제목이 102px 에 있고 나머지는 214px 에 있었다
       (Pixel 5 실측). 브레드크럼도 혼자 "홈 › …" 로 시작했다.
       [v4] 형제 화면과 같은 흰 머리(TownHero) + 카테고리 탭. 브레드크럼 문자열은 제목·탭과 같은 말이라 뺐다.
       폭: 이 화면만 **최대 1080px** — 주인공이 지도(마커 3천 곳 규모)라 760px 에서는 구역 분포가 한 화면에 안 잡힌다
       (v4 브리프 "지도·표처럼 넓어야 하는 화면은 예외"). 글 섹션(단계·용어·뉴스)은 그 안에서 760px 로 묶는다. */
    <PageShell wide>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col">
        {/* [978] 통계는 이 화면이 이미 들고 있는 값만 쓴다 — 머리를 붙이면서 조회를 새로 얹지 않는다.
            [v4 · 규칙 1] 사실 한 줄 = 구역 수 · 시군구 수(예전 지도 위 설명 문장 "…누르면 그 구역으로 지도가 이동해요"의 숫자) */}
        <TownHero
          href="/redevelopment"
          stats={[
            { label: "구역", value: projects.length, unit: "곳" },
            { label: "시군구", value: sigunguCounts.length, unit: "곳" },
          ]}
        />
        {/* 카테고리 줄 고정 — 형제 카테고리 페이지(청약·입주·공매)와 동일 패턴 */}
        <TownCategoryNav stick />

        <div className="flex flex-col gap-8">
          {/* ===== 주인공: 정비사업 지도 ===== */}
          <section aria-label="정비사업 지도">
            {loadError ? (
              /* 실패를 "구역 없음"으로 바꿔 그리지 않는다 — 둘은 다른 사실이다.
                 원인 원문(cause)도 감추지 않고 그대로 보여 준다. */
              <ErrorState
                title="정비사업 구역을 불러오지 못했어요"
                desc="구역이 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻이에요. 잠시 후 다시 열어 주세요."
                cause={loadError}
                className="rounded-lg"
              />
            ) : (
              <RedevelopmentMap initialProjects={projects} sigunguCounts={sigunguCounts} />
            )}
          </section>

          {/* ===== 아래: 진행단계 · 용어 · 알림 · 뉴스(기존 콘텐츠 보존) — 글 섹션은 760px ===== */}
          <div className="flex w-full max-w-[760px] flex-col gap-8">
            {/* 재개발·재건축 진행 7단계 — [v4] 개요 칩 줄(아이콘 + 번호 원) + 세로 스테퍼(아이콘 원 · 경고 상자 · 체크 아이콘)
                두 블록을 **한 목록**으로: 단계마다 1px 선 행 하나(이름 + 기간), 누르면 뜻·유의점·확인할 것이 펼쳐진다 */}
            <section aria-labelledby="redev-stages-title" className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="redev-stages-title" className="t-section text-ink">
                  재개발·재건축 진행 7단계
                </h2>
                <span className="shrink-0 t-caption text-text-3">도시정비법 일반 절차</span>
              </div>
              {/* li 가 아니라 div — 폰 배율(html[data-mscale])의 "li 안 보조 줄 한 줄" 규칙이 펼친 설명 문단을 자르지 않게 */}
              <div data-tone="sand" className="divide-y divide-line border-b border-line">
                {STAGE_GUIDES.map((s, i) => (
                  <div key={s.key}>
                    <details className="group">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate t-body font-bold text-ink">
                            <span className="t-num text-text-3">{i + 1}.</span> {s.longLabel}
                          </span>
                          <span className="mt-0.5 block truncate t-sub text-text-3">{s.period}</span>
                        </span>
                        <span aria-hidden="true" className="shrink-0 t-body text-text-3 transition-transform group-open:rotate-90">
                          ›
                        </span>
                      </summary>
                      <div className="flex flex-col gap-2 pb-3">
                        <p className="t-sub text-text-1">{s.desc}</p>
                        <p className="t-sub text-warning">
                          <span className="font-bold">유의점 </span>
                          {s.caution}
                        </p>
                        <div>
                          <div className="t-sub font-bold text-text-2">이 단계에서 확인할 것</div>
                          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                            {s.checklist.map((c) => (
                              <li key={c} className="t-sub text-text-2">
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== 자주 나오는 용어 — [v4] 2열 카드 격자 → 접힘 안 1px 선 행 ===== */}
            <details className="group border-y border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
                <span>
                  자주 나오는 용어 <span className="t-sub font-normal text-text-3">{REDEV_GLOSSARY.length}개</span>
                </span>
                <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <dl data-tone="blue" className="divide-y divide-line pb-2">
                {REDEV_GLOSSARY.map((g) => (
                  <div key={g.term} className="py-2.5">
                    <dt className="t-sub font-bold text-ink">{g.term}</dt>
                    <dd className="mt-0.5 t-sub text-text-2">{g.desc}</dd>
                  </div>
                ))}
              </dl>
            </details>

            {/* ===== 정비사업 뉴스 (board_posts 실데이터) — [v4] 카드 → 1px 선 행(제목 한 줄 + 매체 · 날짜 · 지역 한 줄) ===== */}
            <section aria-labelledby="redev-news-title" className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="redev-news-title" className="t-section text-ink">
                  정비사업 뉴스
                  {news.length > 0 && <span className="ml-1.5 t-sub font-medium text-text-3">{news.length}건</span>}
                </h2>
                <Link href="/town/news" className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
                  뉴스룸 전체 ›
                </Link>
              </div>
              {news.length === 0 &&
                (newsFailed ? (
                  <p className="py-3 t-sub text-text-2">뉴스를 불러오지 못했어요 (조회 실패) — 관련 기사가 없다는 뜻은 아니에요</p>
                ) : (
                  /* [1012] 규칙 6 — 언제·어디서. [v4] 한 줄 */
                  <p className="py-3 t-sub text-text-3">최근 수집분에 재건축·재개발 기사 없음</p>
                ))}
              {news.length > 0 && (
                <ul data-tone="hanji" className="divide-y divide-line">
                  {news.map((n) => (
                    <li key={n.id}>
                      <Link href={postHref(n)} className="flex min-w-0 flex-col gap-0.5 py-3 no-underline">
                        <span className="truncate t-body font-bold text-ink">{n.title}</span>
                        <span className="truncate t-sub text-text-3">
                          {[n.sourceName || n.authorLabel, shortDate(n.sourcePublishedAt || n.createdAt), n.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ===== 관심 등록 — 실제 존재하는 기능(저장 검색 알림)으로만 연결.
                 "정비사업 소식 알림"은 아직 없는 기능이라 약속하지 않는다.
                 [v4] 타일(설명 두 문장 + 연한 버튼) → 1px 선 행 하나 ===== */}
            <ul data-tone="blue" className="divide-y divide-line border-y border-line">
              {/* [1012] 규칙 5 — 동사 + 구체 대상 */}
              <SummaryRow
                label="관심 지역 새 매물 알림 받기"
                sub="저장한 검색 조건의 새 매물 알림 · 정비사업 단계 변경 알림은 없음"
                href="/my/watchlist?tab=searches"
              />
            </ul>

            {/* [v4 · 규칙 3] 데이터 출처 — 예전 지도 아래 "데이터 출처" 카드 · 단계 스테퍼 끝 면책 상자 · 뉴스 끝 캡션을 한 곳으로 */}
            <TownSources>
              <DataSourceCard sources={SEED_SOURCES} />
              <p>
                7단계는 개념 안내용 일반 절차 — 실제 사업 단계·조합원 자격·분담금은 구역·조합마다 다름 · 구역별 실제 단계·일정은
                지자체 고시(정비사업 정보몽땅 등 공공 공개자료) 기준 · 조합·구청·전문가 확인 필요
              </p>
              <p>정비사업 뉴스 — 재건축·재개발·정비사업 키워드로 고른 자동 수집 기사 · 매체명·원문 링크는 각 기사에</p>
            </TownSources>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
