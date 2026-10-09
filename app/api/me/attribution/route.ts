/**
 * POST /api/me/attribution — [1046 · 성장] 가입 경로 잇기.
 *
 * 무엇: 로그인한 사람의 이 브라우저 방문자 키(분석 동의 뒤에서만 생기는 무작위 값 — TrafficRecorder)를 받아,
 * 그 키의 첫 착지(유입 호스트 · UTM · 첫 화면)를 가입 기록(public.signup_attribution)에 한 번 붙인다.
 * 판단은 전부 DB 함수(link_signup_attribution, service_role 전용)가 한다:
 *   · 가입 14일이 지난 계정은 붙이지 않는다(too_old) — "가입 경로"이지 평생 추적이 아니다.
 *   · 이미 붙었으면 그대로 둔다(exists) — 첫 기록이 정본.
 *   · 방문 기록이 없으면 빈 칸으로 붙인다(linked_no_events) — "기록 없음"과 "직접 유입"을 섞지 않는다.
 * 응답이 2xx 면 브라우저는 다시 묻지 않는다(nz_attr_done). 저장소 실패만 5xx — 다음 화면에서 다시 시도.
 *
 * 개인정보: 받는 값은 무작위 키 하나. 리퍼러는 호스트만, 경로는 쿼리 없는 화면 경로만 이미 저장돼 있다.
 * 회원 탈퇴 파기 대상(docs/ops/privacy-requests.md)에 이 표를 적었다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { ATTRIBUTION_DONE_STATUSES, isVisitorKey } from "@/lib/growth/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { visitorKey?: unknown } | null;
  const visitorKey = typeof body?.visitorKey === "string" ? body.visitorKey : "";
  if (!isVisitorKey(visitorKey)) {
    return NextResponse.json({ error: "방문자 키 형식이 아닙니다." }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "저장소 준비 안 됨" }, { status: 503 });

  const { data, error } = await sb.rpc("link_signup_attribution", {
    p_email: email,
    p_visitor_key: visitorKey,
    p_max_age_days: 14,
  });
  if (error) {
    logger.warn(`[attribution] 가입 경로 잇기 실패: ${error.message}`);
    return NextResponse.json({ error: "저장 실패 · 잠시 후 다시" }, { status: 500 });
  }
  const status = typeof data === "string" ? data : "unknown";
  if (!ATTRIBUTION_DONE_STATUSES.has(status)) {
    return NextResponse.json({ status }, { status: 400 });
  }
  return NextResponse.json({ status });
}
