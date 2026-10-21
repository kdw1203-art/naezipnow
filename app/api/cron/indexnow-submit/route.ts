/**
 * N1 — IndexNow 제출 크론.
 *
 * 무엇을 보내는가 (= 실제로 자주 바뀌는 것만):
 *   1) 이번 달·직전 달 월간 리포트 — 실거래 신고가 매일 들어와 수치가 계속 변한다.
 *   2) 최근 7일 안에 갱신된 공개 임장노트 — 새 URL 이 생기는 유일한 사용자 경로.
 *   3) 데이터가 매일 갱신되는 허브 3개(/reports·/tx·/).
 *   4) [1046] 지난 하루 사이 최근 계약월(당월·전월) 거래가 새로 들어온 단지 페이지 — 최대 900개.
 *      유입의 46%가 단지 페이지로 착지하는데 여기서 한 번도 알리지 않았다. 고르는 규칙은
 *      lib/seo/indexnow-pick.ts(옛 연도 이력 백필은 고르지 않는다 — "바뀐 것만" 원칙 그대로).
 *
 * 왜 전체를 안 보내는가: 안 바뀐 URL 을 매일 밀어 넣는 건 프로토콜 남용이고,
 * 스팸으로 분류되면 도메인 단위로 무시당한다. 사이트 전체 색인은 사이트맵의 일이다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * 스케줄러는 .github/workflows/etl.yml — 이 서비스의 유일한 스케줄러다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { listReportMonths } from "@/lib/reports/monthly";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { withBudget } from "@/lib/async/with-budget";
import { listFreshComplexPaths } from "@/lib/seo/indexnow-complexes";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { recentReportSlugs } from "@/lib/region/monthly-report";
import { GUIDES, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { glossaryPaths } from "@/lib/seo/glossary-terms";
import { TEMPERATURE_REGIONS } from "@/lib/market/temperature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://naezipnow.com";
const NOTE_FRESH_DAYS = 7;

/** 데이터가 매일 갱신되는 허브 — 여기는 "바뀌었다"가 사실이다. */
const DAILY_HUBS = ["/", "/reports", "/tx"];

/**
 * 수집에 주는 시간(ms). 이 라우트는 maxDuration=60 이라 수집이 늦어지면 제출도
 * 못 해 보고 통째로 죽는다(실제로 60초 타임아웃으로 죽은 기록이 있다). 25초에
 * 접으면 남은 시간으로 허브 3개라도 제출하고, 무엇이 빠졌는지 응답에 남긴다.
 */
const COLLECT_BUDGET_MS = 25_000;

/** [1081] 한국 시간 월요일인가 — 주 1회 묶음(가이드·용어·시장 온도)의 제출일 */
function isKstMonday(now: number = Date.now()): boolean {
  return new Date(now + 9 * 3600_000).getUTCDay() === 1;
}

type Collected = {
  urls: string[];
  detail: Record<string, number>;
  /** 조회에 실패해서 빠진 블록. 비어 있음(0건)과 구분하기 위해 따로 싣는다. */
  missing: string[];
};

