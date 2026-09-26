import {
  DELTA_ARROW,
  DELTA_BADGE_CLASS,
  DELTA_CLASS,
  DELTA_WORD,
  absManwonText,
  absPctText,
  deltaDir,
  diffDir,
  type DeltaDir,
} from "@/lib/format/delta";

/* [1009] 등락 한 토막 — ▲ 빨강 / ▼ 파랑 / 보합 회색 / 모르면 "변동 미상".
 *
 * 규칙은 lib/format/delta.ts 한 곳(색 = --up/--down 토큰, 테마를 타지 않는다). 서버 컴포넌트.
 * 색만으로 뜻을 전하지 않는다 — 화살표가 모양으로, 숨은 낱말("상승"/"하락")이 스크린리더로 전한다.
 *
 *   <Delta pct={3.24} />                           ▲ 3.2%
 *   <Delta pct={-1.1} diffManwon={-1200} />        ▼ 1,200만원 (1.1%)
 *   <Delta pp={1.23} />                            ▲ 1.2%p   (이미 %인 값의 차이 — 전세가율 등)
 *   <Delta pct={0.02} />                           보합
 *   <Delta pct={null} />                           변동 미상  (hideUnknown 이면 아무것도 안 그린다)
 *   variant="badge" → 연한 면(.delta-up-b) · 목록 오른쪽 끝 배지
 */
export function Delta({
  pct,
  pp,
  diffManwon,
  digits = 1,
  variant = "text",
  flatLabel = "보합",
  unknownLabel = "변동 미상",
  hideUnknown = false,
  srContext,
  className,
}: {
  /** 변동률(%) — 방향도 이 값으로 정한다 */
  pct?: number | null;
  /** %p 차이(값 자체가 %인 지표) — pct 대신 쓴다 */
  pp?: number | null;
  /** 만원 차이 — 있으면 "1,200만원 (1.1%)" 으로 금액을 앞에 */
  diffManwon?: number | null;
  digits?: number;
  variant?: "text" | "badge";
  flatLabel?: string;
  unknownLabel?: string;
  hideUnknown?: boolean;
  /** 스크린리더에만 읽히는 비교 기준 — "1년 전보다" */
  srContext?: string;
  className?: string;
}) {
  const usePp = pp !== undefined && pp !== null;
  const dir: DeltaDir | null = usePp ? diffDir(pp, 0.05) : deltaDir(pct);
  /* 배지 바탕은 기존 `.delta`(캡션 크기·여백), 글자형은 부모 크기를 따르는 `.delta-t` */
  const cls = variant === "badge" ? "delta" : "delta-t";
  if (dir === null) {
    if (hideUnknown) return null;
    return <span className={`${cls} delta-flat ${variant === "badge" ? "delta-flat-b" : ""} ${className ?? ""}`}>{unknownLabel}</span>;
  }
  const tone = variant === "badge" ? `${DELTA_CLASS[dir]} ${DELTA_BADGE_CLASS[dir]}` : DELTA_CLASS[dir];
  if (dir === "flat") {
    return (
      <span className={`${cls} ${tone} ${className ?? ""}`}>
        {srContext && <span className="sr-only">{srContext} </span>}
        {flatLabel}
      </span>
    );
  }
  const main = usePp ? `${absPctText(pp as number, digits)}p` : absPctText(pct as number, digits);
  const money = !usePp && diffManwon !== undefined && diffManwon !== null && Number.isFinite(diffManwon) && Math.round(diffManwon) !== 0;
  return (
    <span className={`${cls} ${tone} ${className ?? ""}`}>
      <span aria-hidden="true" className="delta-arrow">
        {DELTA_ARROW[dir]}
      </span>
      <span className="sr-only">
        {srContext ? `${srContext} ` : ""}
        {DELTA_WORD[dir]}{" "}
      </span>
      {money ? (
        <>
          {absManwonText(diffManwon as number)}
          <span className="delta-sub"> ({main})</span>
        </>
      ) : (
        main
      )}
    </span>
  );
}

export default Delta;
