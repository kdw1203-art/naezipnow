"use client";
/* [1032 · 임장노트 1단계] "임장한 타입" 카드 — 단지 자료 카드(ComplexGlance) 바로 아래, 단지 id 가 있을 때만.
 *
 * ① 단지 자료 줄 — 동수·최고층·주차·난방·승강기·건설사·관리방식(상세 응답 complex 에 있는 것만; 준공·세대는 위 카드 제목이 이미 말한다)
 * ② 타입 — 그 단지 실거래(최근 24개월, /api/complex/[id]/trades)에 신고된 전용면적을 정수부로 묶은 칩(84㎡ · 최근 8.2억 · 12건 · 3~24층).
 *    실거래가 없으면 칩 대신 면적 직접 입력. 어느 쪽이든 지어낸 타입은 없다.
 * ③ 동 · 층 · 향 — 같은 단지 안에서 집을 가르는 세 값.
 * ④ 평면도 — 공공 데이터에 평면도는 없다고 말하고, 현장 안내판·카탈로그 사진을 "평면도"로 담는 길을 준다.
 *
 * 번들: NoteForm 이 next/dynamic(ssr:false)으로 받는다. 상태(unit)는 NoteForm 이 든다 — 단계를 오가도 남는다. */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { loadComplexDetail } from "@/lib/notes/complex-glance";
import {
  NOTE_DIRECTIONS,
  areaTypeLabel,
  complexFactChips,
  tradeTuplesFrom,
  unitTypesFromTrades,
  type NoteUnit,
  type UnitType,
} from "@/lib/notes/unit-detail";
import { unitTypeSubline } from "@/lib/notes/unit-detail-lines";

/** 같은 단지 실거래는 한 번만(단지를 바꿨다 돌아와도) */
const tradesCache = new Map<string, Promise<UnitType[] | null>>();
function loadUnitTypes(id: string): Promise<UnitType[] | null> {
  const hit = tradesCache.get(id);
  if (hit) return hit;
  const p = fetch(`/api/complex/${encodeURIComponent(id)}/trades`)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => (raw == null ? null : unitTypesFromTrades(tradeTuplesFrom(raw))))
    .catch(() => null);
  tradesCache.set(id, p);
  void p.then((v) => {
    if (v == null) tradesCache.delete(id);
  });
  return p;
}

export type NoteUnitPickProps = {
  /** [1033] null = 단지 id 없는 위치(빌라·오피스텔·직접 입력·장소 검색) — 단지 자료·실거래 타입 없이 면적 직접 입력 + 동·층·향 + 평면도만 */
  complexId: string | null;
  unit: NoteUnit;
  onUnit: (next: NoteUnit) => void;
  /** 평면도로 표시된 사진 수 */
  floorplanCount: number;
  /** "평면도 사진 담기" — 사진 고르기를 열고 올라온 장에 평면도 역할을 붙인다(새 노트에서만 넘긴다) */
  onAddFloorplan?: () => void;
};

