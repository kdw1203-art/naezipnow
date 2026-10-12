"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreatorSalesSummary } from "@/lib/creator/sales";

/* 내 콘텐츠 성과 + 유료 리포트 판매 — 탭 전환
   공개·비공개 노트·판매 실적은 서버(page.tsx)에서 실데이터 주입 — 미집계 지표는 "—".
   사실 우선: 레벨·유입 기여·채널 어트리뷰션·탑 임장러 현황 등 집계 근거 없는 수치는 제거.

   [1058 · C6] 틀린 사실들의 수정
   · "저장" 타일: bookmarks 에 노트는 저장될 수 없어(CHECK target_type) 늘 0 이었다 → [1059] 프로필 설정 jsonb 저장을 센다
   · "리포트가 열람되면 플랫폼 몫을 뺀 포인트가 적립돼요" · "적립 포인트" 타일: 구매 라우트(/api/creator/reports/[id]/buy)는
     구매자 포인트 차감 → report_purchases 기록 → 크리에이터에게 인앱 알림, 끝. 크리에이터 포인트 적립·정산은 없다.
     → "구매 알림만 · 정산 없음". 누적 판매(P)는 구매자가 낸 포인트 합(사실)이라 남긴다.
   · "내 노트·분석을 유료 리포트로 승격": API 는 비공개 노트만 받는다(공개 노트 400) → 그대로 적는다.
   · 자료실(/town/library)은 보관 화면(노출 없음) — 구매는 리포트 상세 직접 링크(/town/library/{id})뿐. 목록에 그 링크를 둔다. */

const TABS = ["콘텐츠 성과", "유료 리포트"] as const;
type Tab = (typeof TABS)[number];

export type CreatorStats = {
  nickname: string | null;
  /** 내 공개 노트 수 (실데이터 · 조회 불가 시 "—") */
  publicNoteCount: string;
  /** 내 비공개 노트 수 = 판매 등록 가능 노트 (실데이터 · 조회 불가 시 "—") */
  privateNoteCount: string;
  /** [1059] 내 공개 노트를 저장한 사람 수(최근 공개 노트 20편 합산 · 못 세면 "—") */
  saveCount: string;
};

