/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1012 · 규칙 8] 굵기 800 이상(font-bold·font-bold) → 700(font-bold). 기준 사이트 4곳은 굵기 3단(400·500·700)만 쓴다. */
import Link from "next/link";
import { embedSnippet, type EmbedKind } from "@/lib/embed/snippet";

/* ============================================================
   [992 · A1] 시세 위젯 퍼가기 — 생성기 화면(/widget, 보관) 대신 상세 화면 안에서 바로.

   위젯 iframe(app/embed/complex/[id] · app/embed/region/[id])은 그대로 산다. 이 블록은
   그 주소를 iframe 한 줄로 만들어 보여 주기만 한다 — 서버 컴포넌트라 클라이언트 JS 가
   늘지 않는다. 복사 버튼 대신 `user-select: all` 로 한 번 탭하면 전체가 선택된다.
   ============================================================ */


export function EmbedSnippet({
  kind,
  id,
  heading,
  desc,
  className = "",
}: {
  kind: EmbedKind;
  id: string;
  heading: string;
  desc: string;
  className?: string;
}) {
  const code = embedSnippet(kind, id);
  /* 경로 두 벌을 리터럴로 적는다 — route-links 게이트가 정적 세그먼트로 대조할 수 있게 */
  const previewHref =
    kind === "complex"
      ? `/embed/complex/${encodeURIComponent(id)}`
      : `/embed/region/${encodeURIComponent(id)}`;
  /* [1030 · G4] 접힌 <details> — 일반 이용자 사이드에 iframe 코드 상자가 늘 펼쳐져 있었다(지역 화면 실측).
     제목 줄(40px)만 보이고, 중개사·블로거가 열면 예전 그대로. 서버 컴포넌트·JS 없음은 그대로. */
  return (
    <details className={`group rounded-lg border border-line bg-surface ${className}`}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="t-body font-bold text-ink">{heading}</span>
        <span className="t-sub text-text-3 group-open:hidden">열기</span>
        <span className="hidden t-sub text-text-3 group-open:inline">닫기</span>
      </summary>
      <div className="flex flex-col gap-1 px-4 pb-4">
        <span className="t-sub text-text-2">{desc}</span>
        <pre
          className="mt-2 max-w-full overflow-x-auto rounded-lg bg-bg px-3 py-2.5 t-sub leading-[1.6] text-text-1 [user-select:all]"
          tabIndex={0}
          aria-label="위젯 삽입 코드"
        >
          <code>{code}</code>
        </pre>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-sub text-text-3">
          <span>탭하면 전체 선택 · 무료 · 출처 표기 포함</span>
          <Link
            href={previewHref}
            target="_blank"
            rel="noopener"
            className="inline-block py-[5px] font-bold text-primary no-underline"
          >
            위젯 미리보기 ›
          </Link>
        </div>
      </div>
    </details>
  );
}
