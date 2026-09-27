"use client";

/* 뉴스룸 목록 + 필터 (2026-08-10 ISR 전환 · [1006] 행 목록으로 재구성)
   서버가 ?region= 을 읽으면 라우트 전체가 동적이 되어 크롤 1회 = 함수 호출
   1회가 된다(비용 실측). 목록 데이터는 어차피 전량을 받아 메모리에서 거르던
   것이라, 거르는 자리만 클라이언트로 옮기면 서버 렌더는 지역과 무관해진다.
   딥링크(?region=서울&cat=경제)는 마운트 후 location.search 로 적용된다.
   첫 장은 서버가 40행을 HTML 에 싣고, 나머지는 "더 보기"가 /api/town/news 로
   이어 붙인다. 행 DTO 는 서버(lib/town/news-list)가 평탄화해 원본 메타를 싣지 않는다.

   [v4] "한 화면 한 가지" — 기사 행은 **제목 한 줄 + 매체·시각 한 줄**(같은 높이의 행, 1px 구분선).
   예전 행의 썸네일(있는 기사만 — 행 높이가 들쭉날쭉) · 톱기사 크게(첫 행 제목 3줄·요약 2줄) · 요약 한 줄 ·
   분류 배지(.news-tag) · "관련 보도 n건 ▾" 접힘을 뺐다. 요약·관련 보도는 기사 상세(/town/news/[id])가
   그대로 보여 준다 — 목록 행의 메타 줄은 "관련 n" 만 센다. 원문 ↗(40px)은 행 오른쪽에 그대로.
   지역 칩 두 줄(시·도 / 시·군·구)은 한 줄 가로 스크롤 필터 칩으로, "지역"·"○○ 안" 설명 라벨과
   "n / m행 · 같은 사건은 한 행으로 접었어요" 상태 문장, 마지막 장 안내 문장은 뺐다.
   [1013] 썸네일은 다시 넣었다 — 이번엔 **모든 행에 같은 72px 칸**(사진 없으면 매체 이름)이라 행 높이가 같다. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { findNewsRegionChip, type NewsRegionChip } from "@/lib/town/news-regions";
import { NEWS_LIST_PAGE, type NewsCategoryTab, type NewsRow } from "@/lib/town/news-row";
import { NewsThumb } from "./NewsThumb";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

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

/* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 — 동네이야기 피드(feed-client)와 같은 값 */
function chipClass(active: boolean): string {
  return `chip shrink-0 px-3 py-1.5 t-sub font-bold ${active ? "chip-active border" : "border border-line bg-surface text-text-2"}`;
}

/* [v4] 기사 행 — 왼쪽(제목 한 줄 + 매체 · 시각 · 지역 · 분류 한 줄)은 상세로, 오른쪽 ↗(40px)은 원문(새 탭 · nofollow).
   두 링크가 형제라 중첩 앵커가 아니다. 메타 줄 왼쪽(매체)은 말줄임, 시각은 줄지 않는다.
   [1013] 주인님 "뉴스는 이미지 파일이 있어야" — 행 맨 왼쪽에 72px 정사각 썸네일(NewsThumb, 동네이야기 피드와 같은 칸).
   사진이 없거나 깨지면 같은 칸에 매체 이름이라 행 높이는 늘 같다. 제목은 데스크톱 두 줄(폰은 한 줄 규칙). */
