import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { supportFaqByCategory, supportFaqItems } from "@/lib/support/faq";
import { RESPONSE_TIME } from "@/lib/support/constants";
import { FaqSearch, type FaqSearchItem } from "../FaqSearch";
import { FaqAnchorOpen } from "./FaqAnchorOpen";

/* [v4.1 · 리퀴드 목록] 분류 묶음 톤 순환(globals.css `data-tone`) — 질문·답 = hanji 부터 */
const FAQ_TONES = ["hanji", "blue", "mint", "sand"] as const;

/* ============================================================
   N15 — 서비스 FAQ 허브 (/support/faq).

   왜 /support 안이 아니라 별도 URL 인가: /support 는 공지·1:1 문의·제휴 문의가
   섞인 운영 화면이고, 그 안의 FAQ 는 질문만 접혀 있고 답이 없는 목록이었다.
   "구독 해지하면 남은 기간은?" 같은 질문은 그 자체가 검색 질의라서, 답이 본문에
   실린 독립 URL 이 있어야 검색·AI 인용에 걸린다.

   답은 lib/support/faq.ts 한 곳에서 온다 — 화면과 FAQPage 구조화 데이터가 같은
   배열을 읽어야 "구조화 데이터에만 있고 화면엔 없는 답"이 생기지 않는다.

   [1000] 리퀴드 글래스: 위에 FAQ 검색(/support 와 같은 컴포넌트), 분류 내비는
   .lg-capsule 앵커 칩, 항목은 <details class="card"> — 답은 HTML 에 그대로 있다
   (details 안 내용은 크롤러가 읽는다; JSON-LD 와 같은 배열). id·앵커는 그대로.
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "자주 묻는 질문 — 데이터·임장노트·구독·AI",
  description:
    "내집나우 시세 데이터의 출처와 집계 기준, 임장노트 공개 범위와 사진 위치정보 처리, 구독 요금·해지·환불, AI 분석의 근거를 질문별로 답했습니다.",
  path: "/support/faq",
});

export default function SupportFaqPage() {
  const groups = supportFaqByCategory();
  const all = supportFaqItems();
  const searchItems: FaqSearchItem[] = all.map((i) => ({
    id: i.id,
    category: i.category,
    q: i.q,
    a: i.a,
  }));

  return (
    /* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(검색) → 분류 밑줄 줄 → 질문 1px 선 행(펼침) → 끝 한 줄.
       지운 것: 유리 히어로 · 설명 문단 · 알약 캡슐 · 질문마다 카드 · 연회색 상자. PageShell 브레드크럼(글자뿐)은
       본문 줄과 어긋나 뺐다(BreadcrumbList JSON-LD 는 그대로). */
    <PageShell>
      {/* 화면에 보이는 답 그대로 FAQPage 로 낸다 — 숨겨진 FAQ 를 만들지 않는다. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(faqJsonLd(all.map((i) => ({ q: i.q, a: i.a })))),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "https://naezipnow.com/" },
              { name: "고객지원", url: "https://naezipnow.com/support" },
              { name: "자주 묻는 질문", url: "https://naezipnow.com/support/faq" },
            ]),
          ),
        }}
      />

      <FaqAnchorOpen />
      <div className="mx-auto w-full max-w-[760px]">
        <section aria-labelledby="faq-hero-title" className="rise-in flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 id="faq-hero-title" className="t-title text-ink">자주 묻는 질문</h1>
            <p className="t-sub text-text-3">
              질문 {all.length}개 · 분류 {groups.length}개 · 데이터 출처·노트 공개·요금·해지
            </p>
          </header>
          <FaqSearch
            items={searchItems}
            placeholder="질문이나 키워드로 찾기 (예: 환불, EXIF, 평균가)"
            contactHref="/support#contact"
          />
        </section>

        {/* 분류 내비 — 같은 화면 안 앵커(aria-current 없음). [v4 · 부품] 알약 캡슐 → 밑줄 줄의 글자 칸 */}
        <nav
          aria-label="FAQ 분류"
          className="rise-in-1 mt-4 flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((g) => (
            <a
              key={g.category}
              href={`#${encodeURIComponent(g.category)}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap pb-2 pt-2.5 t-body font-bold text-text-2 no-underline"
            >
              {g.category} <span className="t-sub tabular-nums text-text-3">{g.items.length}</span>
            </a>
          ))}
        </nav>

        <div className="mt-5 flex flex-col gap-6">
          {groups.map((g, gi) => (
            <section
              key={g.category}
              id={encodeURIComponent(g.category)}
              aria-labelledby={`faq-cat-${gi}`}
              className={`rise-in-${Math.min(gi + 2, 6)} scroll-mt-24`}
            >
              <h2 id={`faq-cat-${gi}`} className="t-section text-ink">
                {g.category} <span className="t-num text-text-3">{g.items.length}</span>
              </h2>
              {/* [v4.1 · 리퀴드 목록] 분류마다 톤 순환(hanji 부터) — 이웃한 분류가 같은 색을 갖지 않는다 */}
              <div data-tone={FAQ_TONES[gi % FAQ_TONES.length]} className="mt-1 flex flex-col divide-y divide-line border-b border-line">
                {g.items.map((it) => (
                  <details key={it.id} id={it.id} className="group scroll-mt-24">
                    <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-3 py-3 t-body font-bold leading-[1.5] text-ink [&::-webkit-details-marker]:hidden">
                      <span>{it.q}</span>
                      <span aria-hidden="true" className="mt-0.5 shrink-0 text-text-3 transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <div className="pb-4">
                      <p className="t-body leading-[1.8] text-text-1">
                        {it.a}
                        {it.href && (
                          <Link
                            href={it.href}
                            className="ml-1 inline-block whitespace-nowrap py-[5px] font-bold text-primary"
                          >
                            {it.hrefLabel ?? "자세히 보기"} ›
                          </Link>
                        )}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* [v4 · 규칙 3·5] 연회색 상자 + 문단 → 섹션 제목 + 사실 한 줄 + 버튼 */}
        <section aria-labelledby="faq-more-h" className="mt-8 flex flex-col gap-2">
          <h2 id="faq-more-h" className="t-section text-ink">
            여기에 없는 질문
          </h2>
          <p className="t-sub text-text-3">
            1:1 문의({RESPONSE_TIME}) · 데이터 수치 제보는 원천 데이터와 대조 · 고친 건은{" "}
            <Link href="/methodology#corrections" className="inline-block py-[5px] font-bold text-primary">
              정정 이력
            </Link>
            에
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/support#contact" className="btn-primary btn-md no-underline">
              1:1 문의하기 ›
            </Link>
            <Link href="/my/support" className="btn-ghost btn-md no-underline">
              내 문의 내역
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
