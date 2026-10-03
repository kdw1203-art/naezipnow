/**
 * [1027] 지도 위 정비사업 레이어 — 걸러 보기 · 이름표 값 · 안내창 HTML. 순수 함수(tests/unit/map-1027.test.ts).
 *
 * /map(app/map/map-client.tsx)과 /redevelopment(RedevelopmentMap)가 같은 안내창을 쓴다. 예전에는 두 화면이
 * 각자 HTML 을 만들었고, /map 쪽은 구역명·주소·출처 주소를 **이스케이프 없이** innerHTML 에 끼워 넣었다
 * (운영 40곳은 손으로 정리한 값이라 사고는 없었지만, 공공 API 적재분이 들어오는 순간 깨지는 자리였다).
 */
import {
  PROJECT_GROUPS,
  STAGES,
  colorForType,
  labelForType,
  locationLabel,
  stageLabel,
  typeMeta,
  type ProjectGroupKey,
  type RedevelopmentProject,
  type StageKey,
} from "./types";

/** 마커 이름표에 무엇을 적을지 */
export type RedevLabelMode = "name" | "stage" | "households";

export const REDEV_LABEL_MODES: { key: RedevLabelMode; label: string }[] = [
  { key: "name", label: "구역명" },
  { key: "stage", label: "진행단계" },
  { key: "households", label: "세대수" },
];

export function isRedevLabelMode(v: unknown): v is RedevLabelMode {
  return v === "name" || v === "stage" || v === "households";
}

/** 빈 집합 = 그 축은 걸지 않음(전체). 두 축은 AND. */
export function filterRedevProjects<T extends Pick<RedevelopmentProject, "typeKey" | "stageKey">>(
  items: readonly T[],
  groups: ReadonlySet<ProjectGroupKey>,
  stages: ReadonlySet<StageKey>,
): T[] {
  if (groups.size === 0 && stages.size === 0) return items.slice();
  return items.filter(
    (p) =>
      (groups.size === 0 || groups.has(typeMeta(p.typeKey).group)) &&
      (stages.size === 0 || stages.has(p.stageKey)),
  );
}

/**
 * 사업종류 묶음별 구역 수 — **진행단계 조건을 건 뒤** 센다.
 * 칩에 적힌 수가 "그 칩을 눌렀을 때 보이는 수"와 같아야 한다(다른 축 조건을 빼고 세면 숫자가 거짓말이 된다).
 */
export function redevGroupCounts(
  items: readonly Pick<RedevelopmentProject, "typeKey" | "stageKey">[],
  stages: ReadonlySet<StageKey>,
): Record<ProjectGroupKey, number> {
  const out = Object.fromEntries(PROJECT_GROUPS.map((g) => [g.key, 0])) as Record<ProjectGroupKey, number>;
  for (const p of items) {
    if (stages.size > 0 && !stages.has(p.stageKey)) continue;
    out[typeMeta(p.typeKey).group] += 1;
  }
  return out;
}

/** 진행단계별 구역 수 — 사업종류 묶음 조건을 건 뒤 센다(위와 같은 이유). */
export function redevStageCounts(
  items: readonly Pick<RedevelopmentProject, "typeKey" | "stageKey">[],
  groups: ReadonlySet<ProjectGroupKey>,
): Record<StageKey, number> {
  const out = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<StageKey, number>;
  for (const p of items) {
    if (groups.size > 0 && !groups.has(typeMeta(p.typeKey).group)) continue;
    if (p.stageKey in out) out[p.stageKey] += 1;
  }
  return out;
}

/**
 * 이름표 글자. 세대수가 공개 자료에 없으면 "—" — 0 이나 추정값으로 채우지 않는다
 * (지도 구 버블이 값 없는 구를 "—" 로 띄우는 것과 같은 규칙).
 */
export function redevMarkerLabel(
  p: Pick<RedevelopmentProject, "name" | "stageKey" | "households">,
  mode: RedevLabelMode,
): string {
  if (mode === "stage") return stageLabel(p.stageKey);
  if (mode === "households") {
    return p.households != null && Number.isFinite(p.households) && p.households > 0
      ? `${Math.round(p.households).toLocaleString("ko-KR")}세대`
      : "—";
  }
  return p.name;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** http(s) 주소만 돌려준다. javascript:·data: 같은 스킴은 링크를 그리지 않는다(이스케이프만으로는 못 막는다). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/** 구역 고유 주소 — id 에 한글·기호가 섞여도(공공 API 적재분) 경로 한 토막으로 들어간다 */
export function redevDetailHref(id: string): string {
  return `/redevelopment/${encodeURIComponent(id)}`;
}

/**
 * 마커를 눌렀을 때의 안내창(HTML 문자열 — 지도 SDK 가 innerHTML 로 넣는다).
 * 글자는 전부 이스케이프하고, 색은 토큰으로 적어 다크에서도 읽힌다(상자가 자기 바탕을 가진다 —
 * components/map/NaverMap.tsx 기본 안내창과 같은 방식).
 */
export function buildRedevInfoHtml(p: RedevelopmentProject): string {
  const color = colorForType(p.typeKey);
  const loc = locationLabel({ sigungu: p.sigungu, address: p.address });
  const households =
    p.households != null && Number.isFinite(p.households) && p.households > 0
      ? `${Math.round(p.households).toLocaleString("ko-KR")}세대`
      : "";
  const asOf = p.asOf
    ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px">${escapeHtml(p.asOf)} 공개자료 기준 · 최신 단계와 다를 수 있음</div>`
    : "";
  const src = safeHttpUrl(p.sourceUrl);
  const linkStyle =
    "display:inline-flex;align-items:center;min-height:24px;font-size:12px;font-weight:700;color:var(--primary);text-decoration:none";
  const links = [
    p.id ? `<a href="${escapeHtml(redevDetailHref(p.id))}" style="${linkStyle}">구역 상세 ›</a>` : "",
    src
      ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">출처 ↗</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return `<div style="padding:10px 12px;min-width:184px;max-width:230px;line-height:1.5;background:var(--surface);color:var(--ink)">
  <div style="font-weight:700;font-size:13px;margin:0 0 5px">${escapeHtml(p.name)}</div>
  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:0 0 3px">
    <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${color};flex:none"></span>
    <span style="font-size:12px;font-weight:700;color:var(--text-1)">${escapeHtml(labelForType(p.typeKey))}</span>
    <span style="font-size:12px;color:var(--text-3)">·</span>
    <span style="font-size:12px;font-weight:600;color:var(--text-2)">${escapeHtml(stageLabel(p.stageKey))}</span>
  </div>
  ${loc ? `<div style="font-size:12px;color:var(--text-3)">${escapeHtml(loc)}</div>` : ""}
  ${households ? `<div style="font-size:12px;color:var(--text-2)">예정 ${households}</div>` : ""}
  ${asOf}
  ${links ? `<div style="display:flex;gap:12px;margin-top:4px">${links}</div>` : ""}
</div>`;
}
