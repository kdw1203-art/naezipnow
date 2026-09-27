import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { readBoardPosts } from "@/lib/newui/board-posts";
import { SupportContactForm } from "./SupportContactForm";
import { FaqSearch, type FaqSearchItem } from "./FaqSearch";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  supportFaqByCategory,
  supportFaqItems,
  type SupportFaqItem,
} from "@/lib/support/faq";
import { RESPONSE_TIME, SUPPORT_HOURS } from "@/lib/support/constants";
import { logger } from "@/lib/log";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { formatKstShortDate } from "@/lib/format/kst";
import { postHref } from "@/lib/town/post-href";

/* P2-2: 사이드메뉴 실링크 · 문의 폼(/api/support) 연동 · 공지 board_posts(공지 카테고리) 실연동
   [1000] 리퀴드 글래스 재구성 — 유리 히어로(제목·응답 시간·FAQ 검색) → 분류 타일 → 1:1 문의 →
   공지 → 처리 절차 → FAQ 미리보기 → 제휴·광고 → 약관·사업자. 내용·링크는 그대로, 겉만 새로.
   이 화면은 PUBLIC_CACHE_RULES(lib/http/cache-policy.ts)에 올라 있어 **prerender 여야 한다** —
   서버에서 세션을 읽지 않는다. 로그인 여부(이메일 프리필·접수 뒤 "내 문의 내역" 링크)는
   SupportContactForm 이 헤더와 같은 getSessionLite 로 클라이언트에서 붙인다. */

export const metadata = buildPageMetadata({
  title: "고객지원",
  description:
    "공지사항, 자주 묻는 질문, 오류 신고와 제휴 문의를 한곳에서 처리합니다.",
  path: "/support",
});

/* [v4 · 한 화면 한 가지] 가운데 한 줄(760px) — 제목 + 사실 한 줄(운영 시간·응답·메일) → 주인공(FAQ 검색) →
   자주 묻는 질문(분류 행 + 질문 행) → 1:1 문의 폼(채움 파랑 1개) → 공지 → 제휴·광고 행 → 약관·사업자 캡션.
   지운 것: 유리 히어로·알약 두 개 · 분류 아이콘 타일 · 좌측 메뉴(사이드바 — 링크는 아래 행·캡션에 전부 남는다) ·
   지원 4종 아이콘 타일 · 처리 절차 카드 3장(→ 폼 아래 사실 한 줄) · 네이비 "해결이 안 되셨나요?" 띠와 두 번째
   채움 파랑(폼 바로 위라 같은 행동) · 네이비 제휴 패널(네이비는 AI 결과 전용) · "공지" 배지(섹션 이름과 같은 말). */

/* [1007 · P2] href 는 로더가 postHref 로 정한다 — 공지(비자동 board_posts)는 이야기 상세, 기사는 뉴스 상세 */
type NoticeItem = { id: string; title: string; date: string; href: string };

type NoticesData = {
  notices: NoticeItem[];
  /** 조회 자체가 실패했는가. false 면 "읽었고 공지가 이만큼"이라는 뜻이다. */
  failed: boolean;
};

/**
 * board_posts 공지 카테고리 최신 3건.
 *
 * 실패를 빈 배열로 바꾸지 않는다 — 고객지원 화면에서 "등록된 공지사항이 아직
 * 없습니다"는 꽤 강한 단언이라, 장애 공지가 실제로 떠 있는 순간에 그 문구가
 * 나가면 정확히 반대로 안내하는 셈이 된다.
 */
async function loadNotices(): Promise<NoticesData> {
  try {
    const posts = await readBoardPosts(300);
    return {
      notices: posts
        .filter((p) => p.category.trim() === "공지")
        .slice(0, 3)
        .map((p) => ({ id: p.id, title: p.title, date: formatKstShortDate(p.createdAt), href: postHref(p) })),
      failed: false,
    };
  } catch (e) {
    logger.error("[/support] 공지사항 조회 실패", e);
    return { notices: [], failed: true };
  }
}

/* [970 · A-17] 예시 티켓·예시 답변 블록을 없앴다(없는 기능의 약속이었다).
   [1000] 이제 문의 내역 화면(/my/support)이 있으므로 실제 흐름을 그대로 적는다. */
/* [v4 · 규칙 3] 절차 카드 3장 → 한 줄 사실(접수 → 답변 → 추가 문의) */
const CONTACT_FLOW_LINE = `접수(접수번호 발급 · 로그인 시 알림함 확인) → 답변(${RESPONSE_TIME} · 이메일·내 문의 내역) → 추가 문의(답변 메일 회신)`;

