"use client";

import { useEffect, useRef } from "react";

/* [1006] 현장 사진 라이트박스 — NotePhotoCarousel 의 "크게 보기" 팝업을 분리했다.
   · 동적 로드: 캐러셀이 next/dynamic 으로 받는다 — 누르기 전엔 내려오지 않는다.
   · 포커스 트랩: 열리면 닫기 버튼으로 포커스, Tab/Shift+Tab 은 팝업 안에서만 돈다(예전엔
     팝업 뒤 문서로 새어 나가 스크린리더·키보드 사용자가 어디 있는지 몰랐다). 닫으면 열기
     전 요소(크게 보기 버튼·무대)로 포커스를 돌려준다.
   · 키: Esc 닫기 · ←→ 이전/다음. 문서 전역 keydown 은 이 컴포넌트가 떠 있는 동안만.
   사진 주소·srcset 규칙·실패 판정은 캐러셀이 들고 있다 — 여기는 그리기와 포커스만. */

export type LightboxImgProps = { src: string; srcSet?: string; sizes?: string };

export function NotePhotoLightbox({
  label,
  idx,
  total,
  failed,
  thumbFailed,
  imgProps,
  thumbProps,
  onImgError,
  onPrev,
  onNext,
  onSelect,
  onClose,
}: {
  label: string;
  idx: number;
  total: number;
  /** 현재 장 로드 실패 */
  failed: boolean;
  thumbFailed: (i: number) => boolean;
  /** 현재 장의 src/srcSet/sizes — 캐러셀의 imgSrcProps(ZOOM_SIZES) */
  imgProps: LightboxImgProps;
  thumbProps: (i: number) => LightboxImgProps;
  onImgError: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  /* 최신 콜백을 ref 로 — 키 리스너는 마운트 때 한 번만 단다(장을 넘길 때마다 떼었다 붙이지 않게) */
  const cb = useRef({ onPrev, onNext, onClose });
  cb.current = { onPrev, onNext, onClose };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cb.current.onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        cb.current.onPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        cb.current.onNext();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      /* 열기 전 자리로 — 없어졌으면(재렌더) 그냥 둔다 */
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} 크게 보기`}
      /* [968 · 27] 팝업 위에서는 body 가 잠겨 scrollY 가 늘 0 — 당겨서 새로고침이
         72px 끌기만으로 화면을 통째로 다시 띄우지 않게 막는다. */
      data-ptr-ignore=""
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="brand-photo-frame flex max-h-[calc(100dvh-24px)] w-full max-w-[1100px] min-w-0 flex-col overflow-hidden rounded-2xl shadow-[0_24px_64px_rgba(11,37,69,.55)] sm:max-h-[calc(100dvh-48px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5 text-[var(--brand-hanji)]">
          <span className="t-body font-extrabold" aria-live="polite">
            <span className="njn-dot mr-2 inline-block h-[8px] w-[8px] align-middle" aria-hidden="true" />
            {label} {idx + 1} / {total}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="brand-photo-chip min-h-[40px] rounded-full px-3 py-1.5 t-sub font-extrabold transition"
          >
            닫기 (Esc)
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-3">
          {failed ? (
            <span className="t-body text-[var(--brand-hanji)]">사진을 불러오지 못했어요</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${imgProps.src}-${imgProps.srcSet ? "opt" : "raw"}`}
              {...imgProps}
              alt={`${label} ${idx + 1} / ${total}`}
              decoding="async"
              onError={() => onImgError(idx)}
              /* 높이 상한을 뷰포트로 직접 잰다 — 부모 max-h 만으로는 이미지가
                 min-height:auto 를 타고 원본 크기로 커진다([951]). */
              className="max-h-[calc(100dvh-96px)] max-w-full rounded-lg object-contain sm:max-h-[calc(100dvh-120px)]"
            />
          )}
          {total > 1 && (
            <>
              <button
                type="button"
                aria-label="이전 사진"
                onClick={onPrev}
                className="brand-photo-chip absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full t-title transition"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="다음 사진"
                onClick={onNext}
                className="brand-photo-chip absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full t-title transition"
              >
                ›
              </button>
            </>
          )}
        </div>
        {/* 팝업 안 썸네일 — 닫지 않고 다음 장으로 건너뛴다 */}
        {total > 1 && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-3">
            {Array.from({ length: total }, (_, i) => {
              const tp = thumbProps(i);
              return (
                <button
                  key={`z-${i}`}
                  type="button"
                  aria-label={`${i + 1}번째 사진 보기`}
                  aria-current={i === idx ? "true" : undefined}
                  onClick={() => onSelect(i)}
                  className={`h-[40px] w-[58px] shrink-0 overflow-hidden rounded-md border-2 bg-[rgba(246,241,231,.06)] ${
                    i === idx ? "border-[var(--brand-red-on-dark)]" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  {thumbFailed(i) ? (
                    <span className="flex h-full w-full items-center justify-center t-caption font-bold text-[var(--brand-hanji)]">
                      실패
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={tp.srcSet ? "opt" : "raw"}
                      {...tp}
                      alt=""
                      loading="lazy"
                      onError={() => onImgError(i)}
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
