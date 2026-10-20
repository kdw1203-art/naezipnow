/**
 * [1080] POST /api/listings/<id>/view — 매물 조회수 핑.
 *
 * 예전엔 매물 상세(force-dynamic)가 **렌더 중에** DB 를 읽고 +1 썼다 — 크롤러·미리보기·새로고침까지 전부 쓰기였다.
 * 개발물건과 같은 꼴로 옮긴다: 클라이언트 핑(ViewPing) → 로봇 UA 제외 → IP 당 분 60회 → KV 버퍼 → 시간 단위 반영.
 * KV 가 없으면 바로 +1(종전 의미). 실패해도 페이지에는 영향이 없다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { incrementView } from "@/lib/listings/store-db";
import { bufferView } from "@/lib/views/buffer";
import { isBotAgent } from "@/lib/metrics/page-count";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 100) return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  if (isBotAgent(req.headers.get("user-agent"))) return NextResponse.json({ ok: true, skipped: "bot" });
  const rl = rateLimit(`listing-view:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: true, skipped: "rate" });
  const buffered = await bufferView("listing", id);
  if (buffered === "unavailable") await incrementView(id);
  return NextResponse.json({ ok: true });
}
