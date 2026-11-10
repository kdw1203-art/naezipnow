import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { BasicInfo } from "./basic-info";

/* [1135] 기본 정보 저장소 — user_basic_info(email PK). app_users 와 따로 둔다:
   이메일 인증 가입은 app_users 행이 인증 뒤에 생기므로, 가입 때 받은 값을 이메일 열쇠로 먼저 둘 곳이 필요하다.
   서버(service_role)만 읽고 쓴다(RLS 켬 · 정책 없음). 실패는 던진다 — 부르는 쪽이 정한다.
   [1138] 직업 · 보유 주택 · 이용 목적 열 추가(sql 211). 읽기는 * — 열이 아직 없는 DB 에서도 읽기는 깨지지 않는다(빈 값으로). */

const norm = (email: string) => email.trim().toLowerCase();
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** 열 이름 ↔ 화면 이름 */
const COLUMN: Record<keyof BasicInfo, string> = {
  birth: "birth_yymmdd",
  address: "address",
  phone: "phone",
  job: "job",
  housing: "housing",
  purpose: "purpose",
};

export async function readBasicInfo(email: string): Promise<BasicInfo> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("기본 정보 저장소 미구성");
  const { data, error } = await sb.from("user_basic_info").select("*").eq("email", norm(email)).maybeSingle();
  if (error) throw new Error(`기본 정보 조회 실패: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    birth: str(row[COLUMN.birth]),
    address: str(row[COLUMN.address]),
    phone: str(row[COLUMN.phone]),
    job: str(row[COLUMN.job]),
    housing: str(row[COLUMN.housing]),
    purpose: str(row[COLUMN.purpose]),
  };
}

export async function saveBasicInfo(email: string, patch: Partial<BasicInfo>): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("기본 정보 저장소 미구성");
  const row: Record<string, unknown> = { email: norm(email), updated_at: new Date().toISOString() };
  for (const k of Object.keys(COLUMN) as (keyof BasicInfo)[]) if (k in patch) row[COLUMN[k]] = patch[k] ?? null;
  const { error } = await sb.from("user_basic_info").upsert(row, { onConflict: "email" });
  if (error) throw new Error(`기본 정보 저장 실패: ${error.message}`);
}

/* [1138] 열 추가(sql 211) 전이면 필수 칸을 저장할 곳이 없다 — 그동안은 완성 화면으로 보내지 않는다(갇히지 않게).
   열이 있는지 1분 동안 기억한다. */
let readyMemo: { at: number; ready: boolean } | null = null;
export async function basicInfoColumnsReady(): Promise<boolean> {
  if (readyMemo && Date.now() - readyMemo.at < 60_000) return readyMemo.ready;
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("user_basic_info").select("job, housing, purpose").limit(0);
  readyMemo = { at: Date.now(), ready: !error };
  return !error;
}
