import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { BasicInfo } from "./basic-info";

/* [1135] 기본 정보 저장소 — user_basic_info(email PK). app_users 와 따로 둔다:
   이메일 인증 가입은 app_users 행이 인증 뒤에 생기므로, 가입 때 받은 값을 이메일 열쇠로 먼저 둘 곳이 필요하다.
   서버(service_role)만 읽고 쓴다(RLS 켬 · 정책 없음). 실패는 던진다 — 부르는 쪽이 정한다. */

const norm = (email: string) => email.trim().toLowerCase();

export async function readBasicInfo(email: string): Promise<BasicInfo> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("기본 정보 저장소 미구성");
  const { data, error } = await sb.from("user_basic_info").select("phone, birth_yymmdd, address").eq("email", norm(email)).maybeSingle();
  if (error) throw new Error(`기본 정보 조회 실패: ${error.message}`);
  return { phone: (data?.phone as string | null) ?? null, birth: (data?.birth_yymmdd as string | null) ?? null, address: (data?.address as string | null) ?? null };
}

export async function saveBasicInfo(email: string, patch: Partial<BasicInfo>): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("기본 정보 저장소 미구성");
  const row: Record<string, unknown> = { email: norm(email), updated_at: new Date().toISOString() };
  if ("phone" in patch) row.phone = patch.phone ?? null;
  if ("birth" in patch) row.birth_yymmdd = patch.birth ?? null;
  if ("address" in patch) row.address = patch.address ?? null;
  const { error } = await sb.from("user_basic_info").upsert(row, { onConflict: "email" });
  if (error) throw new Error(`기본 정보 저장 실패: ${error.message}`);
}
