import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import {
  REGION_CATALOG,
  findCatalogRegionById,
  normalizeRegionKey,
} from "@/lib/region/catalog";
import { readTownPosts } from "@/lib/newui/board-posts";
import { isLabNoteLabel, listPublicNoteCards, type PublicNoteCard } from "@/lib/inspection/store-db";
import { getRegionSnapshot } from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import type { Post } from "@/lib/types/post";
import { formatKrwShort } from "@/lib/market/format";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import { cityOfRegion, groupRegionsByCity } from "@/lib/town/region-groups";
import { buildNewsRows } from "@/lib/town/news-list";
import { isStoryPost } from "@/lib/town/story";
import { postAttachments } from "@/lib/community/attachments";
import { feedAuthorLabel, feedDisplayTitle } from "@/lib/town/feed-regions";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { TownNewsStrip } from "../TownNewsStrip";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ============================================================
   [#64] 동네 홈 — /town/{regionId}
   /town?region= 쿼리 필터를 "우리 동네 상주 공간"으로 승격한 정식 페이지.
   그 지역의 이웃 글 · 자동수집 뉴스 · 시세 요약 · 공개 임장노트 · 키워드 알림을
   한 화면에 모으고, 시장 데이터 페이지(/region/[id])와 상호 링크한다.

   구분: /region/[id] = 시장 데이터(숫자), /town/[id] = 동네 생활(글·뉴스).
   이웃 글 상세는 /town/story/[id].
   generateStaticParams + dynamicParams=false — 카탈로그 62곳만 존재한다
   (임의 문자열은 빌드 매니페스트 밖이라 미들웨어 전에 정적 404 — soft-404 없음).

   [v4] "한 화면 한 가지" — 허브(/town)와 같은 모양. 위에서 아래로:
     ① 머리 — 제목 "{동네} 동네 홈" + 사실 한 줄(평균 매매가 · 전세가율, 있을 때만) + 오른쪽 알림·작은 글쓰기
     ② 뉴스 한 행(허브 TownNewsRow 와 같은 모양 · 0건이면 없음) → 뉴스룸 지역 딥링크
     ③ 이웃 글 목록(1px 선 행) ④ 공개 임장노트 목록(1px 선 행) ⑤ 다른 동네 홈(시·도별 접기)
     ⑥ 맨 끝 링크 한 줄(시장 데이터 · 지도) + 출처 캡션 한 줄
   지운 것: 한지 뉴스 스트립 · "자동 수집"/"뉴스룸"/"사람의 기록" 배지 · 시세 카드(3칸 + 출처 문장) ·
   이야기 아바타 · "Lab 데이터"/"직접방문" 배지 · 빈 상태 설명 문장(한 줄로) · 채움 파랑 "이 동네 이야기 쓰기"
   (작은 아웃라인으로) · 2열 격자(데스크톱도 가운데 한 줄 760px) · 동네 이름 칩(글자 링크로 — 칩은 필터에만).
   ============================================================ */

/* [1007] 600초 → 6시간. 62개 동네 홈(HTML ~185KB)이 하루 198회 크롤되며 10분마다 다시
   구워졌다. 이웃 글·공개 노트·뉴스 적재 지점이 invalidateTownFeed/invalidateAfterIngest("news")
   로 62곳을 한 번에 비우므로(revalidatePath("/town/[region]","page")) 시간 TTL 은 안전망이다. */
/* [1010] 6시간 → 7일. 하루 198회 크롤 · 크롤러 재방문 ≈2.2일이라 6시간 눈금은 방문마다
   재렌더와 같았다(62곳 × HTML ~185KB). 내용을 바꾸는 지점은 전부 라우트 단위로 62곳을 한 번에
   비운다 — invalidateTownFeed()(이웃 글·댓글·공감·채택·공개 노트 저장/전환/삭제)와
   invalidateAfterIngest("news")(뉴스 적재·주간 글·지역 소개 글). 시간 TTL 은 안전망이다. */
export const revalidate = 604_800;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ region: string }> {
  return REGION_CATALOG.map((r) => ({ region: r.id }));
}

