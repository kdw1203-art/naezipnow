/* [1024 · 단지 상세] 관리비 카드 — K-apt 공동주택 관리비(complex_mgmt_fee 최근 12개월). 시안 mock1024/complex-d.
   getComplexMgmtFeeSummary 가 null(표 없음·조회 실패·0행)이면 **카드 자체를 그리지 않는다** — 지어내지 않는다.
   kapt 코드가 없는 단지(대장 매칭 없음)도 없다. 서버 비동기 조각 — 3초 섹션 예산(withSectionBudget). */
import { Fineprint } from "@/app/components/Fineprint";
import { getComplexMgmtFeeSummary, type ComplexMgmtFeeSummary } from "@/lib/complex/mgmt-fee";
import { withSectionBudget } from "./section-loaders";

const won = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString("ko-KR")}원`);

function ymDot(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

export function MgmtFeeView({ s }: { s: ComplexMgmtFeeSummary }) {
  if (!s.latest) return null;
  const yoy = s.yoyPct == null ? "—" : `${s.yoyPct > 0 ? "+" : ""}${s.yoyPct.toLocaleString("ko-KR")}%`;
  const yoyTone = s.yoyPct == null ? "text-ink" : s.yoyPct > 0 ? "text-up" : s.yoyPct < 0 ? "text-down" : "text-ink";
  return (
    <section aria-labelledby="mgmt-fee-title" className="card rise-in-1 mt-3 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mgmt-fee-title" className="t-section text-ink">
          관리비
        </h2>
        <span className="t-caption text-text-3">K-apt 공동주택 관리비 · {ymDot(s.latest.ym)} 기준</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-caption text-text-3">월 평균 · ㎡당</span>
          <span className="truncate t-section t-num text-ink">{won(s.avgPerM2Krw)}</span>
          <span className="t-caption text-text-3">최근 {s.months}개월{s.avgPerM2Krw == null ? " · 부과면적 미확인" : ""}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-caption text-text-3">월 평균 · 단지 총액</span>
          <span className="truncate t-section t-num text-ink">{won(s.avgTotalKrw)}</span>
          <span className="t-caption text-text-3">최근 {s.months}개월</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-caption text-text-3">전년 대비</span>
          <span className={`truncate t-section t-num ${yoyTone}`}>{yoy}</span>
          <span className="t-caption text-text-3">{s.yoyBaseYm ? `같은 달(${ymDot(s.yoyBaseYm)}) 총액 기준` : "전년 같은 달 자료 없음"}</span>
        </div>
      </div>
      {/* [1036 · 밀도] 내역·출처 줄은 접힘 */}
      <Fineprint className="mt-1.5" label="내역 · 출처">
        공동관리비 {won(s.latest.commonKrw)} · 개별사용료 {won(s.latest.individualKrw)} · 총액 {won(s.latest.totalKrw)} ({ymDot(s.latest.ym)}) · 출처 공동주택관리정보시스템(K-apt)
      </Fineprint>
    </section>
  );
}

export async function MgmtFeeCard({ kaptCode }: { kaptCode: string | null }) {
  if (!kaptCode) return null;
  let s: ComplexMgmtFeeSummary | null = null;
  try {
    s = await withSectionBudget(getComplexMgmtFeeSummary(kaptCode));
  } catch {
    return null;
  }
  if (!s) return null;
  return <MgmtFeeView s={s} />;
}

export default MgmtFeeCard;
