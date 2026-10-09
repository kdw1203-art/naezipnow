import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { ExpertBadge } from "@/app/components/ExpertBadge";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { listExpertsAll, type UserExpertProfile } from "@/lib/experts/store-db";
import { BUSINESS_FORMS, EXPERT_TYPES, expertBadgeText, findExpertType, type ExpertTypeId } from "@/lib/experts/taxonomy";

/* [1047] 분야별 전문가 — /town/experts/c/[type]. 소유자 지시(2026-10-09) "전문가 카테고리 · 숨고처럼 전문가 홍보".
   직업군 하나의 **인증 전문가만**(관리자 승인) 싣는다. 심사 중은 싣지 않는다.
   0명인 분야는 빈 목록이라 noindex(follow) — 첫 승인이 나면(승인 라우트가 이 경로를 비운다) 색인 대상이 된다.
   주소 낱말은 분류 체계의 id 만 받는다(정적 8장 · 없는 낱말은 404). */

export const revalidate = 86_400;
export const dynamicParams = false;

export function generateStaticParams() {
  return EXPERT_TYPES.map((t) => ({ type: t.id }));
}

function typeOf(id: string) {
  return EXPERT_TYPES.find((t) => t.id === id) ?? null;
}

function inType(e: UserExpertProfile, id: ExpertTypeId): boolean {
  return e.isVerified && findExpertType(e.category)?.id === id;
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const t = typeOf(type);
  if (!t) notFound();
  const base = buildPageMetadata({
    title: t.id === "other" ? "기타 부동산 전문가 찾기 — 인증 전문가" : `${t.label} 찾기 — 인증 ${t.label} 목록`,
    description: `${t.desc}. 면허·사업자 서류 심사를 거쳐 내집나우가 승인한 ${t.label}만 싣습니다 · 개인·개인사업자·법인 · 글 상담과 견적 요청.`,
    path: `/town/experts/c/${t.id}`,
  });
  const loaded = await listExpertsAll().catch(() => null);
  const n = loaded?.items.filter((e) => inType(e, t.id)).length ?? 0;
  return n > 0 ? base : { ...base, robots: { index: false, follow: true } };
}

export default async function ExpertCategoryPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const t = typeOf(type);
  if (!t) notFound();
  const loaded = await listExpertsAll();
  const rows = loaded.items
    .filter((e) => inType(e, t.id))
    .sort((a, b) => b.reviews - a.reviews || b.consultations - a.consultations || b.createdAt.localeCompare(a.createdAt));

  return (
    <PageShell breadcrumb={`동네 › 전문가 › ${t.label}`}>
      <PageHead
        icon="shield"
        title={t.id === "other" ? "기타 전문가" : t.label}
        sub={`${t.desc} · 서류 심사 뒤 승인된 사람만`}
        actions={
          /* [1052] 이 분야로 미리 고른 등록 양식(ApplyForm 이 ?type= 을 읽는다) */
          <Link href={`/town/experts/apply?type=${t.id}`} className="btn-outline btn-md no-underline">
            {t.label} 등록
          </Link>
        }
      />

      <nav aria-label="분야" className="mt-3 flex flex-wrap gap-1.5">
        {EXPERT_TYPES.map((x) => (
          <Link
            key={x.id}
            href={`/town/experts/c/${x.id}`}
            aria-current={x.id === t.id ? "page" : undefined}
            className={`chip min-h-10 px-3 t-sub font-bold no-underline ${x.id === t.id ? "chip-active" : "border border-line bg-bg text-text-2"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {!loaded.ok ? (
        <p className="card mt-4 rounded-2xl p-5 t-body text-text-2">전문가 목록 불러오기 실패 · 잠시 후 다시</p>
      ) : rows.length === 0 ? (
        <div className="card mt-4 flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="shield" size={22} />
          </div>
          <div className="t-body font-bold text-ink">인증 {t.label} 없음</div>
          <div className="max-w-xs t-sub text-text-3">첫 승인이 나면 이 자리에 실려요 · 등록은 무료</div>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((e) => (
            <li key={e.id} className="card flex flex-col gap-1.5 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={`/town/experts/${e.id}`} className="t-section text-ink no-underline hover:text-primary">
                  {e.name}
                </Link>
                <ExpertBadge badge={{ expertId: e.id, text: expertBadgeText(e.category) }} link={false} />
                {e.businessForm && e.businessForm !== "individual" && (
                  <span className="rounded-md border border-line chip-pad-tight t-caption font-semibold text-text-2">
                    {BUSINESS_FORMS.find((f) => f.id === e.businessForm)?.label}
                  </span>
                )}
              </div>
              <div className="t-caption text-text-2">
                {[e.organization, e.regions.slice(0, 2).join("·") || "전국", e.experience].filter(Boolean).join(" · ")}
              </div>
              {e.specialties.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {e.specialties.slice(0, 4).map((s) => (
                    <span key={s} className="rounded-md bg-bg chip-pad-tight t-caption text-text-2">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {e.introduction.trim() && <p className="line-clamp-2 t-sub text-text-2">{e.introduction.trim()}</p>}
              <div className="t-caption text-text-3">
                {[e.reviews > 0 ? `후기 ${e.reviews}` : null, e.consultations > 0 ? `답변 ${e.consultations}` : null].filter(Boolean).join(" · ") || "새로 승인"}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 t-sub text-text-3">
        상담·견적은 로그인 후 · 연락처·계좌 교환 금지 · 법률 서비스는 정책상 받지 않음 ·{" "}
        <Link href="/town/experts" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
          전체 전문가
        </Link>
      </p>
    </PageShell>
  );
}