export function NoteUnitPick({ complexId, unit, onUnit, floorplanCount, onAddFloorplan }: NoteUnitPickProps) {
  const [facts, setFacts] = useState<{ id: string; chips: string[] } | null>(null);
  const [types, setTypes] = useState<{ id: string; list: UnitType[] | null } | null>(null);
  useEffect(() => {
    if (!complexId) return;
    let alive = true;
    void loadComplexDetail(complexId).then((raw) => {
      if (!alive) return;
      const c = (raw as { complex?: unknown } | null)?.complex;
      setFacts({ id: complexId, chips: complexFactChips(c).filter((t) => !/^준공 |세대$/.test(t)) });
    });
    void loadUnitTypes(complexId).then((list) => {
      if (alive) setTypes({ id: complexId, list });
    });
    return () => {
      alive = false;
    };
  }, [complexId]);
  const chips = complexId && facts && facts.id === complexId ? facts.chips : [];
  /* undefined = 아직 · null = 조회 실패 · [] = 실거래 없음 — 셋을 가르지 않으면 실패가 "없음"으로 그려진다 */
  const list = useMemo<UnitType[] | null | undefined>(
    () => (!complexId ? [] : types && types.id === complexId ? types.list : undefined),
    [complexId, types],
  );
  const failed = complexId != null && list === null;
  const loadedTypes = useMemo(() => list ?? [], [list]);
  /* 고른 면적이 목록에 없으면(직접 입력·다른 단지에서 이어받음) 직접 입력 칸이 열린 채로 보인다 */
  const picked = useMemo(() => loadedTypes.find((t) => t.label === unit.areaLabel) ?? null, [loadedTypes, unit.areaLabel]);
  const [manualOpen, setManualOpen] = useState(false);
  const showManual = manualOpen || (list !== undefined && loadedTypes.length === 0) || (unit.areaM2 != null && !picked);
  const typeCaption = !complexId
    ? "단지 연결 없음 · 면적 직접 입력"
    : list === undefined
      ? "실거래 타입 불러오는 중"
      : failed
        ? "실거래 타입 불러오기 실패 · 직접 입력"
        : loadedTypes.length > 0
          ? `실거래 24개월 · 타입 ${loadedTypes.length}개`
          : "실거래 타입 없음 · 직접 입력";

  const set = (patch: Partial<NoteUnit>) => onUnit({ ...unit, ...patch });

  return (
    <section aria-label="임장한 타입" className="card rise-in-2 flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-body font-bold text-ink">임장한 타입</h2>
        <span className="t-caption text-text-3">단지 안 어느 집인지</span>
      </div>

      {chips.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="단지 자료">
          {chips.map((c) => (
            <li key={c} className="rounded-md bg-bg px-2 py-1 t-caption t-num text-text-2">
              {c}
            </li>
          ))}
        </ul>
      )}

      {/* 타입 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 t-sub text-text-2">
          <span>전용면적</span>
          <span className="t-caption text-text-3">{typeCaption}</span>
        </div>
        {loadedTypes.length > 0 && (
          /* 폰은 2열(타입 8개가 한 줄씩 서면 화면 한 장을 넘긴다) · sm 부터 흐름 배치 */
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            {loadedTypes.map((t) => {
              const active = picked?.label === t.label;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set(active ? { areaM2: null, areaLabel: null } : { areaM2: t.areaM2, areaLabel: t.label })}
                  className={`chip flex min-h-10 min-w-0 flex-col items-start rounded-xl border px-3 py-1.5 text-left ${
                    active ? "chip-active" : "border-line bg-surface text-text-2"
                  }`}
                >
                  <span className="t-sub font-bold t-num">{t.label}</span>
                  {/* 폰 2열에서는 두 줄로 접힌다(자르지 않는다 — 건수·층 범위도 사실이다). .chip 의 nowrap 은 비계층 규칙이라 인라인으로 푼다 */}
                  <span className="t-caption t-num leading-[1.35] opacity-80" style={{ whiteSpace: "normal" }}>
                    {unitTypeSubline(t)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {showManual ? (
          <div className="flex items-center gap-2">
            <label htmlFor="note-unit-area" className="t-sub text-text-2">
              직접 입력
            </label>
            <input
              id="note-unit-area"
              type="number"
              inputMode="decimal"
              min={10}
              max={999}
              step="0.01"
              value={unit.areaM2 ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!e.target.value) set({ areaM2: null, areaLabel: null });
                else if (Number.isFinite(v) && v > 0 && v < 1000) set({ areaM2: v, areaLabel: areaTypeLabel(v) });
              }}
              enterKeyHint="done"
              aria-label="전용면적(㎡)"
              className="w-28 min-h-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub t-num text-text-1 outline-none"
            />
            <span className="t-sub text-text-3">㎡</span>
          </div>
        ) : (
          loadedTypes.length > 0 && (
            <button type="button" onClick={() => setManualOpen(true)} className="self-start py-[5px] t-sub font-bold text-primary">
              목록에 없는 면적 직접 입력 ›
            </button>
          )
        )}
      </div>

      {/* 동 · 층 · 향 */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="t-sub text-text-2">동</span>
          <input
            type="text"
            value={unit.dong ?? ""}
            maxLength={12}
            onChange={(e) => set({ dong: e.target.value.trim().slice(0, 12) || null })}
            enterKeyHint="next"
            className="min-h-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub text-text-1 outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-sub text-text-2">층</span>
          <input
            type="number"
            inputMode="numeric"
            min={-5}
            max={99}
            value={unit.floor ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              set({ floor: e.target.value && Number.isInteger(v) && v >= -5 && v <= 99 ? v : null });
            }}
            enterKeyHint="done"
            className="min-h-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 t-sub t-num text-text-1 outline-none"
          />
        </label>
      </div>
      <div className="flex items-start gap-2">
        <span className="w-14 shrink-0 pt-2 t-sub text-text-2">향</span>
        <div className="flex flex-wrap gap-1.5">
          {NOTE_DIRECTIONS.map((d) => {
            const active = unit.direction === d;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                onClick={() => set({ direction: active ? null : d })}
                className={`chip rounded-full border px-3 py-1.5 t-sub ${active ? "chip-active" : "border-line bg-surface text-text-2"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* 평면도 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-bg px-3 py-2">
        <Icon name="images" size={15} className="shrink-0 text-text-3" />
        <span className="min-w-0 flex-1 t-sub text-text-2">
          {floorplanCount > 0
            ? `평면도 사진 ${floorplanCount}장 · 사진 줄에서 표시`
            : "평면도 · 공공 자료 없음 · 현장 안내판·카탈로그 사진으로 보관"}
        </span>
        {onAddFloorplan && (
          <button type="button" onClick={onAddFloorplan} className="btn-outline btn-md whitespace-nowrap">
            평면도 사진 담기
          </button>
        )}
      </div>
    </section>
  );
}
