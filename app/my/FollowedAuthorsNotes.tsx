import Link from "@/app/components/IntentLink";
import { listFollowedAuthorsNotes } from "@/lib/follows/feed-db";
import { formatKstShortDate } from "@/lib/format/kst";
import { loaded, sectionState, type Loaded } from "@/lib/me/my-hub";
import { logger } from "@/lib/log";
import type { FollowedAuthorsFeed } from "@/lib/follows/feed-db";

/* [1057 · C2] 팔로우한 작성자의 새 노트 — /api/me/follows/feed 는 있었지만 어느 화면도 그리지 않았다(팔로우해도 아무것도 안 바뀌었다).
   서버 컴포넌트 · 최대 5줄(제목 · 작성자 · 지역 · 날짜 → /notes/[id]). 조회는 lib/follows/feed-db(라우트와 같은 함수).
   상태 셋을 가른다(lib/me/my-hub sectionState): 실패 → "불러오기 실패" · 팔로우 0명 → 사실 한 줄 · 팔로우는 있는데 노트 0건 → "없음". */

const ROWS = 5;

async function load(email: string): Promise<Loaded<FollowedAuthorsFeed>> {
  try {
    return loaded(await listFollowedAuthorsNotes(email, ROWS));
  } catch (e) {
    logger.error("[my] 팔로우 피드 조회 실패", e);
    return { ok: false };
  }
}

export async function FollowedAuthorsNotes({ email }: { email: string }) {
  const feed = await load(email);
  const followsNobody = feed.ok && feed.value.followingCount === 0;
  const section = sectionState(feed.ok ? loaded(feed.value.items) : { ok: false }, ROWS);

  return (
    <section className="card mt-4 max-md:mt-3 rounded-lg px-4 py-3" aria-label="팔로우한 작성자의 새 노트">
      <div className="flex items-center justify-between gap-3">
        <span className="t-caption font-bold text-text-3">팔로우한 작성자의 새 노트</span>
        {feed.ok && feed.value.followingCount > 0 && (
          <span className="t-caption text-text-3">팔로잉 {feed.value.followingCount.toLocaleString("ko-KR")}</span>
        )}
      </div>
      {section.kind === "error" ? (
        <p className="m-0 mt-1 t-sub text-text-2">새 노트 불러오기 실패 · 잠시 후 다시</p>
      ) : followsNobody ? (
        <p className="m-0 mt-1 t-sub text-text-2">팔로우한 작성자 없음 · 노트 작성자 이름을 누르면 프로필</p>
      ) : section.kind === "empty" ? (
        <p className="m-0 mt-1 t-body font-bold text-ink">새 노트 없음</p>
      ) : (
        <ul className="m-0 mt-1 flex list-none flex-col divide-y p-0" data-tone="plain">
          {section.items.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="flex min-h-10 flex-col justify-center py-2 no-underline">
                <span className="block truncate t-body font-semibold text-text-1">{n.title}</span>
                <span className="block truncate t-caption text-text-3">
                  {[n.authorLabel, n.regionLabel, formatKstShortDate(n.createdAt)].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
