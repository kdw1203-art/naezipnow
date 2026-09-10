"use client";

/**
 * [985 · 17] 현장 브리핑 카드 — 위치를 고른 뒤에만 나타난다.
 *
 * 왜 별도 파일 + next/dynamic 인가: 이 카드와 lib/inspection/field-brief.ts 를
 * NoteForm 에 직접 두면 /notes/new 초기 번들이 471KB 가 되어 예산(470KB)을 1KB
 * 넘겼다(실측). 예산을 올리지 않는다 — 필요한 시점(위치 확정)에만 받아 온다.
 * 위치를 안 고르면 이 코드는 내려오지도 않는다.
 *
 * 판정(무엇을 몇 줄까지 믿고 보여줄지)은 여기서 하지 않고 순수 모듈이 한다 —
 * 그 쪽에 단위 테스트가 붙어 있다.
 */
import { briefFetchedLabel, buildFieldBrief } from "@/lib/inspection/field-brief";

export function FieldBriefCard({ context }: { context: unknown }) {
  const brief = buildFieldBrief(context);
  /* 아무것도 없으면 아무것도 그리지 않는다 — 빈 카드는 "조회했는데 없다"를
     "볼 게 없다"로 보이게 한다. */
  if (!brief) return null;
  const fetched = briefFetchedLabel(brief.fetchedAt);

  return (
    <div className="rise-in card flex flex-col gap-2.5 rounded-[14px] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-body font-extrabold text-ink">지금 이 지역은</span>
        {fetched && <span className="shrink-0 t-caption text-text-3">{fetched}</span>}
      </div>
      {brief.lines.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {brief.lines.map((l) => (
            <li key={l.key} className="flex gap-2 t-sub leading-[1.6]">
              <span className="shrink-0 font-bold text-primary">{l.label}</span>
              <span className="min-w-0 text-text-1">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {brief.checks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="t-caption font-bold text-text-3">이 지역에서 특히 볼 것</span>
          <div className="flex flex-wrap gap-1.5">
            {brief.checks.map((c) => (
              /* 누를 수 없는 라벨이다 — 크기를 키우지 않는다(989: 크기는 "눌린다"는
                 신호라, 안 눌리는 것까지 키우면 거짓말이 된다) */
              <span key={c} className="rounded-md bg-bg px-2 py-1 t-caption text-text-2">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {brief.plans.length > 0 && (
        <div className="t-caption text-text-3">
          주변 공개 계획 ·{" "}
          {brief.plans.map((p) => `${p.title} ${p.count}건`).join(" · ")}
        </div>
      )}
    </div>
  );
}
