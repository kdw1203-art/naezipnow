"use client";
/* [1110 · AI 분석 2차 통폐합] 지역 시세 분석 — 검색칸(시 · 구 · 동).
   시 · 구는 서버가 넘긴 카탈로그(107곳 · 이름 · 별칭)에서 **즉시**(lib/region/region-sise searchRegionSise), 동은 검색 API(/api/search/suggest
   areas · kind=dong · 동 실거래 화면 주소)에서 굳은 검색어(lib/search/settle)로 한 번. 고르면 그 지역의 종합 화면으로 간다 —
   구 · 시는 /region/[id](개요 · 구간 · 전월세 · 온도 · 동네 · 리포트 탭), 동은 /dong/<지역>/<동>.
   둘 다 0건이면 통합 검색(/search?q=)으로 가는 줄 하나 — "없음" 으로 끝내지 않는다(1008 · S 와 같은 원칙).
   키보드: ↑↓ · Enter · Esc. 번들: 이 파일은 카탈로그를 import 하지 않는다(props 로 받는다). */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { Icon } from "@/app/components/Icon";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { searchRegionSise, type RegionSiseRegion } from "@/lib/region/region-sise";

type DongHit = { key: string; label: string; href: string; complexCount: number; recentTradeCount: number };
type AreaJson = { key: string; kind: string; label: string; href: string | null; complexCount?: number; recentTradeCount?: number };

type Item = { key: string; label: string; sub: string; href: string };

export function RegionSearchBox({
  regions,
  autoFocus = false,
  onMapClick,
  pickIds,
  onPick,
}: {
  regions: RegionSiseRegion[];
  autoFocus?: boolean;
  /** [1111] "지도로 찾기" — 있으면 화면을 떠나지 않고 지도 보기로(없으면 /map 링크) */
  onMapClick?: () => void;
  /** [1112] 이 화면에서 바로 바꿀 수 있는 지역 — 고르면 onPick(id), 목록 밖 지역 · 동은 href 로 이동 */
  pickIds?: string[];
  onPick?: (id: string) => void;
}) {
  const router = useRouter();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dongs, setDongs] = useState<DongHit[]>([]);
  const [dongFailed, setDongFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { query: settled, compositionProps } = useSettledSearchQuery(raw);

  /* 시 · 구 — 치는 즉시(서버 왕복 없음) */
  const local = useMemo(() => searchRegionSise(regions, raw, 6), [regions, raw]);

  /* 동 — 굳은 검색어(두 글자부터)로 검색 API areas 의 동 줄만. 늦게 온 응답은 버린다(검색어 비교). */
  useEffect(() => {
    const q = settled.trim();
    if (q.length < 2) {
      setDongs([]);
      setDongFailed(false);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&limit=3`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { areas?: AreaJson[] }) => {
        const hits = (Array.isArray(j.areas) ? j.areas : [])
          .filter((a) => a.kind === "dong" && typeof a.href === "string" && a.href.startsWith("/dong/"))
          .slice(0, 5)
          .map((a) => ({
            key: a.key,
            label: a.label,
            href: a.href as string,
            complexCount: a.complexCount ?? 0,
            recentTradeCount: a.recentTradeCount ?? 0,
          }));
        setDongs(hits);
        setDongFailed(false);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setDongs([]);
        setDongFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [settled]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = local.map((r) => ({ key: `r:${r.id}`, label: r.label, sub: "지역 종합 · 개요 · 구간 · 전월세 · 온도", href: r.href }));
    for (const d of dongs) {
      out.push({
        key: `d:${d.key}`,
        label: d.label,
        sub: `동 실거래 · 단지 ${d.complexCount.toLocaleString("ko-KR")}곳 · 6개월 ${d.recentTradeCount.toLocaleString("ko-KR")}건`,
        href: d.href,
      });
    }
    return out;
  }, [local, dongs]);

  const q = raw.trim();
  const showList = open && q.length > 0;
  const nothing = showList && items.length === 0 && !loading && settled.trim() === q;

  useEffect(() => {
    setActive(items.length > 0 ? 0 : -1);
  }, [items]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choose = (it: { key: string; href: string }) => {
    const id = it.key.startsWith("r:") ? it.key.slice(2) : null;
    if (id && onPick && pickIds?.includes(id)) {
      setOpen(false);
      setRaw("");
      onPick(id);
      return;
    }
    go(it.href);
  };
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : -1));
    } else if (e.key === "Enter") {
      if (active >= 0 && items[active]) {
        e.preventDefault();
        choose(items[active]);
      } else if (nothing) {
        e.preventDefault();
        go(`/search?q=${encodeURIComponent(q)}`);
      }
    }
  };

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      {/* [1112] 대시보드 머리에 설 때(pickIds)는 라벨 · 지도 단추 없이 검색칸 하나 */}
      {!pickIds && <span className="t-sub font-bold text-text-2">지역 검색</span>}
      <div className="flex items-stretch gap-1.5">
        <input
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          {...compositionProps}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
          placeholder={pickIds ? "다른 지역 검색 (시 · 구 · 동)" : "시 · 구 · 동 이름"}
          aria-label="지역 검색"
          className="w-0 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 t-sub font-bold text-ink outline-none focus:border-primary"
        />
        {pickIds ? null : onMapClick ? (
          <button
            type="button"
            onClick={onMapClick}
            className="press flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 t-sub font-bold text-primary hover:border-primary"
            aria-label="지도에서 지역 찾기"
          >
            <Icon name="map" size={14} /> 지도로 찾기
          </button>
        ) : (
          <Link
            href="/map"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 t-sub font-bold text-primary no-underline hover:border-primary"
            aria-label="지도에서 지역 찾기"
          >
            <Icon name="map" size={14} /> 지도로 찾기
          </Link>
        )}
      </div>

      {showList && (
        <div className="card absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl p-1">
          {items.length > 0 && (
            <ul id={listId} role="listbox" aria-label="지역 검색 결과" className="m-0 flex list-none flex-col p-0">
              {items.map((it, i) => (
                <li
                  key={it.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(it);
                  }}
                  className={`flex min-h-10 cursor-pointer flex-col justify-center gap-0.5 rounded-lg px-3 py-1.5 ${i === active ? "bg-bg" : ""}`}
                >
                  <span className="t-body font-bold text-ink">{it.label}</span>
                  <span className="t-caption text-text-3">{it.sub}</span>
                </li>
              ))}
            </ul>
          )}
          {loading && items.length === 0 && <p className="m-0 px-3 py-2 t-caption text-text-3">동 찾는 중…</p>}
          {nothing && (
            <Link href={`/search?q=${encodeURIComponent(q)}`} className="flex min-h-10 items-center rounded-lg px-3 t-sub font-bold text-primary no-underline hover:bg-bg">
              ‘{q}’ 통합 검색 ›
            </Link>
          )}
          {dongFailed && items.length === 0 && !nothing && <p className="m-0 px-3 py-2 t-caption text-text-3">동 검색 불러오기 실패 · 잠시 후 다시</p>}
        </div>
      )}
    </div>
  );
}
