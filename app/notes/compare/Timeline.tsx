/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";
import { seedGradient } from "@/lib/town/shared";

/* [1015 · 규칙 H] 회차별 40px 정사각 썸네일 — 표 머리칸(page.tsx CompareTable)과 타임라인이 같은 부품을 쓴다.
   주소는 호출부가 lib/notes/cover/resolve noteCoverUrl 로 만든다(고른 템플릿 썸네일 → 첫 사진 → 단색 칸). */
export function VisitThumb({ src, seed, size = 40 }: { src: string | null; seed: string; size?: number }) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-lg bg-divider"
      style={{ width: size, height: size }}
    >
      <CoverImage
        src={src}
        alt=""
        sizes={`${size}px`}
        imgClassName="h-full w-full object-cover"
        fallback={<span aria-hidden="true" className="block h-full w-full" style={{ background: seedGradient(seed) }} />}
      />
    </span>
  );
}

/* 시안 9e — 회차 비교 "타임라인" 뷰 (항목 C14)
   page.tsx 의 기존 표 데이터(HEADERS·ROWS·SCORES)를 그대로 파생해
   1차→최신 순서로 회차별 변화(종합 점수 델타 + 바뀐 항목)를 강조한다.
   새 데이터·API 없이 표와 동일한 소스만 사용. (표/타임라인 토글은 CompareView) */

export type Tone = "good" | "avg" | "bad" | "none";

/** 이전 회차 대비 한 항목의 변화 유형 */
export type AxisChangeKind = "improve" | "decline" | "new" | "drop" | "lateral";

export type AxisChange = {
  axis: string;
  from: string;
  to: string;
  toTone: Tone;
  kind: AxisChangeKind;
};

export type TimelineStep = {
  n: string;
  meta: string;
  latest: boolean;
  score: number;
  /** 첫 회차는 null (비교 기준), 이후는 이전 회차 대비 증감 */
  scoreDelta: number | null;
  changes: AxisChange[];
};

const TONE_TEXT: Record<Tone, string> = {
  good: "font-bold text-primary",
  avg: "font-semibold text-text-2",
  bad: "font-bold text-danger",
  none: "text-text-3",
};

/* 방향 색상은 시세 관례(상승=red delta-up / 하락=blue delta-down)를 따른다. */
const KIND_META: Record<AxisChangeKind, { glyph: string; label: string; cls: string }> = {
  improve: { glyph: "▲", label: "개선", cls: "delta-up" },
  decline: { glyph: "▼", label: "악화", cls: "delta-down" },
  new: { glyph: "＋", label: "신규", cls: "text-text-2" },
  drop: { glyph: "–", label: "미기록", cls: "text-text-3" },
  lateral: { glyph: "→", label: "변화", cls: "text-text-2" },
};

function ScoreDelta({ delta }: { delta: number }) {
  const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat";
  const glyph = delta > 0 ? "▲" : delta < 0 ? "▼" : "±";
  const sign = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "0";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md bg-[rgba(0,0,0,.035)] chip-pad-tight t-sub ${cls}`}
      aria-label={`이전 회차 대비 ${delta > 0 ? "상승" : delta < 0 ? "하락" : "동일"} ${Math.abs(delta)}점`}
    >
      <span aria-hidden="true">{glyph}</span>
      {sign}
    </span>
  );
}

export function Timeline({ steps, covers = [] }: { steps: TimelineStep[]; covers?: (string | null)[] }) {
  const last = steps.length - 1;
  return (
    <div className="rise-in-1 card rounded-3xl px-[22px] py-5 max-md:px-3.5 max-md:py-3.5">
      {/* [1015 · 규칙 C] 제목 옆 부연("회차별 변화 · 이전 회차 대비 하이라이트")은 지웠다 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Icon name="clock" size={16} className="text-primary" />
        <h2 className="t-body font-bold text-ink">방문 타임라인</h2>
      </div>

      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={step.n} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3">
            {/* 레일: 회차 점 + 연결선 */}
            <div className="flex flex-col items-center" aria-hidden="true">
              {/* [1015] 임의 그림자 제거 · t-caption → t-caption */}
              <span
                className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full t-caption font-bold ${
                  step.latest ? "bg-primary text-white" : "bg-primary-soft text-primary"
                }`}
              >
                {i + 1}
              </span>
              {i < last && <span className="my-1 w-px flex-1 bg-line" />}
            </div>

            {/* 본문 */}
            <div className={`min-w-0 ${i < last ? "pb-5" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                {/* [1015 · 규칙 H] 회차 썸네일 40px */}
                <div className="flex items-center gap-2">
                  <VisitThumb src={covers[i] ?? null} seed={step.n} />
                  <div className="flex flex-col">
                    <b className={`t-body ${step.latest ? "text-primary" : "text-text-1"}`}>{step.n}</b>
                    <span className="t-sub text-text-3">{step.meta}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="t-sub text-text-3">종합</span>
                  <span className={`t-section font-bold ${step.latest ? "text-primary" : "text-text-1"}`}>
                    {step.score}
                  </span>
                  {step.scoreDelta !== null && <ScoreDelta delta={step.scoreDelta} />}
                </div>
              </div>

              <div className="mt-2">
                {step.scoreDelta === null ? (
                  <p className="t-sub text-text-3">첫 방문 · 비교 기준 회차</p>
                ) : step.changes.length === 0 ? (
                  <p className="t-sub text-text-3">이전 회차와 같음</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {step.changes.map((c) => {
                      const meta = KIND_META[c.kind];
                      return (
                        <li
                          key={c.axis}
                          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 t-sub"
                        >
                          <span
                            className={`inline-flex w-[52px] shrink-0 items-center gap-0.5 t-sub font-bold ${meta.cls}`}
                          >
                            <span aria-hidden="true">{meta.glyph}</span>
                            {meta.label}
                          </span>
                          <span className="font-semibold text-text-1">{c.axis}</span>
                          <span className="text-text-3">{c.from}</span>
                          <span aria-hidden="true" className="text-text-3">
                            →
                          </span>
                          <span className={TONE_TEXT[c.toTone]}>{c.to}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* [1015] "위 회차·수치는 예시 데이터예요" 는 사실이 아니었다(실노트 점수 축) — 지웠다. 범례만 한 줄 */}
      <p className="mt-4 border-t border-line pt-3 t-caption text-text-3">
        ▲ 개선 · ▼ 악화 · 색은 시세 관례(상승 빨강 · 하락 파랑)
      </p>
    </div>
  );
}
