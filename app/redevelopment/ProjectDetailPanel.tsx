"use client";

import { Icon } from "@/app/components/Icon";
import {
  STAGES,
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  stageOrder,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { STAGE_GUIDE_BY_KEY } from "@/lib/redevelopment/stage-guide";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/**
 * 선택한 구역의 "진행 상황 + 현황 자료" 패널 (#226).
 *
 * 사실 경계 — 여기서 지어내지 않는 것:
 *   · 우리 데이터에는 **현재 단계(stage_key)** 만 있고 단계별 통과 일자가 없다.
 *     그래서 지나온 칸은 "지나온 것으로 표시"라고만 적고 날짜를 붙이지 않는다.
 *   · 세대수·주소·요약이 없으면 0 이나 "-" 로 채우지 않고 "공개 자료에 없음"이라 적는다.
 *     비어 있는 것과 0 은 다른 사실이다.
 *   · 체크리스트·유의점은 법정 일반 절차 설명이지 이 구역에 대한 확인 결과가 아니다.
 *
 * [v4] 카드 → 지도 아래 섹션(1px 위 선). 현황 자료 사실 상자 4개(카드 안에 카드) → 1px 선 행(dl),
 * 색 알약 배지 둘 → 사실 한 줄, 경고 면 상자 · 체크 아이콘 → 접힘 안의 글자 목록, 설명 문장은 명사형 캡션으로.
 * "예시 데이터" 표식은 지어낸 값이 섞인 구역을 알리는 정직성 표기라 그대로 남긴다(글자만).
 */

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 t-sub text-text-3">{label}</dt>
      <dd className={`min-w-0 break-words text-right t-sub ${muted ? "text-text-3" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export function ProjectDetailPanel({
  project,
  onClose,
}: {
  project: RedevelopmentProject;
  onClose?: () => void;
}) {
  const color = colorForType(project.typeKey);
  const guide = STAGE_GUIDE_BY_KEY[project.stageKey];
  const current = stageOrder(project.stageKey);
  const asOfLabel = project.asOf ?? formatDate(project.updatedAt);

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-4" aria-label={`${project.name} 상세`}>
      {/* 머리 — 이름(사업종류 색 점 = 지도 마커 범례) + 사실 한 줄 · 닫기 */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
            <h3 className="t-section text-ink">{project.name}</h3>
          </div>
          <p className="mt-0.5 t-sub text-text-3">
            {labelForType(project.typeKey)} · 현재 <b className="font-bold text-text-2">{stageLabel(project.stageKey)}</b>
            {project.isSample ? <span className="font-bold text-warning"> · 예시 데이터</span> : null}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="구역 상세 닫기"
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-2"
          >
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </div>

      {/* ===== 진행 상황 ===== */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="t-body font-bold text-ink">진행 상황</h4>
          <span className="shrink-0 t-caption text-text-3">도시정비법 일반 절차 7단계</span>
        </div>
        <ol className="mt-2 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {STAGES.map((s) => {
            const state = s.order < current ? "past" : s.order === current ? "now" : "future";
            return (
              <li
                key={s.key}
                aria-current={state === "now" ? "step" : undefined}
                className={`flex min-w-[84px] shrink-0 flex-col gap-1 rounded-lg border px-2 py-1.5 ${
                  state === "now"
                    ? "border-brand-hanji-ink bg-brand-hanji"
                    : state === "past"
                      ? "border-line bg-surface"
                      : "border-dashed border-line bg-surface"
                }`}
              >
                <span className={`text-[10px] font-bold ${state === "future" ? "text-text-3" : "text-text-2"}`}>
                  {s.order}단계
                </span>
                <span
                  className={`text-[12px] font-bold leading-[1.35] ${
                    state === "now" ? "text-primary" : state === "past" ? "text-ink" : "text-text-3"
                  }`}
                >
                  {s.label}
                </span>
                <span className="t-caption text-text-3">
                  {state === "now" ? "현재" : state === "past" ? "지나온 단계" : "남은 단계"}
                </span>
              </li>
            );
          })}
        </ol>
        {/* [v4 · 규칙 3] 설명 문장("공개 자료에서 확인한 건 현재 단계 하나예요 …") → 명사형 캡션 한 줄 */}
        <p className="mt-1 t-caption text-text-3">
          공개 자료 확인 = 현재 단계 하나 · 단계별 통과일(인가일) 미확보 — 날짜는 지자체 고시·조합 공고
        </p>
      </div>

      {/* ===== 현황 자료 — [v4] 사실 상자 4개 → 1px 선 행 ===== */}
      <div>
        <h4 className="t-body font-bold text-ink">현황 자료</h4>
        <dl data-tone="sand" className="mt-1 divide-y divide-line">
          <Fact label="소재지" value={locationLabel(project)} />
          <Fact
            label="예정 세대수"
            value={
              project.households != null
                ? `${project.households.toLocaleString("ko-KR")}세대`
                : "공개 자료에 없음"
            }
            muted={project.households == null}
          />
          <Fact
            label="자료 기준 시점"
            value={asOfLabel ? `${asOfLabel} 기준` : "기준 시점 미상"}
            muted={!asOfLabel}
          />
          <Fact label="출처" value={project.source ?? "출처 표기 없음"} muted={!project.source} />
        </dl>
        {project.summary ? <p className="mt-2 t-sub text-text-1">{project.summary}</p> : null}
        {project.sourceUrl ? (
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-line mt-2 inline-block t-sub font-bold text-primary no-underline"
          >
            출처 원문 보기 ↗
          </a>
        ) : null}
      </div>

      {/* ===== 이 단계에서 확인할 것 — [v4] 경고 면 상자 · 체크 아이콘 목록 → 접힘 안 글자 목록 ===== */}
      {guide ? (
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            {guide.longLabel} 단계에서 확인할 것
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-2 pb-2">
            <p className="t-sub text-text-2">{guide.desc}</p>
            <p className="t-sub text-warning">
              <span className="font-bold">유의점 </span>
              {guide.caution}
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {guide.checklist.map((c) => (
                <li key={c} className="t-sub text-text-2">
                  {c}
                </li>
              ))}
            </ul>
            <p className="t-caption text-text-3">법정 일반 절차 설명 — 이 구역의 확인 결과가 아니라 직접 확인할 목록</p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
