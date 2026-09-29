/* [1025b] 소유자: "과정과 절차, 내용과 결과도 보여줘 … 안 되어 있다면 구현해줘".
   절차 한 줄 — 화면이 어떤 순서로 무엇을 만들어 내는지(1 담기 → 2 기준 → 3 결과 → 4 결정) 머리 아래 한 줄로 보인다.
   UI-10(절차는 화면당 한 번)을 지킨다: 이 줄 하나뿐이고, 현재 단계는 파란 칩, 지난 단계는 체크, 남은 단계는 회색.
   서버·클라이언트 겸용(상태 없음). 24px 높이 · 폰에서는 가로 스크롤(줄바꿈 없음). */
import { Icon } from "@/app/components/Icon";

export type StepLineItem = { label: string; note?: string };

export function StepLine({
  steps,
  current,
  className = "",
  label = "진행 단계",
}: {
  steps: readonly StepLineItem[];
  /** 0 부터 — 현재 단계 인덱스(steps.length 면 전부 끝) */
  current: number;
  className?: string;
  label?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={`scroll-x-hidden-bar m-0 flex list-none items-center gap-1.5 overflow-x-auto p-0 max-md:-mx-3.5 max-md:px-3.5 ${className}`}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s.label} className="flex shrink-0 items-center gap-1.5">
            <span
              aria-current={now ? "step" : undefined}
              className={`inline-flex min-h-[24px] items-center gap-1 rounded-full border px-2.5 t-caption font-bold ${
                now
                  ? "border-primary bg-primary-soft text-primary"
                  : done
                    ? "border-line bg-surface text-text-2"
                    : "border-line bg-surface text-text-3"
              }`}
            >
              {done ? (
                <Icon name="check" size={12} />
              ) : (
                <span className="t-num">{i + 1}</span>
              )}
              {s.label}
              {s.note && now && <span className="font-normal text-text-3">· {s.note}</span>}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className="t-caption text-text-3">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
