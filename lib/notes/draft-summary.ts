/**
 * 임장노트 임시저장(draft) 요약 읽기 — 홈 "이어서 보기" 패널용 (고도화 8·21).
 *
 * 저장은 NoteForm(작성 화면)만 한다. 여기서는 **읽기만** — 홈에서 "작성 중인
 * 노트가 있다"는 사실을 알려 복귀 동선을 만들기 위해서다. 키 문자열이 두 파일에
 * 흩어지면 한쪽 변경 시 홈 배너가 조용히 죽으므로 키는 여기 한 곳에만 둔다.
 *
 * 브라우저 전용(localStorage) — useEffect/핸들러 안에서만 부를 것.
 */

export const NOTE_DRAFT_KEY = "nz_note_draft";

/* [967 · 9] 작성/수정 임시저장 키 분리.
   수정 모드도 같은 nz_note_draft 를 쓰면 (a) 홈 "이어서 쓰기" 배너가 남의 노트
   수정 중 내용을 새 노트 초안으로 안내하고 (b) 노트 A 를 고치다 만 내용이
   노트 B 의 편집 화면에 복원된다. 새 노트는 예전 키 그대로(홈 배너 호환),
   수정은 노트 id 별 키를 쓴다. */
export function noteDraftKey(editId: string | null | undefined): string {
  const id = typeof editId === "string" ? editId.trim() : "";
  return id ? `${NOTE_DRAFT_KEY}:edit:${id}` : NOTE_DRAFT_KEY;
}

/* [967 · 10] 수정 모드 초안이 "복원할 가치가 있는가" — 노트가 마지막으로
   저장된 뒤에 적힌 초안만. 다른 기기에서 그 뒤에 노트를 고쳤다면 이 초안은
   낡은 것이라 배너를 띄우지 않는다. updatedAt 을 모르면(구버전 응답) 초안을
   믿는다 — 잃는 쪽보다 한 번 더 묻는 쪽이 싸다. */
export function isDraftNewerThan(
  draftSavedAt: string,
  noteUpdatedAt: string | null | undefined,
): boolean {
  const d = Date.parse(draftSavedAt);
  if (!Number.isFinite(d)) return false;
  if (!noteUpdatedAt) return true;
  const u = Date.parse(noteUpdatedAt);
  if (!Number.isFinite(u)) return true;
  return d > u;
}

/* [967 · 10] 키 순서에 무관한 직렬화 — 초안(파싱 결과)과 폼 상태의 객체 키
   순서가 달라도 "내용이 같다"를 같다고 판정하기 위해. undefined 값은 JSON 과
   같이 생략한다. */
export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        if (o[k] === undefined) continue;
        out[k] = walk(o[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export interface NoteDraftSummary {
  /** 마지막 자동 저장 시각 (ISO) */
  savedAt: string;
  /** 작성 중이던 단지명 (없으면 null) */
  aptName: string | null;
  /** 작성 중이던 지역 (없으면 null) */
  region: string | null;
}

/**
 * 유효한 임시저장이 있으면 요약을, 없거나 형식이 깨졌으면 null.
 * 검증은 NoteForm.parseDraft 의 부분집합만 한다 — 여기서 필요한 건
 * "복구 가능한 드래프트가 존재한다"는 사실과 표시용 두 필드뿐이다.
 */
export function readNoteDraftSummary(): NoteDraftSummary | null {
  try {
    const raw = window.localStorage.getItem(NOTE_DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (typeof o.savedAt !== "string" || !o.savedAt) return null;
    const loc =
      o.loc && typeof o.loc === "object" ? (o.loc as Record<string, unknown>) : null;
    const aptName =
      loc && typeof loc.aptName === "string" && loc.aptName.trim()
        ? loc.aptName.trim()
        : null;
    const region =
      loc && typeof loc.region === "string" && loc.region.trim()
        ? loc.region.trim()
        : null;
    return { savedAt: o.savedAt, aptName, region };
  } catch {
    return null; // 파싱 실패·프라이빗 모드 — 배너를 띄우지 않는다
  }
}
