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
import { listPublicNotes, type InspectionNote } from "@/lib/inspection/store-db";
import { noteCoverUrl } from "@/lib/notes/cover/resolve";
import { maskNoteAuthor, seedGradient } from "@/lib/town/shared";
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
import { Icon } from "@/app/components/Icon";
import { TownNewsStrip } from "../TownNewsStrip";
import { AdZone } from "@/app/components/ads/AdZone";

/* ============================================================
   [#64] 동네 홈 — /town/{regionId}
   /town?region= 쿼리 필터를 "우리 동네 상주 공간"으로 승격한 정식 페이지.
   그 지역의 이웃 글 · 자동수집 뉴스 · 시세 요약 · 공개 임장노트 · 키워드 알림을
   한 화면에 모으고, 시장 데이터 페이지(/region/[id])와 상호 링크한다.

   구분: /region/[id] = 시장 데이터(숫자), /town/[id] = 동네 생활(글·뉴스).
   [1006] 사람 기록(이웃 글 · 임장노트)과 "이 동네 뉴스"는 **시각적으로 다른 블록**이다 —
   이웃 글은 작성자 머리글자가 앞에 오는 이야기 카드(.story-*), 뉴스는 한지 면 스트립
   (.news-strip, 출처·시각)으로 뉴스룸을 가리킨다. 이웃 글 상세는 /town/story/[id].
   generateStaticParams + dynamicParams=false — 카탈로그 62곳만 존재한다
   (임의 문자열은 빌드 매니페스트 밖이라 미들웨어 전에 정적 404 — soft-404 없음).
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
  if (!region) return { title: "동네를 찾을 수 없습니다 | 내집나우" };
  /* [970 · C-25] 접미 없던 제목에 `| 내집나우`(폴백 제목과 동일 접미) */
  const title = `${region.name} 동네 홈 · 이웃 글 · 뉴스 · 시장 요약 | 내집나우`;
  const description = `${region.name} 이웃 글과 공개 임장노트, 오늘의 ${region.name} 부동산 뉴스, 아파트 시장 요약. 키워드 알림 지원.`;
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

function noteMatchesRegion(n: InspectionNote, nameKey: string): boolean {
  const k = normalizeRegionKey(n.region ?? "");
  return Boolean(k && (k.includes(nameKey) || nameKey.includes(k)));
}

/** [967 · 32] 지역 홈 카드의 상대시각 — 시간 단위("방금"·N시간 전·N일 전(30일)·UTC "08.19").
 *  분 표기가 없고 "방금" 인 기존 얼굴을 그대로 옵션으로 넘긴다. 본체는 lib/format/relative-time.ts */
