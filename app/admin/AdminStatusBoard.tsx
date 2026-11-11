import Link from "next/link";
import { loadDataFreshness } from "@/lib/admin/data-freshness";
import { loadCriticalAlerts24h } from "@/lib/admin/health-alerts";
import { criticalAlertNames } from "@/lib/admin/health-alerts-fold";
import { kvAvailable, kvPingDetail } from "@/lib/kv/rest";
import { dbSizeLine, headline, queueLine, summarizeFreshness, worstLevel, type SignalLevel, type StatusLine } from "@/lib/admin/status-board";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [1140 · 관리자 개편] 대시보드 맨 위 "서비스 상태" — 데이터 수집 · 처리 대기 · 사이트 세 칸을 초록 · 노랑 · 빨강으로.
   예전엔 수집이 멈췄는지는 신선도 화면, 공용 카운터가 끊겼는지는 /api/health 를 직접 열어야 알았다(2026-11-11 로그인 막힘이 그렇게 늦게 보였다).
   모르는 것은 초록으로 칠하지 않는다 — 못 읽은 칸은 "불러오기 실패"(노랑). 숫자는 전부 실집계. */

const DOT: Record<SignalLevel, string> = { ok: "bg-[#35c98a]", warn: "bg-[#e6b34a]", bad: "bg-[#ff6b5e]" };
const WORD: Record<SignalLevel, string> = { ok: "정상", warn: "주의", bad: "장애" };
const card = "rounded-lg border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] p-[18px]";

function Lines({ lines }: { lines: StatusLine[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {lines.map((l) => {
        const body = (
          <>
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-[#e3e8f1]">
              <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${DOT[l.level]}`} />
              <span className="truncate">{l.label}</span>
              <span className="sr-only">{WORD[l.level]}</span>
            </span>
            <span className="flex-none text-right text-[12px] text-[#9aa6b8]">{l.detail}</span>
          </>
        );
        return (
          <li key={l.label} className="border-t border-[rgba(255,255,255,.06)] first:border-t-0">
            {l.href ? (
              <Link href={l.href} className="flex min-h-10 items-center justify-between gap-3 no-underline hover:bg-[rgba(255,255,255,.03)]">
                {body}
              </Link>
            ) : (
              <div className="flex min-h-10 items-center justify-between gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Card({ title, level, note, href, lines }: { title: string; level: SignalLevel; note: string; href: string; lines: StatusLine[] }) {
  return (
    <section className={`${card} flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold text-white">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
          {title}
        </h2>
        <Link href={href} className="text-[12px] font-bold !text-ai-accent no-underline">
          {note} ›
        </Link>
      </div>
      <Lines lines={lines} />
    </section>
  );
}

async function loadDbStats(): Promise<{ bytes: number; top: Array<{ name: string; bytes: number }> } | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("admin_db_stats");
  if (error || !data || typeof data !== "object") return null;
  const d = data as { db_bytes?: unknown; top?: unknown };
  const bytes = Number(d.db_bytes);
  if (!Number.isFinite(bytes)) return null;
  const top = Array.isArray(d.top) ? (d.top as Array<{ name?: unknown; bytes?: unknown }>).map((t) => ({ name: String(t.name ?? ""), bytes: Number(t.bytes ?? 0) })) : [];
  return { bytes, top };
}

export async function AdminStatusBoard({
  openReports,
  pendingListings,
  pendingExperts,
}: {
  /** 못 읽었으면 null(0 이 아니다) */
  openReports: number | null;
  pendingListings: number | null;
  pendingExperts: number | null;
}) {
  const [freshR, alertsR, kvR, dbR] = await Promise.allSettled([
    loadDataFreshness(),
    loadCriticalAlerts24h(),
    kvAvailable() ? kvPingDetail() : Promise.resolve(null),
    loadDbStats(),
  ]);
  if (freshR.status === "rejected") logger.warn("[admin] 상태판 — 신선도 조회 실패", freshR.reason);

  /* 데이터 수집 */
  const fresh = freshR.status === "fulfilled" ? summarizeFreshness(freshR.value, 5) : null;
  const dataLines: StatusLine[] = fresh ? fresh.lines : [{ label: "데이터 신선도", level: "warn", detail: "불러오기 실패" }];
  const dataLevel: SignalLevel = fresh ? fresh.level : "warn";
  const dataNote = fresh ? `정상 ${fresh.counts.ok} · 주의 ${fresh.counts.warn} · 장애 ${fresh.counts.bad}` : "신선도 열기";

  /* 처리 대기 */
  const queue = [
    queueLine("신고", openReports, "/admin/moderation"),
    queueLine("매물 검수", pendingListings, "/admin/listings"),
    queueLine("전문가 심사", pendingExperts, "/admin/quality"),
  ];

  /* 사이트 */
  const site: StatusLine[] = [];
  if (alertsR.status === "fulfilled") {
    const names = criticalAlertNames(alertsR.value);
    site.push(
      alertsR.value.length > 0
        ? { label: "심각 경보", level: "bad", detail: `${alertsR.value.length}건 · ${names.slice(0, 2).join(" · ")}`, href: "/admin/ops" }
        : { label: "심각 경보", level: "ok", detail: "진행 중 없음", href: "/admin/ops" },
    );
  } else site.push({ label: "심각 경보", level: "warn", detail: "불러오기 실패", href: "/admin/ops" });
  if (kvR.status === "fulfilled") {
    const kv = kvR.value;
    site.push(
      kv === null
        ? { label: "공용 카운터(KV)", level: "ok", detail: "쓰지 않음 · 서버별 카운터" }
        : kv.ok
          ? { label: "공용 카운터(KV)", level: "ok", detail: "연결됨" }
          : { label: "공용 카운터(KV)", level: "warn", detail: `연결 끊김(${kv.reason ?? "원인 모름"}) · 서버별 카운터로 동작` },
    );
  } else site.push({ label: "공용 카운터(KV)", level: "warn", detail: "확인 실패" });
  /* [1145] DB 용량 — 함수(sql 214)가 아직 없으면 줄을 그리지 않는다 */
  if (dbR.status === "fulfilled" && dbR.value) site.push(dbSizeLine(dbR.value.bytes, dbR.value.top));
  site.push({ label: "데이터베이스", level: freshR.status === "fulfilled" ? "ok" : "bad", detail: freshR.status === "fulfilled" ? "연결됨" : "조회 실패" });

  const queueLevel = worstLevel(queue.map((l) => l.level));
  const siteLevel = worstLevel(site.map((l) => l.level));
  const allLevels = [...(fresh ? Object.entries(fresh.counts).flatMap(([k, n]) => Array<SignalLevel>(n).fill(k as SignalLevel)) : [dataLevel]), ...queue.map((l) => l.level), ...site.map((l) => l.level)];

  return (
    <section aria-labelledby="admin-status-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-status-h" className="m-0 text-[15px] font-bold text-white">
          서비스 상태
        </h2>
        <span className="text-[12px] text-[#9aa6b8]">{headline(allLevels)}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="데이터 수집" level={dataLevel} note={dataNote} href="/admin/freshness" lines={dataLines} />
        <Card title="처리 대기" level={queueLevel} note="신고 열기" href="/admin/moderation" lines={queue} />
        <Card title="사이트" level={siteLevel} note="운영 콘솔" href="/admin/ops" lines={site} />
      </div>
    </section>
  );
}

export function AdminStatusBoardFallback() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${card} h-[236px] animate-pulse`} />
      ))}
    </div>
  );
}
