/**
 * [1047] 단지 화면 "이 지역 인증 전문가" 고르기 — 순수(단위 시험 대상).
 * 활동 지역 문자열(예: "서울특별시 송파구")에 단지의 구 이름이 들어 있으면 2점, 시·도만 맞으면 1점.
 * 시·도 비교는 앞 두 글자(서울특별시 ↔ 서울). 0점은 빼고, 점수 → 후기 수 → 이름 순으로 limit 명.
 */
export type NearbyCandidate = { id: string; name: string; regions: string[]; reviews: number };

export function nearbyScore(regions: string[], sigungu: string, city: string): number {
  const gu = sigungu.trim();
  const sido = city.trim().slice(0, 2);
  let best = 0;
  for (const raw of regions) {
    const r = raw.trim();
    if (!r) continue;
    if (gu && r.split(/[\s·]+/).includes(gu)) return 2;
    if (sido && r.slice(0, 2) === sido) best = Math.max(best, 1);
  }
  return best;
}

export function pickNearbyExperts<T extends NearbyCandidate>(all: T[], sigungu: string, city: string, limit = 3): T[] {
  return all
    .map((e) => ({ e, s: nearbyScore(e.regions, sigungu, city) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.reviews - a.e.reviews || a.e.name.localeCompare(b.e.name, "ko"))
    .slice(0, Math.max(0, limit))
    .map((x) => x.e);
}
