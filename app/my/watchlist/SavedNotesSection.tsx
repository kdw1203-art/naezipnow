import Link from "next/link";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { listBookmarks } from "@/lib/bookmarks/store";
import { getNote } from "@/lib/inspection/store-db";
import { formatKstShortDate } from "@/lib/format/kst";

/* [1059] 저장한 노트 — /my/watchlist?tab=saved 의 둘째 묶음. 노트 상세의 "저장"(NoteSaveButton)이 프로필 설정 jsonb 에 담은 것을
   노트로 풀어 보인다(최대 30건 · 공개가 풀린 노트는 자연 제외). 실패는 빈 목록으로 누르지 않는다. */

const MAX_ROWS = 30;

type Row = { id: string; title: string; meta: string };
type Result = { ok: true; items: Row[]; hiddenCount: number } | { ok: false };

async function loadSavedNotes(email: string): Promise<Result> {
  let saved;
  try {
    saved = await listBookmarks(email, "note");
  } catch (e) {
    logger.error("[my/watchlist] 저장한 노트 조회 실패", e);
    return { ok: false };
  }
  const ids = Array.from(new Set(saved.map((b) => b.targetId))).slice(0, MAX_ROWS);
  const notes = await Promise.all(ids.map((id) => getNote(id).catch(() => null)));
  const items: Row[] = [];
  let hiddenCount = 0;
  for (const n of notes) {
    if (!n) continue;
    if (!n.isPublic) {
      hiddenCount++;
      continue;
    }
    items.push({
      id: n.id,
      title: n.title,
      meta: [n.region, n.aptName ?? null, n.visitDate ? formatKstShortDate(n.visitDate) : null].filter(Boolean).join(" · "),
    });
  }
  return { ok: true, items, hiddenCount };
}

export async function SavedNotesSection({ email }: { email: string }) {
  const loaded = await loadSavedNotes(email);
  const items = loaded.ok ? loaded.items : [];
  return (
    <section className="mt-8" aria-label="저장한 노트">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 t-body text-text-3">{loaded.ok ? `저장한 노트 ${items.length}개` : "저장한 노트"}</p>
        <Link
          href="/notes"
          className="tap-line inline-flex min-h-[40px] items-center t-body font-bold text-primary no-underline md:min-h-6"
        >
          공개 노트 ›
        </Link>
      </div>
      {!loaded.ok ? (
        <ErrorState title="저장한 노트 불러오기 실패" desc="잠시 후 다시 시도해 주세요." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bookmark"
          className="rise-in"
          title="저장한 노트 없음"
          desc="공개 노트 상세의 “저장”으로 담은 노트가 여기에 모여요."
          action={{ label: "공개 노트 보기", href: "/notes" }}
        />
      ) : (
        <>
          {loaded.hiddenCount > 0 && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
              비공개로 바뀐 노트 {loaded.hiddenCount}건은 숨김
            </p>
          )}
          <ul className="rise-in card m-0 flex list-none flex-col divide-y rounded-lg px-4 py-0.5" data-tone="plain">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`} className="flex min-h-10 flex-col justify-center py-2.5 no-underline">
                  <span className="block truncate t-body font-semibold text-text-1">{n.title}</span>
                  <span className="block t-caption text-text-3">{n.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
