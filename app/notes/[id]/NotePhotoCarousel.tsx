"use client";

/* 현장 사진 캐러셀 — 이전에는 110×78 썸네일을 가로로 늘어놓기만 해서
   차트가 섞인 사진은 사실상 읽을 수 없었다. 큰 무대 + 좌우 클릭 전환 +
   전체화면으로 바꾼다.

   설계 근거 (실측):
   · 썸네일 10장을 가로로 붙이면 min-content 가 1172px 이 된다. 부모 그리드의
     `1fr` 은 `minmax(auto, 1fr)` 이라 그 폭 아래로 안 줄고, 400px 사이드바가
     통째로 컨테이너 밖(문서 scrollWidth 1690 vs 뷰포트 1296)으로 밀려났다.
     그래서 이 컴포넌트의 뿌리에 min-w-0 / w-full 을 박아 두고, 부모 그리드는
     minmax(0,1fr) 로 고친다. 둘 중 하나만 고치면 다시 밀린다.
   · 사진 대부분이 차트라 object-cover 로 자르면 숫자가 잘린다 → object-contain.
   · 로드 실패와 "사진 없음" 을 같은 회색 박스로 보여 주지 않는다. 실패는
     실패라고 적는다.
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/client/use-scroll-lock";
import { horizontalSwipeDelta } from "@/lib/client/swipe-gesture";
import { buildImageSrcSet, canOptimizeImage } from "@/lib/images/srcset";

type Props = {
  photos: string[];
  /** 스크린리더용 이름 (예: "현장 사진") */
  label?: string;
};

/* [968 · 17] srcset 선택 힌트 — 무대는 본문 칼럼(모바일 전폭, lg 는 1240 − 400 사이드바
   − 여백 ≈ 760px), 썸네일은 74px 고정이라 가장 작은 변환(384w)만 받는다. 예전엔 무대·
   썸네일·팝업 전부 1600px 원본을 그대로 받았다 — 10장 노트면 썸네일만으로 원본 10장. */
const STAGE_SIZES = "(max-width: 1023px) 100vw, 760px";
const THUMB_SIZES = "74px";
const ZOOM_SIZES = "(max-width: 1100px) 100vw, 1100px";

