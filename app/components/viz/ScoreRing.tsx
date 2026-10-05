/* [1038 · 시각화] 점수 링 — 0~100 점 하나를 원호로. 노트 판단 카드·단지 결과 요약·오른쪽 레일이 같은 모양을 쓴다.
 * 서버 컴포넌트(JS 0) · 색은 토큰 클래스(stroke-primary · stroke-divider) · 숫자는 가운데. 값이 없으면 호를 그리지 않고 "—". */
export function ScoreRing({
  score,
  size = 96,
  label = "/ 100",
  ariaLabel,
  className = "",
}: {
  score: number | null;
  size?: number;
  /** 숫자 아래 작은 글자 */
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const stroke = Math.max(6, Math.round(size / 13));
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const dash = (circumference * v) / 100;
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? (score == null ? "점수 없음" : `${score}점 (100 만점)`)}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block" aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" className="stroke-divider" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            className="stroke-primary"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${size >= 96 ? "t-title" : "t-section"} t-num font-bold text-ink`}>{score == null ? "—" : score}</span>
        {label && <span className="mt-0.5 t-caption text-text-3">{label}</span>}
      </div>
    </div>
  );
}
