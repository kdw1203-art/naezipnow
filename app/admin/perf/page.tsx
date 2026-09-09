import { getServiceSupabase } from "@/lib/supabase/service";

/* [OPT-41] 성능 매트릭스 — 경로×지표 p75(7일) + LCP 범인 목록.
   총계만 보이던 웹바이탈을 "어느 화면의 어떤 요소" 단위로 내린다.
   attribution 수집(OPT-01)이 쌓이기 전에는 element 칸이 비어 있는 게 정상.

   [979] **2026-09-09 이전 표본(scope IS NULL)은 이 표에서 뺀다.**
   그전 리포터는 보낼 때의 location.pathname 을 실었는데, CLS·INP 는 문서 수명
   전체를 누적하고 페이지가 숨는 순간 확정되므로 한 방문에서 쌓인 값이 **마지막으로
   머문 화면**의 것으로 기록됐다(헤드리스 크롬 재현: 홈에서 쌓인 CLS 0.0199 가
   path=/map 으로 전송). 그 값으로 화면을 줄 세우면 엉뚱한 화면을 고치게 된다.
   지금은 화면 단위 줄(scope='route')과 문서 단위 줄(scope='doc')이 따로 오고,
   지표마다 맞는 단위만 읽는다 — CLS·INP 는 화면, LCP·FCP·TTFB 는 문서(첫 화면). */
export const dynamic = "force-dynamic";

const METRICS = ["LCP", "FCP", "INP", "CLS", "TTFB"] as const;
const THRESHOLD: Record<string, number> = { LCP: 2500, FCP: 1800, INP: 200, CLS: 0.1, TTFB: 800 };

type Row = {
  metric: string;
  path: string | null;
  value: number;
  element: string | null;
  attr_url: string | null;
  scope: string | null;
};

/* [979] 지표별로 어느 단위 줄을 읽는가.
   CLS·INP 는 문서 전체를 누적하므로 화면 단위로 쪼갠 줄이 그 화면의 값이고,
   LCP·FCP·TTFB 는 문서를 연 순간의 값이라 문서 단위 줄이 곧 첫 화면의 값이다. */
const SCOPE_FOR: Record<string, "route" | "doc"> = {
  CLS: "route",
  INP: "route",
  LCP: "doc",
  FCP: "doc",
  TTFB: "doc",
};

function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.75))];
}

async function load() {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("web_vitals")
    .select("metric,path,value,element,attr_url,scope")
    .gte("created_at", since)
    .limit(20000);
  if (error || !Array.isArray(data)) return null;
  return data as Row[];
}

export default async function AdminPerfPage() {
  const rows = await load();
  if (!rows) {
    return <main className="p-6 text-[13px] text-text-2">web_vitals 조회 실패 — DB 상태를 확인하세요.</main>;
  }

  /* [979] 화면 귀속이 어긋난 옛 표본과, 지표에 맞지 않는 단위의 줄을 걸러낸다.
     "몇 건을 왜 뺐는지"는 화면에 적는다 — 조용히 빼면 표본 수가 줄어든 이유를
     아무도 모른다. */
  const legacy = rows.filter((r) => r.scope === null).length;
  const usable = rows.filter((r) => r.scope !== null && r.scope === SCOPE_FOR[r.metric]);

  /* 경로×지표 매트릭스 (표본 3건 미만 경로는 접기) */
  const byPath = new Map<string, Map<string, number[]>>();
  for (const r of usable) {
    const p = (r.path ?? "(unknown)").split("?")[0];
    if (!byPath.has(p)) byPath.set(p, new Map());
    const m = byPath.get(p)!;
    if (!m.has(r.metric)) m.set(r.metric, []);
    m.get(r.metric)!.push(Number(r.value));
  }
  const paths = [...byPath.entries()]
    .map(([p, m]) => ({ path: p, samples: [...m.values()].reduce((a, v) => a + v.length, 0), m }))
    .filter((x) => x.samples >= 3)
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 25);

  /* LCP 범인 — element별 p75·건수 */
  const lcpByElement = new Map<string, number[]>();
  for (const r of usable) {
    if (r.metric !== "LCP" || !r.element) continue;
    const key = `${r.element}${r.attr_url ? ` ← ${r.attr_url.slice(0, 60)}` : ""}`;
    if (!lcpByElement.has(key)) lcpByElement.set(key, []);
    lcpByElement.get(key)!.push(Number(r.value));
  }
  const culprits = [...lcpByElement.entries()]
    .map(([el, vs]) => ({ el, n: vs.length, p: p75(vs) ?? 0 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 10);

  const fmt = (metric: string, v: number | null) =>
    v == null ? "—" : metric === "CLS" ? v.toFixed(3) : `${Math.round(v)}ms`;

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-[19px] font-bold text-ink">성능 매트릭스 — 최근 7일 p75</h1>
        <p className="mt-1 text-xs text-text-3">
          표본 {usable.length.toLocaleString()}건 · 기준 초과 셀은 강조 · LCP 범인은 attribution 수집분부터 채워집니다
        </p>
        {legacy > 0 && (
          <p className="mt-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-[1.6] text-warning">
            <b>옛 표본 {legacy.toLocaleString()}건을 뺐습니다(979).</b> 2026-09-09 이전 수집분은 한 방문에서 쌓인
            CLS·INP 가 <b>마지막으로 머문 화면</b>의 것으로 기록돼, 화면별로 줄 세울 수 없습니다. 새 수집분이
            쌓이는 동안 이 표의 표본 수는 적습니다 — 적은 표본으로 화면을 고치지 마세요.
          </p>
        )}
      </header>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left text-text-3">
              <th className="px-3 py-2">경로</th>
              <th className="px-2 py-2 text-right">표본</th>
              {METRICS.map((m) => (
                <th key={m} className="px-2 py-2 text-right">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paths.map((x) => (
              <tr key={x.path} className="border-b border-line/60">
                <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-[12px] text-ink">{x.path}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-text-3">{x.samples}</td>
                {METRICS.map((m) => {
                  const v = p75(x.m.get(m) ?? []);
                  const over = v != null && v > THRESHOLD[m];
                  return (
                    <td key={m} className={`px-2 py-1.5 text-right tabular-nums ${over ? "font-bold text-danger" : "text-text-2"}`}>
                      {fmt(m, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-bold text-ink">LCP 범인 Top 10 (요소 선택자 기준)</h2>
        {culprits.length === 0 ? (
          <p className="mt-2 text-xs text-text-3">
            아직 attribution 표본이 없습니다 — 배포 후 실사용 트래픽이 쌓이면 여기로 들어옵니다.
            (979 이전 표본은 화면 귀속이 어긋나 제외합니다.)
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {culprits.map((c) => (
              <li key={c.el} className="flex items-baseline justify-between gap-3 text-xs">
                <code className="min-w-0 flex-1 truncate text-[12px] text-text-2">{c.el}</code>
                <span className="shrink-0 tabular-nums font-bold text-ink">{Math.round(c.p)}ms</span>
                <span className="shrink-0 tabular-nums text-text-3">×{c.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
