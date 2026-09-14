import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { supportFaqByCategory, supportFaqItems } from "@/lib/support/faq";
import { RESPONSE_TIME } from "@/lib/support/constants";
import { FaqSearch, type FaqSearchItem } from "../FaqSearch";
import { FaqAnchorOpen } from "./FaqAnchorOpen";

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
    <PageShell breadcrumb="고객지원 › 자주 묻는 질문">
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
      <div className="mx-auto max-w-[820px]">
        {/* 히어로 — 유리판 + 검색 */}
        <section aria-labelledby="faq-hero-title" className="rise-in lg-glass flex flex-col gap-3 rounded-lg px-5 py-5 md:px-6">
          <h1 id="faq-hero-title" className="t-title text-ink">자주 묻는 질문</h1>
          <p className="t-body leading-[1.7] text-text-2">
            데이터가 어디서 오는지, 노트를 공개하면 무엇이 보이는지, 요금과 해지는
            어떻게 되는지를 질문별로 답했습니다. 아직 없는 기능은 없다고 적었습니다.
          </p>
          <FaqSearch
            items={searchItems}
            placeholder="질문이나 키워드로 찾기 (예: 환불, EXIF, 평균가)"
            contactHref="/support#contact"
          />
        </section>

        {/* 분류 내비 — 앵커 칩(같은 화면 안 이동이라 aria-current 없음) */}
        <nav aria-label="FAQ 분류" className="rise-in-1 mt-4 overflow-x-auto pb-1">
          {/* w-max 래퍼: 캡슐(max-width 100%)이 좁은 화면에서 알약을 찌그러뜨리지 않고 가로 스크롤되게 */}
          <div className="w-max">
            <div className="lg-capsule">
              {groups.map((g) => (
                <a key={g.category} href={`#${encodeURIComponent(g.category)}`}>
                  {g.category} <span className="tabular-nums text-text-3">{g.items.length}</span>
                </a>
              ))}
            </div>
          </div>
        </nav>

        <div className="mt-5 flex flex-col gap-6">
          {groups.map((g, gi) => (
            <section
              key={g.category}
              id={encodeURIComponent(g.category)}
              aria-labelledby={`faq-cat-${gi}`}
              className={`rise-in-${Math.min(gi + 2, 6)} scroll-mt-24`}
            >
              <h2 id={`faq-cat-${gi}`} className="px-1 t-section text-ink">{g.category}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.items.map((it) => (
                  <details key={it.id} id={it.id} className="card group scroll-mt-24 rounded-2xl">
                    <summary className="flex min-h-10 cursor-pointer list-none items-start justify-between gap-3 px-5 py-3.5 t-body font-bold leading-[1.5] text-ink [&::-webkit-details-marker]:hidden">
                      <span>{it.q}</span>
                      <span aria-hidden="true" className="mt-0.5 shrink-0 text-text-3 transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <div className="px-5 pb-4">
                      <div className="lg-hairline mb-3" />
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

        <div className="mt-6 flex flex-col gap-2 rounded-[14px] bg-bg p-4 t-sub leading-[1.7] text-text-2">
          <span className="t-body font-extrabold text-ink">여기에 없는 질문이라면</span>
          <span>
            고객지원의 1:1 문의로 남겨 주세요({RESPONSE_TIME}). 데이터 수치가 이상하다는 제보는 원천
            데이터와 대조해 확인하고, 실제로 고친 건은{" "}
            <Link href="/methodology#corrections" className="inline-block py-[5px] font-bold text-primary">
              정정 이력
            </Link>
            에 남깁니다.
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/support#contact" className="btn-primary btn-md no-underline">
              1:1 문의하기 ›
            </Link>
            <Link href="/my/support" className="btn-ghost btn-md no-underline">
              내 문의 내역
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
