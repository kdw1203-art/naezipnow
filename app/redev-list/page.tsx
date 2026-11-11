import Link from "@/app/components/IntentLink";
import { PageShell } from "@/app/components/PageShell";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { pageWindow } from "@/lib/community/board-query";
import {
  NATIONAL_DATASET,
  NATIONAL_DATASET_URL,
  NATIONAL_PAGE_SIZE,
  nationalHref,
  parseNationalParams,
  stripOrdinal,
  type NationalListParams,
} from "@/lib/redevelopment/national";
import { logger } from "@/lib/log";

/* [1149 · 전국 정비구역 목록] 국토교통부 공표 목록(약 1,600곳)을 시도 · 시군구 · 구역 이름으로 찾아본다.
   이 자료에는 좌표가 없어 지도에는 찍지 않는다(지도는 좌표가 확인된 구역만 — /redevelopment). 검색 화면이라 색인하지 않는다. */
export const dynamic = "force-dynamic";
export const metadata = buildPageMetadata({
  title: "전국 정비구역 목록",
  description: "국토교통부가 공표한 전국 재개발 · 재건축 · 주거환경개선 정비구역을 시도 · 시군구 · 구역 이름으로 찾아봅니다.",
  path: "/redev-list",
  noIndex: true,
});

type Row = { id: string; sido: string; sigungu: string; name: string; stage: string | null; project_type: string | null; operator: string | null; households: number | null };

async function load(p: NationalListParams): Promise<{ rows: Row[]; total: number; sidos: string[] } | "missing" | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const from = (p.page - 1) * NATIONAL_PAGE_SIZE;
    let q = sb
      .from("redev_national_zones")
      .select("id,sido,sigungu,name,stage,project_type,operator,households", { count: "exact" })
      .order("sido")
      .order("sigungu")
      .order("name")
      .range(from, from + NATIONAL_PAGE_SIZE - 1);
    if (p.sido) q = q.eq("sido", p.sido);
    if (p.sigungu) q = q.ilike("sigungu", `%${p.sigungu}%`);
    if (p.q) q = q.ilike("name", `%${p.q}%`);
    const [list, sidoRes] = await Promise.all([q, sb.from("redev_national_zones").select("sido").limit(3000)]);
    if (list.error) {
      /* 표 추가(sql 215) 전 */
      if (/does not exist|schema cache|PGRST205|42P01/i.test(`${list.error.code} ${list.error.message}`)) return "missing";
      throw new Error(list.error.message);
    }
    const sidos = [...new Set(((sidoRes.data ?? []) as Array<{ sido: string }>).map((r) => r.sido))].sort((a, b) => a.localeCompare(b, "ko"));
    return { rows: (list.data ?? []) as Row[], total: list.count ?? 0, sidos };
  } catch (e) {
    logger.error("[redev-list] 목록 조회 실패", e);
    return null;
  }
}

export default async function RedevListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseNationalParams(await searchParams);
  const res = await load(p);
  const ok = res && res !== "missing" ? res : null;
  const win = ok ? pageWindow(p.page, ok.total, NATIONAL_PAGE_SIZE) : null;

  return (
    <PageShell title="전국 정비구역 목록" breadcrumb="정비사업 › 전국 목록">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3">
        <p className="m-0 px-1 t-sub text-text-2">
          재개발 · 재건축 · 주거환경개선 정비구역 ·{" "}
          <a href={NATIONAL_DATASET_URL} target="_blank" rel="noreferrer" className="tap-line font-bold text-primary">
            {NATIONAL_DATASET}
          </a>{" "}
          · 좌표 없는 자료라 지도 대신 목록 ·{" "}
          <Link href="/redevelopment" className="tap-line font-bold text-primary">
            지도에서 보기 ›
          </Link>
        </p>

        <form action="/redev-list" method="get" role="search" className="card flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <label htmlFor="rl-sido" className="sr-only">
            시도
          </label>
          <select id="rl-sido" name="sido" defaultValue={p.sido} className="min-h-10 rounded-lg border border-line bg-surface px-2.5 t-sub text-text-1">
            <option value="">시도 전체</option>
            {(ok?.sidos ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label htmlFor="rl-sigungu" className="sr-only">
            시군구
          </label>
          <input id="rl-sigungu" name="sigungu" type="search" defaultValue={p.sigungu} maxLength={40} placeholder="시군구" className="min-h-10 w-32 rounded-lg border border-line bg-surface px-3 t-body text-text-1" />
          <label htmlFor="rl-q" className="sr-only">
            구역 이름
          </label>
          <input id="rl-q" name="q" type="search" defaultValue={p.q} maxLength={40} placeholder="구역 이름" className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 t-body text-text-1" />
          <button type="submit" className="btn-primary btn-md">
            검색
          </button>
        </form>

        {res === "missing" ? (
          <p className="card m-0 rounded-2xl p-5 t-body text-text-3">전국 정비구역 목록 준비 중</p>
        ) : !ok || !win ? (
          <p className="card m-0 rounded-2xl p-5 t-body text-text-3">정비구역 불러오기 실패 · 잠시 후 다시</p>
        ) : (
          <>
            <p className="m-0 px-1 t-caption text-text-3">
              {ok.total.toLocaleString("ko-KR")}곳 · {win.current} / {win.last}쪽
            </p>
            {ok.rows.length === 0 ? (
              <p className="card m-0 rounded-2xl p-5 t-body text-text-3">{p.sido || p.sigungu || p.q ? "검색 결과 없음" : "정비구역 없음 · 첫 수집 전"}</p>
            ) : (
              <div className="card overflow-x-auto rounded-2xl">
                <table className="w-full min-w-[720px] border-collapse text-left t-sub text-text-1">
                  <thead>
                    <tr className="t-caption text-text-3">
                      {["지역", "구역", "사업 유형", "추진 단계", "공급 예정", "시행자"].map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap border-b border-line px-3 py-2.5 font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ok.rows.map((r) => (
                      <tr key={r.id} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-2">
                          {r.sido} {r.sigungu}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-ink">{r.name}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{stripOrdinal(r.project_type) ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{stripOrdinal(r.stage) ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 t-num">{r.households ? `${r.households.toLocaleString("ko-KR")}세대` : "—"}</td>
                        <td className="px-3 py-2.5 text-text-2">{stripOrdinal(r.operator) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {win.last > 1 && (
              <nav aria-label="쪽 번호" className="flex flex-wrap items-center justify-center gap-1">
                {win.pages.map((n, i) =>
                  n === 0 ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 t-sub text-text-3">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={nationalHref({ ...p, page: n })}
                      aria-current={n === win.current ? "page" : undefined}
                      aria-label={`${n}쪽`}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 t-sub font-bold no-underline ${
                        n === win.current ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"
                      }`}
                    >
                      {n}
                    </Link>
                  ),
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
