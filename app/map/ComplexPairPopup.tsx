"use client";

/* [1211] 단지 vs 단지 비교 팝업 — 소유자 "단지 vs 단지는 지도에서 비교 표시를 하면 팝업으로 보이게 하고 해당 페이지는 삭제해줘".
   예전 /complex/compare/[slug] 화면(따로 한 장)을 지도 위 팝업으로 옮겼다. 숫자는 그 화면과 같은 계산(lib/market/complex-pair-stats ·
   /api/map/complex-pair) — 12개월 매매 건수 · 평균가 · 평당가 · 주력 면적 · 준공 · 최근 거래 · 면적대별 평균 · 월별 건수 막대.
   지도는 두 단지 사이로 옮겨 간다(onLocate). 닫으면 주소의 ?pair= 를 지운다(뒤로 가기에 남지 않게 replaceState). */
import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { formatKrwShort } from "@/lib/market/format";

type Side = {
  name: string;
  href: string;
  count: number;
  covered: boolean;
  avgAmountKrw: number | null;
  avgPerPyeongKrw: number | null;
  medianAreaM2: number | null;
  buildYear: number | null;
  latest: { ym: string; day: number | null; amountKrw: number; areaM2: number | null; floor: number | null } | null;
  bands: { label: string; count: number; avgKrw: number }[];
  monthly: number[];
  coord: { lat: number; lng: number } | null;
};
type Pair = { slug: string; regionLabel: string; dong: string; months: string[]; a: Side; b: Side };

const ym = (v: string) => (v.length === 6 ? `${v.slice(2, 4)}.${v.slice(4)}` : v);
const krw = (v: number | null) => (v && v > 0 ? formatKrwShort(v) : "—");

