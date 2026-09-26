"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { useToast } from "@/app/components/toast/ToastProvider";
import { createDeferredRemover, type DeferredRemover } from "./deferred-remove";

/* [1009 · H] 관심 단지 목록 — 행 전체가 단지 화면 링크(눌림), 오른쪽 ✕ 로 빼고 토스트 "되돌리기"로 되살린다.
 *
 * 왜(2026-09-22 실측):
 *  · 목록에서 뺄 방법이 없었다 — 단지 화면에 들어가 "팔로우"를 다시 눌러야 했다(관심 단지 30곳 상한이 있는데).
 *  · 등락은 `▲ + text-danger` / `▼ + text-primary`(197행) — danger 는 오류색, primary 는 테마를 탄다.
 *    표준 <Delta>(▲ 빨강 · ▼ 파랑 · 보합)로, 비교 기준("기준가 대비")을 칸마다 적는다.
 *  · 표(min-width 560px)라 390px 휴대폰에서 가로 스크롤이 생겼다 → 한 행 두 줄 목록.
 *
 * [1009 · H 리뷰] **지연 삭제** — ✕ 는 목록에서만 먼저 빼고, 서버 삭제(DELETE)는 토스트가 닫힌 뒤(5.5초) 보낸다.
 *  · 왜: 예전엔 ✕ 즉시 DELETE 하고 "되돌리기"는 POST 로 **새 행**을 만들었다 — 크론이 세운 기준가(last_price_krw ·
 *    last_price_band)·마지막 신규 거래 확인·마지막 알림 시각·담은 날짜가 사라져 가격 알림·신규 거래 크론이 기준만 다시 세우느라
 *    한 주기 알림을 놓치고, 행은 맨 위로 올라갔다. 지금은 되돌리기가 타이머를 취소할 뿐이라 서버 행이 그대로다.
 *  · 페이지가 가려지면(visibilitychange hidden · pagehide — 탭 닫기·앱 전환) 기다리던 삭제를 keepalive 로 바로 보낸다.
 *  · 화면을 떠나면(클라이언트 이동 = 언마운트) 그때 보낸다. **토스트는 전역이라 다음 화면에도 남는다** — 그 뒤의 되돌리기는
 *    이미 지워진 뒤라 POST 로 다시 담고 "알림 기준가는 다음 점검 때 다시 잡혀요"라고 알린다(예전 동작과 같은 한계를 정직하게).
 *  · 삭제가 실패하면(서버 5xx — lib/watchlist/store-db 가 이제 오류를 던진다) 화면에 있으면 행을 제자리로, 떠났으면 토스트로 알린다.
 *  · 여러 행을 연달아 빼도 각자 따로 기다린다(예전엔 한 행을 지우는 동안 다른 행 ✕ 가 활성 상태로 조용히 무시됐다).
 *    토스트는 하나라 "되돌리기"는 마지막에 뺀 단지에 붙는다.
 *  · 제어 로직은 ./deferred-remove.ts(순수 — tests/unit/watchlist-h-1009.test.ts 가 잠근다), 여기는 화면·fetch 연결만. */

/** 토스트(되돌리기 있음 5초 + 사라짐 0.2초 — ToastProvider)가 닫힌 뒤에 서버에 보낸다 */
const COMMIT_DELAY_MS = 5_500;

export type WatchRow = {
  id: string;
  complexId: string;
  complexName: string;
  href: string;
  alertPriceMin: number | null;
  alertPriceMax: number | null;
  /** "알림 범위 8.5억~9.5억" — 없으면 null */
  alertLabel: string | null;
  /** 현재가 표기(짧은 표기 "12.5억" — 최근 거래 평균) — 산출 불가면 null */
  priceText: string | null;
  /** 현재가 근거 "84㎡대 · 최근 6건 평균 · 2026.08까지" 또는 산출 불가 사유 */
  priceSub: string;
  /** 기준가 대비 변동률(%) — 비교할 수 없으면 null */
  deltaPct: number | null;
  /** 비교할 수 없는 이유("면적대 변경 · 비교 불가" 등) — deltaPct 가 있으면 null */
  deltaNote: string | null;
  /** 최근 30일 새 공개 노트 수 — 조회 실패면 null */
  noteCount: number | null;
};

