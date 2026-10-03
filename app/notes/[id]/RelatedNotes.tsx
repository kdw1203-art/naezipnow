/* [1023 · 임장노트] docs/review-1022.md 1장 ① — 같은 단지(aptName 일치)를 앞줄("같은 단지" 캡션), 나머지 지역 일치를 뒤("같은 지역").
   풀·매칭(rankRelatedNotes)·상한은 그대로, 정렬만(lib/notes/related-order). aptName 은 선택 prop — 없으면 풀에서 현재 노트를 찾아 쓴다. */
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";
import { inspectionAverageScore, type PublicNoteCard } from "@/lib/inspection/store-db";
import { listRelatedNotePoolCached, shouldLogNoteTiming } from "@/lib/inspection/note-cache";
import { regionIdForName } from "@/lib/region/catalog";
import { rankRelatedNotes } from "@/lib/notes/region-match";
import { orderRelatedByApt } from "@/lib/notes/related-order";
import { seedGradient } from "@/lib/town/shared";
import { logger } from "@/lib/log";

/* [3차] 같은 지역의 다른 임장노트 — 노트 상세의 이탈 지점을 순환 지점으로.
 * 공개 노트 19건 규모에서는 전량(50) 로드 후 지역 일치 필터가 가장 단순하고
 * 정확하다(전용 쿼리·인덱스는 노트가 수백 건이 될 때 붙인다 — 그때의 일).
 * 지역이 같은 노트가 없으면 최신 공개 노트로 대체하고, 그마저 없으면 섹션을
 * 그리지 않는다. 조회 실패도 섹션 생략(fail-soft — 상세 본문이 우선이다).
 * [967 · 13] "같은 지역" 은 `region ===` 정확 일치가 아니라 lib/notes/region-match 의
 * 관대한 매칭이다 — 같은 동 → 같은 구 → 같은 시 순으로, /notes 의 관심 지역 칩과
 * 같은 잣대. "서울 송파구 가락동" 옆에 "서울 송파구 잠실동" 노트가 나온다. 최대 6건.
 * [969 · 20] 풀은 데이터 캐시(5분, public-notes 태그)의 **카드 컬럼** 50장이다 — 예전엔
 * 요청마다 전체 행(jsonb 5개 포함) 50건을 실조회했고, 이 조회는 Suspense 경계가 없어
 * 공개 노트 상세의 TTFB 에 그대로 얹혔다. 매칭·정렬(rankRelatedNotes)은 그대로다.
 * [1015 · 규칙 H] 행마다 44px 정사각 썸네일 — 주소는 PublicNoteCard.cover(lib/inspection/store-db 가 resolveNoteCover 로 계산).
 * PublicNoteCard 에 metadata·photos 가 실리기 전까지는 null → 단색 칸(seedGradient) — 통합자가
 * listPublicNoteCards 의 select 에 커버 재료를 더하면 그대로 썸네일이 뜬다(보고서). */

const RELATED_CAP = 6;

export async function RelatedNotes({
  currentId,
  region,
  aptName,
}: {
  currentId: string;
  region: string;
  /** [1023] 현재 노트의 단지명 — 같은 단지를 앞줄로. 생략하면 풀에서 현재 노트의 aptName 을 찾는다 */
  aptName?: string | null;
}) {
  let notes: PublicNoteCard[] = [];
  const t0 = Date.now();
  try {
    notes = await listRelatedNotePoolCached();
  } catch (e) {
    logger.error("[related-notes]", e);
    return null;
  }
  if (shouldLogNoteTiming()) {
    console.info(`[note-timing] related pool=${Date.now() - t0}ms rows=${notes.length}`);
  }
  const regionTrim = region.trim();
  const sameRegion = regionTrim
    ? rankRelatedNotes(notes, { id: currentId, region: regionTrim }, RELATED_CAP)
    : [];
  const pool =
    sameRegion.length > 0
      ? sameRegion
      : notes.filter((n) => n.id !== currentId).slice(0, RELATED_CAP);
  if (pool.length === 0) return null;

  const regionId = regionIdForName(regionTrim);
  const sameRegionMode = sameRegion.length > 0;
  /* [1023] 같은 단지 앞줄 — 캡션은 같은 단지가 한 건이라도 있을 때만(전부 지역 일치면 머리("N의 다른 임장노트")가 이미 말한다) */
  const currentApt = aptName ?? notes.find((n) => n.id === currentId)?.aptName ?? null;
  const ordered = orderRelatedByApt(pool, currentApt);
  const showTier = sameRegionMode && ordered.some((o) => o.tier === "apt");

  return (
    <section className="mt-6 max-md:mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-section text-ink">
          {sameRegionMode ? `${regionTrim}의 다른 임장노트` : "최근 공개 임장노트"}
        </h2>
        {regionId && (
          <Link
            href={`/region/${regionId}`}
            className="inline-flex items-center gap-1 t-sub font-bold text-primary no-underline"
          >
            <Icon name="pin" size={13} />
            {regionTrim} 시장 데이터 ›
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ordered.map(({ note: n, tier }) => {
          const rating = inspectionAverageScore(n.scores);
          const cover = n.cover ?? null;
          return (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="card flex items-center gap-3 rounded-xl p-3 no-underline tap-ripple"
            >
              {/* 정사각 썸네일 44px — 템플릿 썸네일은 글자가 그림 안에 있으니 겹쳐 적지 않는다(제목은 옆 칸) */}
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-divider">
                <CoverImage
                  src={cover}
                  alt=""
                  sizes="44px"
                  imgClassName="h-full w-full object-cover"
                  fallback={
                    <span
                      aria-hidden="true"
                      className="block h-full w-full"
                      style={{ background: seedGradient(n.id) }}
                    />
                  }
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  {showTier && (
                    <span className={`shrink-0 rounded px-1.5 py-px t-caption font-bold ${tier === "apt" ? "bg-primary-soft text-primary" : "border border-line text-text-3"}`}>
                      {tier === "apt" ? "같은 단지" : "같은 지역"}
                    </span>
                  )}
                  <span className="line-clamp-1 t-body font-bold text-ink">{n.title}</span>
                </span>
                <span className="flex items-center gap-2 t-sub text-text-3">
                  <span className="truncate">
                    {n.region || "전국"}
                    {n.aptName?.trim() ? ` · ${n.aptName.trim()}` : ""}
                  </span>
                  {rating > 0 && (
                    <span role="img" aria-label={`항목 평점 ${rating.toFixed(1)}`} className="shrink-0 font-bold text-ink">★ {rating.toFixed(1)}</span>
                  )}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
