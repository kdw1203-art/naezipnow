import { PROMO_FREE_DAYS } from "@/lib/experts/promo";
import { EXPERT_FREE_PLAN_DAYS } from "@/lib/billing/free-grant";
import { monthlyPrice } from "@/lib/subscriptions/billing-periods";
import { ShellBreadcrumb, ShellNarrow } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { ApplyForm } from "./ApplyForm";
import { StepStrip } from "@/app/components/StepStrip";

/* [1047] 전문가 등록 — /town/experts/apply. 소유자 지시(2026-10-09) "전문가 등록하기 · 면허증·사업자등록증 첨부 → 관리자 승인만 등록".
   화면은 정적(양식은 클라이언트) — 로그인은 파일을 올리거나 신청할 때 묻는다. 직업군 목록은 분류 체계(lib/experts/taxonomy)에서 읽는다. */

const TYPES = EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·");

export const metadata = buildPageMetadata({
  title: `전문가 등록 — ${TYPES}`,
  description: `${TYPES} 등 부동산 전문가 등록. 개인·개인사업자·법인 모두 신청할 수 있고, 면허증·사업자등록증 심사 뒤 관리자가 승인하면 인증 마크와 함께 분야별 전문가 목록에 무료로 실립니다.`,
  path: "/town/experts/apply",
});

/* [1174] 단계 안내는 한 줄 + 사실 한 줄(StepStrip) — 예전 카드 4장 · 설명 3줄 */
const STEPS = ["신청", "서류 심사", "승인", "인증 마크 · 홍보 1년 무료"] as const;
const STEPS_NOTE = "서류는 운영자만 확인 · 승인된 사람만 등록 · 결과는 알림으로";

export default function ExpertApplyPage() {
  return (
    <ShellNarrow>
      <ShellBreadcrumb>동네 › 전문가 › 등록</ShellBreadcrumb>
      <PageHead
        icon="shield"
        title="전문가 등록"
        sub="세무·회계·설계·시공·감정평가·중개 · 개인과 법인 모두 · 관리자 승인 뒤 인증 마크"
      />
      <StepStrip className="mt-3" label="등록 단계" steps={STEPS} note={STEPS_NOTE} />
      <div className="mt-4">
        <ApplyForm />
      </div>
      {/* [1144 · 1169 신청 칸 아래로] 등록하면 무엇이 나가고 언제부터 돈이 드는지 — 신청 전에 밝힌다 */}
      <section aria-labelledby="apply-promo-h" className="card mt-4 rounded-2xl p-[var(--pad-card)]">
        <h2 id="apply-promo-h" className="m-0 t-section text-ink">
          등록 뒤 홍보
        </h2>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 t-sub text-text-2">
          <li>승인일부터 프로 요금제 {EXPERT_FREE_PLAN_DAYS}일 무료 · 자동 결제 없음</li>
          <li>승인일부터 홍보 {PROMO_FREE_DAYS}일 무료 · 홍보 한 줄과 설명을 직접 작성</li>
          <li>노출 자리 · 활동 지역의 지역 · 단지 화면 · 전문가 찾기 상단 · 홈 · 임장노트 · 동네 글 목록</li>
          <li>
            {PROMO_FREE_DAYS}일 뒤 · 프로 요금제(월 {monthlyPrice("expert").toLocaleString("ko-KR")}원) 구독 중일 때만 홍보 노출
          </li>
          <li>구독하지 않아도 프로필 · 인증 마크 · 전문가 찾기 목록은 그대로</li>
        </ul>
      </section>
    </ShellNarrow>
  );
}
