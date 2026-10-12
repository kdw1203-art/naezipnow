import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Fineprint } from "@/app/components/Fineprint";
import { FactTable } from "@/app/components/compact/FactTable";
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

   [1062 · 글 줄이기] 소유자 지시 "글씨가 많은 페이지를 표·요약·키워드로". 질문마다 큰 카드였던 것을
   분류당 카드 하나 안의 한 줄(질문 + 핵심 낱말 칩, .faq-compact)로, 답은 눌러야 펼쳐진다. 머리 설명문은
   접기(Fineprint), 하단 안내 문단은 "항목 | 사실" 표. 글·id·앵커·JSON-LD 는 그대로 — FaqCompact 컴포넌트를
   그대로 쓰지 않는 까닭은 항목마다 id(검색 결과·외부 링크 /support/faq#id → FaqAnchorOpen)와 근거 링크(href)가
   필요해서다(같은 꼴의 마크업을 여기서 그린다).
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "자주 묻는 질문 — 데이터·임장노트·구독·AI",
  description:
    "내집나우 실거래가 데이터의 출처와 집계 기준, 임장노트 공개 범위와 사진 위치정보 처리, 구독 요금·해지·환불, AI 분석의 근거를 질문별로 답했습니다.",
  path: "/support/faq",
});

/* [1062] 접힌 질문 옆 핵심 낱말 칩 — 답(lib/support/faq.ts)에 있는 사실 낱말만 적는다(답에 없는 말 금지).
   답이 결제 방식(자동결제 개방 여부)에 따라 갈리는 항목(cancel)은 두 갈래 모두에 있는 낱말만. */