export type CreatorClientProps = CreatorStats & {
  /** 유료 리포트 판매 실적 집계 (실데이터) */
  sales: CreatorSalesSummary;
  /** 유료 리포트로 등록 가능한 내 **비공개** 노트 (제목 프리필용) */
  noteOptions: { id: string; title: string }[];
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

function PerformanceTab({ stats }: { stats: CreatorStats }) {
  const tiles = [
    { label: "공개 노트", value: stats.publicNoteCount, note: null },
    { label: "비공개 노트 · 판매 가능", value: stats.privateNoteCount, note: null },
    { label: "저장", value: stats.saveCount, note: stats.saveCount === "—" ? "저장 집계 실패" : "공개 노트 20편 합산" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {/* 상단 글래스 바 — 전체 기간 */}
      <div className="glass rise-in flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
        <span className="t-section text-ink">
          내 콘텐츠 성과
        </span>
        <span className="t-sub text-text-3">전체 기간</span>
      </div>

      {/* 지표 — 노트 수·저장 수 모두 실데이터([1059] 저장은 프로필 설정 jsonb 포함 질의 · 못 세면 "—") */}
      <div className="rise-in-2 grid grid-cols-2 gap-2 md:grid-cols-3">
        {tiles.map((s) => (
          <div key={s.label} className="card px-3 py-[10px]">
            <div className="t-caption text-text-3">{s.label}</div>
            <div className="mt-[2px] t-section tabular-nums text-ink">
              {s.value}
            </div>
            {s.note && <div className="t-caption text-text-3">{s.note}</div>}
          </div>
        ))}
      </div>

      {/* 협찬 라벨 원칙 */}
      <div className="rise-in-3 rounded-lg bg-primary-soft px-4 py-[10px] t-sub font-bold text-primary">
        협찬·제공 받은 임장은 &quot;광고&quot; 라벨 필수 · 미표시 확인 시 노출 제한
      </div>
    </div>
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
          // 전달물 — 구매자가 열람할 내 비공개 노트 (필수)
          sourceNoteId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "리포트 등록 실패 · 잠시 후 다시" });
      } else {
        setMsg({ ok: true, text: "유료 리포트 등록 · 구매자는 연결한 노트를 열람" });
        setTitle("");
        setDescription("");
        setPrice("300");
        setSourceNoteId("");
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "리포트 등록 실패 · 잠시 후 다시" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise-in-4 card flex flex-col gap-3 px-4 py-4">
      <div>
        <div className="t-body font-bold text-ink">유료 리포트 판매 등록</div>
        <div className="mt-[2px] t-sub text-text-3">
          비공개 노트 한 건을 유료 리포트로 등록 · 구매자는 그 노트를 열람 · 가격 100P~100,000P · 공개 노트는 판매 대상 아님
        </div>
      </div>

      {noteOptions.length > 0 ? (
        <label className="flex flex-col gap-1">
          <span className="t-sub font-bold text-text-3">
            판매할 내 비공개 노트 (필수) · 구매자가 이 노트를 열람
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
            <option value="">노트 선택</option>
            {noteOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="rounded-lg bg-bg px-3 py-2 t-sub text-text-3">
          판매 가능한 비공개 노트 없음 · 공개 노트는 무료 열람이라 판매 대상 아님
        </p>
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
          placeholder="리포트에 담긴 내용 요약 (구매 전 미리보기로 노출)"
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
          role={msg.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-[9px] t-caption font-bold ${
            msg.ok
              ? "bg-primary-soft text-primary"
              : "bg-danger/10 text-danger"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || noteOptions.length === 0}
        className="btn-primary btn-md self-start disabled:opacity-60"
      >
        {busy ? "등록 중…" : "유료 리포트 등록"}
      </button>
    </form>
  );
}

/* ── 유료 리포트 탭 (판매 실적 + 보상 사실 + 목록 + 등록) ────── */
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
    { label: "누적 판매(P) · 구매자 지불", value: dash ?? fmt(sales.grossPoints) },
    /* [1058 · C6] "적립 포인트" 타일 → 사실: 크리에이터 정산 없음 */
    { label: "크리에이터 정산", value: "없음" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 실적 요약 */}
      <div className="rise-in grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card px-3 py-[10px]">
            <div className="t-caption text-text-3">{t.label}</div>
            <div className="mt-[2px] t-section tabular-nums text-ink">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* 판매 보상 사실 — 2026-08-23 토스 회신 반영: 현금 전환·원화 환산 표기 없음.
          [1058 · C6] 구매 라우트가 하는 일 그대로: 구매자 포인트 차감 · 구매 기록 · 크리에이터에게 인앱 알림. 적립·정산 없음. */}
      <div className="rise-in-2 rounded-lg bg-brand-navy/[0.96] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="t-body font-bold text-white">판매 보상 안내</span>
          <span className="rounded-full bg-[rgba(224,86,58,.18)] chip-pad t-caption font-bold text-brand-red-dark">
            정산 없음
          </span>
        </div>
        <div className="mt-2 t-sub text-on-dark-muted">
          구매 시 구매자 포인트가 차감되고 구매 기록이 남음 · 크리에이터에게는 구매 알림만 · 포인트 적립·정산·현금 전환 없음
          <br />
          구매는 리포트 상세 직접 링크(아래 목록) · 자료실 목록은 보관 상태라 노출 없음
        </div>
      </div>

      {/* 등록 리포트 목록 */}
      <div className="rise-in-3 card px-4 py-4">
        <div className="t-body font-bold text-ink">내 유료 리포트</div>
        {!sales.available ? (
          <div className="mt-3 rounded-lg bg-bg px-4 py-6 text-center t-sub text-text-3">
            판매 실적 불러오기 실패 · 잠시 후 다시
          </div>
        ) : sales.reports.length === 0 ? (
          <div className="mt-3 rounded-lg bg-bg px-4 py-6 text-center t-sub text-text-3">
등록한 유료 리포트 없음
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-[6px]">
            {sales.reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-[10px]"
              >
                <div className="min-w-0">
                  <div className="truncate t-body font-bold text-text-1">
                    {r.title}
                  </div>
                  <div className="mt-[2px] t-sub text-text-3">
                    {fmt(r.price)}P · 판매 {fmt(r.salesCount)}건 · 누적 {fmt(r.grossPoints)}P
                  </div>
                  {/* [1058 · C6] 구매 입구는 이 직접 링크뿐 */}
                  <Link href={`/town/library/${encodeURIComponent(r.id)}`} className="tap-line t-caption font-bold text-primary">
                    구매 링크 ›
                  </Link>
                </div>
                <span
                  className={`shrink-0 rounded-full chip-pad t-caption font-bold ${
                    r.isPremium
                      ? "bg-primary-soft text-primary"
                      : "bg-line text-text-3"
                  }`}
                >
                  {r.isPremium ? "판매중" : "무료"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 판매 등록 폼 */}
      <SellReportForm noteOptions={noteOptions} />
    </div>
  );
}

export function CreatorClient(props: CreatorClientProps) {
  const [tab, setTab] = useState<Tab>("콘텐츠 성과");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-[6px]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-[40px] md:min-h-6 ${tab === t ? "chip-active" : "chip"}`}
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
