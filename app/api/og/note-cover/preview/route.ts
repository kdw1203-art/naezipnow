/**
 * GET /api/og/note-cover/preview?variant=&headline=&fact=&sub=[&photo=] — 썸네일 후보 미리보기(DB 없음).
 *
 * "썸네일 고르기" 화면이 후보 3장을 이 주소로 그린다. 받는 값은 lib/notes/cover/preview 가 막는다:
 * 변형은 목록 안, 글자는 저장 규칙과 같은 상한(넘치면 400), 사진은 우리 스토리지 주소만. 글자는 JSX
 * 텍스트로만 그린다(XSS 안전). 그림은 쿼리만으로 정해지므로(내용 주소) 사진 없는 미리보기는 7일
 * immutable, 사진이 든 미리보기는 비공개 노트의 사진일 수 있어 브라우저에만 1시간.
 */
import { NextResponse, type NextRequest } from "next/server";
import { OG_STATIC_CACHE_CONTROL } from "@/lib/og/cache";
import { parseCoverPreviewQuery } from "@/lib/notes/cover/preview";
import { loadCoverPhotoDataUri } from "@/lib/notes/cover/photo";
import { renderCoverPng } from "@/lib/notes/cover/render";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const parsed = parseCoverPreviewQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const { photoUrl, ...input } = parsed.input;
  const usesPhoto = input.variant === "photo" && Boolean(photoUrl);
  const photoSrc = usesPhoto && photoUrl ? await loadCoverPhotoDataUri(photoUrl) : null;
  const cacheControl = usesPhoto
    ? photoSrc
      ? "private, max-age=3600"
      : "no-store"
    : OG_STATIC_CACHE_CONTROL;
  return renderCoverPng({ ...input, photoSrc }, cacheControl);
}
