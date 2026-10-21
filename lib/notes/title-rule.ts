/**
 * [1081 · #17] 임장노트 제목 규칙 — "단지명 [전용면적] 임장노트 · YYYY년 M월".
 *
 * 왜: 저장 제목이 "○○ 임장 기록"뿐이라 공개 노트 51쪽의 <title>·h1 이 검색어("헬리오시티 84㎡ 임장") 꼴이 아니었다.
 * 면적은 입력했을 때만, 방문월은 방문일(YYYY-MM-DD)에서 — 없는 값은 지어내지 않는다. 순수 함수(클라이언트·서버·테스트 공용).
 */
export function noteTitleFor(input: { aptName: string; areaM2?: number | null; areaLabel?: string | null; visitDate?: string | null }): string {
  const apt = input.aptName.trim();
  const area = input.areaLabel?.trim() || (typeof input.areaM2 === "number" && Number.isFinite(input.areaM2) && input.areaM2 > 0 ? `${Math.floor(input.areaM2)}㎡` : "");
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(input.visitDate ?? ""));
  const when = m ? ` · ${m[1]}년 ${Number(m[2])}월` : "";
  return `${apt}${area ? ` ${area}` : ""} 임장노트${when}`;
}

/** [1082] 저장된 제목이 예전 규칙("○○ 임장 기록")이면 보여 줄 때 새 규칙으로 — DB 를 고치지 않고 공개 노트 51쪽의 <title>·JSON-LD 가
 *  검색어 꼴이 된다. 사용자가 직접 바꾼 제목(예전 꼴이 아닌 것)은 그대로. 면적은 metadata.unit 에서 온 값(없으면 생략). */
export function noteDisplayTitle(note: { title: string; aptName?: string | null; visitDate?: string | null }, unit?: { areaM2?: number | null; areaLabel?: string | null } | null): string {
  const m = /^(.+?)\s*임장 기록$/.exec(note.title.trim());
  if (!m) return note.title;
  return noteTitleFor({ aptName: note.aptName?.trim() || m[1], areaM2: unit?.areaM2 ?? null, areaLabel: unit?.areaLabel ?? null, visitDate: note.visitDate });
}

/** [1082] <title> — 제목에 이미 "임장노트"가 있으면 접미에서 한 번 더 붙이지 않는다("… 임장노트 · 송파구 임장노트" 금지) */
export function noteMetaTitle(title: string, region: string): string {
  return title.includes("임장노트") ? `${title} · ${region} | 내집나우` : `${title} · ${region} 임장노트 | 내집나우`;
}
