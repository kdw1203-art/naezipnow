import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { isMissingTableError, isTransientSchemaCacheError } from "@/lib/supabase/pg-error";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isBotUserAgent } from "@/lib/client/is-bot-ua";
import { normalizeSampleRate } from "@/lib/metrics/vitals-sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "FID"]);

type VitalsPayload = {
  metric?: string;
  value?: number | string;
  rating?: string;
  path?: string;
  navType?: string;
  /* [OPT-01] attribution — LCP 요소 선택자·리소스 URL, INP 대상 등 */
  element?: string;
  attrUrl?: string;
  /* [979] 이 줄이 재는 단위 — "route"(화면 하나) | "doc"(문서=방문 하나).
     둘 다 아니면 null 로 저장한다. NULL 은 2026-09-09 이전 옛 표본을 뜻하므로
     아는 값을 흘리지 않는다(잘못 채우면 옛 표본과 섞인다). */
  scope?: string;
  /* [1010] 이 줄이 전체의 몇 분의 일인가(0<r<=1). 리포터가 세션 단위로 주사위를 굴려
     보낸 표본이라는 뜻이다 — lib/metrics/vitals-sample.ts. 옛 번들은 싣지 않는다(→ null). */
  sampleRate?: number | string;
};

/* [979] 리포터가 보내는 단위. 표에는 이 둘 또는 NULL(옛 표본)만 들어간다. */
const VALID_SCOPES = new Set(["route", "doc"]);

/* [1007 · V2a-5] 한 요청에 받는 표본 상한 — 리포터(WebVitalsReporter MAX_QUEUE)와 같다.
   그 이상은 잘라 버린다(도배 방어 — 수집이지 계약이 아니다). */
const MAX_BATCH = 50;

type VitalRow = {
  metric: string;
  value: number;
  rating: string | null;
  path: string | null;
  nav_type: string | null;
  user_agent: string | null;
  element: string | null;
  attr_url: string | null;
  scope: string | null;
};

/** 표본 하나를 저장 행으로 — 지표·값이 틀리면 null(그 줄만 버린다) */
function toRow(body: VitalsPayload, userAgent: string | null): VitalRow | null {
  const metric = String(body.metric ?? "").toUpperCase();
  if (!VALID_METRICS.has(metric)) return null;
  const value = Number(body.value);
  if (!Number.isFinite(value)) return null;
  return {
    metric,
    value,
    rating: typeof body.rating === "string" ? body.rating.slice(0, 16) : null,
    path: typeof body.path === "string" ? body.path.slice(0, 256) : null,
    nav_type: typeof body.navType === "string" ? body.navType.slice(0, 32) : null,
    user_agent: userAgent,
    element: typeof body.element === "string" ? body.element.slice(0, 256) : null,
    attr_url: typeof body.attrUrl === "string" ? body.attrUrl.slice(0, 512) : null,
    scope: typeof body.scope === "string" && VALID_SCOPES.has(body.scope) ? body.scope : null,
  };
}

