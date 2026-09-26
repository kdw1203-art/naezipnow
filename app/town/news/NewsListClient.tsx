"use client";

/* 뉴스룸 목록 + 필터 (2026-08-10 ISR 전환 · [1006] 행 목록으로 재구성)
   서버가 ?region= 을 읽으면 라우트 전체가 동적이 되어 크롤 1회 = 함수 호출
   1회가 된다(비용 실측). 목록 데이터는 어차피 전량을 받아 메모리에서 거르던
   것이라, 거르는 자리만 클라이언트로 옮기면 서버 렌더는 지역과 무관해진다.
   딥링크(?region=서울&cat=경제)는 마운트 후 location.search 로 적용된다.

   [1006] 사진 격자 카드 → **행(row) 목록**. 뉴스는 사람이 쓴 이야기가 아니라
   수집한 기사다: 출처 · 발행시각 · 분류 태그 · 제목 · 요약 한 줄 · 원문 ↗ 이 한 행에
   선다. 썸네일은 실제 이미지가 있을 때만 작게 — 예전엔 이미지 없는 기사에도
   <img> 상자(그라디언트+아이콘)를 그려 목록 절반이 빈 상자였다. 첫 장은 서버가
   40행을 HTML 에 싣고, 나머지는 "더 보기"가 /api/town/news 로 이어 붙인다.
   행 DTO 는 서버(lib/town/news-list)가 평탄화해 원본 메타를 싣지 않는다. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { CoverImage } from "@/app/components/CoverImage";
import { findNewsRegionChip, type NewsRegionChip } from "@/lib/town/news-regions";
import { NEWS_LIST_PAGE, type NewsCategoryTab, type NewsRow } from "@/lib/town/news-row";

/* 칩 전환은 서버 왕복 없는 얕은 URL 갱신으로 한다. Next 14.1+ 는
   window.history.pushState 를 라우터와 동기화한다. Link(?region=) 를 쓰면 같은 ISR
   payload 를 다시 받아오는 RSC 왕복이 생긴다(실측).
   [970 · C-31] 여러 키를 한 번의 pushState 로 — 히스토리 항목이 둘 쌓이지 않게. */
function pushParamUrl(patch: Partial<Record<"region" | "cat", string | null>>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.pushState(null, "", url);
}

