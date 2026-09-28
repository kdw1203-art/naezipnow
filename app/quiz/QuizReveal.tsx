"use client";

import { useEffect, useState, type Ref } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { pctChange } from "@/lib/format/delta";
import { ymDotLabel, type QuizEntry } from "@/lib/quiz/price-game";

/* [1020 · 게임 /quiz] 공개(reveal) 칸 — 소유자 지시("시안대로 좀더 고도화", quiz-d/m.png)대로 답 줄을 대신하지 않고
   대결판 아래 **새 카드**로: 머리(정답/아쉬워요 · +1 은 정답일 때만) · 두 가격 막대(큰 쪽 100%, A 파랑 B 주홍) ·
   3.3㎡당 두 값 · 차이 한 줄(Delta) · 준공·층 차이(값이 둘 다 있을 때만) · 단지 링크 둘 · 다음 문제 버튼(md+ 카드 안).
   폰의 다음 버튼은 QuizGame 의 sticky 엄지 영역이 맡는다(여기 버튼은 hidden md:inline-flex — 화면당 채움 파랑 1개).
   숫자는 전부 문제 데이터에서 계산한다(지어내지 않는다). */

/** 3.3㎡(1평)당 만원 — 신고 금액 ÷ 전용면적 × 3.3058, 만원 반올림. 면적이 없으면 null */
export function pricePer33(e: Pick<QuizEntry, "priceManwon" | "areaM2">): number | null {
  if (!(e.areaM2 > 0) || !Number.isFinite(e.priceManwon)) return null;
  return Math.round((e.priceManwon / e.areaM2) * 3.3058);
}

/** 준공·층 차이 한 줄 — 둘 다 값이 있는 항목만 적고, 하나도 없으면 null */
export function buildFloorDiffText(a: QuizEntry, b: QuizEntry): string | null {
  const parts: string[] = [];
  if (a.buildYear && b.buildYear) parts.push(`준공 ${Math.abs(a.buildYear - b.buildYear)}년 차이`);
  if (a.floor && b.floor) parts.push(`층 ${Math.abs(a.floor - b.floor)}층 차이`);
  return parts.length ? parts.join(" · ") : null;
}

/** "서울 관악구" → "서울" (막대 왼쪽 짧은 라벨) */
function regionHead(region: string): string {
  return region.trim().split(/\s+/)[0] ?? region;
}

function Bar({
  tag,
  entry,
  pct,
  grown,
}: {
  tag: "A" | "B";
  entry: QuizEntry;
  pct: number;
  grown: boolean;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5">
      <span className="truncate t-sub text-text-2">
        <span className="font-bold text-ink">{tag}</span> {regionHead(entry.region)}
      </span>
      <span className="qz-bar" aria-hidden="true">
        <i className={tag === "A" ? "bg-primary" : "bg-brand-red"} style={{ width: `${grown ? pct : 0}%` }} />
      </span>
      <Won manwon={entry.priceManwon} unit="만" className="t-sub font-bold text-ink" />
    </div>
  );
}

export function QuizReveal({
  a,
  b,
  ok,
  round,
  total,
  onNext,
  nextRef,
}: {
  a: QuizEntry;
  b: QuizEntry;
  ok: boolean;
  /** 0부터 — 방금 푼 문제 번호는 round + 1 */
  round: number;
  total: number;
  onNext: () => void;
  nextRef?: Ref<HTMLButtonElement>;
}) {
  /* 막대는 0 에서 자라 올라온다(CSS transition · 모션 최소화면 즉시) */
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const max = Math.max(a.priceManwon, b.priceManwon);
  const pctOf = (v: number) => (max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0);
  const up = b.priceManwon > a.priceManwon;
  const perA = pricePer33(a);
  const perB = pricePer33(b);
  const diffLine = buildFloorDiffText(a, b);
  const isLast = round + 1 >= total;

  return (
    <section
      className="card overflow-hidden rounded-2xl motion-safe:animate-[scaleIn_260ms_var(--ease-out)_both]"
      aria-label={`${round + 1}번 문제 결과`}
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span
          className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${
            ok ? "bg-success text-on-dark" : "bg-danger-soft text-danger"
          }`}
          aria-hidden="true"
        >
          <Icon name={ok ? "check" : "x"} size={16} strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`t-section ${ok ? "text-success" : "text-danger"}`}>{ok ? "정답" : "아쉬워요"}</p>
          <p className="t-caption text-text-3">
            {round + 1}번 문제 · {ymDotLabel(b.ym)} 계약 기준
          </p>
        </div>
        {ok && (
          <span className="shrink-0 rounded bg-success-soft px-1.5 py-0.5 t-caption font-bold text-success motion-safe:animate-[njnPop_420ms_var(--njn-pop)]">
            +1
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        <Bar tag="A" entry={a} pct={pctOf(a.priceManwon)} grown={grown} />
        <Bar tag="B" entry={b} pct={pctOf(b.priceManwon)} grown={grown} />
        {(perA !== null || perB !== null) && (
          <p className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 t-sub text-text-2">
            <span className="text-text-3">3.3㎡당</span>
            <span className="tabular-nums">
              {perA !== null ? `A ${formatEokMan(perA)}` : ""}
              {perA !== null && perB !== null ? " · " : ""}
              {perB !== null ? `B ${formatEokMan(perB)}` : ""}
            </span>
          </p>
        )}
        {/* [1009 · T] 차이는 등락 표기 한 토막(<Delta>: ▲ 빨강/▼ 파랑 · 금액 먼저 · 기준 = A) */}
        <p className="t-body text-text-1">
          B는 A보다{" "}
          <Delta
            pct={pctChange(b.priceManwon, a.priceManwon)}
            diffManwon={b.priceManwon - a.priceManwon}
            className="font-bold"
          />{" "}
          {up ? "비싸요" : "싸요"}
          {diffLine ? <span className="text-text-3"> · {diffLine}</span> : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
        <Link href={a.href} className="inline-flex min-h-6 items-center gap-1 t-sub font-bold text-text-2">
          <span className="text-ink">A</span> {a.name} 보기 ›
        </Link>
        <Link href={b.href} className="inline-flex min-h-6 items-center gap-1 t-sub font-bold text-primary">
          <span>B</span> {b.name} 보기 ›
        </Link>
      </div>

      <div className="hidden px-4 pb-4 md:block">
        <button
          ref={nextRef}
          type="button"
          onClick={onNext}
          className="btn-primary inline-flex h-[52px] w-full items-center justify-center rounded-xl t-section font-bold"
        >
          {isLast ? "결과 보기" : `다음 문제 (${round + 2} / ${total})`}
        </button>
      </div>
    </section>
  );
}
