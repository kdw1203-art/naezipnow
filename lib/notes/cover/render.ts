import "server-only";
import { ImageResponse } from "next/og";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";
import { COVER_SIZE } from "./spec";
import { buildCoverTree, type CoverRenderInput } from "./tree";

/**
 * 썸네일 PNG 응답 — 렌더 라우트·미리보기 라우트 공용. 서버 전용(next/og + 한글 폰트 파일).
 * 폰트는 lib/og/font(Pretendard Bold 서브셋, next.config outputFileTracingIncludes 로 번들에 실린다).
 */

/** `?v=` 가 지금 커버의 내용 해시와 같을 때 — 그 주소의 그림은 영원히 같다(lib/notes/cover/spec coverVersion) */
export const COVER_IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable";
/** 비공개 노트의 커버(소유자만) — 어떤 공유 캐시에도 싣지 않는다 */
export const COVER_PRIVATE_CACHE_CONTROL = "private, no-store";
/** 비공개 노트 커버 + v 일치 — 작성자 브라우저에만 1년(내용 주소라 바뀌면 주소가 바뀐다) */
export const COVER_PRIVATE_IMMUTABLE_CACHE_CONTROL = "private, max-age=31536000, immutable";

export function renderCoverPng(input: CoverRenderInput, cacheControl: string): ImageResponse {
  return new ImageResponse(buildCoverTree(input, { fontFamily: OG_FONT_FAMILY }), {
    width: COVER_SIZE,
    height: COVER_SIZE,
    ...ogFonts(),
    headers: { "Cache-Control": cacheControl },
  });
}
