import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { NATIONAL_DATASET, nationalCsv, parseNationalParams } from "@/lib/redevelopment/national";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** [1156] 전국 정비구역 목록 내려받기(CSV · 엑셀에서 바로 열림) — 화면과 같은 조건(시도 · 시군구 · 이름 · 단계 · 정렬). 공표 자료 그대로, 한 번에 2,000행까지. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const p = parseNationalParams(sp);
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "정비구역 불러오기 실패 · 잠시 후 다시" }, { status: 503 });
  let q = sb.from("redev_national_zones").select("sido,sigungu,name,stage,project_type,operator,households");
  if (p.sort === "households") q = q.order("households", { ascending: false, nullsFirst: false });
  q = q.order("sido").order("sigungu").order("name").limit(2000);
  if (p.sido) q = q.eq("sido", p.sido);
  if (p.sigungu) q = q.ilike("sigungu", `%${p.sigungu}%`);
  if (p.q) q = q.ilike("name", `%${p.q}%`);
  if (p.stage) q = q.ilike("stage", `%${p.stage}`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "정비구역 불러오기 실패 · 잠시 후 다시" }, { status: 503 });
  const body = nationalCsv((data ?? []) as Parameters<typeof nationalCsv>[0], NATIONAL_DATASET);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="redev-zones.csv"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
