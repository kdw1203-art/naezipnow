"use client";

/**
 * S22 — 쿠키 동의 배너.
 *
 * 결정 전에만 표시되고, "필수만 허용"이 시각적으로 동등한 선택지다
 * (다크 패턴 금지 — 거절 버튼을 흐리게 만들지 않는다). 분석 쿠키는
 * 동의한 경우에만 GA4 로더(components/ga4-gtag-loader.tsx)가 싣는다.
 */
import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "./use-cookie-consent";
import { consentBannerBottom, consentBodyClasses } from "@/lib/client/shell-gates";

export function CookieConsentBanner() {
  const { state, decide } = useCookieConsent();
  const pathname = usePathname() ?? "/";
  const open = state.status === "undecided";

  /* [970 · A-39 · A-20] 배너가 떠 있는 동안 body 에 표식을 남긴다 — globals.css 가
     .nz-consent-open 으로 "맨 위로" FAB 를 숨기고(배너 밑에 깔려 눌리지 않았다),
     .nz-consent-pad 로 md+ body 아래 여백을 줘 코너 카드가 화면 우하단 CTA 를 덮어도
     스크롤로 빠져나가게 한다(/map 은 pad 없음 — 판정은 shell-gates consentBodyClasses). */
  useEffect(() => {
    if (!open) return;
    const classes = consentBodyClasses(pathname);
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [open, pathname]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="쿠키 사용 동의"
      /* 제안 웹1(2026-08-03): 데스크탑에서 중앙 하단 배치가 모든 화면의 본문·CTA
         를 가렸다(캡처 6장 전부). md+ 는 우하단 코너 카드로 내리고, 모바일은
         탭바 위 중앙 유지. */
      /* [968 · 40] 예전(모바일6)엔 결정 전 탭바를 접고 배너가 그 자리(bottom 16px)에
         섰다 — 첫 방문자는 결정 전까지 탭에 손이 안 닿았다. 이제 탭바는 늘 있고
         배너가 탭바 위에 컴팩트하게 선다(bottom 은 CSS 변수로 — 인라인 값이 md+ 의
         코너 카드 위치를 덮지 않게 사용자 정의 속성으로 넘긴다). */
      /* [970 · A-20] md+ 코너 카드가 /subscription 플랜 카드 CTA 를 덮었다. 중앙 하단으로
         되돌리는 안은 위(2026-08-03)에서 이미 기각된 배치라, 자리는 두고 body.nz-consent-open
         (위 효과) 에 md+ 아래 여백을 줘 스크롤로 CTA 가 배너 위로 올라오게 한다(globals.css). */
      className="fixed inset-x-0 z-[70] bottom-[var(--nz-consent-bottom)] px-3.5 md:inset-x-auto md:bottom-5 md:right-5 md:px-0"
      style={{ "--nz-consent-bottom": consentBannerBottom(pathname) } as CSSProperties}
      /* [966] 인쇄 제외 표식 — 고정 클래스가 없어 속성으로 잡는다(globals.css @media print) */
      data-noprint
    >
      {/* 모바일 실측(2026-08-02): 글래스 60% 불투명이라 밑 본문 글자가 배너 문구와
          겹쳐 읽혔고, 패딩까지 더해 화면 하단 1/3 을 차지했다. 동의는 법적 행위의
          UI 다 — 배경을 사실상 불투명(94%)으로 올리고 여백을 줄인다. */}
      {/* [#89] 흰색 고정 배경이 다크에서 회색 글자와 만나 읽을 수 없었다 —
          글래스 토큰(양 테마 정의됨)으로 교체. */}
      {/* [968 · 40] 컴팩트: 여백 14→12px, 문구는 두 줄 안(모바일 폭 기준), 버튼은
          40px 높이 한 줄. 탭바와 같이 서도 하단 1/3 을 넘지 않는다. 블러(backdrop-blur)는
          걷었다 — 탭바 글래스 위에 블러 층을 하나 더 얹을 이유가 없고(항목 13), 블러
          없이 80% 유리면 밑 글자가 비치므로 면은 불투명 surface 토큰(양 테마)으로. */}
      <div className="mx-auto flex max-w-[560px] flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-md)] md:max-w-[360px] md:p-3.5">
        <p className="text-[12px] leading-[1.5] text-text-1">
          내집나우는 서비스 운영에 필요한 필수 쿠키를 사용해요. 이용 통계 분석 쿠키는{" "}
          <b>동의하신 경우에만</b> 사용합니다.{" "}
          {/* [970 · A-19] 셸 링크 — 프리페치 없음 */}
          {/* [989] 문단 속 단독 링크 — 인라인 세로 패딩은 줄 높이를 바꾸지 않으면서
              히트만 24px 로 넓힌다(이 문단에 다른 링크가 없어 겹칠 상대가 없다) */}
          <Link
            href="/legal/privacy"
            prefetch={false}
            className="py-1 font-bold text-primary underline"
          >
            개인정보처리방침
          </Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="min-h-[44px] flex-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] font-bold text-text-1"
          >
            필수만 허용
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="btn-primary min-h-[44px] flex-1 rounded-[10px] px-3 py-2 text-[12px]"
          >
            모두 허용
          </button>
        </div>
      </div>
    </div>
  );
}
