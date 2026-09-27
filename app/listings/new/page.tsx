/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertStatus } from "@/lib/experts/is-verified";
import { PageShell } from "../../components/PageShell";
import { ListingForm } from "./ListingForm";

/* ============================================================
   매물 직접 등록 — /listings/new (로그인 필수)
   집주인 직접 / 중개사 등록 → status=pending → 어드민 검수 후 노출.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "매물 등록 | 내집나우",
  robots: { index: false, follow: false },
};

export default async function ListingNewPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/listings/new");
  }

  // 매물 등록은 공인중개사 인증(isBroker)만 — 미인증 시 폼 대신 안내 (item 11)
  const expert = await getExpertStatus(session.user.email);
  if (!expert.isBroker) {
    return (
      /* [v4 · 규칙 1·7·10] 아이콘 + 가운데 정렬 카드 → 제목 한 줄 + 사실 한 줄 + 버튼(760px 줄 왼쪽) */
      <PageShell>
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-3">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">매물 등록</h1>
            {/* [992 · A1] 전문가 인증 신청(/town/experts)은 보관(비노출) — 문의처만 안내 */}
            <p className="t-sub text-text-3">
              개업공인중개사 인증 회원 전용(허위·과장 매물 방지) · 인증 신청은 지금 받지 않음 · 필요하면 고객센터
            </p>
          </header>
          <Link href="/support" className="btn-soft btn-md no-underline">
            고객센터 문의
          </Link>
          <Link href="/my" className="inline-flex min-h-10 items-center text-[12px] font-bold text-text-3 no-underline">
            마이로 돌아가기 ›
          </Link>
          <div className="mt-4 border-t border-line pt-3 text-[12px] leading-[1.7] text-text-3">
            중개 행위는 개업공인중개사가 수행하며, 내집나우는 광고 매체로서 정보를
            게재할 뿐 중개 당사자가 아닙니다.
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    /* [v4 · 규칙 1·3] 제목 + 사실 한 줄(연파랑 설명 상자 → 명사형) — 폼은 그대로 */
    <PageShell>
      <header className="rise-in mx-auto mb-4 flex w-full max-w-[760px] flex-col gap-0.5">
        <h1 className="t-title text-ink">매물 등록</h1>
        <p className="t-sub text-text-3">
          검수 후 노출(1~2일) · 형식 요건 확인 뒤 공개 · 집주인 직접 매물은 등기부등본 등 소유 확인 안내 가능
        </p>
      </header>

      <ListingForm />

      {/* 법적 고지 */}
      <div className="mx-auto mt-8 w-full max-w-[760px] border-t border-line pt-3 text-[12px] leading-[1.7] text-text-3">
        허위·과장 매물 등록 시 「공인중개사법」 등 관련 법령에 따라 제재를 받을 수
        있으며, 매물 정보의 정확성에 대한 책임은 등록자에게 있습니다. 내집나우의
        검수는 형식 요건 확인일 뿐 매물의 진위·권리관계를 보증하지 않습니다. 중개
        행위는 해당 매물을 등록한 개업공인중개사가 수행하며, 내집나우는 광고 매체로서
        정보를 게재할 뿐 중개 당사자가 아닙니다.
      </div>
    </PageShell>
  );
}
