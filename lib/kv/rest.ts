/**
 * [1080] 공용 KV(Redis REST) 클라이언트 — 한 곳.
 *
 * 왜: 속도 제한(lib/rate-limit)이 Upstash REST 를 **인라인으로 두 번** 들고 있었고, 운영에는
 * `UPSTASH_REDIS_REST_URL` 이 없어 전부 프로세스 메모리로 떨어져 있었다(인스턴스마다 따로 세고 콜드
 * 스타트마다 0). 운영에 이미 있는 Vercel KV 변수(`KV_REST_API_URL`·`KV_REST_API_TOKEN` — Upstash 와 같은
 * REST 규약)를 코드가 보지 않았다. 여기서 두 이름을 모두 읽고, 속도 제한·AI 일일 상한·썸네일 캐시·
 * 조회수 버퍼·길찾기 캐시가 같은 클라이언트를 쓴다.
 *
 * 규칙: 실패는 조용히 null/undefined 로 — 판단(fail-open/closed)은 호출자가 한다. 값은 로그에 남기지 않는다.
 * 변수가 없으면 `kvAvailable()` 이 false — 호출자는 종전 메모리/직접 경로로 간다.
 */

export type KvCommand = Array<string | number>;

const DEFAULT_TIMEOUT_MS = 2500;

export function kvConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function kvAvailable(): boolean {
  return kvConfig() !== null;
}

/** 파이프라인 한 번 — 결과 배열(명령 순서대로). 백엔드 실패·미설정이면 null */
export async function kvPipeline(commands: KvCommand[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown[] | null> {
  const cfg = kvConfig();
  if (!cfg || commands.length === 0) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(json) || json.length !== commands.length) return null;
    if (json.some((r) => typeof r?.error === "string")) return null;
    return json.map((r) => r.result ?? null);
  } catch {
    return null;
  }
}

/** GET — 없으면 null · 백엔드 실패/미설정이면 undefined */
export async function kvGet(key: string): Promise<string | null | undefined> {
  const r = await kvPipeline([["GET", key]]);
  if (!r) return undefined;
  const v = r[0];
  return v === null || v === undefined ? null : String(v);
}

/** SET(선택 EX 초) — 성공 true */
export async function kvSet(key: string, value: string, exSeconds?: number): Promise<boolean> {
  const cmd: KvCommand = exSeconds && exSeconds > 0 ? ["SET", key, value, "EX", Math.ceil(exSeconds)] : ["SET", key, value];
  const r = await kvPipeline([cmd]);
  return Boolean(r && r[0] === "OK");
}

/**
 * 고정 창 카운터 — INCR 하고 **첫 증가일 때만** 만료를 건다(창이 미끄러지지 않는다).
 * 돌려주는 값은 창 안의 누적 횟수. 백엔드 실패/미설정이면 null.
 */
export async function kvIncrWindow(key: string, windowSeconds: number): Promise<number | null> {
  const r = await kvPipeline([["INCR", key]]);
  if (!r) return null;
  const count = Number(r[0]);
  if (!Number.isFinite(count)) return null;
  if (count === 1) await kvPipeline([["EXPIRE", key, Math.max(1, Math.ceil(windowSeconds))]]);
  return count;
}

/** INCRBY(만료는 첫 증가일 때만) — 조회수 버퍼용 */
export async function kvIncrBy(key: string, by: number, windowSeconds: number): Promise<number | null> {
  const r = await kvPipeline([["INCRBY", key, Math.max(1, Math.floor(by))]]);
  if (!r) return null;
  const count = Number(r[0]);
  if (!Number.isFinite(count)) return null;
  if (count === by) await kvPipeline([["EXPIRE", key, Math.max(1, Math.ceil(windowSeconds))]]);
  return count;
}

/** GETDEL — 값을 읽고 지운다(버퍼 비우기). 없으면 null · 실패면 undefined */
export async function kvGetDel(key: string): Promise<string | null | undefined> {
  const r = await kvPipeline([["GETDEL", key]]);
  if (!r) return undefined;
  const v = r[0];
  return v === null || v === undefined ? null : String(v);
}

/** SCAN 으로 패턴에 맞는 키 전부(상한 maxKeys) — 실패면 null */
export async function kvScanKeys(match: string, maxKeys = 5000): Promise<string[] | null> {
  const out: string[] = [];
  let cursor = "0";
  for (let i = 0; i < 100; i += 1) {
    const r = await kvPipeline([["SCAN", cursor, "MATCH", match, "COUNT", 500]]);
    if (!r) return null;
    const pair = r[0] as [string, string[]] | null;
    if (!pair || !Array.isArray(pair) || !Array.isArray(pair[1])) return null;
    out.push(...pair[1].map(String));
    cursor = String(pair[0]);
    if (cursor === "0" || out.length >= maxKeys) break;
  }
  return out.slice(0, maxKeys);
}

export async function kvDel(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const r = await kvPipeline([["DEL", ...keys]]);
  return r !== null;
}

/** 한국 시간 기준 날짜 키(YYYYMMDD) — 일일 상한은 한국 하루로 센다 */
export function kstDayKey(now: number = Date.now()): string {
  const d = new Date(now + 9 * 3600_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
