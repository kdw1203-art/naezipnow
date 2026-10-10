/**
 * [#96] 생활 인프라(학교·도시철도역) 표준데이터 인제스트 크론.
 * 보호: CRON_SECRET · 관리자 세션 (lib/cron/authorize.ts)
 * 선행: DATA_GO_KR_SERVICE_KEY + POI_SCHOOLS_API_PATH / POI_STATIONS_API_PATH
 *      (오너 패킷 ⑧ — 표준데이터 오픈API 상세의 요청 주소 경로 2개 · odcloud /api/… 또는 /openapi/tn_pubr_…)
 * 스케줄: .github/workflows/etl.yml — 매월 1일 + 수동(workflow_dispatch).
 *         학교·역 위치는 월 단위 갱신이면 충분하다.
 * [1053] 역을 먼저 — 단지 위치 지도가 공공 역 표를 먼저 읽는다(작은 표 · 1~2쪽). 학교(13쪽 안팎)는 그다음.
 *        기록: 조회 · 제외(이유별) · 업서트 · 쪽 · 끊긴 이유. 받았는데 하나도 못 저장했으면 오류(열 이름 불일치 단서 포함).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestPoi, poiIngestSummary } from "@/lib/poi/store";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const out: Record<string, unknown> = {};
  let anyError: string | null = null;
  for (const kind of ["stations", "schools"] as const) {
    const dataset = kind === "schools" ? "학교위치 표준데이터" : "도시철도역사 표준데이터";
    try {
      const r = await ingestPoi(kind);
      /* 받았는데 0건 저장 = 열 이름이 안 맞거나 좌표가 전부 이상하다 — "ok"로 묻히지 않게 오류로 남긴다 */
      const nothingSaved = r.configured && r.fetched > 0 && r.upserted === 0;
      /* env 는 있는데 주소 모양이 틀림(odcloud /api/… · /openapi/tn_pubr_… · 두 호스트의 전체 주소만) — 미설정과 달리 오류 */
      const badPath = !r.configured && r.reason === "bad-path";
      const summary = poiIngestSummary(r);
      out[kind] = { ...r, summary };
      if (nothingSaved) anyError = `${kind}: 받은 ${r.fetched}줄 중 저장 0건`;
      if (badPath) anyError = `${kind}: API 경로 형식 오류`;
      await logIngest({
        source: "poi",
        dataset,
        origin: "cron-fetch",
        rows: r.upserted,
        status: nothingSaved || badPath ? "error" : !r.configured ? "skipped" : "ok",
        message: summary,
      });
    } catch (err) {
      const message = ingestErrorMessage(err, `${kind} 인제스트 실패`);
      anyError = message;
      out[kind] = { error: message };
      await logIngest({
        source: "poi",
        dataset,
        origin: "cron-fetch",
        rows: 0,
        status: "error",
        message,
      });
    }
  }
  return NextResponse.json({ ok: !anyError, ...out }, { status: anyError ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