/* [#67] 관련 보도 접힘 목록 — 행 아래 <details>. */
function RelatedFold({ related }: { related: NewsRow["related"] }) {
  if (related.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="inline-flex min-h-[24px] cursor-pointer list-none items-center t-sub font-bold text-primary">
        관련 보도 {related.length}건 ▾
      </summary>
      <ul className="mt-1 flex flex-col gap-1 border-l-2 border-line pl-3">
        {related.map((r) => (
          <li key={r.id}>
            <Link
              href={`/town/news/${r.id}`}
              className="inline-flex min-h-[24px] flex-col justify-center gap-px no-underline"
            >
              <span className="line-clamp-2 t-sub font-bold text-ink">{r.title}</span>
              <span className="t-caption text-text-3">
                {r.source} · {r.timeLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* 뉴스 행 — 규칙은 globals.css .news-row. 제목·요약은 상세(/town/news/[id]) 로,
   ↗ 는 원문(새 탭 · nofollow) 으로. 두 링크가 한 행에 있어도 중첩 앵커가 아니다. */
function NewsRowView({ row, lead = false }: { row: NewsRow; lead?: boolean }) {
  /* 원문 매체의 og:image 가 죽었으면(핫링크 차단·삭제) 썸네일 칸을 **통째로** 뺀다 —
     빈 회색 상자가 남으면 "이미지 없는 기사에 <img> 를 그리지 말 것" 규칙을 어기는 셈이다. */
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = Boolean(row.image) && !thumbFailed;
  return (
    <article
      className={`news-row ${thumb ? "news-row--thumb" : ""} ${lead ? "news-row--lead" : ""}`}
    >
      {thumb && (
        <Link href={`/town/news/${row.id}`} className="news-row__thumb block" tabIndex={-1} aria-hidden="true">
          <CoverImage
            src={row.image}
            alt=""
            imgClassName="absolute inset-0 h-full w-full object-cover"
            sizes="88px"
            onFailed={() => setThumbFailed(true)}
          />
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="news-row__meta">
          {row.category && <span className="news-tag">{row.category}</span>}
          {row.source && <span className="news-source">{row.source}</span>}
          <time dateTime={row.publishedAt}>{row.timeLabel}</time>
          {row.city && <span>· {row.city}</span>}
        </div>
        <Link href={`/town/news/${row.id}`} className="news-row__title no-underline">
          <span className={lead ? "line-clamp-3" : "line-clamp-2"}>{row.title}</span>
        </Link>
        {row.summary && (
          <p className={`news-row__summary ${lead ? "line-clamp-2" : "line-clamp-1"}`}>{row.summary}</p>
        )}
        {row.related.length > 0 && <RelatedFold related={row.related} />}
      </div>
      {row.sourceUrl ? (
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noopener nofollow"
          className="news-ext"
          aria-label={`원문 보기${row.host ? ` — ${row.host}` : ""}`}
          title={row.host ? `원문 · ${row.host}` : "원문 보기"}
        >
          <Icon name="link" size={15} />
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
    </article>
  );
}

export function NewsListClient({
  rows,
  categories,
  regions,
  total,
  hasMore: initialHasMore,
}: {
  /** 첫 장 행(서버가 HTML 에 실은 것) */
  rows: NewsRow[];
  /** 분류 탭 — 서버가 **전체 목록**(첫 장이 아니라)에서 센 값 */
  categories: NewsCategoryTab[];
  /** [970 · C-23] 시·도 칩(건수순) + 그 안의 시·군·구 칩 — 서버가 계산한 트리 */
  regions: NewsRegionChip[];
  /** 전체 행 수(같은 사건 접은 뒤) */
  total: number;
  /** 첫 장 너머가 있는가 */
  hasMore: boolean;
}) {
  /* [2026-08-10 정정] useSearchParams 는 프리렌더에서 Suspense 폴백을 HTML 에 박아
     크롤러에게 목록이 사라졌다. SSR 은 항상 전체 첫 장을 그리고, 필터는 마운트 후
     location.search 에서 읽어 적용한다. */
  const [active, setActive] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const categoryLabels = useMemo(() => categories.map((c) => c.label), [categories]);
  useEffect(() => {
    const read = () => {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("region");
      setActive(raw && findNewsRegionChip(regions, raw) ? raw : null);
      const cat = sp.get("cat");
      setActiveCat(cat && categoryLabels.includes(cat) ? cat : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // regions/categories 는 서버 데이터 파생 고정 배열이라 join 값으로만 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions.map((r) => r.label).join("|"), categoryLabels.join("|")]);

  /* [1006] "더 보기" — /api/town/news?offset= 로 다음 장을 이어 붙인다 */
  const [extra, setExtra] = useState<NewsRow[]>([]);
  const [more, setMore] = useState(initialHasMore);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const allRows = useMemo(() => {
    if (extra.length === 0) return rows;
    const seen = new Set(rows.map((r) => r.id));
    return [...rows, ...extra.filter((r) => !seen.has(r.id))];
  }, [rows, extra]);
  const loadMore = useCallback(async () => {
    if (moreLoading) return;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const r = await fetch(`/api/town/news?offset=${allRows.length}&limit=${NEWS_LIST_PAGE}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { items?: NewsRow[]; hasMore?: boolean };
      const items = Array.isArray(j.items) ? j.items : [];
      setExtra((prev) => {
        const have = new Set([...rows, ...prev].map((x) => x.id));
        return [...prev, ...items.filter((x) => !have.has(x.id))];
      });
      setMore(Boolean(j.hasMore));
    } catch {
      setMoreError("더 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setMoreLoading(false);
    }
  }, [allRows.length, moreLoading, rows]);

  /* [970 · C-23] 활성 칩이 거르는 원본 city 값들 — 시·도 칩이면 그 안의 시·군·구까지 */
  const activeHit = findNewsRegionChip(regions, active);
  const activeValues = new Set(activeHit?.chip.values ?? []);
  const activeGroup = activeHit ? (activeHit.parent ?? activeHit.chip) : null;
  const list = allRows.filter(
    (c) => (!active || activeValues.has(c.city)) && (!activeCat || c.category === activeCat),
  );
  const anyFilter = Boolean(active || activeCat);
  const clearAll = () => {
    pushParamUrl({ region: null, cat: null });
    setActive(null);
    setActiveCat(null);
  };

  return (
    <>
      {/* 분류 탭 — 신문 섹션 탭(밑줄). 카테고리 값은 수집분의 실제 분류(부동산·경제·
          신탁·정비사업·사회·정보/소식…)를 서버가 전체 목록에서 센 것이다. */}
      {categories.length > 1 && (
        <div className="news-tabs rise-in mb-2" role="group" aria-label="분류">
          <button type="button" aria-pressed={!activeCat} onClick={() => { pushParamUrl({ cat: null }); setActiveCat(null); }}>
            전체
            <span className="t-num">{total}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.label}
              type="button"
              aria-pressed={activeCat === c.label}
              onClick={() => {
                const next = activeCat === c.label ? null : c.label;
                pushParamUrl({ cat: next });
                setActiveCat(next);
              }}
            >
              {c.label}
              <span className="t-num">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 지역 칩 — 얕은 pushState 라 서버 왕복이 없다. 첫 줄은 시·도(건수순) */}
      {regions.length > 0 && (
        <div className="rise-in mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="지역">
          <span className="t-caption font-extrabold tracking-wider text-text-3">지역</span>
          <button
            type="button"
            onClick={() => { pushParamUrl({ region: null }); setActive(null); }}
            aria-pressed={!active}
            className={`chip px-3 py-1.5 t-sub ${
              active ? "border border-line bg-surface text-text-2" : "chip-active"
            }`}
          >
            전체
          </button>
          {regions.map((r) => {
            const on = activeGroup?.label === r.label;
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => { pushParamUrl({ region: r.label }); setActive(r.label); }}
                aria-pressed={on}
                className={`chip px-3 py-1.5 t-sub ${
                  on ? "chip-active" : "border border-line bg-surface text-text-2"
                }`}
              >
                {r.label}
                <span className="ml-1 font-normal">{r.count}</span>
              </button>
            );
          })}
          <Link
            href="/search"
            className="press chip ml-auto inline-flex items-center gap-1 border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline"
          >
            <Icon name="search" size={13} />
            뉴스 검색
          </Link>
        </div>
      )}
      {/* [970 · C-23] 두 번째 줄 — 활성 시·도 안의 시·군·구(건수순) */}
      {activeGroup && activeGroup.children.length > 0 && (
        <div
          className="rise-in mb-2 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={`${activeGroup.label} 안 지역`}
        >
          <span className="t-sub font-bold text-text-3">{activeGroup.label} 안</span>
          <button
            type="button"
            onClick={() => { pushParamUrl({ region: activeGroup.label }); setActive(activeGroup.label); }}
            aria-pressed={active === activeGroup.label}
            className={`chip px-3 py-1.5 t-sub ${
              active === activeGroup.label ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            {activeGroup.label} 전체
          </button>
          {activeGroup.children.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => { pushParamUrl({ region: c.label }); setActive(c.label); }}
              aria-pressed={active === c.label}
              className={`chip px-3 py-1.5 t-sub ${
                active === c.label ? "chip-active" : "border border-line bg-surface text-text-2"
              }`}
            >
              {c.label}
              <span className="ml-1 font-normal">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 무엇을 세고 있는지 — 필터가 걸리면 "받은 것 중 이 조건" 으로 모수를 밝힌다 */}
      <p className="mb-1 t-sub text-text-3" role="status">
        {/* 여기서 세는 건 **행**(같은 사건을 접은 뒤)이다 — 마스트헤드의 "최근 수집분 n건"(기사 수)과
            다른 수이므로 단위도 다르게 부른다 */}
        {anyFilter
          ? `지금까지 받은 ${allRows.length.toLocaleString("ko-KR")}행 중 이 조건 ${list.length.toLocaleString("ko-KR")}행`
          : `${allRows.length.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}행 · 같은 사건은 한 행으로 접었어요`}
      </p>

      {/* 행 목록 — 첫 행은 톱기사(제목 크게 · 요약 두 줄) */}
      {list.length > 0 && (
        <div className="news-list rise-in">
          {list.map((row, i) => (
            <NewsRowView key={row.id} row={row} lead={i === 0} />
          ))}
        </div>
      )}

      {/* 필터 결과 0건 — 빈 상태 (지역·분류 어느 쪽이든) */}
      {list.length === 0 && anyFilter && (
        <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
          <div className="t-title">
            <Icon name="newspaper" size={26} />
          </div>
          <div className="t-body font-bold text-text-1">
            {[active, activeCat].filter(Boolean).join(" · ")} 관련 기사가{" "}
            {more ? "지금까지 받은 목록엔 없어요" : "아직 없어요"}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {more && (
              <button
                type="button"
                onClick={loadMore}
                disabled={moreLoading}
                className="btn-soft mt-1 rounded-[10px] px-4 py-2 t-sub font-bold disabled:opacity-60"
              >
                {moreLoading ? "불러오는 중…" : "이전 기사 더 받기"}
              </button>
            )}
            <button
              type="button"
              onClick={clearAll}
              className="btn-primary mt-1 rounded-[10px] px-4 py-2 t-sub"
            >
              전체 기사 보기
            </button>
          </div>
        </div>
      )}

      {/* [1006] 더 보기 / 마지막 — 필터와 무관하게 전체 목록의 다음 장을 붙인다 */}
      {(more || list.length > 0) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {moreError && (
            <p role="alert" className="t-sub text-text-2">
              {moreError}
            </p>
          )}
          {more ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={moreLoading}
              aria-busy={moreLoading}
              className="btn-soft tap rounded-xl px-5 py-2.5 t-body font-bold disabled:opacity-60"
            >
              {moreLoading ? "불러오는 중…" : "이전 기사 더 보기"}
            </button>
          ) : (
            <p role="status" className="t-sub text-text-3">
              접힌 {total.toLocaleString("ko-KR")}행을 다 봤어요 · 더 오래된 기사는{" "}
              <Link href="/digest" className="inline-flex min-h-[24px] items-center font-bold text-primary">
                주간 다이제스트
              </Link>
              와{" "}
              <Link href="/search" className="inline-flex min-h-[24px] items-center font-bold text-primary">
                검색
              </Link>
              에서
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default NewsListClient;
