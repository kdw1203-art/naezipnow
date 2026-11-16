/* [1152 · 정비구역을 지도에] 소유자 2026-11-11 "지도에 반영할 수 있도록 — 목록으로는 타 사이트에 밀려".
   전국 정비구역 목록(국토교통부 · 좌표 없음)에 **위치를 지어내지 않고** 붙인다:
     ① 서울 도시계획 결정 조서(UPIS · seoul_upis_records)에서 같은 자치구 · 같은 구역 이름의 "위치(대표 지번)"를 찾고
     ② 구역 이름 자체가 지번인 것("응암동700번지일대")은 그 지번을 쓰고
     ③ 그 지번을 지오코더에 물어 나온 좌표만 찍는다. 못 찾으면 목록에만 남는다.
   찍히는 점은 **대표 지번 위치**다(구역 경계 · 중심이 아니다) — 안내창 요약에 그렇게 적는다.
   순수 규칙(server-only 없음) — 실행(zone-locate-run) · node:test 가 같이 쓴다. */

import type { ProjectTypeKey, StageKey } from "./types";
import { stripOrdinal } from "./national";

/** 구역 이름 열쇠 — 공백 · 문장부호 · "주택재개발/정비구역/지구/제/아파트" 같은 꾸밈말을 뗀다. "한남3재정비촉진구역" = "한남3 구역" */
export function zoneNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[\s()[\]·ㆍ,.\-~_]/g, "")
    .replace(/주택재개발|주택재건축|도시환경정비|도시정비형|재정비촉진|정비예정|재개발|재건축|정비|사업|구역|지구|제|아파트|일대|일원|번지/g, "");
}

/** 두 열쇠가 같은 구역인가 — 같거나, 한쪽이 다른 쪽을 품되 **남는 글자에 숫자가 없을 때만**("면목9" ≠ "면목91") */
export function sameZoneKey(a: string, b: string): "eq" | "sub" | null {
  if (a.length < 2 || b.length < 2) return null;
  if (a === b) return "eq";
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 3) return null;
  const at = l.indexOf(s);
  if (at < 0) return null;
  const rest = l.slice(0, at) + l.slice(at + s.length);
  return /\d/.test(rest) ? null : "sub";
}

/** 글 속의 첫 지번 → { dong, lot }. "용산구 한남동 686번지 일대" → 한남동 · 686 / "후암동 산1, 401번지" → 후암동 · 산1 / 지번이 없으면 null */
export function firstLot(text: string | null | undefined): { dong: string; lot: string } | null {
  const m = /([가-힣]+(?:\d+가|동\d+가|동))\s*(산\s*)?(\d{1,4}(?:-\d{1,4})?)(?![\d-])(?!\s*(?:길|로|단지|차|구역|지구|동|층|호|가))/.exec(String(text ?? ""));
  if (!m) return null;
  return { dong: m[1], lot: `${m[2] ? "산" : ""}${m[3]}` };
}

/** 지오코더에 물을 주소 — 시 · 구는 목록(국토교통부) 값을 쓴다 */
export function lotQuery(sido: string, sigungu: string, lot: { dong: string; lot: string }): string {
  return `${sido} ${sigungu} ${lot.dong} ${lot.lot}`;
}

export type UpisPlace = { name: string; place: string | null; sigungu: string | null; date: string | null };

/** 같은 자치구 조서에서 구역의 대표 지번 찾기 — 이름이 꼭 같은 것 먼저, 그다음 품는 것. 같은 급이면 최근 조서 */
export function pickUpisLot(zone: { name: string; sigungu: string }, rows: readonly UpisPlace[]): { dong: string; lot: string; from: string } | null {
  const key = zoneNameKey(zone.name);
  let best: { rank: number; date: string; lot: { dong: string; lot: string }; from: string } | null = null;
  for (const r of rows) {
    if ((r.sigungu ?? "") !== zone.sigungu) continue;
    const how = sameZoneKey(key, zoneNameKey(r.name));
    if (!how) continue;
    const lot = firstLot(r.place);
    if (!lot) continue;
    const rank = how === "eq" ? 2 : 1;
    const date = r.date ?? "";
    if (!best || rank > best.rank || (rank === best.rank && date > best.date)) best = { rank, date, lot, from: r.place ?? "" };
  }
  return best ? { ...best.lot, from: best.from } : null;
}

