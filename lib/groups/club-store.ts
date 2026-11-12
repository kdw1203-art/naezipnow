/* [1168] 임장 모임 — 일정 · 게시판 · 투표 저장소(서버 전용).
   읽기는 Loaded 로 돌려준다: 테이블이 없으면 missing(탭 숨김), 조회 실패면 error.
   쓰기는 { ok, message } — 실패 사유를 한 줄로. */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { chatAliasId, chatAliasLabel } from "@/lib/chat/pseudonym";
import {
  isMissingTable,
  parsePollOptions,
  sanitizeVote,
  tallyPoll,
  type ClubBoardId,
  type PollInput,
  type PostInput,
  type ScheduleInput,
} from "./club";
import type { CommentView, Loaded, PollView, PostView, ScheduleView } from "./club-types";

type Row = Record<string, unknown>;
type DbErr = { message?: string; code?: string } | null;
export type WriteResult = { ok: true; id?: string } | { ok: false; message: string; status?: number };

const norm = (e: string) => e.trim().toLowerCase();
const same = (a: unknown, b: string | null) => b !== null && norm(String(a ?? "")) === b;

export function clubLabel(email: string, name?: string | null): string {
  const n = (name ?? "").trim();
  return n ? n.slice(0, 20) : chatAliasLabel(chatAliasId(email));
}
function labelOf(r: Row, emailKey: string, labelKey: string): string {
  const l = String(r[labelKey] ?? "").trim();
  return l || chatAliasLabel(chatAliasId(String(r[emailKey] ?? "")));
}

function readFail<T>(where: string, error: DbErr): Loaded<T> {
  if (isMissingTable(error)) return { state: "missing" };
  logger.error(`[club] ${where} 조회 실패:`, error?.message ?? "unknown");
  return { state: "error" };
}
function writeFail(where: string, error: DbErr): WriteResult {
  logger.error(`[club] ${where} 저장 실패:`, error?.message ?? "unknown");
  if (isMissingTable(error)) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  return { ok: false, message: "저장 실패 · 잠시 후 다시", status: 503 };
}

/* ── 일정 ─────────────────────────────────────────────── */
export async function loadSchedules(meetingId: string, email: string | null): Promise<Loaded<ScheduleView[]>> {
  const sb = getServiceSupabase();
  if (!sb) return { state: "missing" };
  const me = email ? norm(email) : null;
  const { data, error } = await sb
    .from("group_schedules")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("scheduled_at", { ascending: true })
    .limit(300);
  if (error) return readFail("일정", error);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => String(r.id));
  const byId = new Map<string, Row[]>();
  if (ids.length > 0) {
    const att = await sb.from("group_schedule_attendees").select("*").in("schedule_id", ids).limit(5000);
    if (att.error) return readFail("일정 참석", att.error);
    for (const a of (att.data ?? []) as Row[]) {
      const k = String(a.schedule_id);
      byId.set(k, [...(byId.get(k) ?? []), a]);
    }
  }
  return {
    state: "ok",
    data: rows
      .filter((r) => String(r.status ?? "open") !== "cancelled")
      .map((r) => {
        const list = byId.get(String(r.id)) ?? [];
        return {
          id: String(r.id),
          title: String(r.title ?? ""),
          scheduledAt: String(r.scheduled_at ?? ""),
          place: r.place ? String(r.place) : null,
          complexId: r.complex_id ? String(r.complex_id) : null,
          maxMembers: Number(r.max_members ?? 4),
          mode: r.mode ? String(r.mode) : null,
          costTotal: r.cost_total === null || r.cost_total === undefined ? null : Number(r.cost_total),
          authorLabel: labelOf(r, "author_email", "author_label"),
          attendeeCount: list.length,
          attendees: list.map((a) => labelOf(a, "user_email", "user_label")),
          joined: list.some((a) => same(a.user_email, me)),
          mine: same(r.author_email, me),
        };
      }),
  };
}

