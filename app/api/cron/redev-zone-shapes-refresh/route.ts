/* [1206] 전국 정비구역 참고 경계 — 매달 1회 새로 받기(소유자 "한 달에 한 번 업데이트").
   1) 캐시 태그를 비우고 2) 한 번 받아 캐시를 다시 채운 뒤 3) 수를 수집 기록(market_ingest_log)에 남긴다.
   받기가 실패하면 태그만 비운 채 오류를 남긴다 — 다음 지도 요청이 다시 받는다. 서울은 서울시 자료(public/data) 그대로. */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { authorizeCron } from "@/lib/cron/authorize";
import { getVworldZoneShapes, VWORLD_ZONE_SHAPES_TAG } from "@/lib/redevelopment/vworld-zone-shapes-fetch";
import { logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  revalidateTag(VWORLD_ZONE_SHAPES_TAG);
  try {
    const r = await getVworldZoneShapes();
    const bySido: Record<string, number> = {};
    for (const z of r.zones) bySido[z.sgg.slice(0, 2)] = (bySido[z.sgg.slice(0, 2)] ?? 0) + 1;
    const message = `구역=${r.zones.length} 시도(코드)=${Object.entries(bySido).map(([k, v]) => `${k}:${v}`).join(",")} 키워드=${Object.entries(r.perKeyword).map(([k, v]) => `${k}:${v}`).join(",")}`;
    await logIngest({ source: "redev-shapes", dataset: "전국 정비구역 참고 경계(브이월드)", origin: "cron-fetch", rows: r.zones.length, status: r.zones.length > 0 ? "ok" : "skipped", message });
    return NextResponse.json({ ok: true, zones: r.zones.length, bySido, perKeyword: r.perKeyword });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logIngest({ source: "redev-shapes", dataset: "전국 정비구역 참고 경계(브이월드)", origin: "cron-fetch", rows: 0, status: "error", message: message.slice(0, 300) }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
