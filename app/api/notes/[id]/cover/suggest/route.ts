/**
 * POST /api/notes/[id]/cover/suggest — 썸네일 후보 3장. 작성자 본인만.
 *
 * 흐름: LLM 한 번(결론형·숫자형·질문형) → 문구마다 길이·숫자 검증(lib/notes/cover/verify) → 모자라면 규칙 문구로
 * 채워 **항상 3장**. 키가 없거나 실패·시간 초과·한도 초과여도 3장은 나온다(전부 규칙 문구).
 * 비용 보호: 노트 내용 해시 캐시 + 같은 노트 하루 5회(lib/notes/cover/ai) + 사용자당 10분 20회.
 *
 * 응답: { candidates: [{ variant, headline, fact, sub, source, previewUrl }×3], ai, current }
 */
import { NextResponse, type NextRequest } from "next/server";
import { keyRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadOwnedNote } from "@/lib/notes/cover/owner";
import { suggestCoverTextsWithAi } from "@/lib/notes/cover/ai";
import { composeCandidates, coverPhotoOf } from "@/lib/notes/cover/rules";
import { coverPreviewPath } from "@/lib/notes/cover/preview";
import { validCoverSpec } from "@/lib/notes/cover/resolve";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedNote(id);
  if (!owned.ok) return owned.res;
  const { note, email } = owned;

  const rl = await keyRateLimit(`note-cover-suggest:${email}`, { max: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)));

  const ai = await suggestCoverTextsWithAi(note);
  const drafts = composeCandidates(note, ai.texts);
  const photo = coverPhotoOf(note);

  return NextResponse.json(
    {
      candidates: drafts.map((d) => ({ ...d, previewUrl: coverPreviewPath(d, photo) })),
      ai: ai.status,
      current: validCoverSpec(note),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