export async function createSchedule(
  meetingId: string,
  email: string,
  label: string,
  v: ScheduleInput,
): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const { data, error } = await sb
    .from("group_schedules")
    .insert({
      meeting_id: meetingId,
      author_email: norm(email),
      author_label: label,
      title: v.title,
      scheduled_at: v.scheduledAt,
      place: v.place,
      complex_id: v.complexId,
      max_members: v.maxMembers,
      mode: v.mode,
      cost_total: v.costTotal,
    })
    .select("id")
    .maybeSingle();
  if (error) return writeFail("일정", error);
  const id = data?.id ? String(data.id) : undefined;
  /* 만든 사람은 참석으로 시작한다. 실패해도 일정은 남는다(참석은 다시 누르면 된다). */
  if (id) {
    const a = await sb
      .from("group_schedule_attendees")
      .upsert({ schedule_id: id, user_email: norm(email), user_label: label }, { onConflict: "schedule_id,user_email" });
    if (a.error) logger.error("[club] 일정 만든 사람 참석 저장 실패:", a.error.message);
  }
  return { ok: true, id };
}

export async function setAttendance(
  meetingId: string,
  scheduleId: string,
  email: string,
  label: string,
  on: boolean,
  nowMs: number,
): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const s = await sb.from("group_schedules").select("*").eq("id", scheduleId).eq("meeting_id", meetingId).maybeSingle();
  if (s.error) return writeFail("일정 확인", s.error);
  if (!s.data) return { ok: false, message: "일정 없음", status: 404 };
  const row = s.data as Row;
  if (Date.parse(String(row.scheduled_at)) < nowMs) return { ok: false, message: "지난 일정", status: 400 };
  if (!on) {
    const d = await sb.from("group_schedule_attendees").delete().eq("schedule_id", scheduleId).eq("user_email", norm(email));
    if (d.error) return writeFail("참석 취소", d.error);
    return { ok: true };
  }
  const c = await sb.from("group_schedule_attendees").select("user_email").eq("schedule_id", scheduleId).limit(200);
  if (c.error) return writeFail("참석 확인", c.error);
  const list = (c.data ?? []) as Row[];
  if (list.some((a) => same(a.user_email, norm(email)))) return { ok: true };
  if (list.length >= Number(row.max_members ?? 4)) return { ok: false, message: "정원 마감", status: 409 };
  const u = await sb
    .from("group_schedule_attendees")
    .upsert({ schedule_id: scheduleId, user_email: norm(email), user_label: label }, { onConflict: "schedule_id,user_email" });
  if (u.error) return writeFail("참석", u.error);
  return { ok: true };
}

export async function cancelSchedule(
  meetingId: string,
  scheduleId: string,
  email: string,
  isOrganizer: boolean,
): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const s = await sb.from("group_schedules").select("author_email").eq("id", scheduleId).eq("meeting_id", meetingId).maybeSingle();
  if (s.error) return writeFail("일정 확인", s.error);
  if (!s.data) return { ok: false, message: "일정 없음", status: 404 };
  if (!isOrganizer && !same((s.data as Row).author_email, norm(email))) {
    return { ok: false, message: "만든 사람과 모임장만 취소 가능", status: 403 };
  }
  const u = await sb.from("group_schedules").update({ status: "cancelled" }).eq("id", scheduleId);
  if (u.error) return writeFail("일정 취소", u.error);
  return { ok: true };
}

