import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { readBoardPosts } from "@/lib/newui/board-posts";
import { SupportContactForm } from "./SupportContactForm";
import { FaqSearch, type FaqSearchItem } from "./FaqSearch";
import { Icon } from "@/app/components/Icon";
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

const SIDE_MENU: { label: string; href: string }[] = [
  { label: "지원 허브", href: "/support" },
  { label: "내 문의 내역", href: "/my/support" },
  { label: "자주 묻는 질문", href: "/support/faq" },
  { label: "공지사항", href: "#notices" },
  { label: "투자 제휴 문의", href: "#partner" },
  { label: "광고 문의", href: "#ads" },
  { label: "이용약관", href: "/legal/terms" },
  { label: "개인정보처리방침", href: "/legal/privacy" },
];

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

/* FAQ 분류 타일의 아이콘 — 라벨·개수는 lib/support/faq.ts 에서 온다. 실제 분류를 그대로
   쓰고 /support/faq 의 해당 섹션 앵커로 보낸다(예전엔 눌리지 않는 <div> 였다). */
const FAQ_CATEGORY_ICON: Record<string, string> = {
  "데이터·시세": "bar",
  "임장노트·공개": "clipboard",
  "구독·결제": "wallet",
  "AI 분석": "bot",
  "계정·문의": "lock",
};

/* [970 · A-17] 예시 티켓·예시 답변 블록을 없앴다(없는 기능의 약속이었다).
   [1000] 이제 문의 내역 화면(/my/support)이 있으므로 실제 흐름을 그대로 적는다. */
