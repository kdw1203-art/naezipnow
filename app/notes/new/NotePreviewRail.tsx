"use client";
/* [1026b · 노트 쓰기] 미리보기 카드에 목적·시간대·날씨·
   만족도(입력했을 때)·태그 최대 3(facts — 폼 상태 그대로). */
/* [1026 · 노트 쓰기] 데스크톱(lg+) 오른쪽 레일 "미리보기" — 1025 표준 6(본문 | 레일, 레일 = 결론 요약 + 손잡이 + 액션).
   ① 노트 카드 미리보기(NotePreviewCard — 폼 상태 그대로) ② 완성도 링(필수 1 · 권장 6, lib/notes/form-progress —
   빠진 항목은 그 단계로 옮겨 가는 글자 버튼) ③ 5축 점수 레이더(ScoreRadar · composeScoresFromChecks 결과 그대로 —
   현장 체크를 누르면 바로 바뀐다) ④ 저장 = 이 화면의 채움 파랑 하나(ActionButton, 폼 아래 CTA 는 레일이 있으면 저장을
   그리지 않는다). AI 처리 고지는 저장 버튼 곁에 같이 둔다(몰래 보내지 않는다).

   번들: NoteForm 이 next/dynamic(ssr:false)으로 받고 **lg 에서만 마운트**한다(matchMedia) — 폰은 이 조각을 내려받지 않는다.
   상태는 전부 NoteForm 이 들고, 여기는 그리기만 한다(새 조회·새 계산 없음). */
import Link from "next/link";
import { ActionButton } from "@/app/components/ui/ActionButton";
import { Icon } from "@/app/components/Icon";
import { ScoreRadar } from "@/app/components/viz/ScoreRadar";
import { FieldCaptureConsentNotice } from "@/components/inspection/field-capture-consent";
import type { DecisionChoice } from "@/lib/inspection/decision";
import type { NoteScores } from "@/lib/notes/note-scores";
import type { NoteStep } from "@/lib/notes/form-steps";
import type { Completeness } from "@/lib/notes/form-progress";
import { noteTotalScore, previewRadarItems } from "@/lib/notes/note-preview";
import type { VisitFacts } from "@/lib/notes/finish-summary";
import { NotePreviewCard } from "./NotePreviewCard";

/* 링 — r 24 · 굵기 6 · 60px. 값은 완성도(0~100) 그대로, 숫자는 가운데 HTML 글자(램프 유틸) */
const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

