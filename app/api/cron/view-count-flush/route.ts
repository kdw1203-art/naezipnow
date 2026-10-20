/**
 * [1080] 조회수 버퍼 반영 — 시간 1회(vercel.json).
 *
 * KV 에 모인 views:v1:<kind>:<id> 를 GETDEL 로 꺼내 DB view_count 에 더한다(lib/views/buffer). 실패한 키의 수는 버퍼에
 * 되돌려 다음 시간에 다시. KV 가 없으면 아무 일도 하지 않는다(그때는 핑이 직접 +1 하고 있다).
 * 보호: lib/cron/authorize.ts.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { flushViewBuffer } from "@/lib/views/buffer";
import { incrementView } from "@/lib/listings/store-db";
import { incrementDealView } from "@/lib/dev-deals/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const started = Date.now();
  const result = await flushViewBuffer(async (kind, id, n) =>
    kind === "listing" ? incrementView(id, n) : incrementDealView(id, n),
  );
  return NextResponse.json({ ok: true, ...result, ms: Date.now() - started });
}
