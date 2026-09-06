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
