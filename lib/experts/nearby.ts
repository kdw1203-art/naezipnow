import "server-only";

import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { expertBadgeText } from "@/lib/experts/taxonomy";

/**
 * [1047] 단지 화면의 "이 지역 인증 전문가" — 숨고식 홍보의 노출 자리(유입의 46%가 단지 화면으로 착지한다).
 * 인증(관리자 승인) 전문가만 · 활동 지역에 그 구(또는 시)가 들어 있는 사람만 · 최대 3명.
 * 인증 전문가 목록은 한 시간 캐시(단지 화면 수만 장이 렌더마다 DB 를 치지 않게). 승인 직후 반영은 최대 한 시간 늦다.
 * [1089 · 비용] 한 시간 → 7일. 이 캐시의 revalidate 가 단지 화면(ISR 7일)의 실제 수명을 한 시간으로 끌어내리고 있었다
 * (Next: 렌더 중 읽은 캐시 revalidate 의 최솟값 · 로컬 빌드 실측 s-maxage=3600). 승인은 관리자 화면이
 * revalidateTag("verified-experts") 로 바로 비운다(app/api/admin/experts). 전문가 본인의 소개 수정(이름 · 활동 지역)은
 * 단지 화면에 최대 7일 늦게 닿는다 — 그 때문에 단지 2.4만 쪽을 통째로 비우지는 않는다.
 * 고르는 규칙은 pickNearbyExperts(순수, lib/experts/nearby-pick.ts).
 */
export type VerifiedExpertLite = {
  id: string;
  name: string;
  category: string;
  regions: string[];
  organization: string | null;
  specialties: string[];
  reviews: number;
  badgeText: string;
};

export const listVerifiedExpertsCached = unstable_cache(
  async (): Promise<VerifiedExpertLite[]> => {
    const sb = getServiceSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("expert_profiles")
      .select("id, name, category, regions, organization, specialties, reviews")
      .eq("is_verified", true)
      .limit(500);
    if (error) throw new Error(`인증 전문가 조회 실패: ${error.message}`);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      regions: Array.isArray(r.regions) ? (r.regions as string[]).map(String) : [],
      organization: r.organization ? String(r.organization) : null,
      specialties: Array.isArray(r.specialties) ? (r.specialties as string[]).map(String) : [],
      reviews: Number(r.reviews ?? 0),
      badgeText: expertBadgeText(r.category ? String(r.category) : null),
    }));
  },
  ["verified-experts-lite-v1"],
  { revalidate: 604_800, tags: ["verified-experts"] },
);
