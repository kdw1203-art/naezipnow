import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invalidateHomeData, invalidateTownFeed, invalidateRegionCodes } from "@/lib/cache/invalidate";
import { catalogIdsForNoteRegion } from "@/lib/region/changed-region-paths";
import {
  scheduleProfileInvalidation,
  invalidatePublicNoteRoutes,
} from "@/lib/town/invalidate-town";
import { invalidateComplexById } from "@/lib/complex/complex-invalidate";
import { auth } from "@/auth";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { deleteNote, getNote, updateNote } from "@/lib/inspection/store-db";
import { invalidateNoteCache } from "@/lib/inspection/note-cache";
import { awardPoints } from "@/lib/points/ledger";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { looksLikeEmail } from "@/lib/privacy/mask-email";
import { parseDecision } from "@/lib/inspection/decision";

/* getNote/updateNote 는 조회에 실패하면 던진다(예전엔 null 을 돌려줬다).
   null 을 그대로 받아 404 "없음"을 내보내면, 저장돼 있는 노트를 지워졌다고
   답하는 셈이다. 실패는 503 + Retry-After 로만 말한다. */
/* [1010] 노트 메타의 단지 id — 단지 허브(7일 ISR) 무효화 키. 없으면 null(이름만 있는 옛 노트는
   허브가 apt_name 이름 매칭으로 줍지만, 그 매칭으로는 어느 단지인지 여기서 단정할 수 없다). */
