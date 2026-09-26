"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/app/components/Icon";
import { Switch } from "@/app/components/ui/Switch";
import { CharCount } from "@/app/components/ui/CharCount";
import { NotePhotoStrip, NoteUploadProgress } from "./NotePhotoBlocks";
import type { UploadItem } from "./NoteForm";

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
  /** 메모에서 체크리스트 힌트를 뽑는다(NoteForm 이 groupChecked 와 대조) */
  onMemoBlur: (memo: string) => void;
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
}) {
  /* [967 · 8] 본문 자동 높이 — 내용만큼 자라고(4줄 최소) 40vh 에서 멈춰 안에서 스크롤.
     height 대신 min-height 를 밀어 사용자가 손잡이로 키운 높이는 지킨다. */
  const memoRef = useRef<HTMLTextAreaElement>(null);
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
        <div className="text-[13px] font-extrabold text-ink">
          메모 <span className="text-xs font-medium text-text-3">현장에서 본 그대로</span>
        </div>
        {/* [967 · 8] 자동 높이(4줄~40vh) · 세로 손잡이 · 글자 수(maxLength 와 같은 상한) */}
        <textarea
          ref={memoRef}
          value={p.memo}
          onChange={(e) => p.onMemoChange(e.target.value.slice(0, p.memoMax))}
          onBlur={() => p.onMemoBlur(p.memo)}
          rows={4}
          maxLength={p.memoMax}
          className="w-full resize-y overflow-y-auto rounded-xl bg-bg p-3.5 text-[13px] leading-[1.55] text-text-1 outline-none placeholder:text-text-3"
          placeholder="예: 남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음"
          aria-label="메모"
        />
        <div className="-mt-1.5 flex justify-end">
          <CharCount value={p.memo} max={p.memoMax} />
        </div>

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
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-line-strong p-[11px] text-center t-body font-bold text-text-2 disabled:opacity-60"
          >
            <Icon name="📷" size={16} className="inline shrink-0 align-middle" />
            {p.uploading ? "업로드 중…" : `사진 추가 (${p.photos.length}/${p.maxPhotos})`}
          </button>
          <button
            type="button"
            onClick={p.onCapture}
            disabled={p.uploading || p.photos.length >= p.maxPhotos}
            aria-label="카메라로 촬영해 사진 추가"
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-line-strong bg-surface px-4 p-[11px] t-body font-bold text-text-1 disabled:opacity-60 pointer-fine:hidden"
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
          <div className="t-body font-extrabold text-ink">공개 노트로 저장</div>
          <div className="mt-0.5 t-sub text-text-3">
            {p.isPublic
              ? p.visibilityFromPrefs
                ? "공개 피드에 노출돼요 · 설정에서 정한 기본값 · 노트당 최초 공개 시 100P 적립"
                : "공개 피드에 노출돼요 · 노트당 최초 공개 시 100P 적립"
              : p.visibilityFromPrefs
                ? "꺼져 있으면 나만 볼 수 있어요 · 설정에서 정한 기본값"
                : "꺼져 있으면 나만 볼 수 있어요 (기본값)"}
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
            <span className="block t-body font-extrabold text-ink">
              내집나우 공식 소셜 소재 활용 동의 (선택)
            </span>
            <span className="mt-0.5 block t-sub text-text-3">
              이 노트의 지역·단지명·요약·체감 점수를 내집나우 공식 인스타그램 릴스·유튜브 쇼츠
              영상으로 만들어 게시하는 데 동의해요. 동의는 노트 수정에서 언제든 철회할 수 있고,
              철회하면 이후 소재로 쓰이지 않아요.
            </span>
          </span>
        </label>
      )}
    </>
  );
}