/* ── 게시판 ───────────────────────────────────────────── */
export async function loadPosts(
  meetingId: string,
  email: string | null,
  isOrganizer: boolean,
): Promise<Loaded<PostView[]>> {
  const sb = getServiceSupabase();
  if (!sb) return { state: "missing" };
  const me = email ? norm(email) : null;
  const { data, error } = await sb
    .from("group_posts")
    .select("*")
    .eq("meeting_id", meetingId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return readFail("게시판", error);
  const rows = (data ?? []) as Row[];
  const tops = rows.filter((r) => !r.parent_id);
  const comments = new Map<string, CommentView[]>();
  for (const r of rows.filter((x) => x.parent_id).reverse()) {
    const k = String(r.parent_id);
    comments.set(k, [
      ...(comments.get(k) ?? []),
      {
        id: String(r.id),
        body: String(r.body ?? ""),
        authorLabel: labelOf(r, "author_email", "author_label"),
        createdAt: String(r.created_at ?? ""),
        mine: same(r.author_email, me),
      },
    ]);
  }
  /* 붙인 일정·노트의 이름 — 곁다리라 실패하면 이름 없이 그린다. */
  const sIds = [...new Set(tops.map((r) => r.schedule_id).filter(Boolean).map(String))];
  const nIds = [...new Set(tops.map((r) => r.note_id).filter(Boolean).map(String))];
  const sTitle = new Map<string, string>();
  const nTitle = new Map<string, string>();
  if (sIds.length > 0) {
    const s = await sb.from("group_schedules").select("id,title").in("id", sIds);
    for (const r of (s.data ?? []) as Row[]) sTitle.set(String(r.id), String(r.title ?? ""));
  }
  if (nIds.length > 0) {
    const n = await sb.from("inspection_notes").select("id,title").in("id", nIds);
    for (const r of (n.data ?? []) as Row[]) nTitle.set(String(r.id), String(r.title ?? ""));
  }
  return {
    state: "ok",
    data: tops.map((r) => {
      const mine = same(r.author_email, me);
      const noteId = r.note_id ? String(r.note_id) : null;
      return {
        id: String(r.id),
        board: String(r.board ?? "free") as ClubBoardId,
        body: String(r.body ?? ""),
        authorLabel: labelOf(r, "author_email", "author_label"),
        createdAt: String(r.created_at ?? ""),
        mine,
        canDelete: mine || isOrganizer,
        scheduleTitle: r.schedule_id ? (sTitle.get(String(r.schedule_id)) ?? null) : null,
        noteId: noteId && nTitle.has(noteId) ? noteId : null,
        noteTitle: noteId ? (nTitle.get(noteId) ?? null) : null,
        comments: comments.get(String(r.id)) ?? [],
      };
    }),
  };
}

export async function createPost(meetingId: string, email: string, label: string, v: PostInput): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  let noteId = v.noteId;
  if (noteId) {
    /* 남의 노트는 붙일 수 없다 — 내 노트인지 확인. */
    const n = await sb.from("inspection_notes").select("id,author_email").eq("id", noteId).maybeSingle();
    if (n.error || !n.data || !same((n.data as Row).author_email, norm(email))) noteId = null;
  }
  if (v.parentId) {
    const p = await sb.from("group_posts").select("id").eq("id", v.parentId).eq("meeting_id", meetingId).maybeSingle();
    if (p.error) return writeFail("글 확인", p.error);
    if (!p.data) return { ok: false, message: "글 없음", status: 404 };
  }
  const { data, error } = await sb
    .from("group_posts")
    .insert({
      meeting_id: meetingId,
      author_email: norm(email),
      author_label: label,
      board: v.parentId ? "free" : v.board,
      body: v.body,
      schedule_id: v.parentId ? null : v.scheduleId,
      note_id: v.parentId ? null : noteId,
      parent_id: v.parentId,
    })
    .select("id")
    .maybeSingle();
  if (error) return writeFail("글", error);
  return { ok: true, id: data?.id ? String(data.id) : undefined };
}

/** 글 내리기 — 지우지 않고 숨긴다(deleted_at). 쓴 사람과 모임장만. */
export async function hidePost(meetingId: string, postId: string, email: string, isOrganizer: boolean): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const p = await sb.from("group_posts").select("author_email").eq("id", postId).eq("meeting_id", meetingId).maybeSingle();
  if (p.error) return writeFail("글 확인", p.error);
  if (!p.data) return { ok: false, message: "글 없음", status: 404 };
  if (!isOrganizer && !same((p.data as Row).author_email, norm(email))) {
    return { ok: false, message: "쓴 사람과 모임장만 가능", status: 403 };
  }
  const u = await sb.from("group_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  if (u.error) return writeFail("글 내리기", u.error);
  return { ok: true };
}

