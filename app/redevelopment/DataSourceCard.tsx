import { Icon } from "@/app/components/Icon";
import { PopupSheet } from "@/app/components/PopupSheet";

/**
 * 데이터 출처 — [1182] 표 한 장 + 면책 띠 → 한 줄. 누르면 창에 종류 · 출처 · 갱신 주기.
 * 글자는 예전 표와 같다(RedevelopmentMap 에서만 사용).
 */
export function DataSourceCard({
  sources,
  line,
}: {
  sources: { kind: string; source: string; cycle: string }[];
  /** 한 줄에 같이 적는 기준 문장(면책) */
  line?: string;
}) {
  return (
    <PopupSheet
      title="데이터 출처"
      className="press flex min-h-10 w-full items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-left t-caption text-primary"
      trigger={
        <>
          <Icon name="file-text" size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{line ? `${line} · ` : ""}공개 자료 취합 · 참고용</span>
          <span className="shrink-0 font-bold">데이터 출처 ›</span>
        </>
      }
    >
      <dl className="m-0 flex flex-col divide-y divide-line" data-tone="plain">
        {sources.map((s) => (
          <div key={s.kind} className="flex flex-col gap-0.5 py-2.5">
            <dt className="t-sub font-bold text-ink">{s.kind}</dt>
            <dd className="m-0 t-sub text-text-2">{s.source}</dd>
            <dd className="m-0 t-caption text-text-3">갱신 · {s.cycle}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 t-caption text-text-3">
        {line ? `${line} · ` : ""}공개 자료 취합 · 참고용 · 원문·최신 고시 우선
      </p>
    </PopupSheet>
  );
}
