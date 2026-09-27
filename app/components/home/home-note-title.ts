/**
 * [v4 · 요약본] 홈 공개 임장노트 행의 제목·메타 — 순수 함수(테스트로 잠근다. 화면은 HomeNotesList.tsx).
 *
 * home-data 는 노트 제목 앞에 단지명을 붙여 내려준다("청량리역 한양수자인 그라시엘 — 그라시엘 전세10억3건 월세71%(Lab #33 …)").
 * 한 줄 행에서는 그 제목이 폰에서 반쯤 잘려 "…"만 남았다. 행 제목 = 노트 제목만(Lab 카드의 괄호 부연은 뗀다 —
 * 동네 피드와 같은 feedDisplayTitle), 단지명은 메타 줄로 내린다. 남는 글이 두 글자 미만이면 원문(지어내지 않는다).
 */
import { feedDisplayTitle } from "@/lib/town/feed-regions";

/** "단지명 — 제목"(home-data 가 붙인 꼴) → 단지명 / 제목. 붙이지 않은 제목은 그대로 */
export function splitNoteTitle(title: string): { apt: string | null; body: string } {
  const src = (title ?? "").trim();
  const at = src.indexOf(" — ");
  if (at > 0) {
    const apt = src.slice(0, at).trim();
    const body = src.slice(at + 3).trim();
    if (apt && body) return { apt, body };
  }
  return { apt: null, body: src };
}

/** 행 제목(한 줄) + 메타("단지명 · 작성 주체") */
export function homeNoteRowText(title: string, kind: "lab" | "user"): { label: string; meta: string } {
  const { apt, body } = splitNoteTitle(title);
  const lab = kind === "lab";
  return {
    label: feedDisplayTitle(body, null, { lab }),
    meta: [apt, lab ? "내집나우 Lab" : "이웃"].filter(Boolean).join(" · "),
  };
}
