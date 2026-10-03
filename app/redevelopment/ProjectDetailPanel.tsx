"use client";

import Link from "next/link";
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
import { kstDateLabel } from "@/lib/redevelopment/zone-detail";

/**
 * 선택한 구역의 "진행 상황 + 현황 자료" 패널 (#226).
 *
 * 사실 경계 — 여기서 지어내지 않는 것:
 *   · 우리 데이터에는 **현재 단계(stage_key)** 만 있고 단계별 통과 일자가 없다.
 *     그래서 지나온 칸은 "지나온 것으로 표시"라고만 적고 날짜를 붙이지 않는다.
 *   · 세대수·주소·요약이 없으면 0 이나 "-" 로 채우지 않고 "공개 자료에 없음"이라 적는다.
 *     비어 있는 것과 0 은 다른 사실이다.
 *   · 체크리스트·유의점은 법정 일반 절차 설명이지 이 구역에 대한 확인 결과가 아니다.
 */

/* [1027] 날짜는 한국 날짜로 고정(kstDateLabel) — 이 패널이 구역 상세에서 서버 렌더되므로, 브라우저 시간대로 적으면
   서버 HTML·화면 머리의 날짜와 어긋난다(예전: getFullYear/getMonth/getDate = 보는 사람의 시간대). */
const formatDate = kstDateLabel;

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <dt className="t-caption font-bold text-text-3">{label}</dt>
      <dd className={`mt-0.5 text-[12px] leading-[1.5] ${muted ? "text-text-3" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}

export function ProjectDetailPanel({
  project,
  onClose,
  hideHeader = false,
  detailHref,
}: {
  project: RedevelopmentProject;
  onClose?: () => void;
  /** [1027] 구역 상세 페이지(/redevelopment/[id])는 이름·종류·단계를 페이지 머리(h1)에 이미 적는다 */
  hideHeader?: boolean;
  /** [1027] 목록 화면에서 펼친 패널 → 이 구역의 고유 주소 */
  detailHref?: string;
}) {
  const color = colorForType(project.typeKey);
  const guide = STAGE_GUIDE_BY_KEY[project.stageKey];
  const current = stageOrder(project.stageKey);
  const asOfLabel = project.asOf ?? formatDate(project.updatedAt);
  /* [1027] 구역 상세 페이지에서는 페이지 h1 바로 아래 묶음이라 h2, 목록 화면에서 펼친 패널에서는 구역명(h3) 아래라 h4 */
  const H = hideHeader ? "h2" : "h4";

  return (
    <section className="card flex flex-col gap-3 rounded-2xl px-5 py-4">
      {/* 헤더 */}
      {hideHeader ? null : (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <h3 className="t-section text-ink">{project.name}</h3>
            {project.isSample ? (
              <span className="rounded-full bg-warning-soft chip-pad t-caption font-bold text-warning">
                예시 데이터
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full chip-pad t-sub font-semibold"
              style={{ background: `${color}1a`, color }}
            >
              {labelForType(project.typeKey)}
            </span>
            <span className="rounded-full bg-primary-soft chip-pad t-sub font-semibold text-primary">
              현재 {stageLabel(project.stageKey)}
            </span>
          </div>
        </div>
        {detailHref ? (
          <Link
            href={detailHref}
            prefetch={false}
            className="inline-flex min-h-[40px] shrink-0 items-center rounded-full bg-primary-soft px-3 t-sub font-bold text-primary no-underline"
          >
            구역 상세 ›
          </Link>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="구역 상세 닫기"
            className="press shrink-0 rounded-full border border-line bg-surface p-1.5 text-text-2"
          >
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>
      )}

      {/* ===== 진행 상황 ===== */}
      <div>
        <div className="flex items-baseline justify-between">
          <H className="t-body font-bold text-ink">진행 상황</H>
          <span className="t-caption text-text-3">도시정비법 일반 절차 기준 7단계</span>
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
                    ? "border-primary bg-primary-soft"
                    : state === "past"
                      ? "border-line bg-surface"
                      : "border-dashed border-line bg-surface"
                }`}
              >
                <span
                  className={`t-caption font-bold ${
                    state === "future" ? "text-text-3" : "text-text-2"
                  }`}
                >
                  {s.order}단계
                </span>
                <span
                  className={`text-[12px] font-bold leading-[1.35] ${
                    state === "now"
                      ? "text-primary"
                      : state === "past"
                        ? "text-ink"
                        : "text-text-3"
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
        <p className="mt-1.5 t-caption text-text-3">
          공개 자료에서 확인한 값은 <b className="text-text-2">현재 단계</b> 하나입니다. 각 단계의
          통과 날짜(인가일 등)는 확보하지 못해 표시하지 않습니다. 날짜는 지자체 고시·조합
          공고 기준입니다.
        </p>
      </div>

      {/* ===== 현황 자료 ===== */}
      <div>
        <H className="t-body font-bold text-ink">현황 자료</H>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fact
            label="소재지"
            value={locationLabel(project)}
          />
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
        {project.summary ? (
          <p className="mt-2 rounded-lg bg-surface px-3 py-2 t-sub text-text-1">
            {project.summary}
          </p>
        ) : null}
        {project.sourceUrl ? (
          <a
            href={project.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 t-sub font-bold text-primary no-underline"
          >
            출처 원문 보기 ↗
          </a>
        ) : null}
      </div>

      {/* ===== 이 단계에서 확인할 것 ===== */}
      {guide ? (
        <div>
          <H className="t-body font-bold text-ink">
            {guide.longLabel} 단계에서 확인할 것
          </H>
          <p className="mt-1 t-sub text-text-2">{guide.desc}</p>
          <div className="mt-2 flex gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2">
            <Icon name="warning" size={13} className="mt-px shrink-0 text-warning" />
            <p className="t-sub text-warning">
              <span className="font-bold">유의점 </span>
              {guide.caution}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {guide.checklist.map((c) => (
              <li key={c} className="flex gap-1.5">
                <Icon name="check" size={13} className="mt-px shrink-0 text-primary" />
                <span className="t-sub text-text-2">{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 t-caption text-text-3">
            법정 일반 절차 기준의 확인 목록이에요. 이 구역을 내집나우가 확인한 결과는 아니에요.
          </p>
        </div>
      ) : null}
    </section>
  );
}
