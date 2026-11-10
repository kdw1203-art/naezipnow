import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { validateBasicInfo } from "@/lib/account/basic-info";
import { readBasicInfo, saveBasicInfo } from "@/lib/account/basic-info-store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [1135] 내 기본 정보(연락처 · 생년월일 6자리 · 주소) — 본인만 읽고 고친다. 전부 선택 칸 · 빈 값은 지움. */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  try {
    return NextResponse.json(await readBasicInfo(email), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.warn("[basic-info] 조회 실패", e);
    return NextResponse.json({ error: "기본 정보 불러오기 실패 · 잠시 후 다시" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식 확인" }, { status: 400 });
  const v = validateBasicInfo(body);
  if (!v.ok) return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });
  try {
    await saveBasicInfo(email, v.value);
    return NextResponse.json({ ok: true, ...(await readBasicInfo(email)) });
  } catch (e) {
    logger.warn("[basic-info] 저장 실패", e);
    return NextResponse.json({ error: "기본 정보 저장 실패 · 잠시 후 다시" }, { status: 503 });
  }
}