async function collectUrls(): Promise<Collected> {
  const urls: string[] = DAILY_HUBS.map((p) => `${BASE}${p}`);
  const detail: Record<string, number> = { hubs: DAILY_HUBS.length, reports: 0, regionReports: 0, weekly: 0, notes: 0, complexes: 0 };
  const missing: string[] = [];

  /* 둘을 나란히 돌린다 — 순차로 돌리면 예산이 두 배로 쌓여 25초 상한이 50초가
     되고, maxDuration=60 안에 제출까지 끝낼 여유가 없어진다. */
  const [monthsRun, notesRun, complexRun, snapshotsRun] = await Promise.all([
    withBudget(
      Promise.resolve().then(() => listReportMonths()),
      COLLECT_BUDGET_MS,
    ),
    withBudget(
      Promise.resolve().then(() => listPublicNotes(200)),
      COLLECT_BUDGET_MS,
    ),
    withBudget(
      Promise.resolve().then(() => listFreshComplexPaths()),
      COLLECT_BUDGET_MS,
    ),
    /* [1082] 지역 스냅샷은 월요일(지역 리포트 묶음)에만 읽는다 — 다른 날은 전량 조회를 내지 않는다 */
    isKstMonday()
      ? withBudget(
          Promise.resolve().then(() => getAllRegionSnapshots()),
          COLLECT_BUDGET_MS,
        )
      : Promise.resolve({ state: "ok" as const, value: new Map<string, unknown>() }),
  ]);

  // 최신 2개월 리포트 — 신고 지연 때문에 이 두 달의 수치만 계속 움직인다.
  /* 실패해도 제출 자체를 포기하지는 않는다(허브는 여전히 보낼 값어치가 있다).
     다만 reports: 0 을 "이번 달 리포트가 없다"로 읽으면 안 되므로 missing 에 남긴다. */
  if (monthsRun.state === "ok") {
    const recent = monthsRun.value.slice(0, 2);
    for (const m of recent) urls.push(`${BASE}/reports/${m.ym}`);
    detail.reports = recent.length;
  } else {
    missing.push(monthsRun.state === "timeout" ? "reports(시간 초과)" : "reports(조회 실패)");
  }

  /* [1081 · #6·#18] 지역 × 최신 완결 월 리포트(/region/<id>/report/<yyyy-mm>) — 신고가 아직 들어오는 달이라 값이 움직인다.
     데이터가 있는 지역(스냅샷)만 보낸다 — 없는 지역은 404 라 보내면 안 된다.
     [1082] 주 1회(한국 월요일)만 — 그 페이지는 ISR 7일(app/region/[id]/report/[ym] revalidate 604800)이라 매일 알려도 크롤러가 보는 내용은
     주 단위로만 바뀐다. "바뀐 것만" 원칙(머리 주석)을 지키고 일일 제출량(265)도 줄인다. */
  if (snapshotsRun.state === "ok") {
    const latest = recentReportSlugs(1)[0];
    if (latest && isKstMonday()) {
      for (const id of snapshotsRun.value.keys()) urls.push(`${BASE}/region/${id}/report/${latest}`);
      detail.regionReports = snapshotsRun.value.size;
    }
  } else {
    missing.push(snapshotsRun.state === "timeout" ? "regionReports(시간 초과)" : "regionReports(조회 실패)");
  }

  /* [1081 · #6] 주 1회 묶음(한국 월요일) — 가이드·용어·시장 온도 지역(주간 스냅샷은 매주 바뀐다). 상한 1,000 안에서 노트·단지보다 앞. */
  if (isKstMonday()) {
    const weekly = [
      ...GUIDES.map((g) => `/guides/${g.slug}`),
      ...LEGACY_GUIDES.map((g) => `/guides/${g.slug}`),
      ...glossaryPaths(),
      ...TEMPERATURE_REGIONS.map((r) => `/analysis/temperature/${r.id}`),
      "/guides",
      "/glossary",
      "/analysis/temperature",
      "/imjang",
    ];
    for (const p of weekly) urls.push(`${BASE}${p}`);
    detail.weekly = weekly.length;
  }

  // 최근 7일 내 갱신된 공개 노트
  if (notesRun.state === "ok") {
    const cutoff = Date.now() - NOTE_FRESH_DAYS * 24 * 60 * 60 * 1000;
    const fresh = notesRun.value.filter((n) => {
      if (!n.isPublic) return false;
      const t = n.updatedAt ? new Date(n.updatedAt).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    for (const n of fresh) urls.push(`${BASE}/notes/${n.id}`);
    detail.notes = fresh.length;
  } else {
    missing.push(notesRun.state === "timeout" ? "notes(시간 초과)" : "notes(조회 실패)");
  }

  /* [1046] 새 거래가 들어온 단지 — 허브·리포트·노트 뒤에 붙인다(제출 상한 1,000 에서 잘려도 앞의 것은 남는다) */
  if (complexRun.state === "ok") {
    for (const p of complexRun.value.paths) urls.push(`${BASE}${p}`);
    detail.complexes = complexRun.value.paths.length;
    detail.complexRows = complexRun.value.rows;
    /* [1052] 행 상한에 닿으면 표시(최신 순이라 잘린 것은 오래된 단지) */
    detail.complexTruncated = complexRun.value.truncated ? 1 : 0;
  } else {
    missing.push(complexRun.state === "timeout" ? "complexes(시간 초과)" : "complexes(조회 실패)");
  }

  return { urls, detail, missing };
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const { urls, detail, missing } = await collectUrls();

  // dryRun=1 이면 무엇을 보낼지만 확인한다(운영에서 눈으로 점검할 때 쓴다).
  if (url.searchParams.get("dryRun") === "1") {
    return NextResponse.json({ dryRun: true, count: urls.length, detail, missing, urls });
  }

  const result = await submitIndexNow(urls);
  return NextResponse.json(
    {
      ok: result.ok,
      submitted: result.submitted,
      status: result.status,
      message: result.message,
      detail,
      /* 빠진 블록이 있으면 숨기지 않는다 — detail.notes === 0 이 "새 노트가 없다"
         인지 "못 읽었다"인지는 여기를 봐야 구분된다. */
      ...(missing.length > 0 ? { missing } : {}),
      finishedAt: new Date().toISOString(),
    },
    // 제출 실패를 200 으로 감추지 않는다 — 조용히 죽으면 아무도 모른다.
    { status: result.ok ? 200 : 500 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
