/* [1025 · 브리핑] /pro — 중개사·임대인을 위한 내집나우 한 화면. 시안 mock1025/pro-d.
   머리(PageHead) + 3칸(브리핑 리포트 → 단지 검색 후 /complex/[id]/brief · 위젯 퍼가기 → 단지 화면의 퍼가기 카드 · 관심 단지 알림 → 로그인)
   + 문의 폼(OfficeLeadForm 재사용 · /api/support). 사실 문장만("무료 · 베타").
   보관 라우트(/widget · /partners)는 되살리지 않는다 — 위젯은 단지 화면 맨 끝 "데이터 출처" 접힘 안의 퍼가기 카드에서 복사한다.
   정적 화면(데이터 조회 없음). 헤더·푸터 링크는 통합자.

   [1025b · 브리핑] 다듬기 — 머리는 사실 한 줄만 · 3칸 카드 한 규격(card rounded-2xl p-4 · 폰 p-3.5) ·
   섹션 점은 파랑 하나(globals.css [1025b · 브리핑] .pro-lay) · "문의"는 접힌 <details>(열면 폼).

   [1025c · 브리핑] 소유자(2026-09-29) "심심하지 않아?" — 시안 mock1025c/pro-d.
     · 대표 그림: **브리핑 견본 미니 문서**(BriefSample — 브리핑을 800×660 SVG 로 축소 · 공작아파트 실측값 · "견본 · 2026-08 기준")
       머리 옆 오른쪽 레일(lg · 400px · sticky), 그 아래 폭에서는 첫 카드와 3칸 사이.
     · 결론: "단지 이름 하나로 A4 한 장 · 인쇄까지 3단계" + StepLine 1·2·3 + 단지 검색(손잡이 — 고르면 브리핑으로).
     · 3칸: 아이콘 칩 40px + "무엇이 나오는지" 결과 한 줄(견본 값) + btn-secondary 1.
     · 채움 파랑은 머리의 "브리핑 만들기" 하나(lg 미만은 같은 요소를 MobilePrimaryBar 가 든다) — 검색 칸으로 간다.
       문의 폼의 제출(OfficeLeadForm)은 접힌 <details> 안이라 첫 화면에 보이지 않는다.
     · 견본 QR 은 이 화면 주소(qrcode 서버 전용) — 실제 브리핑의 QR 은 단지 상세 주소다. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { StepLine } from "@/app/components/StepLine";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { rawQrSvg } from "@/lib/brief/qr";
import { BRIEF_SAMPLE, PRO_CONCLUSION, PRO_RESULT_LINES, PRO_STEPS } from "@/lib/brief/sample";
import { OfficeLeadForm } from "@/app/widget/OfficeLeadForm";
import { ProBriefPicker } from "./ProBriefPicker";
import { BriefSample } from "./BriefSample";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

const TITLE = "중개사·임대인을 위한 내집나우";

export const metadata: Metadata = {
  title: `${TITLE} | 내집나우`,
  description: "고객 브리핑 리포트(A4 1장 인쇄) · 사무소 홈페이지 실거래 위젯 · 관심 단지 알림 — 국토교통부 실거래 기준, 무료 · 베타.",
  alternates: seoAlternates("/pro"),
  openGraph: { title: `${TITLE} | 내집나우`, description: "고객 브리핑 리포트 · 실거래 위젯 · 관심 단지 알림", type: "website", images: DEFAULT_OG_IMAGES },
};

const PRO_TOPICS = ["브리핑 리포트", "사무소 홈페이지에 위젯 넣기", "여러 단지 자료 일괄", "기타 문의"] as const;

/** 검색 칸 앵커 — 머리 "브리핑 만들기"·첫 칸 버튼이 여기로 간다(JS 없이) */
const SEARCH_ID = "pro-search";

function CardHead({ id, icon, title }: { id: string; icon: string; title: string }) {
  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <h2 id={id} className="mt-2 t-section text-ink">
        {title}
      </h2>
    </>
  );
}

/** 결과 한 줄 — "무엇이 나오는지"(견본 값) · 체크 아이콘은 success 하나 */
function ResultLine({ text }: { text: string }) {
  return (
    <p className="m-0 mt-2 flex items-start gap-1.5 rounded-lg bg-bg px-2.5 py-2 t-sub text-text-1">
      <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
      <span>{text}</span>
    </p>
  );
}

const CARD = "card rounded-2xl p-4 max-md:p-3.5";

