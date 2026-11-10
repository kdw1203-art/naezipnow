import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isBasicInfoComplete, validateRequiredBasicInfo } from "@/lib/account/basic-info";
import { basicInfoColumnsReady, readBasicInfo, saveBasicInfo } from "@/lib/account/basic-info-store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [1135] 내 기본 정보 — 본인만 읽고 고친다.
   [1138] 필수 — 저장은 여섯 칸(생년월일 · 주소 · 휴대전화 · 직업 · 보유 주택 · 이용 목적)을 한 번에, 모두 있어야 받는다(지우기 없음 · 지우려면 탈퇴).
   GET 은 complete 를 함께 준다 — 완성 화면으로 보낼지 화면이 정한다. */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  try {
    const [info, ready] = await Promise.all([readBasicInfo(email), basicInfoColumnsReady()]);
    /* ready=false(열 추가 전)면 저장할 곳이 없으니 완성 화면으로 보내지 않는다 */
    return NextResponse.json({ ...info, complete: isBasicInfoComplete(info), ready }, { headers: { "Cache-Control": "no-store" } });
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
  const v = validateRequiredBasicInfo(body);
  if (!v.ok) return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });
  try {
    await saveBasicInfo(email, v.value);
    const info = await readBasicInfo(email);
    return NextResponse.json({ ok: true, ...info, complete: isBasicInfoComplete(info) });
  } catch (e) {
    logger.warn("[basic-info] 저장 실패", e);
    return NextResponse.json({ error: "기본 정보 저장 실패 · 잠시 후 다시" }, { status: 503 });
  }
}
