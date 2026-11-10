"use client";

import { useEffect, useState } from "react";
import { aiQuotaLabel, type AiUsageItem } from "@/lib/ai/quota-label";

/* [1125 · 실행 전 남은 횟수] "AI 해설 받기" 옆 — 누르기 전에 남은 횟수를 안다(예전엔 다 쓴 뒤 "무료 해설을 다 썼어요"로만 알았다).
   로그인한 사람에게만 한 번 조회. 못 불러오면 줄을 그리지 않는다(어림값 없음). */
export function AiQuotaNote() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me/usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: AiUsageItem[] } | null) => {
        if (alive) setLabel(aiQuotaLabel(d?.items));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!label) return null;
  return <span className="t-caption font-medium text-text-3">{label}</span>;
}

export default AiQuotaNote;
