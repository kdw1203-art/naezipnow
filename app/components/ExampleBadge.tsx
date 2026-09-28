/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* 더미데이터 정책(사용자 방침): 실데이터가 아닌 화면·수치에는 반드시 정직한 라벨을 붙인다.
   기존 town/groups·town/experts 페이지의 "예시" 배지 패턴을 공용 컴포넌트로 추출 */

export function ExampleBadge({ label = "예시" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px t-caption font-semibold leading-[1.4] text-text-3">
      {label}
    </span>
  );
}

/** 분석 5종 등 시뮬레이션 화면 공통 캡션 — 결과 근처에 배치 */
export function SimulationNotice({
  text = "입력값 기반 시뮬레이션 결과로 실제 시세·수익과 다를 수 있습니다.",
}: {
  text?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 t-sub leading-[1.5] text-text-3">
      <ExampleBadge label="예시 시뮬레이션" />
      <span>{text}</span>
    </div>
  );
}