/**
 * POST /api/metrics/web-vitals
 *
 * 본문: 표본 하나(객체) 또는 표본 배열 — [1007] 리포터는 한 문서의 표본을 모아 **배열 한 번**으로
 * 보낸다(pagehide/visibilitychange). 예전 단건 객체도 그대로 받는다(구 탭·캐시된 번들 호환).
 *
 * [1007 · V2a-5c] UA 가 봇이면 저장 없이 204. 실측 4,350회/일 중 사람 페이지뷰는 ~17 — 나머지는
 * JS 를 실행하는 크롤러가 보낸 값이었고, 그것이 /admin/perf 의 p75 를 만들었다. 리포터가 먼저
 * 거르지만(클라이언트 봇 판정) UA 를 속이지 않는 봇은 여기서 한 번 더 걸린다. 이 뒤로 web_vitals 와
 * /admin/perf 의 p75·화면별 집계는 **사람 기준**이다 — 2026-09-20 이전 표본과 직접 비교하지 말 것.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 256);
  if (isBotUserAgent(ua)) return new NextResponse(null, { status: 204 });

  /* 무인증 텔레메트리 — 페이지뷰당 이제 요청 1회(표본 ≤ 50) 안팎이다. 도배만 막는다. */
  const rl = rateLimit(`web-vitals:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const list: VitalsPayload[] = Array.isArray(body)
    ? (body as VitalsPayload[]).slice(0, MAX_BATCH)
    : body && typeof body === "object"
      ? [body as VitalsPayload]
      : [];
  if (list.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid metric" }, { status: 400 });
  }

  /* [1010] 표본 비율 — 이 요청이 "몇 분의 일"인지. 배열의 첫 유효값을 쓴다(한 문서의
     표본은 같은 세션에서 나오므로 줄마다 다를 수 없다).

     저장하지 않는 이유: web_vitals 에 열이 없고 이 작업에서 마이그레이션을 적용하지
     않는다. 대신 아래 응답과 로그에 실어 둔다 — **집계가 개수를 쓸 때는 반드시
     1/sampleRate 로 보정해야 한다**:
       · /admin/perf 의 "표본 N건"·"표본 3건 미만 경로는 접기" 문턱
       · ops.cwv_page_check 의 경보 문턱
       · public.capture_seo_field_perf_rum 의 주간 시계열 표본 수
     p50·p75 같은 분위수는 **보정하지 않는다** — 세션 단위 무작위 추출이라 분포는
     그대로다(지표마다 버렸다면 깨졌을 것이다). 보정이 필요한 것은 "개수"뿐이다.
     열이 생기면 여기서 rows 에 실어 저장하면 된다(통합자 몫 — 보고서 참고). */
  const sampleRate = list.reduce<number | null>(
    (acc, b) => acc ?? normalizeSampleRate(b.sampleRate),
    null,
  );

  const rows = list.map((b) => toRow(b, ua || null)).filter((r): r is VitalRow => r !== null);
  if (rows.length === 0) {
    /* 단건 호환: 예전과 같은 이유 문구 — 지표 이름이 틀렸는지 값이 숫자가 아닌지 */
    const first = list[0];
    const metric = String(first.metric ?? "").toUpperCase();
    const reason = VALID_METRICS.has(metric) ? "invalid value" : "invalid metric";
    return NextResponse.json({ ok: false, error: reason }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    // 개발 환경 fallback — 로그만 남김
    for (const r of rows) {
      logger.info("[web-vitals:stub]", r.metric, Math.round(r.value * 100) / 100, r.path ?? "");
    }
    return NextResponse.json({ ok: true, stored: false, count: rows.length, sampleRate });
  }

  const { error } = await sb.from("web_vitals").insert(rows);
  if (error) {
    // 초기 운영에서 테이블이 아직 없으면 수집만 생략하고 정상 응답
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: true, stored: false, reason: "table_missing" });
    }
    /* PGRST002 는 "테이블이 없다"가 아니라 "지금 DB 가 밀린다"이다. 예전 판정은
       메시지에 "schema cache" 가 들어 있다는 이유로 이걸 table_missing 으로
       돌려줬는데, 그러면 하루 열 몇 건의 일시적 장애가 "그 테이블은 원래 없다"는
       기록으로 남는다. 수집을 건너뛰는 건 같지만, 이유는 사실대로 적는다. */
    if (isTransientSchemaCacheError(error)) {
      return NextResponse.json(
        { ok: false, stored: false, reason: "db_busy" },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    /* 게이트웨이가 밀리면 error.message 가 HTML 오류 페이지 한 장(<!DOCTYPE html>…)
       통째로 들어온다. 그대로 흘리면 오류 대시보드가 그 본문으로 덮여 정작 봐야 할
       오류가 안 보인다 — 앞부분만 남긴다. 상태 코드는 그대로 500 이다(수집이
       실패한 건 사실이므로 성공으로 위장하지 않는다). */
    const brief = error.message.replace(/\s+/g, " ").slice(0, 200);
    logger.error("[web-vitals]", brief);
    return NextResponse.json({ ok: false, error: brief }, { status: 500 });
  }
  /* [1010] count 는 **표본의 개수**다 — 모집단은 count/sampleRate. 위 주석 참고. */
  return NextResponse.json({ ok: true, stored: true, count: rows.length, sampleRate });
}
