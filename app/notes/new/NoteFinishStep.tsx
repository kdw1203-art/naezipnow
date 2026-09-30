"use client";
/* [1026b · 노트 쓰기] 메모 아래 "메모에서 찾은 점검 제안"(2단계와 같은 값 — lib/notes/form-extras memoHintsFor, 누르면 체크리스트에 담기 + 토스트) ·
   미리보기 카드·요약 줄에 목적·시간대·날씨·만족도(입력했을 때)·태그 최대 3(summary 에 실려 온 폼 상태 그대로). */
/* [1026 · 노트 쓰기] 저장 전 요약 → 폰 "미리보기" 접힘(<details> 닫힘 · 노트 카드 미리보기 + 요약 줄 · 제목 옆 완성도 한 줄). 데스크톱은 레일이 대신(lg:hidden). */
/* [1023 · 임장노트] docs/review-1022.md 1장 ① — 3단계 끝(저장 버튼 위)에 "저장 전 요약" 카드: 단지 · 방문일 · 점수 5축 · 체크 N/M · 사진 N ·
   판단 · 메모 첫 줄. 폼 상태만 줄로 만든다(lib/notes/finish-summary) — 새 데이터 없음. summary prop 은 선택(없으면 안 그린다).
   [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Icon } from "@/app/components/Icon";
import { Switch } from "@/app/components/ui/Switch";
import { CharCount } from "@/app/components/ui/CharCount";
import { NotePhotoStrip, NoteUploadProgress } from "./NotePhotoBlocks";
import { NotePreviewCard } from "./NotePreviewCard";
import type { UploadItem } from "./NoteForm";
import { finishSummaryRows, type FinishSummaryInput } from "@/lib/notes/finish-summary";
import { decisionLabel, type DecisionChoice } from "@/lib/inspection/decision";
import type { ChecklistGroupDef } from "@/lib/inspection/checklist";
import { memoHintsFor } from "@/lib/notes/form-extras";
import { useToast } from "@/app/components/toast/ToastProvider";

/* [1006] 3단계 "무엇을 남길까"의 본문 — 메모 · 사진 줄 · 사진 추가/촬영 · 공개 스위치 ·
   소셜 소재 동의. NoteForm 에서 분리해 next/dynamic 으로 받는다(DecisionStep·NoteDetailFields
   와 같은 판단: 그 단계에 들어갔을 때만 내려받고, 상태는 NoteForm 이 든다 — 단계를 오가며
   언마운트돼도 입력은 남는다). /notes/new 첫 로드에서 ~2.6KB + Switch·CharCount 모듈이 빠진다.
   984 의 "hidden 으로 감출 뿐 언마운트하지 않는다"는 상태가 폼 안에 있던 때의 말이다 —
   지금은 전부 NoteForm 상태라 언마운트해도 잃는 게 없다. */

