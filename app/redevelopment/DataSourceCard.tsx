/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/**
 * 데이터 출처 — jaegebal 벤치마크의 "데이터 출처" 표(데이터 종류 / 출처 / 업데이트 주기).
 *
 * [v4 · 규칙 3·7] 지도 아래 카드(아이콘 타일 + 파랑 머리 표 + 안내 문장) → 페이지 맨 끝 "데이터 출처" 접힘
 * (app/town/TownHero.tsx TownSources) 안의 1px 선 행. 행 = 데이터 종류(굵게) / 출처 · 업데이트 주기.
 */
export function DataSourceCard({
  sources,
}: {
  sources: { kind: string; source: string; cycle: string }[];
}) {
  return (
    <dl data-tone="hanji" className="divide-y divide-line">
      {sources.map((s) => (
        <div key={s.kind} className="flex items-baseline justify-between gap-3 py-2">
          <dt className="shrink-0 t-sub font-bold text-text-2">{s.kind}</dt>
          <dd className="min-w-0 break-words text-right t-caption text-text-3">
            {s.source} · {s.cycle}
          </dd>
        </div>
      ))}
    </dl>
  );
}
