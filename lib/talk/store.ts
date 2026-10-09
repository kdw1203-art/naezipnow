/**
 * [1051 · 홈 실시간 토론] 지역 토론 저장소 — 서버 전용(service role).
 *
 * 표: region_talks · region_talk_reports · report_region_talk()(supabase/migrations/20261009102924_1051_region_talks.sql).
 * RLS 켜고 정책 없음 — 오직 이 모듈만 닿는다. 읽기·쓰기 권한(로그인·작성자·관리자)은 라우트가 판정한다.
 * 응답에는 이메일을 싣지 않는다(표시 이름은 저장 때 마스킹해 둔 author_label).
 *
 * 조회 실패는 던진다 — 빈 목록으로 접으면 "글 없음"이 된다(화면이 실패와 없음을 구분한다).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { TALK_HOT_DAYS, TALK_REPORT_HIDE_THRESHOLD, type TalkPost } from "@/lib/talk/rules";

type Row = {
  id: string;
  region_id: string;
  region_name: string;
  complex_id: string | null;
  complex_name: string | null;
  author_email: string;
  author_label: string;
  body: string;
  created_at: string;
};

const SELECT = "id,region_id,region_name,complex_id,complex_name,author_email,author_label,body,created_at";

/** 로컬(키 없음) 개발용 메모리 — note-comments 와 같은 태도 */
const memory: (Row & { hidden_at: string | null; deleted_at: string | null })[] = [];

function toPost(r: Row, viewer: string | null): TalkPost {
  return {
    kind: "talk",
    id: String(r.id),
    author: String(r.author_label ?? ""),
    body: String(r.body ?? ""),
    complexId: r.complex_id ? String(r.complex_id) : null,
    complexName: r.complex_name ? String(r.complex_name) : null,
    createdAt: String(r.created_at ?? ""),
    ...(viewer && String(r.author_email ?? "").toLowerCase() === viewer ? { mine: true } : {}),
  };
}

