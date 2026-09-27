"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

import { useMemo, useState } from "react";
import Link from "next/link";

/* [v4.1 · 리퀴드 목록] 분류 묶음 톤 순환(globals.css `data-tone`) — 용어 = hanji 부터 */
const CATEGORY_TONES = ["hanji", "blue", "mint", "sand"] as const;

/* 제안 웹6(2026-08-03) — 용어사전 내부 검색. 56개 용어를 스크롤로만 찾던
   화면에 클라이언트 필터를 얹는다. 데이터는 서버가 넘긴 그대로(단일 출처)라
   목록·검색이 어긋날 수 없다. 빈 결과는 "일치 없음"이라고 말한다 —
   여기서의 빈 결과는 순수 문자열 매칭 결과라 정직한 단정이 맞다. */

export type GlossaryGroupData = {
  category: string;
  terms: { slug: string; term: string; short: string }[];
};

export function GlossarySearch({ groups }: { groups: GlossaryGroupData[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return groups;
    return groups
      .map((g) => ({
        ...g,
        terms: g.terms.filter(
          (t) =>
            t.term.toLowerCase().includes(k) || t.short.toLowerCase().includes(k),
        ),
      }))
      .filter((g) => g.terms.length > 0);
  }, [groups, q]);

  const searching = q.trim().length > 0;
  const total = filtered.reduce((s, g) => s + g.terms.length, 0);

  return (
    <>
      {/* [v4 · 규칙 2] 주인공 = 검색창 하나. 검색 입력 — 16px 미만은 iOS 포커스 줌 유발(모바일 실측 7과 동일 규칙) */}
      <div className="rise-in-1 flex min-h-12 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5">
        <span aria-hidden className="text-text-3">⌕</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어 검색 (예: 전용면적, 갭투자)"
          aria-label="용어 검색"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-text-3 md:text-[13px]"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="검색어 지우기"
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center t-body text-text-3"
          >
            ✕
          </button>
        )}
      </div>

      {/* 분류 바로가기 — 검색 중에는 앵커가 무의미하므로 숨긴다. [v4] 여러 줄 칩 → 한 줄 가로 스크롤 */}
      {!searching && (
        <nav aria-label="분류 바로가기" className="-mx-3.5 mt-3 flex gap-2 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          {groups.map((g) => (
            <a
              key={g.category}
              href={`#${encodeURIComponent(g.category)}`}
              className="chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline"
            >
              {g.category} {g.terms.length}
            </a>
          ))}
        </nav>
      )}

      {searching && <p className="mt-3 t-sub text-text-3">‘{q.trim()}’ 일치 {total}개</p>}

      <div className="mt-8 flex flex-col gap-8">
        {filtered.length === 0 ? (
          <p className="py-6 text-center t-body text-text-3">일치하는 용어 없음 · 다른 표현으로 검색</p>
        ) : (
          filtered.map((g, gi) => (
            <section key={g.category} id={encodeURIComponent(g.category)} className="flex scroll-mt-24 flex-col gap-2">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                {g.category} <span className="t-num text-text-3">{g.terms.length}</span>
              </h2>
              {/* [v4 · 규칙 5·10] 높이가 다른 2열 카드 → 구분선 행(용어 굵게 + 요약 한 줄 / ›)
                  [v4.1 · 리퀴드 목록] 분류마다 톤 순환(hanji 부터) — 이웃한 분류가 같은 색을 갖지 않는다 */}
              <ul data-tone={CATEGORY_TONES[gi % CATEGORY_TONES.length]} className="card flex flex-col divide-y divide-line rounded-lg px-4">
                {g.terms.map((t) => (
                  <li key={t.slug}>
                    <Link
                      prefetch={false}
                      href={`/glossary/${t.slug}`}
                      className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block t-body font-bold text-ink">{t.term}</span>
                        <span className="mt-0.5 block truncate t-sub text-text-3">{t.short}</span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
