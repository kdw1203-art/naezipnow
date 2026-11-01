"use client";

/* [1091 · 비용] 404 화면의 몸체 — 클라이언트 조각. 왜: 루트 레이아웃의 notFound 자리에 이 화면이 그려지는데, 서버 컴포넌트면
   그 마크업(검색 폼 · 칩 5개 · 그림 · 약 4KB)이 **모든 화면의 RSC 페이로드에** 실려 저장 · 전송됐다(HTML 안 인라인 + .rsc 두 벌 ·
   로컬 실측 3,968B/쪽 · ISR 3만여 쪽). 클라이언트 컴포넌트는 참조(모듈 id)만 실리고 마크업은 404 를 실제로 그릴 때만 만든다.
   404 화면 자체(/_not-found)는 빌드 때 그대로 프리렌더된다(SSR). 문구 · 마크업 · 규칙은 app/not-found.tsx 에 있던 그대로. */
import Link from "@/app/components/IntentLink";
import { Icon } from "./Icon";

/** 봇·옛 링크가 가장 많이 닿는 목적지 — 라벨은 그 화면이 실제로 하는 일 */
const POPULAR_PATHS = [
  { href: "/complex/browse", label: "단지 찾기", primary: true },
  { href: "/tx", label: "지역 실거래" },
  { href: "/town/news", label: "뉴스룸" },
  { href: "/town", label: "동네이야기" },
  { href: "/notes", label: "공개 임장노트" },
] as const;

export default function NotFoundBody() {
  return (
    <main id="main-content" data-nz-noads="" className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center gap-3.5 px-4 py-10 text-center">
      {/* [962] 404 = 빈 화면의 브랜드 순간 — 처마 아래 온점이 조용히 숨쉬고, 슬로건이 마침표를 찍는다 */}
      <svg className="rise-in" width="64" height="59" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M52 28 L68 28" fill="none" stroke="var(--brand-symbol-ink)" strokeWidth="7" strokeLinecap="round" />
        <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke="var(--brand-symbol-ink)" strokeWidth="7" strokeLinecap="round" />
        <circle className="empty-dot-breathe" cx="60" cy="86" r="8.5" fill="var(--brand-dot)" style={{ transformOrigin: "60px 86px" }} />
      </svg>
      <div className="rise-in t-caption font-bold tracking-[0.2em] text-text-3">404</div>
      <h1 className="rise-in-1 t-title text-ink">
        페이지 없음<span className="text-brand-red">.</span>
      </h1>
      {/* [1015 · 규칙 D] 두 문장 → 사실 한 줄(검색창이 곧 다음 행동이다) */}
      <p className="rise-in-2 t-body leading-[1.6] text-text-3">주소가 바뀌었거나 삭제된 페이지</p>

      {/* 검색 — JS 없이 동작하는 GET 폼. 통합 검색(/search?q=)이 단지·지역·노트·이야기·뉴스를 찾는다. */}
      <form
        action="/search"
        method="get"
        role="search"
        className="rise-in-2 flex w-full items-center gap-2 rounded-2xl border-[1.5px] border-primary bg-surface px-3 py-1.5 text-ink shadow-[0_8px_28px_rgba(16,28,54,.08)]"
      >
        <Icon name="search" size={16} className="shrink-0 text-text-3" />
        <input
          type="search"
          name="q"
          placeholder="단지명·지역·동네 검색"
          aria-label="통합 검색"
          autoComplete="off"
          enterKeyHint="search"
          /* 모바일 16px 은 globals.css [968 · 28] 전역 규칙(iOS 줌 방지)이 입힌다 — 여기선 램프 글자만 */
          className="min-h-10 w-full min-w-0 bg-transparent t-body text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="submit"
          className="btn-primary btn-cta shrink-0 rounded-xl px-3.5 py-2 t-body"
        >
          검색
        </button>
      </form>

      {/* [1015 · 규칙 J] 채움 파랑은 검색 버튼 하나 — "홈으로"는 지도 열기와 같은 외곽선 */}
      <div className="rise-in-3 flex gap-2">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-[22px] py-3 t-body font-bold text-text-1 no-underline"
        >
          홈으로
        </Link>
        <Link
          href="/map"
          className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-[22px] py-3 t-body font-bold text-text-1 no-underline"
        >
          지도 열기
        </Link>
      </div>

      {/* 인기 경로 — 40px 칩. 라벨은 목적지가 실제로 하는 일 그대로. */}
      <nav aria-label="자주 찾는 곳" className="rise-in-4 mt-1 flex flex-wrap justify-center gap-1.5">
        {POPULAR_PATHS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`inline-flex min-h-10 items-center rounded-full px-[13px] t-sub font-bold no-underline ${
              "primary" in p && p.primary ? "bg-primary-soft text-primary" : "bg-bg text-text-1"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
