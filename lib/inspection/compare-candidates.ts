/**
 * [1097 · 기능] 회차 비교(/notes/compare)의 "비교 가능한 단지" — 내 노트를 단지별로 세어 2회 이상인 단지만, 최근 기록 순.
 * 단지 키는 회차 비교와 같은 규칙: metadata.complexId 가 있으면 그것(표기 다른 aptName 도 같은 단지), 없으면 aptName. 둘 다 없으면 제외.
 * 순수 함수(node:test 가 직접 부른다).
 */
import type { InspectionNote } from "@/lib/inspection/store-db";

export type CompareCandidate = {
  /** 그 단지의 가장 최근 노트 — /notes/compare?noteId= 로 들어가면 같은 단지 회차가 전부 모인다 */
  noteId: string;
  label: string;
  count: number;
};

export function compareCandidates(notes: readonly InspectionNote[], max = 12): CompareCandidate[] {
  const groups = new Map<string, { label: string; count: number; noteId: string; latest: string }>();
  for (const n of notes) {
    const complexId = typeof n.metadata?.complexId === "string" ? n.metadata.complexId.trim() : "";
    const apt = (n.aptName ?? "").trim();
    const key = complexId ? `c:${complexId}` : apt ? `a:${apt}` : "";
    if (!key) continue;
    const stamp = n.visitDate || n.createdAt || "";
    const g = groups.get(key);
    if (!g) groups.set(key, { label: apt || complexId, count: 1, noteId: n.id, latest: stamp });
    else {
      g.count += 1;
      if (stamp > g.latest) {
        g.latest = stamp;
        g.noteId = n.id;
        if (apt) g.label = apt;
      }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.label.localeCompare(b.label, "ko")))
    .slice(0, max)
    .map(({ noteId, label, count }) => ({ noteId, label, count }));
}
