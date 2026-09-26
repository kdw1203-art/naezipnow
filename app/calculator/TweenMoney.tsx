"use client";

import { useEffect, useRef, useState } from "react";
import { eokManParts } from "@/lib/format/eok-man";
import { manwonText, wonParts, wonText } from "@/lib/finance/money";

/* [1009 · T] 굴러가는 금액 — <Won>(숫자 크게·단위 작게) 모양 그대로, 값이 바뀌면 이전 값에서 새 값으로 굴러간다.
 *
 * 왜(2026-09-22 실측): 계산기는 슬라이더를 움직이면 "3억 3,600만원 → 4억 2,000만원"이 한 번에 바뀌어 무엇이 얼마나
 * 달라졌는지 눈이 놓쳤다(TweenNumber 0곳). 공용 TweenNumber 는 글자 한 덩어리(단위 크기 같음)이고 시작값을
 * 줄 수 없어, 실거래가 게임의 "A 가격에서 B 가격으로 굴러가며 공개"를 그릴 수 없었다. 그래서 둘을 더했다:
 *  · 억·만(·원) 토막마다 숫자와 단위를 나눠 그린다(.won/.won-u — 공용 Won 과 같은 클래스),
 *  · `from` — 처음 나타날 때 이 값에서 출발한다(게임 공개). 없으면 첫 그림은 최종 값(서버 렌더와 같다).
 * 규칙은 TweenNumber 와 같다: ease-out³ · 모션 최소화면 즉시 · 스크린리더는 최종 값만(중간값 aria-hidden).
 * (통합자 참고: 공용 TweenNumber 가 from·단위 분리를 받게 되면 이 파일은 그쪽으로 합칠 수 있다.)
 */

export const ROLL_MS = 320;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 값이 바뀌면(또는 from 에서) 굴러가는 숫자. 끝나면 정확히 value. */
export function useRoll(value: number, from?: number, ms: number = ROLL_MS): number {
  const [shown, setShown] = useState(() => (typeof from === "number" && Number.isFinite(from) ? from : value));
  const cur = useRef(shown);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = cur.current;
    if (!Number.isFinite(value) || !Number.isFinite(start) || start === value || prefersReducedMotion()) {
      cur.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = start + (value - start) * (1 - Math.pow(1 - p, 3));
      cur.current = p < 1 ? v : value;
      setShown(p < 1 ? v : value);
      raf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [value, ms]);

  return shown;
}

type Piece = { n: number; u: string };

/** 만원 값 → [억][만원] 토막 */
function manwonPieces(v: number, won: boolean): Piece[] {
  const p = eokManParts(Math.abs(v));
  if (!p) return [];
  const out: Piece[] = [];
  if (p.eok > 0) out.push({ n: p.eok, u: p.man === 0 && won ? "억원" : "억" });
  if (p.man > 0) out.push({ n: p.man, u: won ? "만원" : "만" });
  return out;
}

/** 원 값 → [억][만][원] 토막 */
function wonPieces(v: number): Piece[] {
  const p = wonParts(Math.abs(v));
  if (!p) return [];
  const out: Piece[] = [];
  if (p.eok > 0) out.push({ n: p.eok, u: "억" });
  if (p.man > 0) out.push({ n: p.man, u: p.rest === 0 ? "만원" : "만" });
  if (p.rest > 0) out.push({ n: p.rest, u: "원" });
  if (p.eok > 0 && p.man === 0 && p.rest === 0) out[0] = { n: p.eok, u: "억원" };
  return out;
}

export function TweenMoney({
  value,
  unit = "만원",
  from,
  ms,
  className,
  unitClassName,
}: {
  /** unit 이 "만원"·"만"이면 만원 값, "원"이면 원 값 */
  value: number;
  unit?: "만원" | "만" | "원";
  /** 처음 나타날 때 출발할 값(같은 단위) */
  from?: number;
  ms?: number;
  className?: string;
  unitClassName?: string;
}) {
  const shown = useRoll(value, from, ms);
  const finalText = unit === "원" ? wonText(value) : manwonText(value, unit);
  const v = Math.round(Number.isFinite(shown) ? shown : value);
  const pieces = unit === "원" ? wonPieces(v) : manwonPieces(v, unit === "만원");
  const u = `won-u ${unitClassName ?? ""}`;
  return (
    <span className={`won t-num ${className ?? ""}`}>
      <span aria-hidden="true">
        {pieces.length === 0 ? (
          <>
            0<span className={u}>{unit === "만" ? "" : "원"}</span>
          </>
        ) : (
          <>
            {v < 0 ? "−" : ""}
            {pieces.map((p, i) => (
              <span key={p.u}>
                {i > 0 ? " " : ""}
                {p.n.toLocaleString("ko-KR")}
                <span className={u}>{p.u}</span>
              </span>
            ))}
          </>
        )}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}

export default TweenMoney;

/** [1009 · T] 굴러가는 퍼센트 — "3.04%"(digits 2) · 수익률·전세가율처럼 입력으로 바뀌는 비율 */
export function TweenPercent({
  value,
  digits = 2,
  className,
}: {
  value: number | null;
  digits?: number;
  className?: string;
}) {
  const target = typeof value === "number" && Number.isFinite(value) ? value : NaN;
  const shown = useRoll(Number.isFinite(target) ? target : 0);
  if (!Number.isFinite(target)) return <span className={`t-num ${className ?? ""}`}>—</span>;
  /* 음수는 금액 표기(manwonText)와 같은 "−"(U+2212) — 반올림해 0 이 되면 부호 없이 */
  const fmt = (n: number) => {
    const body = Math.abs(n).toFixed(digits);
    return `${n < 0 && Number(body) !== 0 ? "−" : ""}${body}%`;
  };
  return (
    <span className={`t-num ${className ?? ""}`}>
      <span aria-hidden="true">{fmt(shown)}</span>
      <span className="sr-only">{fmt(target)}</span>
    </span>
  );
}
