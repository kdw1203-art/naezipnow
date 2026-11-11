"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

/* [1140 · 관리자 개편] 소유자 2026-11-11 시안 C + B — "메뉴 5묶음 + 검색" · 첫 화면에 상태 신호등.
 *
 * 예전(G004): 보는 주기 기준 3그룹(매일 / 주간 / 설정·도구) 22줄. 혼자 운영하면 "주기"보다 "무슨 일인가"로 찾는다 —
 * 결제가 안 되면 결제 묶음, 수집이 멈추면 데이터 묶음. 그래서 **일의 종류** 5묶음으로 바꾼다(맨 위 "오늘"은 늘 펼침).
 * 묶음은 접혀 있고 지금 보는 화면이 든 묶음만 열린다. 위 검색 칸에 낱말을 치면 묶음과 상관없이 맞는 메뉴만 남는다(/ 로 초점).
 *
 * 모바일(가로 스크롤)에서는 묶음 제목 없이 한 줄 유지 — 접이식 · 검색은 md 이상에서만.
 * 정적 배지 금지 원칙(실집계 아닌 숫자 금지)은 그대로 유지한다. */
const NAV_GROUPS: Array<{ title: string; items: NavItem[]; defaultOpen: boolean }> = [
  {
    title: "오늘",
    defaultOpen: true,
    items: [
      { href: "/admin", label: "대시보드" },
      { href: "/admin/ops", label: "운영 · 공지" },
    ],
  },
  {
    title: "회원 · 콘텐츠",
    defaultOpen: false,
    items: [
      /* [1141] 가입 회원 조회 · 기본 정보 통계 */
      { href: "/admin/members", label: "회원" },
      { href: "/admin/moderation", label: "신고 · 모더레이션" },
      { href: "/admin/support", label: "고객 문의" },
      /* [1097] 매일 큐(검수 대기 · 신고 3건 숨김 · 소유 확인) */
      { href: "/admin/listings", label: "매물 검수" },
      { href: "/admin/community", label: "커뮤니티 운영" },
      { href: "/admin/quality", label: "품질 · 인증" },
    ],
  },
  {
    title: "데이터",
    defaultOpen: false,
    items: [
      { href: "/admin/freshness", label: "데이터 신선도" },
      { href: "/admin/data", label: "데이터 · 지오코딩" },
      { href: "/admin/ai", label: "AI 도구" },
    ],
  },
  {
    title: "매출 · 결제",
    defaultOpen: false,
    items: [
      { href: "/admin/revenue", label: "수익" },
      { href: "/admin/payments", label: "결제 연동" },
      { href: "/admin/market", label: "마켓 · 정산" },
      { href: "/admin/banners", label: "배너 · 광고" },
    ],
  },
  {
    title: "유입 · 성능",
    defaultOpen: false,
    items: [
      { href: "/admin/traffic", label: "트래픽" },
      /* [1061] 네이버·구글 유입 — 우리 측정 착지 · 서치콘솔 실적 · 서치어드바이저 손 기록 */
      { href: "/admin/search", label: "검색 유입" },
      { href: "/admin/seo", label: "SEO 측정" },
      { href: "/admin/perf", label: "성능" },
      { href: "/admin/experiments", label: "실험 (A/B)" },
    ],
  },
  {
    title: "도구",
    defaultOpen: false,
    items: [
      { href: "/admin/social", label: "소셜 · 쇼츠" },
      { href: "/admin/blog-pack", label: "블로그 팩" },
      { href: "/admin/promo", label: "홍보 킷" },
    ],
  },
];

