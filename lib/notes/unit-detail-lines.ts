/* [1032] 임장한 타입 · 세부 기록의 **표시 줄** — 돈 표기(formatKrwManwon)를 쓰므로 본 모듈(unit-detail)과 나눴다:
   본 모듈은 /notes/new 첫 로드(NoteForm)에 실리고, 이 파일은 지연 조각(NoteUnitPick)과 노트 상세(서버)만 부른다. */
import { formatKrwManwon } from "@/lib/format/krw";
import { FIELD_CHOICE_GROUPS, FIELD_NUMBER_GROUPS, type FieldDetail, type UnitType } from "@/lib/notes/unit-detail";

/** 칩 아래 줄 — "최근 8.2억 · 2026.08 · 12건 · 3~24층"(있는 것만) */
export function unitTypeSubline(t: UnitType): string {
  const parts = [`최근 ${formatKrwManwon(t.latestManwon, { style: "eok1" })}`, `${t.latestYm.slice(0, 4)}.${t.latestYm.slice(4, 6)}`];
  parts.push(`${t.count.toLocaleString("ko-KR")}건`);
  if (t.floorMin != null && t.floorMax != null) parts.push(t.floorMin === t.floorMax ? `${t.floorMin}층` : `${t.floorMin}~${t.floorMax}층`);
  return parts.join(" · ");
}

/** 상세 화면 줄 — [["도로 소음","약간"],["지하철 도보","7분"],…] 있는 것만 */
export function fieldDetailLines(d: FieldDetail): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const g of FIELD_CHOICE_GROUPS) if (d[g.key]) out.push([g.label, d[g.key] as string]);
  for (const g of FIELD_NUMBER_GROUPS) {
    const v = d[g.key];
    if (typeof v !== "number") continue;
    let text = g.key === "askingManwon" ? formatKrwManwon(v, { style: "eok1" }) : `${v}${g.unit}`;
    /* [1033] 역 이름은 지하철 도보 줄에 붙는다 — "7분(송파역)". 분이 없고 역만 있으면 따로 한 줄 */
    if (g.key === "subwayWalkMin" && d.nearestStation) text += `(${d.nearestStation})`;
    out.push([g.label, text]);
  }
  if (d.nearestStation && typeof d.subwayWalkMin !== "number") out.push(["가까운 역", d.nearestStation]);
  if (d.heard) out.push(["들은 말", d.heard]);
  return out;
}

