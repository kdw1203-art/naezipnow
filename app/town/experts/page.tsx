/* [1026c · 폰 배율 1] 문장 속 링크 24px 하한(py-[5px]) — 전 경로 폰 조작 검사에서 지적된 자리. */
/* [1023 · 동네 ③] 소개 카드의 3칸 통계 중 머리(TownHero)와 겹치는 두 칸 삭제 — 평균 후기 평점만 한 줄(있을 때만). CountUp 은 더 쓰지 않는다. */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import type { Metadata } from "next";
import Link from "@/app/components/IntentLink";
import { ShellBreadcrumb } from "../../components/PageShell";
import { RotatingExpertPromo } from "@/app/components/experts/ExpertPromo";
import { QuoteRequestBanner } from "./QuoteRequest";
import { ExpertsClient, type ExpertPublicRow } from "./ExpertsClient";
import { listExpertsAll, type UserExpertProfile } from "@/lib/experts/store-db";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { countExpertTypes } from "@/lib/experts/type-counts";
import { EXPERT_FAQ } from "@/lib/experts/faq";
import { Icon } from "@/app/components/Icon";
import { FaqCompact } from "@/app/components/compact/FaqCompact";
import { PopupSheet } from "@/app/components/PopupSheet";
import { JsonLd } from "@/app/components/JsonLd";
import { faqJsonLd } from "@/lib/seo/jsonld";
import { TownCategoryNav } from "../TownCategoryNav";
import { TownHero } from "../TownHero";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-bold(800) 를 전부 font-bold(700) 로 내렸다. */

/* 전문가 목록 (953 개편) — expert_profiles 실데이터.
   구조: 네이비 히어로(무엇을·왜 믿을지) → 필터·카드 → 견적 요청 → 인증 안내·신청
   → FAQ(JSON-LD 동일 배열) → 고지. 실데이터 0건이면 0건이라고 말한다(목업 폴백 없음). */

/* ── ISR (사용량 절감 11차, 2026-08-10) ── 필터는 클라이언트(location.search). */
/* [1010] 300초 → 1일. 카드에 실리는 값(인증·후기·평점·완료 상담·응답률)이 바뀌는 지점은
   전부 비운다 — 승인/수정(admin/experts · experts/[id] PATCH), 생성(experts POST),
   삭제(experts/[id] DELETE), 후기(experts/[id]/reviews), 상담 답변·마감(experts/[id]/consult).
   실측 expert_profiles 0행이라 지금은 빈 목록이지만, 5분 눈금은 크롤 1회당 오리진 1회였다. */
export const revalidate = 86_400;

/* [1047] 보관 해제(소유자 지시 2026-10-09). 인증 전문가가 0명인 동안은 목록이 빈 화면이라 noindex(follow 유지) —
   첫 승인이 나면(승인 라우트가 이 경로를 비운다) 색인 대상이 된다. */
const EXPERT_TYPE_LIST = EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·");
export async function generateMetadata(): Promise<Metadata> {
  const base = buildPageMetadata({
    title: `전문가 찾기 — ${EXPERT_TYPE_LIST}`,
    description:
      "자격과 사업자를 확인한 부동산 전문가를 분야별로 찾습니다. 세무·회계·설계·시공·감정평가·중개 · 인증 마크, 답변 완료 수, 실제 의뢰자 후기 · 견적 요청으로 여러 제안 비교.",
    path: "/town/experts",
  });
  const loaded = await listExpertsAll().catch(() => null);
  const verified = loaded?.items.filter((e) => e.isVerified).length ?? 0;
  return verified > 0 ? base : { ...base, robots: { index: false, follow: true } };
}

/** 공개 필드만 깎아 클라이언트로 — ownerEmail·userId 는 넘기지 않는다 */
function toPublicRow(e: UserExpertProfile): ExpertPublicRow {
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    category: e.category,
    regions: e.regions,
    specialties: e.specialties,
    introduction: e.introduction,
    consultationFee: e.consultationFee,
    reportFee: e.reportFee,
    rating: e.rating,
    reviews: e.reviews,
    consultations: e.consultations,
    responseRate: e.responseRate,
    experience: e.experience,
    responseTime: e.responseTime,
    isVerified: e.isVerified,
    /* 상호·연락처·등록번호 — 인증 전문가만 공개(미인증은 null) */
    organization: e.isVerified ? (e.organization ?? null) : null,
    contactPhone: e.isVerified ? (e.contactPhone ?? null) : null,
    contactKakao: e.isVerified ? (e.contactKakao ?? null) : null,
    brokerRegistrationNo: e.isVerified ? (e.brokerRegistrationNo ?? null) : null,
    createdAt: e.createdAt,
  };
}


