import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { CreatorClient } from "./creator-client";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes } from "@/lib/inspection/store-db";
import { isVerifiedExpert } from "@/lib/experts/is-verified";
import { getServiceSupabase } from "@/lib/supabase/service";
/* [970 · C-15] SETTLEMENT 는 여기서 쓰이지 않았다(미사용 import) — 요율 표기는
   creator-client 가 marketplace-fees 단일 출처에서 직접 읽는다 */
import { getCreatorSales } from "@/lib/creator/sales";

/* 개인 크리에이터 대시보드 — 세션별 개인 데이터라 색인 대상이 아니다. */
export const metadata = { robots: { index: false, follow: false } };

/* 시안 22e — 크리에이터 대시보드 · 성장 보상 + 23c "탑 임장러 현황" 탭
   실데이터: 세션(safeAuth) 기준 내 공개 노트 수 + 총 저장 수(bookmarks · 내 공개 노트 대상)
   — 조회 불가 시 "—" 표기, 비로그인 시 로그인 유도 */

export const dynamic = "force-dynamic";

/** 내 공개 노트가 받은 저장(bookmarks) 수 — env 미설정·오류 시 null("—") */
async function countNoteSaves(noteIds: string[]): Promise<number | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    if (noteIds.length === 0) return 0;
    const { count, error } = await sb
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .in("target_id", noteIds.slice(0, 100));
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function CreatorDashboardPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      /* [v4 · 규칙 1·7·10] 아이콘 + 가운데 정렬 카드 → 제목 한 줄 + 사실 한 줄 + 버튼(760px 줄 왼쪽) */
      <PageShell>
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-3">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">크리에이터 대시보드</h1>
            {/* 화면이 실제로 세는 것만 말한다(공개 노트 수·저장 수·유료 리포트 판매) — "탑 임장러 현황"은 집계가 없다 */}
            <p className="t-sub text-text-3">내 계정 기준 · 공개 노트 수 · 저장 수 · 유료 리포트 판매</p>
          </header>
          <Link href="/login?callbackUrl=/my/creator" className="btn-primary btn-md no-underline">
            로그인하고 내 노트 성과 보기
          </Link>
          <Link href="/notes" className="inline-flex min-h-10 items-center t-sub font-bold text-text-3 no-underline">
            공개 임장노트 목록 보기 ›
          </Link>
        </div>
      </PageShell>
    );
  }

  let publicNoteCount: number | null = null;
  let totalSaves: number | null = null;
  let publicNotesLen = 0;
  let noteOptions: { id: string; title: string }[] = [];
  try {
    if (getServiceSupabase()) {
      const notes = await listNotes(email);
      const publicNotes = notes.filter((n) => n.isPublic);
      publicNotesLen = publicNotes.length;
      publicNoteCount = publicNotes.length;
      /* 판매 선택지는 **비공개 노트만** — 공개 노트는 누구나 무료로 읽으므로
         '구매하면 열람'이라는 전달물이 성립하지 않는다(API 도 같은 규칙로 막는다). */
      noteOptions = notes
        .filter((n) => !n.isPublic)
        .slice(0, 30)
        .map((n) => ({ id: n.id, title: n.title }));
      totalSaves = await countNoteSaves(publicNotes.map((n) => n.id));
    }
  } catch {
    publicNoteCount = null;
    totalSaves = null;
  }

  // 크리에이터 게이트 (item 12): 인증 전문가 OR 크리에이터 요건(공개 노트 1건 이상)
  const verified = await isVerifiedExpert(email).catch(() => false);
  const isCreator = verified || publicNotesLen > 0;
  if (!isCreator) {
    return (
      /* [v4 · 규칙 1·7·10] 이모지(✍) + 가운데 정렬 카드 → 제목 한 줄 + 사실 한 줄 + 버튼 */
      <PageShell>
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-3">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">크리에이터 대시보드</h1>
            <p className="t-sub text-text-3">공개 임장노트 1건 이상 발행 뒤 열림 · 콘텐츠 성과</p>
          </header>
          <Link href="/notes/new" className="btn-primary btn-md no-underline">
            공개 노트 작성하기
          </Link>
          <Link href="/my" className="inline-flex min-h-10 items-center t-sub font-bold text-text-3 no-underline">
            마이로 돌아가기 ›
          </Link>
        </div>
      </PageShell>
    );
  }

  const sales = await getCreatorSales(email);

  return (
    <PageShell>
      <h1 className="mx-auto mb-4 w-full max-w-[760px] t-title text-ink">크리에이터 대시보드</h1>
      <CreatorClient
        nickname={session?.user?.name ?? null}
        publicNoteCount={
          publicNoteCount === null
            ? "—"
            : publicNoteCount.toLocaleString("ko-KR")
        }
        totalSaves={
          totalSaves === null ? "—" : totalSaves.toLocaleString("ko-KR")
        }
        sales={sales}
        noteOptions={noteOptions}
      />
    </PageShell>
  );
}
