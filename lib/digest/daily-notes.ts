import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/* [1194] 일일 다이제스트의 중심 — 지난 하루 새로 공개된 임장노트. 소유자(2026-11-17): "임장노트는 일일 다이제스트로 보내줘".
   실행당 한 번 읽는다. 사진은 표지(cover_image_url) → 첫 사진. 점수는 다섯 항목 평균(적힌 것만). */
export type DailyNote = {
  id: string;
  title: string;
  complex: string | null;
  region: string | null;
  score: number | null;
  summary: string | null;
  imageUrl: string | null;
  author: string | null;
};

const SCORE_KEYS = ["score_location", "score_school", "score_transport", "score_facility", "score_future"] as const;

export function noteScore(r: Record<string, unknown>): number | null {
  const v = SCORE_KEYS.map((k) => Number(r[k])).filter((n) => Number.isFinite(n) && n > 0);
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

export function noteSummaryLine(s: unknown, max = 90): string | null {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function loadDailyNotes(sinceIso: string, limit = 30): Promise<{ total: number; items: DailyNote[] }> {
  const sb = getServiceSupabase();
  if (!sb) return { total: 0, items: [] };
  const { data, error, count } = await sb
    .from("inspection_notes")
    .select(
      "id,title,apt_name,property_name,region,sigungu,public_summary,summary,cover_image_url,photos,author_label,score_location,score_school,score_transport,score_facility,score_future",
      { count: "exact" },
    )
    .eq("is_public", true)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`inspection_notes(일일): ${error.message}`);
  const items = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const photos = Array.isArray(row.photos) ? (row.photos as unknown[]).map(String) : [];
    const img = [row.cover_image_url, photos[0]].map((x) => String(x ?? "").trim()).find((x) => /^https?:\/\//i.test(x)) ?? null;
    return {
      id: String(row.id),
      title: String(row.title ?? "").trim() || "임장노트",
      complex: String(row.apt_name ?? row.property_name ?? "").trim() || null,
      region: String(row.sigungu ?? row.region ?? "").trim() || null,
      score: noteScore(row),
      summary: noteSummaryLine(row.public_summary ?? row.summary),
      imageUrl: img,
      author: String(row.author_label ?? "").trim() || null,
    };
  });
  return { total: count ?? items.length, items };
}
