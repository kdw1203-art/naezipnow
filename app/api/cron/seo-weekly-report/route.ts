/**
 * [1081 · #30] 주간 SEO 리포트 — 월요일 00:40 UTC(vercel.json). 메일(ALERT_EMAIL_TO · 발송 설정이 있을 때)과 응답 JSON.
 *
 * 싣는 것(전부 실측 · 없으면 "없음"으로 적는다):
 *  1) 사이트맵 URL 수 — 유형별(자식 사이트맵을 HTTP 로 읽어 <loc> 를 센다 · CDN 캐시라 싸다).
 *  2) 서치콘솔 색인률 최신 주(seo_index_coverage · GSC 서비스 계정이 연결됐을 때만 행이 있다 — 없으면 "연결 안 됨").
 *  3) 지난 7일 제로결과 검색어(search_zero_results) 상위 10.
 *  4) 이번 달 사이트 내 검색어 상위 10(KV · lib/search/query-stats).
 * 보호: lib/cron/authorize.ts. ?dryRun=1 이면 메일 없이 내용만.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { emailLayout, escapeHtml } from "@/lib/email/templates";
import { loadIndexCoverage } from "@/lib/admin/seo-metrics";
import { topSearchQueries } from "@/lib/search/query-stats";
import { SITEMAP_SECTION_SLUGS, sitemapSectionPath, type SitemapSectionSlug } from "@/lib/seo/sitemap-slugs";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SectionCount = { slug: string; urls: number | null };

async function countSitemapUrls(slug: SitemapSectionSlug): Promise<number | null> {
  /* 한 번 더 — 19개를 동시에 읽다 보면 콜드 스타트·순간 오류로 하나가 비는 일이 있다(로컬 실측 regions 1회). 404 는 재시도 없이 null */
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${DEFAULT_DESKTOP_ORIGIN}${sitemapSectionPath(slug)}`, {
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
        headers: { "User-Agent": "naezipnow-seo-weekly/1.0" },
      });
      if (res.status === 404) return null;
      if (!res.ok) continue;
      const xml = await res.text();
      return (xml.match(/<loc>/g) ?? []).length;
    } catch {
      /* 다음 시도 */
    }
  }
  return null;
}

async function zeroResultTop(sb: NonNullable<ReturnType<typeof getServiceSupabase>>): Promise<Array<{ query: string; count: number }>> {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data, error } = await sb.from("search_zero_results").select("query").gte("searched_at", since).limit(2000);
  if (error || !data) return [];
  const freq = new Map<string, number>();
  for (const r of data as Array<{ query: string }>) {
    const q = String(r.query ?? "").trim().toLowerCase();
    if (q) freq.set(q, (freq.get(q) ?? 0) + 1);
  }
  return [...freq.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const url = new URL(req.url);
  const started = Date.now();

  /* 1) 사이트맵 — 통짜 단지 파일(complexes)은 인덱스에 없으니 조각(complexes-N)만 센다 */
  const slugs = SITEMAP_SECTION_SLUGS.filter((s) => s !== "complexes");
  const sections: SectionCount[] = await Promise.all(slugs.map(async (slug) => ({ slug, urls: await countSitemapUrls(slug) })));
  const totalUrls = sections.reduce((s, x) => s + (x.urls ?? 0), 0);

  /* 2) 색인률 */
  const coverage = await loadIndexCoverage(2).catch(() => ({ state: "failed" as const, detail: "조회 실패" }));
  const latestCoverage = coverage.state === "ok" && coverage.rows.length > 0 ? coverage.rows[0] : null;

  /* 3) 제로결과 · 4) 검색어 TOP */
  const sb = getServiceSupabase();
  const zero = sb ? await zeroResultTop(sb) : [];
  const top = await topSearchQueries(10);

  const lines: string[] = [];
  lines.push(`사이트맵 URL ${totalUrls.toLocaleString("ko-KR")}개 — ${sections.map((s) => `${s.slug} ${s.urls === null ? "읽기 실패" : s.urls.toLocaleString("ko-KR")}`).join(" · ")}`);
  lines.push(
    latestCoverage
      ? `서치콘솔 색인(주 ${latestCoverage.collectedWeek}) — 제출 ${latestCoverage.submitted.toLocaleString("ko-KR")} · 색인 ${latestCoverage.indexed.toLocaleString("ko-KR")} · 미색인 ${latestCoverage.notIndexed.toLocaleString("ko-KR")}`
      : `서치콘솔 색인 — ${coverage.state === "not_configured" ? "연결 안 됨(GSC_SERVICE_ACCOUNT_* · GSC_SITE_URL)" : coverage.state === "failed" ? "조회 실패" : "기록 없음"}`,
  );
  lines.push(zero.length ? `지난 7일 제로결과 검색어 — ${zero.map((z) => `${z.query}(${z.count})`).join(" · ")}` : "지난 7일 제로결과 검색어 — 없음");
  lines.push(top.length ? `이번 달 검색어 TOP — ${top.map((t) => `${t.query}(${t.count})`).join(" · ")}` : "이번 달 검색어 TOP — 집계 없음(KV 미설정이거나 0건)");

  const subject = `[내집나우] 주간 SEO 리포트 — 사이트맵 ${totalUrls.toLocaleString("ko-KR")}개${latestCoverage ? ` · 색인 ${latestCoverage.indexed.toLocaleString("ko-KR")}` : ""}`;
  const text = lines.join("\n");
  const html = emailLayout(`<ul style="font-size:14px;line-height:1.7;color:#3d4657;padding-left:18px">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`);

  const to = process.env.ALERT_EMAIL_TO?.trim();
  let mail: { sent: boolean; reason?: string } = { sent: false, reason: "dryRun" };
  if (url.searchParams.get("dryRun") !== "1") {
    if (!to) mail = { sent: false, reason: "ALERT_EMAIL_TO 없음" };
    else if (!isEmailConfigured()) mail = { sent: false, reason: "메일 발송 미설정(RESEND_API_KEY 또는 SMTP_HOST)" };
    else {
      const r = await sendEmail({ to, subject, text, html });
      mail = r.sent ? { sent: true } : { sent: false, reason: r.reason };
      if (!r.sent) logger.warn("[cron/seo-weekly-report] 메일 발송 실패", r.reason);
    }
  }

  return NextResponse.json({ ok: true, subject, lines, sections, coverage: latestCoverage, zero, top, mail, ms: Date.now() - started });
}
