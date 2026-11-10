/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
import Link from "@/app/components/IntentLink";
import {
  buildComplexTxSlug,
  type ComplexSummary,
} from "@/lib/market/complex-transactions";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { formatKrwShort } from "@/lib/market/format";

/* 단지별 실거래 요약 테이블 — /region/[id] · /complex/browse 공용 (서버 컴포넌트).
   국토부 실거래가 기반, 매물 호가 아님. */

/* [967 · 31] 여기 있던 formatKrwShort 사본은 lib/market/format 의 공통 함수로 대체 — 출력 동일 */

/** "202607" → "26.07" */
function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

export function ComplexSummaryTable({
  summaries,
  regionId,
  failed = false,
  ranked = false,
}: {
  /** [1118] 순위 순서(거래 많은 · 평단가 높은)일 때만 1~3번을 강조 — 최신 거래순에서 "1위"는 뜻이 없다 */
  ranked?: boolean;
  summaries: ComplexSummary[];
  regionId: string;
  /**
   * 조회 자체가 실패했는가.
   *
   * 예전에는 "0건"과 "못 읽었다"가 같은 문장("준비 중입니다")으로 나갔다. 앞은
   * 사실이지만 뒤는 거짓이다 — 데이터는 있는데 잠깐 못 읽은 것뿐이기 때문이다.
   * 호출부가 구분해서 넘긴다.
   */
  failed?: boolean;
}) {
  if (failed) {
    return (
      <p className="py-6 text-center t-body leading-[1.7] text-text-3">
단지별 실거래 불러오기 실패 · 잠시 후 다시
      </p>
    );
  }
  if (summaries.length === 0) {
    return (
      <p className="py-6 text-center t-body text-text-3">
        이 지역 단지별 실거래 데이터 준비 중
      </p>
    );
  }
  /* [1118 · 순위 목록] 소유자 2026-11-09 "이 부분도 다른 디자인 — 유사 사이트 참고". 표(가로 스크롤 · min-width 560) → 증권 앱 순위 목록 꼴
     (토스증권 실시간 차트 · 아실 "많이 거래된 아파트" · 호갱노노 단지 목록): 왼쪽 순번 · 단지 이름 + 한 줄 사실 · 오른쪽 큰 가격 + 날짜.
     12개월 거래는 이름 줄 아래 짧은 막대 + 건수(이 목록 안 최댓값 대비). 평단가는 PC 에서 가운데 열, 폰은 사실 줄에. 폰 가로 스크롤 없음. */
  const maxTx = Math.max(...summaries.map((x) => x.txCount12m || 0), 1);
  return (
    <div>
      <div className="hidden grid-cols-[32px_minmax(0,1fr)_120px_150px] gap-x-3 border-b border-divider px-1 pb-2 pt-1 t-caption text-text-3 md:grid" aria-hidden="true">
        <span className="text-center">순</span>
        <span>단지 · 12개월 거래</span>
        <span className="text-right">평균 평단가</span>
        <span className="text-right">최근 실거래가</span>
      </div>
    <ol className="m-0 flex list-none flex-col p-0">
      {summaries.map((s, i) => {
        const href = s.regionName
          ? complexHrefFromNames(s.regionName, s.complexName)
          : `/complex/tx/${buildComplexTxSlug(s.complexName, regionId)}`;
        const pp = s.avgPricePerPyeongKrw !== null ? `${formatKrwShort(s.avgPricePerPyeongKrw)}/평` : null;
        const w = Math.max(4, Math.round(((s.txCount12m || 0) / maxTx) * 100));
        return (
          <li key={s.complexName} className="border-b border-divider last:border-b-0">
            {/* 항목 41 — 정본 URL(/complex/{id}) · region_name 이 비면 실거래 상세(/complex/tx)로 */}
            <Link
              href={href}
              className="press grid min-h-14 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1 py-2.5 no-underline hover:bg-bg md:grid-cols-[32px_minmax(0,1fr)_120px_150px]"
            >
              <span className={`t-section t-num text-center ${ranked && i < 3 ? "text-primary" : "text-text-3"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate t-body font-bold text-ink">{s.complexName}</span>
                <span className="mt-0.5 block truncate t-caption text-text-3">
                  {[s.representativeAreaM2 !== null ? `대표 ${s.representativeAreaM2}㎡` : null, s.buildYear ? `${s.buildYear}년` : null].filter(Boolean).join(" · ")}
                  {/* 폰은 평단가 열이 없어 사실 줄 끝에 */}
                  {pp ? <span className="md:hidden"> · {pp}</span> : null}
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="block h-1 w-16 overflow-hidden rounded-full bg-divider" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
                  </span>
                  <span className="t-caption t-num text-text-3">12개월 {s.txCount12m.toLocaleString("ko-KR")}건</span>
                </span>
              </span>
              <span className="hidden text-right t-sub t-num text-text-2 md:block">{pp ?? "—"}</span>
              <span className="text-right">
                <span className="block t-section t-num text-ink">{formatKrwShort(s.latestAmountKrw)}</span>
                <span className="block t-caption t-num text-text-3">
                  {shortYm(s.latestYm)}
                  {s.latestAreaM2 !== null ? ` · ${s.latestAreaM2.toFixed(0)}㎡` : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
    </div>
  );
}
