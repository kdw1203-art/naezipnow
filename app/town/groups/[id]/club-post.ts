"use client";
/* [1168] 모임 쓰기 요청 한 곳 — 성공하면 null, 실패하면 사유 한 줄. */
export async function clubPost(groupId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/groups/${groupId}/club`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return j?.error || "저장 실패 · 잠시 후 다시";
  } catch {
    return "저장 실패 · 잠시 후 다시";
  }
}

export const FIELD =
  "w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";
