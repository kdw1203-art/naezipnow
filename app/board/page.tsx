import Link from "@/app/components/IntentLink";
import { PageShell } from "@/app/components/PageShell";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { formatKstShortDate } from "@/lib/format/kst";
import {
  BOARD_FIELDS,
  BOARD_FIELD_LABEL,
  BOARD_KINDS,
  BOARD_KIND_LABEL,
  BOARD_PAGE_SIZE,
  boardHref,
  boardOrFilter,
  pageWindow,
  parseBoardParams,
  type BoardParams,
} from "@/lib/community/board-query";
import { logger } from "@/lib/log";

/* [1143 · 게시판 보기] 동네 글 · 뉴스를 쪽 번호로 넘겨 보고, 제목 · 내용 · 키워드로 찾는다.
   피드(/town)는 "더 보기"로 이어 붙여 오래된 글을 찾기 어렵다 — 여기는 20개씩 번호로 넘긴다. 검색 결과 화면이라 색인하지 않는다. */
export const dynamic = "force-dynamic";
export const metadata = buildPageMetadata({
  title: "게시판 · 글 검색",
  description: "동네 글 · 부동산 뉴스 · 공개 임장노트를 쪽 번호로 넘겨 보고 제목 · 내용 · 키워드로 찾습니다.",
  path: "/board",
  noIndex: true,
});

type Row = { id: string; title: string; meta: string; at: string; href: string };

async function load(p: BoardParams): Promise<{ rows: Row[]; total: number } | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const from = (p.page - 1) * BOARD_PAGE_SIZE;
  const or = boardOrFilter(p.kind, p.field, p.q);
  try {
    if (p.kind === "story") {
      let q = sb
        .from("posts")
        .select("id,title,category,district,author_label,comment_count,created_at", { count: "exact" })
        .or("visibility.is.null,visibility.eq.public")
        .order("created_at", { ascending: false })
        .range(from, from + BOARD_PAGE_SIZE - 1);
      if (or) q = q.or(or);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? "제목 없음"),
        meta: [r.district, r.category, r.author_label, Number(r.comment_count ?? 0) > 0 ? `댓글 ${r.comment_count}` : null].filter(Boolean).join(" · "),
        at: String(r.created_at),
        href: `/town/story/${r.id}`,
      }));
      return { rows, total: count ?? rows.length };
    }
    if (p.kind === "notes") {
      /* [1145] 공개 임장노트 — 제목 · 단지명 · 요약 · 지역으로 찾는다 */
      let q = sb
        .from("inspection_notes")
        .select("id,title,region,apt_name,author_label,created_at", { count: "exact" })
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .range(from, from + BOARD_PAGE_SIZE - 1);
      if (or) q = q.or(or);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? r.apt_name ?? "제목 없음"),
        meta: [r.region, r.apt_name, r.author_label].filter(Boolean).join(" · "),
        at: String(r.created_at),
        href: `/notes/${r.id}`,
      }));
      return { rows, total: count ?? rows.length };
    }
    let q = sb
      .from("board_posts")
      .select("id,title,region,source_name,created_at", { count: "exact" })
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(from, from + BOARD_PAGE_SIZE - 1);
    if (or) q = q.or(or);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? "제목 없음"),
      meta: [r.region, r.source_name].filter(Boolean).join(" · "),
      at: String(r.created_at),
      href: `/town/news/${r.id}`,
    }));
    return { rows, total: count ?? rows.length };
  } catch (e) {
    logger.error("[town/board] 목록 조회 실패", e);
    return null;
  }
}

export default async function TownBoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseBoardParams(await searchParams);
  const res = await load(p);
  const win = res ? pageWindow(p.page, res.total) : null;

  return (
    <PageShell title="게시판" breadcrumb="동네 › 게시판">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3">
        <nav aria-label="글 종류" className="flex gap-1.5">
          {BOARD_KINDS.map((k) => (
            <Link
              key={k}
              href={boardHref({ kind: k, q: p.q, field: p.field })}
              aria-current={p.kind === k ? "page" : undefined}
              className={`press flex min-h-10 items-center rounded-full border px-3.5 t-sub font-bold no-underline ${
                p.kind === k ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"
              }`}
            >
              {BOARD_KIND_LABEL[k]}
            </Link>
          ))}
        </nav>

        <form action="/board" method="get" role="search" className="card flex flex-wrap items-center gap-2 rounded-2xl p-3">
          {p.kind !== "story" && <input type="hidden" name="kind" value={p.kind} />}
          <label htmlFor="board-in" className="sr-only">
            검색 조건
          </label>
          <select id="board-in" name="in" defaultValue={p.field} className="min-h-10 rounded-lg border border-line bg-surface px-2.5 t-sub text-text-1">
            {BOARD_FIELDS.map((f) => (
              <option key={f} value={f}>
                {BOARD_FIELD_LABEL[f]}
              </option>
            ))}
          </select>
          <label htmlFor="board-q" className="sr-only">
            검색어
          </label>
          <input
            id="board-q"
            name="q"
            type="search"
            defaultValue={p.q}
            maxLength={40}
            placeholder="검색어"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 t-body text-text-1"
          />
          <button type="submit" className="btn-primary btn-md">
            검색
          </button>
        </form>

        {!res || !win ? (
          <p className="card m-0 rounded-2xl p-5 t-body text-text-3">게시글 불러오기 실패 · 잠시 후 다시</p>
        ) : (
          <>
            <p className="m-0 px-1 t-caption text-text-3">
              {p.q ? `"${p.q}" · ${BOARD_FIELD_LABEL[p.field]} · ` : ""}
              {res.total.toLocaleString("ko-KR")}건 · {win.current} / {win.last}쪽
            </p>
            {res.rows.length === 0 ? (
              <p className="card m-0 rounded-2xl p-5 t-body text-text-3">{p.q ? "검색 결과 없음" : "게시글 없음"}</p>
            ) : (
              <ol className="card m-0 list-none rounded-2xl p-0" start={(win.current - 1) * BOARD_PAGE_SIZE + 1}>
                {res.rows.map((r) => (
                  <li key={r.id} className="border-t border-line first:border-t-0">
                    <Link href={r.href} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 no-underline">
                      <span className="min-w-0">
                        <span className="block truncate t-body font-bold text-ink hover:text-primary">{r.title}</span>
                        {r.meta ? <span className="block truncate t-caption text-text-3">{r.meta}</span> : null}
                      </span>
                      <span className="flex-none t-caption t-num text-text-3">{formatKstShortDate(r.at)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {win.last > 1 && (
              <nav aria-label="쪽 번호" className="flex flex-wrap items-center justify-center gap-1">
                {win.pages.map((n, i) =>
                  n === 0 ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 t-sub text-text-3">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={boardHref({ ...p, page: n })}
                      aria-current={n === win.current ? "page" : undefined}
                      aria-label={`${n}쪽`}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 t-sub font-bold no-underline ${
                        n === win.current ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"
                      }`}
                    >
                      {n}
                    </Link>
                  ),
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