type Params = { region: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { region: id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) return { title: "동네를 찾을 수 없어요 | 내집나우" };
  /* [970 · C-25] 접미 없던 제목에 `| 내집나우`(폴백 제목과 동일 접미) */
  const title = `${region.name} 동네 홈 — 이웃 글·뉴스·시세 한눈에 | 내집나우`;
  /* [1012] 규칙 5 — "받아보세요" 권유 제거, 구성만 */
  const description = `${region.name} 이웃 글 · 공개 임장노트 · 오늘의 ${region.name} 부동산 뉴스 · 평균 매매가·전세가율 요약을 한 화면에.`;
  return {
    title,
    description,
    alternates: seoAlternates(`/town/${id}`),
    openGraph: { title, description, type: "website" },
  };
}

/** 글이 이 지역 것인가 — city/district/tags/제목의 정규화 키 포함 매칭 */
function postMatchesRegion(p: Post, nameKey: string): boolean {
  if (!nameKey) return false;
  const fields = [p.city, p.district, ...(p.tags ?? [])];
  for (const f of fields) {
    const k = normalizeRegionKey((f ?? "").trim());
    if (k && (k === nameKey || k.includes(nameKey) || nameKey.includes(k))) return true;
  }
  return normalizeRegionKey(p.title).includes(nameKey);
}

function noteMatchesRegion(n: PublicNoteCard, nameKey: string): boolean {
  const k = normalizeRegionKey(n.region ?? "");
  return Boolean(k && (k.includes(nameKey) || nameKey.includes(k)));
}

/** [967 · 32] 지역 홈 카드의 상대시각 — 시간 단위("방금"·N시간 전·N일 전(30일)·UTC "08.19").
 *  분 표기가 없고 "방금" 인 기존 얼굴을 그대로 옵션으로 넘긴다. 본체는 lib/format/relative-time.ts */
function relTime(iso: string): string {
  return relativeTimeLabel(iso, Date.now(), { unit: "hour", justNow: "방금", maxDays: 30, fallback: "md-utc" });
}

/** [v4] 섹션 머리 — 이름(t-section) + 숫자 · 오른쪽 작은 글자 링크 하나 */
function SectionHead({
  id,
  title,
  count,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  count?: number;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="t-section text-ink">
        {title}
        {count !== undefined && count > 0 && <span className="ml-1.5 t-sub font-medium text-text-3">{count}</span>}
      </h2>
      <Link href={href} className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
        {linkLabel}
      </Link>
    </div>
  );
}