export function ComplexPairPopup({
  slug,
  onClose,
  onLocate,
}: {
  slug: string;
  onClose: () => void;
  onLocate?: (c: { lat: number; lng: number }) => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; pair: Pair } | { status: "gone" } | { status: "error" }>({
    status: "loading",
  });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/map/complex-pair?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) return setState({ status: "gone" });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (!alive) return;
        if (!j?.ok || !j.pair) return setState({ status: "error" });
        setState({ status: "ok", pair: j.pair as Pair });
      })
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [slug]);

  /* 두 단지 사이로 지도를 옮긴다(좌표가 둘 다 있으면 가운데 · 하나면 그쪽) */
  useEffect(() => {
    if (state.status !== "ok" || !onLocate) return;
    const { a, b } = state.pair;
    if (a.coord && b.coord) onLocate({ lat: (a.coord.lat + b.coord.lat) / 2, lng: (a.coord.lng + b.coord.lng) / 2 });
    else if (a.coord ?? b.coord) onLocate((a.coord ?? b.coord)!);
    // 같은 조합에 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === "ok" ? state.pair.slug : null]);

  /* Esc 로 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 md:items-center" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-popup-h"
        className="card max-h-[86vh] w-full max-w-[640px] overflow-y-auto rounded-t-2xl p-[var(--pad-card)] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pair-popup-h" className="t-section text-ink">
              {state.status === "ok" ? (
                <>
                  {state.pair.a.name} <span className="t-sub text-text-3">vs</span> {state.pair.b.name}
                </>
              ) : (
                "단지 비교"
              )}
            </h2>
            {state.status === "ok" && (
              <p className="m-0 mt-0.5 t-caption text-text-3">
                {state.pair.regionLabel} {state.pair.dong} · 최근 12개월 매매 · 국토교통부 실거래(해제 제외)
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="비교 닫기" className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full t-body text-text-3">
            ✕
          </button>
        </div>

        {state.status === "loading" && <div className="mt-3 h-[240px] animate-pulse rounded-xl bg-bg" aria-hidden="true" />}
        {state.status === "gone" && <p className="mt-3 t-sub text-text-2">이 조합은 지금 비교할 수 없어요(같은 동 · 양쪽 12개월 20건 이상일 때만).</p>}
        {state.status === "error" && <p className="mt-3 t-sub text-text-2">비교 불러오기 실패 · 잠시 후 다시</p>}
        {state.status === "ok" && <PairBody pair={state.pair} />}
      </section>
    </div>
  );
}

function PairBody({ pair }: { pair: Pair }) {
  const { a, b, months } = pair;
  const rows: { label: string; a: string; b: string }[] = [
    { label: "12개월 매매", a: `${a.count}건${a.covered ? "" : "+"}`, b: `${b.count}건${b.covered ? "" : "+"}` },
    { label: "평균 매매가", a: krw(a.avgAmountKrw), b: krw(b.avgAmountKrw) },
    { label: "평당가 평균", a: krw(a.avgPerPyeongKrw), b: krw(b.avgPerPyeongKrw) },
    { label: "주력 면적", a: a.medianAreaM2 ? `${Math.round(a.medianAreaM2)}㎡` : "—", b: b.medianAreaM2 ? `${Math.round(b.medianAreaM2)}㎡` : "—" },
    { label: "준공", a: a.buildYear ? `${a.buildYear}년` : "—", b: b.buildYear ? `${b.buildYear}년` : "—" },
    {
      label: "최근 거래",
      a: a.latest ? `${krw(a.latest.amountKrw)} · ${ym(a.latest.ym)}` : "—",
      b: b.latest ? `${krw(b.latest.amountKrw)} · ${ym(b.latest.ym)}` : "—",
    },
  ];
  const bandLabels = [...new Set([...a.bands.map((x) => x.label), ...b.bands.map((x) => x.label)])];
  const maxM = Math.max(1, ...a.monthly, ...b.monthly);
  return (
    <div className="mt-3 flex flex-col gap-3">
      <table className="w-full text-left t-sub">
        <thead>
          <tr className="border-b border-line t-caption text-text-3">
            <th className="py-1.5 font-medium" />
            <th className="py-1.5 text-right font-bold text-primary">
              <Link href={a.href} prefetch={false} className="tap-line text-primary no-underline">
                {a.name} ›
              </Link>
            </th>
            <th className="py-1.5 text-right font-bold text-ink">
              <Link href={b.href} prefetch={false} className="tap-line text-ink no-underline">
                {b.name} ›
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-divider last:border-0">
              <td className="py-2 text-text-3">{r.label}</td>
              <td className="py-2 text-right t-num font-bold text-ink">{r.a}</td>
              <td className="py-2 text-right t-num font-bold text-ink">{r.b}</td>
            </tr>
          ))}
          {bandLabels.map((label) => {
            const x = a.bands.find((v) => v.label === label);
            const y = b.bands.find((v) => v.label === label);
            return (
              <tr key={label} className="border-b border-divider last:border-0">
                <td className="py-2 text-text-3">{label} 평균</td>
                <td className="py-2 text-right t-num text-text-2">{x ? `${krw(x.avgKrw)} · ${x.count}건` : "—"}</td>
                <td className="py-2 text-right t-num text-text-2">{y ? `${krw(y.avgKrw)} · ${y.count}건` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 월별 매매 건수 — 두 단지 막대를 나란히(왼쪽 파랑 = 첫 단지) */}
      <div>
        <p className="m-0 t-caption font-bold text-text-2">월별 매매 건수</p>
        <div className="mt-1.5 flex h-[72px] items-end gap-[3px]" aria-hidden="true">
          {months.map((m, i) => (
            <div key={m} className="flex h-full flex-1 items-end gap-px">
              <span className="block w-1/2 rounded-t-sm bg-primary" style={{ height: `${(a.monthly[i] / maxM) * 100}%` }} />
              <span className="block w-1/2 rounded-t-sm bg-text-3/50" style={{ height: `${(b.monthly[i] / maxM) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between t-caption text-text-3">
          <span>{ym(months[0] ?? "")}</span>
          <span>{ym(months[months.length - 1] ?? "")}</span>
        </div>
      </div>
      <p className="m-0 t-caption text-text-3">
        면적 · 타입 구분 없는 단순 평균 — 같은 단지라도 평형 구성에 따라 체감과 다를 수 있어요. 좋고 나쁨의 판정이 아닙니다.
      </p>
    </div>
  );
}

export default ComplexPairPopup;