/** 공표 사업 유형 → 지도 분류. 모르는 유형은 찍지 않는다(null) */
export function nationalTypeKey(projectType: string | null | undefined): ProjectTypeKey | null {
  const t = stripOrdinal(projectType) ?? "";
  if (t.startsWith("재개발")) return "redev";
  if (t.startsWith("재건축(단독")) return "recon_house";
  if (t.startsWith("재건축")) return "recon_apt";
  if (t.startsWith("주거환경개선")) return "env_improve";
  return null;
}

/** 공표 추진 단계 → 지도 단계. 사업시행자지정(신탁 · 공공 방식)은 조합설립과 같은 자리다. 모르는 값은 null(찍지 않는다) */
export function nationalStageKey(stage: string | null | undefined): StageKey | null {
  const t = stripOrdinal(stage) ?? "";
  if (t.includes("정비구역지정")) return "designated";
  if (t.includes("추진위")) return "committee";
  if (t.includes("조합설립") || t.includes("사업시행자지정")) return "union";
  if (t.includes("사업시행인가")) return "plan_approved";
  if (t.includes("관리처분")) return "mgmt_approved";
  if (t.includes("착공")) return "moving";
  if (t.includes("준공")) return "done";
  return null;
}

/** 시도 이름 → 지도 표의 짧은 이름("서울특별시" → "서울") */
export function shortSido(sido: string): string {
  /* [1183] 충청북도 · 충청남도처럼 앞 두 글자가 같은 도는 관용 약칭으로(충북 · 충남 · 전북 · 전남 · 경북 · 경남) */
  const m = /^(충청|전라|경상)(북|남)도$/.exec(sido);
  if (m) return `${m[1][0]}${m[2]}`;
  return sido.replace(/특별자치시|특별자치도|특별시|광역시|도$/g, "").slice(0, 2) || sido;
}

/** [1183] 광역시 · 특별시인가 — 구가 시 바로 아래인 곳 */
export function isMetroSido(sido: string): boolean {
  return /특별시$|광역시$/.test(sido);
}

/** [1183] 공표 시군구("성남중원구" · "군포시" · "금정구") → 주소에서 찾을 조각들. "성남중원구" → ["성남", "중원구"] */
export function sigunguParts(sigungu: string): string[] {
  const t = sigungu.replace(/\s/g, "");
  const m = /^(.{2,3}?)(.{1,3}구)$/.exec(t);
  if (m && !/[시군]$/.test(t) && t.length >= 5) return [m[1], m[2]];
  return [t];
}

/** [1183] 공표 시도 · 시군구 → 단지 좌표 표(complex_geocode)의 지역 이름 열쇠(공백 없이). 광역시는 "부산금정구", 도는 "성남중원구" · "군포시" */
export function complexRegionKey(sido: string, sigungu: string): string {
  const g = sigungu.replace(/\s/g, "");
  return isMetroSido(sido) ? `${shortSido(sido)}${g}` : g;
}

/** [1183] 지도 표에 적을 시군구 — 서울은 그대로("용산구"), 그 밖은 시도 약칭을 붙인다("부산 동구" · "경기 군포시"). 같은 이름 구가 여러 시에 있다 */
export function mapSigungu(sido: string, sigungu: string): string {
  return sido === "서울특별시" ? sigungu : `${shortSido(sido)} ${sigungu}`;
}

export const LOCATE_SOURCE = "국토교통부 전국 도시정비사업 통합 데이터 · 서울 도시계획 결정 조서";

/** 안내창 요약 한 줄 — 공표 단계 · 시행자 · 위치 기준을 적는다(경계가 아님을 숨기지 않는다) */
export function locateSummary(z: { stage: string | null; operator: string | null }): string {
  return [stripOrdinal(z.stage) ? `공표 단계 ${stripOrdinal(z.stage)}` : null, stripOrdinal(z.operator) ? `시행 ${stripOrdinal(z.operator)}` : null, "위치는 대표 지번 기준 · 구역 경계 아님"].filter(Boolean).join(" · ");
}