function relTime(iso: string): string {
  return relativeTimeLabel(iso, Date.now(), { unit: "hour", justNow: "방금", maxDays: 30, fallback: "md-utc" });
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
  /* [1015] listPublicNoteCards → listPublicNotes: 노트 행의 썸네일(noteCoverUrl — metadata.cover·photos 를 읽는다)을
     그리려면 카드 전용 컬럼만으로는 부족하다(브리프 규칙 H). 공개 노트는 34편 남짓이고 이 화면은 7일 ISR 이라
     무게는 감당된다(프로필 /u/[handle] 과 같은 호출). */
  const [postsR, notesR, snapR] = await Promise.allSettled([
    readTownPosts(),
    listPublicNotes(100),
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
  /* [1006] 이 동네 뉴스 — 뉴스룸과 같은 조립기(같은 사건 접기·요약·출처)로 행을 만든다 */
  const newsRows = buildNewsRows(regionPosts.filter((p) => p.isAutomated)).slice(0, 6);
  const notes: InspectionNote[] =
    notesR.status === "fulfilled"
      ? notesR.value.filter((n) => noteMatchesRegion(n, nameKey)).slice(0, 6)
      : [];
  const snapshot: RegionMarketSnapshot | null =
    snapR.status === "fulfilled" ? snapR.value : null;
  const postsFailed = postsR.status === "rejected";
  /* [970 · C-17] "다른 동네" 접기에서 기본으로 펼칠 시·도 = 지금 보는 동네의 시·도 */
  const ownCity = cityOfRegion(id);

  return (
    <PageShell wide>
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

      {/* 헤더 — 동네 이름 + 행동 */}
      <div className="rise-in mb-4 flex flex-wrap items-end justify-between gap-3 max-md:mb-3">
        <div>
          <div className="t-sub font-bold text-text-3">
            <Link href="/town" className="inline-block py-[5px] hover:underline">
              동네이야기
            </Link>{" "}
            › 동네 홈
          </div>
          <h1 className="mt-0.5 t-title tracking-tight text-ink">
            {region.name} 동네 홈
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <KeywordAlertButton scope="news" query={region.name} label={`${region.name} 새 소식`} />
          <Link
            href={`/town/write?region=${encodeURIComponent(region.name)}`}
            className="btn-primary btn-cta px-4 py-[9px] t-body"
          >
            이 동네 이야기 쓰기
          </Link>
        </div>
      </div>

      {/* 시세 요약 스트립 — /region 페이지의 축약판 + 상호 링크 */}
      {snapshot && (
        <Link
          href={`/region/${id}`}
          className="rise-in-1 card tile mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 no-underline max-md:mb-3 max-md:px-3.5 max-md:py-3"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {snapshot.avgSale && snapshot.avgSale > 0 && (
              <div>
                <div className="t-caption text-text-3">평균 매매가</div>
                <div className="t-section text-ink tabular-nums">
                  {formatKrwShort(snapshot.avgSale)}
                </div>
              </div>
            )}
            {snapshot.jeonseRatio !== undefined && Number.isFinite(snapshot.jeonseRatio) && (
              <div>
                <div className="t-caption text-text-3">전세가율</div>
                <div className="t-section text-ink tabular-nums">
                  {snapshot.jeonseRatio.toFixed(1)}%
                </div>
              </div>
            )}
            <div className="t-sub text-text-3">지수 추이 · 실거래 · 입주 물량</div>
          </div>
          <span className="shrink-0 t-body font-bold text-primary">시장 데이터 →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 max-md:gap-3 lg:grid-cols-2">
        {/* 이웃 글 — 사람의 기록. 이야기 카드 규칙(.story-*): 작성자가 먼저, 그다음 제목·댓글·사진
            [1015] 제목 옆 "사람의 기록"·"뉴스룸" 부연 라벨을 걷었다(소유자 지시 4 · 브리프 규칙 C). 행 목록은
            리퀴드 판 hanji(사람이 쓴 글). 행 메타는 당근 동네 글 카드 순서(작성자 · N시간 전 · 공감 · 댓글 · 사진). */}
        <section className="rise-in-1" aria-labelledby="region-stories-title">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 id="region-stories-title" className="t-section text-ink">
              이웃 글
            </h2>
            <Link href="/town?kind=post" className="inline-block py-[5px] t-sub font-bold text-primary">
              이야기 피드 ›
            </Link>
          </div>
          {postsFailed ? (
            <div className="card rounded-2xl px-5 py-6 t-body text-text-2 max-md:px-3.5 max-md:py-4">
              글을 지금 불러오지 못했어요. 잠시 후 다시 열어봐 주세요.
            </div>
          ) : communityPosts.length === 0 ? (
            <div className="story-card flex flex-col items-start gap-2 px-5 py-6 max-md:px-3.5 max-md:py-4">
              {/* [970 · C-20] 해요체 통일 · [1006] 0건은 0건이라고 — 지어낸 글 없음 · [1015] 한 줄로 */}
              <p className="t-body text-text-2">아직 {region.name} 이웃 글이 없어요.</p>
              <Link
                href={`/town/write?region=${encodeURIComponent(region.name)}`}
                className="btn-soft rounded-lg px-3.5 py-2 t-sub font-bold"
              >
                첫 이야기 쓰기 ›
              </Link>
            </div>
          ) : (
            <div>
              <ul className="lq-panel flex flex-col" data-tone="hanji">
                {communityPosts.map((p) => {
                  const author = p.authorLabel?.trim() || "이웃";
                  const photoCount = postAttachments(p).length;
                  return (
                    <li key={p.id} className="border-b last:border-0">
                      <Link
                        href={`/town/story/${p.id}`}
                        className="flex items-center gap-3 py-3 no-underline transition-colors"
                      >
                        <span className="story-avatar" aria-hidden="true">
                          {author.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate t-body font-bold text-ink">{p.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 t-sub text-text-3">
                            <span className="font-bold text-text-2">{author}</span>
                            <span>{relTime(p.createdAt)}</span>
                            {p.likeCount > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="heart" size={11} />
                                공감 {p.likeCount}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Icon name="messages-square" size={11} />
                              댓글 {p.commentCount}
                            </span>
                            {photoCount > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="camera" size={11} />
                                사진 {photoCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 t-body font-bold text-text-3">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* 이 동네 뉴스 — 다른 재질(뉴스룸 스트립). 출처·시각이 앞에 서고 뉴스룸으로 보낸다 */}
        <section className="rise-in-2" aria-labelledby="region-news-title">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 id="region-news-title" className="t-section text-ink">
              {region.name} 뉴스
            </h2>
            <Link
              href={`/town/news?region=${encodeURIComponent(region.name)}`}
              className="inline-block py-[5px] t-sub font-bold text-primary"
            >
              뉴스룸 ›
            </Link>
          </div>
          {newsRows.length === 0 ? (
            /* [1015] 한지 면(.news-strip) → 흰 카드 + 1px 선(브리프 규칙 C) · 빈 화면은 한 줄 */
            <div className="card rounded-2xl px-5 py-6 t-body text-text-2 max-md:px-3.5 max-md:py-4">
              최근 수집된 {region.name} 기사가 없어요.
            </div>
          ) : (
            <TownNewsStrip
              rows={newsRows}
              title={`${region.name} 뉴스`}
              href={`/town/news?region=${encodeURIComponent(region.name)}`}
              max={6}
              showHeader={false}
            />
          )}
        </section>
      </div>

      {/* 공개 임장노트
          [1015] 카드 왼쪽에 44px 정사각 썸네일(noteCoverUrl — 템플릿/첫 사진, 없으면 단색 칸)을 붙였다(브리프 규칙 H).
          정사각 자리라 wide 판은 필요 없다. "Lab 데이터"·"직접방문" 배지는 걷고 작성자 이름을 메타 줄에 둔다(규칙 C). */}
      <section className="rise-in-3 mt-6 max-md:mt-3">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="t-section text-ink">
            {region.name} 공개 임장노트{" "}
            {notes.length > 0 && (
              <span className="t-sub font-medium text-text-3">{notes.length}편</span>
            )}
          </h2>
          <Link href="/notes" className="inline-block py-[5px] t-sub font-bold text-primary">
            임장노트 홈 ›
          </Link>
        </div>
        {notes.length === 0 ? (
          <div className="card flex flex-col items-start gap-2 rounded-2xl px-5 py-6 max-md:px-3.5 max-md:py-4">
            {/* [970 · C-20] 해요체 통일 · [1015] 한 줄로 */}
            <p className="t-body text-text-2">아직 {region.name} 공개 임장노트가 없어요.</p>
            <Link
              href={`/notes/new?region=${encodeURIComponent(region.name)}`}
              className="btn-soft rounded-lg px-3.5 py-2 t-sub font-bold"
            >
              {region.name} 임장노트 쓰기 ›
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {notes.map((n) => {
              const cover = noteCoverUrl(n);
              return (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="card tile flex items-start gap-3 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3"
                >
                  <span
                    className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg"
                    style={{ background: seedGradient(n.region || n.id) }}
                    aria-hidden="true"
                  >
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate t-body font-bold text-ink">{n.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 t-sub text-text-3">
                      {n.aptName && <span className="truncate">{n.aptName}</span>}
                      <span className="shrink-0">{maskNoteAuthor(n.authorLabel, n.authorEmail)}</span>
                    </span>
                    {n.summary && (
                      <span className="mt-1 block line-clamp-2 t-sub text-text-2">{n.summary}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 다른 동네 + 지도 — [970 · C-17] 예전엔 카탈로그 앞 16곳(서울 위주)만 보였다.
          시·도별 <details> 로 전량을 접어 두고, 지금 보는 동네의 시·도만 기본 펼침. */}
      <section className="rise-in-4 mt-8 max-md:mt-4" aria-labelledby="other-towns-title">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 id="other-towns-title" className="t-body font-bold text-ink">
            다른 동네 홈
          </h2>
          <Link
            href={`/map?region=${encodeURIComponent(region.name)}`}
            className="inline-block py-[5px] t-sub font-bold text-primary"
          >
            지도에서 {region.name} 보기 ›
          </Link>
        </div>
        <div className="card flex flex-col divide-y divide-line rounded-2xl px-4">
          {groupRegionsByCity(REGION_CATALOG, id).map((g) => (
            <details key={g.key} className="group py-2.5" open={g.city === ownCity}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 t-body font-bold text-ink">
                <span>
                  {g.city}
                  <span className="ml-1.5 t-caption font-semibold text-text-3">{g.items.length}곳</span>
                </span>
                <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="flex flex-wrap gap-1.5 pb-1.5 pt-1">
                {g.items.map((r) => (
                  <Link
                    key={r.id}
                    href={`/town/${r.id}`}
                    className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
                  >
                    {r.name}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* [1015] 광고 — 페이지 끝 1곳(브리프 규칙 G: 첫 화면 밖). 이 화면에 광고 자리가 없었다.
          ISR 7일 페이지라 plan={null} + AdFreeGate(클라이언트)가 유료 플랜을 가린다. */}
      <AdZone placement="page_bottom" seed={0} plan={null} className="mt-6 max-md:mt-4" />
    </PageShell>
  );
}
