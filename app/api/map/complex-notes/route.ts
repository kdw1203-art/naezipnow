/**
 * GET /api/map/complex-notes?name=단지명&complexId=id
 *
 * 지도 단지 패널 "노트" 탭 — 그 단지의 실제 공개 임장노트 목록.
 * complexId(metadata) 우선, 없으면 apt_name 정규화 매칭.
 * 세션이 있으면 내 노트(비공개 포함)도 함께 세어 mineCount 로 내려준다.
 */
import { NextResponse } from "next/server";
import { noteCoverUrl } from "@/lib/notes/cover/resolve";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ComplexNoteItem {
  id: string;
  title: string;
  visitDate: string | null;
  region: string | null;
  mine: boolean;
}

/** 단지명 정규화 — 공백 제거 + 후행 "아파트" 제거 (complex-store 와 동일 기준) */
function normalizeName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

function mapRows(
  data: Array<Record<string, unknown>>,
  myEmail: string | null,
): { notes: ComplexNoteItem[]; mineCount: number } {
  const notes: ComplexNoteItem[] = data.slice(0, 10).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? "임장노트"),
    visitDate: r.visit_date ? String(r.visit_date).slice(0, 10) : null,
    region: r.region ? String(r.region) : null,
    mine: myEmail != null && String(r.author_email ?? "").toLowerCase() === myEmail,
    /* [1015 · 썸네일] 비공개(내) 노트의 템플릿 썸네일 주소도 작성자 본인에게만 내려간다(렌더 라우트가 소유자 확인) */
    cover: noteCoverUrl({
      id: String(r.id),
      title: (r.title as string | null) ?? null,
      aptName: (r.apt_name as string | null) ?? null,
      region: (r.region as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      sections: r.sections,
      checklist: r.checklist,
      transportation: (r.transportation as string | null) ?? null,
      weather: (r.weather as string | null) ?? null,
      scores: {
        location: Number(r.score_location ?? 0),
        school: Number(r.score_school ?? 0),
        transport: Number(r.score_transport ?? 0),
        facility: Number(r.score_facility ?? 0),
        future: Number(r.score_future ?? 0),
      },
      metadata: r.metadata,
      photos: r.photos,
    }),
  }));
  const mineCount = data.filter(
    (r) => myEmail != null && String(r.author_email ?? "").toLowerCase() === myEmail,
  ).length;
  return { notes, mineCount };
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const complexId = url.searchParams.get("complexId")?.trim() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!complexId && !name) {
    return NextResponse.json({ error: "name or complexId is required" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ notes: [], mineCount: 0 });

  const session = await auth().catch(() => null);
  const myEmail = session?.user?.email?.toLowerCase() ?? null;

  try {
    /* 1) complexId — 정규 키. 표기 다른 apt_name 끼리도 같은 단지로 묶인다. */
    if (complexId) {
      let q = sb
        .from("inspection_notes")
        .select("id, title, apt_name, region, visit_date, is_public, author_email, metadata, summary, sections, checklist, transportation, weather, score_location, score_school, score_transport, score_facility, score_future, photos")
        .filter("metadata->>complexId", "eq", complexId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (myEmail) {
        q = q.or(`is_public.eq.true,author_email.eq.${myEmail.replace(/[,()]/g, "")}`);
      } else {
        q = q.eq("is_public", true);
      }
      const { data, error } = await q;
      if (error) throw error;
      const byId = (data ?? []) as Array<Record<string, unknown>>;
      if (byId.length > 0) {
        return NextResponse.json(mapRows(byId, myEmail));
      }
      /* complexId 결과 0건이면 name 폴백 — 옛 노트에 metadata.complexId 가 없을 수 있다 */
      if (!name) {
        return NextResponse.json({ notes: [], mineCount: 0 });
      }
    }

    const core = normalizeName(name).replace(/[%_]/g, "");
    if (core.length < 2) {
      return NextResponse.json({ notes: [], mineCount: 0 });
    }

    let q = sb
      .from("inspection_notes")
      .select("id, title, apt_name, region, visit_date, is_public, author_email, metadata, summary, sections, checklist, transportation, weather, score_location, score_school, score_transport, score_facility, score_future, photos")
      .ilike("apt_name", `%${core}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (myEmail) {
      q = q.or(`is_public.eq.true,author_email.eq.${myEmail.replace(/[,()]/g, "")}`);
    } else {
      q = q.eq("is_public", true);
    }
    const { data, error } = await q;
    if (error) throw error;

    const target = core;
    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((r) => {
      const apt = normalizeName(String(r.apt_name ?? ""));
      return apt.length > 0 && (apt.includes(target) || target.includes(apt));
    });

    return NextResponse.json(mapRows(rows, myEmail));
  } catch {
    return NextResponse.json({ error: "notes lookup failed" }, { status: 500 });
  }
}
