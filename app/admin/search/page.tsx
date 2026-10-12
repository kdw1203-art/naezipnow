import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { loadSearchLandings } from "@/lib/admin/search-landings";
import { loadGscPerformance, type GscLoaded } from "@/lib/admin/gsc-performance";
import { listSearchReports } from "@/lib/admin/search-reports";
import { SOURCE_LABEL, SOURCE_ORDER, deltaPct, type LandingSource, type SearchLandingSummary } from "@/lib/seo/search-engines";
import { pagePath, type GscMetricRow } from "@/lib/seo/gsc-performance-shape";
import { SEARCH_REPORT_ENGINE_LABEL, reportCtr, type SearchReport } from "@/lib/seo/search-report-rules";
import { kstDay } from "@/lib/metrics/page-count";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { SearchReportForm } from "./SearchReportForm";

/*
 * [1061] 관리 › 검색 유입 — 네이버·구글 실적과 방문자를 한 화면에.
 *
 * 세 가지 자를 각각 이름 붙여 보인다(섞으면 숫자가 서로 안 맞는 이유를 영영 모른다):
 *  1) 우리 측정 — 익명 하루 수(page_view_daily_agg)의 첫 화면을 리퍼러로 묶음. 동의와 무관한 전체 방문.
 *  2) 구글 서치콘솔 — Search Analytics API(서비스 계정). 클릭·노출·CTR·순위·상위 검색어·페이지. 1시간 캐시.
 *  3) 네이버 서치어드바이저 — API 없음. 리포트 화면 숫자를 손으로 적는 기록 + 리포트 링크.
 * 모르는 것은 모른다고 적는다: 키 미설정 · 조회 실패 · 기록 없음을 다른 문장으로.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "검색 유입 | 내집나우 관리자",
  robots: { index: false, follow: false },
};

const SA_REPORT_URL = "https://searchadvisor.naver.com/console/site/report/expose?site=https%3A%2F%2Fnaezipnow.com";
const GSC_URL = "https://search.google.com/search-console?resource_id=https%3A%2F%2Fnaezipnow.com%2F";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtDay = (d: string) => d.slice(5).replace("-", ".");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = deltaPct(now, prev);
  if (d === null) return <span className="text-[12px] text-text-3">앞 기간 0 · 비교 없음</span>;
  const tone = d > 0 ? "text-success" : d < 0 ? "text-danger" : "text-text-3";
  return (
    <span className={`text-[12px] font-bold ${tone}`}>
      {d > 0 ? "+" : ""}
      {d}% <span className="font-medium text-text-3">· 앞 28일 {fmt(prev)}</span>
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="card rounded-xl p-4">
      <div className="text-[12px] text-text-3">{label}</div>
      <div className="t-num mt-1 text-[24px] font-bold text-ink">{value}</div>
      <div className="mt-0.5">{sub}</div>
    </div>
  );
}

function Failed({ what, detail }: { what: string; detail?: string }) {
  return (
    <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger">
      {what} 불러오기 실패 — 데이터가 없는 게 아니라 못 읽은 것입니다. {detail ? `(${detail})` : "잠시 후 다시."}
    </p>
  );
}

/* ── 1) 우리 측정 ─────────────────────────────────────────────────────────── */

const SEARCH_SOURCES: readonly LandingSource[] = ["naver", "google", "bing", "daum", "other-search", "ai"];

