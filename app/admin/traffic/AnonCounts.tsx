import { loadAnonCounts } from "@/lib/admin/anon-counts";
import { deviceLabel, type CountSummary } from "@/lib/metrics/page-count";

/* [1053 · 방문 집계] 전체 방문 수 — 동의와 무관한 익명 하루 수(page_view_daily_agg).
   아래 카드들(방문자 · 체류 · 유입)은 분석 동의 표본이라 방문의 일부만 보였다(운영 실측 약 7%).
   이 카드는 화면이 열린 "수"만 센다 — 사람 수가 아니다(같은 사람이 두 번 열면 2). 로봇 · 관리 화면 · 점검 로봇은 뺐다. */

function fmtDay(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${Number(m[1])}/${Number(m[2])}` : day;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

export async function AnonCounts() {
  let data: CountSummary | null = null;
  try {
    data = await loadAnonCounts();
  } catch {
    data = null;
  }
  return <AnonCountsView data={data} />;
}

/** 그리기만 — 데이터는 위에서(또는 캡처 대본에서) 넣는다. null 이면 실패 문구 */
export function AnonCountsView({ data }: { data: CountSummary | null }) {
  const max = data ? Math.max(1, ...data.days.map((d) => d.n)) : 1;
  const delta = data && data.prev7 > 0 ? Math.round(((data.last7 - data.prev7) / data.prev7) * 100) : null;
  return (
    <section className="card rounded-2xl p-5" aria-labelledby="anon-counts-title">
      <h2 id="anon-counts-title" className="text-[15px] font-bold text-ink">
        전체 화면 열림 수{" "}
        <span className="text-[12px] font-medium text-text-3">동의와 무관한 익명 수 · 사람 수 아님 · 한국 날짜 · 1053 배포 뒤부터 수집</span>
      </h2>

      {!data ? (
        <p className="mt-3 text-[13px] text-text-3">방문 수 불러오기 실패 · 잠시 후 다시</p>
      ) : data.last7 === 0 && data.prev7 === 0 ? (
        <p className="mt-3 text-[13px] text-text-3">방문 수 없음 · 1053 배포 뒤부터 쌓임</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <div className="text-[12px] text-text-3">최근 7일 화면 열림</div>
              <div className="t-num mt-1 text-[24px] font-bold text-ink">{data.last7.toLocaleString("ko-KR")}</div>
              <div className="mt-0.5 text-[12px] text-text-3">
                지난 7일 {data.prev7.toLocaleString("ko-KR")}
                {delta !== null && ` · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}%`}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-text-3">첫 화면(들어옴)</div>
              <div className="t-num mt-1 text-[24px] font-bold text-ink">{data.landings7.toLocaleString("ko-KR")}</div>
              <div className="mt-0.5 text-[12px] text-text-3">들어옴당 화면 {data.landings7 > 0 ? (data.last7 / data.landings7).toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[12px] text-text-3">앱 안 브라우저 비중</div>
              <div className="t-num mt-1 text-[24px] font-bold text-ink">
                {data.inAppShare === null ? "—" : `${Math.round(data.inAppShare * 100)}%`}
              </div>
              <div className="mt-0.5 text-[12px] text-text-3">네이버 앱 · 카카오톡 등 · 구글 로그인 막힘</div>
            </div>
            <div>
              <div className="text-[12px] text-text-3">가입 단계 (최근 7일)</div>
              <div className="t-num mt-1 text-[15px] font-bold text-ink">
                {data.signup.map((s) => s.n.toLocaleString("ko-KR")).join(" → ")}
              </div>
              <div className="mt-0.5 text-[12px] text-text-3">{data.signup.map((s) => s.label).join(" → ")}</div>
            </div>
          </div>

          <div className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1" aria-label="최근 14일 화면 열림 수">
            {data.days.map((d) => (
              <div key={d.day} className="flex min-w-[40px] flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-text-2">{d.n.toLocaleString("ko-KR")}</span>
                <div
                  className="w-full rounded-t-md bg-primary/70"
                  style={{ height: `${Math.max(3, Math.round((d.n / max) * 80))}px` }}
                  title={`${d.day} · ${d.n}`}
                />
                <span className="text-[10px] text-text-3">{fmtDay(d.day)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-[13px] font-bold text-ink">많이 열린 화면 · 7일</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {data.topRoutes.map((r) => (
                  <li key={r.route} className="flex justify-between gap-2 text-[12px]">
                    <span className="truncate text-text-2">{r.route}</span>
                    <span className="t-num shrink-0 font-bold text-ink">
                      {r.n.toLocaleString("ko-KR")} <span className="font-medium text-text-3">{pct(r.n, data.last7)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-ink">들어온 곳 · 첫 화면 기준</h3>
              {data.topRefs.length === 0 ? (
                <p className="mt-2 text-[12px] text-text-3">들어온 곳 없음</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {data.topRefs.map((r) => (
                    <li key={r.host || "direct"} className="flex justify-between gap-2 text-[12px]">
                      <span className="truncate text-text-2">{r.host || "직접 · 알 수 없음"}</span>
                      <span className="t-num shrink-0 font-bold text-ink">
                        {r.n.toLocaleString("ko-KR")} <span className="font-medium text-text-3">{pct(r.n, data.landings7)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-ink">기기</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {data.devices.map((d) => (
                  <li key={d.device} className="flex justify-between gap-2 text-[12px]">
                    <span className="truncate text-text-2">{deviceLabel(d.device)}</span>
                    <span className="t-num shrink-0 font-bold text-ink">
                      {d.n.toLocaleString("ko-KR")} <span className="font-medium text-text-3">{pct(d.n, data.last7)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