export function WatchlistRows({ initial, max }: { initial: WatchRow[]; max: number }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<WatchRow[]>(initial);
  const mounted = useRef(true);

  const insertAt = (row: WatchRow, index: number) =>
    setRows((cur) => {
      if (cur.some((r) => r.complexId === row.complexId)) return cur;
      const next = [...cur];
      next.splice(Math.min(index, next.length), 0, row);
      return next;
    });

  /* 제어기는 한 번만 만든다(순수 로직 — deferred-remove.ts). 콜백이 쓰는 것은 모두 안정적이다:
     setRows(함수형 갱신) · showToast(Provider 의 useCallback) · mounted(ref) */
  const removerRef = useRef<DeferredRemover<WatchRow> | null>(null);
  if (removerRef.current === null) {
    removerRef.current = createDeferredRemover<WatchRow>({
      delayMs: COMMIT_DELAY_MS,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      sendDelete: (complexId, keepalive) =>
        fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`, { method: "DELETE", keepalive })
          .then((res) => res.ok)
          .catch(() => false),
      sendRestore: async (row) => {
        const res = await fetch("/api/me/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            complexId: row.complexId,
            complexName: row.complexName,
            alertPriceMin: row.alertPriceMin ?? undefined,
            alertPriceMax: row.alertPriceMax ?? undefined,
          }),
        });
        if (res.ok) return { ok: true };
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: j.error };
      },
      onDeleteFailed: (r) => {
        if (mounted.current) {
          insertAt(r.item, r.index);
          showToast("빼지 못했어요 — 연결을 확인하고 다시 눌러 주세요");
        } else {
          /* 토스트는 한 줄(말줄임)이라 390px 에서 다 보이는 길이로 — 관심 단지 화면에 돌아오면 그 행이 그대로 있다 */
          showToast("관심 단지를 빼지 못했어요 · 연결을 확인해 주세요");
        }
      },
      onUndoLocal: (r) => {
        insertAt(r.item, r.index);
        showToast("관심 단지로 되돌렸어요");
      },
      onRestored: (r) => {
        /* 새 행은 기준가가 비어 있다 — 옛 등락을 계속 보여 주면 서버와 다른 말을 하게 된다 */
        if (mounted.current) {
          insertAt({ ...r.item, deltaPct: null, deltaNote: "알림 기준가는 다음 점검 때 다시 잡혀요" }, r.index);
        }
        /* 한 줄 토스트에 다 보이게 짧게(390px 실측 — 긴 문장은 "다시 …"에서 잘렸다). 행에는 긴 안내가 붙는다 */
        showToast("다시 담았어요 · 알림 기준가는 새로 잡혀요");
      },
      onRestoreFailed: (_r, error) => {
        showToast(error ? `되돌리지 못했어요 — ${error}` : "되돌리지 못했어요 — 단지 화면에서 다시 담아 주세요");
      },
    });
  }

  useEffect(() => {
    const remover = removerRef.current!;
    mounted.current = true;
    const flushNow = () => remover.flush(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
      mounted.current = false;
      /* 클라이언트 이동으로 화면을 떠남 — 기다리던 삭제를 지금 보낸다(전역 토스트는 다음 화면에 남는다) */
      flushNow();
    };
  }, []);

  function remove(row: WatchRow) {
    const index = rows.findIndex((r) => r.complexId === row.complexId);
    if (index < 0) return;
    const removal = removerRef.current!.remove(row.complexId, row, index);
    if (!removal) return;
    /* 먼저 목록에서 뺀다(토스 관례 — 누르는 즉시 반응). 서버에는 토스트가 닫힌 뒤 보낸다 */
    setRows((cur) => cur.filter((r) => r.complexId !== row.complexId));
    showToast("관심 단지에서 뺐어요", { label: "되돌리기", onClick: () => void removerRef.current!.undo(removal) });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="pin"
        title="관심 단지를 모두 뺐어요"
        desc="단지 화면의 “단지 팔로우”나 지도의 “관심 단지 담기”로 다시 모을 수 있어요."
        action={{ label: "지도에서 단지 찾기", href: "/map" }}
      />
    );
  }

  return (
    <>
      <p className="mb-2 t-body text-text-3">
        관심 단지 <span className="tabular-nums">{rows.length}</span>곳
        {initial.length >= max && ` (최근 ${max}곳 표시)`} · 시세 변동 ±1% 이상이면 알림을 보내드려요
      </p>
      <div className="card rounded-2xl px-[var(--pad-card)] py-1">
        <div className="flex items-center justify-between gap-2 border-b border-divider py-2 t-caption text-text-3">
          <span>단지</span>
          <span className="flex items-center gap-0.5">
            현재가 · 기준가 대비
            <Explain
              title="현재가 · 기준가 대비"
              body="관심 단지의 지금 가격이 지난번 점검 때보다 얼마나 움직였는지예요."
              how={[
                "현재가 = 거래가 가장 많은 전용면적 구간의 최근 최대 6건 평균(최소 3건, 해제 신고 제외) — 시세 변동 알림과 같은 계산이에요.",
                "기준가 = 가격 알림 점검이 마지막으로 본 값이에요. 대표 면적대가 바뀐 단지는 비교하지 않아요.",
                "기준가 대비 = (현재가 − 기준가) ÷ 기준가 × 100",
              ]}
              source="국토교통부 실거래 신고"
            />
          </span>
        </div>
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1 border-b border-divider last:border-b-0">
              <Link
                href={r.href}
                className="press -mx-2 flex min-w-0 flex-1 items-start justify-between gap-3 rounded-xl px-2 py-2.5 no-underline transition-colors hover:bg-bg"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="t-body font-bold text-ink break-words">{r.complexName}</span>
                  <span className="t-caption text-text-3 break-words">{r.priceSub}</span>
                  {r.alertLabel && <span className="t-caption text-text-3">{r.alertLabel}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  {r.priceText ? (
                    <span className="t-body font-extrabold t-num text-ink">{r.priceText}</span>
                  ) : (
                    <span className="t-sub text-text-3">현재가 없음</span>
                  )}
                  {r.deltaPct !== null ? (
                    <Delta pct={r.deltaPct} srContext="기준가보다" className="t-sub" />
                  ) : r.deltaNote ? (
                    <span className="t-caption text-text-3">{r.deltaNote}</span>
                  ) : null}
                  <span className="t-caption tabular-nums text-text-3">
                    {r.noteCount === null ? "새 노트 조회 실패" : `새 노트 ${r.noteCount}개 · 30일`}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(r)}
                aria-label={`${r.complexName} 관심 단지에서 빼기`}
                className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors hover:bg-bg hover:text-ink"
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 t-sub text-text-3">
        현재가는 거래가 가장 많은 전용면적 구간의 최근 최대 6건 평균(최소 3건, 해제 신고 제외)이에요. 기준가 대비는
        마지막 알림 점검 때 본 값과 비교하고, 대표 면적대가 바뀐 단지는 비교하지 않아요. 새 노트는 최근 30일 공개
        임장노트 수예요.
      </p>
    </>
  );
}

export default WatchlistRows;
