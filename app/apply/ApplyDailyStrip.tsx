import { buildApplyCalendar, type ApplyCalendarResult } from "@/lib/applyhome/calendar";
import { listRecentCompetition } from "@/lib/applyhome/store";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ============================================================
   [994 · D4] 오늘의 청약 — 매일 적재된 저장소에서 서버가 그린다.

   앞으로 7일 접수 시작·마감(캘린더 요약)과 최근 갱신된 경쟁률(1순위·해당지역 우선).
   기준일은 마지막 적재 시각이다(저장소 출처일 때). 저장소가 비어 라이브로 온 경우 그 사실을 적는다.
   숫자는 전부 청약홈 공공데이터 원문이고, 예측치는 만들지 않는다.

   [v4] "한 화면 한 가지" — 카드 두 장(2열) → 1px 선 행 목록 섹션. 조회는 페이지가 한 번 하고(loadApplyDaily)
   같은 값으로 머리 사실 줄("7일 안 접수 시작 n · 마감 n", applyWeek)과 이 목록을 그린다 — 조회를 늘리지 않는다.
   · "날짜별 캘린더 보기 ›" 링크는 뺐다 — 머리 오른쪽 "청약 캘린더 보기"와 같은 곳(같은 행동은 한 번).
   · 날짜+접수/마감 배지 → 행 오른쪽 값 글자(의미색). 시작·마감 수는 머리 사실 줄이 말한다(같은 사실은 한 번).
   · "최근 발표 경쟁률"은 바로 아래 청약홈 경쟁률 표가 첫 화면에 결과를 그릴 때는 싣지 않는다(같은 사실 —
     showCompetition). 표가 못 그리는 날(청약홈 조회 실패·미설정)에는 저장소의 최근 경쟁률이 이 자리에 남는다.
   ============================================================ */

type RecentCompetition = Awaited<ReturnType<typeof listRecentCompetition>>;

export type ApplyDaily = {
  cal: ApplyCalendarResult | null;
  comp: RecentCompetition;
};

/** 페이지가 한 번 부른다 — 실패는 각각 null/[] 로 접는다(예전 스트립 안의 catch 와 같다) */
export async function loadApplyDaily(): Promise<ApplyDaily> {
  const [cal, comp] = await Promise.all([
    buildApplyCalendar().catch(() => null),
    listRecentCompetition(6).catch(() => [] as RecentCompetition),
  ]);
  return { cal, comp };
}

function kstDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

function mmdd(date: string | null): string {
  if (!date) return "—";
  return date.slice(5).replace("-", ".");
}

/** 앞으로 7일(KST) 접수 시작·마감 — 수와 앞 4건. 머리 사실 줄과 목록이 같은 값을 쓴다 */
export function applyWeek(cal: ApplyCalendarResult | null, nowMs: number = Date.now()) {
  const ok = cal && cal.state === "ok" ? cal : null;
  const todayKst = new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
  const weekEnd = new Date(nowMs + 9 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
  const week = ok ? ok.days.filter((d) => d.date >= todayKst && d.date <= weekEnd) : [];
  const starts = week.reduce((n, d) => n + d.starts.length, 0);
  const ends = week.reduce((n, d) => n + d.ends.length, 0);
  const upcoming = week
    .flatMap((d) => [
      ...d.starts.map((it) => ({ kind: "접수" as const, date: d.date, it })),
      ...d.ends.map((it) => ({ kind: "마감" as const, date: d.date, it })),
    ])
    .slice(0, 4);
  return { ok, starts, ends, upcoming };
}

export function ApplyDailyStrip({
  data,
  showCompetition,
}: {
  data: ApplyDaily;
  /** 저장소의 "최근 발표 경쟁률"을 그릴까 — 아래 청약홈 표가 결과를 그리면 false(같은 사실은 한 번) */
  showCompetition: boolean;
}) {
  const { ok, upcoming } = applyWeek(data.cal);
  const comp = showCompetition ? data.comp : [];

  if (!ok && comp.length === 0) return null;

  /* [1011] "적재"·"저장소 첫 적재 전" 을 걷었다(소유자 지시) — 우리가 자료를 어디에 어떻게 쌓는지는
     쓰는 사람이 알 필요가 없다. 신뢰도를 좌우하는 기준 시점과 갱신 주기는 그대로 남긴다. */
  const basis = ok
    ? ok.source === "store"
      ? `기준 ${kstDate(ok.fetchedAt) ?? "—"} · 매일 자동 갱신`
      : "청약홈 즉시 조회"
    : null;

  return (
    <>
      {ok && (
        <section aria-labelledby="apply-week-title" className="flex flex-col gap-1">
          <h2 id="apply-week-title" className="t-section text-ink">
            앞으로 7일 접수
          </h2>
          {upcoming.length === 0 ? (
            /* [1012] 규칙 6 — 언제(앞으로 7일). [v4] 빈 상태는 한 줄, 기준 시점은 아래 캡션이 말한다 */
            <p className="py-3 t-sub text-text-3">앞으로 7일 접수 시작·마감 공고 없음</p>
          ) : (
            <ul data-tone="sand" className="divide-y divide-line">
              {upcoming.map((u, i) => (
                <SummaryRow
                  key={i}
                  label={<span className="block truncate">{u.it.houseName}</span>}
                  sub={u.it.region}
                  value={
                    <span className={u.kind === "접수" ? "text-primary" : "text-warning"}>
                      {mmdd(u.date)} {u.kind}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
          {basis && <p className="t-caption text-text-3">{basis} · 청약홈(한국부동산원)</p>}
        </section>
      )}

      {comp.length > 0 && (
        <section aria-labelledby="apply-recent-title" className="flex flex-col gap-1">
          <h2 id="apply-recent-title" className="t-section text-ink">
            최근 발표 경쟁률
          </h2>
          <ul data-tone="blue" className="divide-y divide-line">
            {comp.map((c) => (
              <SummaryRow
                key={`${c.house_manage_no}:${c.house_ty}`}
                label={<span className="block truncate">{c.house_nm ?? "단지명 미제공"}</span>}
                sub={`${c.region ?? "—"} · ${c.house_ty}`}
                value={c.cmpet_rate_num != null ? `${c.cmpet_rate_num.toLocaleString("ko-KR")} : 1` : c.cmpet_rate ?? "—"}
              />
            ))}
          </ul>
          <p className="t-caption text-text-3">1순위 · 해당지역 우선 · 청약홈(한국부동산원) · 매일 갱신</p>
        </section>
      )}
    </>
  );
}
