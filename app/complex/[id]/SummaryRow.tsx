import Link from "next/link";
import type { ReactNode } from "react";

/* [v4 · 규칙 5] 단지 허브 목록 행 — 왼쪽 이름(굵게) + 그 아래 보조 한 줄 / 오른쪽 값(숫자) 또는 `›`.
   서버 조각(JS 없음). 목록은 부르는 쪽의 `<ul className="divide-y divide-line">` 이 1px 선으로 가른다.
   · href  — 다른 화면으로(Link)
   · tab   — 같은 화면의 다른 탭으로(`?tab=` 주소 + data-hub-tab — hub-client 가 가로채 탭만 바꾼다)
   · right — 행 안의 조작(호가 점검 열기·거리뷰) — 펼침 본문이 다음 줄(basis-full)로 오도록 flex-wrap */

const ROW = "flex min-h-14 items-center justify-between gap-x-3 py-3";

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
    <span className="flex shrink-0 items-center gap-1.5">
      {value != null && <span className="t-body t-num text-ink">{value}</span>}
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
  tab,
  right,
  id,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  href?: string;
  /** 탭 id(hub-client TAB_IDS — "price" 등) */
  tab?: string;
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
  if (tab) {
    return (
      <li id={id}>
        <a href={`?tab=${tab}`} data-hub-tab={tab} className={`press ${ROW} no-underline`}>
          <Label label={label} sub={sub} />
          <Value value={value} chevron />
        </a>
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