function NewsRowView({ row, first }: { row: NewsRow; first: boolean }) {
  const tail = [row.city, row.category, row.related.length > 0 ? `관련 ${row.related.length}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-2">
      <Link href={`/town/news/${row.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 no-underline">
        <NewsThumb src={row.image} source={row.source} priority={first} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="clamp-2 t-body font-bold text-ink">{row.title}</span>
          <span className="flex min-w-0 items-baseline t-sub text-text-3">
            {row.source && <span className="min-w-0 truncate font-bold text-text-2">{row.source}</span>}
            <span className="shrink-0 whitespace-pre">
              {row.source ? " · " : ""}
              <time dateTime={row.publishedAt}>{row.timeLabel}</time>
              {tail ? ` · ${tail}` : ""}
            </span>
          </span>
        </span>
      </Link>
      {row.sourceUrl ? (
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noopener nofollow"
          className="news-ext shrink-0"
          aria-label={`원문 보기${row.host ? ` — ${row.host}` : ""}`}
          title={row.host ? `원문 · ${row.host}` : "원문 보기"}
        >
          <Icon name="link" size={15} />
        </a>
      ) : null}
    </li>
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
      {/* 분류 탭 — 밑줄 탭(.news-tabs). 카테고리 값은 수집분의 실제 분류(부동산·경제·
          신탁·정비사업·사회·정보/소식…)를 서버가 전체 목록에서 센 것이다. */}
      {categories.length > 1 && (
        <div className="news-tabs" role="group" aria-label="분류">
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

      {/* 지역 칩 — 얕은 pushState 라 서버 왕복이 없다. [v4] 한 줄 가로 스크롤(첫 줄은 시·도, 건수순) */}
      {regions.length > 0 && (
        <div className="rail-x -mx-3.5 px-3.5 pt-3 md:mx-0 md:px-0" role="group" aria-label="지역">
          <button
            type="button"
            onClick={() => { pushParamUrl({ region: null }); setActive(null); }}
            aria-pressed={!active}
            className={chipClass(!active)}
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
                className={chipClass(on)}
              >
                {r.label}
                <span className="ml-1 font-normal tabular-nums">{r.count}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* [970 · C-23] 두 번째 줄 — 활성 시·도 안의 시·군·구(건수순). [v4] 한 줄 가로 스크롤 */}
      {activeGroup && activeGroup.children.length > 0 && (
        <div
          className="rail-x -mx-3.5 px-3.5 pt-2 md:mx-0 md:px-0"
          role="group"
          aria-label={`${activeGroup.label} 안 지역`}
        >
          <button
            type="button"
            onClick={() => { pushParamUrl({ region: activeGroup.label }); setActive(activeGroup.label); }}
            aria-pressed={active === activeGroup.label}
            className={chipClass(active === activeGroup.label)}
          >
            {activeGroup.label} 전체
          </button>
          {activeGroup.children.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => { pushParamUrl({ region: c.label }); setActive(c.label); }}
              aria-pressed={active === c.label}
              className={chipClass(active === c.label)}
            >
              {c.label}
              <span className="ml-1 font-normal tabular-nums">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 필터가 걸렸을 때만 모수를 밝힌다 — 여기서 세는 건 **행**(같은 사건을 접은 뒤) */}
      {anyFilter && list.length > 0 && (
        <p className="pt-2 t-sub text-text-3" role="status">
          받은 {allRows.length.toLocaleString("ko-KR")}행 중 {list.length.toLocaleString("ko-KR")}행
        </p>
      )}

      {/* [v4] 행 목록 — 같은 높이의 1px 구분선 행 */}
      {list.length > 0 && (
        <ul data-tone="hanji" className="mt-1 divide-y divide-line">
          {list.map((row, i) => (
            <NewsRowView key={row.id} row={row} first={i === 0} />
          ))}
        </ul>
      )}

      {/* 필터 결과 0건 — [v4] 빈 화면은 한 줄 + 버튼(지역·분류 어느 쪽이든) */}
      {list.length === 0 && anyFilter && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          {/* [1012] 규칙 6 — 어디서(지역·분류)·얼마나(받은 행 수)를 적는다 */}
          <p className="t-body text-text-2">
            {[active, activeCat].filter(Boolean).join(" · ")} 기사가{" "}
            {more
              ? `지금까지 받은 ${allRows.length.toLocaleString("ko-KR")}행에는 없어요`
              : "최근 수집분에 없어요"}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {more && (
              <button
                type="button"
                onClick={loadMore}
                disabled={moreLoading}
                className="btn-outline btn-md disabled:opacity-60"
              >
                {moreLoading ? "불러오는 중…" : "이전 기사 더 받기"}
              </button>
            )}
            <button type="button" onClick={clearAll} className="btn-primary btn-md">
              {/* [1012] 규칙 5 — 동사 + 구체 대상(행 수) */}
              전체 {total.toLocaleString("ko-KR")}행 보기
            </button>
          </div>
        </div>
      )}

      {/* [1006] 더 보기 — 필터와 무관하게 전체 목록의 다음 장을 붙인다.
          [v4] 끝에 닿으면 아무것도 적지 않는다("접힌 n행을 다 봤어요 · 더 오래된 기사는 …" 문장 삭제 —
          주간 다이제스트는 목록 위 행, 검색은 머리 오른쪽에 있다) */}
      {more && (
        <div className="mt-3 flex flex-col items-center gap-3 border-t border-line pt-4">
          {moreError && (
            <p role="alert" className="t-sub text-text-2">
              {moreError}
            </p>
          )}
          <button
            type="button"
            onClick={loadMore}
            disabled={moreLoading}
            aria-busy={moreLoading}
            className="btn-ghost btn-md w-full"
          >
            {moreLoading ? "불러오는 중…" : "이전 기사 더 보기"}
          </button>
        </div>
      )}
    </>
  );
}

export default NewsListClient;