/* ── 투표 ─────────────────────────────────────────────── */
export async function loadPolls(meetingId: string, email: string | null): Promise<Loaded<PollView[]>> {
  const sb = getServiceSupabase();
  if (!sb) return { state: "missing" };
  const me = email ? norm(email) : null;
  const { data, error } = await sb
    .from("group_polls")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return readFail("투표", error);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => String(r.id));
  const votes = new Map<string, Row[]>();
  if (ids.length > 0) {
    const v = await sb.from("group_poll_votes").select("*").in("poll_id", ids).limit(10000);
    if (v.error) return readFail("투표 결과", v.error);
    for (const r of (v.data ?? []) as Row[]) {
      const k = String(r.poll_id);
      votes.set(k, [...(votes.get(k) ?? []), r]);
    }
  }
  return {
    state: "ok",
    data: rows.map((r) => {
      const options = parsePollOptions(r.options);
      const list = votes.get(String(r.id)) ?? [];
      const t = tallyPoll(
        options,
        list.map((x) => ({ optionIds: Array.isArray(x.option_ids) ? (x.option_ids as string[]) : [] })),
      );
      const mineVote = list.find((x) => same(x.user_email, me));
      return {
        id: String(r.id),
        title: String(r.title ?? ""),
        kind: r.kind === "date" ? "date" : "text",
        multiple: r.multiple === true,
        options: options.map((o) => ({ ...o, count: t.counts[o.id] ?? 0 })),
        voters: t.voters,
        topIds: t.topIds,
        myVote: mineVote && Array.isArray(mineVote.option_ids) ? (mineVote.option_ids as string[]) : [],
        closed: Boolean(r.closed_at),
        mine: same(r.author_email, me),
        authorLabel: labelOf(r, "author_email", "author_label"),
        createdAt: String(r.created_at ?? ""),
      };
    }),
  };
}

export async function createPoll(meetingId: string, email: string, label: string, v: PollInput): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const { data, error } = await sb
    .from("group_polls")
    .insert({
      meeting_id: meetingId,
      author_email: norm(email),
      author_label: label,
      title: v.title,
      kind: v.kind,
      options: v.options,
      multiple: v.multiple,
    })
    .select("id")
    .maybeSingle();
  if (error) return writeFail("투표", error);
  return { ok: true, id: data?.id ? String(data.id) : undefined };
}

export async function votePoll(meetingId: string, pollId: string, email: string, picked: unknown): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const p = await sb.from("group_polls").select("*").eq("id", pollId).eq("meeting_id", meetingId).maybeSingle();
  if (p.error) return writeFail("투표 확인", p.error);
  if (!p.data) return { ok: false, message: "투표 없음", status: 404 };
  const row = p.data as Row;
  if (row.closed_at) return { ok: false, message: "마감된 투표", status: 409 };
  const ids = sanitizeVote(parsePollOptions(row.options), picked, row.multiple === true);
  if (!ids) return { ok: false, message: "항목 선택", status: 400 };
  const u = await sb
    .from("group_poll_votes")
    .upsert({ poll_id: pollId, user_email: norm(email), option_ids: ids }, { onConflict: "poll_id,user_email" });
  if (u.error) return writeFail("투표", u.error);
  return { ok: true };
}

export async function closePoll(meetingId: string, pollId: string, email: string, isOrganizer: boolean): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "모임 기능 준비 중", status: 503 };
  const p = await sb.from("group_polls").select("author_email").eq("id", pollId).eq("meeting_id", meetingId).maybeSingle();
  if (p.error) return writeFail("투표 확인", p.error);
  if (!p.data) return { ok: false, message: "투표 없음", status: 404 };
  if (!isOrganizer && !same((p.data as Row).author_email, norm(email))) {
    return { ok: false, message: "만든 사람과 모임장만 마감 가능", status: 403 };
  }
  const u = await sb.from("group_polls").update({ closed_at: new Date().toISOString() }).eq("id", pollId);
  if (u.error) return writeFail("투표 마감", u.error);
  return { ok: true };
}

