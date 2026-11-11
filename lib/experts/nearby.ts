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
  /* [1144 · 전문가 홍보] 등록일(무료 100일 기준) · 소유자 요금제 · 홍보 글. 열 추가(sql 213) 전이면 홍보 글은 비어 있다 */
  createdAt: string | null;
  plan: string | null;
  planExpiresAt: string | null;
  promoOn: boolean;
  promoHeadline: string | null;
  promoBody: string | null;
  brokerNo: string | null;
};

export const listVerifiedExpertsCached = unstable_cache(
  async (): Promise<VerifiedExpertLite[]> => {
    const sb = getServiceSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("expert_profiles")
      .select("*")
      .eq("is_verified", true)
      .limit(500);
    if (error) throw new Error(`인증 전문가 조회 실패: ${error.message}`);
    /* [1144] 소유자 요금제 — 홍보는 무료 100일 뒤로는 프로 구독 중일 때만. 못 읽으면 요금제 모름(무료 기간만 본다) */
    const owners = [...new Set(((data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.owner_email ?? "").toLowerCase()).filter(Boolean))];
    const planBy = new Map<string, { plan: string | null; exp: string | null }>();
    if (owners.length > 0) {
      const u = await sb.from("app_users").select("email, plan, plan_expires_at").in("email", owners);
      if (!u.error) for (const r of (u.data ?? []) as Array<Record<string, unknown>>) planBy.set(String(r.email).toLowerCase(), { plan: r.plan ? String(r.plan) : null, exp: r.plan_expires_at ? String(r.plan_expires_at) : null });
    }
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      createdAt: s(r.created_at),
      plan: planBy.get(String(r.owner_email ?? "").toLowerCase())?.plan ?? null,
      planExpiresAt: planBy.get(String(r.owner_email ?? "").toLowerCase())?.exp ?? null,
      promoOn: r.promo_on !== false,
      promoHeadline: s(r.promo_headline),
      promoBody: s(r.promo_body),
      brokerNo: s(r.broker_registration_no),
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
  ["verified-experts-lite-v2"],
  { revalidate: 604_800, tags: ["verified-experts"] },
);