function LandingBars({ s }: { s: SearchLandingSummary }) {
  const searchTotal = (d: SearchLandingSummary["days"][number]) =>
    SEARCH_SOURCES.reduce((a, k) => a + (d.bySource[k] ?? 0), 0);
  const max = Math.max(1, ...s.days.map(searchTotal));
  return (
    <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1" aria-label="검색엔진에서 온 첫 화면 · 최근 28일">
      {s.days.map((d) => {
        const naver = d.bySource.naver ?? 0;
        const google = d.bySource.google ?? 0;
        const total = searchTotal(d);
        const others = total - naver - google;
        const h = (n: number) => `${Math.round((n / max) * 80)}px`;
        return (
          <div key={d.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
            {/* 0 인 날은 숫자를 비워 막대 줄이 숫자 벽이 되지 않게(자리는 남긴다) */}
            <span className="min-h-[14px] text-[10px] font-bold text-text-2">{total > 0 ? total : ""}</span>
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
              style={{ height: "80px", justifyContent: "flex-start" }}
              title={`${d.day} · 네이버 ${naver} · 구글 ${google} · 그 밖 ${others}`}
            >
              <div className="w-full bg-primary/70" style={{ height: h(naver) }} />
              <div className="w-full bg-ink/40" style={{ height: h(google) }} />
              <div className="w-full bg-text-3/30" style={{ height: h(others) }} />
            </div>
            <span className="text-[10px] text-text-3">{fmtDay(d.day)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SourceTable({ s }: { s: SearchLandingSummary }) {
  return (
    <table className="mt-3 w-full text-[12px]">
      <thead>
        <tr className="text-left text-text-3">
          <th className="py-1.5 font-bold">들어온 곳</th>
          <th className="py-1.5 text-right font-bold">최근 28일</th>
          <th className="py-1.5 text-right font-bold">앞 28일</th>
          <th className="py-1.5 text-right font-bold">변화</th>
        </tr>
      </thead>
      <tbody>
        {SOURCE_ORDER.map((k) => {
          const now = s.totals[k];
          const prev = s.prevTotals[k];
          const d = deltaPct(now, prev);
          return (
            <tr key={k} className="border-t border-line">
              <td className="py-1.5 text-ink">{SOURCE_LABEL[k]}</td>
              <td className="t-num py-1.5 text-right font-bold text-ink">{fmt(now)}</td>
              <td className="t-num py-1.5 text-right text-text-2">{fmt(prev)}</td>
              <td className="t-num py-1.5 text-right text-text-2">{d === null ? "—" : `${d > 0 ? "+" : ""}${d}%`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TopRoutes({ s, source }: { s: SearchLandingSummary; source: LandingSource }) {
  const rows = s.topRoutes[source] ?? [];
  return (
    <div>
      <h3 className="text-[13px] font-bold text-ink">{SOURCE_LABEL[source]} · 많이 착지한 화면</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-text-3">최근 28일 착지 없음</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.route} className="flex justify-between gap-2 text-[12px]">
              <span className="truncate text-text-2">{r.route}</span>
              <span className="t-num shrink-0 font-bold text-ink">{fmt(r.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 2) 구글 서치콘솔 ─────────────────────────────────────────────────────── */

function GscSetupSteps() {
  return (
    <div className="text-[12px] leading-[1.7] text-text-2">
      <p>
        아직 연결 안 됨. 색인률(관리 › SEO 측정)과 같은 서비스 계정을 쓰므로 한 번만 하면 둘 다 켜집니다.
        키 값은 채팅에 붙이지 말고 Vercel 환경변수에만 넣습니다.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Google Cloud 콘솔 › API 및 서비스 › 라이브러리에서 <b className="text-ink">Google Search Console API</b> 사용 설정.</li>
        <li>IAM › 서비스 계정 만들기 › 키 추가(JSON). JSON 안의 <code>client_email</code>·<code>private_key</code> 두 값을 쓴다.</li>
        <li>서치콘솔 › 설정 › 사용자 및 권한 › 사용자 추가에 그 <code>client_email</code> 을 넣는다(권한 "전체" 또는 "제한됨").</li>
        <li>
          Vercel 환경변수 <code>GSC_SERVICE_ACCOUNT_EMAIL</code> · <code>GSC_SERVICE_ACCOUNT_PRIVATE_KEY</code>(private_key 그대로) ·{" "}
          <code>GSC_SITE_URL</code>(<code>https://naezipnow.com/</code>) → 재배포. 그다음 이 화면을 다시 연다.
        </li>
      </ol>
    </div>
  );
}

function GscBars({ rows }: { rows: GscMetricRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.clicks));
  return (
    <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1" aria-label="서치콘솔 일별 클릭 · 최근 28일">
      {rows.map((r) => (
        <div key={r.key} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
          <span className="min-h-[14px] text-[10px] font-bold text-text-2">{r.clicks > 0 ? fmt(r.clicks) : ""}</span>
          <div
            className="w-full rounded-t-md bg-primary/70"
            style={{ height: `${Math.max(2, Math.round((r.clicks / max) * 80))}px` }}
            title={`${r.key} · 클릭 ${r.clicks} · 노출 ${r.impressions}`}
          />
          <span className="text-[10px] text-text-3">{fmtDay(r.key)}</span>
        </div>
      ))}
    </div>
  );
}

function GscDimTable({ rows, head, keyLabel }: { rows: GscMetricRow[]; head: string; keyLabel: (k: string) => string }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-bold text-ink">{head}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-text-3">기간 안 자료 없음</p>
      ) : (
        <table className="mt-1.5 w-full text-[12px]">
          <thead>
            <tr className="text-left text-text-3">
              <th className="py-1 font-bold">항목</th>
              <th className="py-1 text-right font-bold">클릭</th>
              <th className="py-1 text-right font-bold">노출</th>
              <th className="py-1 text-right font-bold">CTR</th>
              <th className="py-1 text-right font-bold">순위</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="max-w-[260px] truncate py-1 text-ink" title={r.key}>
                  {keyLabel(r.key)}
                </td>
                <td className="t-num py-1 text-right font-bold text-ink">{fmt(r.clicks)}</td>
                <td className="t-num py-1 text-right text-text-2">{fmt(r.impressions)}</td>
                <td className="t-num py-1 text-right text-text-2">{pct(r.ctr)}</td>
                <td className="t-num py-1 text-right text-text-2">{r.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GscSection({ loaded }: { loaded: GscLoaded }) {
  if (loaded.state === "not_configured") return <GscSetupSteps />;
  if (loaded.state === "failed") return <Failed what="서치콘솔 실적" detail={loaded.detail} />;
  const g = loaded.data;
  const posNow = g.totals.position;
  const posPrev = g.prevTotals.position;
  return (
    <>
      <p className="text-[12px] text-text-3">
        {g.range.start} ~ {g.range.end} · 서치콘솔은 이틀쯤 늦게 확정 · 1시간마다 다시 읽음 · 속성 {g.siteUrl}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="클릭 · 28일" value={fmt(g.totals.clicks)} sub={<Delta now={g.totals.clicks} prev={g.prevTotals.clicks} />} />
        <Tile label="노출 · 28일" value={fmt(g.totals.impressions)} sub={<Delta now={g.totals.impressions} prev={g.prevTotals.impressions} />} />
        <Tile
          label="CTR"
          value={pct(g.totals.ctr)}
          sub={<span className="text-[12px] text-text-3">앞 28일 {pct(g.prevTotals.ctr)}</span>}
        />
        <Tile
          label="평균 순위"
          value={posNow === null ? "—" : posNow.toFixed(1)}
          sub={<span className="text-[12px] text-text-3">앞 28일 {posPrev === null ? "—" : posPrev.toFixed(1)} · 작을수록 위</span>}
        />
      </div>
      <GscBars rows={g.byDate} />
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <GscDimTable rows={g.topQueries} head="상위 검색어" keyLabel={(k) => k} />
        <GscDimTable rows={g.topPages} head="상위 페이지" keyLabel={(k) => pagePath(k, DEFAULT_DESKTOP_ORIGIN)} />
      </div>
    </>
  );
}

/* ── 3) 네이버 서치어드바이저(손 기록) ─────────────────────────────────────── */

function ReportTable({ rows }: { rows: SearchReport[] }) {
  if (rows.length === 0) return <p className="mt-2 text-[12px] text-text-3">적어 둔 기록 없음 — 아래 폼으로 첫 기록을 남깁니다.</p>;
  return (
    <table className="mt-2 w-full text-[12px]">
      <thead>
        <tr className="text-left text-text-3">
          <th className="py-1 font-bold">기준일</th>
          <th className="py-1 text-right font-bold">기간</th>
          <th className="py-1 text-right font-bold">클릭</th>
          <th className="py-1 text-right font-bold">노출</th>
          <th className="py-1 text-right font-bold">CTR</th>
          <th className="py-1 text-right font-bold">색인 페이지</th>
          <th className="py-1 pl-4 font-bold">메모</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const ctr = reportCtr(r);
          return (
            <tr key={`${r.engine}-${r.date}`} className="border-t border-line">
              <td className="py-1 text-ink">{r.date}</td>
              <td className="t-num py-1 text-right text-text-2">{r.periodDays}일</td>
              <td className="t-num py-1 text-right font-bold text-ink">{r.clicks === null ? "—" : fmt(r.clicks)}</td>
              <td className="t-num py-1 text-right text-text-2">{r.impressions === null ? "—" : fmt(r.impressions)}</td>
              <td className="t-num py-1 text-right text-text-2">{ctr === null ? "—" : pct(ctr)}</td>
              <td className="t-num py-1 text-right text-text-2">{r.indexedPages === null ? "—" : fmt(r.indexedPages)}</td>
              <td className="max-w-[260px] truncate py-1 pl-4 text-text-2" title={r.note}>
                {r.note || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── 화면 ──────────────────────────────────────────────────────────────────── */

export default async function AdminSearchPage() {
  const now = Date.now();
  const [landingsR, gsc, naverR] = await Promise.all([
    loadSearchLandings(now).then(
      (s) => ({ ok: true as const, s }),
      (e: unknown) => ({ ok: false as const, detail: e instanceof Error ? e.message : String(e) }),
    ),
    loadGscPerformance(),
    listSearchReports("naver").then(
      (rows) => ({ ok: true as const, rows }),
      (e: unknown) => ({ ok: false as const, detail: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  const latestNaver = naverR.ok ? (naverR.rows[0] ?? null) : null;
  const s = landingsR.ok ? landingsR.s : null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-bg p-4 md:p-5">
      <div>
        <h1 className="text-[19px] font-bold text-ink">검색 유입</h1>
        <p className="mt-1 text-[13px] leading-[1.6] text-text-2">
          네이버·구글에서 온 사람과 검색엔진이 말하는 실적을 한곳에서 봅니다. 세 자가 서로 다릅니다 —{" "}
          <b className="text-ink">우리 측정</b>(모든 방문의 첫 화면 · 리퍼러 기준) · <b className="text-ink">구글 서치콘솔</b>(검색결과
          클릭 · 이틀 지연) · <b className="text-ink">네이버 서치어드바이저</b>(API 가 없어 손으로 적음). 관리 › 트래픽의
          &ldquo;유입 출처&rdquo;는 동의한 방문만 담는 표본이라 여기 숫자보다 작습니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="네이버 검색에서 온 첫 화면 · 28일"
          value={s ? fmt(s.totals.naver) : "—"}
          sub={s ? <Delta now={s.totals.naver} prev={s.prevTotals.naver} /> : <span className="text-[12px] text-danger">조회 실패</span>}
        />
        <Tile
          label="구글 검색에서 온 첫 화면 · 28일"
          value={s ? fmt(s.totals.google) : "—"}
          sub={s ? <Delta now={s.totals.google} prev={s.prevTotals.google} /> : <span className="text-[12px] text-danger">조회 실패</span>}
        />
        <Tile
          label="서치콘솔 클릭 · 28일"
          value={gsc.state === "ok" ? fmt(gsc.data.totals.clicks) : "—"}
          sub={
            gsc.state === "ok" ? (
              <Delta now={gsc.data.totals.clicks} prev={gsc.data.prevTotals.clicks} />
            ) : (
              <span className="text-[12px] text-text-3">{gsc.state === "not_configured" ? "연결 안 됨 · 아래 안내" : "조회 실패"}</span>
            )
          }
        />
        <Tile
          label="서치어드바이저 기록 · 최근"
          value={latestNaver && latestNaver.clicks !== null ? `${fmt(latestNaver.clicks)} 클릭` : "—"}
          sub={
            <span className="text-[12px] text-text-3">
              {latestNaver
                ? `${latestNaver.date} 기준 ${latestNaver.periodDays}일 · 노출 ${latestNaver.impressions === null ? "—" : fmt(latestNaver.impressions)}`
                : naverR.ok
                  ? "기록 없음"
                  : "조회 실패"}
            </span>
          }
        />
      </div>

      <section className="card rounded-2xl p-5" aria-labelledby="landings-title">
        <h2 id="landings-title" className="text-[15px] font-bold text-ink">
          우리 측정 · 검색엔진에서 온 첫 화면
        </h2>
        <p className="mt-1 text-[12px] leading-[1.6] text-text-3">
          익명 하루 수(동의와 무관) 가운데 세션 첫 화면의 리퍼러를 묶었습니다. 막대는 검색엔진(네이버 · 구글 · 그 밖 검색 · AI)만,
          표는 전부. {s ? `${s.range.start} ~ ${s.range.end}` : ""} · 10.11 부터 쌓임.
        </p>
        {!s ? (
          <div className="mt-3">
            <Failed what="착지" detail={landingsR.ok ? undefined : landingsR.detail} />
          </div>
        ) : (
          <>
            <LandingBars s={s} />
            <p className="mt-1 flex flex-wrap gap-3 text-[10px] text-text-3">
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" />네이버</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/40" />구글</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-text-3/30" />그 밖 검색 · AI</span>
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr_1fr]">
              <SourceTable s={s} />
              <TopRoutes s={s} source="naver" />
              <TopRoutes s={s} source="google" />
            </div>
          </>
        )}
      </section>

      <section className="card rounded-2xl p-5" aria-labelledby="gsc-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gsc-title" className="text-[15px] font-bold text-ink">
            구글 서치콘솔 실적
          </h2>
          <a href={GSC_URL} target="_blank" rel="noreferrer" className="tap-line text-[12px] font-bold text-primary no-underline">
            서치콘솔 열기 ›
          </a>
        </div>
        <div className="mt-2">
          <GscSection loaded={gsc} />
        </div>
      </section>

      <section className="card rounded-2xl p-5" aria-labelledby="naver-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="naver-title" className="text-[15px] font-bold text-ink">
            {SEARCH_REPORT_ENGINE_LABEL.naver} 기록
          </h2>
          <a href={SA_REPORT_URL} target="_blank" rel="noreferrer" className="tap-line text-[12px] font-bold text-primary no-underline">
            콘텐츠 노출/클릭 리포트 열기 ›
          </a>
        </div>
        <p className="mt-1 text-[12px] leading-[1.6] text-text-3">
          서치어드바이저는 숫자를 내보내는 API 가 없습니다. 리포트의 &ldquo;최근 총 클릭 · 총 노출&rdquo;과 사이트 진단의
          &ldquo;색인된 페이지&rdquo;를 주 1회 옮겨 적으면 추세가 여기 남습니다. 모르는 칸은 비워 둡니다.
        </p>
        {naverR.ok ? <ReportTable rows={naverR.rows} /> : <div className="mt-2"><Failed what="기록" detail={naverR.detail} /></div>}
        <div className="mt-4 border-t border-line pt-4">
          <SearchReportForm engine="naver" defaultDate={kstDay(now)} engineLabel={SEARCH_REPORT_ENGINE_LABEL.naver} />
        </div>
      </section>

      <p className="text-[12px] text-text-3">
        같은 기간의 전체 방문·체류는 <Link href="/admin/traffic" className="tap-line font-bold text-primary no-underline">관리 › 트래픽</Link>, 색인률·실사용자
        성능은 <Link href="/admin/seo" className="tap-line font-bold text-primary no-underline">관리 › SEO 측정</Link>.
      </p>
    </div>
  );
}
