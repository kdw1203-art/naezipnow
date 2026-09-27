/**
 * GET /api/og/note-cover/[id]?v=… — 임장노트 썸네일(정사각 720 PNG).
 *
 * · 공개 노트면 누구나, 비공개 노트면 작성자만(아니면 404 — 존재를 숨긴다).
 * · 그림 = metadata.cover(저장된 문구·변형). 지금 노트 원문으로 다시 검증해 통과할 때만 그린다 —
 *   저장 뒤 본문에서 그 숫자가 사라졌으면 404(목록은 같은 판정으로 이미 첫 사진으로 돌아가 있다).
 * · 캐시: `v` 가 지금 커버의 내용 해시(chosenAt[+사진])와 같으면 1년 immutable, 다르면 하루(OG 동적 규칙).
 *   비공개는 공유 캐시 금지(private — v 가 맞으면 작성자 브라우저에만 1년, 아니면 no-store).
 *   사진을 못 받아 navy 로 대신 그렸으면 immutable 로 굳히지 않는다.
 * · 글자는 JSX 텍스트로만(lib/notes/cover/tree) — 마크업으로 해석되지 않는다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { OG_DYNAMIC_CACHE_CONTROL } from "@/lib/og/cache";
import { logger } from "@/lib/log";
import { coverVersion } from "@/lib/notes/cover/spec";
import { coverPhotoOf } from "@/lib/notes/cover/rules";
import { validCoverSpec } from "@/lib/notes/cover/resolve";
import { loadCoverPhotoDataUri } from "@/lib/notes/cover/photo";
import {
  COVER_IMMUTABLE_CACHE_CONTROL,
  COVER_PRIVATE_CACHE_CONTROL,
  COVER_PRIVATE_IMMUTABLE_CACHE_CONTROL,
  renderCoverPng,
} from "@/lib/notes/cover/render";

export const runtime = "nodejs";

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* uuid 가 아닌 id 는 getNote 가 DB 왕복 없이 null 을 준다(키 없는 개발 환경의 mem-… 노트는 그대로 읽힌다) */

  let note: Awaited<ReturnType<typeof getNote>>;
  try {
    note = await getNote(id);
  } catch (e) {
    logger.warnSampled("note-cover-render", "[note-cover] 노트 조회 실패", e);
    return new NextResponse(null, { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
  }
  if (!note) return notFound();

  if (!note.isPublic) {
    const session = await safeAuth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email || note.authorEmail.toLowerCase() !== email) return notFound();
  }

  const spec = validCoverSpec(note);
  if (!spec) return notFound();

  const photoUrl = spec.variant === "photo" ? coverPhotoOf(note) : null;
  const photoSrc = photoUrl ? await loadCoverPhotoDataUri(photoUrl) : null;
  const photoMissing = spec.variant === "photo" && !photoSrc;

  const current = req.nextUrl.searchParams.get("v") === coverVersion(spec, photoUrl) && !photoMissing;
  /* 비공개 노트는 공유 캐시에 절대 싣지 않는다 — 내용 주소가 맞으면 작성자 브라우저에만 오래 둔다
     ("내 노트" 목록을 열 때마다 비공개 썸네일을 다시 그리지 않게) */
  const cacheControl = !note.isPublic
    ? current
      ? COVER_PRIVATE_IMMUTABLE_CACHE_CONTROL
      : COVER_PRIVATE_CACHE_CONTROL
    : current
      ? COVER_IMMUTABLE_CACHE_CONTROL
      : OG_DYNAMIC_CACHE_CONTROL;

  return renderCoverPng(
    { variant: spec.variant, headline: spec.headline, fact: spec.fact, sub: spec.sub, photoSrc },
    cacheControl,
  );
}
