/* [1028] 비고에 직거래·등기 배지(국토교통부 거래유형·등기일자 — 2026년 계약분부터 원문에 있다). 직거래는 당사자끼리 맺은
   계약이라 값이 주변 거래와 크게 다를 수 있다 — 표가 그 사실을 적는다(가격은 그대로 둔다).
   폰(390px): 배지 둘이 한 줄에 서면 오른쪽 끝이 표 밖으로 잘렸다(표 최소 폭 360 > 보이는 폭 349). 최소 폭을 낮추고
   배지 안쪽 여백을 폰에서 줄였다. 그래도 모자라면(360px 폰 · 배지 셋) 비고 칸 안에서 줄을 바꾼다 — 잘리지 않는다.
   [1024 · 단지 상세] 최근 실거래 표 — 계약일·타입·층·가격·비고(신고가 배지 · 해제 취소선). 시안 mock1024/complex-d.
   서버 조각. 행 재료는 complex-v2-model.recentDealRows(타입별 신고가 = tx-extremes, 한 건뿐인 타입은 배지 없음).
   해제 신고 행은 취소선 + "해제" 배지 규칙만 둔다 — getComplexDeals 는 해제분(is_cancelled)을 읽지 않아 지금은 오지 않는다.
   면적은 ㎡ 로 그리고 붙은 뒤 설정(평)이면 바뀐다(AreaTextLazy). */
import Link from "next/link";
import { formatEokMan } from "@/lib/format/eok-man";
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";
import { AreaTextLazy as AreaText } from "./AreaTextLazy";
import type { RecentDealRow } from "./complex-v2-model";

export function RecentDealsTable({
  rows,
  total,
  allHref,
  failed = false,
}: {
  rows: readonly RecentDealRow[];
  /** 기간 안 매매 건수(해제 제외) — 모르면 null */
  total: number | null;
  /** "전체 N건 ›" 목적지(실거래 탭) */
  allHref: string;
  /** 실거래 조회 실패 — "없음"과 다른 문장 */
  failed?: boolean;
}) {
  return (
    <section aria-labelledby="recent-deals-title" className="card rise-in-1 mt-3 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-deals-title" className="t-section text-ink">
          최근 실거래
        </h2>
        <span className="t-caption text-text-3 tabular-nums">
          매매 · 전체 타입 · 해제 제외{total != null ? ` ${total.toLocaleString("ko-KR")}건` : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-lg bg-bg px-3 py-4 text-center t-body text-text-3">
          {failed ? "실거래를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "아직 신고된 매매 실거래 없음"}
        </p>
      ) : (
        <div className="-mx-1 mt-2 overflow-x-auto px-1">
          <table className="w-full min-w-[300px] border-collapse t-body">
            <thead>
              <tr className="text-left t-caption text-text-3">
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">계약일</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">타입</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">층</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 text-right font-semibold">가격</th>
                <th scope="col" className="border-b border-line py-1.5 font-semibold">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const muted = r.cancelled ? "text-text-3" : "text-text-1";
                return (
                  <tr key={`${r.ym}-${r.day ?? 0}-${r.man}-${r.typeM2 ?? 0}-${r.floor ?? 0}-${i}`} className="border-b border-divider last:border-0">
                    <td className={`whitespace-nowrap py-2 pr-2 tabular-nums ${muted}`}>{dealDateLabel(r.ym, r.day)}</td>
                    <td className={`whitespace-nowrap py-2 pr-2 tabular-nums ${muted}`}>
                      {r.typeM2 != null ? <AreaText unitM2={r.typeM2} /> : "—"}
                    </td>
                    <td className={`whitespace-nowrap py-2 pr-2 tabular-nums ${muted}`}>{floorLabel(r.floor)}</td>
                    <td
                      className={`whitespace-nowrap py-2 pr-2 text-right tabular-nums ${
                        r.cancelled ? "text-text-3 line-through" : "t-num text-ink"
                      }`}
                    >
                      {formatEokMan(r.man)}
                    </td>
                    <td className="py-2">
                      {/* [1028] 비고 — 해제 · 신고가 · 직거래 · 등기(국토교통부 실거래 공개 항목). 배지는 사실 명사만(규칙 9) */}
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.cancelled ? (
                          <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-bg px-1.5 py-px t-caption font-bold text-text-3 max-md:px-1">해제</span>
                        ) : r.high ? (
                          <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-up-soft px-1.5 py-px t-caption font-bold text-up max-md:px-1">신고가</span>
                        ) : null}
                        {r.direct && (
                          <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-bg px-1.5 py-px t-caption font-bold text-text-2 max-md:px-1">직거래</span>
                        )}
                        {r.rgst && (
                          <span
                            title={`등기 ${r.rgst}`}
                            className="inline-flex items-center whitespace-nowrap rounded-sm border border-line px-1.5 py-px t-caption font-bold text-text-2 max-md:px-1"
                          >
                            등기
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Link href={allHref} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary">
            전체{total != null ? ` ${total.toLocaleString("ko-KR")}건` : ""} ›
          </Link>
          <span className="t-caption text-text-3">국토교통부 실거래가 · 신고가 = 타입별 기간 내 최고가 · 직거래·등기는 2026년 계약분부터 표시</span>
        </div>
      )}
    </section>
  );
}

export default RecentDealsTable;
