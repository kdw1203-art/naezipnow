import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { addressBrief, ageBand, ageFromBirth6, basicStats, memberQuery, phoneMasked, type BasicRow } from "./member-stats";

/* [1141 · 회원 조회] /admin/members — 가입 회원 목록(이메일 · 이름 검색) + 기본 정보 통계.
   조회 실패는 던진다(빈 목록으로 위장하지 않는다). 기본 정보는 줄여서 내보낸다(member-stats 참고). */

export type MemberRow = {
  email: string;
  name: string;
  plan: string;
  role: string;
  joinedAt: string;
  source: string | null;
  banned: boolean;
  ageBand: string;
  region: string;
  phone: string;
  job: string;
  housing: string;
  purpose: string;
  /** 기본 정보 여섯 칸이 다 찼나 */
  basicDone: boolean;
};

const LIMIT = 50;

export async function loadMembers(rawQuery: string | null, nowIso = new Date().toISOString()): Promise<{ total: number | null; rows: MemberRow[]; query: string }> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("[members] Supabase 서비스 클라이언트 미구성");
  const query = memberQuery(rawQuery);
  let q = sb.from("app_users").select("email,name,plan,role,created_at,signup_source,is_banned", { count: "exact" }).order("created_at", { ascending: false }).limit(LIMIT);
  if (query) q = q.or(`email.ilike.%${query}%,name.ilike.%${query}%`);
  const { data, error, count } = await q;
  if (error) throw new Error(`app_users 조회 실패: ${error.message}`);
  const users = (data ?? []) as Array<{ email: string; name: string | null; plan: string | null; role: string | null; created_at: string; signup_source: string | null; is_banned: boolean | null }>;
  const emails = users.map((u) => u.email.toLowerCase());
  const basicBy = new Map<string, Record<string, unknown>>();
  if (emails.length > 0) {
    const b = await sb.from("user_basic_info").select("*").in("email", emails);
    if (b.error) throw new Error(`user_basic_info 조회 실패: ${b.error.message}`);
    for (const r of (b.data ?? []) as Array<Record<string, unknown>>) basicBy.set(String(r.email), r);
  }
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const rows = users.map((u): MemberRow => {
    const b = basicBy.get(u.email.toLowerCase()) ?? {};
    const birth = s(b.birth_yymmdd);
    const address = s(b.address);
    const phone = s(b.phone);
    const job = s(b.job);
    const housing = s(b.housing);
    const purpose = s(b.purpose);
    return {
      email: u.email,
      name: u.name?.trim() || "이름 미입력",
      plan: u.plan ?? "free",
      role: u.role ?? "user",
      joinedAt: u.created_at,
      source: u.signup_source,
      banned: Boolean(u.is_banned),
      ageBand: ageBand(ageFromBirth6(birth, nowIso)),
      region: addressBrief(address),
      phone: phoneMasked(phone),
      job: job ?? "미입력",
      housing: housing ?? "미입력",
      purpose: purpose ?? "미입력",
      basicDone: Boolean(birth && address && phone && job && housing && purpose),
    };
  });
  return { total: typeof count === "number" ? count : null, rows, query };
}

export async function loadBasicStats(nowIso = new Date().toISOString()) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("[members] Supabase 서비스 클라이언트 미구성");
  const { data, error } = await sb.from("user_basic_info").select("*").limit(5000);
  if (error) throw new Error(`user_basic_info 조회 실패: ${error.message}`);
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const rows: BasicRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    birth: s(r.birth_yymmdd),
    address: s(r.address),
    job: s(r.job),
    housing: s(r.housing),
    purpose: s(r.purpose),
  }));
  return basicStats(rows, nowIso);
}
