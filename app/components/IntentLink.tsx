"use client";

/**
 * [1088 · 비용] 링크 미리 받기(prefetch)를 "손이 닿을 때"로 — next/link 대신 이 파일을 쓴다(같은 props · 같은 마크업).
 *
 * ── 왜 ───────────────────────────────────────────────────────────────────────
 * next/link 의 기본(prefetch 를 적지 않음)은 링크가 화면 근처(200px)에 들어오는 순간 그 화면의 RSC 를 받는다.
 * 이 사이트의 사람 방문은 하루 수십 회인데(1007 실측 · 사람 페이지뷰 ~17/일), JS 를 실행하는 크롤러
 * (PerplexityBot · OAI-SearchBot · Amazonbot · 헤드리스 크롬 …)는 화면을 열고 끝까지 내리면서 그 링크를 전부 받게 만든다.
 * 로컬 측정(1087 빌드 · 크롤러 UA 로 열고 끝까지 스크롤): 단지 화면 1회 = 미리 받기 21건 · 동 화면 36건 · 홈 27건.
 * 받는 곳 대부분이 롱테일 ISR(단지 2.4만 곳 · 동 · 뉴스 글)이라 캐시에 없으면 그 자리에서 렌더하고 저장한다(ISR 쓰기 ·
 * 오리진 전송) — 크롤러 한 번의 방문이 렌더 수십 번이 됐다. /notes/new?apt= · /login?callbackUrl= · /analysis?complexId= 같은
 * 동적 화면은 미리 받기마다 함수가 돈다.
 *
 * ── 규칙 ─────────────────────────────────────────────────────────────────────
 *  - prefetch 를 적지 않은 링크: 화면에 보여도 받지 않는다. 마우스가 올라가거나(mouseenter) 손가락이 닿거나(touchstart)
 *    키보드 포커스가 오면 한 번 받는다(next/link 기본과 같은 종류 "auto" — 정적 화면은 통째로 · 동적 화면은 로딩 경계까지).
 *    누르기 직전 100~300ms 앞서 받으므로 사람의 이동 속도는 거의 같다.
 *  - prefetch={false}: 예전 그대로 아예 받지 않는다. prefetch={true}: 예전 그대로(보이면 통째로).
 *  - 같은 사이트 경로("/…")만 받는다 — 바깥 주소·mailto·tel 은 next/link 가 원래 받지 않는다.
 * 탭바 다섯 칸(TabBar)은 1085 의 같은 규칙(손이 닿을 때 + 첫 입력 뒤 쉬는 시간)을 따로 갖고 있다.
 */
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";
import { intentPrefetchHref } from "@/lib/client/intent-prefetch";

type LinkProps = ComponentProps<typeof NextLink>;
type PrefetchOptions = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>;

/** next/link 기본 미리 받기와 같은 종류(PrefetchKind.AUTO 의 값 "auto") */
const AUTO_PREFETCH = { kind: "auto" } as unknown as PrefetchOptions;

export default function IntentLink({ prefetch, onMouseEnter, onTouchStart, onFocus, ...rest }: LinkProps) {
  const router = useRouter();
  const warmed = useRef(false);

  if (prefetch === false || prefetch === true) {
    return <NextLink {...rest} prefetch={prefetch} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} onFocus={onFocus} />;
  }

  const warm = () => {
    if (warmed.current) return;
    const href = intentPrefetchHref(rest.href);
    if (!href) return;
    warmed.current = true;
    router.prefetch(href, AUTO_PREFETCH);
  };

  return (
    <NextLink
      {...rest}
      prefetch={false}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        warm();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        warm();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        warm();
      }}
    />
  );
}
