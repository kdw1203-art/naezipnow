import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { readBoardPosts } from "@/lib/newui/board-posts";
import { SupportContactForm } from "./SupportContactForm";
import { Icon } from "@/app/components/Icon";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  supportFaqByCategory,
  supportFaqItems,
  type SupportFaqItem,
} from "@/lib/support/faq";
import { logger } from "@/lib/log";
import { getBusinessInfo } from "@/lib/brand/business-info";

/* P2-2: 사이드메뉴 실링크 · 문의 폼(/api/support) 연동 · 공지 board_posts(공지 카테고리) 실연동 */

export const metadata = buildPageMetadata({
  title: "고객지원",
  description:
    "공지사항, 자주 묻는 질문, 오류 신고와 제휴 문의를 한곳에서 처리합니다.",
  path: "/support",
});

const SIDE_MENU: { label: string; href: string }[] = [
  { label: "지원 허브", href: "/support" },
  { label: "공지사항", href: "#notices" },
  { label: "자주 묻는 질문", href: "#faq" },
  { label: "투자 제휴 문의", href: "#partner" },
  { label: "광고 문의", href: "#ads" },
  { label: "이용약관", href: "/legal/terms" },
  { label: "개인정보처리방침", href: "/legal/privacy" },
];

type NoticeItem = { id: string; title: string; date: string };

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
        .map((p) => {
          const t = new Date(p.createdAt);
          const date = Number.isFinite(t.getTime())
            ? `${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`
            : "";
          return { id: p.id, title: p.title, date };
        }),
      failed: false,
    };
  } catch (e) {
    logger.error("[/support] 공지사항 조회 실패", e);
    return { notices: [], failed: true };
  }
}

/* 모바일 FAQ 카테고리 카드의 아이콘 — 라벨·개수는 lib/support/faq.ts 에서 온다.
   예전에는 이 배열에 라벨까지 직접 적혀 있었고("노트 · 기록", "계정 · 보안")
   카드는 링크가 아닌 <div> 였다. 카드 모양이라 눌릴 것처럼 보이는데 아무 데도
   가지 않았고, 라벨도 실제 FAQ 분류와 이름이 달라서 어디로 갈지조차 알 수 없었다.
   실제 분류를 그대로 쓰고 /support/faq 의 해당 섹션 앵커로 보낸다. */
const FAQ_CATEGORY_ICON: Record<string, string> = {
  "데이터·시세": "bar",
  "임장노트·공개": "clipboard",
  "구독·결제": "wallet",
  "AI 분석": "bot",
  "계정·문의": "lock",
};

/* [970 · A-18] 응답 시간 문구 단일 출처 — 예전엔 카드 두 곳이 "평균 응답 4시간",
   폼 머리·접수 완료 화면·API 접수 알림은 "영업일 기준 24~72시간" 이라 같은 화면이
   두 가지 약속을 했다. 실측 평균은 어디에도 없으므로 코드가 실제로 약속하는
   값(app/api/support/route.ts 접수 알림 본문)으로 통일한다. */
const RESPONSE_TIME = "영업일 기준 24~72시간 이내 답변";

/* [970 · A-17] 예시 티켓·예시 답변 블록(TICKETS)을 없앴다. "문의를 남기면 내 문의 내역이
   여기에 표시됩니다", "실제 문의도 같은 화면에서 이어서 주고받아요" 는 없는 기능의
   약속이었다 — 문의 내역 화면도, 화면 안 답변 스레드도 없다. 실제 흐름(폼·메일 접수 →
   이메일 답변, 로그인 시 알림함에 접수 확인)만 적는다. */
