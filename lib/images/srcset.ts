/**
 * [968 · 17] `/_next/image` 변환 srcSet 조립 — CoverImage 와 노트 사진 캐러셀이 같이 쓴다.
 *
 * 왜 여기로 뺐나: CoverImage 안에 있던 조립식을 캐러셀이 복사하면 허용 호스트
 * 판정(next.config images.remotePatterns 와 같은 규칙)이 두 곳에서 따로 늙는다.
 * 허용 밖 URL 을 /_next/image 로 보내면 400 이라 판정이 어긋나는 순간 사진이 통째로
 * 깨진다 — 규칙은 한 곳에만 둔다. 순수 함수라 서버·클라이언트·단위테스트 어디서든 쓴다.
 */

/** next.config images.remotePatterns 와 같은 판정만 통과시킨다 */
export const OPTIMIZABLE_IMAGE_RE =
  /^https:\/\/([a-z0-9-]+\.supabase\.co|[a-z0-9.-]+\.pstatic\.net)\//;

/** Next 기본 허용 폭(deviceSizes∪imageSizes)의 부분집합만 쓴다 — 목록에 없는 w 는 400 */
export const IMAGE_SRCSET_WIDTHS = [384, 640, 828, 1080] as const;

/** [1096] 변환기가 받는 폭 전부 — next.config images.imageSizes ∪ deviceSizes 와 같은 값(검사: tests/unit/review-1096) */
export const IMAGE_ALL_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920] as const;

/**
 * [1096 · 성능] sizes 가 고정 px("62px")면 그 칸에 맞는 폭만 — 1x · 2x · 3x 각각 "그 이상인 가장 작은 허용 폭".
 * 왜: 폭 목록이 384 부터라 62px 썸네일(폰 2배 = 124px)도 384w 를 받았다 — 같은 커버가 384w 11.7KB · 128w 2.5KB(로컬 실측 AVIF).
 * 노트 허브 한 장에 썸네일 82장이라 방문마다 약 750KB 가 넘치게 내려갔다. vw 가 섞인 sizes 는 종전 목록 그대로.
 */
export function srcSetWidthsFor(sizes: string | null | undefined): readonly number[] {
  const m = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(sizes ?? "");
  if (!m) return IMAGE_SRCSET_WIDTHS;
  const px = Number(m[1]);
  if (!(px > 0)) return IMAGE_SRCSET_WIDTHS;
  const out: number[] = [];
  for (const dpr of [1, 2, 3]) {
    const need = px * dpr;
    const w = IMAGE_ALL_WIDTHS.find((v) => v >= need) ?? IMAGE_ALL_WIDTHS[IMAGE_ALL_WIDTHS.length - 1];
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** 기본 화질 — Next 기본값과 같다 */
export const IMAGE_SRCSET_QUALITY = 75;

/** `/_next/image` 로 보내도 되는 원본인지 */
export function canOptimizeImage(src: string | null | undefined): src is string {
  return typeof src === "string" && OPTIMIZABLE_IMAGE_RE.test(src);
}

/** 변환 URL 하나 */
export function optimizedImageUrl(src: string, width: number, quality = IMAGE_SRCSET_QUALITY): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

/**
 * `srcset` 문자열 — `"/_next/image?…&w=384&q=75 384w, …"`.
 * 허용 밖 URL 이면 빈 문자열을 돌려준다(호출부가 srcSet 을 아예 붙이지 않게).
 */
export function buildImageSrcSet(
  src: string,
  widths: readonly number[] = IMAGE_SRCSET_WIDTHS,
  quality = IMAGE_SRCSET_QUALITY,
): string {
  if (!canOptimizeImage(src)) return "";
  return widths.map((w) => `${optimizedImageUrl(src, w, quality)} ${w}w`).join(", ");
}