export default async function TownRegionHomePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { region: id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) notFound();
  const nameKey = normalizeRegionKey(region.name);

  /* 실패는 섹션 단위로 접는다 — 동네 홈이 한 소스 장애로 통째로 죽지 않게 */
  const [postsR, notesR, snapR] = await Promise.allSettled([
    readTownPosts(),
    listPublicNoteCards(100),
    getRegionSnapshot(id),
  ]);
  if (postsR.status === "rejected") logger.error(`[town/${id}] 글 조회 실패`, postsR.reason);
  if (notesR.status === "rejected") logger.error(`[town/${id}] 노트 조회 실패`, notesR.reason);
  if (snapR.status === "rejected") logger.error(`[town/${id}] 시세 조회 실패`, snapR.reason);

  const allPosts: Post[] = postsR.status === "fulfilled" ? postsR.value : [];
  const regionPosts = allPosts.filter((p) => postMatchesRegion(p, nameKey));
  /* 이웃 글 = 사람이 쓴 글(자동수집 제외) · link_only 는 목록에 싣지 않는다 */
  const communityPosts = regionPosts
    .filter((p) => isStoryPost(p) && p.visibility !== "link_only")
    .slice(0, 8);
  /* [1006] 이 동네 뉴스 — 뉴스룸과 같은 조립기(같은 사건 접기)로 행을 만든다.
     [v4] 한 행이 "{동네} 뉴스 n건"(n = 접은 행 수) + 최신 제목만 말하므로 자르지 않고 센다 */
  const newsRows = buildNewsRows(regionPosts.filter((p) => p.isAutomated));
  const notes: PublicNoteCard[] =
    notesR.status === "fulfilled"
      ? notesR.value.filter((n) => noteMatchesRegion(n, nameKey)).slice(0, 6)
      : [];
  const notesFailed = notesR.status === "rejected";
  const snapshot: RegionMarketSnapshot | null =
    snapR.status === "fulfilled" ? snapR.value : null;
  const postsFailed = postsR.status === "rejected";
  /* [970 · C-17] "다른 동네" 접기에서 기본으로 펼칠 시·도 = 지금 보는 동네의 시·도 */
  const ownCity = cityOfRegion(id);
  const writeHref = `/town/write?region=${encodeURIComponent(region.name)}`;
  const newsHref = `/town/news?region=${encodeURIComponent(region.name)}`;

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 숫자만(한국부동산원 월간 통계, 있는 값만). 예전 시세 카드(3칸 + 출처 문장)의 값 */
  const fact = snapshot
    ? [
        snapshot.avgSale && snapshot.avgSale > 0 ? `평균 매매가 ${formatKrwShort(snapshot.avgSale)}` : null,
        snapshot.jeonseRatio !== undefined && Number.isFinite(snapshot.jeonseRatio)
          ? `전세가율 ${snapshot.jeonseRatio.toFixed(1)}%`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "동네이야기", url: "/town" },
              { name: `${region.name} 동네 홈`, url: `/town/${id}` },
            ]),
          ]),
        }}
      />

      {/* [v4] 데스크톱도 가운데 한 줄(최대 760px) — 예전 2열 격자(이웃 글 | 뉴스) 없음 */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-3">
          {/* 동네이야기로 돌아가는 길 — 24px 누름 높이 인라인 링크 */}
          <nav aria-label="브레드크럼" className="t-sub text-text-3">
            <Link href="/town" className="tap-line text-text-2 no-underline">
              동네이야기
            </Link>{" "}
            › 동네 홈
          </nav>

          {/* [v4 · 규칙 1·4] 머리 — 제목 한 줄 + 사실 한 줄 · 오른쪽 알림 + 작은 아웃라인 글쓰기(채움 파랑 없음) */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="t-title text-ink">{region.name} 동네 홈</h1>
              {fact && <p className="mt-0.5 truncate t-sub text-text-3">{fact}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <KeywordAlertButton scope="news" query={region.name} label={`${region.name} 새 소식`} />
              <Link href={writeHref} className="btn-outline btn-sm no-underline">
                글쓰기
              </Link>
            </div>
          </header>

          {/* [v4] 뉴스 — 한지 스트립 → 허브와 같은 1px 선 행 하나(0건이면 없음) */}
          <TownNewsStrip rows={newsRows} title={`${region.name} 뉴스`} href={newsHref} />
        </div>

        {/* 이웃 글 — 사람의 기록. [v4] 1px 선 행: 제목(굵게) + 작성자 · 시각 · 댓글 · 사진 한 줄 */}
        <section aria-labelledby="region-stories-title" className="flex flex-col gap-1">
          <SectionHead
            id="region-stories-title"
            title="이웃 글"
            count={communityPosts.length}
            href="/town?kind=post"
            linkLabel="이야기 피드 보기 ›"
          />
          {postsFailed ? (
            <p className="py-3 t-sub text-text-2">이웃 글을 지금 불러오지 못했어요 — 없다는 뜻은 아니에요</p>
          ) : communityPosts.length === 0 ? (
            /* [v4 · 규칙 8] 빈 상태는 한 줄 + 동사+대상 링크 — 지어낸 글 없음 */
            <p className="py-3 t-sub text-text-3">
              {region.name} 이웃 글 아직 없음 ·{" "}
              <Link href={writeHref} className="tap-line font-bold text-primary no-underline">
                {region.name} 이야기 쓰기 ›
              </Link>
            </p>
          ) : (
            <ul data-tone="hanji" className="divide-y divide-line">
              {communityPosts.map((p) => {
                const photoCount = postAttachments(p).length;
                const meta = [
                  p.authorLabel?.trim() || "이웃",
                  relTime(p.createdAt),
                  `댓글 ${p.commentCount}`,
                  photoCount > 0 ? `사진 ${photoCount}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <SummaryRow
                    key={p.id}
                    label={<span className="block truncate">{p.title}</span>}
                    sub={meta}
                    href={`/town/story/${p.id}`}
                  />
                );
              })}
            </ul>
          )}
        </section>

        {/* 공개 임장노트 — [v4] 카드 격자 → 1px 선 행(제목 + 단지 · 작성자 한 줄). "Lab 데이터"·"직접방문" 배지 없음 */}
        <section aria-labelledby="region-notes-title" className="flex flex-col gap-1">
          <SectionHead
            id="region-notes-title"
            title="공개 임장노트"
            count={notes.length}
            href="/notes"
            linkLabel="전체 보기 ›"
          />
          {notesFailed ? (
            <p className="py-3 t-sub text-text-2">공개 임장노트를 지금 불러오지 못했어요 — 없다는 뜻은 아니에요</p>
          ) : notes.length === 0 ? (
            <p className="py-3 t-sub text-text-3">
              {region.name} 공개 임장노트 아직 없음 ·{" "}
              <Link
                href={`/notes/new?region=${encodeURIComponent(region.name)}`}
                className="tap-line font-bold text-primary no-underline"
              >
                {region.name} 임장노트 쓰기 ›
              </Link>
            </p>
          ) : (
            <ul data-tone="blue" className="divide-y divide-line">
              {notes.map((n) => (
                <SummaryRow
                  key={n.id}
                  label={
                    <span className="block truncate">
                      {feedDisplayTitle(n.title, n.region, { lab: isLabNoteLabel(n.authorLabel) })}
                    </span>
                  }
                  sub={[n.aptName, feedAuthorLabel(n.authorLabel)].filter(Boolean).join(" · ") || undefined}
                  href={`/notes/${n.id}`}
                />
              ))}
            </ul>
          )}
        </section>

        {/* 다른 동네 홈 — [970 · C-17] 시·도별 <details> 로 전량을 접어 두고, 지금 보는 동네의 시·도만 기본 펼침.
            [v4] 카드 → 1px 선 행(허브 TownIndex 와 같은 모양), 동네 이름은 칩이 아니라 글자 링크 */}
        <section aria-labelledby="other-towns-title" className="flex flex-col gap-1">
          <h2 id="other-towns-title" className="t-section text-ink">
            다른 동네 홈
          </h2>
          <div data-tone="hanji" className="flex flex-col divide-y divide-line border-y border-line">
            {groupRegionsByCity(REGION_CATALOG, id).map((g) => (
              <details key={g.key} className="group" open={g.city === ownCity}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
                  <span>
                    {g.city}
                    <span className="ml-1.5 t-caption font-normal text-text-3">{g.items.length}곳</span>
                  </span>
                  <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
                  {g.items.map((r) => (
                    <Link key={r.id} href={`/town/${r.id}`} className="px-1 py-1 t-sub text-text-2 no-underline">
                      {r.name}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* [v4] 맨 끝 — 이 동네의 다른 화면 링크 한 줄 + 출처 캡션 한 줄(예전 시세 카드의 "한국부동산원 월간 통계 —" 문장) */}
        <div className="flex flex-col gap-1">
          <nav aria-label={`${region.name} 더 보기`} className="t-sub text-text-3">
            {region.name} —{" "}
            <Link href={`/region/${id}`} className="tap-line font-bold text-text-2 no-underline">
              시장 데이터 보기
            </Link>
            {" · "}
            <Link
              href={`/map?region=${encodeURIComponent(region.name)}`}
              className="tap-line font-bold text-text-2 no-underline"
            >
              지도에서 보기
            </Link>
          </nav>
          {fact && <p className="t-caption text-text-3">평균 매매가·전세가율 한국부동산원 월간 통계 · 뉴스 매일 아침 8시 수집</p>}
        </div>
      </div>
    </PageShell>
  );
}
