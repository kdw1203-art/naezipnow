/**
 * [1002] 최근 본 단지 — 같은 단지 중복 제거(순수, 클라이언트·서버 어디서든).
 *
 * 소유자 화면에 "공작아파트"가 두 번 떴다. 같은 단지인데 id 가 달랐다 — 예전 이름
 * 기반 id 로 본 기록과 새 kapt 기반 id 로 본 기록이 각각 한 칸씩 차지한 것이다.
 * id 로만 중복을 지우면 이 둘은 영원히 다른 단지다. 그래서 id 와 별개로
 * **지역 + 정규화한 이름**을 두 번째 키로 두고, 겹치면 최근 방문(at 큰 쪽)만 남긴다.
 *
 * 왜 이름만으로 안 묶나: 같은 이름의 단지가 다른 동네에 흔하다("현대아파트").
 * 두 번째 키는 **이름 id ↔ kapt id** 짝에만 쓴다. region 은 시군구라 같은 구 안에
 * 동명 단지가 둘일 수 있는데, 그 둘은 kapt id 가 서로 다르다 — kapt id 끼리는 절대
 * 합치지 않는다(그걸 가르려고 kapt id 를 도입했다). region 이 빈 기록도 합치지 않는다.
 *
 * 이 파일이 app/components/RecentComplexes.tsx 밖에 있는 이유: 그 모듈은
 * "use client" + JSX 라 node:test 가 그대로 못 부른다(타입 스트리핑은 JSX 를 모른다).
 */

export interface RecentComplexLike {
  id: string;
  name: string;
  region?: string | null;
  /** 마지막 방문 시각 (epoch ms) */
  at: number;
}

/** kapt 기반 id(`kapt.<코드>`) — lib/complex/complex-store.ts KAPT_COMPLEX_ID_PREFIX 와 같은 접두 */
export function isKaptId(id: string): boolean {
  return id.startsWith("kapt.");
}

/** 중복 판정 키 — `${region}|${name}` (앞뒤 공백 제거, 연속 공백 1칸). */
export function recentComplexKey(r: { name: string; region?: string | null }): string {
  const region = (r.region ?? "").trim();
  const name = r.name.trim().replace(/\s+/g, " ");
  return `${region}|${name}`;
}

/**
 * id 중복과 (지역+이름) 중복을 모두 지우고 최신순으로 최대 max 개.
 * 같은 키끼리는 `at` 이 큰 기록이 남는다(id 도 그 기록의 것 — 최근에 본 주소가 살아남는다).
 * 입력 배열은 바꾸지 않는다.
 */
export function dedupeRecents<T extends RecentComplexLike>(list: readonly T[], max: number): T[] {
  const byId = new Map<string, T>();
  for (const r of list) {
    const prev = byId.get(r.id);
    if (!prev || (r.at ?? 0) > (prev.at ?? 0)) byId.set(r.id, r);
  }
  /* (지역+이름) 병합 — 이름 id 와 kapt id 가 같은 단지를 가리키는 경우만.
     kapt id 둘 · 지역 없는 기록은 합치지 않고 그대로 둔다. */
  const byKey = new Map<string, T>();
  const kept: T[] = [];
  for (const r of byId.values()) {
    const region = (r.region ?? "").trim();
    if (!region) {
      kept.push(r);
      continue;
    }
    const key = recentComplexKey(r);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    if (isKaptId(prev.id) && isKaptId(r.id)) {
      /* 같은 구·같은 이름이지만 다른 kapt 단지 — 별개로 남긴다 */
      kept.push(r);
      continue;
    }
    if ((r.at ?? 0) > (prev.at ?? 0)) byKey.set(key, r);
  }
  return [...byKey.values(), ...kept]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, Math.max(0, max));
}
