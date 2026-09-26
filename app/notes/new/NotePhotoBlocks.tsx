"use client";

import { Icon } from "@/app/components/Icon";
import type { UploadItem } from "./NoteForm";

/* [1006] 사진 줄·업로드 진행 블록 — NoteForm 에서 분리해 next/dynamic 으로 받는다.
   둘 다 **사진을 고른 뒤에만** 그려진다(photos·uploads 가 비면 null). /notes/new 첫 로드
   예산(470KB, 1005 기준 468KB)에서 이 두 블록(~3.7KB)을 빼 새 기능(설정 기본값·재방문
   배지)을 얹을 자리를 만들었다. 상태·동작은 전부 NoteForm 이 들고, 여기는 그리기만 한다.
   타입은 NoteForm 의 UploadItem 을 type-only 로 되가져온다(런타임 의존 없음). */

/* [970 · B-12] 업로드 진행·실패 블록 — 상단 "사진 먼저 담기" 아래와 하단 사진 섹션
   두 곳에 그린다. 라이브 영역(role=status)은 한 곳(live=true)만 — 같은 변화를 두 번 읽어
   주지 않는다. */
export function NoteUploadProgress({
  uploads,
  live,
  summary,
  onRetry,
  onDismiss,
}: {
  uploads: UploadItem[];
  live: boolean;
  /** "N장 중 M장 올렸어요" 등 — NoteForm 이 note-form-utils 로 만든 요약 줄 */
  summary: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (uploads.length === 0) return null;
  const uploading = uploads.some((u) => u.status === "uploading");
  const failed = uploads.filter((u) => u.status === "failed").length;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* 라이브 영역은 요약 줄만 — 파일별 % 까지 읽어 주면 소음이 된다 */}
        <span role={live ? "status" : undefined} className="t-sub font-bold text-text-1">
          {summary}
        </span>
        {failed > 0 && !uploading && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="btn-soft min-h-[36px] rounded-lg px-3 t-sub font-bold"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="실패한 사진 목록 닫기"
              className="tap grid h-7 w-7 place-items-center rounded-full text-text-3"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>
      <ul className="flex gap-2 overflow-x-auto" aria-label="업로드 중인 사진">
        {uploads.map((u) => (
          <li key={u.id} className="relative shrink-0">
            {u.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.preview}
                alt={u.name}
                className={`h-12 w-16 rounded-lg object-cover ${
                  u.status === "failed" ? "opacity-50 grayscale" : ""
                }`}
              />
            ) : (
              <span className="grid h-12 w-16 place-items-center rounded-lg bg-bg text-text-3">
                <Icon name="camera" size={16} />
              </span>
            )}
            {u.status === "uploading" && (
              <span className="absolute inset-0 grid place-items-center rounded-lg bg-brand-navy/45 t-caption font-bold text-on-dark">
                {typeof u.pct === "number" ? (
                  `${u.pct}%`
                ) : (
                  <span className="njn-ring" aria-hidden="true" />
                )}
              </span>
            )}
            {u.status === "done" && (
              <span className="absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-success text-on-dark">
                <Icon name="check" size={11} />
              </span>
            )}
            {u.status === "failed" && (
              <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-danger px-1 text-center t-caption font-bold text-white">
                실패
              </span>
            )}
            <span className="sr-only">
              {u.name} —{" "}
              {u.status === "uploading"
                ? "업로드 중"
                : u.status === "done"
                  ? "완료"
                  : `실패${u.error ? `: ${u.error}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
      {failed > 0 && !uploading && (
        <p className="t-caption text-text-3">
          {uploads.find((u) => u.status === "failed")?.error ?? "사진 업로드에 실패했어요."}{" "}
          성공한 사진은 그대로 남아 있어요.
        </p>
      )}
    </div>
  );
}

/* [967 · 5] 사진 줄 — ◀ ▶ 로 순서, "대표" 로 맨 앞(= 목록 커버). 버튼만 쓴다: 가로 스크롤
   줄에서 드래그는 스크롤과 싸운다. 보이는 버튼은 28px, .tap 이 44px 로 넓힌다. */
export function NotePhotoStrip({
  photos,
  onRemove,
  onShift,
  onCover,
}: {
  photos: string[];
  onRemove: (url: string) => void;
  onShift: (index: number, dir: -1 | 1) => void;
  onCover: (index: number) => void;
}) {
  if (photos.length === 0) return null;
  return (
    <ul className="note-photo-strip flex gap-3 overflow-x-auto pb-1" aria-label="첨부한 사진">
      {photos.map((p, i) => {
        const isCover = i === 0;
        const isLast = i === photos.length - 1;
        return (
          <li key={p} className="w-[132px] shrink-0">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                loading="lazy"
                decoding="async"
                src={p}
                alt={isCover ? `대표 사진 (${i + 1}번째)` : `현장 사진 ${i + 1}번째`}
                className="h-[88px] w-[132px] rounded-[10px] object-cover"
              />
              {isCover && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-brand-navy px-1.5 py-0.5 t-caption font-bold text-on-dark">
                  대표
                </span>
              )}
              <button
                type="button"
                aria-label={`${i + 1}번째 사진 삭제`}
                onClick={() => onRemove(p)}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-brand-navy/85 text-on-dark after:absolute after:-inset-2 after:content-['']"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                aria-label="앞으로"
                disabled={isCover}
                onClick={() => onShift(i, -1)}
                className="tap grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-[13px] text-text-2 disabled:opacity-40"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label={isCover ? "대표 사진이에요" : "대표 사진으로"}
                aria-pressed={isCover}
                disabled={isCover}
                onClick={() => onCover(i)}
                className={`tap h-7 rounded-lg px-2 t-caption font-bold ${
                  isCover ? "bg-primary text-white" : "border border-line bg-surface text-text-2"
                }`}
              >
                대표
              </button>
              <button
                type="button"
                aria-label="뒤로"
                disabled={isLast}
                onClick={() => onShift(i, 1)}
                className="tap grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-[13px] text-text-2 disabled:opacity-40"
              >
                ▶
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