export type ComplexPoint = { name: string; lat: number; lng: number };

/** [1154] 아파트 이름 재건축 구역("도곡우성아파트") — 조서에 지번이 없으면 **같은 자치구 · 같은 이름 단지 하나**의 좌표를 쓴다.
    같은 이름이 둘 이상이면 고르지 않는다(null). 단지 좌표는 실거래 주소로 지오코딩해 둔 값이다(complex_geocode). */
export function pickComplexPoint(zoneName: string, complexes: readonly ComplexPoint[]): ComplexPoint | null {
  const key = zoneNameKey(zoneName);
  if (key.length < 3) return null;
  const hits = complexes.filter((c) => zoneNameKey(c.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

/** 요약의 위치 기준 글 — 지번 · 단지 */
export function locateSummaryBy(z: { stage: string | null; operator: string | null }, by: "lot" | "complex" | "shape" | "dong"): string {
  const base = locateSummary(z);
  if (by === "dong") return base.replace("위치는 대표 지번 기준 · 구역 경계 아님", "근사 위치 · 법정동 중심 · 구역 경계 아님");
  if (by === "shape") return base.replace("위치는 대표 지번 기준 · 구역 경계 아님", "위치는 구역 경계 중심 기준");
  return by === "lot" ? base : base.replace("위치는 대표 지번 기준", "위치는 같은 이름 단지 기준");
}

/** 지오코더가 돌려준 주소가 그 자치구인가 — 다른 구로 찍힌 답은 버린다 */
export function hitInSigungu(hitAddress: string | null | undefined, sigungu: string): boolean {
  const a = String(hitAddress ?? "").replace(/\s/g, "");
  if (a.includes(sigungu.replace(/\s/g, ""))) return true;
  /* [1183] "성남중원구" ↔ "경기도 성남시 중원구" — 시 이름과 구 이름이 둘 다 있으면 같은 곳 */
  const parts = sigunguParts(sigungu);
  return parts.length === 2 && a.includes(`${parts[0]}시${parts[1]}`);
}


/* [1191] 소유자(2026-11-16) "번호 구역 근사 위치" 승인 — 지번 · 단지 · 경계 도형이 모두 없는 구역("평리2" · "좌천2" · "수색3")은
   이름 앞 한글 동 이름의 법정동 중심에 "근사 위치"로 찍는다. 동 이름으로 읽히지 않으면 null(찍지 않는다). */
const DONG_STRIP = /(주택)?(재개발|재건축|재정비촉진|도시환경|도시정비|정비사업|정비구역|주거환경개선|촉진|구역|지구|사업)/g;
const NOT_DONG = new Set(["시민공원", "신도시", "역세권", "주변", "일원", "일대", "통합", "아파트", "연립", "주공", "시영", "도심"]);
export function dongCandidates(zoneName: string, sigungu: string): string[] {
  const raw = String(zoneName ?? "").replace(/\(.*?\)/g, "").replace(DONG_STRIP, " ").trim();
  /* 앞쪽 한글 덩어리 — 뒤에 숫자 · "제" · 하이픈 · 공백이 오거나 이름 끝 */
  const m = /^([가-힣]{2,6}?)(?:제?\d|-|\s|$)/.exec(raw) ?? /^([가-힣]{2,6}?(?:동|리|가))(?:\d|\s|$)/.exec(raw);
  if (!m) return [];
  let t = m[1];
  if (t.endsWith("제") && t.length > 2) t = t.slice(0, -1);
  if (NOT_DONG.has(t)) return [];
  const gu = String(sigungu ?? "").replace(/(특별자치)?(시|군|구)$/g, "");
  if (t === gu || sigungu.includes(t)) return [];
  if (t.length >= 3 && /(동|리|가)$/.test(t)) return [t];
  return [`${t}동`, `${t}리`];
}

/** 지오코더 답이 그 동인가 — 주소 안에 동 이름이 한 단어로 있어야 한다("좌천동" ⊂ "부산광역시 동구 좌천동") */
export function hitIsDong(hitAddress: string | null | undefined, dong: string): boolean {
  const words = String(hitAddress ?? "").split(/\s+/);
  return words.includes(dong);
}
