"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchReportEngine } from "@/lib/seo/search-report-rules";

/* [1061] 검색엔진 리포트 손 기록 폼 — 네이버 서치어드바이저는 API 가 없어 "콘텐츠 노출/클릭"·"사이트 진단"
 * 화면의 숫자를 옮겨 적는다. 모르는 칸은 비워 둔다(0 으로 적지 않는다). 저장 뒤 서버 화면을 다시 읽는다. */

type Props = { engine: SearchReportEngine; defaultDate: string; engineLabel: string };

export function SearchReportForm({ engine, defaultDate, engineLabel }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [periodDays, setPeriodDays] = useState("30");
  const [clicks, setClicks] = useState("");
  const [impressions, setImpressions] = useState("");
  const [indexedPages, setIndexedPages] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/search-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine, date, periodDays, clicks, impressions, indexedPages, note }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ tone: "bad", text: j.error ?? "기록 저장 실패 · 잠시 후 다시" });
        return;
      }
      setMsg({ tone: "ok", text: `${date} 기록 저장됨` });
      setClicks("");
      setImpressions("");
      setIndexedPages("");
      setNote("");
      router.refresh();
    } catch {
      setMsg({ tone: "bad", text: "기록 저장 실패 · 잠시 후 다시" });
    } finally {
      setBusy(false);
    }
  };

  const field = "input min-h-[40px] w-full rounded-lg px-3 text-[13px] md:min-h-9";
  const label = "flex flex-col gap-1 text-[12px] font-bold text-text-2";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={`${engineLabel} 기록 적기`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className={label}>
          기준일
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} required />
        </label>
        <label className={label}>
          기간(일)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={periodDays}
            onChange={(e) => setPeriodDays(e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          클릭
          <input type="text" inputMode="numeric" value={clicks} onChange={(e) => setClicks(e.target.value)} className={field} placeholder="비우면 기록 안 함" />
        </label>
        <label className={label}>
          노출
          <input type="text" inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} className={field} placeholder="비우면 기록 안 함" />
        </label>
        <label className={label}>
          색인 페이지
          <input type="text" inputMode="numeric" value={indexedPages} onChange={(e) => setIndexedPages(e.target.value)} className={field} placeholder="사이트 진단의 색인된 페이지" />
        </label>
      </div>
      <label className={label}>
        메모(200자)
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={field} maxLength={200} placeholder="예: 수집 요청 20건 넣음 · 사이트맵 재제출" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary btn-md min-h-[40px] disabled:opacity-60 md:min-h-9">
          {busy ? "저장 중" : "기록 저장"}
        </button>
        {msg && (
          <span role="status" className={`text-[12px] font-bold ${msg.tone === "ok" ? "text-success" : "text-danger"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
