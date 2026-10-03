/* [1028] 공매 목록의 지역 요약 — 순수 함수(클라이언트·테스트 공용 · server-only 아님).
   시군구 이름만으로 묶으면 다른 도시의 같은 이름이 한 줄로 합쳐진다 — 시도 + 시군구로 묶는다
   (2026-10-03 운영 진행 물건: 강서구 2개 시도 · 중구 5 · 동구 4 · 북구 3 · 서구 3 · 남구 3). */

/** 시도 짧은 표기 — "대전광역시" → "대전" · "경기도" → "경기" · "충청북도" → "충북" · "강원특별자치도" → "강원" */
export function sidoShort(sido: string | null | undefined): string {
  const s = (sido ?? "").trim();
  if (!s) return "";
  const cut = s.replace(/(특별자치시|특별자치도|특별시|광역시)$/, "");
  if (cut !== s) return cut;
  const m = /^(충청|전라|경상)(북|남)도$/.exec(s);
  if (m) return `${m[1][0]}${m[2]}`;
  return s.replace(/도$/, "");
}

export type SigunguCount = {
  /** 화면 표기 — "대전 유성구" */
  name: string;
  /** 시도 원문("대전광역시") — 걸러 보기 조건으로 그대로 보낸다 */
  sido: string | null;
  /** 시군구 원문("유성구") */
  gu: string;
  count: number;
};

/** 받은 목록을 시도 + 시군구로 세어 많은 순 상위 limit 줄 */
export function sigunguDistribution(
  items: readonly { sido: string | null; sigungu: string | null }[],
  limit = 6,
): SigunguCount[] {
  const map = new Map<string, SigunguCount>();
  for (const it of items) {
    const gu = it.sigungu?.trim();
    if (!gu) continue;
    const sido = it.sido?.trim() || null;
    const key = `${sido ?? ""}|${gu}`;
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { name: [sidoShort(sido), gu].filter(Boolean).join(" "), sido, gu, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
