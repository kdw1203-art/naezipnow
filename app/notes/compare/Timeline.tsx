/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 3곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";

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
      className={`inline-flex items-center gap-0.5 rounded-md bg-[rgba(0,0,0,.035)] chip-pad-tight text-[12px] ${cls}`}
      aria-label={`이전 회차 대비 ${delta > 0 ? "상승" : delta < 0 ? "하락" : "동일"} ${Math.abs(delta)}점`}
    >
      <span aria-hidden="true">{glyph}</span>
      {sign}
    </span>
  );
}

/* [v4 · 규칙 3·5·7] 카드 면 · 시계 아이콘 · 부제("회차별 변화 · 이전 회차 대비 하이라이트")를 걷었다.
   맨 끝 범례("…위 회차·수치는 예시 데이터예요")는 **사실이 아니어서** 지웠다 — 이 표는 2026-07-30 부터 실데이터
   (listNotesByAuthorForApt)다. 회차 이름은 그 노트로 가는 링크(예전 머리 칩 줄이 하던 일) */
export function Timeline({ steps, hrefs = [] }: { steps: TimelineStep[]; hrefs?: string[] }) {
  const last = steps.length - 1;
  return (
    <div>
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={step.n} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3">
            {/* 레일: 회차 점 + 연결선 */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  step.latest
                    ? "bg-primary text-white"
                    : "bg-primary-soft text-primary"
                }`}
              >
                {i + 1}
              </span>
              {i < last && <span className="my-1 w-px flex-1 bg-line" />}
            </div>

            {/* 본문 */}
            <div className={`min-w-0 ${i < last ? "pb-5" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-baseline gap-2">
                  {hrefs[i] ? (
                    <Link
                      href={hrefs[i]}
                      className={`inline-flex min-h-6 items-center t-body font-bold no-underline ${
                        step.latest ? "text-primary" : "text-text-1"
                      }`}
                    >
                      {step.n}
                    </Link>
                  ) : (
                    <b className={`t-body font-bold ${step.latest ? "text-primary" : "text-text-1"}`}>{step.n}</b>
                  )}
                  <span className="t-sub text-text-3">{step.meta}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="t-sub text-text-3">종합</span>
                  <span
                    className={`text-[15px] font-bold ${
                      step.latest ? "text-primary" : "text-text-1"
                    }`}
                  >
                    {step.score}
                  </span>
                  {step.scoreDelta !== null && <ScoreDelta delta={step.scoreDelta} />}
                </div>
              </div>

              <div className="mt-2">
                {step.scoreDelta === null ? (
                  <span className="block t-sub text-text-3">첫 방문 · 비교 기준</span>
                ) : step.changes.length === 0 ? (
                  <span className="block t-sub text-text-3">이전 회차와 같음</span>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {step.changes.map((c) => {
                      const meta = KIND_META[c.kind];
                      return (
                        <li
                          key={c.axis}
                          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs"
                        >
                          <span
                            className={`inline-flex w-[52px] shrink-0 items-center gap-0.5 text-[12px] font-bold ${meta.cls}`}
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

    </div>
  );
}
