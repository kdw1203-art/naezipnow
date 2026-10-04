import { Icon } from "@/app/components/Icon";

/**
 * 데이터 출처 카드 — jaegebal 벤치마크의 "데이터 출처" 표를 재현.
 * 데이터 종류 / 출처 / 업데이트 주기 3열 표. (RedevelopmentMap에서만 사용)
 */
export function DataSourceCard({
  sources,
}: {
  sources: { kind: string; source: string; cycle: string }[];
}) {
  return (
    <section className="card rounded-2xl px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon name="file-text" size={14} />
        </span>
        <h2 className="text-[13px] font-bold text-ink">데이터 출처</h2>
      </div>

      {/* [1030 · G6] 폰(md 미만)은 3열 표가 낱말마다 줄바꿈되고 주기 칸이 "…"로 잘렸다(2026-10-04 운영 실측) →
          폰은 종류별 묶음(종류 제목 + 출처 + 주기 두 줄), 데스크톱은 예전 3열 표 그대로. 글자는 둘이 같다. */}
      <dl className="mt-3 flex flex-col divide-y divide-line rounded-xl border border-line md:hidden">
        {sources.map((s) => (
          <div key={s.kind} className="flex flex-col gap-0.5 px-3 py-2.5">
            <dt className="t-sub font-semibold text-ink">{s.kind}</dt>
            <dd className="m-0 t-sub text-text-2">{s.source}</dd>
            <dd className="m-0 t-caption text-text-3">갱신 · {s.cycle}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 hidden overflow-hidden rounded-xl border border-line md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-primary-soft t-sub font-bold text-primary">
              <th className="px-3 py-2 whitespace-nowrap">데이터 종류</th>
              <th className="px-3 py-2">출처</th>
              <th className="px-3 py-2 whitespace-nowrap">업데이트 주기</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={s.kind} className={i > 0 ? "border-t border-line" : ""}>
                <td className="whitespace-nowrap px-3 py-2 t-sub font-semibold text-ink">
                  {s.kind}
                </td>
                <td className="px-3 py-2 t-sub text-text-2">{s.source}</td>
                <td className="whitespace-nowrap px-3 py-2 t-sub text-text-2">{s.cycle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 t-caption text-text-3">공개 자료 취합 · 참고용 · 원문·최신 고시 우선</p>
    </section>
  );
}