/* ── 권한 ─────────────────────────────────────────────── */
/** 모임장이거나 참여 중인 멤버인지. 조회 실패는 던진다(권한을 추측하지 않는다). */
export async function clubRole(
  meetingId: string,
  organizerEmail: string,
  email: string | null,
): Promise<{ member: boolean; organizer: boolean }> {
  if (!email) return { member: false, organizer: false };
  const me = norm(email);
  if (organizerEmail && norm(organizerEmail) === me) return { member: true, organizer: true };
  const sb = getServiceSupabase();
  if (!sb) return { member: false, organizer: false };
  const { data, error } = await sb
    .from("group_members")
    .select("status")
    .eq("meeting_id", meetingId)
    .eq("user_email", me)
    .maybeSingle();
  if (error) throw new Error(`group_members 조회 실패: ${error.message}`);
  const st = String((data as Row | null)?.status ?? "");
  return { member: st === "joined" || st === "approved", organizer: false };
}

/** 글에 붙일 내 임장노트(최근 30개). 곁다리라 실패하면 빈 목록. */
export async function loadMyNoteTitles(email: string | null): Promise<{ id: string; title: string }[]> {
  const sb = getServiceSupabase();
  if (!sb || !email) return [];
  const { data, error } = await sb
    .from("inspection_notes")
    .select("id,title,created_at")
    .eq("author_email", norm(email))
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), title: String(r.title ?? "제목 없음") }));
}

/** [1169] MY 한 줄 — 내가 속한 모임 수와 가장 가까운 일정. 모임이 없거나 못 읽으면 null(줄을 그리지 않는다). */
export async function loadMyGroupLine(
  email: string | null,
): Promise<{ groupCount: number; groupId: string; next: { title: string; scheduledAt: string } | null } | null> {
  const sb = getServiceSupabase();
  if (!sb || !email) return null;
  const me = norm(email);
  const [mem, own] = await Promise.all([
    sb.from("group_members").select("meeting_id").eq("user_email", me).eq("status", "joined").limit(50),
    sb.from("meetings").select("id").eq("organizer_email", me).limit(50),
  ]);
  if (mem.error || own.error) return null;
  const ids = [
    ...new Set([
      ...((mem.data ?? []) as Row[]).map((r) => String(r.meeting_id)),
      ...((own.data ?? []) as Row[]).map((r) => String(r.id)),
    ]),
  ];
  if (ids.length === 0) return null;
  const sch = await sb
    .from("group_schedules")
    .select("meeting_id,title,scheduled_at,status")
    .in("meeting_id", ids)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);
  const row = sch.error ? null : (((sch.data ?? []) as Row[]).find((r) => String(r.status ?? "open") !== "cancelled") ?? null);
  return {
    groupCount: ids.length,
    groupId: row ? String(row.meeting_id) : ids[0],
    next: row ? { title: String(row.title ?? ""), scheduledAt: String(row.scheduled_at) } : null,
  };
}

/** [1170] 다가오는 일정 수만 — 채팅 화면 바로가기용(참석 명단은 읽지 않는다). */
export async function countUpcomingSchedules(meetingId: string): Promise<Loaded<number>> {
  const sb = getServiceSupabase();
  if (!sb) return { state: "missing" };
  const { count, error } = await sb
    .from("group_schedules")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId)
    .neq("status", "cancelled")
    .gte("scheduled_at", new Date().toISOString());
  if (error) return readFail("일정 수", error);
  return { state: "ok", data: count ?? 0 };
}

/** [1171] 일정에 붙일 내 관심 단지(최근 30곳). 곁다리라 실패하면 빈 목록. */
export async function loadMyComplexes(email: string | null): Promise<{ id: string; name: string }[]> {
  const sb = getServiceSupabase();
  if (!sb || !email) return [];
  const { data, error } = await sb
    .from("user_watchlist")
    .select("complex_id,complex_name,created_at")
    .eq("user_email", norm(email))
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return ((data ?? []) as Row[])
    .map((r) => ({ id: String(r.complex_id ?? ""), name: String(r.complex_name ?? "").trim() }))
    .filter((c) => c.id && c.name);
}