const CONTACT_FLOW: { step: string; desc: string }[] = [
  { step: "접수", desc: "아래 1:1 문의 폼 또는 메일로 보내 주세요. 로그인 상태면 알림함에 접수 확인이 남아요." },
  { step: "답변", desc: `${RESPONSE_TIME} — 입력하신 이메일로 답변을 드려요.` },
  { step: "추가 문의", desc: "받으신 답변 메일에 회신하면 같은 건으로 이어서 처리돼요." },
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
  const byId = new Map(supportFaqItems().map((i) => [i.id, i]));
  const faqAll = supportFaqItems();
  const faqGroups = supportFaqByCategory();
  const faqPreview = SUPPORT_FAQ_PREVIEW_IDS.map((id) => byId.get(id)).filter(
    (x): x is SupportFaqItem => x !== undefined,
  );
  const faqLead = faqPreview[0];
  const faqRest = faqPreview.slice(1);
  /* [970 · A-25] 공지 섹션이 안 그려지면 사이드 메뉴의 "#notices" 도 뺀다(빈 앵커 금지) */
  const showNotices = notices.length > 0 || noticesFailed;
  const sideMenu = SIDE_MENU.filter((m) => showNotices || m.href !== "#notices");
  return (
    <PageShell breadcrumb="고객지원" title="고객지원 허브" wide>
      {/* 예전엔 검색창 모양의 <div> 에 "⌕ 무엇을 도와드릴까요?" 만 적혀 있었다.
          입력칸도, 핸들러도, 검색 대상도 없어서 눌러도 아무 일이 없었다.
          이 화면에서 실제로 답이 있는 곳은 FAQ 전체 목록이므로 그리로 보낸다. */}
      <Link
        href="/support/faq"
        className="rise-in tile mb-4 flex items-center justify-between gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[13px] text-text-2 md:w-[280px]"
      >
        <span>자주 묻는 질문에서 답 찾기</span>
        <span className="text-xs font-extrabold text-primary">›</span>
      </Link>

      {/* 모바일 FAQ 카테고리 (7g) — 실제 FAQ 분류로 /support/faq 섹션 앵커 이동
          [970 · A-24] 분류가 5개라 2열 그리드의 마지막 칸이 고아였다 — 홀수 번째 마지막
          카드는 두 칸을 차지한다(분류 수가 바뀌어도 규칙이 따라간다). */}
      <div className="rise-in-1 mb-4 grid grid-cols-2 gap-2 md:hidden [&>*:last-child:nth-child(odd)]:col-span-2">
        {faqGroups.map((g) => (
          <Link
            key={g.category}
            href={`/support/faq#${encodeURIComponent(g.category)}`}
            className="card tile rounded-[14px] p-3.5 text-center no-underline"
          >
            <div className="text-[19px]">
              <Icon
                name={FAQ_CATEGORY_ICON[g.category] ?? "book"}
                size={22}
                className="inline align-middle"
              />
            </div>
            <div className="mt-1 text-xs font-bold text-text-1">{g.category}</div>
            <div className="text-[10px] text-text-3">{g.items.length}개</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        {/* 좌측 메뉴 (9n) */}
        <nav className="rise-in-1 card hidden h-fit flex-col rounded-[18px] py-2 md:flex">
          {sideMenu.map((m, i) =>
            m.href.startsWith("#") ? (
              <a
                key={m.label}
                href={m.href}
                className="px-5 py-3 text-[13px] font-semibold text-text-1 transition-colors hover:text-primary"
              >
                {m.label}
              </a>
            ) : (
              <Link
                key={m.label}
                href={m.href}
                className={`px-5 py-3 text-[13px] ${
                  i === 0
                    ? "border-l-[3px] border-primary bg-primary-soft font-bold text-primary"
                    : "font-semibold text-text-1 transition-colors hover:text-primary"
                }`}
              >
                {m.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex flex-col gap-3.5">
          {/* 지원 3종 카드 (9n) */}
          <div className="rise-in-2 grid gap-3 md:grid-cols-3">
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">1:1 문의</div>
              <div className="text-xs leading-[1.55] text-text-2">평일 10-18시 · {RESPONSE_TIME}</div>
              <a href="#contact" className="btn-primary mt-1 rounded-[10px] p-[9px] text-center text-xs">
                문의 남기기
              </a>
            </div>
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">자주 묻는 질문</div>
              <div className="text-xs leading-[1.55] text-text-2">노트 · 구독 · 결제 · 전문가 등록</div>
              <a
                href="#faq"
                className="mt-1 rounded-[10px] bg-bg p-[9px] text-center text-xs font-bold text-text-1"
              >
                FAQ 보기
              </a>
            </div>
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">오류 · 데이터 신고</div>
              <div className="text-xs leading-[1.55] text-text-2">시세·크롤링 데이터 오류 제보</div>
              <a
                href="#contact"
                className="mt-1 rounded-[10px] bg-bg p-[9px] text-center text-xs font-bold text-text-1"
              >
                신고하기
              </a>
            </div>
          </div>

          {/* 1:1 문의 폼 (P2-2) — /api/support 실연동 */}
          <div id="contact" className="rise-in-3 card flex flex-col gap-3 scroll-mt-24 rounded-2xl px-5 py-[18px]">
            <div>
              <span className="text-[13px] font-extrabold text-ink">1:1 문의 남기기</span>
              <span className="ml-2 text-[12px] text-text-3">{RESPONSE_TIME}</span>
            </div>
            <SupportContactForm />
          </div>

          {/* 공지사항 (9n) — board_posts 공지 카테고리 실데이터 (P2-2)
              [970 · A-25] 0건이면 섹션을 숨긴다 — "등록된 공지사항이 아직 없습니다" 빈 카드에
              "전체 ›"(→/town) 까지 붙어 있어, 없는 것을 보러 가라는 링크였다. 조회 실패는
              숨기지 않는다(공지가 없다는 뜻이 아니므로). "전체 ›" 는 공지가 있을 때만. */}
          {showNotices && (
            <div id="notices" className="rise-in-3 card flex flex-col gap-1 scroll-mt-24 rounded-2xl px-5 py-[18px]">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-extrabold text-ink">공지사항</span>
                {notices.length > 0 && (
                  <Link href="/town" className="text-[12px] font-bold text-primary">
                    전체 ›
                  </Link>
                )}
              </div>
              {noticesFailed ? (
                /* 색은 배경이 지고, 문장은 text-ink 로 읽는다 — 작은 본문에서 가장 확실하다. */
                <div className="rounded-[10px] bg-danger-soft px-3 py-3 text-center text-xs leading-[1.6] text-ink">
                  공지사항을 불러오지 못했습니다 (조회 실패). 공지가 없다는 뜻은
                  아닙니다.
                </div>
              ) : (
                notices.map((n, i, arr) => (
                  <Link
                    key={n.id}
                    href={`/town/news/${n.id}`}
                    className={`flex justify-between gap-3 py-2 text-xs ${
                      i < arr.length - 1 ? "border-b border-divider" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate font-semibold text-text-1">
                      <span className="mr-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                        공지
                      </span>
                      {n.title}
                    </span>
                    <span className="shrink-0 text-text-3">{n.date}</span>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* [970 · A-17] 문의 처리 흐름 — 예시 티켓·예시 답변 대신 실제 절차만 */}
          <div className="rise-in-3 card flex flex-col gap-3 rounded-[18px] px-5 py-[18px]">
            <div className="text-[13px] font-extrabold text-ink">문의는 이렇게 처리돼요</div>
            <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {CONTACT_FLOW.map((f, i) => (
                <li key={f.step} className="flex gap-2.5 rounded-[14px] bg-bg px-3.5 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-bold text-ink">{f.step}</span>
                    <span className="text-[12px] leading-[1.6] text-text-2">{f.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between gap-2 border-t border-divider pt-3">
              <span className="text-xs text-text-3">
                문의 내역을 화면에서 따로 보여 주는 기능은 아직 없어요 — 답변은 이메일로 드려요
              </span>
              <a
                href="#contact"
                className="shrink-0 rounded-full bg-primary-soft px-4 py-[7px] text-xs font-bold text-primary no-underline"
              >
                문의 남기기
              </a>
            </div>
          </div>

          {/* FAQ (10b + 7g) — 답은 lib/support/faq.ts 한 곳에서 온다.
              여기 답을 따로 적어 두었더니 실제로 없는 기능(사진·텍스트 자동 마스킹)을
              있다고 약속하는 문장이 남아 있었다. 화면마다 답을 복제하지 않는다. */}
          <div id="faq" className="rise-in-4 card flex flex-col gap-1 scroll-mt-24 rounded-[18px] px-6 py-[22px]">
            <div className="mb-2 flex flex-col justify-between gap-2 md:flex-row md:items-baseline">
              <span className="text-[15px] font-extrabold text-ink">자주 묻는 질문</span>
              <Link href="/support/faq" className="text-[12px] font-bold text-primary">
                전체 {faqAll.length}개 보기 ›
              </Link>
            </div>
            <Link
              href={`/support/faq#${faqLead.id}`}
              className="flex flex-col gap-2 rounded-xl border border-line bg-[rgba(29,79,216,.03)] px-4 py-[13px] no-underline"
            >
              <span className="flex justify-between text-[13px] font-bold text-ink">
                <span>Q. {faqLead.q}</span>
                <span className="text-primary">›</span>
              </span>
              <span className="text-xs leading-[1.65] text-text-2">{faqLead.a}</span>
            </Link>
            {faqRest.map((it, i, arr) => (
              <Link
                key={it.id}
                href={`/support/faq#${it.id}`}
                className={`flex justify-between px-4 py-[13px] text-[13px] font-bold text-text-1 no-underline ${
                  i < arr.length - 1 ? "border-b border-divider" : ""
                }`}
              >
                <span>Q. {it.q}</span>
                <span className="text-on-dark-muted">›</span>
              </Link>
            ))}
          </div>

          {/* 해결 안 됐나요 (7g) */}
          <div className="rise-in-5 ai-panel flex items-center justify-between rounded-2xl p-4">
            <div>
              <div className="text-[13px] font-extrabold text-white">해결이 안 되셨나요?</div>
              <div className="mt-0.5 text-[12px] text-ai-muted">평일 10-18시 · {RESPONSE_TIME}</div>
            </div>
            <a href="#contact" className="btn-primary rounded-full px-4 py-[9px] text-xs">
              1:1 문의
            </a>
          </div>

          {/* 제휴 · 광고 (9n) */}
          <div className="rise-in-5 grid gap-3 md:grid-cols-2">
            <div id="partner" className="ai-panel flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <div className="text-[13px] font-extrabold text-white">투자 · 제휴 문의</div>
              <div className="text-xs leading-[1.6] text-ai-text">
                IR 자료 요청, 데이터 제휴, 금융사 연동 제안은 별도 채널로 받고 있습니다.
              </div>
              {/* partner@ · ad@ 는 받는 사람이 없는 주소였다. 문의 창구로 적어 두고
                  아무도 안 읽으면, 보낸 사람은 답을 기다리며 다른 곳을 찾지 않는다.
                  실제로 운영진이 읽는 주소 한 곳(business-info)으로 모은다.
                  용건 구분은 제목 프리필로 한다. */}
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[제휴] 투자·데이터 제휴 문의")}`}
                className="text-xs font-bold text-ai-accent"
              >
                {supportEmail}
              </a>
            </div>
            <div id="ads" className="card flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <div className="text-[13px] font-extrabold text-ink">광고 문의</div>
              <div className="text-xs leading-[1.6] text-text-2">
                지면 소개서(AD 슬롯 위치·단가)를 보내드립니다. 커뮤니티 어뷰징성 광고는 게재하지
                않습니다.
              </div>
              {/* mailto 링크에 "미디어킷 다운로드"라고 적혀 있었지만 눌러도 받아지는
                  파일이 없다(내려줄 파일 자체가 없다). 실제 동작인 "메일로 요청"에 맞춘다. */}
              <a
                href={`mailto:${supportEmail}?subject=${encodeURIComponent("[광고] 미디어킷 요청")}`}
                className="text-xs font-bold text-primary"
              >
                {supportEmail} · 메일로 미디어킷 요청
              </a>
            </div>
          </div>

          {/* 약관 푸터 (9n) */}
          <div className="rise-in-6 card flex flex-col justify-between gap-2 rounded-2xl px-6 py-[18px] md:flex-row md:items-center">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
              <Link href="/legal/terms" className="font-bold text-text-1 hover:text-primary">
                이용약관
              </Link>
              <Link href="/legal/privacy" className="font-bold text-text-1 hover:text-primary">
                개인정보처리방침
              </Link>
              <Link href="/legal/location" className="hover:text-primary">
                위치기반서비스 약관
              </Link>
              <Link href="/legal/youth" className="hover:text-primary">
                청소년보호정책
              </Link>
            </div>
            {/* "이전 버전 보기"를 붙여 뒀지만 약관 개정 이력 페이지가 없다 —
                링크처럼 읽히는 글자만 남아 있었다.
                [970 · A-12] 여기 적혀 있던 "시행 2026.07.15" 는 이용약관(v1.3 2026-09-06)·
                개인정보처리방침(2026-06-24) 어느 쪽 시행일도 아니었다. 문서마다 시행일이
                다르므로 각 문서 머리의 시행일로 안내한다. */}
            <span className="text-[12px] text-text-3">시행일은 각 문서 상단에 표기</span>
          </div>
          {/* 2026-07-28: 이 줄은 사업자 정보를 손으로 적어 두고 있었고, 그중
              "통신판매업 제2026-안양동안-0000호" 는 **없는 번호**였다(0000).
              business-info.ts 는 통신판매업 신고 전이라 이 값을 빈 문자열로 두고,
              전역 Footer 는 값이 없으면 줄에서 아예 뺀다. 신고도 안 한 번호를
              화면에 적어 두면 그건 표기 오류가 아니라 허위 표시다.
              같은 소스를 쓰고, 없는 항목은 같은 규칙으로 뺀다. */}
          <p className="px-1 text-[12px] leading-[1.6] text-text-3">
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