export default async function ProPage() {
  const qrRaw = await rawQrSvg(`${DEFAULT_DESKTOP_ORIGIN}/pro`);
  /* 채움 파랑 하나 — 머리(lg+)와 폰 하단 바가 같은 요소를 든다 */
  const cta = (
    <a href={`#${SEARCH_ID}`} className="btn-primary btn-md press w-full gap-1.5 no-underline max-lg:min-h-12 lg:w-auto">
      <Icon name="file-text" size={16} />
      브리핑 만들기
    </a>
  );
  const sample = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="pro-sample-title" className="t-section text-ink">
          브리핑 견본
        </h2>
        <span className="t-caption text-text-3">{BRIEF_SAMPLE.label}</span>
      </div>
      <div className="pro-paper mt-2">
        <BriefSample qrRaw={qrRaw} />
      </div>
    </>
  );

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: TITLE, url: "/pro" },
            ]),
          ]),
        }}
      />
      <PageHead
        icon="briefcase"
        title={TITLE}
        sub="브리핑 리포트 · 홈페이지 위젯 · 관심 단지 알림. 국토교통부 실거래 기준 · 무료 · 베타 · 로그인 없이 브리핑 인쇄"
        subOnPhone
        actions={<div className="max-lg:hidden">{cta}</div>}
      />

      {/* [체크] lg:grid 의 base 는 grid-cols-1 · 사이드바 트랙은 minmax(0,1fr). 견본은 한 번만 그리고 자리만 바꾼다:
          lg 는 오른쪽 레일(row 1~3) · 그 아래는 DOM 순서(첫 카드 → 견본 → 3칸 → 문의) */}
      <div className="pro-lay mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5">
        {/* 결론 + 절차 + 손잡이(단지 검색) */}
        <section aria-labelledby="pro-how" className={`${CARD} min-w-0`}>
          <h2 id="pro-how" className="t-title text-ink">
            {PRO_CONCLUSION}
          </h2>
          <p className="m-0 mt-1 t-sub text-text-2">개요 8칸 · 타입별 12개월 미니 차트 · 최근 실거래 표 · 전세가율 · 주의 · QR. 사무소명은 이 기기에만 저장</p>
          <StepLine className="mt-3" current={0} steps={PRO_STEPS} />
          <div id={SEARCH_ID} className="mt-3 scroll-mt-20">
            <ProBriefPicker />
          </div>
        </section>

        {/* [1025c] 견본은 800px 문서를 축소한 그림이라 폰(≤md)에서는 글자가 10px 아래로 내려간다 — 폰은 3칸 카드가 대신 말하므로 md+ 에서만 */}
        <section aria-labelledby="pro-sample-title" className="min-w-0 max-md:hidden lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          {sample}
        </section>

        {/* 3칸 — base grid-cols-1 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <section aria-labelledby="pro-brief" className={CARD}>
            <CardHead id="pro-brief" icon="file-text" title="브리핑 리포트" />
            <p className="m-0 mt-1 t-body text-text-1">단지 개요 · 타입별 최근 실거래 · 전세가율 · 주의 사항을 A4 1장으로 인쇄</p>
            <ResultLine text={PRO_RESULT_LINES.brief} />
            <p className="m-0 mt-1 t-caption text-text-3">로그인 없이 · 사무소명·연락처는 이 기기에만 저장</p>
            <a href={`#${SEARCH_ID}`} className="btn-secondary btn-md press mt-2 w-full no-underline">
              단지 검색
            </a>
          </section>
          <section aria-labelledby="pro-widget" className={CARD}>
            <CardHead id="pro-widget" icon="grid-3x3" title="위젯 퍼가기" />
            <p className="m-0 mt-1 t-body text-text-1">단지 화면 맨 끝 &quot;데이터 출처&quot;의 퍼가기 카드에서 코드 복사 · 사무소 홈페이지에 실거래 표 삽입</p>
            <ResultLine text={PRO_RESULT_LINES.widget} />
            <p className="m-0 mt-1 t-caption text-text-3">실거래 갱신 시 반영 · 출처 표기 포함</p>
            <Link href="/complex/browse" className="btn-secondary btn-md press mt-2 w-full no-underline">
              단지 찾기
            </Link>
          </section>
          <section aria-labelledby="pro-watch" className={CARD}>
            <CardHead id="pro-watch" icon="bell" title="관심 단지 알림" />
            <p className="m-0 mt-1 t-body text-text-1">담당 단지 관심 등록 → 새 실거래·가격 변동 수신함 알림</p>
            <ResultLine text={PRO_RESULT_LINES.watch} />
            <p className="m-0 mt-1 t-caption text-text-3">로그인 필요 · 무료</p>
            <Link href="/login?callbackUrl=%2Fmy" className="btn-secondary btn-md press mt-2 w-full no-underline">
              로그인
            </Link>
          </section>
        </div>

        {/* 문의 — 접힌 채(열면 폼 — OfficeLeadForm 이 제 카드를 그리므로 여기서 카드를 또 두르지 않는다). 지원 창구(/api/support)로 접수 */}
        <details className="group min-w-0 md:max-w-[640px]">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-1 [&::-webkit-details-marker]:hidden">
            <h2 className="t-section text-ink">문의</h2>
            <span className="inline-flex items-center gap-2 t-caption text-text-3">
              지원 창구로 접수
              <span aria-hidden="true" className="t-body transition-transform group-open:rotate-90">
                ›
              </span>
            </span>
          </summary>
          <div className="mt-2">
            <OfficeLeadForm
              subjectPrefix="[중개사·임대인]"
              topics={PRO_TOPICS}
              footnote="입력하신 정보는 문의 답변에만 사용됩니다. 브리핑 리포트·위젯은 문의 없이 쓸 수 있습니다."
            />
          </div>
        </details>
      </div>

      <MobilePrimaryBar label="브리핑 만들기">{cta}</MobilePrimaryBar>
    </PageShell>
  );
}
