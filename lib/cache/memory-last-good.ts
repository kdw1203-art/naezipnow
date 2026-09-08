/**
 * 인스턴스 메모리에 두는 "마지막 정상본" — DB 를 한 번도 더 건드리지 않는 폴백 층.
 *
 * ── 왜 (2026-09-08 실측) ────────────────────────────────────────────────────
 * 967 에서 붙인 정상본 폴백은 public_data_cache(=같은 Postgres)를 읽는다. 그런데
 * 그 폴백이 필요한 순간은 **DB 가 밀려서 본 조회가 죽었을 때**다. 그때는 폴백
 * 조회도 같은 연결 풀에서 같은 대기를 하다 같이 죽는다. 그래서 967 이후에도
 * `analysis-public-preview-v1 … TimeoutError` 가 그대로 남았다
 * (최근 7일 477건 · 사용자 189명).
 *
 * 이 층은 **이 인스턴스가 직접 성공했던 값**만 들고 있다가 먼저 낸다.
 *  · 왕복 0회 — 포화 상태에서 확실히 뜬다.
 *  · 자기가 읽어 본 적 없는 값은 절대 내지 않는다.
 *  · 서버리스라 인스턴스가 식으면 사라진다. 그건 결함이 아니라 성격이다 —
 *    식은 인스턴스는 DB 정상본 → 실패 순으로 내려간다.
 *
 * **모두에게 같은 공개 데이터에만 쓴다.** 사용자별 값은 인스턴스가 재사용되므로
 * 다른 사람에게 샐 수 있다 — 그런 값은 이 층에 올리지 않는다.
 *
 * 시각은 인자로 받는다 — 그래야 단위검증이 시계를 흔들 수 있다.
 */

export type MemoryLastGood<T> = {
  value: T;
  /** 성공 시각(ISO) */
  fetchedAt: string;
};

export class MemoryLastGoodStore<T> {
  private readonly entries = new Map<string, MemoryLastGood<T>>();
  /* 생성자 파라미터 프로퍼티(`private readonly maxAgeMs: number`)를 쓰지 않는다 —
     단위검증이 node --experimental-strip-types 로 돌아서 그 문법을 못 읽는다. */
  private readonly maxAgeMs: number;

  constructor(maxAgeMs: number) {
    this.maxAgeMs = maxAgeMs;
  }

  /** 성공한 값을 남긴다. 같은 키의 이전 값은 덮어쓴다. */
  save(key: string, value: T, now: number = Date.now()): void {
    this.entries.set(key, { value, fetchedAt: new Date(now).toISOString() });
  }

  /** 창 안의 정상본. 창을 벗어났으면 지우고 null — 낡은 값을 계속 들고 있지 않는다. */
  read(key: string, now: number = Date.now()): MemoryLastGood<T> | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    const age = now - Date.parse(hit.fetchedAt);
    if (!Number.isFinite(age) || age < 0 || age > this.maxAgeMs) {
      this.entries.delete(key);
      return null;
    }
    return hit;
  }

  /** 테스트·강제 무효화용. */
  clear(): void {
    this.entries.clear();
  }
}
