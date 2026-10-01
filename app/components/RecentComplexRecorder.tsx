"use client";
/* [1026c · 번들] 단지 상세 방문 기록만 — RecentComplexes(칩·서버 병합·토스트)에서 떼어 냈다. 동작은 예전과 같다. */

import { useEffect } from "react";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { dedupeRecents } from "@/lib/recent-complexes/dedupe";
import { readRecents, writeRecents, RECENT_MAX, type RecentComplex } from "@/lib/recent-complexes/storage";

/** /complex/[id] 방문 기록 — 목업 폴백(id가 mock-*)은 기록하지 않음 */
export function RecentComplexRecorder({ id, name, region }: { id: string; name: string; region?: string }) {
  useEffect(() => {
    if (!id || id.startsWith("mock")) return;
    /* 새 기록이 가장 최근(at)이라 같은 id 든 같은 지역+이름이든 이 한 건만 남는다 */
    const next: RecentComplex[] = dedupeRecents([{ id, name, region, at: Date.now() }, ...readRecents()], RECENT_MAX);
    writeRecents(next);
    /* B8 — 로그인 사용자면 서버에도 기록(크로스디바이스). [1007 · V2a-2] 힌트 쿠키가 없으면 보내지 않는다. */
    if (!readAuthedHint()) return;
    void fetch("/api/me/recent-complexes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, region }),
      keepalive: true,
    }).catch(() => {});
  }, [id, name, region]);
  return null;
}
