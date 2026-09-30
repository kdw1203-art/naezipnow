"use client";
/* [1026b · AI 분석 8종] 경제지표 모니터의 기준금리 알림 패널 — 예전 WorkbenchClient(첫 로드 번들) 안의 EconomyWatchPanel 을 레일 청크로
   옮겼다(ResultRail 이 그린다 · next/dynamic). 채움 파랑 "알림 등록"(ActionButton) → 보조(테두리) 버튼 — 이 화면의 채움 파랑은 레일의
   "이 지역 알림 받기" 하나. 등록 API(/api/me/economy-watch)·검사·문구·토스트는 그대로. id="economy-watch" 는 다른 도구의 링크 목적지. */
/* [AI-29] 기준금리 임계 알림 등록 패널 */

import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";

export function EconomyWatch({ currentRate }: { currentRate: number }) {
  const [threshold, setThreshold] = useState(String(Math.round((currentRate + 0.25) * 100) / 100));
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail" | "login">("idle");
  const [note, setNote] = useState("");
  const { showToast } = useToast();

  const submit = async () => {
    if (state === "busy") return;
    /* [1009 · A · 리뷰] 원인별 문구 — 숫자가 틀렸을 때만 "숫자를 확인", 서버 오류·너무 잦은 요청은 그대로 말한다 */
    const t = Number(threshold);
    if (!Number.isFinite(t) || t <= 0 || t > 20) {
      setState("fail");
      setNote("0보다 크고 20 이하인 %로 넣어 주세요.");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/me/economy-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: "base_rate", threshold: Number(threshold), direction }),
      });
      const json: { ok?: boolean; note?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.status === 401) setState("login");
      else if (res.ok && json.ok) {
        setState("done");
        setNote(json.note ?? "");
        /* 토스트는 한 줄(알림함 버튼과 함께) — 조건은 아래 안내 글(note)에 문장으로 남는다 */
        showToast(`알림 걸었어요 · ${threshold}% ${direction === "above" ? "이상" : "이하"}이면`, {
          label: "알림함",
          href: "/notifications",
        });
      } else {
        setState("fail");
        setNote(
          res.status === 400
            ? (json.error ?? "알림을 걸지 못했어요. 숫자를 확인하고 다시 눌러 주세요.")
            : res.status === 429
              ? "너무 자주 눌렀어요 — 1분쯤 뒤에 다시 눌러 주세요."
              : json.error
                ? `알림을 걸지 못했어요 — ${json.error}`
                : `알림을 걸지 못했어요 — 서버가 답하지 못했어요(${res.status}). 잠시 뒤 다시 눌러 주세요.`,
        );
      }
    } catch {
      setState("fail");
      setNote("알림을 걸지 못했어요 — 인터넷 연결을 확인하고 다시 눌러 주세요.");
    }
  };

  return (
    <section id="economy-watch" className="card flex scroll-mt-20 flex-col gap-2 rounded-2xl p-4 max-md:p-3.5" aria-label="기준금리 알림">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="t-section font-bold text-ink">기준금리 알림</h2>
        <span className="t-caption tabular-nums text-text-3">지금 {currentRate}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "above" | "below")}
          aria-label="알림 조건"
          className="min-h-[40px] rounded-lg border border-line bg-surface px-2.5 t-body font-bold text-ink"
        >
          <option value="above">이상으로 오르면</option>
          <option value="below">이하로 내리면</option>
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          aria-label="기준금리(%)"
          className="min-h-[40px] w-[90px] rounded-lg border border-line bg-surface px-3 t-body font-bold text-ink"
        />
        <span className="t-sub font-bold text-text-2">%</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "busy" || state === "done"}
          aria-busy={state === "busy" || undefined}
          aria-live="polite"
          className="btn-secondary btn-md gap-1.5 px-3 t-sub"
        >
          {state === "busy" ? (
            <span className="njn-ring njn-ring--ink" aria-hidden="true" />
          ) : state === "done" ? (
            <span className="njn-pop-once inline-flex text-primary" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          ) : null}
          {state === "busy" ? "등록하는 중" : state === "done" ? "알림 걸었어요" : state === "fail" ? "다시 등록" : "알림 등록"}
        </button>
      </div>
      {state === "login" && <p className="t-sub font-bold text-warning">로그인하면 알림을 걸 수 있어요.</p>}
      {note && <p className="t-sub text-text-3">{note}</p>}
    </section>
  );
}
