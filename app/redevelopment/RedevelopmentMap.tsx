"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scrollIntoViewSafely } from "@/lib/ui/scroll";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
import {
  STAGES,
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  type ProjectTypeKey,
  type RedevelopmentProject,
  type StageKey,
} from "@/lib/redevelopment/types";
import { Icon } from "@/app/components/Icon";
import { TypeFilterPanel } from "./TypeFilterPanel";
import { NearbyPanel } from "./NearbyPanel";
import { ProjectDetailPanel } from "./ProjectDetailPanel";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const MARKER_PREFIX = "redev:";

/** 같은 데이터를 보는 세 가지 방식 — 지도 / 목록 / 내용(집계). */
type ViewKey = "map" | "list" | "content";

/* [v4 · 규칙 7] 탭 글자 앞 장식 아이콘(map·clipboard·file-text)은 뺐다 — 밑줄 탭은 글자만 */
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "map", label: "지도" },
  { key: "list", label: "목록" },
  { key: "content", label: "내용" },
];

function esc(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  };
  return s.replace(/[&<>"]/g, (c) => map[c] ?? c);
}

function householdsLabel(n: number | null): string {
  return n != null ? `${n.toLocaleString("ko-KR")}세대` : "";
}

/** 마커 클릭 시 뜨는 인포윈도우 카드(HTML) — 우리 데이터라 인라인 스타일. */
function buildInfoHtml(p: RedevelopmentProject): string {
  const color = colorForType(p.typeKey);
  const typeLabel = labelForType(p.typeKey);
  const stage = stageLabel(p.stageKey);
  const loc = locationLabel({ sigungu: p.sigungu, address: p.address });
  const households = householdsLabel(p.households);
  const asOfLine = p.asOf
    ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px">${esc(p.asOf)} 공개자료 기준 · 최신 단계와 다를 수 있음</div>`
    : "";
  /* 스킴 검증(2026-08-22) — 이 문자열은 지도 인포윈도 innerHTML 로 들어간다.
     이스케이프는 하고 있었지만 href 스킴은 안 봤다: javascript: 값이 오면 클릭
     시 실행된다. 쓰기 경로가 service-role 뿐이라 위험은 낮지만, http(s) 외에는
     링크를 그리지 않는 것이 층 하나 더 싼 방어다. */
  const safeSourceUrl =
    p.sourceUrl != null && /^https?:\/\//i.test(p.sourceUrl.trim()) ? p.sourceUrl.trim() : null;
  const source =
    safeSourceUrl != null
      ? `<a href="${esc(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:2px;font-size:11px;font-weight:700;color:#1d4fd8;text-decoration:none">출처 ›</a>`
      : "";
  return `
  <div style="padding:10px 12px;min-width:184px;max-width:220px;font-family:sans-serif;line-height:1.5">
    <div style="font-weight:800;font-size:13px;color:#111827;margin:0 0 6px">${esc(p.name)}</div>
    <div style="display:flex;align-items:center;gap:5px;margin:0 0 3px">
      <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${color}"></span>
      <span style="font-size:12px;font-weight:700;color:${color}">${esc(typeLabel)}</span>
      <span style="font-size:11px;color:#9ca3af">·</span>
      <span style="font-size:11px;font-weight:600;color:#4b5563">${esc(stage)}</span>
    </div>
    ${loc ? `<div style="font-size:11px;color:#6b7280;margin:0 0 2px">${esc(loc)}</div>` : ""}
    ${households ? `<div style="font-size:11px;color:#374151">예정 ${esc(households)}</div>` : ""}
    ${asOfLine}
    ${source}
  </div>`;
}

export function RedevelopmentMap({
  initialProjects,
  sigunguCounts,
}: {
  initialProjects: RedevelopmentProject[];
  sigunguCounts: { sigungu: string; count: number }[];
}) {
  const [types, setTypes] = useState<Set<ProjectTypeKey>>(new Set());
  const [stages, setStages] = useState<Set<StageKey>>(new Set());
  const [typePanelOpen, setTypePanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("map");
  /* 구역명 검색(2026-08-22) — 이름·주소가 전부 메모리에 있는데 40곳을 눈으로
     훑는 것 말고는 특정 구역을 찾을 길이 없었다. 공백 무시 부분일치. */
  const [q, setQ] = useState("");

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleType = (key: ProjectTypeKey) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleStage = (key: StageKey) =>
    setStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleReset = () => {
    setTypes(new Set());
    setStages(new Set());
    setSigungu(null);
    setSelectedId(null);
  };

  /* 지역 칩을 누르기 전 단계 — 사업종류·진행단계까지만 건 결과.
     지역별 개수를 이 집합에서 세야 "칩에 적힌 수 = 눌렀을 때 보이는 수" 가 된다.
     전체 기준 개수를 적어 두고 필터가 걸린 결과를 보여 주면 숫자가 거짓말이 된다. */
  const byTypeStage = useMemo(
    () =>
      initialProjects.filter(
        (p) =>
          (types.size === 0 || types.has(p.typeKey)) &&
          (stages.size === 0 || stages.has(p.stageKey)),
      ),
    [initialProjects, types, stages],
  );

  const filtered = useMemo(() => {
    let list = sigungu ? byTypeStage.filter((p) => p.sigungu === sigungu) : byTypeStage;
    const needle = q.trim().toLowerCase().replace(/\s+/g, "");
    if (needle) {
      list = list.filter((p) =>
        `${p.name} ${p.address ?? ""} ${p.sigungu ?? ""}`
          .toLowerCase()
          .replace(/\s+/g, "")
          .includes(needle),
      );
    }
    return list;
  }, [byTypeStage, sigungu, q]);

  /** 현재 사업종류·진행단계 조건에서의 시군구별 구역 수(많은 순). */
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of byTypeStage) {
      if (!p.sigungu) continue;
      m.set(p.sigungu, (m.get(p.sigungu) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko-KR"));
  }, [byTypeStage]);

  /* "내용" 뷰 집계 — 전부 지금 화면에 올라온 행에서만 센다. 세대수는 공개된
     건에서만 더하고, 빠진 건수를 함께 적는다. 모르는 값을 0 으로 채워 합치면
     합계가 실제보다 작아진 채로 사실처럼 보인다. */
  const summary = useMemo(() => {
    const byType = new Map<ProjectTypeKey, number>();
    const byStage = new Map<StageKey, number>();
    let householdsSum = 0;
    let householdsKnown = 0;
    for (const p of filtered) {
      byType.set(p.typeKey, (byType.get(p.typeKey) ?? 0) + 1);
      byStage.set(p.stageKey, (byStage.get(p.stageKey) ?? 0) + 1);
      if (p.households != null) {
        householdsSum += p.households;
        householdsKnown += 1;
      }
    }
    return {
      types: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      stages: STAGES.map((s) => ({ stage: s, count: byStage.get(s.key) ?? 0 })),
      householdsSum,
      householdsKnown,
      householdsMissing: filtered.length - householdsKnown,
    };
  }, [filtered]);

  const selectedProject = useMemo(
    () => (selectedId ? initialProjects.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, initialProjects],
  );

  const markers = useMemo<MapMarkerData[]>(
    () =>
      filtered.map((p) => ({
        id: `${MARKER_PREFIX}${p.id}`,
        lat: p.lat,
        lng: p.lng,
        label: p.name,
        pinColor: colorForType(p.typeKey),
        infoHtml: buildInfoHtml(p),
        selected: p.id === selectedId,
      })),
    [filtered, selectedId],
  );

  const center = selectedProject
    ? { lat: selectedProject.lat, lng: selectedProject.lng }
    : SEOUL_CENTER;
  const level = selectedProject ? 6 : 9;

  const handleMarkerClick = (m: MapMarkerData) => {
    const id = m.id.startsWith(MARKER_PREFIX) ? m.id.slice(MARKER_PREFIX.length) : m.id;
    setSelectedId(id);
  };

  const handleCardClick = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  /* 지역을 바꾸면 이전 선택은 화면에서 사라진 구역일 수 있다 —
     보이지도 않는 구역의 상세가 남아 있으면 지금 보는 지역의 자료로 오해된다. */
  const handleSigunguClick = (name: string | null) => {
    setSigungu((prev) => (prev === name ? null : name));
    setSelectedId(null);
  };

  // 선택 변경 시 해당 목록 카드로 스크롤(마커 클릭 → 목록 하이라이트).
  // 목록 뷰가 아닐 때는 카드가 DOM 에 없으므로 아무 일도 하지 않는다.
  useEffect(() => {
    if (!selectedId || view !== "list") return;
    const el = cardRefs.current.get(selectedId);
    scrollIntoViewSafely(el, { block: "nearest" });
  }, [selectedId, view]);

  const total = initialProjects.length;
  const topSigungu = regionCounts.slice(0, 12);
  /** 서버가 전체 데이터로 센 시군구 수 — 지금 필터 결과와 구분해 적는다. */
  const totalSigunguCount = sigunguCounts.length;

  // 전체가 같은 취합 시점(시드)일 때만 면책에 시점을 못 박는다 — 혼합 데이터면 개별 표기.
  const asOfLabel = useMemo(() => {
    const set = new Set(
      initialProjects.map((p) => p.asOf).filter((v): v is string => Boolean(v)),
    );
    return set.size === 1 ? [...set][0] : null;
  }, [initialProjects]);

  /* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 — 한 줄 가로 스크롤 필터 칩 */
  const chip = (on: boolean) =>
    `chip press shrink-0 px-3 py-1.5 t-sub font-bold ${on ? "chip-active border" : "border border-line bg-surface text-text-2"}`;

  return (
    /* [v4] "한 화면 한 가지" — 주인공은 **지도**(목록·내용은 같은 데이터의 다른 보기). 위에서 아래로:
         검색 + 사업종류 + 초기화 한 줄 → 진행단계 칩 한 줄 → 지역 칩 한 줄 → 보기 밑줄 탭(지도·목록·내용) + 표시 수
         → 지도(또는 목록·내용) → 선택 구역 상세 → 면책 캡션 한 줄.
       지운 것: 사업종류 버튼의 아이콘·채움 파랑 숫자 배지 · "진행단계" 라벨 · "지역 칩의 숫자는 …" 설명 문장 ·
       보기 알약 탭의 채움 파랑(→ 밑줄 탭) · 목록 카드 격자와 배지(→ 1px 선 행) · 행마다 되풀이되던 취합 시점 문장(→ 끝 캡션 한 번) ·
       "데이터 출처" 카드(→ 페이지 끝 접힘, page.tsx) · 파랑 면책 상자(→ 캡션). */
    <div className="flex flex-col gap-3">
      {/* ===== 검색 · 사업종류 · 초기화 ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 구역명 검색 — 타이핑 즉시 지도·목록·집계가 같이 좁혀진다 */}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={40}
          placeholder="구역명·주소 검색"
          aria-label="정비구역 검색"
          className="min-h-10 min-w-[160px] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 t-body text-ink placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => setTypePanelOpen((v) => !v)}
          aria-expanded={typePanelOpen}
          className={chip(typePanelOpen || types.size > 0)}
        >
          사업종류{types.size > 0 ? <span className="ml-1 font-normal tabular-nums">{types.size}</span> : null}
          <span className="ml-1 t-caption leading-none text-text-3">{typePanelOpen ? "▴" : "▾"}</span>
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="press inline-flex min-h-10 items-center gap-1 px-1 t-sub font-bold text-text-3"
        >
          <Icon name="x" size={13} />
          초기화
        </button>
      </div>

      {/* 사업종류 그룹 필터 패널(접이식) */}
      {typePanelOpen ? (
        <TypeFilterPanel
          selected={types}
          onToggle={toggleType}
          onSelectAll={() => setTypes(new Set())}
        />
      ) : null}

      {/* 진행단계 다중선택 칩 — [v4] 한 줄 가로 스크롤 */}
      <div className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0" role="group" aria-label="진행단계">
        {STAGES.map((s) => {
          const active = stages.has(s.key);
          return (
            <button key={s.key} type="button" onClick={() => toggleStage(s.key)} aria-pressed={active} className={chip(active)}>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 지역 칩 — 지금 걸린 사업종류·진행단계 조건에서 센 구역 수(칩 숫자 = 누르면 보이는 수). 구역이 많은 순 12개 */}
      {topSigungu.length > 0 ? (
        <div
          className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0"
          role="group"
          aria-label={`지역 — 조건에 맞는 시군구 ${regionCounts.length}곳 중 많은 순 ${topSigungu.length}곳 · 전체 데이터 시군구 ${totalSigunguCount.toLocaleString("ko-KR")}곳`}
        >
          <button
            type="button"
            onClick={() => handleSigunguClick(null)}
            aria-pressed={sigungu === null}
            className={chip(sigungu === null)}
          >
            전체
          </button>
          {topSigungu.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleSigunguClick(s.name)}
              aria-pressed={sigungu === s.name}
              className={chip(sigungu === s.name)}
            >
              {s.name}
              <span className="ml-1 font-normal tabular-nums">{s.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ===== 보기 방식 — 같은 데이터를 지도/목록/내용으로. [v4] 채움 파랑 알약 → 밑줄 탭 + 오른쪽 표시 수 ===== */}
      <div className="flex items-end justify-between gap-3 border-b border-line">
        <div role="tablist" aria-label="보기 방식" className="flex gap-4">
          {VIEWS.map((v) => {
            const active = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(v.key)}
                className={`-mb-px min-h-10 border-b-2 pb-2.5 pt-2 t-body font-bold transition-colors ${
                  active ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <span className="shrink-0 pb-2.5 t-sub text-text-3">
          <span className="t-num font-bold text-ink">{filtered.length.toLocaleString("ko-KR")}</span> /{" "}
          <span className="t-num">{total.toLocaleString("ko-KR")}</span>곳
        </span>
      </div>

      {/* ===== 지도 뷰 ===== */}
      {view === "map" ? (
        <div className="overflow-hidden rounded-lg border border-line">
          <NaverMap
            markers={markers}
            center={center}
            level={level}
            fitToMarkers
            className="h-[440px] md:h-[560px]"
            onMarkerClick={handleMarkerClick}
          />
        </div>
      ) : null}

      {/* ===== 선택 구역: 진행 상황 + 현황 자료 ===== */}
      {selectedProject ? (
        <>
          <ProjectDetailPanel project={selectedProject} onClose={() => setSelectedId(null)} />
          <NearbyPanel projectId={selectedProject.id} projectName={selectedProject.name} />
        </>
      ) : null}

      {/* ===== 목록 뷰 — [v4] 카드 격자(색 알약 배지 둘 + 취합 시점 문장) → 1px 선 행:
           구역명(사업종류 색 점) + 사업종류 · 단계 · 소재지 · 세대 한 줄. 누르면 지도에서 그 구역을 고른다 ===== */}
      {view === "list" ? (
        filtered.length === 0 ? (
          /* [1012] 규칙 6 — 권유("조정해 보세요") 대신 사실: 조건·전체 구역 수. [v4] 한 줄 */
          <p className="py-8 text-center t-sub text-text-3">
            이 조건의 정비사업 구역 0곳 · 전체 {initialProjects.length.toLocaleString("ko-KR")}곳
          </p>
        ) : (
          <ul data-tone="sand" className="divide-y divide-line">
            {filtered.map((p) => {
              const color = colorForType(p.typeKey);
              const active = selectedId === p.id;
              const households = householdsLabel(p.households);
              const loc = locationLabel({ sigungu: p.sigungu, address: p.address });
              return (
                <li key={p.id}>
                  <div
                    ref={(el) => {
                      if (el) cardRefs.current.set(p.id, el);
                      else cardRefs.current.delete(p.id);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => handleCardClick(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardClick(p.id);
                      }
                    }}
                    className={`press flex min-h-14 cursor-pointer items-center gap-3 py-3 ${active ? "bg-brand-hanji" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* 사업종류 색 점 — 지도 마커 색과 같은 범례(장식 아이콘이 아니다) */}
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                        <span className="truncate t-body font-bold text-ink">{p.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {[labelForType(p.typeKey), stageLabel(p.stageKey), loc, households ? `예정 ${households}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                      ›
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {/* ===== 내용 뷰 — 지금 조건에 맞는 구역들의 집계 =====
           집계는 전부 화면에 올라온 행에서만 낸다. 표본 밖 값을 추정해 채우지 않는다.
           [v4] 카드 네 장 · 숫자 타일 3칸 → 제목 + 1px 선 행 */}
      {view === "content" ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-1">
            <h3 className="t-section text-ink">{sigungu ?? "선택한 조건"} 요약</h3>
            <dl data-tone="blue" className="divide-y divide-line">
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="t-sub text-text-3">구역 수</dt>
                <dd className="t-body t-num font-bold text-ink">{filtered.length.toLocaleString("ko-KR")}곳</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="t-sub text-text-3">사업종류</dt>
                <dd className="t-body t-num font-bold text-ink">{summary.types.length}종</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="t-sub text-text-3">예정 세대 합계 (공개된 {summary.householdsKnown}곳)</dt>
                <dd className="t-body t-num font-bold text-ink">
                  {summary.householdsKnown > 0
                    ? `${summary.householdsSum.toLocaleString("ko-KR")}세대`
                    : "공개 자료에 없음"}
                </dd>
              </div>
            </dl>
            {summary.householdsMissing > 0 ? (
              <p className="t-caption text-text-3">
                {summary.householdsMissing.toLocaleString("ko-KR")}곳은 공개 자료에 세대수 없음 — 합계에서 제외(0세대 아님)
              </p>
            ) : null}
          </section>

          {summary.types.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="t-section text-ink">사업종류 분포</h3>
              <ul className="flex flex-col gap-1.5">
                {summary.types.map(([key, count]) => {
                  const color = colorForType(key);
                  const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="w-[104px] shrink-0 truncate t-sub font-bold text-text-1">{labelForType(key)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </span>
                      <span className="w-[54px] shrink-0 text-right t-sub t-num text-text-2">
                        {count.toLocaleString("ko-KR")}곳
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="t-section text-ink">진행단계 분포</h3>
              <span className="shrink-0 t-caption text-text-3">도시정비법 일반 절차 7단계</span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {summary.stages.map(({ stage, count }) => {
                const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                return (
                  <li key={stage.key} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 t-caption font-bold text-text-3">{stage.order}</span>
                    {/* 단계 이름을 누르면 그 단계만 거른다(진행단계 칩과 같은 필터) */}
                    <button
                      type="button"
                      onClick={() => toggleStage(stage.key)}
                      aria-pressed={stages.has(stage.key)}
                      className={`w-[92px] shrink-0 truncate text-left text-[12px] font-bold ${
                        stages.has(stage.key) ? "text-primary" : "text-text-1"
                      }`}
                    >
                      {stage.label}
                    </button>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-[54px] shrink-0 text-right t-sub t-num text-text-2">
                      {count.toLocaleString("ko-KR")}곳
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="t-caption text-text-3">단계 통과일(인가일)은 확보한 자료에 없어 표시하지 않음</p>
          </section>

          {regionCounts.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="t-section text-ink">지역별 구역 수</h3>
              <ul data-tone="sand" className="divide-y divide-line">
                {regionCounts.map((r) => (
                  <li key={r.name}>
                    <button
                      type="button"
                      onClick={() => handleSigunguClick(r.name)}
                      aria-pressed={sigungu === r.name}
                      className={`press flex min-h-12 w-full items-center justify-between gap-3 py-2.5 text-left ${
                        sigungu === r.name ? "bg-brand-hanji" : ""
                      }`}
                    >
                      <span className="truncate t-body font-bold text-ink">{r.name}</span>
                      <span className="shrink-0 t-body t-num text-text-2">{r.count.toLocaleString("ko-KR")}곳</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ===== 면책 — [v4] 파랑 상자 → 캡션 한 줄(목록 행마다 되풀이되던 취합 시점도 여기서 한 번) ===== */}
      <p className="t-caption text-text-3">
        구역·진행단계는 {asOfLabel ? `${asOfLabel} ` : ""}공개자료 기준 참고값 · 좌표는 구역 대표점 근사값 — 최신
        고시·단계와 다를 수 있음
      </p>
    </div>
  );
}
