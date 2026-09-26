"use client";

import Link from "next/link";
import { FuzzyBadge, Hl } from "./complex-hit";
import type { FlatItem } from "./unified-suggest";
import { NO_MATCH_EXAMPLE, NO_MATCH_HINT, noMatchTitle } from "@/lib/search/complex-preview";

/* ============================================================
   [1008 · S] 헤더 검색·홈 검색의 드롭다운 — 친 뒤에만 필요한 부분이라 next/dynamic 으로 따로 싣는다.
   HeaderSearch 는 전 페이지 첫 묶음에 실린다(/complex/[id] 479/480KB) — 여기로 옮겨 첫 묶음을 줄였다.

   - 단지 줄: 이름(검색어 강조 — 괄호·띄어쓰기 건너뜀) + [비슷한 이름] · 시군구 읍면동 · 세대수 · 6개월 거래
   - 결과 없음: "“{q}” 와 일치하는 단지가 없어요" · 띄어 쓰는 요령 · 지도에서 찾기 · 비슷한 이름
   - 포커스는 입력창에 남는다 — 활성 항목은 aria-activedescendant(optionId)로만 가리킨다.
   - [1008 · 리뷰 B] listbox 안에는 option 만 둔다(제목·안내·단추는 밖) — 목록이 비어도 listbox 는 그려
     입력창의 aria-controls·aria-expanded 가 가리키는 대상이 늘 있다. 안내 문구는 role=status 로 읽힌다.
     notice(예: "검색어는 80자까지예요")가 오면 장애·결과 없음 문구 대신 그것을 쓴다.
   ============================================================ */

type Props = {
  variant: "header" | "hero";
  listId: string;
  optionId: (i: number) => string;
  /** 결과를 받아 온 검색어(강조·결과 없음 문구) */
  query: string;
  /** 빈 입력 포커스 — 최근 검색어 목록(헤더만) */
  recents?: string[];
  items: FlatItem[];
  /** 전 그룹 0건일 때만 오는 "비슷한 이름" 단지 */
  similar: FlatItem[];
  active: number;
  failed: boolean;
  /** 장애·결과 없음 대신 보일 안내(검색어가 너무 길 때 등) */
  notice?: string | null;
  onHover: (i: number) => void;
  onPick: (it: FlatItem) => void;
  onPickRecent?: (k: string) => void;
  onSubmit: () => void;
  /** 맨 아래 단추 글자 — 지금 입력 그대로("“잠실” 통합 검색 ›") */
  submitLabel: string;
  prefetch?: boolean;
};

export default function UnifiedSuggestPanel(p: Props) {
  const hero = p.variant === "hero";
  const q = p.query;
  const rowClass = (i: number) =>
    `flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left no-underline transition-colors hover:bg-primary-soft ${
      p.active === i ? "bg-primary-soft" : ""
    }`;
  const shell = hero
    ? "absolute inset-x-0 top-[calc(100%+8px)] z-40"
    : "absolute left-0 top-[calc(100%+8px)] z-50 w-[340px]";
  const card = hero
    ? "overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(16,28,54,.16)] [animation:riseIn_160ms_var(--ease-out)_backwards]"
    : "glass-strong popover-surface overflow-hidden rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_backwards]";

  if (p.recents) {
    return (
      <div className={shell}>
        <div className={card}>
          <div id={`${p.listId}-label`} className="px-3 pb-1 pt-1.5 text-[10px] font-extrabold text-text-3">
            최근 검색
          </div>
          <div role="listbox" id={p.listId} aria-labelledby={`${p.listId}-label`}>
            {p.recents.map((k, i) => (
              <button
                key={k}
                type="button"
                role="option"
                id={p.optionId(i)}
                aria-selected={p.active === i}
                tabIndex={-1}
                onMouseEnter={() => p.onHover(i)}
                onClick={() => p.onPickRecent?.(k)}
                className={rowClass(i)}
              >
                <span aria-hidden className="shrink-0 text-[12px] text-text-3">
                  ⌕
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">{k}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const empty = p.items.length === 0;
  const opts = p.notice ? [] : empty ? p.similar : p.items;
  const similarHead = `${p.listId}-similar`;
  return (
    <div className={shell}>
      <div className={card}>
        {p.notice ? (
          <div role="status" className="px-3 py-3 text-center text-[12px] font-bold text-text-2">
            {p.notice}
          </div>
        ) : p.failed && empty ? (
          <div role="status" className="px-3 py-3 text-center text-[12px] text-text-3">
            지금은 검색이 되지 않아요 (결과 없음이 아니에요)
          </div>
        ) : empty ? (
          <div className="flex flex-col gap-1 px-3 pb-1 pt-2.5">
            <div role="status" className="flex flex-col gap-1">
              <p className="break-words text-[13px] font-extrabold text-ink">{noMatchTitle(q)}</p>
              <p className="break-words text-[12px] text-text-3">
                {NO_MATCH_HINT} · {NO_MATCH_EXAMPLE}
              </p>
            </div>
            <Link
              href={`/map?q=${encodeURIComponent(q)}`}
              prefetch={false}
              className="mt-0.5 inline-flex min-h-10 w-fit items-center text-[12px] font-bold text-primary no-underline"
            >
              지도에서 찾기 ›
            </Link>
          </div>
        ) : null}
        {empty && opts.length > 0 && (
          <div
            id={similarHead}
            className="border-t border-divider px-3 pb-0.5 pt-2 text-[10px] font-extrabold text-text-3"
          >
            혹시 이 단지인가요? · 이름이 비슷한 단지
          </div>
        )}
        <div
          role="listbox"
          id={p.listId}
          {...(empty && opts.length > 0 ? { "aria-labelledby": similarHead } : { "aria-label": "검색 제안" })}
        >
          {opts.map((it, i) => (
            <Link
              key={it.key}
              href={it.href}
              prefetch={hero ? p.prefetch : false}
              role="option"
              id={p.optionId(i)}
              aria-selected={p.active === i}
              tabIndex={-1}
              onMouseEnter={() => p.onHover(i)}
              onClick={() => p.onPick(it)}
              className={rowClass(i)}
            >
              <span className="shrink-0 rounded bg-primary-soft px-1.5 py-px text-[10px] font-extrabold text-primary">
                {it.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-text-1">
                    {it.complex ? <Hl text={it.title} q={q} /> : it.title}
                  </span>
                  {it.fuzzy && !empty && <FuzzyBadge />}
                </span>
                {it.complex && (it.meta || it.facts) ? (
                  <span className="block truncate text-[12px] text-text-3">
                    {[it.meta, it.facts].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
              {!it.complex && it.meta && (
                <span className="max-w-[96px] shrink-0 truncate text-[12px] text-text-3">{it.meta}</span>
              )}
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={p.onSubmit}
          className="mt-0.5 flex min-h-10 w-full items-center rounded-[10px] border-t border-divider px-3 text-left text-[12px] font-bold text-primary transition-colors hover:bg-primary-soft"
        >
          {p.submitLabel}
        </button>
      </div>
    </div>
  );
}
