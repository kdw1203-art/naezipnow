import { loadGrowthWeekly } from "@/lib/admin/growth-weekly";
import type { GrowthWeeklyData } from "@/lib/growth/channels";
import {
  PLAN_CONVERSION,
  conversionRate,
  conversionStopSignal,
  kstMonthKey,
  monthTarget,
} from "@/lib/growth/channels";

/* [1046 · 성장] 성장 주간표 — 계획 문서 "1년 1만 회원 — 시간 압축 성장 계획"의 '매주 볼 숫자'.
   매주 월요일 이 카드 하나만 본다: 방문자(분모) · 방문 대비 가입(분자) · 첫 관심 등록(유지의 시작) · 가입 채널.
   방문자는 분석 동의 표본이고 관리자 방문은 뺐다. 가입은 계정 기록 전체(관리자 계정 제외). */

function pct(r: number | null): string {
  return r === null ? "—" : `${(r * 100).toFixed(1)}%`;
}

function weekLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}~` : iso;
}

export async function GrowthWeekly() {
  let data: GrowthWeeklyData | null = null;
  try {
    data = await loadGrowthWeekly();
  } catch {
    data = null;
  }
  return <GrowthWeeklyView data={data} month={kstMonthKey()} />;
}

/** 그리기만 — 데이터는 위에서(또는 캡처 대본에서) 넣는다. null 이면 실패 문구 */
export function GrowthWeeklyView({ data, month }: { data: GrowthWeeklyData | null; month: string }) {
  const target = monthTarget(month);

  return (
    <section className="card rounded-2xl p-5" aria-labelledby="growth-weekly-title">
      <h2 id="growth-weekly-title" className="text-[15px] font-bold text-ink">
        성장 주간표{" "}
        <span className="text-[12px] font-medium text-text-3">1년 1만 회원 계획 · 주는 월요일 시작(KST)</span>
      </h2>

      {!data ? (
        <p className="mt-3 text-[13px] text-text-3">성장 주간표 불러오기 실패 · 잠시 후 다시</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[12px] text-text-3">
                이번 달 신규 가입{target !== null ? ` · 목표 ${target.toLocaleString("ko-KR")}명` : ""}
              </div>
              <div className="t-num mt-1 text-[24px] font-bold text-ink">
                {data.monthSignups.toLocaleString("ko-KR")}
                {target !== null && (
                  <span className="ml-2 text-[13px] font-bold text-text-3">/ {target.toLocaleString("ko-KR")}</span>
                )}
              </div>
            </div>
            <div className="text-right text-[12px] text-text-3">
              계획 전환율 {pct(PLAN_CONVERSION)} · 멈출 기준 2주 연속 2% 미만
            </div>
          </div>
          {target !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
              <div
                className={`h-full rounded-full ${data.monthSignups >= target ? "bg-success" : "bg-primary"}`}
                style={{ width: `${Math.min(100, Math.round((data.monthSignups / target) * 100))}%` }}
              />
            </div>
          )}

          {conversionStopSignal(data.weeks) && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger">
              직전 2주 연속 방문 대비 가입 2% 미만 · 계획의 멈출 기준에 닿음 · 그 사이 바꾼 화면부터 되돌림 검토
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">주</th>
                  <th className="py-2 pr-3 text-right font-semibold">방문자</th>
                  <th className="py-2 pr-3 text-right font-semibold">검색 착지</th>
                  <th className="py-2 pr-3 text-right font-semibold">신규 가입</th>
                  <th className="py-2 pr-3 text-right font-semibold">방문 대비 가입</th>
                  <th className="py-2 text-right font-semibold">첫 관심 등록</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.map((w, i) => (
                  <tr key={w.weekStart} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-bold text-ink">
                      {weekLabel(w.weekStart)}
                      {i === 0 && <span className="ml-1.5 t-caption font-medium text-text-3">진행 중</span>}
                    </td>
                    <td className="t-num py-2 pr-3 text-right text-text-1">{w.visitors.toLocaleString("ko-KR")}</td>
                    <td className="t-num py-2 pr-3 text-right text-text-2">{w.searchLandings.toLocaleString("ko-KR")}</td>
                    <td className="t-num py-2 pr-3 text-right font-bold text-ink">{w.signups.toLocaleString("ko-KR")}</td>
                    <td className="t-num py-2 pr-3 text-right text-text-1">{pct(conversionRate(w))}</td>
                    <td className="t-num py-2 text-right text-text-2">{w.newWatchers.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 text-[13px] font-bold text-ink">
            가입 채널 <span className="text-[12px] font-medium text-text-3">최근 28일 · 첫 착지 기준</span>
          </h3>
          {data.channels28d.length === 0 ? (
            <p className="mt-2 text-[13px] text-text-3">최근 28일 가입 없음</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {data.channels28d.map((c) => (
                <li key={c.channel} className="flex items-center justify-between text-[12px]">
                  <span className="text-text-1">{c.channel}</span>
                  <span className="t-num font-bold text-ink">{c.signups.toLocaleString("ko-KR")}명</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] leading-[1.6] text-text-3">
            방문자 · 검색 착지는 분석 동의 표본(관리자 방문 제외). 가입은 계정 기록 전체(관리자 계정 제외). 채널은
            1046 배포 뒤 가입부터 기록 — 그 전 가입과 분석 미동의 가입은 &lsquo;기록 없음&rsquo;.
          </p>
        </>
      )}
    </section>
  );
}
