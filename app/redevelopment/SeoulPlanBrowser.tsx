"use client";

import { useEffect, useMemo, useState } from "react";
import {
  UPIS_SERVICES,
  UPIS_SERVICE_META,
  upisAreaLabel,
  upisDateLabel,
  upisKind,
  type UpisGuSummary,
  type UpisRecord,
  type UpisService,
} from "@/lib/seoul/upis-display";

/* [1029] 서울시 도시계획 결정 조서 — 구·종류 칩으로 거르고 표로 본다. 첫 목록은 서버가 넘긴다(전체 최근 순).
   칩을 바꾸면 /api/seoul/upis(CDN 하루 캐시)에서 읽는다. 조회 실패는 실패라고 적는다(0건과 다른 사실).
   /region/[id] 에서 "?gu=강남구#seoul-plan" 으로 들어오면 그 구를 먼저 고른다(정적 화면이라 주소는 클라이언트가 읽는다). */

type Props = {
  initialItems: UpisRecord[];
  summary: UpisGuSummary[];
};

type State = { items: UpisRecord[]; status: "ok" | "loading" | "error" };

const GU_RE = /^[가-힣]{1,4}구$/;

export function SeoulPlanBrowser({ initialItems, summary }: Props) {
  const [gu, setGu] = useState<string | null>(null);
  const [service, setService] = useState<UpisService | null>(null);
  const [state, setState] = useState<State>({ items: initialItems, status: "ok" });
  const [touched, setTouched] = useState(false);

  /* 주소의 ?gu= — 지역 화면에서 온 경우 */
  useEffect(() => {
    try {
      const g = new URLSearchParams(window.location.search).get("gu");
      if (g && GU_RE.test(g) && summary.some((s) => s.sigungu === g)) {
        setGu(g);
        setTouched(true);
      }
    } catch {
      /* 주소를 못 읽으면 전체 */
    }
  }, [summary]);

  useEffect(() => {
    if (!touched) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));
    const qs = new URLSearchParams();
    if (gu) qs.set("gu", gu);
    if (service) qs.set("service", service);
    qs.set("limit", "60");
    fetch(`/api/seoul/upis?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean; items?: UpisRecord[] }) => {
        if (cancelled) return;
        if (!j.ok || !Array.isArray(j.items)) throw new Error("bad");
        setState({ items: j.items, status: "ok" });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [gu, service, touched]);

  const guChips = useMemo(() => summary.filter((s) => s.sigungu !== "구 미상"), [summary]);
  const chip = (on: boolean) =>
    on ? "chip-active px-3 py-1.5 text-xs" : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2";

  const pick = (next: { gu?: string | null; service?: UpisService | null }) => {
    setTouched(true);
    if (next.gu !== undefined) setGu(next.gu);
    if (next.service !== undefined) setService(next.service);
  };

  const counts = gu ? guChips.find((g) => g.sigungu === gu) : null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* 종류 칩 */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => pick({ service: null })} className={chip(!service)} aria-pressed={!service}>
          전체
        </button>
        {UPIS_SERVICES.map((s) => (
          <button key={s} type="button" onClick={() => pick({ service: s })} className={chip(service === s)} aria-pressed={service === s}>
            {UPIS_SERVICE_META[s].label}
          </button>
        ))}
      </div>
      {/* 구 칩 — 가로 스크롤 */}
      {guChips.length > 0 && (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-1.5">
            <button type="button" onClick={() => pick({ gu: null })} className={chip(!gu)} aria-pressed={!gu}>
              서울 전체
            </button>
            {guChips.map((g) => (
              <button key={g.sigungu} type="button" onClick={() => pick({ gu: g.sigungu })} className={chip(gu === g.sigungu)} aria-pressed={gu === g.sigungu}>
                {g.sigungu} <span className="tabular-nums opacity-70">{g.total.toLocaleString("ko-KR")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {counts && (
        <div className="t-caption text-text-3 tabular-nums">
          {counts.sigungu} · 정비 {counts.rebuild.toLocaleString("ko-KR")} · 도시개발 {counts.urbanDev.toLocaleString("ko-KR")} · 지구단위 {counts.distUnitPlan.toLocaleString("ko-KR")}
        </div>
      )}

      {state.status === "error" ? (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-center t-sub text-ink">조서 불러오기 실패 · 잠시 후 다시</div>
      ) : state.items.length === 0 ? (
        <div className="rounded-lg bg-bg px-3 py-4 text-center t-sub text-text-3">{state.status === "loading" ? "불러오는 중…" : "조서 없음"}</div>
      ) : (
        <div className={`-mx-1 overflow-x-auto px-1 ${state.status === "loading" ? "opacity-60" : ""}`} aria-busy={state.status === "loading"}>
          <table className="w-full min-w-[560px] border-collapse t-sub">
            <thead>
              <tr className="text-left t-caption text-text-3">
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">결정일</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">구분</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">구역</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 font-semibold">위치</th>
                <th scope="col" className="border-b border-line py-1.5 pr-2 text-right font-semibold">면적</th>
                <th scope="col" className="border-b border-line py-1.5 font-semibold">조서</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((r) => (
                <tr key={r.rptMngCd} className="border-b border-divider last:border-0 align-top">
                  <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-text-2">{upisDateLabel(r.codeDate)}</td>
                  <td className="py-2 pr-2 text-text-2">
                    <span className="inline-flex items-center rounded-sm bg-bg px-1.5 py-px t-caption font-bold text-text-2">{UPIS_SERVICE_META[r.service].short}</span>{" "}
                    {upisKind(r)}
                  </td>
                  <td className="py-2 pr-2 font-bold text-ink">{r.rgnNm ?? "—"}</td>
                  <td className="py-2 pr-2 text-text-2">{r.pstnNm ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-text-1">{upisAreaLabel(r)}</td>
                  <td className="whitespace-nowrap py-2 text-text-2">{r.rptType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
