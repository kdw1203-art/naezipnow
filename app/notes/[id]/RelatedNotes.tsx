import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { inspectionAverageScore, type PublicNoteCard } from "@/lib/inspection/store-db";
import { listRelatedNotePoolCached, shouldLogNoteTiming } from "@/lib/inspection/note-cache";
import { regionIdForName } from "@/lib/region/catalog";
import { rankRelatedNotes } from "@/lib/notes/region-match";
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
 * 공개 노트 상세의 TTFB 에 그대로 얹혔다. 매칭·정렬(rankRelatedNotes)은 그대로다. */

const RELATED_CAP = 6;

export async function RelatedNotes({
  currentId,
  region,
}: {
  currentId: string;
  region: string;
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

  return (
    <section className="mt-6">
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
            {regionTrim} 시장 데이터 보기 ›
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pool.map((n) => {
          const rating = inspectionAverageScore(n.scores);
          return (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="card flex flex-col gap-1 rounded-xl p-3.5 no-underline tap-ripple"
            >
              <span className="line-clamp-1 t-body font-bold text-ink">{n.title}</span>
              <span className="flex items-center gap-2 t-sub text-text-3">
                <span>{n.region || "전국"}</span>
                {n.aptName?.trim() && <span>· {n.aptName.trim()}</span>}
                {rating > 0 && (
                  <span className="font-bold text-ink">★ {rating.toFixed(1)}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
