import Link from "@/app/components/IntentLink";
import { PageShell } from "../../components/PageShell";
import { CreatorClient } from "./creator-client";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes } from "@/lib/inspection/store-db";
import { isVerifiedExpert } from "@/lib/experts/is-verified";
import { getServiceSupabase } from "@/lib/supabase/service";
import { countSavedForTarget } from "@/lib/bookmarks/settings-store";
/* [970 · C-15] SETTLEMENT 는 여기서 쓰이지 않았다(미사용 import) — 요율 표기는
   creator-client 가 marketplace-fees 단일 출처에서 직접 읽는다 */
import { getCreatorSales } from "@/lib/creator/sales";

/* 개인 크리에이터 대시보드 — 세션별 개인 데이터라 색인 대상이 아니다. */
export const metadata = { robots: { index: false, follow: false } };

/* 시안 22e — 크리에이터 대시보드
   실데이터: 세션(safeAuth) 기준 내 공개·비공개 노트 수 + 유료 리포트 판매 실적 — 조회 불가 시 "—", 비로그인 시 로그인 유도

   [1058 · C6] 틀린 사실들의 수정
   · "총 저장 수"(bookmarks · 내 공개 노트 대상)는 늘 0 이었다 — bookmarks.target_type CHECK 에 'note' 가 없어 노트 저장은
     한 건도 저장될 수 없다. [1059] 노트 저장이 프로필 설정 jsonb 로 생겨 다시 센다(못 세면 "—").
   · "탑 임장러 현황" 탭은 없다(콘텐츠 성과 · 유료 리포트 두 탭뿐).
   · 게이트 규칙(여기 = lib/creator/gate.ts = POST /api/creator/reports): 전문가 인증 **또는** 공개 임장노트 1건 이상.
     판매 **대상**은 비공개 노트만(공개 노트는 무료 열람이라 API 가 400). 두 규칙은 다른 것이라 둘 다 적는다 —
     "공개 노트가 있어야 판매 가능"은 자격 요건이고, "파는 것은 비공개 노트"가 전달물 규칙이다. 게이트는 바꾸지 않는다
     (API 와 같은 값 · 판매 자격을 넓히는 일은 정책 결정). */

export const dynamic = "force-dynamic";

export default async function CreatorDashboardPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-2 px-5 py-12 text-center">
            {/* [1028 · 제안 5] 설명형 제목·부제 → "로그인이 필요해요" + 이 화면에 있는 것 명사 한 줄 */}
            <div className="t-section text-ink">로그인 필요</div>
            <div className="t-sub text-text-3">
              공개·비공개 노트 수 · 유료 리포트 판매 실적
            </div>
            {/* [1054] 로그인 뒤 이 화면으로 */}
            <Link href="/login?callbackUrl=%2Fmy%2Fcreator" className="btn-primary btn-md mt-2">
              로그인하고 내 노트 성과 보기
            </Link>
            <Link href="/notes" className="tap-line t-sub font-bold text-text-3">
              공개 임장노트 둘러보기 ›
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  let publicNoteCount: number | null = null;
  let privateNoteCount: number | null = null;
  let publicNotesLen = 0;
  let noteOptions: { id: string; title: string }[] = [];
  /* [1059] 내 공개 노트를 저장한 사람 수 — 노트 저장이 프로필 설정 jsonb 에 생겨 집계가 가능해졌다(공개 노트 20편까지 합산 ·
     한 편이라도 못 세면 "—"). 1058 의 "저장 집계 없음"은 bookmarks CHECK 때문이었다. */
  let saveCount: number | null = null;
  try {
    if (getServiceSupabase()) {
      const notes = await listNotes(email);
      const publicNotes = notes.filter((n) => n.isPublic);
      publicNotesLen = publicNotes.length;
      publicNoteCount = publicNotes.length;
      try {
        const counts = await Promise.all(publicNotes.slice(0, 20).map((n) => countSavedForTarget("note", n.id)));
        saveCount = counts.reduce((a, b) => a + b, 0);
      } catch {
        saveCount = null;
      }
      /* 판매 선택지는 **비공개 노트만** — 공개 노트는 누구나 무료로 읽으므로
         '구매하면 열람'이라는 전달물이 성립하지 않는다(API 도 같은 규칙로 막는다). */
      const privateNotes = notes.filter((n) => !n.isPublic);
      privateNoteCount = privateNotes.length;
      noteOptions = privateNotes.slice(0, 30).map((n) => ({ id: n.id, title: n.title }));
    }
  } catch {
    publicNoteCount = null;
    privateNoteCount = null;
  }

  // 크리에이터 게이트 (item 12): 인증 전문가 OR 크리에이터 요건(공개 노트 1건 이상) — lib/creator/gate.ts 와 같은 규칙
  const verified = await isVerifiedExpert(email).catch(() => false);
  const isCreator = verified || publicNotesLen > 0;
  if (!isCreator) {
    return (
      <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="t-section text-ink">
              크리에이터 대시보드 · 조건 미충족
            </div>
            {/* [1058 · C6] 자격(공개 노트 1건 또는 전문가 인증)과 판매 대상(비공개 노트)을 따로 적는다 */}
            <p className="max-w-[420px] t-body text-text-3">
              열람 조건: 공개 임장노트 1건 이상 또는 전문가 인증 · 판매 대상: 비공개 노트(공개 노트는 무료 열람이라
              판매 불가) · 현재 크리에이터 정산 없음(구매 알림만)
            </p>
            <div className="flex flex-col gap-2 md:flex-row">
              <Link href="/notes/new" className="btn-primary btn-md no-underline">
                임장노트 작성
              </Link>
            </div>
            <Link href="/my" className="tap-line t-sub font-bold text-text-3 no-underline">
              마이로 돌아가기 ›
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const sales = await getCreatorSales(email);

  return (
    <PageShell breadcrumb="마이 › 크리에이터" title="크리에이터 대시보드">
      <CreatorClient
        nickname={session?.user?.name ?? null}
        publicNoteCount={
          publicNoteCount === null
            ? "—"
            : publicNoteCount.toLocaleString("ko-KR")
        }
        privateNoteCount={
          privateNoteCount === null ? "—" : privateNoteCount.toLocaleString("ko-KR")
        }
        saveCount={saveCount === null ? "—" : saveCount.toLocaleString("ko-KR")}
        sales={sales}
        noteOptions={noteOptions}
      />
    </PageShell>
  );
}
