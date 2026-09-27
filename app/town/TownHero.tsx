import type { ReactNode } from "react";
import Link from "next/link";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

/* ============================================================
   [v4 · 규칙 1·4] 동네이야기 하위 화면(뉴스룸·청약·공매·입주·정비사업)의 머리 — **흰 바탕 + 글자 위계**.

   예전([978]~[1012])엔 홈과 같은 네이비 히어로(워터마크 호·점 + 아이콘 칩 + "동네이야기" 눈썹 글자 +
   통계 줄 CountUp + 설명 한 줄 headSub + 채움 파랑 CTA)였다. v4 "한 화면 한 가지"(소유자: "너무 복잡하고
   뭐가 중요한지 … 어수선하다")에서 네이비 면은 AI 결과 패널에만 남기므로 머리는 승인 시안
   (app/analysis/page.tsx · app/complex/[id]/page.tsx 머리)과 같은 모양이다:

     왼쪽  제목 한 줄(t-title = 카테고리 이름 — TownCategoryNav 의 칸 이름과 같은 말, [974])
           사실 한 줄(t-sub text-text-3 — 페이지가 넘긴 **실측 숫자만**. 0·없음이면 줄이 없다)
     오른쪽 작은 아웃라인 행동 하나(action 또는 카탈로그 heroCta) — 채움 파랑은 쓰지 않는다
            (화면의 채움 파랑 1개는 본문의 주인공 자리가 쓴다).

   지운 것: 네이비 면·BrandWatermark·아이콘 칩(규칙 7)·"동네이야기" 눈썹·CountUp·headSub 설명 문장(규칙 3).
   note(모수·출처 설명)는 **머리에 그리지 않는다** — 출처·기준일은 각 페이지 맨 끝 "데이터 출처"(TownSources)
   한 곳으로 모은다(규칙 3). prop 은 보관(비노출) 화면(/qna·/town/groups 등)의 호출과 타입을 깨지 않으려고 남긴다.
   숫자 규칙은 그대로: 0 이하는 그리지 않고, 여기서 새로 세지 않는다(페이지가 이미 든 값만 받는다 — [978]).
   ============================================================ */

export type TownHeroStat = {
  /** 무엇을 센 건지 — "입찰 중·예정" 처럼 모수가 드러나게 */
  label: string;
  /** 실측값. 0 이하면 이 칸은 그리지 않는다. */
  value: number;
  /** "건" · "세대" 등. 생략하면 숫자만. */
  unit?: string;
  /** 누르면 갈 곳(선택) */
  href?: string;
};

export function TownHero({
  href,
  stats = [],
  action,
}: {
  /** 카테고리 목록의 href — 제목·버튼을 여기서 찾는다 */
  href: string;
  /** 이 화면의 실측 숫자. 0 이하인 칸은 자동으로 빠진다. */
  stats?: readonly TownHeroStat[];
  /** [v4] 머리에 그리지 않는다(위 주석) — 출처는 페이지 끝 "데이터 출처"로. 호출 호환용으로만 받는다. */
  note?: string;
  /** heroCta 대신 그릴 조각(작은 아웃라인 버튼 등). 주면 heroCta 는 안 그린다. */
  action?: ReactNode;
}) {
  const link = TOWN_CATEGORY_LINKS.find((l) => l.href === href);
  if (!link) return null;
  const shown = stats.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const cta = link.heroCta[0];

  return (
    /* [v4 · 규칙 1·4] 흰 바탕 머리 — 제목 한 줄 + 사실 한 줄 + 오른쪽 작은 행동 하나 */
    <header className="mb-1 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="t-title text-ink">{link.label}</h1>
        {shown.length > 0 && (
          <p className="mt-0.5 truncate t-sub text-text-3">
            {shown.map((s, i) => {
              const text = (
                <>
                  {s.label} <span className="t-num">{s.value.toLocaleString("ko-KR")}</span>
                  {s.unit ?? ""}
                </>
              );
              return (
                <span key={s.label}>
                  {i > 0 && " · "}
                  {s.href ? (
                    <Link href={s.href} className="text-text-2 no-underline">
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                </span>
              );
            })}
          </p>
        )}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : cta ? (
        <Link href={cta.href} className="btn-outline btn-md shrink-0 no-underline">
          {cta.label}
        </Link>
      ) : null}
    </header>
  );
}

/**
 * [v4 · 규칙 3] 하위 화면 맨 끝 "데이터 출처" 접힘 하나 — 승인 시안 ComplexDataSources 와 같은 모양
 * (border-t + summary "데이터 출처" + `›` 회전). 출처·기준일·면책·방법 설명을 화면 곳곳의 안내 상자·캡션에서
 * 여기로 모은다. 서버 조각(JS 없음) — 접혀 있어도 HTML 에는 있다.
 */
export function TownSources({ children }: { children: ReactNode }) {
  return (
    <details className="group border-t border-line pt-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
        데이터 출처
        <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-2 pb-3 pt-1 t-caption leading-[1.6] text-text-3">{children}</div>
    </details>
  );
}
