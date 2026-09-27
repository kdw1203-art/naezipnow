/* [v4 · 한 화면 한 가지] 분석 허브 목록 행의 공통 모양 — 서버(지역 시세·내 임장노트 행)와
   클라이언트(단지 분석 12행 · 노트 펼침 행)가 같이 쓴다. 상태·의존이 없는 순수 JSX 라
   클라이언트 묶음에 들어가도 몇백 바이트다.
   행 = 왼쪽 이름(굵게) + 그 아래 보조 한 줄 / 오른쪽 값(t-num) 또는 `›`. 행 사이는 목록의 1px 구분선. */

export const ROW_CLASS = "flex min-h-14 items-center gap-3 py-3 no-underline";

/** 행 왼쪽 — 이름 + 보조 한 줄 */
export function RowText({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="t-section text-ink">{title}</span>
      <span className="t-sub text-text-3">{sub}</span>
    </span>
  );
}

/** 행 오른쪽 `›` — 값이 없을 때. 글자 모양일 뿐 행 전체가 링크다 */
export function RowChevron({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block shrink-0 t-section text-text-3 ${className}`}>
      ›
    </span>
  );
}
