import Link from "@/app/components/IntentLink";
import { getComplexById, getComplexDeals, listComplexesInDistrict } from "@/lib/complex/complex-store";
import { getEngagementMap } from "@/lib/listings/engagement";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { changeParts, visitChange, type VisitedComplex } from "@/lib/me/visit-changes";
import { logger } from "@/lib/log";

/* [1163] 다녀온 단지의 변동 — 방문 뒤 실거래 · 관심도(조회 · 관심 담은 수) · 같은 구 다른 단지. 서버 조각(이력 화면 안 Suspense).
   단지 하나를 못 읽으면 그 카드만 "불러오기 실패"로 그린다. 숫자는 전부 저장된 자료 그대로. */
export async function VisitedChanges({ visited }: { visited: VisitedComplex[] }) {
  if (visited.length === 0) return null;
  const ids = visited.map((v) => v.complexId);
  const [engagement, cards] = await Promise.all([
    getEngagementMap(ids).catch((e) => {
      logger.error("[my/history] 관심도 조회 실패", e);
      return null;
    }),
    Promise.all(
      visited.map(async (v) => {
        try {
          const [row, deals] = await Promise.all([getComplexById(v.complexId), getComplexDeals(v.complexId)]);
          const peers = row?.district ? (await listComplexesInDistrict(row.district, 6)).filter((p) => p.id !== v.complexId && p.name !== row.name).slice(0, 3) : [];
          return { v, ok: true as const, change: visitChange(deals, v.visitYmd), district: row?.district ?? null, peers: peers.map((p) => ({ id: p.id, name: p.name })) };
        } catch (e) {
          logger.error("[my/history] 단지 변동 조회 실패", e);
          return { v, ok: false as const };
        }
      }),
    ),
  ]);

  return (
    <section aria-labelledby="visited-h" className="flex flex-col gap-2">
      <h2 id="visited-h" className="m-0 px-1 t-section text-ink">
        다녀온 단지 변동
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {cards.map((c) => {
          const eg = engagement?.get(c.v.complexId) ?? null;
          return (
            <li key={c.v.complexId} className="card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={complexHrefFromId(c.v.complexId)} className="t-body font-bold text-ink no-underline">
                  {c.v.name}
                </Link>
                <span className="t-caption text-text-3 t-num">
                  마지막 방문 {c.v.visitYmd.slice(2).replace(/-/g, ".")} · {c.v.rounds}회
                </span>
              </div>
              {c.ok ? (
                <>
                  {(() => {
                    const part = changeParts(c.change);
                    return (
                      <p className="m-0 flex flex-wrap items-center gap-2 t-body font-bold text-ink t-num">
                        {part.text}
                        {part.delta && (
                          <span className={`rounded-full px-2 py-0.5 t-caption font-bold ${part.delta.dir === "up" ? "bg-up-soft text-up" : part.delta.dir === "down" ? "bg-down-soft text-down" : "bg-bg text-text-3"}`}>
                            {part.delta.label}
                          </span>
                        )}
                      </p>
                    );
                  })()}
                  {eg && (eg.viewCount > 0 || eg.bookmarkCount > 0) && (
                    <p className="m-0 t-caption text-text-3 t-num">
                      관심도
                      {eg.viewCount > 0 ? ` · 조회 ${eg.viewCount.toLocaleString("ko-KR")}회` : ""}
                      {eg.bookmarkCount > 0 ? ` · 관심 담은 사람 ${eg.bookmarkCount.toLocaleString("ko-KR")}명` : ""}
                    </p>
                  )}
                  {c.peers.length > 0 && (
                    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 t-caption text-text-3">
                      <span>{c.district} 거래 많은 단지</span>
                      {c.peers.map((p) => (
                        <Link key={p.id} href={complexHrefFromId(p.id)} className="tap-line font-bold text-primary">
                          {p.name}
                        </Link>
                      ))}
                    </p>
                  )}
                </>
              ) : (
                <p className="m-0 t-sub text-text-3">단지 변동 불러오기 실패 · 잠시 후 다시</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`/notes/${c.v.noteId}`} className="tap-line t-sub font-bold text-primary">
                  마지막 노트 ›
                </Link>
                <Link href={`/notes/new?complexId=${encodeURIComponent(c.v.complexId)}&apt=${encodeURIComponent(c.v.name)}`} className="tap-line t-sub font-bold text-primary">
                  다음 회차 쓰기 ›
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default VisitedChanges;
