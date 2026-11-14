/* [1174] 단계 안내 한 줄 — 소유자 2026-11-12 "이런 거는 한 줄이나 두 줄로 끝내자".
   단계마다 카드 한 장(번호 · 제목 · 설명 3줄)이던 것을 번호 칩 + 제목을 › 로 잇는 한 줄로, 꼭 필요한 사실은 아래 한 줄로.
   폰에서 칸이 모자라면 칩 단위로 다음 줄로 넘어간다(글자가 잘리지 않는다). 서버 조각 · 상호작용 없음. */
export function StepStrip({
  steps,
  note,
  label,
  className = "",
}: {
  steps: readonly string[];
  /** 아래 한 줄 — 없으면 그리지 않는다 */
  note?: string | null;
  /** 화면 읽기 프로그램용 이름 */
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <ol aria-label={label} className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1 p-0">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5 t-sub">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft t-caption font-bold text-primary">
              {i + 1}
            </span>
            <span className="font-bold text-ink">{s}</span>
            {/* 화살표는 칸 뒤에 붙인다 — 줄이 바뀌어도 새 줄이 › 로 시작하지 않는다 */}
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="text-text-3">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
      {note && <p className="m-0 t-caption text-text-3">{note}</p>}
    </div>
  );
}