/** /support 요약 카드에 띄울 FAQ — 전체 답은 /support/faq 에 있다. */
const SUPPORT_FAQ_PREVIEW_IDS = [
  "note-masking",
  "cancel",
  "data-source",
  "free-limit",
  "ai-basis",
] as const;

export default async function SupportPage() {
  const { notices, failed: noticesFailed } = await loadNotices();
  /* 문의 주소는 lib/brand/business-info.ts 한 곳에서 온다 — 화면마다 따로 적으면
     바꿀 때 어딘가는 반드시 남는다(실제로 partner@·ad@ 가 그렇게 남아 있었다). */
  const biz = getBusinessInfo();
  const { supportEmail } = biz;
  const faqAll = supportFaqItems();
  const byId = new Map(faqAll.map((i) => [i.id, i]));
  const faqGroups = supportFaqByCategory();
  const faqPreview = SUPPORT_FAQ_PREVIEW_IDS.map((id) => byId.get(id)).filter(
    (x): x is SupportFaqItem => x !== undefined,
  );
  const searchItems: FaqSearchItem[] = faqAll.map((i) => ({
    id: i.id,
    category: i.category,
    q: i.q,
    a: i.a,
  }));
  /* [970 · A-25] 0건이면 공지 섹션을 숨긴다. 조회 실패는 숨기지 않는다(공지가 없다는 뜻이 아니므로) */
  const showNotices = notices.length > 0 || noticesFailed;

  const ROW = "press flex min-h-14 items-center justify-between gap-3 py-3 no-underline";
  const chevron = (
    <span aria-hidden="true" className="shrink-0 t-body text-text-3">
      ›
    </span>
  );

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* ── 머리 + 주인공(FAQ 검색 — 실제 입력·필터) ── */}
        <div className="rise-in flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">고객지원 허브</h1>
            <p className="t-sub text-text-3">
              {SUPPORT_HOURS} · {RESPONSE_TIME} · {supportEmail}
            </p>
          </header>
          <FaqSearch items={searchItems} />
        </div>

        {/* ── 자주 묻는 질문 — 분류 행(오른쪽 개수) + 미리보기 질문 행. 답은 lib/support/faq.ts 한 곳 ── */}
        <section id="faq" aria-labelledby="faq-title" className="rise-in-1 flex scroll-mt-24 flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="faq-title" className="t-section text-ink">
              자주 묻는 질문 <span className="t-num text-text-3">{faqAll.length}</span>
            </h2>
            <Link href="/support/faq" className="inline-block shrink-0 py-[5px] t-sub font-bold text-primary no-underline">
              전체 {faqAll.length}개 보기 ›
            </Link>
          </div>
          <ul data-tone="hanji" className="divide-y divide-line">
            {faqGroups.map((g) => (
              <li key={g.category}>
                <Link href={`/support/faq#${encodeURIComponent(g.category)}`} className={ROW}>
                  <span className="min-w-0 t-body font-bold text-ink">{g.category}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="t-body t-num text-ink">{g.items.length}</span>
                    {chevron}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 t-sub font-bold text-text-2">많이 묻는 질문</h3>
          <ul data-tone="blue" className="divide-y divide-line">
            {faqPreview.map((it) => (
              <li key={it.id}>
                <Link href={`/support/faq#${it.id}`} className={ROW}>
                  <span className="min-w-0 t-body font-bold text-ink">Q. {it.q}</span>
                  {chevron}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 1:1 문의 폼 (P2-2) — /api/support 실연동. 오류·데이터 신고도 이 폼으로 ── */}
        <section id="contact" aria-labelledby="contact-title" className="rise-in-2 flex scroll-mt-24 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="contact-title" className="t-section text-ink">
              1:1 문의 · 오류 신고
            </h2>
            <p className="t-sub text-text-3">{RESPONSE_TIME} · 답변은 이메일과 내 문의 내역으로</p>
          </div>
          <SupportContactForm supportEmail={supportEmail} />
          <p className="t-caption text-text-3">{CONTACT_FLOW_LINE}</p>
          <ul data-tone="hanji" className="divide-y divide-line border-y border-line">
            <li>
              <Link href="/my/support" className={ROW}>
                <span className="min-w-0">
                  <span className="block t-body font-bold text-ink">내 문의 내역</span>
                  <span className="mt-0.5 block truncate t-sub text-text-3">남긴 문의와 답변 · 로그인</span>
                </span>
                {chevron}
              </Link>
            </li>
          </ul>
        </section>

        {/* ── 공지사항 — board_posts 공지 카테고리 실데이터 (P2-2)
            [970 · A-25] 0건이면 섹션을 숨긴다. 조회 실패는 숨기지 않는다(공지가 없다는 뜻이 아니므로). ── */}
        {showNotices && (
          <section id="notices" aria-labelledby="notices-title" className="rise-in-3 flex scroll-mt-24 flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="notices-title" className="t-section text-ink">공지사항</h2>
              {/* [1007 · P2] 공지는 사람이 쓴 글(비자동 board_posts)이라 뉴스룸(/town/news, 자동수집만)에는
                  나오지 않는다 — "전체" 는 동네이야기 피드로 간다. */}
              {notices.length > 0 && (
                <Link href="/town" className="inline-block py-[5px] t-sub font-bold text-primary no-underline">
                  동네이야기에서 전체 ›
                </Link>
              )}
            </div>
            {noticesFailed ? (
              <p className="border-y border-line py-3 t-sub font-bold text-ink">
                공지사항 조회 실패 · 공지가 없다는 뜻은 아님
              </p>
            ) : (
              <ul data-tone="sand" className="divide-y divide-line">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link href={n.href} className={ROW}>
                      <span className="min-w-0 truncate t-body font-bold text-ink">{n.title}</span>
                      <span className="shrink-0 t-sub tabular-nums text-text-3">{n.date}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── 제휴 · 광고 — partner@·ad@ 는 받는 사람이 없는 주소였다: 운영진이 읽는 한 곳(business-info)으로
            모으고 용건은 제목 프리필로 가른다. 미디어킷 파일은 없다 — 실제 동작인 "메일로 요청" ── */}
        <section aria-labelledby="biz-title" className="rise-in-4 flex flex-col">
          <h2 id="biz-title" className="t-section text-ink">
            제휴 · 광고
          </h2>
          <ul data-tone="mint" className="divide-y divide-line">
            <li id="partner" className="scroll-mt-24">
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[제휴] 투자·데이터 제휴 문의")}`}
                className={ROW}
              >
                <span className="min-w-0">
                  <span className="block t-body font-bold text-ink">투자 · 제휴 문의</span>
                  <span className="mt-0.5 block truncate t-sub text-text-3">IR 자료 · 데이터 제휴 · 금융사 연동 제안</span>
                </span>
                <span className="shrink-0 t-sub font-bold text-primary">메일</span>
              </a>
            </li>
            <li id="ads" className="scroll-mt-24">
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[광고] 미디어킷 요청")}`}
                className={ROW}
              >
                <span className="min-w-0">
                  <span className="block t-body font-bold text-ink">광고 문의</span>
                  <span className="mt-0.5 block truncate t-sub text-text-3">
                    지면 소개서(AD 슬롯 위치·단가) 메일 요청 · 커뮤니티 어뷰징성 광고 미게재
                  </span>
                </span>
                <span className="shrink-0 t-sub font-bold text-primary">메일</span>
              </a>
            </li>
          </ul>
          <p className="mt-1 t-caption text-text-3">{supportEmail}</p>
        </section>

        {/* ── 약관 · 사업자 — 끝 캡션. [989] 촘촘한 줄의 링크는 24px(py) ── */}
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 t-sub text-text-2">
            <Link href="/legal/terms" className="inline-block py-[5px] font-bold text-text-1 hover:text-primary">
              이용약관
            </Link>
            <Link href="/legal/privacy" className="inline-block py-[5px] font-bold text-text-1 hover:text-primary">
              개인정보처리방침
            </Link>
            <Link href="/legal/location" className="inline-block py-[5px] hover:text-primary">
              위치기반서비스 약관
            </Link>
            <Link href="/legal/youth" className="inline-block py-[5px] hover:text-primary">
              청소년보호정책
            </Link>
          </div>
          {/* 문서마다 시행일이 다르므로 각 문서 머리의 시행일로 안내한다([970 · A-12]).
              사업자 정보 — business-info 단일 출처. 없는 항목은 전역 Footer 와 같은 규칙으로 뺀다. */}
          <p className="t-caption text-text-3">
            시행일은 각 문서 상단에 표기 · {biz.legalName} · 대표 {biz.representative || "—"} · 사업자{" "}
            {biz.registrationNumber || "—"}
            {biz.mailOrderSalesNumber ? ` · 통신판매업 ${biz.mailOrderSalesNumber}` : ""} · {biz.supportEmail} · 제공
            정보는 참고용이며 투자 판단의 책임은 이용자에게 있습니다
          </p>
        </div>
      </div>
    </PageShell>
  );
}
