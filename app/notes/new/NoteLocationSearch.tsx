"use client";

import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { Icon } from "@/app/components/Icon";
import { useSettledSearchQuery } from "@/lib/search/settle";
/* [1005 · A1] 직접 입력 칸은 검색이 비었을 때만 보인다 — /notes/new 첫 로드(예산 470KB,
   실측 469KB)에 넣지 않고 그때 내려받는다. 높이를 미리 잡아 두어 열릴 때 뛰지 않게. */
const NoteLocationManual = nextDynamic(
  () => import("./NoteLocationManual").then((m) => m.NoteLocationManual),
  { ssr: false, loading: () => <div className="mt-2 h-[186px] animate-pulse rounded-xl bg-surface" /> },
);

/**
 * 임장노트 위치 검색 — 단지명·주소로 검색해 노트에 위치를 연결한다.
 * /api/search/suggest 재사용: 내부 단지(suggestions) + 장소검색 폴백(places).
 * 선택 시 상위로 {aptName, region, complexId?, lat?, lng?} 전달.
 *
 * [1005 · A1] 직접 입력 — 위치는 노트의 **유일한 필수값**인데, 검색에 없는
 * 단지(신축·소규모 빌라·검색 API 장애)는 적을 길이 없었다. 안내문은 "직접
 * 입력해도 돼요"라고 했지만 그 경로가 실제로는 없었다. 이제 결과 0건·검색
 * 실패에서 자동으로, 그 밖에는 "직접 입력" 링크로 지역·단지명 두 칸을 연다.
 * 검색이 우선이고 직접 입력은 보조다(좌표·단지 id 는 없다 — 브리핑·인증은 안 붙는다).
 */