export function NotePhotoCarousel({ photos, label = "현장 사진" }: Props) {
  const total = photos.length;
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  /* [968 · 17] 변환(/_next/image)이 죽은 장은 원본으로 한 번 더 — CoverImage 와 같은 3단
     (변환 → 원본 → 실패). 변환 실패를 곧장 "실패" 로 적으면 멀쩡한 원본까지 숨긴다. */
  const [rawOnly, setRawOnly] = useState<Record<number, boolean>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  /* [968 · 35] 팝업이 떠 있는 동안 배경 스크롤 잠금 — body.style.overflow 는 iOS Safari 가
     무시한다. 공용 훅이 body 를 fixed 로 못 박고 닫힐 때 위치를 되돌린다. */
  useScrollLock(zoom);

  const go = useCallback(
    (delta: number) => {
      if (total < 1) return;
      setIdx((i) => (i + delta + total) % total);
    },
    [total],
  );

  // 활성 썸네일이 레일 밖으로 나가면 따라 스크롤시킨다. 안 그러면 5장째부터
  // "지금 몇 번째인지" 를 볼 수 없다.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-thumb="${idx}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [idx]);

  // 전체화면일 때만 문서 전역 키를 잡는다. 평소엔 무대에 포커스가 있을 때만.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [zoom, go]);

  /* 변환 srcset 을 쓰는 장인지 — 허용 호스트이고 아직 변환이 실패하지 않았을 때 */
  const isOptimized = useCallback(
    (i: number) => canOptimizeImage(photos[i]) && !rawOnly[i],
    [photos, rawOnly],
  );

  // 인접 사진 프리로드 — 넘길 때마다 원본을 그때 받기 시작하면 큰 차트
  // 이미지에서 빈 무대가 눈에 띈다. 다음·이전 한 장씩만 미리 받는다.
  // [968 · 17] 무대와 같은 srcset·sizes 로 받아야 캐시가 맞는다 — 원본 src 만 주면
  // 원본을 미리 받아 놓고 무대는 변환본을 또 받는 이중 다운로드가 된다.
  useEffect(() => {
    if (total < 2) return;
    for (const i of [(idx + 1) % total, (idx - 1 + total) % total]) {
      const img = new Image();
      if (isOptimized(i)) {
        img.sizes = STAGE_SIZES;
        img.srcset = buildImageSrcSet(photos[i]);
      }
      img.src = photos[i];
    }
  }, [idx, total, photos, isOptimized]);

  if (total === 0) return null;

  const src = photos[idx];
  const isFailed = failed[idx];

  const markFailed = (i: number) =>
    setFailed((f) => (f[i] ? f : { ...f, [i]: true }));

  /* [968 · 17] 로드 실패 3단 — 변환본이 죽으면 원본으로, 원본도 죽으면 실패로 */
  const onImgError = (i: number) => {
    if (isOptimized(i)) setRawOnly((r) => (r[i] ? r : { ...r, [i]: true }));
    else markFailed(i);
  };

  /* [968 · 17] src + (허용 호스트면) srcSet·sizes — 무대·썸네일·팝업이 같은 규칙을 쓴다 */
  const imgSrcProps = (i: number, sizes: string) =>
    isOptimized(i)
      ? { src: photos[i], srcSet: buildImageSrcSet(photos[i]), sizes }
      : { src: photos[i] };

  const stageKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "Enter" && !isFailed) {
      /* [968 · 37] 가운데 탭이 크게 보기가 됐으니 키보드도 같은 길을 준다 */
      e.preventDefault();
      setZoom(true);
    }
  };

  /* [968 · 37] 터치 스와이프 — 시작점(x,y)을 잡고 끝점에서 축을 판정한다.
     예전엔 |dx|>40 만 봐서 세로 스크롤 중 손가락이 조금만 비껴도 사진이 넘어갔다.
     이제 |dx|>40 이면서 |dx|>1.5·|dy| 일 때만 넘긴다(lib/client/swipe-gesture). */
  const onStageTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onStageTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const end = e.changedTouches[0];
    if (!start || !end) return;
    const delta = horizontalSwipeDelta(end.clientX - start.x, end.clientY - start.y);
    if (delta !== 0) go(delta);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* ── 무대 ─────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="캐러셀"
        aria-label={`${label} ${total}장`}
        tabIndex={0}
        onKeyDown={stageKey}
        onTouchStart={onStageTouchStart}
        onTouchEnd={onStageTouchEnd}
        /* [968 · 37] touch-pan-y — 세로 스크롤은 브라우저에 맡기고 가로만 우리가 본다.
           [968 · 27] data-ptr-ignore — 설치 앱의 당겨서 새로고침이 무대 위 끌기에 끼어들지 않게. */
        data-ptr-ignore=""
        className="brand-photo-frame relative w-full min-w-0 touch-pan-y overflow-hidden rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* [968 · 37] 가운데(양쪽 22% 를 뺀 56%)를 탭하면 크게 보기 — 예전엔 좌우 38% 투명
            버튼이 무대 대부분을 덮어 사진을 눌러도 넘어가기만 했다. 접근 가능한 진입로는
            아래 "크게 보기" 버튼과 무대 Enter 키가 이미 있다. */}
        <div
          onClick={() => {
            if (!isFailed) setZoom(true);
          }}
          className={`flex h-[248px] w-full items-center justify-center sm:h-[340px] lg:h-[400px] ${
            isFailed ? "" : "cursor-zoom-in"
          }`}
        >
          {isFailed ? (
            <div className="flex flex-col items-center gap-1 px-6 text-center">
              <span className="t-body font-extrabold text-[var(--brand-hanji)]">
                사진을 불러오지 못했어요
              </span>
              <span className="t-sub text-[rgba(246,241,231,.6)]">
                {idx + 1}번째 사진 · 원본 주소에 접근하지 못했습니다
              </span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${rawOnly[idx] ? "raw" : "opt"}`}
              {...imgSrcProps(idx, STAGE_SIZES)}
              alt={`${label} ${idx + 1} / ${total}`}
              // 첫 장은 바로 보여야 하므로 lazy 를 걸지 않는다.
              // [968 · 17] 첫 장은 이 화면의 LCP 후보 — fetchPriority="high" 로 선점한다.
              loading={idx === 0 ? "eager" : "lazy"}
              {...(idx === 0 ? { fetchPriority: "high" as const } : {})}
              decoding="async"
              onError={() => onImgError(idx)}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        {total > 1 && (
          <>
            {/* 좌·우 가장자리 클릭으로 넘긴다 — 화살표를 정확히 누르지 않아도 된다.
                버튼 위에 겹치지 않도록 화살표를 뒤에 더 높은 z 로 올린다.
                [968 · 37] 38% → 22%: 가운데 56% 는 탭 확대에 준다. */}
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => go(-1)}
              className="absolute inset-y-0 left-0 w-[22%] cursor-pointer bg-transparent"
            />
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => go(1)}
              className="absolute inset-y-0 right-0 w-[22%] cursor-pointer bg-transparent"
            />

            <span
              aria-hidden
              onClick={() => go(-1)}
              className="brand-photo-chip absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full t-section leading-none backdrop-blur-sm transition"
            >
              ‹
            </span>
            <span
              aria-hidden
              onClick={() => go(1)}
              className="brand-photo-chip absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full t-section leading-none backdrop-blur-sm transition"
            >
              ›
            </span>
          </>
        )}

        {/* 매수 표시 — 몇 장 중 몇 번째인지 숨기지 않는다.
            aria-live: 스크린리더도 장 전환을 들을 수 있게 (조용한 상태 변경 금지) */}
        <span
          aria-live="polite"
          className="brand-photo-chip pointer-events-none absolute bottom-2 right-2 z-10 rounded-full px-2.5 py-1 t-sub font-extrabold"
        >
          {idx + 1} / {total}
        </span>

        {!isFailed && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label="사진 전체화면으로 보기"
            className="brand-photo-chip absolute right-2 top-2 z-10 rounded-full px-2.5 py-1 t-sub font-extrabold backdrop-blur-sm transition"
          >
            <span className="njn-dot mr-1.5 inline-block h-[7px] w-[7px] align-middle" aria-hidden="true" />크게 보기
          </button>
        )}
      </div>

      {/* ── 썸네일 레일 ──────────────────────────────────────── */}
      {total > 1 && (
        <div
          ref={railRef}
          /* [968 · 27] 가로 레일 — 당겨서 새로고침과 겹치지 않게 */
          data-ptr-ignore=""
          className="flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1"
        >
          {photos.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              data-thumb={i}
              onClick={() => setIdx(i)}
              aria-label={`${i + 1}번째 사진 보기`}
              aria-current={i === idx ? "true" : undefined}
              className={`h-[52px] w-[74px] shrink-0 overflow-hidden rounded-lg border-2 bg-bg transition ${
                i === idx
                  ? "border-[var(--brand-red)] opacity-100"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {failed[i] ? (
                <span className="flex h-full w-full items-center justify-center bg-bg t-caption font-bold text-text-3">
                  실패
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={rawOnly[i] ? "raw" : "opt"}
                  /* [968 · 17] 74px 썸네일에 1600px 원본을 받던 것 → 384w 변환 */
                  {...imgSrcProps(i, THUMB_SIZES)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => onImgError(i)}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── 크게 보기 팝업 ─────────────────────────────────────────
          [951] 예전엔 화면 전체를 검게 덮고 <img max-h-full> 을 넣었는데, 부모가
          flex-1 이면서 min-height:auto 라 이미지 원본 높이만큼 늘어나 세로가 긴
          차트 이미지는 위아래가 잘린 채 나갔다(소유자 캡처: "너무 크게 나와").
          이제 가운데 팝업 카드 안에 넣고, 이미지 최대 높이를 뷰포트 기준(dvh)으로
          못 박아 **한 화면에 전부** 들어오게 한다. 배경 클릭·Esc 로 닫힌다. */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 크게 보기`}
          /* [968 · 27] 팝업 위에서는 body 가 잠겨 scrollY 가 늘 0 — 당겨서 새로고침이
             72px 끌기만으로 화면을 통째로 다시 띄우지 않게 막는다. */
          data-ptr-ignore=""
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setZoom(false)}
        >
          <div
            className="brand-photo-frame flex max-h-[calc(100dvh-24px)] w-full max-w-[1100px] min-w-0 flex-col overflow-hidden rounded-2xl shadow-[0_24px_64px_rgba(11,37,69,.55)] sm:max-h-[calc(100dvh-48px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5 text-[var(--brand-hanji)]">
              <span className="t-body font-extrabold">
                <span className="njn-dot mr-2 inline-block h-[8px] w-[8px] align-middle" aria-hidden="true" />
                {label} {idx + 1} / {total}
              </span>
              <button
                type="button"
                onClick={() => setZoom(false)}
                className="brand-photo-chip rounded-full px-3 py-1.5 t-sub font-extrabold transition"
              >
                닫기 (Esc)
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-3">
              {isFailed ? (
                <span className="t-body text-[var(--brand-hanji)]">
                  사진을 불러오지 못했어요
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${src}-${rawOnly[idx] ? "raw" : "opt"}`}
                  {...imgSrcProps(idx, ZOOM_SIZES)}
                  alt={`${label} ${idx + 1} / ${total}`}
                  decoding="async"
                  onError={() => onImgError(idx)}
                  /* 높이 상한을 뷰포트로 직접 잰다 — 부모 max-h 만으로는 이미지가
                     min-height:auto 를 타고 원본 크기로 커진다(위 주석). */
                  className="max-h-[calc(100dvh-96px)] max-w-full rounded-lg object-contain sm:max-h-[calc(100dvh-120px)]"
                />
              )}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 사진"
                    onClick={() => go(-1)}
                    className="brand-photo-chip absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full t-title transition"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="다음 사진"
                    onClick={() => go(1)}
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
                {photos.map((p, i) => (
                  <button
                    key={`z-${i}`}
                    type="button"
                    aria-label={`${i + 1}번째 사진 보기`}
                    aria-current={i === idx ? "true" : undefined}
                    onClick={() => setIdx(i)}
                    className={`h-[40px] w-[58px] shrink-0 overflow-hidden rounded-md border-2 bg-[rgba(246,241,231,.06)] ${
                      i === idx ? "border-[var(--brand-red-on-dark)]" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={rawOnly[i] ? "raw" : "opt"}
                      {...imgSrcProps(i, THUMB_SIZES)}
                      alt=""
                      loading="lazy"
                      onError={() => onImgError(i)}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotePhotoCarousel;
