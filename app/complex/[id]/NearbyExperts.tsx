import Link from "next/link";
import { ExpertBadge } from "@/app/components/ExpertBadge";
import { listVerifiedExpertsCached } from "@/lib/experts/nearby";
import { pickNearbyExperts } from "@/lib/experts/nearby-pick";
import { logSectionFailure } from "./section-loaders";

/* [1047] 이 지역 인증 전문가 — 소유자 지시(2026-10-09) "숨고처럼 전문가 홍보". 단지 소재 구에서 활동하는
   **관리자 승인** 전문가만 최대 3명. 없으면 섹션 자체를 그리지 않는다(빈 칸·모집 문구를 단지 화면에 깔지 않는다).
   곁다리 섹션이라 실패하면 접고 로그만 남긴다(NearbyRedevelopment 와 같은 태도). */
export async function NearbyExperts({ sigungu, city = "" }: { sigungu: string; city?: string | null }) {
  const gu = sigungu.trim();
  if (!gu) return null;
  const all = await listVerifiedExpertsCached().catch((e: unknown) => {
    logSectionFailure(`[NearbyExperts] ${gu} 인증 전문가(섹션을 접습니다)`, e);
    return [];
  });
  const picked = pickNearbyExperts(all, gu, city ?? "", 3);
  if (picked.length === 0) return null;
  return (
    <section className="cv-auto rise-in-5 mt-6 max-md:mt-3" aria-labelledby="nearby-experts-title">
      <h2 id="nearby-experts-title" className="mb-2 px-1 t-section text-ink">
        이 지역 인증 전문가 <span className="t-sub font-medium text-text-3">{gu}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {picked.map((e) => (
          <li key={e.id} className="card flex flex-col gap-1 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/town/experts/${e.id}`} className="t-body font-bold text-ink no-underline hover:text-primary">
                {e.name}
              </Link>
              <ExpertBadge badge={{ expertId: e.id, text: e.badgeText }} link={false} />
            </div>
            <div className="t-caption text-text-2">
              {[e.organization, e.regions.slice(0, 2).join("·")].filter(Boolean).join(" · ")}
            </div>
            {e.specialties.length > 0 && <div className="t-caption text-text-3">{e.specialties.slice(0, 3).join(" · ")}</div>}
          </li>
        ))}
      </ul>
      <Link href="/town/experts" className="mt-2 inline-block px-1 t-body font-bold text-primary">
        전문가 전체 보기 →
      </Link>
    </section>
  );
}
