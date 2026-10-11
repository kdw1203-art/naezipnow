import Link from "next/link";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { listBookmarks } from "@/lib/bookmarks/store";
import { getPost } from "@/lib/posts-store";
import { postHref } from "@/lib/town/post-href";
import { formatKstShortDate } from "@/lib/format/kst";

/* ============================================================
   [1056 · C2] 저장한 글 — /my/watchlist?tab=saved (로그인 필수)
   bookmarks(target_type='post', 동네 글 상세의 "저장" — app/town/news/[id]/PostInteractions) → posts 조인.
   저장은 되는데 목록이 어디에도 없었다. 삭제된 글은 자연 제외(getPost null).
   임장노트 저장("note")은 DB CHECK 가 막아 아직 없다 — lib/bookmarks/store.ts.
   ============================================================ */

const MAX_ROWS = 30;

type SavedPostRow = { id: string; title: string; href: string; meta: string };

type SavedPostsResult =
  | { ok: true; items: SavedPostRow[]; failedCount: number }
  | { ok: false };

/* 목록 전체 실패는 ok:false(화면은 "불러오기 실패"), 개별 글 해석 실패는 failedCount —
   실패를 빈 배열로 누르면 "저장한 글 없음"이 되고, 그건 거짓이다. */
async function loadSavedPosts(email: string): Promise<SavedPostsResult> {
  let bms;
  try {
    bms = await listBookmarks(email, "post");
  } catch (e) {
    logger.error("[my/watchlist] 저장한 글 조회 실패", e);
    return { ok: false };
  }
  const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, MAX_ROWS);
  let failedCount = 0;
  const resolved = await Promise.all(
    ids.map((id) =>
      getPost(id).catch(() => {
        failedCount += 1;
        return null;
      }),
    ),
  );
  const items = resolved
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({
      id: p.id,
      title: p.title,
      href: postHref(p),
      meta: [p.district || p.city, formatKstShortDate(p.createdAt)].filter(Boolean).join(" · "),
    }));
  return { ok: true, items, failedCount };
}

export async function SavedPostsSection({ email }: { email: string }) {
  const loaded = await loadSavedPosts(email);
  const items = loaded.ok ? loaded.items : [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 t-body text-text-3">
          {loaded.ok ? `저장한 글 ${items.length}개` : "저장한 글"}
        </p>
        <Link
          href="/town"
          className="tap-line inline-flex min-h-[40px] items-center t-body font-bold text-primary no-underline md:min-h-6"
        >
          동네이야기 ›
        </Link>
      </div>

      {!loaded.ok ? (
        <ErrorState title="저장한 글 불러오기 실패" desc="잠시 후 다시 시도해 주세요." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bookmark"
          className="rise-in"
          title="저장한 글 없음"
          desc="동네 글 상세의 “저장”으로 담은 글이 여기에 모여요."
          action={{ label: "동네이야기 보기", href: "/town" }}
        />
      ) : (
        <>
          {loaded.failedCount > 0 && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
              저장한 글 중 {loaded.failedCount}건 불러오기 실패 · 잠시 후 다시
            </p>
          )}
          <ul className="rise-in card m-0 flex list-none flex-col divide-y rounded-lg px-4 py-0.5" data-tone="plain">
            {items.map((p) => (
              <li key={p.id}>
                <Link href={p.href} className="flex min-h-10 flex-col justify-center py-2.5 no-underline">
                  <span className="block truncate t-body font-semibold text-text-1">{p.title}</span>
                  <span className="block t-caption text-text-3">{p.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