/** 한 지역의 최근 글(최신 순) */
export async function listRegionTalks(regionId: string, viewerEmail: string | null, limit = 40): Promise<TalkPost[]> {
  const viewer = viewerEmail?.trim().toLowerCase() || null;
  const sb = getServiceSupabase();
  if (!sb) {
    return memory
      .filter((r) => r.region_id === regionId && !r.hidden_at && !r.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((r) => toPost(r, viewer));
  }
  const { data, error } = await sb
    .from("region_talks")
    .select(SELECT)
    .eq("region_id", regionId)
    .is("hidden_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(`region_talks 조회 실패: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => toPost(r, viewer));
}

/** 최근 TALK_HOT_DAYS 일 지역별 글 수 · 마지막 글 시각 */
export async function countRecentTalks(nowMs = Date.now()): Promise<Map<string, { count: number; last: string }>> {
  const since = new Date(nowMs - TALK_HOT_DAYS * 86_400_000).toISOString();
  const out = new Map<string, { count: number; last: string }>();
  const add = (regionId: string, at: string) => {
    const cur = out.get(regionId);
    if (cur) {
      cur.count += 1;
      if (at > cur.last) cur.last = at;
    } else out.set(regionId, { count: 1, last: at });
  };
  const sb = getServiceSupabase();
  if (!sb) {
    for (const r of memory) if (!r.hidden_at && !r.deleted_at && r.created_at >= since) add(r.region_id, r.created_at);
    return out;
  }
  const { data, error } = await sb
    .from("region_talks")
    .select("region_id,created_at")
    .gte("created_at", since)
    .is("hidden_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`region_talks 집계 실패: ${error.message}`);
  for (const r of (data ?? []) as { region_id: string; created_at: string }[]) add(String(r.region_id), String(r.created_at));
  return out;
}

/** 도배 판정 재료 — 이 사람의 최근 글(24시간) */
export async function listRecentTalksByAuthor(
  email: string,
  sinceIso: string,
): Promise<{ title: string; body: string; createdAt: string }[]> {
  const me = email.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return memory
      .filter((r) => r.author_email === me && r.created_at >= sinceIso)
      .map((r) => ({ title: r.body, body: r.body, createdAt: r.created_at }));
  }
  const { data, error } = await sb
    .from("region_talks")
    .select("body,created_at")
    .eq("author_email", me)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`region_talks(작성자) 조회 실패: ${error.message}`);
  return ((data ?? []) as { body: string; created_at: string }[]).map((r) => ({
    title: String(r.body ?? ""),
    body: String(r.body ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

export async function addRegionTalk(input: {
  regionId: string;
  regionName: string;
  complexId: string | null;
  complexName: string | null;
  authorEmail: string;
  authorLabel: string;
  body: string;
}): Promise<TalkPost> {
  const email = input.authorEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    const row = {
      id: crypto.randomUUID(),
      region_id: input.regionId,
      region_name: input.regionName,
      complex_id: input.complexId,
      complex_name: input.complexName,
      author_email: email,
      author_label: input.authorLabel,
      body: input.body,
      created_at: new Date().toISOString(),
      hidden_at: null,
      deleted_at: null,
    };
    memory.push(row);
    return toPost(row, email);
  }
  const { data, error } = await sb
    .from("region_talks")
    .insert({
      region_id: input.regionId,
      region_name: input.regionName,
      complex_id: input.complexId,
      complex_name: input.complexName,
      author_email: email,
      author_label: input.authorLabel,
      body: input.body,
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(`region_talks 저장 실패: ${error?.message ?? "응답 없음"}`);
  return toPost(data as Row, email);
}

/** 지우기 — 작성자 본인 또는 관리자. "forbidden" · null(없음) · true */
export async function softDeleteRegionTalk(
  id: string,
  who: { email: string; isAdmin: boolean },
): Promise<true | "forbidden" | null> {
  const me = who.email.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    const r = memory.find((x) => x.id === id && !x.deleted_at);
    if (!r) return null;
    if (r.author_email !== me && !who.isAdmin) return "forbidden";
    r.deleted_at = new Date().toISOString();
    return true;
  }
  const { data, error } = await sb.from("region_talks").select("id,author_email,deleted_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`region_talks 조회 실패: ${error.message}`);
  const row = data as { id: string; author_email: string; deleted_at: string | null } | null;
  if (!row || row.deleted_at) return null;
  if (String(row.author_email).toLowerCase() !== me && !who.isAdmin) return "forbidden";
  const { error: upErr } = await sb.from("region_talks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (upErr) throw new Error(`region_talks 지우기 실패: ${upErr.message}`);
  return true;
}

export type ReportResult = "reported" | "already" | "hidden" | "missing" | "bad_reporter";

/** 신고 — 한 사람당 한 번 · 3건이면 숨김(DB 함수가 한 번에) */
export async function reportRegionTalk(id: string, reporterEmail: string, reason: string): Promise<ReportResult> {
  const sb = getServiceSupabase();
  if (!sb) return "reported";
  const { data, error } = await sb.rpc("report_region_talk", {
    p_talk_id: id,
    p_reporter: reporterEmail,
    p_reason: reason.slice(0, 200),
    p_threshold: TALK_REPORT_HIDE_THRESHOLD,
  });
  if (error) throw new Error(`report_region_talk 실패: ${error.message}`);
  const v = String(data ?? "");
  return (["reported", "already", "hidden", "missing", "bad_reporter"] as const).includes(v as ReportResult)
    ? (v as ReportResult)
    : "reported";
}

/* ── [1052] 관리자 — 신고·숨김 글 ─────────────────────────────────── */

export type FlaggedTalk = {
  id: string;
  regionId: string;
  regionName: string;
  complexName: string | null;
  author: string;
  body: string;
  reportCount: number;
  hiddenAt: string | null;
  createdAt: string;
};

/** 신고가 하나라도 있거나 숨김(신고 3건 · 탈퇴 접수) 상태인 글 — 최신 순. 지운 글은 뺀다 */
export async function listFlaggedTalks(limit = 50): Promise<FlaggedTalk[]> {
  const sb = getServiceSupabase();
  const map = (r: Row & { report_count?: number | null; hidden_at?: string | null }): FlaggedTalk => ({
    id: String(r.id),
    regionId: String(r.region_id),
    regionName: String(r.region_name ?? ""),
    complexName: r.complex_name ? String(r.complex_name) : null,
    author: String(r.author_label ?? ""),
    body: String(r.body ?? ""),
    reportCount: Number(r.report_count ?? 0) || 0,
    hiddenAt: r.hidden_at ? String(r.hidden_at) : null,
    createdAt: String(r.created_at ?? ""),
  });
  if (!sb) {
    return memory
      .filter((r) => !r.deleted_at && r.hidden_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((r) => map(r));
  }
  const { data, error } = await sb
    .from("region_talks")
    .select(`${SELECT},report_count,hidden_at`)
    .is("deleted_at", null)
    .or("report_count.gt.0,hidden_at.not.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`region_talks(신고·숨김) 조회 실패: ${error.message}`);
  return ((data ?? []) as (Row & { report_count: number | null; hidden_at: string | null })[]).map(map);
}

/** 관리자 되살리기 — 숨김을 풀고 누적 수를 0 으로(이미 신고한 사람은 다시 신고하지 못한다 · 새 신고는 다시 센다) */
export async function restoreRegionTalk(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) {
    const r = memory.find((x) => x.id === id && !x.deleted_at);
    if (!r) return false;
    r.hidden_at = null;
    return true;
  }
  const { data, error } = await sb
    .from("region_talks")
    .update({ hidden_at: null, report_count: 0 })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`region_talks 되살리기 실패: ${error.message}`);
  return (data ?? []).length > 0;
}
