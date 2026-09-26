/**
 * [1009 · T 리뷰] 비교함(lib/newui/compare-tray) ↔ 관심 단지(#46 user_watchlist) — CompareTrayButton 이 **누를 때만** 불러오는
 * 조각(동적 import 청크). /complex/[id] 첫 로드 예산(472/480KB)이 빠듯해 단추 파일에는 토글·담기 토스트만 두고, 서버 순서·
 * 되돌리기·문구는 여기 둔다(이 파일 없이 단추에 넣으면 단추 모듈이 870B → 3.5KB 였다).
 *
 * 로그인 사용자는 비교함에서 빼면 관심 단지에서도 빠진다(#46). 예전엔 lib 의 fire-and-forget DELETE·POST 를 그대로 불러
 *  · 토스트는 "비교함에서 뺐어요"라고만 해 관심 단지에서도 빠진 걸 말하지 않았고,
 *  · "되돌리기"의 POST 가 앞선 DELETE 보다 먼저 닿으면 지워진 채로 끝날 수 있었고(순서 보장 없음),
 *  · 되살릴 때 알림 가격(alertPriceMin/Max)을 잃었고, 비회원도 DELETE 를 보내 401 을 맞았다.
 * 이제 서버 일은 모듈 하나의 줄(queue)로 순서대로 하고, 결과를 본 뒤 사실대로 말한다. 되돌리면 원래 자리로 담는다.
 * 한계(API 가 받지 않음): 되살린 관심 단지의 등록 시각·크론 기준가(last_price_krw)는 새로 잡힌다.
 */
import {
  COMPARE_TRAY_MAX,
  addToCompareTray,
  listCompareTray,
  removeFromCompareTray,
} from "@/lib/newui/compare-tray";
import { hasSession } from "@/lib/client/has-session";
import type { ToastAction } from "@/app/components/toast/ToastProvider";

type ShowToast = (message: string, action?: ToastAction) => void;
type WatchSnapshot = { alertPriceMin: number | null; alertPriceMax: number | null };

/* 서버 일(관심 단지 쓰기)은 한 번에 하나씩 — 빼기 DELETE 가 끝난 뒤에만 되돌리기·다시 담기 POST 가 나간다 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => undefined);
  return run;
}

async function findWatch(id: string): Promise<WatchSnapshot | null | "unknown"> {
  try {
    const res = await fetch("/api/me/watchlist", { cache: "no-store" });
    if (!res.ok) return "unknown";
    const j = (await res.json()) as {
      items?: { complexId?: string; alertPriceMin?: number | null; alertPriceMax?: number | null }[];
    };
    const w = (j.items ?? []).find((x) => x.complexId === id);
    return w ? { alertPriceMin: w.alertPriceMin ?? null, alertPriceMax: w.alertPriceMax ?? null } : null;
  } catch {
    return "unknown";
  }
}

async function deleteWatch(id: string): Promise<boolean> {
  try {
    return (await fetch(`/api/me/watchlist?complexId=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true })).ok;
  } catch {
    return false;
  }
}

async function postWatch(id: string, name: string, w?: WatchSnapshot | null): Promise<boolean> {
  try {
    const res = await fetch("/api/me/watchlist", {
      method: "POST",
      keepalive: true, // 담자마자 다른 화면으로 가도 요청이 끊기지 않게(예전 promoteCompareItemToServer 와 같다)
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complexId: id,
        complexName: name,
        ...(w?.alertPriceMin != null ? { alertPriceMin: w.alertPriceMin } : {}),
        ...(w?.alertPriceMax != null ? { alertPriceMax: w.alertPriceMax } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 한 칸을 원래 자리로 — 저장소에 끼워 넣기가 없어 그 자리부터 뒤 칸을 뺐다가 되돌릴 칸 → 뒤 칸 순서로 다시 담는다.
 *  예전 되돌리기는 맨 뒤에 붙였다. 가득 차 있으면 false(뒤 칸이 밀려나지 않게 먼저 거절). */
function restoreAt(item: { id: string; name: string; region?: string }, index: number): boolean {
  const now = listCompareTray();
  if (now.some((i) => i.id === item.id)) return true;
  if (now.length >= COMPARE_TRAY_MAX) return false;
  const tail = now.slice(Math.max(0, Math.min(index, now.length)));
  for (const t of tail) removeFromCompareTray(t.id);
  const ok = addToCompareTray(item).ok;
  for (const t of tail) addToCompareTray({ id: t.id, name: t.name, region: t.region });
  return ok;
}

/** 담기 — 로그인이면 관심 단지에도 담는다(실패해도 비교함은 그대로). 비회원은 보내지 않는다. */
export function addWatch(id: string, name: string): void {
  void enqueue(async () => ((await hasSession()) ? postWatch(id, name) : false));
}

/** 빼기(비교함에서는 이미 뺀 뒤) — 로그인이면 관심 단지에 있었는지 보고(알림 가격 기억) 지운 뒤, 결과대로 말한다. */
export function removeWithWatch(
  item: { id: string; name: string; region?: string; index: number },
  showToast: ShowToast,
): void {
  const removal = enqueue(async () => {
    if (!(await hasSession())) return { watch: null as WatchSnapshot | null, removed: false, failed: false };
    const found = await findWatch(item.id);
    if (found === null) return { watch: null, removed: false, failed: false };
    const ok = await deleteWatch(item.id);
    /* 목록을 못 읽었으면(unknown) 있었는지 모른다 — 관심 단지에 대해선 아무 말도 하지 않는다 */
    const known = found !== "unknown";
    return { watch: known ? found : null, removed: ok && known, failed: !ok && known };
  });
  void removal.then(({ watch, removed, failed }) => {
    /* 서버 결과를 기다리는 사이 다시 담았으면(단추를 한 번 더 누름) 지난 "뺐어요"는 말하지 않는다 — 담기 토스트가 이미 떴다 */
    if (listCompareTray().some((i) => i.id === item.id)) return;
    const undo = () => {
      const back = restoreAt(item, item.index);
      const full = `비교함은 ${COMPARE_TRAY_MAX}개까지 담겨요`;
      if (!removed) {
        showToast(back ? "비교함에 다시 담았어요" : `${full} — 다시 담지 못했어요`);
        return;
      }
      void enqueue(() => postWatch(item.id, item.name, watch)).then((ok) =>
        showToast(
          back
            ? ok
              ? "비교함과 관심 단지에 다시 담았어요"
              : "비교함에 다시 담았어요 — 관심 단지에는 다시 넣지 못했어요"
            : ok
              ? `관심 단지에 다시 넣었어요 — ${full}`
              : "다시 담지 못했어요 — 잠시 후 다시 눌러 주세요",
        ),
      );
    };
    showToast(
      removed
        ? "비교함과 관심 단지에서 뺐어요"
        : failed
          ? "비교함에서 뺐어요 — 관심 단지에서는 빼지 못했어요"
          : "비교함에서 뺐어요",
      { label: "되돌리기", onClick: undo },
    );
  });
}
