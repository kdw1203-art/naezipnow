/**
 * [1008 · J] GET/PUT /api/me/journey — 내 집 마련 여정 진행(단계 체크 + 계약·잔금 일정표) 저장.
 *
 *  GET → { state }   · PUT { state } → { state }(서버가 정규화해 저장한 최종본)
 *  세션 필수(401). 본문은 8KB, 정규화한 상태는 4KB 상한(413). 응답은 개인 것이라 private, no-store.
 *
 * 부르는 곳은 lib/journey/client-store.ts 하나 — 로그인 힌트(nz_authed)가 있고 세션이 확인된 사람만
 * 페이지를 열 때 GET 하고, 체크·날짜를 바꿀 때만 PUT 한다(비회원·봇은 이 API 를 치지 않는다).
 * 칸(journey_state)은 마이그레이션 20260921002000 이 만든다(운영 적용됨 2026-09-21). 조회·저장이 실패하면 500 이고,
 * 화면은 이 기기(계정 사본)에 적어 두고 다음에 합친다(lib/journey/client-store.ts).
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getJourneyState, putJourneyState } from "@/lib/journey/store";
import {
  JOURNEY_BODY_MAX_BYTES,
  JOURNEY_STATE_MAX_BYTES,
  journeyStateBytes,
  normalizeJourneyState,
} from "@/lib/journey/state";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return json({ error: "로그인이 필요합니다." }, 401);
  try {
    return json({ state: await getJourneyState(email) });
  } catch (err) {
    logger.warn("[api/me/journey] 조회 실패", err);
    return json({ error: "진행 상황을 불러오지 못했어요." }, 500);
  }
}

export async function PUT(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return json({ error: "로그인이 필요합니다." }, 401);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > JOURNEY_BODY_MAX_BYTES) {
    return json({ error: "요청이 너무 커요." }, 413);
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  if (new TextEncoder().encode(text).length > JOURNEY_BODY_MAX_BYTES) {
    return json({ error: "요청이 너무 커요." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "잘못된 요청" }, 400);
  }
  if (!body || typeof body !== "object" || !("state" in body)) {
    return json({ error: "state 가 필요합니다." }, 400);
  }
  const state = normalizeJourneyState((body as { state: unknown }).state);
  if (journeyStateBytes(state) > JOURNEY_STATE_MAX_BYTES) {
    return json({ error: "저장할 내용이 너무 커요." }, 413);
  }
  try {
    return json({ state: await putJourneyState(email, state) });
  } catch (err) {
    /* 저장 실패는 실패로 — 200 을 주면 화면이 "계정에 저장됨"이라고 거짓말을 한다 */
    logger.error("[api/me/journey] 저장 실패", err);
    return json({ error: "저장하지 못했어요. 이 기기에는 남아 있어요." }, 500);
  }
}
