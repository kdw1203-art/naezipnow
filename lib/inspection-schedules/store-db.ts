import { getServiceSupabase } from "@/lib/supabase/service";

export type ScheduleStatus = "planned" | "completed" | "cancelled";

export type InspectionSchedule = {
  id: string;
  authorEmail: string;
  authorLabel: string | null;
  title: string;
  region: string;
  aptName: string | null;
  scheduledAt: string;
  durationMin: number;
  memo: string | null;
  checklist: Array<{ label: string; done: boolean }>;
  status: ScheduleStatus;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: Record<string, unknown>): InspectionSchedule {
  return {
    id: String(r.id ?? ""),
    authorEmail: String(r.author_email ?? ""),
    authorLabel: r.author_label ? String(r.author_label) : null,
    title: String(r.title ?? ""),
    region: String(r.region ?? ""),
    aptName: r.apt_name ? String(r.apt_name) : null,
    scheduledAt: String(r.scheduled_at ?? ""),
    durationMin: Number(r.duration_min ?? 60),
    memo: r.memo ? String(r.memo) : null,
    checklist: Array.isArray(r.checklist)
      ? (r.checklist as Array<{ label: string; done: boolean }>)
      : [],
    status: (r.status as ScheduleStatus) ?? "planned",
    noteId: r.note_id ? String(r.note_id) : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function listSchedules(
  authorEmail: string,
  status?: ScheduleStatus,
): Promise<InspectionSchedule[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("inspection_schedules")
    .select("*")
    .eq("author_email", authorEmail)
    .order("scheduled_at", { ascending: true });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  /* []는 "예정된 임장이 없어요"로 그려진다. 내가 잡아둔 일정이 사라진 것처럼
     보이면 사용자는 약속을 놓친다. 못 읽었으면 던진다. */
  if (error) throw scheduleQueryError("inspection_schedules (내 일정)", error);
  return (data ?? []).map(mapRow);
}

/** [1056 · C7] 상태 planned 이고 scheduled_at 이 [startIso, endIso) 인 일정 — 작성자 무관(리마인드 크론용).
    실패는 던진다 — []로 누르면 크론이 "내일 일정 없음"으로 보내지 않고 조용히 지나간다. */
export async function listPlannedSchedulesBetween(
  startIso: string,
  endIso: string,
): Promise<InspectionSchedule[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("inspection_schedules")
    .select("*")
    .eq("status", "planned")
    .gte("scheduled_at", startIso)
    .lt("scheduled_at", endIso)
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (error) throw scheduleQueryError("inspection_schedules (내일 일정)", error);
  return (data ?? []).map(mapRow);
}

export async function getSchedule(id: string): Promise<InspectionSchedule | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("inspection_schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  /* maybeSingle 은 행이 없으면 {data:null,error:null} 이다 — error 가 곧
     "실패", !data 가 곧 "없음". null 을 그대로 주면 404 "없는 일정"이 된다. */
  if (error) throw scheduleQueryError(`inspection_schedules (일정 ${id})`, error);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** 조회 실패 전용 에러 — "행이 없음"과 절대 섞지 않는다. */
function scheduleQueryError(where: string, err: { message?: string }): Error {
  return new Error(`${where} 조회 실패: ${err.message ?? "알 수 없는 오류"}`);
}

export async function createSchedule(input: {
  authorEmail: string;
  authorLabel?: string;
  title: string;
  region: string;
  aptName?: string;
  scheduledAt: string;
  durationMin?: number;
  memo?: string;
  checklist?: Array<{ label: string; done: boolean }>;
}): Promise<InspectionSchedule> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase 미설정");

  const { data, error } = await sb
    .from("inspection_schedules")
    .insert({
      author_email: input.authorEmail,
      author_label: input.authorLabel ?? null,
      title: input.title,
      region: input.region,
      apt_name: input.aptName ?? null,
      scheduled_at: input.scheduledAt,
      duration_min: input.durationMin ?? 60,
      memo: input.memo ?? null,
      checklist: input.checklist ?? [],
      status: "planned",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

/** 쓰기 결과 — 바뀐 행이 없으면(남의 일정·없는 id) not_found. DB 실패는 던진다(호출부가 503 으로 옮긴다). */
export type ScheduleWriteResult = { ok: true } | { ok: false; reason: "not_found" | "unavailable" };

/* [1057] 예전엔 `.eq("id", id)` 만 걸어 id 만 알면 남의 일정 상태를 바꿀 수 있었고, noteId 없는 PATCH 가 note_id 를 null 로 덮었으며,
   DB 오류도 200 {ok:false} 로 나갔다 — 작성자 일치 조건 · note_id 는 넘겼을 때만 · 바뀐 행 없음은 not_found · 실패는 던진다. */
export async function updateScheduleStatus(
  id: string,
  authorEmail: string,
  status: ScheduleStatus,
  noteId?: string,
): Promise<ScheduleWriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "unavailable" };
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (noteId !== undefined && noteId !== null && String(noteId).trim()) patch.note_id = String(noteId).trim();
  const { data, error } = await sb
    .from("inspection_schedules")
    .update(patch)
    .eq("id", id)
    .eq("author_email", authorEmail)
    .select("id");
  if (error) throw scheduleQueryError(`inspection_schedules (일정 ${id} 상태 변경)`, error);
  if (!Array.isArray(data) || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

export async function deleteSchedule(id: string, authorEmail: string): Promise<ScheduleWriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "unavailable" };
  const { data, error } = await sb
    .from("inspection_schedules")
    .delete()
    .eq("id", id)
    .eq("author_email", authorEmail)
    .select("id");
  /* [1057] 삭제 실패도 200 {ok:false} 였다 — 실패는 던지고, 지운 행이 없으면 not_found */
  if (error) throw scheduleQueryError(`inspection_schedules (일정 ${id} 삭제)`, error);
  if (!Array.isArray(data) || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