export function NoteFinishStep(p: {
  memo: string;
  memoMax: number;
  onMemoChange: (v: string) => void;
  /** [1026b] 메모 제안 재료 — 지금 목적의 체크리스트 · 체크 상태(NoteForm 상태). 누르면 체크리스트에 담는다 */
  checklistGroups: ChecklistGroupDef[];
  groupChecked: Record<string, boolean>;
  setGroupChecked: Dispatch<SetStateAction<Record<string, boolean>>>;
  photos: string[];
  maxPhotos: number;
  uploading: boolean;
  onRemovePhoto: (url: string) => void;
  onShiftPhoto: (index: number, dir: -1 | 1) => void;
  onCoverPhoto: (index: number) => void;
  uploads: UploadItem[];
  uploadSummary: string;
  onRetryUploads: () => void;
  onDismissUploads: () => void;
  onPick: () => void;
  onCapture: () => void;
  isPublic: boolean;
  onTogglePublic: () => void;
  /** [1006] 공개 기본값이 설정(uiPrefs)에서 왔는가 — 꺼짐 문구가 "(기본값)"이라고 거짓말하지 않게 */
  visibilityFromPrefs: boolean;
  socialShareConsent: boolean;
  onSocialConsent: (v: boolean) => void;
  /** [1023] 저장 전 요약 재료 — NoteForm 의 상태 그대로(판단은 choice 로 받아 여기서 라벨로 — 초기 번들에 decision 모듈을 넣지 않는다).
      생략하면 요약 카드를 그리지 않는다 */
  summary?: Omit<FinishSummaryInput, "decisionLabel"> & { decision: DecisionChoice | null };
  /** [1026] 폰 "미리보기" 접힘의 재료 — 방문 유형 · 완성도 한 줄("완성도 60% · 체크 12/30"). 생략하면 카드 없이 요약 줄만 */
  preview?: { propertyType: string; line: string };
}) {
  /* [967 · 8] 본문 자동 높이 — 내용만큼 자라고(4줄 최소) 40vh 에서 멈춰 안에서 스크롤.
     height 대신 min-height 를 밀어 사용자가 손잡이로 키운 높이는 지킨다. */
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();
  /* [1026b] 2단계 "더 자세히 적기" 안의 제안과 같은 값 — 메모(퀵모드 한 줄 · 음성 전사 포함)에서 뽑고 이미 체크한 것은 뺀다 */
  const memoHints = memoHintsFor(p.memo, p.checklistGroups, p.groupChecked);
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.minHeight = "0px";
    const cap = Math.round(window.innerHeight * 0.4);
    el.style.minHeight = `${Math.min(el.scrollHeight, cap)}px`;
    el.style.maxHeight = `${cap}px`;
  }, [p.memo]);

  return (
    <>
      {/* 메모 + 사진 */}
      <div className="rise-in-6 card flex flex-col gap-2.5 p-4">
        {/* [1015 · 규칙 C] 제목 옆 부연("현장에서 본 그대로")은 지웠다 — placeholder 가 예를 든다 */}
        <div className="t-body font-bold text-ink">메모</div>
        {/* [967 · 8] 자동 높이(4줄~40vh) · 세로 손잡이 · 글자 수(maxLength 와 같은 상한) */}
        <textarea
          ref={memoRef}
          value={p.memo}
          onChange={(e) => p.onMemoChange(e.target.value.slice(0, p.memoMax))}
          rows={4}
          maxLength={p.memoMax}
          className="w-full resize-y overflow-y-auto rounded-xl bg-bg p-3.5 t-body leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
          placeholder="예: 남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음"
          aria-label="메모"
        />
        <div className="-mt-1.5 flex justify-end">
          <CharCount value={p.memo} max={p.memoMax} />
        </div>
        {memoHints.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-primary/20 bg-primary-soft/40 px-3 py-2.5">
            <div className="t-sub font-bold text-primary">메모에서 찾은 점검 제안</div>
            <div className="flex flex-wrap gap-1.5">
              {memoHints.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    p.setGroupChecked((prev) => ({ ...prev, [h.id]: true }));
                    showToast(`체크리스트에 담았어요 · ${h.label}`);
                  }}
                  className="rounded-full border border-primary/30 bg-surface px-2.5 py-1 t-sub font-bold text-primary max-md:min-h-10"
                >
                  ＋ {h.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <NotePhotoStrip
          photos={p.photos}
          onRemove={p.onRemovePhoto}
          onShift={p.onShiftPhoto}
          onCover={p.onCoverPhoto}
        />

        {/* [967 · 1·6] 업로드 진행 줄 — 파일별 done/failed, XHR 진행률이 오면 %
            [970 · B-12] 상단 버튼 아래에도 같은 블록(라이브 영역은 여기 한 곳) */}
        <NoteUploadProgress
          uploads={p.uploads}
          live
          summary={p.uploadSummary}
          onRetry={p.onRetryUploads}
          onDismiss={p.onDismissUploads}
        />
        {/* [968 · 32] 하단에도 촬영 버튼 — 수정 모드(상단 블록 없음)에서도 현장 촬영이 되게 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={p.onPick}
            disabled={p.uploading || p.photos.length >= p.maxPhotos}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-line-strong p-[11px] text-center t-body font-bold text-text-2 disabled:opacity-60"
          >
            <Icon name="camera" size={16} className="inline shrink-0 align-middle" />
            {p.uploading ? "업로드 중…" : `사진 추가 (${p.photos.length}/${p.maxPhotos})`}
          </button>
          <button
            type="button"
            onClick={p.onCapture}
            disabled={p.uploading || p.photos.length >= p.maxPhotos}
            aria-label="카메라로 촬영해 사진 추가"
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-line-strong bg-surface px-4 p-[11px] t-body font-bold text-text-1 disabled:opacity-60 pointer-fine:hidden"
          >
            <Icon name="camera" size={16} className="inline shrink-0 align-middle" />
            촬영
          </button>
        </div>
      </div>

      {/* 공개/비공개 선택 — 기본 비공개, 저장 직전 명시적 선택.
          [1006] 설정(표시·기록 기본값)에서 공개를 골라 둔 사람은 공개로 시작한다 — 그 사실을 적는다 */}
      <button
        type="button"
        role="switch"
        aria-checked={p.isPublic}
        onClick={p.onTogglePublic}
        className="rise-in-6 card flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="t-body font-bold text-ink">공개 노트로 저장</div>
          <div className="mt-0.5 t-sub text-text-3">
            {p.isPublic
              ? p.visibilityFromPrefs
                ? "공개 피드 노출 · 설정에서 정한 기본값 · 노트당 최초 공개 시 100P"
                : "공개 피드 노출 · 노트당 최초 공개 시 100P"
              : p.visibilityFromPrefs
                ? "나만 보기 · 설정에서 정한 기본값"
                : "나만 보기 (기본값)"}
          </div>
        </div>
        <Switch on={p.isPublic} />
      </button>

      {/* 소셜 소재 활용 동의 — 공개 노트일 때만 노출. 동의 없인 자동 소재로
          쓰이지 않는다(저작권·동의 원칙). 문구에 활용 범위를 그대로 적는다. */}
      {p.isPublic && (
        <label className="card flex cursor-pointer items-start gap-3 p-4">
          <input
            type="checkbox"
            checked={p.socialShareConsent}
            onChange={(e) => p.onSocialConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">
              내집나우 공식 소셜 소재 활용 동의 (선택)
            </span>
            <span className="mt-0.5 block t-sub text-text-3">
              이 노트의 지역·단지명·요약·체감 점수를 내집나우 공식 인스타그램 릴스·유튜브 쇼츠
              영상으로 만들어 게시하는 데 동의합니다. 동의는 노트 수정에서 언제든 철회할 수 있고,
              철회 후에는 소재로 쓰이지 않습니다.
            </span>
          </span>
        </label>
      )}

      {/* [1023 · 임장노트 ①] 저장 전 요약 — 저장 버튼 바로 위. 없는 값은 "—"(지어내지 않는다)
          [1026 · 노트 쓰기] 폰 = "미리보기" 접힘(<details>, 닫힘) — 노트 카드 미리보기(NotePreviewCard) + 요약 줄. 요약 줄
          제목에 완성도 한 줄을 단다. 데스크톱(lg+)은 오른쪽 레일(NotePreviewRail)이 같은 것을 늘 보여 주므로 여기선 숨긴다. */}
      {p.summary && (
        <section className="rise-in-6 card flex flex-col p-4 max-md:p-3.5 lg:hidden" aria-label="저장 전 요약">
          <details>
            <summary className="min-h-10 cursor-pointer py-2 t-body font-bold text-ink">
              미리보기
              {p.preview && (
                <span className="ml-1.5 t-sub font-normal text-text-3">{p.preview.line}</span>
              )}
            </summary>
            <div className="mt-1 flex flex-col gap-2">
              {p.preview && (
                <NotePreviewCard
                  aptName={p.summary.aptName}
                  region={p.summary.region}
                  visitDate={p.summary.visitDate}
                  propertyType={p.preview.propertyType}
                  photos={p.photos}
                  decision={p.summary.decision}
                  isPublic={p.isPublic}
                  facts={p.summary}
                />
              )}
              <dl className="m-0 flex flex-col divide-y divide-line" data-tone="plain">
                {finishSummaryRows({
                  ...p.summary,
                  decisionLabel: p.summary.decision ? decisionLabel(p.summary.decision) : null,
                }).map((r) => (
                  <div key={r.label} className="flex min-h-[32px] items-baseline gap-3 py-1.5">
                    <dt className="w-14 shrink-0 t-sub text-text-3">{r.label}</dt>
                    <dd className="m-0 min-w-0 flex-1 break-words t-sub text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        </section>
      )}
    </>
  );
}