export type NoteLocation = {
  aptName: string;
  region: string;
  complexId?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Suggestion = { id: string; name: string; region: string; dong?: string; address?: string };
type Place = { name: string; address: string; lat: number; lng: number };

export function NoteLocationSearch({
  value,
  onChange,
}: {
  value: NoteLocation;
  onChange: (loc: NoteLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  /* 검색 자체가 실패했는가(네트워크·5xx) — "결과 없음"과 다른 사실이라 따로 말한다 */
  const [failed, setFailed] = useState(false);
  /* [1005 · A1] 직접 입력 칸 — 열림은 **걸쇠**(latch)다: 결과 0건이 되는 순간 열리고,
     입력이 이어져 pending/loading 이 오가도 닫히지 않는다(깜빡임 방지). 검색 결과를
     고르거나 드롭다운을 닫으면 풀린다. 입력값은 여기(부모)가 든다. */
  const [manual, setManual] = useState(false);
  const [mRegion, setMRegion] = useState("");
  const [mApt, setMApt] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  /* 대기 규칙은 lib/search/settle 한 군데에서만 정한다. */
  const { query: settled, compositionProps } = useSettledSearchQuery(q);
  /* 아직 굳지 않은 입력 = "아직 안 물어본 상태"다. 이걸 로딩으로 안 치면
     치는 도중에 "검색 결과가 없어요"가 떴다 사라진다 — 확인한 적 없는 사실을
     화면에 쓰는 셈이다. */
  const pending = q.trim().length >= 2 && q.trim() !== settled;

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // 입력이 굳은 뒤 검색 (대기 규칙: lib/search/settle)
  useEffect(() => {
    const term = settled;
    if (term.length < 2) {
      setSuggestions([]);
      setPlaces([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`suggest ${r.status}`);
        return r.json();
      })
      .then((json: { suggestions?: Suggestion[]; places?: Place[] }) => {
        setSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 8) : []);
        setPlaces(Array.isArray(json.places) ? json.places.slice(0, 5) : []);
      })
      .catch(() => {
        /* abort 는 다음 검색이 이어받는다. 진짜 실패는 화면에 적고 직접 입력을 연다 */
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setPlaces([]);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [settled]);

  const pickComplex = (s: Suggestion) => {
    // 즉시 반영(반응성) 후, 주소 on-demand 지오코딩으로 좌표 보강(노트에 위치 저장)
    onChange({ aptName: s.name, region: s.region, complexId: s.id, lat: null, lng: null });
    setManual(false);
    setOpen(false);
    setQ("");
    const addr = (s.address || `${s.region} ${s.name}`).trim();
    if (!addr) return;
    fetch(`/api/map/geocode?q=${encodeURIComponent(addr)}&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { items?: { lat: number; lng: number }[] } | null) => {
        const it = json?.items?.[0];
        if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
          onChange({ aptName: s.name, region: s.region, complexId: s.id, lat: it.lat, lng: it.lng });
        }
      })
      .catch(() => {
        /* 지오코딩 실패 — 좌표 없이 이름·지역만 연결 */
      });
  };
  const pickPlace = (p: Place) => {
    // 주소에서 시군구까지를 지역으로 사용
    const region = p.address.split(" ").slice(0, 2).join(" ") || p.address;
    onChange({ aptName: p.name, region, complexId: null, lat: p.lat, lng: p.lng });
    setManual(false);
    setOpen(false);
    setQ("");
  };

  const searched = q.trim().length >= 2 && !loading && !pending;
  const noResults = searched && suggestions.length === 0 && places.length === 0;

  /* 검색어를 단지명 칸에 미리 넣어 준다(다시 치지 않게). 비어 있을 때만 — 적던 것을 덮지 않는다 */
  const openManual = () => {
    setManual(true);
    const term = q.trim();
    if (!mApt && term.length >= 2) setMApt(term.slice(0, 60));
    if (!mRegion && value.region) setMRegion(value.region);
  };
  /* 결과 0건·검색 실패 → 묻지 않고 연다. noResults 가 true 가 되는 순간에만(걸쇠) */
  useEffect(() => {
    if (noResults) openManual();
    // openManual 은 현재 입력값을 읽는 클로저 — 트리거는 noResults 하나뿐이어야 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noResults]);
  const commitManual = (loc: NoteLocation) => {
    onChange(loc);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="relative">
      {/* 현재 위치 카드 (클릭 시 검색 열림) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rise-in-1 card flex w-full items-center gap-2 rounded-[14px] px-3.5 py-3 text-left"
      >
        <Icon name="📍" size={16} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-ink">{value.aptName || "단지·주소 검색"}</div>
          <div className="truncate t-sub text-text-3">
            {value.region ? `${value.region} · 눌러서 변경` : "단지명이나 주소를 검색해 연결"}
          </div>
        </div>
        <Icon name="search" size={15} className="shrink-0 text-text-3" />
      </button>

      {/* 검색 드롭다운 */}
      {open ? (
        <div className="glass-strong absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[14px] border border-line p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <Icon name="search" size={15} className="text-text-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              {...compositionProps}
              /* [968 · 29] <form> 밖의 검색 입력 — 자판에 "검색" 키를 준다 */
              enterKeyHint="search"
              aria-label="단지·주소 검색"
              placeholder="단지명 또는 주소 (예: 은마아파트, 대치동)"
              className="w-full bg-transparent t-body text-ink outline-none placeholder:text-text-3"
            />
            {q ? (
              <button type="button" aria-label="지우기" onClick={() => setQ("")} className="press">
                <Icon name="x" size={14} className="text-text-3" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-[280px] overflow-y-auto">
            {loading || pending ? (
              <div className="px-2 py-3 t-sub text-text-3">검색 중…</div>
            ) : q.trim().length < 2 ? (
              <div className="px-2 py-3 t-sub text-text-3">두 글자 이상 입력해 주세요.</div>
            ) : noResults ? (
              <div role="status" className="px-2 py-3 t-sub text-text-3">
                {failed
                  ? "검색이 잠시 안 돼요 — 아래에 직접 적어 주세요."
                  : "검색 결과가 없어요 — 아래에 단지명·지역을 직접 적어 주세요."}
              </div>
            ) : (
              <>
                {suggestions.length > 0 ? (
                  <div className="mb-1">
                    <div className="px-2 py-1 t-caption font-bold uppercase tracking-wide text-text-3">
                      단지
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickComplex(s)}
                        className="press flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left active:bg-primary-soft"
                      >
                        <Icon name="building2" size={15} className="shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate t-body font-semibold text-ink">
                            {s.name}
                          </span>
                          <span className="block truncate t-sub text-text-3">{s.region}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {places.length > 0 ? (
                  <div>
                    <div className="px-2 py-1 t-caption font-bold uppercase tracking-wide text-text-3">
                      주소·장소
                    </div>
                    {places.map((p, i) => (
                      <button
                        key={`${p.name}-${i}`}
                        type="button"
                        onClick={() => pickPlace(p)}
                        className="press flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left active:bg-primary-soft"
                      >
                        <Icon name="map" size={15} className="shrink-0 text-text-2" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate t-body font-semibold text-ink">
                            {p.name}
                          </span>
                          <span className="block truncate t-sub text-text-3">{p.address}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* [1005 · A1] 직접 입력 — 검색 아래 보조 경로. 링크는 늘 있고, 결과 0건이면 저절로 열린다 */}
          {manual ? (
            <NoteLocationManual
              region={mRegion}
              apt={mApt}
              onRegion={setMRegion}
              onApt={setMApt}
              onCommit={commitManual}
            />
          ) : (
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={openManual}
                aria-expanded={false}
                className="inline-block py-[5px] t-sub font-bold text-primary"
              >
                검색에 없어요 — 직접 입력 ›
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
