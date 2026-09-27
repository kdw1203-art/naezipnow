/**
 * PUT /api/notes/[id]/cover — 고른 썸네일 저장. 작성자 본인만.
 * body: { variant, headline, fact, source } (sub 는 서버가 노트에서 다시 조립한다)
 *
 * · 보낸 값을 믿지 않는다: 변형(사진 변형은 사진 있는 사람 노트만)·길이·숫자(원문에 있는 숫자만)를 다시 검증.
 * · `metadata.cover` 만 병합 저장 — 다른 metadata 키(key_metrics·cardConfig·decision …)는 그대로.
 * · 목록 캐시 무효화는 노트 수정 API 와 같은 헬퍼로(공개 노트일 때만 목록 화면까지).
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { updateNote } from "@/lib/inspection/store-db";
import { invalidateNoteCache } from "@/lib/inspection/note-cache";
import { invalidateTownFeed } from "@/lib/cache/invalidate";
import { invalidatePublicNoteRoutes, scheduleProfileInvalidation } from "@/lib/town/invalidate-town";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { loadOwnedNote } from "@/lib/notes/cover/owner";
import { sanitizeCoverDraft } from "@/lib/notes/cover/rules";
import { mergeCoverIntoMetadata, toCoverSpec } from "@/lib/notes/cover/spec";
import { resolveNoteCover } from "@/lib/notes/cover/resolve";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  const owned = await loadOwnedNote(id);
  if (!owned.ok) return owned.res;
  const { note } = owned;

  const body = await req.json().catch(() => null);
  const checked = sanitizeCoverDraft(note, body);
  if (!checked.ok) {
    return NextResponse.json({ error: "이 문구로는 썸네일을 만들 수 없어요.", problems: checked.problems }, { status: 422 });
  }

  const spec = toCoverSpec(checked.draft, new Date().toISOString());
  let updated: Awaited<ReturnType<typeof updateNote>>;
  try {
    updated = await updateNote(id, { metadata: mergeCoverIntoMetadata(note.metadata, spec) as typeof note.metadata });
  } catch (e) {
    return dbUnavailable("note-cover-save", e, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!updated) return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });

  /* 상세의 노트 행 캐시(메타데이터) — 노트 수정 API 와 같은 태그 규칙 */
  invalidateNoteCache(id, "metadata");
  if (updated.isPublic) {
    /* 공개 노트의 목록 커버가 바뀐다 — /notes 격자·피드, 동네 피드, 공개 노트 목록 화면·지역 가이드, 공개 프로필 */
    try {
      revalidatePath("/notes");
    } catch {
      /* 요청 밖이면 TTL 이 안전망 */
    }
    invalidateTownFeed();
    invalidatePublicNoteRoutes([updated.region]);
    scheduleProfileInvalidation(updated.authorEmail);
  }

  return NextResponse.json({ ok: true, cover: spec, url: resolveNoteCover(updated).url });
}
