/**
 * GET    /api/inspection/schedule  — 내 임장 일정 목록
 * POST   /api/inspection/schedule  — 임장 일정 등록
 * PATCH  /api/inspection/schedule  — 상태 변경 (completed/cancelled)
 * DELETE /api/inspection/schedule?id=... — 일정 삭제
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateScheduleStatus,
  type ScheduleStatus,
} from "@/lib/inspection-schedules/store-db";

import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ScheduleStatus | null;
  /* []는 "예정된 임장이 없어요"로 그려진다 — 잡아둔 약속을 놓치게 만든다. */
  let items: Awaited<ReturnType<typeof listSchedules>>;
  try {
    items = await listSchedules(session.user.email, status ?? undefined);
  } catch (e) {
    return dbUnavailable("inspection-schedules", e);
  }
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    region?: string;
    aptName?: string;
    scheduledAt?: string;
    durationMin?: number;
    memo?: string;
    checklist?: Array<{ label: string; done: boolean }>;
  };

  const title = String(body.title ?? "").trim();
  const region = String(body.region ?? "").trim();
  const scheduledAt = String(body.scheduledAt ?? "").trim();

  if (!title || !region || !scheduledAt) {
    return NextResponse.json(
      { error: "제목·지역·예정 일시는 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const schedule = await createSchedule({
      authorEmail: session.user.email,
      authorLabel: session.user.name ?? undefined,
      title,
      region,
      aptName: body.aptName ? String(body.aptName).trim() : undefined,
      scheduledAt,
      durationMin: body.durationMin ? Number(body.durationMin) : undefined,
      memo: body.memo ? String(body.memo).trim() : undefined,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "일정 등록 실패" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    noteId?: string;
  };

  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim() as ScheduleStatus;
  const validStatuses: ScheduleStatus[] = ["planned", "completed", "cancelled"];

  if (!id || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "id와 status(planned|completed|cancelled)가 필요합니다." },
      { status: 400 },
    );
  }

  /* [1057] 작성자 확인 없이 id 만으로 갱신됐고 noteId 없는 PATCH 가 연결을 지웠으며 DB 오류가 200 이었다 —
     작성자 일치 조건 · noteId 는 넘겼을 때만 · 없으면 404 · 실패 503 */
  const noteId = typeof body.noteId === "string" && body.noteId.trim() ? body.noteId.trim() : undefined;
  let result: Awaited<ReturnType<typeof updateScheduleStatus>>;
  try {
    result = await updateScheduleStatus(id, session.user.email, status, noteId);
  } catch (e) {
    return dbUnavailable("inspection-schedule-update", e, "일정 저장 실패 · 잠시 후 다시");
  }
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ ok: false, error: "일정 없음" }, { status: 404 });
    }
    return dbUnavailable("inspection-schedule-update", new Error("Supabase 미설정"), "일정 저장 실패 · 잠시 후 다시");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 });
  }

  /* [1057] 삭제 실패가 200 {ok:false} 로 나갔다 — 없으면 404 · DB 실패 503 */
  let result: Awaited<ReturnType<typeof deleteSchedule>>;
  try {
    result = await deleteSchedule(id, session.user.email);
  } catch (e) {
    return dbUnavailable("inspection-schedule-delete", e, "일정 삭제 실패 · 잠시 후 다시");
  }
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ ok: false, error: "일정 없음" }, { status: 404 });
    }
    return dbUnavailable("inspection-schedule-delete", new Error("Supabase 미설정"), "일정 삭제 실패 · 잠시 후 다시");
  }
  return NextResponse.json({ ok: true });
}
