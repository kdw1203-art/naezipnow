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
  return (
    <div className={`flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-4 ${className}`}>
      <span className="t-body font-extrabold text-ink">{heading}</span>
      <span className="t-sub text-text-2">{desc}</span>
      <pre
        className="mt-2 max-w-full overflow-x-auto rounded-[10px] bg-bg px-3 py-2.5 text-[12px] leading-[1.6] text-text-1 [user-select:all]"
        tabIndex={0}
        aria-label="위젯 삽입 코드"
      >
        <code>{code}</code>
      </pre>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-sub text-text-3">
        <span>코드를 한 번 탭하면 전체가 선택돼요 · 무료 · 출처 표기 포함</span>
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
  );
}
