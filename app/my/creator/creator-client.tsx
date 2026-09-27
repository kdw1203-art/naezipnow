"use client";
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 5곳을 font-bold(700)로 바꿨다. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorSalesSummary } from "@/lib/creator/sales";
import { feePct, REPORT_SELLER_FEE_RATE } from "@/lib/billing/marketplace-fees";

/* 내 콘텐츠 성과 + 유료 리포트 판매 — 탭 전환
   공개 노트·저장·판매 실적은 서버(page.tsx)에서 실데이터 주입 — 미집계 지표는 "—".
   사실 우선: 레벨·유입 기여·채널 어트리뷰션·탑 임장러 현황 등 집계 근거 없는 수치는 제거. */

const TABS = ["콘텐츠 성과", "유료 리포트"] as const;
type Tab = (typeof TABS)[number];

export type CreatorStats = {
  nickname: string | null;
  /** 내 공개 노트 수 (실데이터 · 조회 불가 시 "—") */
  publicNoteCount: string;
  /** 내 공개 노트가 받은 총 저장 수 (실데이터 · 조회 불가 시 "—") */
  totalSaves: string;
};

export type CreatorClientProps = CreatorStats & {
  /** 유료 리포트 판매 실적 + 보상 포인트 집계 (실데이터) */
  sales: CreatorSalesSummary;
  /** 유료 리포트로 승격 가능한 내 공개 노트 (제목 프리필용) */
  noteOptions: { id: string; title: string }[];
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

/* [v4 · 규칙 5] 숫자 칸 격자 → 1px 선 행(왼쪽 항목 / 오른쪽 숫자). 집계가 없는 칸("SNS 공유 —"·"검색 노출 —")은
   v4 규칙(숫자는 실데이터에서만, 없으면 줄을 뺀다)대로 행을 뺐다 */
const STAT_ROW = "flex min-h-12 items-center justify-between gap-3 py-2.5";

function PerformanceTab({ stats }: { stats: CreatorStats }) {
  const rows = [
    { label: "공개 노트", value: stats.publicNoteCount },
    { label: "저장", value: stats.totalSaves },
  ];
  return (
    <section aria-labelledby="creator-perf-h" className="flex flex-col">
      <h2 id="creator-perf-h" className="rise-in t-section text-ink">
        내 콘텐츠 성과 <span className="t-sub font-medium text-text-3">전체 기간</span>
      </h2>
      {/* 공개 노트·저장은 실데이터 — 못 읽으면 "—"(허위 수치 금지) */}
      <ul data-tone="blue" className="rise-in-2 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className={STAT_ROW}>
            <span className="t-body font-bold text-ink">{r.label}</span>
            <span className="shrink-0 t-body t-num text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
      {/* 협찬 라벨 원칙 — [v4 · 규칙 9] 연파랑 띠 → 끝 캡션 */}
      <p className="rise-in-3 t-caption font-bold text-text-2">
        협찬·제공 받은 임장은 &quot;광고&quot; 라벨 필수 · 미표시 확인 시 노출 제한
      </p>
    </section>
  );
}

/* ── 유료 리포트 판매 등록 폼 ─────────────────────────────── */
function SellReportForm({
  noteOptions,
}: {
  noteOptions: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("300");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/creator/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: Number(price),
          // 전달물 — 구매자가 열람할 내 노트 (필수)
          sourceNoteId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "등록에 실패했습니다." });
      } else {
        setMsg({ ok: true, text: "유료 리포트로 등록됐어요. 구매자는 연결한 노트를 열람합니다." });
        setTitle("");
        setDescription("");
        setPrice("300");
        setSourceNoteId("");
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "네트워크 오류가 발생했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise-in-4 card flex flex-col gap-3 rounded-lg p-4">
      <div>
        <h2 className="t-section text-ink">유료 리포트 판매 등록</h2>
        <div className="mt-[2px] t-sub text-text-3">내 노트·분석을 유료 리포트로 · 포인트 판매 · 가격 100P~100,000P</div>
      </div>

      {noteOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="t-sub font-bold text-text-3">
            판매할 내 노트 (필수) — 구매자가 이 노트를 열람해요
          </span>
          <select
            className="input w-full"
            value={sourceNoteId}
            onChange={(e) => {
              setSourceNoteId(e.target.value);
              const n = noteOptions.find((o) => o.id === e.target.value);
              if (n && !title.trim()) setTitle(n.title);
            }}
          >
            <option value="">노트를 선택해 주세요</option>
            {noteOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">제목</span>
        <input
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 공작아파트 302동 임장 심화 리포트"
          maxLength={80}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">설명</span>
        <textarea
          className="input min-h-[80px] w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="리포트에 담긴 내용을 요약해 주세요 (구매 전 미리보기로 노출)"
          maxLength={400}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">가격 (포인트)</span>
        <input
          type="number"
          className="input w-[160px]"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min={100}
          max={100000}
          step={100}
        />
      </label>

      {msg && (
        <div
          className={`rounded-lg px-3 py-[9px] text-[12px] font-bold ${
            msg.ok
              ? "bg-primary-soft text-primary"
              : "bg-danger/10 text-danger"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button type="submit" disabled={busy} className="btn-primary btn-md self-start disabled:opacity-60">
        {busy ? "등록 중…" : "유료 리포트로 등록"}
      </button>
    </form>
  );
}

/* ── 유료 리포트 탭 (판매 실적 + 정산 안내 + 목록 + 등록) ────── */
function MonetizationTab({
  sales,
  noteOptions,
}: {
  sales: CreatorSalesSummary;
  noteOptions: { id: string; title: string }[];
}) {
  const dash = sales.available ? null : "—";
  const tiles = [
    { label: "등록 리포트", value: dash ?? fmt(sales.totalReports) },
    { label: "총 판매", value: dash ?? `${fmt(sales.totalSales)}건` },
    { label: "누적 판매(P)", value: dash ?? fmt(sales.grossPoints) },
    {
      label: "적립 포인트(현금 전환 불가)",
      value: dash ?? fmt(sales.netPoints),
    },
  ];

  /* [v4 · 규칙 4·5·6] 숫자 칸 격자 → 행 · 네이비 안내 면 → 캡션(사실 그대로: 현금 전환·출금 불가, 서비스 내 혜택 전용) ·
     "판매중/무료" 알약 → 글자 · 회색 상자 목록 → 1px 선 행 */
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="creator-sales-h" className="rise-in flex flex-col">
        <h2 id="creator-sales-h" className="t-section text-ink">
          판매 실적
        </h2>
        <ul data-tone="mint" className="divide-y divide-line">
          {tiles.map((t) => (
            <li key={t.label} className={STAT_ROW}>
              <span className="t-body font-bold text-ink">{t.label}</span>
              <span className="shrink-0 t-body t-num text-ink">{t.value}</span>
            </li>
          ))}
        </ul>
        {/* 포인트 안내 — 2026-08-23 토스 회신 반영: 현금 전환·원화 환산 표기를 전부 제거했다. 판매 보상 포인트는
            무상 리워드와 동일한 규칙(현금 전환·출금 불가, 사이트 내부 혜택 사용)을 따른다.
            [970 · C-15] 요율은 marketplace-fees 단일 출처 — 정산 계산(sales.ts)과 같은 값 */}
        <p className="mt-1 t-caption text-text-3">
          판매 보상: 리포트 열람 시 플랫폼 몫 {feePct(REPORT_SELLER_FEE_RATE)}를 뺀 포인트 적립
          {sales.available && <> · 현재 누적 <b className="text-text-1">{fmt(sales.netPoints)}P</b></>} · 현금
          전환·출금 불가 · 포인트 상점의 서비스 내 혜택(매물 상단 노출·꾸미기 등)에만 사용
        </p>
      </section>

      {/* 등록 리포트 목록 */}
      <section aria-labelledby="creator-reports-h" className="rise-in-3 flex flex-col">
        <h2 id="creator-reports-h" className="t-section text-ink">
          내 유료 리포트
        </h2>
        {!sales.available ? (
          <p className="border-y border-line py-3 t-sub text-text-3">판매 실적 조회 실패 · 잠시 후 다시</p>
        ) : sales.reports.length === 0 ? (
          <p className="border-y border-line py-3 t-sub text-text-3">등록한 유료 리포트 없음 · 아래 폼에서 노트 1편 골라 등록</p>
        ) : (
          <ul data-tone="hanji" className="divide-y divide-line">
            {sales.reports.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate t-body font-bold text-text-1">{r.title}</span>
                  <span className="mt-0.5 block t-sub text-text-3">
                    {fmt(r.price)}P · 판매 {fmt(r.salesCount)}건 · 누적 {fmt(r.grossPoints)}P
                  </span>
                </span>
                <span className={`shrink-0 t-sub font-bold ${r.isPremium ? "text-primary" : "text-text-3"}`}>
                  {r.isPremium ? "판매중" : "무료"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 판매 등록 폼 */}
      <SellReportForm noteOptions={noteOptions} />
    </div>
  );
}

export function CreatorClient(props: CreatorClientProps) {
  const [tab, setTab] = useState<Tab>("콘텐츠 성과");

  return (
    <div className="mx-auto w-full max-w-[760px]">
      {/* [v4 · 부품] 칩 두 개 → 밑줄 탭 */}
      <div className="mb-6 flex gap-5 border-b border-line" role="group" aria-label="크리에이터 메뉴">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 border-b-2 pb-2 pt-2.5 t-body font-bold transition-colors ${
              tab === t ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "콘텐츠 성과" ? (
        <PerformanceTab stats={props} />
      ) : (
        <MonetizationTab
          sales={props.sales}
          noteOptions={props.noteOptions}
        />
      )}
    </div>
  );
}
