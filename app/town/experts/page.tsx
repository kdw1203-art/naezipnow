/* [1026c · 폰 배율 1] 문장 속 링크 24px 하한(py-[5px]) — 전 경로 폰 조작 검사에서 지적된 자리. */
/* [1023 · 동네 ③] 소개 카드의 3칸 통계 중 머리(TownHero)와 겹치는 두 칸 삭제 — 평균 후기 평점만 한 줄(있을 때만). CountUp 은 더 쓰지 않는다. */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExpertApplyCta } from "./ExpertApplyCta";
import { QuoteRequestBanner } from "./QuoteRequest";
import { ExpertsClient, type ExpertPublicRow } from "./ExpertsClient";
import { listExpertsAll, type UserExpertProfile } from "@/lib/experts/store-db";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { countExpertTypes } from "@/lib/experts/type-counts";
import { EXPERT_FAQ } from "@/lib/experts/faq";
import { Icon } from "@/app/components/Icon";
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
    <PageShell breadcrumb="동네이야기 › 전문가" wide>
      <JsonLd data={faqJsonLd(EXPERT_FAQ)} />
      {/* [978] 홈과 같은 네이비 히어로. 버튼은 카테고리 목록의 heroCta
          ("전문가로 참여" → /town/experts/join)가 그대로 그린다. */}
      <TownHero
        href="/town/experts"
        stats={[
          { label: "인증 전문가", value: verified.length, unit: "명" },
          { label: "누적 상담 답변", value: answered, unit: "건" },
        ]}
        note="등록된 전문가 기준"
      />
      <TownCategoryNav stick />
      {/* ---------- 소개 ---------- */}
      {/* [1022 · 정렬·글씨·테마] 네이비 면(card + 워터마크) → 흰 카드. 1017 이 9칸 머리에서 네이비를 걷었는데 이 소개
          블록만 네이비로 남아 전문가 화면만 튀었다. 내용·숫자는 그대로, 색만 토큰(text-ink · text-text-2 · border-line). */}
      <section className="rise-in card mb-5 overflow-hidden rounded-2xl px-5 py-6 md:px-7 md:py-7 max-md:mb-3 max-md:py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[560px]">
            {/* [1012] 규칙 5 — "지금 물어보기" 슬로건 → 명사형 사실
                [1015] 대시 잇기·설명 두 문장("…상담함으로 와요. …비교할 수 있어요")을 명사 줄로(브리프 규칙 D) */}
            <p className="t-section text-ink">
              인증 전문가 · {EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join(" · ")}
            </p>
            <p className="mt-1 t-sub text-text-2">개인 · 개인사업자 · 법인 모두 · 면허·사업자 서류 심사 뒤 관리자 승인</p>
            <p className="mt-2 t-body text-text-2">
              글 상담 · 상담함 답변 · 견적 요청 1건으로 여러 전문가 제안 비교
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 t-sub text-text-2">
              <span className="inline-flex items-center gap-1">
                <Icon name="shield" size={13} className="text-ink" /> 서류·신원 확인 후 인증
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={13} className="text-brand-red" /> 후기는 답변 완료 의뢰자만
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="lock" size={13} className="text-ink" /> 연락처·계좌 교환 차단
              </span>
            </div>
          </div>
          {/* [972] "전문가로 참여" 는 공통 머리의 action 으로 올라갔다 — 같은 화면에
              같은 링크가 둘이면 어느 쪽이 주인지 알 수 없다. 여기는 목록으로
              내려가는 한 개만 남긴다. */}
          <div className="flex shrink-0 gap-2 md:flex-col md:items-end">
            {/* [1015] 채움 파랑 → 네이비 위 보조 칩. 화면의 채움 파랑은 카드의 "상담 신청" 하나로(브리프 규칙 J) */}
            <a href="#experts" className="btn-outline btn-md rounded-xl no-underline">
              전문가 보기
            </a>
          </div>
        </div>
        {/* 커버리지 — 실측만. 0 이면 0.
            [970 · C-13] 다만 등록 전문가가 아예 0명이면 "0 · 0 · —" 세 칸은 지표가 아니라
            빈 칸 세 개다 — 모집 중이라는 사실 한 줄로 바꾼다(조회 실패는 목록 쪽이 말한다).
            [1023 · 동네 ③] 인증 전문가·누적 상담 답변 두 칸은 머리(TownHero stats)와 같은 숫자였다 — 한 번만.
            머리에 없는 수는 평균 후기 평점뿐이라 그것만, 후기가 있을 때만 한 줄로 남긴다("후기 아직 없음" 빈 칸 삭제). */}
        {loaded.ok && loaded.items.length === 0 ? (
          <p className="mt-5 border-t border-line pt-4 t-sub text-text-2">
            모집 중 · 인증 심사 통과 순으로 공개
          </p>
        ) : avgRating !== null ? (
          <p className="mt-5 border-t border-line pt-4 t-sub text-text-2">
            평균 후기 평점 <b className="t-num text-ink">{avgRating.toFixed(1)}</b> · 후기{" "}
            <b className="t-num text-ink">{reviewed.reduce((n, e) => n + e.reviews, 0).toLocaleString("ko-KR")}</b>건
          </p>
        ) : null}
      </section>

      {/* ---------- 목록 ---------- */}
      <div id="experts" className="scroll-mt-24">
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

      {/* ---------- 자격별 안내 ---------- */}
      <section className="mb-6 max-md:mb-4">
        {/* [1015] 물음형 제목("어떤 전문가에게 무엇을 물을까") → 명사(브리프 규칙 D) */}
        <h2 className="mb-3 t-section text-ink">분야별 전문가</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {typeCounts
            .filter((t) => t.id !== "other")
            .map((t) => (
              <Link
                key={t.id}
                href={`/town/experts/c/${t.id}`}
                className="card tile flex flex-col gap-1 rounded-2xl p-4 no-underline"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="t-body font-bold text-ink">{t.label}</span>
                  <span className="t-caption text-text-3">{t.count > 0 ? `인증 ${t.count}명` : "모집 중"}</span>
                </div>
                <span className="t-sub text-text-2">{t.desc}</span>
                {t.source && <span className="t-caption text-text-3">자격 확인 · {t.source.label}</span>}
              </Link>
            ))}
        </div>
      </section>

      {/* ---------- 전문가 참여 ----------
          [1015] 한지 면 띠 → 흰 카드 + 1px 선(브리프 규칙 C — 브랜드 면은 히어로·네이비 띠에만). "전문가이신가요?"
          물음 라벨과 기능 설명 5줄(프로필 노출·제안 보내기·직접 관리·후기·리드)은 걷었다(규칙 B·D) — 절차·비용·FAQ 는
          /town/experts/join 이 전부 담고 있고 링크가 바로 옆에 있다. 인증 대상·정책 링크는 남긴다. */}
      <section id="apply" className="card mb-6 scroll-mt-24 rounded-2xl px-5 py-5 md:px-7 max-md:mb-4 max-md:px-3.5 max-md:py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[560px]">
            <h2 className="t-section text-ink">전문가 등록</h2>
            <p className="mt-1 t-sub text-text-2">면허·사업자 서류 심사 · 관리자 승인 · 인증 마크 · 분야별 목록과 단지 화면 무료 노출</p>
            <p className="mt-3 t-caption text-text-3">
              인증 대상: {EXPERT_TYPES.filter((t) => t.id !== "other").map((t) => t.label).join("·")} 및 서류·인터뷰 심사를 거친 기타 전문가.
              법률 서비스는 정책상 유료 입점 불가. 절차·검증 기준은{" "}
              <Link href="/legal/expert" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                전문가 운영정책
              </Link>
              에 있습니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <ExpertApplyCta />
            <Link href="/town/experts/join" className="tap-line t-sub font-bold text-primary underline underline-offset-2">
              참여 안내(절차·비용·FAQ) ›
            </Link>
            <Link href="/partners" className="tap-line t-sub font-bold text-primary underline underline-offset-2">
              중개사무소 제휴 안내 ›
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- FAQ (JSON-LD 와 같은 배열) ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">자주 묻는 질문</h2>
        <div data-tone="hanji" className="card flex flex-col divide-y divide-line rounded-2xl px-5">
          {EXPERT_FAQ.map((f) => (
            <details key={f.q} className="group py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 t-body font-bold text-ink">
                {f.q}
                <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 t-sub text-text-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 베타 공급 부족의 실제 대안 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="t-sub text-text-3">다른 경로</span>
        <Link href="/qna" className="press chip border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline">
          이웃에게 묻기 (단지 Q&A)
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
    </PageShell>
  );
}
