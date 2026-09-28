import Link from "next/link";
import type { ReactNode } from "react";

/* [1015 · 규칙 J] 단지 상세의 사실 목록 한 행 — 왼쪽 이름(굵게) + 보조 한 줄 / 오른쪽 값(숫자) 또는 `›`.
   1012 v4 시안에서 소유자가 승인한 부품만 가져왔다(히어로·탭·차트·리뷰 뼈대는 그대로). 서버 조각(JS 없음).
   목록은 부르는 쪽의 `<ul className="lq-panel" data-tone=…>` 이 리퀴드 판으로 감싼다.
   · href — 다른 화면으로(Link) · right — 행 안의 조작(펼침 본문이 다음 줄로 오도록 flex-wrap) */

const ROW = "flex min-h-12 items-center justify-between gap-x-3 py-2.5 max-md:min-h-11 max-md:py-2";

function Label({ label, sub }: { label: ReactNode; sub?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block t-body font-bold text-ink">{label}</span>
      {sub ? <span className="mt-0.5 block truncate t-sub text-text-3">{sub}</span> : null}
    </span>
  );
}

function Value({ value, chevron }: { value?: ReactNode; chevron: boolean }) {
  if (value == null && !chevron) return null;
  return (
    <span className="flex min-w-0 max-w-[66%] shrink items-center justify-end gap-1.5 text-right">
      {value != null && <span className="t-body t-num break-words text-ink">{value}</span>}
      {chevron && (
        <span aria-hidden="true" className="t-body text-text-3">
          ›
        </span>
      )}
    </span>
  );
}

export function SummaryRow({
  label,
  sub,
  value,
  href,
  right,
  id,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  href?: string;
  right?: ReactNode;
  id?: string;
}) {
  if (href) {
    return (
      <li id={id}>
        <Link href={href} className={`press ${ROW} no-underline`}>
          <Label label={label} sub={sub} />
          <Value value={value} chevron />
        </Link>
      </li>
    );
  }
  return (
    <li id={id} className={`${ROW} scroll-mt-28 ${right ? "flex-wrap" : ""}`}>
      <Label label={label} sub={sub} />
      <Value value={value} chevron={false} />
      {right}
    </li>
  );
}

export default SummaryRow;
