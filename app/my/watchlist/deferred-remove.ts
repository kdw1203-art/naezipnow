/**
 * [1009 · H 리뷰] 관심 단지 **지연 삭제** 제어기 — 순수 로직(React·DOM 없음, 테스트로 잠근다).
 *
 * 흐름: remove() 는 기다림만 건다(서버에 아직 안 보냄) → delayMs 뒤 DELETE.
 *  · 그 전에 undo() 가 오면 타이머만 취소 — 서버 행(기준가 last_price_krw·담은 날짜 등)이 그대로다.
 *  · flush() — 페이지가 가려지거나 화면을 떠날 때 기다리던 삭제를 **지금** 보낸다(keepalive).
 *  · 보낸 뒤의 undo() — 삭제 결과를 기다렸다가, 지워졌으면 다시 담는다(restore — 새 행이라 기준가는 다음 점검 때).
 *  · 삭제가 실패하면 onDeleteFailed — 화면은 행을 제자리로 돌리고 원인을 알린다.
 * 같은 단지를 기다리는 중에 또 빼면 무시한다(목록에서 이미 빠져 있다).
 */

export type RemovalState = "pending" | "sent" | "undone";

export type Removal<T> = {
  key: string;
  item: T;
  /** 빼기 직전 목록에서의 자리 — 되돌릴 때 그 자리로 */
  index: number;
  state: RemovalState;
  /** 보낸 DELETE 의 결과(성공 true) — 보낸 뒤 되돌리기가 오면 이걸 기다린다 */
  sent: Promise<boolean> | null;
};

export type DeferredRemoverDeps<T> = {
  delayMs: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** 서버 삭제 — 성공이면 true. 실패(5xx·연결 끊김)는 false(던지지 않는다) */
  sendDelete: (key: string, keepalive: boolean) => Promise<boolean>;
  /** 이미 지워진 뒤 되돌리기 — 다시 담기(성공이면 ok) */
  sendRestore: (item: T) => Promise<{ ok: boolean; error?: string }>;
  onDeleteFailed: (r: Removal<T>) => void;
  /** 보내기 전 되돌림 — 서버는 그대로, 화면만 제자리로 */
  onUndoLocal: (r: Removal<T>) => void;
  /** 보낸 뒤 되돌림 — 다시 담았다(새 행) */
  onRestored: (r: Removal<T>) => void;
  onRestoreFailed: (r: Removal<T>, error?: string) => void;
};

export function createDeferredRemover<T>(deps: DeferredRemoverDeps<T>) {
  const pending = new Map<string, { r: Removal<T>; timer: unknown }>();

  function send(r: Removal<T>, keepalive: boolean): Promise<boolean> | null {
    if (r.state !== "pending") return r.sent;
    const entry = pending.get(r.key);
    if (entry && entry.r === r) {
      deps.clearTimer(entry.timer);
      pending.delete(r.key);
    }
    r.state = "sent";
    r.sent = deps
      .sendDelete(r.key, keepalive)
      .catch(() => false)
      .then((ok) => {
        if (!ok) deps.onDeleteFailed(r);
        return ok;
      });
    return r.sent;
  }

  return {
    /** 빼기 — 기다림만 건다. 같은 단지가 이미 기다리는 중이면 null */
    remove(key: string, item: T, index: number): Removal<T> | null {
      if (pending.has(key)) return null;
      const r: Removal<T> = { key, item, index, state: "pending", sent: null };
      const timer = deps.setTimer(() => void send(r, false), deps.delayMs);
      pending.set(key, { r, timer });
      return r;
    },
    /** 되돌리기 — 보내기 전이면 취소, 보낸 뒤면 결과를 기다렸다가 다시 담는다 */
    async undo(r: Removal<T>): Promise<void> {
      if (r.state === "undone") return;
      if (r.state === "pending") {
        const entry = pending.get(r.key);
        if (entry && entry.r === r) {
          deps.clearTimer(entry.timer);
          pending.delete(r.key);
        }
        r.state = "undone";
        deps.onUndoLocal(r);
        return;
      }
      const ok = await (r.sent ?? Promise.resolve(false));
      if (!ok || r.state !== "sent") return; // 삭제가 실패했다 = 서버 행이 그대로다(안내는 onDeleteFailed 가 했다)
      r.state = "undone";
      const res = await deps.sendRestore(r.item).catch(() => ({ ok: false as const, error: undefined }));
      if (res.ok) deps.onRestored(r);
      else deps.onRestoreFailed(r, res.error);
    },
    /** 기다리던 삭제를 지금 모두 보낸다 — 페이지가 가려지거나(keepalive) 화면을 떠날 때 */
    flush(keepalive = true): void {
      for (const { r } of [...pending.values()]) void send(r, keepalive);
    },
    isPending(key: string): boolean {
      return pending.has(key);
    },
  };
}

export type DeferredRemover<T> = ReturnType<typeof createDeferredRemover<T>>;
