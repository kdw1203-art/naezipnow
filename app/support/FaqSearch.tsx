"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * [1000] FAQ 검색 — 입력하는 대로 질문·답을 걸러 /support/faq#id 로 보낸다.
 * 항목은 서버가 props 로 넘긴다(lib/support/faq.ts 는 가격·사업자 정보를 읽는 서버 쪽 모듈).
 * 예전 /support 의 "⌕ 무엇을 도와드릴까요?" 는 입력칸도 핸들러도 없는 <div> 였다.
 */
export type FaqSearchItem = {
  id: string;
  category: string;
  q: string;
  a: string;
};

const MAX_RESULTS = 6;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export function FaqSearch({
  items,
  placeholder = "궁금한 점을 검색해 보세요 (예: 해지, 환불, 위치정보)",
  contactHref = "#contact",
  className = "",
}: {
  items: FaqSearchItem[];
  placeholder?: string;
  /** 결과 없음 안내의 1:1 문의 링크 — /support 안에서는 앵커, 다른 화면에서는 /support#contact */
  contactHref?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const q = norm(query);
  const results = useMemo(() => {
    if (q.length < 1) return [];
    const scored = items
      .map((it) => {
        const inQ = norm(it.q).includes(q);
        const inA = norm(it.a).includes(q);
        const inC = norm(it.category).includes(q);
        const score = (inQ ? 3 : 0) + (inA ? 1 : 0) + (inC ? 1 : 0);
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map((x) => x.it);
  }, [items, q]);

  const showPanel = q.length > 0;

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <label className="field-focus flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-surface px-3.5">
        <Icon name="search" size={16} className="shrink-0 text-text-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="자주 묻는 질문 검색"
          aria-controls={listId}
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2.5 t-body text-ink outline-none placeholder:text-text-3"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-bg"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </label>
      <div id={listId} role="region" aria-live="polite" hidden={!showPanel}>
        {showPanel && results.length === 0 ? (
          <div className="rounded-xl bg-bg px-3.5 py-3 t-sub leading-[1.6] text-text-2">
            &ldquo;{query.trim()}&rdquo; 에 맞는 질문이 없어요 —{" "}
            <a href={contactHref} className="inline-block py-[5px] font-bold text-primary">
              1:1 문의로 남겨 주세요
            </a>
          </div>
        ) : (
          showPanel && (
            <ul className="card flex flex-col overflow-hidden rounded-xl">
              {results.map((it) => (
                <li key={it.id} className="border-b border-divider last:border-0">
                  <Link
                    href={`/support/faq#${it.id}`}
                    className="flex min-h-10 flex-col gap-0.5 px-3.5 py-2.5 no-underline"
                  >
                    <span className="t-caption font-bold text-text-3">{it.category}</span>
                    <span className="t-body font-bold text-ink">{it.q}</span>
                    <span className="clamp-2 t-sub leading-[1.5] text-text-2">{it.a}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
