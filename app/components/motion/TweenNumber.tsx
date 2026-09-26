"use client";

import { useEffect, useRef, useState } from "react";
import { formatByKey, type NumFormatKey } from "@/lib/format/by-key";

/* [1009] 값이 **바뀔 때** 숫자가 이전 값에서 새 값으로 굴러간다(토스 계산기·잔액 관례).
 *
 * CountUp(화면에 처음 들어올 때 0→값)과 역할이 다르다 — 이쪽은 슬라이더·입력으로 결과가
 * 달라지는 계산 화면용이다. 값이 튀면 "무엇이 얼마나 바뀌었는지"를 눈이 놓치는데, 짧게
 * 굴러가면 방향과 크기가 보인다.
 * 규칙: 첫 그림은 최종 값(서버 렌더 그대로) · 320ms ease-out · 모션 최소화면 즉시 · tabular-nums.
 * 스크린리더에는 굴러가는 중간값을 읽히지 않는다(aria-hidden 사본 + 최종 값만 가진 sr-only).
 */
export const TWEEN_MS = 320;

export function useTweenNumber(value: number, ms: number = TWEEN_MS): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    const start = from.current;
    if (reduce || !Number.isFinite(start) || start === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + (value - start) * eased;
      setShown(cur);
      from.current = cur;
      if (p < 1) raf.current = requestAnimationFrame(step);
      else {
        from.current = value;
        raf.current = null;
      }
    };
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [value, ms]);

  return shown;
}

export function TweenNumber({
  value,
  format,
  suffix = "",
  empty = "—",
  className,
}: {
  value: number | null | undefined;
  format: NumFormatKey;
  suffix?: string;
  empty?: string;
  className?: string;
}) {
  const v = typeof value === "number" && Number.isFinite(value) ? value : NaN;
  const shown = useTweenNumber(v);
  if (!Number.isFinite(v)) return <span className={`t-num ${className ?? ""}`}>{empty}</span>;
  const finalText = formatByKey(v, format, suffix);
  return (
    <span className={`t-num ${className ?? ""}`}>
      <span aria-hidden="true">{formatByKey(Number.isFinite(shown) ? shown : v, format, suffix)}</span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}

export default TweenNumber;
