/**
 * [967 · 15] GET /api/me/complex-records?complexId=<순수 id>[&alt=<대체 id>]
 *
 * alt: 같은 단지의 다른 표기 id(대장 매칭 시 kapt.… 형태, 허브의 v.id). 노트의
 * metadata.complexId 는 작성 당시 링크가 들고 있던 id 라 두 표기가 섞여 있다 —
 * 둘 다 찾아 노트 id 로 합친다(같은 값이면 한 번만 조회).
 *
 * 단지 허브 "내 기록" 탭의 재료 — **호출자 본인**이 이 단지에 남긴 임장노트와
 * 관심 등록 여부. 허브 페이지는 ISR(방문자 공용 HTML)이라 이런 개인 데이터를
 * 서버 렌더에 섞을 수 없고, 탭을 열 때 클라이언트가 여기로 온다.
 *
 * 응답
 *  - 200 { notes: RecordNote[], watching: boolean | null }
 *      notes   : 방문일 오름차순(회차 순). 비공개 노트도 본인 것이므로 포함.
 *      watching: 관심 단지 여부. 조회가 실패하면 null(false 와 구분 — "안 했다"고
 *                지어내지 않는다).
 *  - 400 { error } complexId 누락
 *  - 401 { error } 로그인 필요 — 클라이언트는 로그인 유도 빈 상태를 그린다
 *  - 503 { error } 노트 조회 실패(dbUnavailable, Retry-After)
 *
 * 개인 데이터라 캐시하지 않는다(private, no-store).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  listNotesByAuthorForComplex,
  inspectionAverageScore,
  hasInspectionScores,
} from "@/lib/inspection/store-db";
import { isWatching } from "@/lib/watchlist/store-db";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";
import type { ComplexRecordNote, ComplexRecordsResponse } from "@/lib/complex/my-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 응답 타입은 lib/complex/my-records.ts — 클라이언트 탭과 같은 정의를 본다 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: NO_STORE });
  }

  const complexId = req.nextUrl.searchParams.get("complexId")?.trim() ?? "";
  if (!complexId) {
    return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400, headers: NO_STORE });
  }
  const alt = req.nextUrl.searchParams.get("alt")?.trim() ?? "";
  const ids = alt && alt !== complexId ? [complexId, alt] : [complexId];

  /* 노트와 관심 여부는 서로 독립이다 — 관심 조회가 실패했다고 노트까지 못 보여줄
     이유가 없다. 노트 실패만 503 으로 올리고, 관심은 null 로 접는다.
     관심 등록은 히어로 버튼이 쓰는 id(alt 가 있으면 그쪽 = v.id)로 묻는다. */
  const [notesR, watchingR] = await Promise.allSettled([
    Promise.all(ids.map((id) => listNotesByAuthorForComplex(email, id, 50))).then((lists) => {
      const seen = new Set<string>();
      return lists
        .flat()
        .filter((n) => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        })
        .sort(
          (a, b) => a.visitDate.localeCompare(b.visitDate) || a.createdAt.localeCompare(b.createdAt),
        );
    }),
    isWatching(email, alt || complexId),
  ]);
  if (notesR.status === "rejected") {
    return dbUnavailable(
      `내 기록 조회 실패 (complex=${complexId})`,
      notesR.reason,
      "지금은 내 기록을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.",
    );
  }
  if (watchingR.status === "rejected") {
    logger.warn("[complex-records] 관심 여부 조회 실패 — null 로 응답", {
      complexId,
      message: watchingR.reason instanceof Error ? watchingR.reason.message : String(watchingR.reason),
    });
  }

  const notes: ComplexRecordNote[] = notesR.value.map((n) => ({
    id: n.id,
    title: n.title,
    visitDate: n.visitDate,
    avgScore: hasInspectionScores(n.scores)
      ? Math.round(inspectionAverageScore(n.scores) * 10) / 10
      : null,
    isPublic: n.isPublic,
    updatedAt: n.updatedAt,
  }));

  const body: ComplexRecordsResponse = {
    notes,
    watching: watchingR.status === "fulfilled" ? watchingR.value : null,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
