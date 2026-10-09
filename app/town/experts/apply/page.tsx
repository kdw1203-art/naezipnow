import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { ApplyForm } from "./ApplyForm";

/* [1047] 전문가 등록 — /town/experts/apply. 소유자 지시(2026-10-09) "전문가 등록하기 · 면허증·사업자등록증 첨부 → 관리자 승인만 등록".
   화면은 정적(양식은 클라이언트) — 로그인은 파일을 올리거나 신청할 때 묻는다. 직업군 목록은 분류 체계(lib/experts/taxonomy)에서 읽는다. */

const TYPES = EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·");

export const metadata = buildPageMetadata({
  title: `전문가 등록 — ${TYPES}`,
  description: `${TYPES} 등 부동산 전문가 등록. 개인·개인사업자·법인 모두 신청할 수 있고, 면허증·사업자등록증 심사 뒤 관리자가 승인하면 인증 마크와 함께 분야별 전문가 목록에 무료로 실립니다.`,
  path: "/town/experts/apply",
});

const STEPS: readonly { title: string; desc: string }[] = [
  { title: "신청", desc: "직업군 · 사업 형태 · 소개 · 서류 첨부" },
  { title: "서류 심사", desc: "운영자가 면허·등록증 · 사업자등록증과 협회 조회를 확인" },
  { title: "승인", desc: "승인된 사람만 전문가로 등록 · 결과는 알림으로" },
  { title: "인증 마크 · 무료 노출", desc: "이름 옆과 글 머리에 인증 마크 · 분야별 목록과 단지 화면에 노출" },
];

export default function ExpertApplyPage() {
  return (
    <PageShell breadcrumb="동네 › 전문가 › 등록">
      <PageHead
        icon="shield"
        title="전문가 등록"
        sub="세무·회계·설계·시공·감정평가·중개 · 개인과 법인 모두 · 관리자 승인 뒤 인증 마크"
      />
      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card rounded-2xl p-3">
            <div className="t-caption font-bold text-primary">{i + 1}단계</div>
            <div className="t-body font-bold text-ink">{s.title}</div>
            <div className="t-caption text-text-3">{s.desc}</div>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <ApplyForm />
      </div>
    </PageShell>
  );
}
