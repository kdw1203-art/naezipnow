/**
 * [1061] /api/admin/search-report — 관리자 전용. 검색엔진 리포트 손 기록(네이버 서치어드바이저 등).
 *  GET  ?engine=naver            → { items: SearchReport[] } (최신 12건)
 *  POST { engine, date, periodDays?, clicks?, impressions?, indexedPages?, note? } → { ok: true, report }
 * 규칙은 lib/seo/search-report-rules(순수) · 저장은 lib/admin/search-reports(kv 표). 하드 삭제 없음.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { listSearchReports, saveSearchReport } from "@/lib/admin/search-reports";
import { SEARCH_REPORT_ENGINES, normalizeSearchReport, type SearchReportEngine } from "@/lib/seo/search-report-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminEmail(): Promise<string | null> {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email || !isAdmin(session)) return null;
  return email;
}

export async function GET(req: Request) {
  const email = await adminEmail();
  if (!email) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  const engine = new URL(req.url).searchParams.get("engine") ?? "naver";
  if (!(SEARCH_REPORT_ENGINES as readonly string[]).includes(engine)) {
    return NextResponse.json({ error: "엔진 값이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const items = await listSearchReports(engine as SearchReportEngine);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return dbUnavailable("admin/search-report:list", e, "기록 불러오기 실패 · 잠시 후 다시");
  }
}

export async function POST(req: Request) {
  const email = await adminEmail();
  if (!email) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const r = normalizeSearchReport(body, email, new Date().toISOString());
  if (!r.ok) return NextResponse.json({ error: r.errors.join(" · ") }, { status: 400 });
  try {
    await saveSearchReport(r.report);
    return NextResponse.json({ ok: true, report: r.report });
  } catch (e) {
    return dbUnavailable("admin/search-report:save", e, "기록 저장 실패 · 잠시 후 다시");
  }
}