const FAQ_KEYS: Record<string, string[]> = {
  "data-source": ["국토교통부 신고 자료", "공공 API(data.go.kr)", "포털 긁어오지 않음"],
  "recent-month-low": ["신고 기한 30일", "최근 1~2개월 잠정치", "앞으로 더 늘어남"],
  "avg-not-market-price": ["평균가는 시세가 아님", "단순 평균", "거래 건수와 함께"],
  "empty-region": ["아직 수집되지 않음", "시군구 단위 순회", "추정치로 메우지 않음"],
  "cancelled-deal": ["들어가지 않음", "해제(취소) 신고 거래 제외"],
  "data-correction": ["어느 화면의 어떤 수치", "원천 데이터와 대조", "정정 이력"],
  "note-visibility": ["기본 비공개", "공개 노트는 누구나", "검색엔진 색인·사이트맵·RSS", "언제든 되돌릴 수 있음"],
  "photo-exif": ["EXIF 메타데이터 제거", "GPS 좌표·기기 정보", "제거 실패 시 업로드 거부"],
  "note-masking": ["자동으로 가리는 기능 없음", "EXIF 위치정보 제거뿐", "신고 기능 접수"],
  "note-copyright": ["저작권은 작성자", "운영·홍보 목적 활용", "출처 표기"],
  price: ["무료 요금제로 탐색·기록", "연 결제 약 20% 저렴"],
  "free-limit": ["커뮤니티·지도·동네 맥락 제한 없음", "AI 분석·북마크 횟수·개수 제한", "요금제 비교표"],
  cancel: ["7일 안에 청약철회", "이용약관 제8조", "고객센터 1:1 문의"],
  "payment-method": ["토스페이먼츠 등 결제대행사", "카드 번호 보관하지 않음", "결제대행사 약관"],
  "ai-basis": ["실거래 데이터·임장노트 직접 조회", "조회한 데이터 목록을 답변과 함께", "로그인해야 쓸 수 있음"],
  "ai-model-picker": ["직접 고를 수 있음", "빠르고 경제적인 모델", "복합 분석·긴 문맥 모델", "기본 모델"],
  "ai-advice": ["투자 자문 제공하지 않음", "매수·매도 권유 아님", "책임은 이용자", "대출·세금은 금융기관·관할 관청"],
  contact: ["고객센터 1:1 문의 폼", "데이터 오류 정정·제휴·개인정보 요청 같은 경로"],
  withdraw: ["서비스 내 회원탈퇴 기능", "유료 요금제 먼저 해지", "잔여 기간 환불은 약관"],
  "privacy-request": ["열람·정정·삭제·처리정지", "개인정보 처리 요청 페이지", "법정 기한 내 처리 결과"],
};

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
    <PageShell breadcrumb="고객센터 › 자주 묻는 질문">
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
              { name: "고객센터", url: "https://naezipnow.com/support" },
              { name: "자주 묻는 질문", url: "https://naezipnow.com/support/faq" },
            ]),
          ),
        }}
      />

      <FaqAnchorOpen />
      <div className="mx-auto max-w-[820px]">
        {/* 히어로 — 유리판 + 검색. [1062] 설명 두 문장은 접기(글은 그대로) */}
        <section aria-labelledby="faq-hero-title" className="rise-in lg-glass flex flex-col gap-3 rounded-lg px-5 py-5 md:px-6">
          <h1 id="faq-hero-title" className="t-title text-ink">자주 묻는 질문</h1>
          <FaqSearch
            items={searchItems}
            placeholder="질문이나 키워드로 찾기 (예: 환불, EXIF, 평균가)"
            contactHref="/support#contact"
          />
          <Fineprint label="전체 안내">
            데이터가 어디서 오는지, 노트를 공개하면 무엇이 보이는지, 요금과 해지는
            어떻게 되는지를 질문별로 답했습니다. 아직 없는 기능은 없다고 적었습니다.
          </Fineprint>
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

        {/* [1062] 분류당 카드 하나 — 질문 한 줄 + 핵심 낱말 칩(.faq-compact), 답은 눌러야 펼쳐진다. id 는 details 에 그대로
            (/support/faq#id → FaqAnchorOpen 이 펼친다). 답 끝 근거 링크(href)도 그대로. */}
        <div className="mt-5 flex flex-col gap-4 max-md:gap-3">
          {groups.map((g, gi) => (
            <section
              key={g.category}
              id={encodeURIComponent(g.category)}
              aria-labelledby={`faq-cat-${gi}`}
              className={`rise-in-${Math.min(gi + 2, 6)} card scroll-mt-24 rounded-2xl p-[var(--pad-card)]`}
            >
              <h2 id={`faq-cat-${gi}`} className="t-section font-bold text-ink">{g.category}</h2>
              <ul className="m-0 mt-2 flex list-none flex-col divide-y divide-line p-0">
                {g.items.map((it) => {
                  const keys = FAQ_KEYS[it.id] ?? [];
                  return (
                    <li key={it.id}>
                      <details id={it.id} className="faq-compact scroll-mt-24">
                        <summary className="t-body font-bold text-ink">
                          <span className="min-w-0 flex-1">{it.q}</span>
                          {keys.length > 0 && (
                            <span className="flex flex-wrap gap-1" aria-label="핵심">
                              {keys.slice(0, 4).map((k) => (
                                <span key={k} className="rounded-full border border-line bg-bg px-2 py-0.5 t-caption font-medium text-text-2">
                                  {k}
                                </span>
                              ))}
                            </span>
                          )}
                        </summary>
                        <p className="measure m-0 pb-3 t-sub leading-[1.7] text-text-2">
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
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* [1062] 하단 안내 문단 → "항목 | 사실" 표(문구는 그대로). 단추 둘은 그대로. */}
        <div className="mt-6 flex flex-col gap-2 rounded-lg bg-bg p-4">
          <span className="t-body font-bold text-ink">여기에 없는 질문이라면</span>
          <FactTable
            dense
            rows={[
              { label: "1:1 문의", value: `고객센터의 1:1 문의로 남겨 주세요(${RESPONSE_TIME}).` },
              {
                label: "수치 제보",
                value: (
                  <>
                    데이터 수치가 이상하다는 제보는 원천 데이터와 대조해 확인하고, 실제로 고친 건은{" "}
                    <Link href="/methodology#corrections" className="inline-block py-[5px] font-bold text-primary">
                      정정 이력
                    </Link>
                    에 남깁니다.
                  </>
                ),
              },
            ]}
          />
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
