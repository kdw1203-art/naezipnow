import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { decisionFromMetadata, decisionLabel } from "@/lib/inspection/decision";
import { normalizeComplexName } from "@/lib/complex/master-match";
import type { ComplexNotesBrief } from "@/lib/complex/complex-facts";

/* [1006 · B] 지도 단지 패널용 임장노트 요약 — 공개 노트 수 + 최신 1건(제목·판단).
 *
 * 조회 규칙은 /api/map/complex-notes · app/complex/[id]/section-loaders(readInspectionNotes)
 * 와 같다: metadata.complexId 가 정규 키(여러 id 형태를 한꺼번에 본다 — 지도는 name-id,
 * 허브는 kapt 매칭 시 kapt.* 로 노트를 쓴다), 0건이면 apt_name 정규화 일치로 폴백한다.
 * 폴백에서는 **지역까지 일치**해야 센다 — "현대아파트" 는 전국에 있다.
 *
 * 판단은 metadata.decision 에서만 꺼낸다(lib/inspection/decision.ts). 없으면 null —
 * 점수 평균 같은 것으로 판단을 지어내지 않는다.
 *
 * 없음은 { count: 0, latest: null }, 못 읽음은 throw — 호출부가 sideFailures 로 구분한다. */

type Row = {
  id: string;
  title: string | null;
  visit_date: string | null;
  region: string | null;
  apt_name: string | null;
  decision: unknown;
};

const SELECT = "id, title, visit_date, region, apt_name, decision:metadata->decision";

function toBrief(rows: Row[], count: number): ComplexNotesBrief {
  const top = rows[0];
  if (!top) return { count: 0, latest: null };
  const dec = decisionFromMetadata({ decision: top.decision });
  return {
    count,
    latest: {
      id: String(top.id),
      title: String(top.title ?? "임장노트"),
      visitDate: top.visit_date ? String(top.visit_date).slice(0, 10) : null,
      decision: dec ? { choice: dec.choice, label: decisionLabel(dec.choice) } : null,
    },
  };
}

/** 노트 region("서울 송파구", "송파구 잠실동")이 이 단지 지역과 겹치는가 — 자치구 토큰 포함으로 본다 */
function regionMatches(noteRegion: string | null, city: string, district: string): boolean {
  const r = (noteRegion ?? "").replace(/\s+/g, "");
  if (!r) return false;
  const d = district.replace(/\s+/g, "");
  const c = city.replace(/\s+/g, "");
  /* 자치구가 따로 있으면("서울"+"송파구") 자치구가 기준, 아니면("광명시" 하나) 그 이름이 기준 */
  const key = d && d !== c ? d : c;
  return Boolean(key) && r.includes(key);
}

export async function getComplexNotesBrief(args: {
  /** 이 단지를 가리킬 수 있는 id 들(name-id·kapt id·canonical) — 중복은 걸러진다 */
  complexIds: string[];
  name: string;
  city: string;
  district: string;
}): Promise<ComplexNotesBrief | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const ids = [...new Set(args.complexIds.map((v) => v.trim()).filter(Boolean))];

  if (ids.length > 0) {
    const { data, error, count } = await sb
      .from("inspection_notes")
      .select(SELECT, { count: "exact" })
      .in("metadata->>complexId", ids)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`inspection_notes(단지 요약, id) 조회 실패: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    if (rows.length > 0) return toBrief(rows, count ?? rows.length);
  }

  /* 옛 노트에는 metadata.complexId 가 없다 — 이름으로 한 번 더 찾되 지역까지 맞아야 센다 */
  const core = normalizeComplexName(args.name).replace(/[%_]/g, "");
  if (core.length < 2) return { count: 0, latest: null };
  const { data, error } = await sb
    .from("inspection_notes")
    .select(SELECT)
    .ilike("apt_name", `%${core}%`)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`inspection_notes(단지 요약, 이름) 조회 실패: ${error.message}`);
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) =>
      normalizeComplexName(String(r.apt_name ?? "")) === core &&
      regionMatches(r.region, args.city, args.district),
  );
  return toBrief(rows, rows.length);
}
