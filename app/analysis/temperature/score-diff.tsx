import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, diffDir } from "@/lib/format/delta";

/* [1009 · A] 시장 온도 점수 차 — 등락 표준(▲ 빨강·▼ 파랑·0 은 "보합"), 온도 허브·지역 기록 공용(서버 컴포넌트).
   예전엔 허브가 "±0"·"▲3"(기호만 — 스크린리더는 "위쪽 삼각형"), 지역 기록이 style 로 --danger/--primary 를 직접
   칠했다(테마·다크에서 토큰 규칙 밖). 점수(0~100)의 차이는 %가 아니라 "점"이다. */

/** 글자형 — "▲ 3점" · "보합" */
export function ScoreDiff({ d, unit = "점", sr }: { d: number; unit?: string; sr?: string }) {
  const dir = diffDir(d, 0) ?? "flat";
  if (dir === "flat") return <span className="delta-flat">보합</span>;
  return (
    <span className={`${DELTA_CLASS[dir]} tabular-nums`}>
      <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
      <span className="sr-only">
        {sr ? `${sr} ` : ""}
        {DELTA_WORD[dir]}{" "}
      </span>
      {Math.abs(d)}
      {unit}
    </span>
  );
}

/* [v4 · 규칙 6] 배지형(DiffBadge)은 지웠다 — 허브 목록 행도 글자형(ScoreDiff)을 쓴다 */
