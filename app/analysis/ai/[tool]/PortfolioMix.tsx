"use client";

import { PRICE_BANDS } from "@/lib/market/bands";
import { formatKrwWon } from "@/lib/format/krw";
import type { PortfolioItem } from "./workbench-types";

/* ============================================================
   [1008 · 리뷰 A-3] 내 자산 구성 진단 — 관심 단지 목록의 **쏠림**(지역·가격대)을 실제로 센다.
   예전엔 "어디에 쏠렸는지 점검"이라면서 첫 단지 하나의 결과만 보였다. 여기 숫자는 불러온 목록에서만 나온다:
    · 지역 = 단지 id(base64url 지역+이름)를 풀어 센다
    · 가격대 = 관심 단지 가격 알림이 세운 기준가(면적대 최근 6건 평균 — AI 화면의 평형 기준과 다를 수 있다)
   next/dynamic 청크 — 이 도구에서 목록을 불러왔을 때만 내려받는다.
   ============================================================ */

function regionOf(complexId: string): string | null {
  try {
    const b64 = complexId.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const sep = text.indexOf("\u0001");
    return sep > 0 ? text.slice(0, sep).trim() || null : null;
  } catch {
    return null;
  }
}

function tally<T extends string>(keys: T[]): { key: T; n: number }[] {
  const m = new Map<T, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

function Bars({ rows, total }: { rows: { key: string; n: number }[]; total: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 t-sub">
          <span className="truncate font-bold text-text-1">{r.key}</span>
          <span className="h-2 rounded-full bg-bg" aria-hidden="true">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.round((r.n / total) * 100)}%` }} />
          </span>
          <span className="font-extrabold text-ink">
            {r.n}곳 <span className="font-medium text-text-3">({Math.round((r.n / total) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioMix({
  items,
  pickedId,
  onPick,
}: {
  items: readonly PortfolioItem[];
  pickedId: string | null;
  onPick: (it: PortfolioItem) => void;
}) {
  const total = items.length;
  const regions = tally(items.map((i) => regionOf(i.complexId) ?? "지역 모름"));
  const priced = items.filter((i) => i.lastPriceKrw != null && i.lastPriceKrw > 0);
  const bands = tally(
    priced.map((i) => PRICE_BANDS.find((b) => (i.lastPriceKrw as number) >= b.minKrw && (i.lastPriceKrw as number) < b.maxKrw)?.label ?? "기타"),
  );
  const topRegion = regions[0];
  return (
    <section className="card tool-rail flex flex-col gap-3 rounded-2xl p-4" aria-label="관심 단지 구성">
      <div className="flex flex-col gap-1">
        <h2 className="t-section font-extrabold text-ink">관심 단지 {total}곳의 구성</h2>
        <p className="t-body text-text-1">
          {topRegion && topRegion.n >= 2 && topRegion.n / total >= 0.5
            ? `${topRegion.key}에 ${topRegion.n}곳(${Math.round((topRegion.n / total) * 100)}%)이 몰려 있어요 — 같은 지역 흐름에 함께 흔들려요.`
            : `한 지역에 절반 넘게 몰리지 않았어요 — 가장 많은 곳은 ${topRegion?.key ?? "—"} ${topRegion?.n ?? 0}곳이에요.`}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="t-sub font-extrabold text-text-1">지역</h3>
        <Bars rows={regions.slice(0, 5)} total={total} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="t-sub font-extrabold text-text-1">가격대</h3>
        {priced.length > 0 ? (
          <Bars rows={bands} total={priced.length} />
        ) : (
          <p className="t-sub text-text-2">아직 가격 기준가가 잡힌 관심 단지가 없어요.</p>
        )}
        <p className="t-caption text-text-3">
          가격은 관심 단지 가격 알림의 기준가(대표 면적대 최근 6건 평균)예요
          {priced.length < total ? ` · ${total - priced.length}곳은 아직 기준가 없음` : ""}.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 border-t border-line pt-3" aria-label="관심 단지">
        {items.map((it) => (
          <li key={it.complexId} className="flex items-center justify-between gap-2 rounded-[12px] bg-bg px-3 py-2">
            <span className="flex min-w-0 flex-col">
              <b className="break-words t-sub font-extrabold text-ink">{it.complexName}</b>
              <span className="t-caption text-text-3">
                {regionOf(it.complexId) ?? "지역 모름"}
                {it.lastPriceKrw ? ` · 기준가 ${formatKrwWon(it.lastPriceKrw, { style: "short" })}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onPick(it)}
              aria-pressed={pickedId === it.complexId}
              className="btn-secondary btn-md shrink-0 px-3 t-sub"
            >
              {pickedId === it.complexId ? "보는 중" : "이 단지 보기"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
