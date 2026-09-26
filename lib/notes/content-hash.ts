import type { InspectionNote } from "@/lib/inspection/store-db";
import type { InspectionAiIntent } from "@/lib/inspection/ai-report";

/**
 * [1005 · M3] 임장노트 내용 해시 — AI 분석 캐시 키. **순수 모듈**(서버·클라이언트·테스트 공용).
 *
 * 예전엔 app/api/inspection/ai/route.ts 안의 비공개 함수였다. 상세 화면이 "저장된 분석이
 * 지금 내용의 것인가"를 같은 규칙으로 판정해야 해서(수정 저장 뒤 옛 요약을 새 것처럼 보이는
 * 문제) 여기로 올렸다. 라우트도 이 함수를 쓴다 — 두 곳이 서로 다른 해시를 낼 수 없다.
 *
 * 해시 알고리즘은 lib/ai/presets-store.ts 의 objectiveHash(stableStringify + djb2·36진수)와
 * **글자 그대로 같다**. 그 모듈은 Supabase(server-only)를 끌고 와 여기서 import 할 수 없고,
 * DB 에 이미 저장된 aiContentHash 값과 맞아야 하므로 알고리즘을 바꾸면 안 된다 —
 * tests/unit/note-detail-1005.test.ts 가 표본 해시를 고정해 둔다.
 */

/**
 * 심화 분석 축 구성 버전 — lib/inspection/deep-dive.ts 의 DEEP_DIVE_VERSION 과 같아야 한다.
 * 그 모듈은 시장 조회 체인(server-only)을 끌고 와 여기서 import 하지 않는다; 대신 단위
 * 테스트가 두 소스의 값을 대조한다. 버전을 올릴 땐 두 곳을 같이 올린다.
 */
export const NOTE_HASH_DEEP_DIVE_VERSION = 2;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function objectiveHash(objective: Record<string, unknown>): string {
  return hashString(stableStringify(objective));
}

/**
 * 노트 내용 기반 해시 — 내용이 그대로면 재분석 대신 기존 결과를 반환한다.
 *
 * `deepDiveVersion` 을 같이 섞는다. 노트 내용이 안 바뀌어도 심화 분석의 축
 * 구성이 바뀌면 예전 캐시는 지금 화면이 기대하는 모양이 아니다. 버전을 빼면
 * 사용자는 "심화 분석이 안 나온다"를 보게 되고, 그건 실패를 미보유처럼
 * 보여 주는 것과 같다.
 */
export function noteContentHash(note: InspectionNote, intent: InspectionAiIntent): string {
  return objectiveHash({
    intent,
    deepDiveVersion: NOTE_HASH_DEEP_DIVE_VERSION,
    title: note.title,
    region: note.region,
    visitDate: (note as { visitDate?: unknown }).visitDate ?? null,
    scores: note.scores,
    sections: note.sections,
    checklist: note.checklist,
    photos: note.photos,
  });
}

/** 저장된 분석이 어느 내용의 것인지 — metadata.aiContentHash(없으면 null) */
export function storedContentHash(note: { metadata?: unknown } | null | undefined): string | null {
  const meta = note?.metadata;
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as { aiContentHash?: unknown }).aiContentHash;
  return typeof v === "string" && v.length > 0 ? v : null;
}