export default async function TownExpertsPage() {
  const loaded = await listExpertsAll();
  const verified = loaded.items.filter((e) => e.isVerified);
  const answered = loaded.items.reduce((n, e) => n + e.consultations, 0);
  const reviewed = loaded.items.filter((e) => e.reviews > 0);
  const avgRating =
    reviewed.length > 0
      ? reviewed.reduce((n, e) => n + e.rating * e.reviews, 0) / reviewed.reduce((n, e) => n + e.reviews, 0)
      : null;
  /* [1052] 인원은 findExpertType 으로 센다(countExpertTypes) — 예전 `category.includes(label)` 은
     예전 저장값 "건축사"를 "건축사·설계" 칸에서 0명으로 셌다. 분야별 목록(/town/experts/c/[type])과 같은 규칙. */
  const verifiedByType = countExpertTypes(verified);
  const typeCounts = EXPERT_TYPES.map((t) => ({
    ...t,
    count: verifiedByType.get(t.id) ?? 0,
  }));

  return (
    /* [972] 9칸 중 이 페이지만 머리가 달랐다 — 형제들은 카테고리 줄 아래 공통 머리
       (아이콘 칩 + 제목 + 한 줄)인데 여기는 곧바로 네이비 히어로였고, 그래서 제목이
       형제들(214px)보다 44px 아래(258px)에 있었다(Pixel 5 실측).
       공통 머리를 앞에 세우고 네이비 카드는 **소개 블록**으로 내린다 — 담고 있던
       내용(설명·보증 문구·커버리지·두 CTA)은 그대로 두고, h1 만 공통 머리로 옮겼다. */
    <>
      <ShellBreadcrumb>동네이야기 › 전문가</ShellBreadcrumb>
      <JsonLd data={faqJsonLd(EXPERT_FAQ)} />
      {/* [978] 홈과 같은 네이비 히어로. 버튼은 카테고리 목록의 heroCta
          ("전문가로 참여" → /town/experts/join)가 그대로 그린다. */}
      <TownHero
        href="/town/experts"
      />
      <TownCategoryNav stick />
      {/* [1184 · 통폐합] 소유자(2026-11-15): "여기도 중복된 내용들 정리". 같은 사실이 두세 번 나오던 것을 한 번씩으로:
          인증 전문가 수(머리 · 소개 · 목록 → 목록 한 곳) · 분야 목록(칩 줄 · 12줄 판 → 칩 줄 + 누르면 창) ·
          전문가 등록(머리 단추 · 아래 판 단추 → 머리 단추 + 링크 한 줄) · FAQ(낱말 칩 + 답 → 답). */}
      <section className="rise-in card mb-4 flex flex-col gap-2 rounded-2xl px-4 py-3 max-md:mb-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="분야별 전문가">
          {typeCounts
            .filter((t) => t.id !== "other")
            .map((t) => (
              <Link
                key={t.id}
                href={`/town/experts/c/${t.id}`}
                className="chip inline-flex min-h-[40px] items-center border border-line bg-surface px-2.5 t-sub font-bold text-text-2 no-underline md:min-h-[32px]"
              >
                {t.label}
                {t.count > 0 && <span className="ml-1 t-num font-medium text-primary">{t.count}</span>}
              </Link>
            ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-sub text-text-2">
          {avgRating !== null && (
            <span>
              평균 후기 평점 <b className="t-num text-ink">{avgRating.toFixed(1)}</b> · 후기{" "}
              <b className="t-num text-ink">{reviewed.reduce((n, e) => n + e.reviews, 0).toLocaleString("ko-KR")}</b>건
            </span>
          )}
          {answered > 0 && (
            <span>
              누적 상담 답변 <b className="t-num text-ink">{answered.toLocaleString("ko-KR")}</b>건
            </span>
          )}
          <PopupSheet title="분야별 안내 · 자격 확인 기관" className="tap-line t-sub font-bold text-primary" trigger="분야별 안내 · 자격 확인 기관 ›">
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0" data-tone="plain">
              {typeCounts
                .filter((t) => t.id !== "other")
                .map((t) => (
                  <li key={t.id} className="py-2">
                    <span className="flex items-baseline justify-between gap-3">
                      <b className="t-body text-ink">{t.label}</b>
                      <span className="shrink-0 t-caption text-text-3">{t.count > 0 ? `인증 ${t.count}명` : "모집 중"}</span>
                    </span>
                    <span className="mt-0.5 block t-sub text-text-2">
                      {t.desc}
                      {t.source ? ` · 자격 확인 · ${t.source.label}` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </PopupSheet>
        </div>
      </section>

      {/* ---------- 목록 ---------- */}
      <div id="experts" className="scroll-mt-24">
        {/* [1144] 상단 고정 홍보 — 무료 100일 또는 프로 구독 중인 인증 전문가 2명(날마다 차례) */}
        <RotatingExpertPromo slot={0} count={2} className="mb-3" />
        {loaded.ok ? (
          <ExpertsClient items={loaded.items.map(toPublicRow)} truncated={loaded.truncated} />
        ) : (
          <div className="rise-in-2 card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Icon name="warning" size={22} />
            </div>
            <p className="t-body font-bold text-ink">전문가 목록 불러오기 실패</p>
            <p className="max-w-xs t-sub text-text-3">
              잠시 후 다시 시도해 주세요.
            </p>
            <Link href="/town/experts" className="btn-soft btn-sm no-underline">
              다시 불러오기
            </Link>
          </div>
        )}
      </div>

      {/* ---------- 견적 요청 ---------- */}
      <div className="mb-6">
        <QuoteRequestBanner />
      </div>

      {/* ---------- 전문가 등록 — 한 줄(단추는 머리에 하나) ---------- */}
      <section id="apply" className="card mb-6 flex scroll-mt-24 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3 max-md:mb-4">
        <h2 className="t-body font-bold text-ink">전문가 등록</h2>
        <span className="min-w-0 t-sub text-text-2">서류 심사 · 관리자 승인 · 인증 마크 · 무료 노출</span>
        <Link href="/town/experts/join" className="tap-line t-sub font-bold text-primary no-underline">
          참여 안내 ›
        </Link>
        <Link href="/partners" className="tap-line t-sub font-bold text-primary no-underline">
          중개사무소 제휴 ›
        </Link>
        <PopupSheet title="인증 대상 · 운영정책" className="tap-line t-sub font-bold text-primary" trigger="인증 대상 · 운영정책 ›">
          <p className="m-0 t-sub text-text-2">
            인증 대상: {EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·")} 및 서류·인터뷰 심사를 거친 기타 전문가.
            법률 서비스는 정책상 유료 입점 불가. 절차·검증 기준은{" "}
            <Link href="/legal/expert" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
              전문가 운영정책
            </Link>
            에 있습니다.
          </p>
        </PopupSheet>
      </section>

      {/* ---------- FAQ (JSON-LD 와 같은 배열) ----------
          [1062 · 글 줄이기] 제목 h2 + 기호(+) 토글을 손으로 그린 판 → 공용 접힌 FAQ(질문 한 줄 + 핵심 낱말 칩).
          FAQPage JSON-LD 는 머리의 <JsonLd data={faqJsonLd(EXPERT_FAQ)} /> 하나뿐이므로 여기서는 내지 않는다(jsonLd=false). */}
      <FaqCompact
        className="mb-6 rounded-2xl"
        jsonLd={false}
        items={EXPERT_FAQ.map((f) => ({ q: f.q, a: f.a }))}
      />

      {/* 베타 공급 부족의 실제 대안 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="t-sub text-text-3">다른 경로</span>
        {/* [1056 · C5] /qna 는 보관(비노출) 경로다(lib/seo/archived-routes.ts) — 보관 화면으로 보내던 링크를 동네이야기로 바꾼다 */}
        <Link href="/town" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          이웃에게 묻기 (동네이야기)
        </Link>
        <Link href="/notes" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          실거주 기록 읽기 (임장노트)
        </Link>
        <Link href="/guides" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          가이드 읽기
        </Link>
      </div>

      <p className="mt-4 text-center t-sub text-text-3">
        상담·견적 요청은 로그인 후 · 전화번호·계좌 기재 금지 · 플랫폼 밖 결제 유도는 신고 대상
      </p>
      <ComplianceNotice className="mt-3" />
    </>
  );
}
