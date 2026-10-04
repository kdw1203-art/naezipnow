import { logger } from "@/lib/log";
import { listUpisAnnouncements, listUpisForZone } from "@/lib/seoul/upis-store";
import { UPIS_SOURCE_URL, upisAreaLabel, upisDateLabel, upisKind, type UpisRecord } from "@/lib/seoul/upis";

/* [1029] 구역 상세의 "도시계획 결정 이력" — 서울 UPIS 정비사업 조서에서 구역 이름이 들어간 행(같은 구). 서울 밖 구역이거나
   맞는 조서가 없으면 칸을 내지 않는다(없다고도 말하지 않는다 — 이름 표기가 달라 못 찾은 것일 수 있다). 결정고시가 있으면
   고시번호·고시일자를 함께 적는다(그게 공식 날짜). 실패는 실패라고 적는다. */

export async function ZoneDecisionHistory({ name, sido, sigungu }: { name: string; sido: string; sigungu: string }) {
  if (!/^서울/.test(sido)) return null;
  let rows: UpisRecord[];
  try {
    rows = await listUpisForZone(name, sigungu, 12);
  } catch (e) {
    logger.error("[/redevelopment/[id]] 결정 이력 조회 실패", e);
    return (
      <section className="rise-in-1 card p-[var(--pad-card)]">
        <h2 className="t-section text-ink">도시계획 결정 이력</h2>
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 t-sub text-ink">결정 이력 불러오기 실패 · 잠시 후 다시</p>
      </section>
    );
  }
  if (rows.length === 0) return null;
  const ann = await listUpisAnnouncements(rows.map((r) => r.dcsnAncmntMngCd ?? "").filter(Boolean));

  return (
    <section className="rise-in-1 card p-[var(--pad-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="t-section text-ink">도시계획 결정 이력</h2>
        <span className="t-caption text-text-3 tabular-nums">서울시 조서 {rows.length}건 · 최근 순</span>
      </div>
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {rows.map((r) => {
          const a = r.dcsnAncmntMngCd ? ann.get(r.dcsnAncmntMngCd) : undefined;
          const date = a?.ancmntYmd ?? r.codeDate;
          return (
            <li key={r.rptMngCd} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <span className="w-[78px] shrink-0 tabular-nums t-sub text-text-2">{upisDateLabel(date)}</span>
              <span className="min-w-0 flex-1">
                <span className="t-sub font-bold text-ink">{r.rgnNm ?? "—"}</span>
                <span className="t-sub text-text-2">
                  {" "}
                  · {r.rptType ?? "—"} · {upisKind(r)} · {upisAreaLabel(r)}
                </span>
                {a?.ancmntNo ? (
                  <span className="block t-caption text-text-3">
                    {a.ancmntInst ? `${a.ancmntInst} ` : ""}
                    {a.ancmntNo}
                    {a.ttl ? ` · ${a.ttl}` : ""}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 t-caption text-text-3">
        출처{" "}
        <a href={UPIS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center font-bold text-primary">
          서울 열린데이터광장 · 도시계획 결정 조서
        </a>{" "}
        · 원문 그대로 · 참고용(법적 효력 없음) · 이름이 같은 다른 구역이 섞일 수 있음
      </p>
    </section>
  );
}
