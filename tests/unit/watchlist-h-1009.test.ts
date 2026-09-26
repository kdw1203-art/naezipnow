/* [1009 · H 리뷰] 관심 단지 지연 삭제 제어기 — 되돌리기는 서버 행을 건드리지 않는다.
   가짜 타이머·가짜 서버로만(운영 데이터 없음). */
import test from "node:test";
import assert from "node:assert/strict";
import { createDeferredRemover } from "../../app/my/watchlist/deferred-remove.ts";

type Row = { id: string };

function harness(opts: { deleteOk?: boolean; restoreOk?: boolean } = {}) {
  const timers = new Map<number, () => void>();
  let seq = 0;
  const log: string[] = [];
  const remover = createDeferredRemover<Row>({
    delayMs: 5500,
    setTimer: (fn) => {
      seq += 1;
      timers.set(seq, fn);
      return seq;
    },
    clearTimer: (h) => void timers.delete(h as number),
    sendDelete: async (key, keepalive) => {
      log.push(`DELETE ${key}${keepalive ? " keepalive" : ""}`);
      return opts.deleteOk ?? true;
    },
    sendRestore: async (item) => {
      log.push(`POST ${item.id}`);
      return opts.restoreOk === false ? { ok: false, error: "한도" } : { ok: true };
    },
    onDeleteFailed: (r) => log.push(`failed ${r.key}`),
    onUndoLocal: (r) => log.push(`undo-local ${r.key}@${r.index}`),
    onRestored: (r) => log.push(`restored ${r.key}`),
    onRestoreFailed: (r, e) => log.push(`restore-failed ${r.key} ${e ?? ""}`.trim()),
  });
  /** 걸린 타이머를 모두 울린다(시간이 흐른 것처럼) */
  const tick = () => {
    const due = [...timers.values()];
    timers.clear();
    for (const fn of due) fn();
  };
  const settle = () => new Promise((res) => setTimeout(res, 0));
  return { remover, log, tick, settle, timers };
}

test("[1009·H 리뷰] 지연 삭제 — 시간이 지나기 전 되돌리면 서버에 아무것도 보내지 않는다(기준가·담은 날짜 보존)", async () => {
  const h = harness();
  const r = h.remover.remove("a", { id: "a" }, 1);
  assert.ok(r);
  assert.equal(h.remover.isPending("a"), true);
  await h.remover.undo(r);
  h.tick();
  await h.settle();
  assert.deepEqual(h.log, ["undo-local a@1"]);
  assert.equal(h.timers.size, 0);
});

test("[1009·H 리뷰] 지연 삭제 — 시간이 지나면 DELETE 한 번, 같은 단지를 또 빼면 무시", async () => {
  const h = harness();
  const r = h.remover.remove("a", { id: "a" }, 0);
  assert.equal(h.remover.remove("a", { id: "a" }, 0), null);
  h.tick();
  await h.settle();
  assert.deepEqual(h.log, ["DELETE a"]);
  assert.equal(r?.state, "sent");
  h.remover.flush(); // 이미 보낸 것은 다시 보내지 않는다
  await h.settle();
  assert.deepEqual(h.log, ["DELETE a"]);
});

test("[1009·H 리뷰] 지연 삭제 — 화면을 떠나거나 가려지면(flush) 즉시 keepalive 로 보내고, 그 뒤 되돌리기는 다시 담는다", async () => {
  const h = harness();
  const r = h.remover.remove("a", { id: "a" }, 2)!;
  h.remover.remove("b", { id: "b" }, 3);
  h.remover.flush(true);
  await h.settle();
  assert.deepEqual(h.log, ["DELETE a keepalive", "DELETE b keepalive"]);
  assert.equal(h.timers.size, 0); // 기다리던 타이머는 취소됐다
  await h.remover.undo(r);
  await h.remover.undo(r); // 두 번 눌러도 한 번만 다시 담는다
  assert.deepEqual(h.log.slice(2), ["POST a", "restored a"]);
});

test("[1009·H 리뷰] 지연 삭제 — 서버가 실패하면 onDeleteFailed(화면 복구), 그 뒤 되돌리기는 아무것도 안 한다", async () => {
  const h = harness({ deleteOk: false });
  const r = h.remover.remove("a", { id: "a" }, 0)!;
  h.tick();
  await h.settle();
  assert.deepEqual(h.log, ["DELETE a", "failed a"]);
  await h.remover.undo(r);
  assert.deepEqual(h.log, ["DELETE a", "failed a"]);
});

test("[1009·H 리뷰] 지연 삭제 — 다시 담기가 거절되면 원인을 넘긴다", async () => {
  const h = harness({ restoreOk: false });
  const r = h.remover.remove("a", { id: "a" }, 0)!;
  h.remover.flush();
  await h.settle();
  await h.remover.undo(r);
  assert.deepEqual(h.log, ["DELETE a keepalive", "POST a", "restore-failed a 한도"]);
});
