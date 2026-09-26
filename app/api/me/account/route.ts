/**
 * [1006] GET /api/me/account — 설정 › 계정 탭의 계정 사실.
 *   { facts: AccountFacts }   (lib/me/account-facts.ts)
 *   · 연결된 로그인 수단(이메일/구글/카카오/토스) · 가입일 · 동의 마지막 갱신일 · 동의 상태
 * 비로그인 401 · DB 미설정/조회 실패 503(없는 사실을 "연결 안 됨" 으로 그리지 않는다).
 * 해시 같은 원문은 서버에서 boolean 으로만 바뀐다 — 응답에 실리지 않는다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";
import { deriveAccountFacts, type AppUserFactsRow } from "@/lib/me/account-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_COLUMNS =
  "created_at, consent_updated_at, marketing_agreed, location_agreed, password_hash, kakao_linked_at, toss_linked_at, toss_unlinked_at";
/* 소셜 연결 열이 아직 없는 배포 — 최소 열로 재시도(fetch-app-user 와 같은 태도) */
const MIN_COLUMNS = "created_at, consent_updated_at, marketing_agreed, location_agreed, password_hash";

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email.trim().toLowerCase();
  const sub = (session.user as { id?: string }).id ?? null;
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "서비스를 이용할 수 없습니다." }, { status: 503 });
  }
  try {
    let { data, error } = await sb.from("app_users").select(FULL_COLUMNS).eq("email", email).maybeSingle();
    if (error) {
      ({ data, error } = await sb.from("app_users").select(MIN_COLUMNS).eq("email", email).maybeSingle());
    }
    if (error) throw new Error(error.message);
    const facts = deriveAccountFacts((data as AppUserFactsRow | null) ?? null, {
      sessionSub: sub,
      providersConfigured: getConfiguredSocialProviders(),
    });
    return NextResponse.json({ facts });
  } catch (err) {
    return dbUnavailable("계정 사실 조회 실패", err, "계정 정보를 불러올 수 없습니다.");
  }
}