function CompletenessRing({ pct }: { pct: number }) {
  const len = (Math.max(0, Math.min(100, pct)) / 100) * RING_C;
  return (
    <div className="relative h-[60px] w-[60px] shrink-0">
      <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`완성도 ${pct}%`}>
        <circle cx="30" cy="30" r={RING_R} fill="none" stroke="var(--divider)" strokeWidth="6" />
        {len > 0 && (
          <circle
            cx="30"
            cy="30"
            r={RING_R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${len} ${RING_C}`}
            transform="rotate(-90 30 30)"
          />
        )}
      </svg>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center t-sub t-num font-bold text-ink">
        {pct}%
      </span>
    </div>
  );
}

export type NotePreviewRailProps = {
  aptName: string;
  region: string;
  visitDate: string;
  propertyType: string;
  photos: readonly string[];
  decision: DecisionChoice | null;
  isPublic: boolean;
  scores: NoteScores;
  completeness: Completeness;
  checklistDone: number;
  checklistTotal: number;
  step: NoteStep;
  /** 다음 단계의 짧은 이름(어디·무엇·기록) — 마지막 단계면 null */
  nextStepShort: string | null;
  isEdit: boolean;
  saving: boolean;
  saveError: string | null;
  needLogin: boolean;
  loginHref: string;
  /** "비공개 노트 · 이 기기에 자동 저장" — 저장 바와 같은 사실 */
  statusLine: string;
  onSave: () => void;
  onGoStep: (n: NoteStep) => void;
  /** [1026b] 목적 · 시간대 · 날씨 · 만족도 · 태그 — 입력한 것만 카드에 */
  facts?: VisitFacts;
};

export function NotePreviewRail(p: NotePreviewRailProps) {
  const c = p.completeness;
  const total = noteTotalScore(p.scores);
  const missing = c.items.filter((x) => !x.done);
  const saveLabel = p.isEdit ? "수정 완료" : p.step < 3 ? "여기까지 저장" : "기록 완료 → AI 정리 받기";
  return (
    <div className="flex flex-col gap-3">
      {/* [1026b] 단지 사실(이 단지 한눈에)은 1단계 폼 카드 한 곳 — 레일은 쓰는 노트(미리보기·완성도·5축·저장)만 든다.
          레일에 같이 두면 5축 레이더가 저장 카드 밑으로 밀려 첫 화면에서 안 보였다(1280×900 실측). */}
      {/* ① 노트 카드 미리보기 */}
      <section aria-labelledby="note-rail-preview" className="card rounded-2xl p-4">
        <h2 id="note-rail-preview" className="t-section text-ink">
          미리보기
        </h2>
        <div className="mt-2">
          <NotePreviewCard
            aptName={p.aptName}
            region={p.region}
            visitDate={p.visitDate}
            propertyType={p.propertyType}
            photos={p.photos}
            decision={p.decision}
            isPublic={p.isPublic}
            facts={p.facts}
          />
        </div>
      </section>

      {/* ② 완성도 링 + ③ 5축 레이더 — 한 카드(레일이 한 화면 높이 안에 들어오게) */}
      <section aria-labelledby="note-rail-fill" className="card rounded-2xl p-4">
        <h2 id="note-rail-fill" className="t-section text-ink">
          완성도
        </h2>
        <div className="mt-2 flex items-center gap-3">
          <CompletenessRing pct={c.pct} />
          <div className="min-w-0 flex flex-col gap-0.5">
            <p className="t-body font-bold text-ink t-num">
              필수 {c.requiredDone}/{c.requiredTotal} · 권장 {c.optionalDone}/{c.optionalTotal}
            </p>
            <p className="t-sub text-text-3 t-num">
              {p.checklistTotal > 0 ? `체크 ${p.checklistDone}/${p.checklistTotal}` : "체크 목록 없음"} · 사진 {p.photos.length}
            </p>
          </div>
        </div>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0" aria-label="항목별">
          {c.items
            .filter((x) => x.done)
            .map((x) => (
              <li key={x.key} className="inline-flex items-center gap-0.5 t-sub text-text-2">
                <Icon name="check" size={12} className="text-primary" />
                {x.label}
              </li>
            ))}
          {missing.map((x) => (
            <li key={x.key}>
              <button
                type="button"
                onClick={() => p.onGoStep(x.step)}
                aria-label={`${x.label} — ${x.step}단계로`}
                className="inline-flex min-h-6 items-center t-sub font-bold text-text-3 hover:text-primary"
              >
                {x.label}
                {x.required ? " (필수)" : ""} ›
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="t-sub font-bold text-ink">5축 점수</h3>
            <span className="t-caption text-text-3 t-num">{total != null ? `점수 ${total} / 100` : "현장 체크 미입력"}</span>
          </div>
          <ScoreRadar items={previewRadarItems(p.scores)} />
        </div>
      </section>

      {/* ④ 저장 — 이 화면의 채움 파랑 하나. 레일 스크롤 안에서도 바닥에 붙어 늘 손에 닿는다 */}
      <section aria-label="저장" className="card sticky bottom-0 flex flex-col gap-2 rounded-2xl p-4">
        {p.saveError && (
          <p role="alert" className="t-sub font-bold text-danger">
            {p.saveError}
          </p>
        )}
        {p.needLogin && (
          <p className="t-sub text-primary">
            저장에는 로그인이 필요해요. 작성한 내용은 유지돼요.{" "}
            <Link href={p.loginHref} className="inline-block py-[5px] font-bold underline underline-offset-2">
              로그인하기 ›
            </Link>
          </p>
        )}
        <ActionButton
          state={p.saving ? "busy" : p.saveError ? "error" : "idle"}
          onClick={p.onSave}
          busyLabel="저장 중"
          errorLabel="다시 시도해 주세요"
          className="btn-cta w-full rounded-xl px-4 py-3 t-section"
        >
          {saveLabel}
        </ActionButton>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="t-caption text-text-3">{p.statusLine}</span>
          {p.nextStepShort && (
            <button
              type="button"
              onClick={() => p.onGoStep((p.step + 1) as NoteStep)}
              className="inline-flex min-h-6 items-center t-sub font-bold text-primary"
            >
              다음 단계 · {p.nextStepShort} ›
            </button>
          )}
        </div>
        <FieldCaptureConsentNotice />
      </section>
    </div>
  );
}