/** 검색에만 쓰는 다른 이름 — 메뉴 이름을 몰라도 하려는 일로 찾는다 */
const KEYWORDS: Record<string, string> = {
  "/admin": "홈 현황 상태 오늘",
  "/admin/ops": "경보 알림 장애 공지 크론",
  "/admin/members": "회원 가입자 이메일 조회 통계 연령 직업",
  "/admin/moderation": "신고 댓글 숨김 차단",
  "/admin/support": "문의 답변 환불 cs",
  "/admin/listings": "매물 검수 중개사 소유",
  "/admin/community": "동네 글 게시판",
  "/admin/quality": "전문가 심사 인증 구독",
  "/admin/freshness": "수집 적재 크론 실거래 지수 뉴스",
  "/admin/data": "좌표 지오코딩 단지 수동 실행",
  "/admin/ai": "분석 모델 사용량",
  "/admin/revenue": "매출 수익 포인트",
  "/admin/payments": "토스 결제 키 웹훅",
  "/admin/market": "정산 판매",
  "/admin/banners": "광고 애드센스",
  "/admin/traffic": "방문 조회 유입",
  "/admin/search": "네이버 구글 서치콘솔",
  "/admin/seo": "색인 사이트맵",
  "/admin/perf": "속도 번들 웹 바이탈",
  "/admin/experiments": "ab 테스트",
  "/admin/social": "유튜브 인스타 쇼츠 업로드",
  "/admin/blog-pack": "블로그 글",
  "/admin/promo": "홍보 문구",
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap px-5 py-[11px] text-[13px] transition-colors ${
        active
          ? "border-b-[3px] border-ai-accent bg-[rgba(126,162,255,.1)] font-bold !text-ai-accent md:border-b-0 md:border-l-[3px]"
          : "border-b-[3px] border-transparent font-semibold !text-[#9aa6b8] hover:!text-[#c9d2e0] md:border-b-0 md:border-l-[3px]"
      }`}
    >
      {item.label}
      {/* [1141] 처리 대기 실집계 — 0 이거나 못 읽었으면 안 그린다 */}
      {badge ? (
        <span className="ml-2 rounded-full bg-[#ff6b5e] px-1.5 text-[12px] font-bold leading-[18px] !text-white">
          {badge > 99 ? "99+" : badge}
          <span className="sr-only">건 대기</span>
        </span>
      ) : null}
    </Link>
  );
}

export function AdminNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
  const [q, setQ] = useState("");
  /* 모바일 묶음 — 고르지 않았으면 지금 화면이 든 묶음 */
  const [picked, setPicked] = useState<number | null>(null);
  const activeGroup = Math.max(0, NAV_GROUPS.findIndex((g) => g.items.some(isActive)));
  const mobileGroup = picked ?? activeGroup;
  const inputRef = useRef<HTMLInputElement>(null);

  /* "/" 로 메뉴 검색 — 글자를 치는 중(입력 칸 · 편집 영역)에는 가로채지 않는다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!inputRef.current || inputRef.current.offsetParent === null) return;
      e.preventDefault();
      inputRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = norm(q);
  const hits = needle
    ? NAV_GROUPS.flatMap((g) => g.items).filter((i) => norm(`${i.label}${KEYWORDS[i.href] ?? ""}`).includes(needle))
    : [];

  return (
    <nav aria-label="관리자 메뉴">
      {/* 모바일 — 그룹 없이 한 줄 가로 스크롤 (기존 동작 유지) */}
      {/* [1141] 모바일도 묶음으로 — 윗줄에서 묶음을 고르면 아랫줄에 그 묶음 화면만(23개를 한 줄로 밀던 것) */}
      <div className="md:hidden">
        <div className="flex flex-row gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="메뉴 묶음">
          {NAV_GROUPS.map((g, i) => {
            const on = i === mobileGroup;
            const waiting = g.items.reduce((n, it) => n + (badges[it.href] ?? 0), 0);
            return (
              <button
                key={g.title}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPicked(i)}
                className={`min-h-10 flex-none whitespace-nowrap rounded-full border px-3 text-[13px] font-bold ${
                  on ? "border-ai-accent bg-[rgba(126,162,255,.14)] !text-ai-accent" : "border-[rgba(255,255,255,.12)] !text-[#9aa6b8]"
                }`}
              >
                {g.title}
                {waiting ? <span className="ml-1 !text-[#ff8f85]">{waiting}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-row overflow-x-auto">
          {NAV_GROUPS[mobileGroup].items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} badge={badges[item.href]} />
          ))}
        </div>
      </div>
      {/* md+ — 검색 + 묶음 접이식. 활성 항목이 든 묶음은 항상 연다(길 잃지 않기). */}
      <div className="hidden md:block">
        <div className="px-4 pb-2">
          <label htmlFor="admin-nav-search" className="sr-only">
            메뉴 검색
          </label>
          <input
            id="admin-nav-search"
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
            }}
            placeholder="메뉴 검색 · /"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.05)] px-3 text-[13px] !text-white placeholder:!text-[#7d8798] focus:border-ai-accent focus:outline-none"
          />
        </div>
        {needle ? (
          <div className="flex flex-col" role="list" aria-label="메뉴 검색 결과">
            {hits.length === 0 ? (
              <p className="m-0 px-5 py-3 text-[12px] !text-[#7d8798]">맞는 메뉴 없음</p>
            ) : (
              hits.map((item) => <NavLink key={item.href} item={item} active={isActive(item)} badge={badges[item.href]} />)
            )}
          </div>
        ) : (
          NAV_GROUPS.map((g) => {
            const containsActive = g.items.some(isActive);
            return (
              <details key={g.title} open={g.defaultOpen || containsActive}>
                <summary className="flex cursor-pointer select-none items-center justify-between px-5 pb-1.5 pt-3 text-[13px] font-bold !text-[#c9d2e0] hover:!text-white [&::-webkit-details-marker]:hidden">
                  {g.title}
                  {(() => {
                    const waiting = g.items.reduce((n, it) => n + (badges[it.href] ?? 0), 0);
                    return waiting ? (
                      <span className="text-[12px] font-bold !text-[#ff8f85]">{waiting}건 대기</span>
                    ) : (
                      <span className="text-[12px] font-medium !text-[#5f6b7d]">{g.items.length}</span>
                    );
                  })()}
                </summary>
                <div className="flex flex-col pb-1">
                  {g.items.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item)} badge={badges[item.href]} />
                  ))}
                </div>
              </details>
            );
          })
        )}
      </div>
    </nav>
  );
}
