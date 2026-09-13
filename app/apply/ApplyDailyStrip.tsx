import Link from "next/link";
import { buildApplyCalendar } from "@/lib/applyhome/calendar";
import { listRecentCompetition } from "@/lib/applyhome/store";

/* ============================================================
   [994 · D4] 오늘의 청약 — 매일 적재된 저장소에서 서버가 그린다.

   왼쪽: 앞으로 7일 접수 시작·마감(캘린더 요약). 오른쪽: 최근 갱신된 경쟁률(1순위·해당지역 우선).
   기준일은 마지막 적재 시각이다(저장소 출처일 때). 저장소가 비어 라이브로 온 경우 그 사실을 적는다.
   숫자는 전부 청약홈 공공데이터 원문이고, 예측치는 만들지 않는다.
   ============================================================ */

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

export async function ApplyDailyStrip() {
  const [cal, comp] = await Promise.all([
    buildApplyCalendar().catch(() => null),
    listRecentCompetition(6).catch(() => []),
  ]);
  const ok = cal && cal.state === "ok" ? cal : null;
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 9 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
  const week = ok ? ok.days.filter((d) => d.date >= todayKst && d.date <= weekEnd) : [];
  const starts = week.reduce((n, d) => n + d.starts.length, 0);
  const ends = week.reduce((n, d) => n + d.ends.length, 0);
  const upcoming = week.flatMap((d) => [
    ...d.starts.map((it) => ({ kind: "접수" as const, date: d.date, it })),
    ...d.ends.map((it) => ({ kind: "마감" as const, date: d.date, it })),
  ]).slice(0, 4);

  if (!ok && comp.length === 0) return null;

  const basis = ok
    ? ok.source === "store"
      ? `기준 ${kstDate(ok.fetchedAt) ?? "—"} 적재 · 매일 자동 갱신`
      : "청약홈 즉시 조회(저장소 첫 적재 전)"
    : null;

  return (
    <section className="rise-in mb-4 grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="오늘의 청약">
      <div className="card flex flex-col gap-2 rounded-[18px] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="t-body font-extrabold text-ink">앞으로 7일 접수</h3>
          <span className="t-caption text-text-3">
            시작 <b className="text-ink">{starts}</b> · 마감 <b className="text-ink">{ends}</b>
          </span>
        </div>
        {upcoming.length === 0 ? (
          <p className="t-sub text-text-3">
            {ok ? "이번 주 접수 시작·마감 공고가 없어요." : "청약 일정을 지금 불러오지 못했어요 — 없는 것과 다릅니다."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {upcoming.map((u, i) => (
              <li key={i} className="flex items-center gap-2 t-sub">
                <span className={`shrink-0 rounded px-1.5 py-px t-caption font-extrabold ${u.kind === "접수" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning"}`}>
                  {mmdd(u.date)} {u.kind}
                </span>
                <span className="truncate font-bold text-ink">{u.it.houseName}</span>
                <span className="shrink-0 text-text-3">{u.it.region}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/apply/calendar" className="inline-block self-start py-[5px] t-sub font-bold text-primary no-underline">
          날짜별 캘린더 ›
        </Link>
      </div>

      <div className="card flex flex-col gap-2 rounded-[18px] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="t-body font-extrabold text-ink">최근 발표 경쟁률</h3>
          <span className="t-caption text-text-3">1순위 · 해당지역 우선</span>
        </div>
        {comp.length === 0 ? (
          <p className="t-sub text-text-3">저장된 경쟁률이 아직 없어요 — 첫 적재 뒤 표시돼요.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {comp.map((c) => (
              <li key={`${c.house_manage_no}:${c.house_ty}`} className="flex items-center gap-2 t-sub">
                <span className="w-[64px] shrink-0 rounded bg-bg px-1.5 py-px text-center t-caption font-extrabold tabular-nums text-ink">
                  {c.cmpet_rate_num != null ? `${c.cmpet_rate_num.toLocaleString("ko-KR")} : 1` : c.cmpet_rate ?? "—"}
                </span>
                <span className="truncate font-bold text-ink">{c.house_nm ?? "단지명 미제공"}</span>
                <span className="shrink-0 text-text-3">
                  {c.region ?? "—"} · {c.house_ty}
                </span>
              </li>
            ))}
          </ul>
        )}
        {basis && <p className="t-caption text-text-3">{basis} · 출처 청약홈(한국부동산원)</p>}
      </div>
    </section>
  );
}
