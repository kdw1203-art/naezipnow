/**
 * [1080] 조회수 버퍼 — 글을 볼 때마다 DB 에 "읽고 +1 쓰기" 하던 것을 KV 에 모았다가 시간 단위로 반영한다.
 *
 * 왜: 매물 상세는 force-dynamic 이라 렌더마다(크롤러 포함) DB 읽기 1 + 쓰기 1 이 났고, 개발물건 핑은 속도 제한조차
 * 없었다. 동시에 열면 "읽고 +1" 이 서로 덮어 카운트도 샌다. 버퍼에 모으면 쓰기는 "글당 시간당 1회"가 되고,
 * 합산은 KV 의 INCRBY 라 유실이 없다.
 *
 * KV 가 없으면 `bufferView` 가 "unavailable" 을 돌려주고 호출부가 종전 직접 +1 로 간다(기능은 그대로).
 * 반영은 app/api/cron/view-count-flush — GETDEL 로 꺼내 DB 에 더하고, 실패하면 꺼낸 수를 버퍼에 되돌린다.
 */
import { kvAvailable, kvGetDel, kvIncrBy, kvScanKeys } from "@/lib/kv/rest";

export type ViewKind = "listing" | "deal";

const PREFIX = "views:v1:";
/** 버퍼 키 수명 — 반영 크론(시간 1회)이 멈춰도 7일은 잃지 않는다 */
const TTL_SECONDS = 7 * 24 * 3600;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export function viewBufferKey(kind: ViewKind, id: string): string {
  return `${PREFIX}${kind}:${id}`;
}

export function parseViewBufferKey(key: string): { kind: ViewKind; id: string } | null {
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const kind = rest.slice(0, sep);
  const id = rest.slice(sep + 1);
  if ((kind !== "listing" && kind !== "deal") || !ID_RE.test(id)) return null;
  return { kind, id };
}

/** 조회 1건을 버퍼에 — KV 없음/실패면 "unavailable"(호출부가 직접 +1) */
export async function bufferView(kind: ViewKind, id: string): Promise<"buffered" | "unavailable"> {
  if (!ID_RE.test(id) || !kvAvailable()) return "unavailable";
  const n = await kvIncrBy(viewBufferKey(kind, id), 1, TTL_SECONDS);
  return n === null ? "unavailable" : "buffered";
}

export type FlushResult = { keys: number; applied: number; failed: number; views: number };

/**
 * 버퍼를 비우며 `apply(kind, id, n)` 를 부른다. apply 가 false/예외면 n 을 버퍼에 되돌린다(다음 시간에 다시).
 * KV 없음/SCAN 실패면 keys:0.
 */
export async function flushViewBuffer(
  apply: (kind: ViewKind, id: string, n: number) => Promise<boolean>,
  maxKeys = 2000,
): Promise<FlushResult> {
  const out: FlushResult = { keys: 0, applied: 0, failed: 0, views: 0 };
  if (!kvAvailable()) return out;
  const keys = await kvScanKeys(`${PREFIX}*`, maxKeys);
  if (!keys) return out;
  out.keys = keys.length;
  for (const key of keys) {
    const parsed = parseViewBufferKey(key);
    if (!parsed) continue;
    const raw = await kvGetDel(key);
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) continue;
    let ok = false;
    try {
      ok = await apply(parsed.kind, parsed.id, Math.floor(n));
    } catch {
      ok = false;
    }
    if (ok) {
      out.applied += 1;
      out.views += Math.floor(n);
    } else {
      out.failed += 1;
      await kvIncrBy(key, Math.floor(n), TTL_SECONDS); // 되돌린다 — 다음 반영 때 다시
    }
  }
  return out;
}