const CONTACT_FLOW: { step: string; desc: string }[] = [
  { step: "접수", desc: "아래 1:1 문의 폼 또는 메일로 보내 주세요. 접수번호가 발급되고, 로그인 상태면 알림함에 접수 확인이 남아요." },
  { step: "답변", desc: `${RESPONSE_TIME} — 입력하신 이메일과 내 문의 내역에 답변을 드려요.` },
  { step: "추가 문의", desc: "받으신 답변 메일에 회신하거나, 내 문의 내역에서 같은 건으로 이어서 남길 수 있어요." },
];

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
  /* [970 · A-25] 공지 섹션이 안 그려지면 사이드 메뉴의 "#notices" 도 뺀다(빈 앵커 금지) */
  const showNotices = notices.length > 0 || noticesFailed;
  const sideMenu = SIDE_MENU.filter((m) => showNotices || m.href !== "#notices");

  const QUICK: { title: string; desc: string; href: string; icon: string; primary?: boolean }[] = [
    { title: "1:1 문의", desc: `${SUPPORT_HOURS} · ${RESPONSE_TIME}`, href: "#contact", icon: "mail", primary: true },
    { title: "자주 묻는 질문", desc: `데이터 · 노트 · 구독 · AI — 전체 ${faqAll.length}개`, href: "/support/faq", icon: "help" },
    { title: "오류 · 데이터 신고", desc: "시세·크롤링 데이터 오류 제보", href: "#contact", icon: "warning" },
    { title: "내 문의 내역", desc: "남긴 문의와 답변을 화면에서 봐요 (로그인)", href: "/my/support", icon: "file-text" },
  ];

  return (
    <PageShell breadcrumb="고객지원" title="고객지원 허브" wide>
      {/* ── 히어로 — 유리판: 응답 시간 + FAQ 검색(실제 입력·필터) ── */}
      <section
        aria-labelledby="support-hero-title"
        className="rise-in lg-glass mb-4 flex flex-col gap-3 rounded-lg px-5 py-5 md:px-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span id="support-hero-title" className="t-section text-ink">
              무엇을 도와드릴까요?
            </span>
            <span className="t-sub text-text-2">
              {SUPPORT_HOURS} · {RESPONSE_TIME} · 답변은 이메일과 내 문의 내역으로
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="lg-pill">
              <Icon name="clock" size={13} />
              {RESPONSE_TIME.replace(" 이내 답변", "")}
            </span>
            <span className="lg-pill">
              <Icon name="mail" size={13} />
              {supportEmail}
            </span>
          </div>
        </div>
        <FaqSearch items={searchItems} />
      </section>

      {/* ── 분류 타일 — 모바일·태블릿(lg 미만): FAQ 분류로 바로 ── */}
      <div className="rise-in-1 mb-4 grid grid-cols-2 gap-2 lg:hidden [&>*:last-child:nth-child(odd)]:col-span-2">
        {faqGroups.map((g) => (
          <Link
            key={g.category}
            href={`/support/faq#${encodeURIComponent(g.category)}`}
            className="card tile flex flex-col items-center gap-1 rounded-[14px] p-3.5 text-center no-underline"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name={FAQ_CATEGORY_ICON[g.category] ?? "book"} size={18} />
            </span>
            <span className="t-sub font-bold text-text-1">{g.category}</span>
            <span className="t-caption text-text-3">{g.items.length}개</span>
          </Link>
        ))}
      </div>

      {/* [998 · A5] md → lg: 태블릿은 위 카테고리 타일 + 1열, 좌측 메뉴는 lg 부터(둘은 짝). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* 좌측 메뉴 — 서버 컴포넌트라 pathname 을 모른다: 이 화면(/support)만 활성 */}
        <nav aria-label="고객지원 메뉴" className="rise-in-1 card hidden h-fit flex-col rounded-[18px] py-2 lg:flex">
          {sideMenu.map((m) => {
            const active = m.href === "/support";
            const cls = `px-5 py-3 t-body no-underline ${
              active
                ? "border-l-[3px] border-primary bg-primary-soft font-bold text-primary"
                : "font-semibold text-text-1 transition-colors hover:text-primary"
            }`;
            return m.href.startsWith("#") ? (
              <a key={m.label} href={m.href} className={cls}>
                {m.label}
              </a>
            ) : (
              <Link key={m.label} href={m.href} className={cls} aria-current={active ? "page" : undefined}>
                {m.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3.5">
          {/* 지원 4종 타일 */}
          <div className="rise-in-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK.map((q) =>
              q.href.startsWith("#") ? (
                <a
                  key={q.title}
                  href={q.href}
                  className="card tile flex min-h-10 flex-col gap-2 rounded-2xl p-4 no-underline"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${q.primary ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>
                    <Icon name={q.icon} size={17} />
                  </span>
                  <span className="t-section text-ink">{q.title}</span>
                  <span className="t-sub leading-[1.55] text-text-2">{q.desc}</span>
                </a>
              ) : (
                <Link
                  key={q.title}
                  href={q.href}
                  className="card tile flex min-h-10 flex-col gap-2 rounded-2xl p-4 no-underline"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon name={q.icon} size={17} />
                  </span>
                  <span className="t-section text-ink">{q.title}</span>
                  <span className="t-sub leading-[1.55] text-text-2">{q.desc}</span>
                </Link>
              ),
            )}
          </div>

          {/* 1:1 문의 폼 (P2-2) — /api/support 실연동 */}
          <section id="contact" aria-labelledby="contact-title" className="rise-in-3 card flex flex-col gap-3 scroll-mt-24 rounded-2xl px-5 py-[18px]">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 id="contact-title" className="t-section text-ink">1:1 문의 남기기</h2>
              <span className="t-sub text-text-3">{RESPONSE_TIME}</span>
            </div>
            <SupportContactForm supportEmail={supportEmail} />
          </section>

          {/* 공지사항 — board_posts 공지 카테고리 실데이터 (P2-2)
              [970 · A-25] 0건이면 섹션을 숨긴다. 조회 실패는 숨기지 않는다(공지가 없다는 뜻이 아니므로).
              [1000] "전체 ›" 는 목록 화면(/town/news)으로 — 예전엔 /town(커뮤니티 홈)이었다. */}
          {showNotices && (
            <section id="notices" aria-labelledby="notices-title" className="rise-in-3 card flex flex-col gap-1 scroll-mt-24 rounded-2xl px-5 py-[18px]">
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 id="notices-title" className="t-section text-ink">공지사항</h2>
                {/* [1007 · P2] 공지는 사람이 쓴 글(비자동 board_posts)이라 1006 부터 뉴스룸(/town/news,
                    자동수집만)에는 나오지 않는다 — "전체" 는 동네이야기 피드로 간다. */}
                {notices.length > 0 && (
                  <Link href="/town" className="inline-block py-[5px] t-sub font-bold text-primary no-underline">
                    동네이야기에서 전체 ›
                  </Link>
                )}
              </div>
              {noticesFailed ? (
                /* 색은 배경이 지고, 문장은 text-ink 로 읽는다 — 작은 본문에서 가장 확실하다. */
                <div className="rounded-[10px] bg-danger-soft px-3 py-3 text-center t-sub leading-[1.6] text-ink">
                  공지사항을 불러오지 못했습니다 (조회 실패). 공지가 없다는 뜻은
                  아닙니다.
                </div>
              ) : (
                notices.map((n, i, arr) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={`flex min-h-10 items-center justify-between gap-3 py-2 t-sub no-underline ${
                      i < arr.length - 1 ? "border-b border-divider" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate font-semibold text-text-1">
                      <span className="mr-1.5 rounded bg-primary-soft chip-pad t-caption font-extrabold text-primary">
                        공지
                      </span>
                      {n.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-text-3">{n.date}</span>
                  </Link>
                ))
              )}
            </section>
          )}

          {/* 문의 처리 흐름 — 실제 절차만 */}
          <section aria-labelledby="flow-title" className="rise-in-3 card flex flex-col gap-3 rounded-[18px] px-5 py-[18px]">
            <h2 id="flow-title" className="t-section text-ink">문의는 이렇게 처리돼요</h2>
            <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {CONTACT_FLOW.map((f, i) => (
                <li key={f.step} className="flex gap-2.5 rounded-[14px] bg-bg px-3.5 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary t-sub font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="t-body font-bold text-ink">{f.step}</span>
                    <span className="t-sub leading-[1.6] text-text-2">{f.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="lg-hairline" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="t-sub text-text-2">
                남긴 문의와 답변은{" "}
                <Link href="/my/support" className="inline-block py-[5px] font-bold text-primary no-underline">
                  내 문의 내역
                </Link>
                에서 볼 수 있어요 (로그인 필요).
              </span>
              <a href="#contact" className="btn-soft btn-md shrink-0 no-underline">
                문의 남기기
              </a>
            </div>
          </section>

          {/* FAQ 미리보기 — 답은 lib/support/faq.ts 한 곳에서 온다. 화면마다 답을 복제하지 않는다. */}
          <section id="faq" aria-labelledby="faq-title" className="rise-in-4 card flex flex-col gap-1 scroll-mt-24 rounded-[18px] px-5 py-[18px] md:px-6">
            <div className="mb-2 flex flex-col justify-between gap-2 md:flex-row md:items-baseline">
              <h2 id="faq-title" className="t-section text-ink">자주 묻는 질문</h2>
              <Link href="/support/faq" className="inline-block py-[5px] t-sub font-bold text-primary no-underline">
                전체 {faqAll.length}개 보기 ›
              </Link>
            </div>
            {faqPreview.map((it, i) => (
              <Link
                key={it.id}
                href={`/support/faq#${it.id}`}
                className={`flex min-h-10 flex-col gap-1 px-1 py-[11px] no-underline ${
                  i < faqPreview.length - 1 ? "border-b border-divider" : ""
                }`}
              >
                <span className="flex justify-between gap-2 t-body font-bold text-ink">
                  <span>Q. {it.q}</span>
                  <span className="shrink-0 text-primary">›</span>
                </span>
                {i === 0 && <span className="t-sub leading-[1.65] text-text-2">{it.a}</span>}
              </Link>
            ))}
          </section>

          {/* 해결 안 됐나요 */}
          <div className="rise-in-5 ai-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div>
              <div className="t-body font-extrabold text-white">해결이 안 되셨나요?</div>
              <div className="mt-0.5 t-sub text-ai-muted">{SUPPORT_HOURS} · {RESPONSE_TIME}</div>
            </div>
            <a href="#contact" className="btn-primary btn-md rounded-full no-underline">
              1:1 문의
            </a>
          </div>

          {/* 제휴 · 광고 */}
          <div className="rise-in-5 grid gap-3 md:grid-cols-2">
            <section id="partner" aria-labelledby="partner-title" className="ai-panel flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <h2 id="partner-title" className="t-body font-extrabold text-white">투자 · 제휴 문의</h2>
              <div className="t-sub leading-[1.6] text-ai-text">
                IR 자료 요청, 데이터 제휴, 금융사 연동 제안은 별도 채널로 받고 있습니다.
              </div>
              {/* partner@ · ad@ 는 받는 사람이 없는 주소였다. 실제로 운영진이 읽는 주소 한 곳
                  (business-info)으로 모으고 용건 구분은 제목 프리필로 한다. */}
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[제휴] 투자·데이터 제휴 문의")}`}
                className="inline-block py-[5px] t-sub font-bold text-ai-accent"
              >
                {supportEmail}
              </a>
            </section>
            <section id="ads" aria-labelledby="ads-title" className="card flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <h2 id="ads-title" className="t-body font-extrabold text-ink">광고 문의</h2>
              <div className="t-sub leading-[1.6] text-text-2">
                지면 소개서(AD 슬롯 위치·단가)를 보내드립니다. 커뮤니티 어뷰징성 광고는 게재하지
                않습니다.
              </div>
              {/* 내려줄 미디어킷 파일이 없다 — 실제 동작인 "메일로 요청"에 맞춘다. */}
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[광고] 미디어킷 요청")}`}
                className="inline-block py-[5px] t-sub font-bold text-primary"
              >
                {supportEmail} · 메일로 미디어킷 요청
              </a>
            </section>
          </div>

          {/* 약관 푸터 */}
          <div className="rise-in-6 card flex flex-col justify-between gap-2 rounded-2xl px-6 py-[18px] md:flex-row md:items-center">
            {/* [989] 촘촘한 줄의 링크는 24px(py) 로 키우고 줄 사이는 띄운다(WCAG 2.5.8). */}
            <div className="flex flex-wrap gap-x-4 gap-y-3 t-sub text-text-2 md:gap-y-1">
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
            {/* 문서마다 시행일이 다르므로 각 문서 머리의 시행일로 안내한다([970 · A-12]). */}
            <span className="t-sub text-text-3">시행일은 각 문서 상단에 표기</span>
          </div>
          {/* 사업자 정보 — business-info 단일 출처. 없는 항목은 전역 Footer 와 같은 규칙으로 뺀다. */}
          <p className="px-1 t-sub leading-[1.6] text-text-3">
            {biz.legalName} · 대표 {biz.representative || "—"} · 사업자{" "}
            {biz.registrationNumber || "—"}
            {biz.mailOrderSalesNumber ? ` · 통신판매업 ${biz.mailOrderSalesNumber}` : ""} ·{" "}
            {biz.supportEmail} · 제공 정보는 참고용이며 투자 판단의 책임은 이용자에게 있습니다
          </p>
        </div>
      </div>
    </PageShell>
  );
}