function noteComplexId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>).complexId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function loadNote(id: string) {
  try {
    return { ok: true as const, note: await getNote(id) };
  } catch (e) {
    return { ok: false as const, res: dbUnavailable("inspection-note", e) };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await params;
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const note = loaded.note;
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });
  const email = session?.user?.email?.trim().toLowerCase();
  const isOwner = Boolean(email && note.authorEmail.toLowerCase() === email);
  if (!note.isPublic && !isOwner) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (isOwner) return NextResponse.json({ note });
  /* 개인정보 보호: 타인 공개 노트 응답에서 작성자 이메일 제거.
     authorEmail 필드만 떼는 것으로는 부족했다 — authorLabel 에 이메일이 들어
     있으면 그대로 나갔고, POST 가 이름 없는 계정에 이메일을 넣고 있었다.
     쓰는 쪽은 막았지만 그 전에 저장된 행이 남아 있어 여기서도 한 번 더 건다. */
  const { authorEmail: _authorEmail, ...rest } = note;
  const label = (rest.authorLabel ?? "").trim();
  return NextResponse.json({
    note: {
      ...rest,
      authorLabel:
        label && !looksLikeEmail(label)
          ? label
          : `${_authorEmail.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const exists = loaded.note;
  if (!exists) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (exists.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.metadata && typeof body.metadata === "object") {
    body.metadata = {
      ...(exists.metadata ?? {}),
      ...(body.metadata as Record<string, unknown>),
    };
    /* [996 · 4] 판단(metadata.decision)은 POST 와 같은 검증 — 모양이 아니면 키를 버린다 */
    const meta = body.metadata as Record<string, unknown>;
    if ("decision" in meta) {
      const parsed = parseDecision(meta.decision);
      if (parsed) meta.decision = parsed;
      else delete meta.decision;
    }
  }
  /* [#131] 수정 이력 1단계 — 저장 직전 본문 1벌을 metadata.lastRevision 에 보관.
     내용 필드가 실제로 바뀔 때만(메타데이터-only 패치로 이력이 덮이지 않게). */
  const contentChanged =
    (body.summary !== undefined && body.summary !== exists.summary) ||
    (body.sections !== undefined &&
      JSON.stringify(body.sections) !== JSON.stringify(exists.sections)) ||
    (body.scores !== undefined &&
      JSON.stringify(body.scores) !== JSON.stringify(exists.scores)) ||
    (body.checklist !== undefined &&
      JSON.stringify(body.checklist) !== JSON.stringify(exists.checklist));
  if (contentChanged) {
    body.metadata = {
      ...(exists.metadata ?? {}),
      ...((body.metadata as Record<string, unknown>) ?? {}),
      lastRevision: {
        at: new Date().toISOString(),
        summary: exists.summary ?? null,
        memo: exists.sections?.memo ?? null,
        scores: exists.scores ?? null,
        checklistDone: exists.checklist.filter((c) => c.done).length,
      },
    };
  }
  let updated: Awaited<ReturnType<typeof updateNote>>;
  try {
    updated = await updateNote(id, body);
  } catch (e) {
    return dbUnavailable("inspection-note-update", e);
  }
  if (!updated) return NextResponse.json({ error: "없음" }, { status: 404 });
  /* [969 · 20] 상세의 데이터 캐시(노트 행·공개 회차·관련 노트 풀)를 비운다 — 저장 직후
     리다이렉트되는 /notes/[id] 가 5분 전 본문을 보여 주면 "저장이 안 됐다" 로 읽힌다.
     공개→비공개 전환도 여기서 잡힌다(행 캐시가 비워지고 다음 조회는 null 을 저장한다). */
  invalidateNoteCache(id, "content");
  if (updated.isPublic) {
    void appendOnboardingStep(session.user.email, "share");
    // 비공개 → 공개 전환 시에만 적립. refId=noteId 로 재공개 중복 지급 방지.
    if (!exists.isPublic) {
      await awardPoints(session.user.email, "note_public", id);
    }
  }
  // 공개 여부가 바뀌면 공개 피드를 즉시 갱신(ISR 대기 없이 바로 반영)
  if (exists.isPublic !== updated.isPublic) {
    revalidatePath("/notes");
    invalidateHomeData(); // [1007] 홈 스냅샷 태그 + "/" — 생성 API 와 같은 규칙
    invalidateTownFeed(); // [1007] 동네 피드·동네 홈 62곳(공개 노트 카드)
    revalidatePath(`/notes/${id}`);
    /* [1010] 지역 허브(/region/[id], TTL 7일)의 "이 지역 공개 임장노트" — 공개↔비공개가
       바뀌면 그 목록에서 들고 나므로 양쪽 지역 표기를 모두 비운다(수정으로 지역이 바뀌었을 수 있다). */
    invalidateRegionCodes([
      ...catalogIdsForNoteRegion(exists.region),
      ...catalogIdsForNoteRegion(updated.region),
    ]);
  } else if (updated.isPublic) {
    /* [1007] 공개 노트의 제목·판단이 바뀌면 피드 카드도 바뀐다 — 6시간 TTL 을 기다리지 않는다 */
    invalidateTownFeed();
    /* [1010] 지역 허브 카드에도 제목·요약이 실린다(TTL 7일) */
    invalidateRegionCodes([
      ...catalogIdsForNoteRegion(exists.region),
      ...catalogIdsForNoteRegion(updated.region),
    ]);
  }
  /* [1010] 단지 허브(7일 ISR)의 공개 임장노트 카드·개수 — 공개↔비공개 전환, 공개 노트의
     제목·방문일 수정이 모두 그 화면을 바꾼다. 수정으로 단지가 바뀌었을 수 있어 양쪽을 비운다.
     (비공개 노트끼리의 수정은 허브에 안 실리므로 건너뛴다.) */
  if (exists.isPublic || updated.isPublic) {
    invalidateComplexById(noteComplexId(exists.metadata));
    invalidateComplexById(noteComplexId(updated.metadata));
    /* [1010 · 동네축] 공개 노트 목록 화면(/notes/best · /notes/market · /town/library)과
       지역 임장 가이드(/imjang/{slug}). 수정으로 지역이 바뀌었을 수 있어 **전후 지역을 모두**
       넘긴다 — 옛 지역 가이드에서도 그 노트가 빠져야 한다. */
    invalidatePublicNoteRoutes([exists.region, updated.region]);
    /* [1010 · 동네축] 공개 프로필(/u/{handle}) 그리드 — 제목·공개 여부가 그 화면을 바꾼다 */
    scheduleProfileInvalidation(exists.authorEmail);
  }
  return NextResponse.json({ note: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const exists = loaded.note;
  if (!exists) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (exists.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await deleteNote(id);
  /* [969 · 20] 지운 노트의 행·댓글·관련 노트 풀 캐시를 비운다 — 안 비우면 공개 링크가
     5분간 살아 있는 것처럼 열린다(존재하지 않는 기록을 사실처럼 보이는 것) */
  invalidateNoteCache(id, "delete");
  if (exists.isPublic) {
    /* [1007] 공개였던 노트를 지우면 피드·동네 홈·홈 총계에서도 바로 빠져야 한다(6시간 TTL) */
    revalidatePath("/notes");
    invalidateTownFeed();
    invalidateHomeData();
    /* [1010] 지역 허브(TTL 7일)에서도 지워진 노트 카드가 바로 빠져야 한다 */
    invalidateRegionCodes(catalogIdsForNoteRegion(exists.region));
    /* [1010] 단지 허브(7일 ISR)의 임장노트 카드·개수에서도 바로 빠져야 한다 */
    invalidateComplexById(noteComplexId(exists.metadata));
    /* [1010 · 동네축] 공개 노트 목록 화면·지역 임장 가이드·공개 프로필에서도 바로 빠져야 한다 —
       지운 노트가 하루~7일 동안 목록에 남으면 "지워지지 않았다" 로 읽힌다. */
    invalidatePublicNoteRoutes([exists.region]);
    scheduleProfileInvalidation(exists.authorEmail);
  }
  return NextResponse.json({ ok: true });
}
