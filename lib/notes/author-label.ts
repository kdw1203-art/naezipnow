/**
 * 노트 작성자 표기 — **화면에 보이는 이름을 한 곳에서 정한다.**
 *
 * ── 왜 (2026-09-09 실측) ───────────────────────────────────────────────────
 * inspection_notes 27건 중 25건이 내집나우 Lab 이 쓴 글인데, 그 25건의
 * author_label 이 **7종**으로 갈라져 있었다:
 *
 *   내집나우 Lab · AI 임장노트 편집부   (10건)
 *   내집나우 Lab                        (5건)
 *   내집나우 Lab · AI 임장노트          (5건)
 *   내집나우 Lab 편집장                 (2건)
 *   내집나우 Lab 에디터                 (1건)
 *   내집나우 Lab AI 에디터              (1건)
 *   내집나우 lab · AI 임장노트 편집장   (1건 · 소문자 lab)
 *
 * 읽는 사람은 편집부가 여럿 있는 줄 안다. 저장된 값은 건드리지 않고(남의 기록을
 * 고치지 않는다는 원칙은 우리 글에도 똑같이 적용한다 — 되돌릴 수 없게 만들지 않는다)
 * **보여 줄 때만** 하나로 모은다.
 *
 * ── 그리고 더 중요한 것: 예시라고 말한다 ──────────────────────────────────
 * 화면은 "이웃들이 다녀와 남긴 기록"이라고 말하는데 27건 중 25건이 우리 글이다.
 * 지금은 사실이 아니다. Lab 글에 예시 표를 달면 신뢰를 잃는 게 아니라 지킨다 —
 * 그리고 "내 글이 이 단지의 첫 진짜 기록"이라는 이유가 생긴다.
 */

/** 화면에 쓰는 단일 표기 */
export const LAB_AUTHOR_LABEL = "내집나우 Lab";

/** 예시 표에 쓰는 낱말 — 한 곳에서 정해 화면마다 달라지지 않게 */
export const LAB_BADGE = "예시";

/**
 * Lab(운영진)이 쓴 노트인가.
 *
 * 판정은 `lab` 이라는 낱말 하나로 한다(대소문자 무시). 지금 7종이 전부 이 낱말을
 * 갖고 있고, 일반 사용자 이름에 `lab` 이 단어 단위로 들어갈 일은 사실상 없다.
 * 단어 경계를 쓰므로 "Lablanc" 같은 이름은 걸리지 않는다.
 */
export function isLabAuthor(authorLabel: string | null | undefined): boolean {
  return /\blab\b/i.test(authorLabel ?? "");
}

/**
 * 화면에 보여 줄 작성자 이름.
 *
 * · Lab 글이면 표기 7종을 하나로 모은다
 * · 그 밖에는 저장된 이름을 그대로(앞뒤 공백만 정리)
 * · 이름이 비면 "익명" — 빈 자리를 남기지 않는다
 */
export function displayAuthorLabel(authorLabel: string | null | undefined): string {
  const raw = (authorLabel ?? "").trim();
  if (isLabAuthor(raw)) return LAB_AUTHOR_LABEL;
  return raw || "익명";
}
