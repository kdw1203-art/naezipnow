/* [1026 · 지역 시세] 1025 표준의 결론 카드 · 다음 행동 카드 · 폰 하단 바 — 지역 시세 네 화면(price · timing · temperature · gap)이 같이 쓴다.
   이 파일이 timing 폴더에 있는 이유: 채움 파랑 "이 지역 알림 받기"는 시세·타이밍 레일의 "이 지역 알림" 카드(알림함 /notifications)를
   네 화면으로 넓힌 것이다 — 새 경로·새 부품이 아니라 그 카드의 자리와 모양만 바꾼다.
   · 결론 카드(VerdictCard): t-title 결론 한 줄 + 판정 칩 하나(좋음 success · 보통 primary · 주의 warning) + 근거 t-sub 한 줄.
     문장은 lib/market/region-conclusion(순수 · 새 계산 없음)이 만든다. 아래 children 은 그 화면의 숫자 칸(세부).
   · 다음 행동 카드(RegionActionCard): 채움 파랑 1(데스크톱 레일에서만 보인다) + 텍스트 링크 3(지도 · 노트 쓰기 · 결정 카드).
   · 폰 하단 바(RegionPrimaryBar): 같은 버튼 요소(RegionAlertButton)를 MobilePrimaryBar 에 — btn-primary 리터럴은 이 파일에 하나.
   "use client" 가 없다 — 서버 페이지(price · temperature)는 서버 마크업으로, 클라이언트 본문(timing · gap)은 그 안에서 그대로 쓴다. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import type { ActionLink, Conclusion, VerdictTone } from "@/lib/market/region-conclusion";

export const VERDICT_CHIP: Record<VerdictTone, string> = {
  good: "bg-success-soft text-success",
  neutral: "bg-primary-soft text-primary",
  caution: "bg-warning-soft text-warning",
};

/** 결론 한 줄 카드 — 화면당 하나. children = 그 화면의 숫자 칸(폰에서는 호출부가 칸 수를 줄인다) */
export function VerdictCard({ conclusion, children }: { conclusion: Conclusion; children?: ReactNode }) {
  const { title, chip, sub } = conclusion;
  return (
    <section className="card rounded-2xl p-4 max-md:p-3.5" aria-label="결론">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="m-0 min-w-0 t-title text-ink">{title}</h2>
        {chip && (
          <span className={`inline-flex min-h-[24px] shrink-0 items-center rounded-full px-2.5 t-caption font-bold ${VERDICT_CHIP[chip.tone]}`}>
            {chip.label}
          </span>
        )}
      </div>
      {sub && <p className="m-0 mt-1 t-sub text-text-2">{sub}</p>}
      {children}
    </section>
  );
}

/** 채움 파랑 — 화면의 주 행동 하나. 레일(lg+)과 폰 하단 바가 이 요소를 나눠 그린다 */
export function RegionAlertButton() {
  return (
    <Link href="/notifications" className="btn-primary btn-md press w-full gap-1.5 no-underline">
      <Icon name="bell" size={16} />
      이 지역 알림 받기
    </Link>
  );
}

/** 다음 행동 카드 — 레일 안(데스크톱) · 본문 끝(폰, 채움 파랑은 하단 바가 맡아 숨긴다) */
export function RegionActionCard({
  regionLabel,
  links,
  extra,
}: {
  /** 알림 대상 지역 표기 — 없으면 지역 없이 */
  regionLabel: string | null;
  links: readonly ActionLink[];
  /** 카드 안 작은 그림(시세·타이밍의 지수 흐름 스파크 등) */
  extra?: ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5">
      <h2 className="t-section text-ink">다음 행동</h2>
      <p className="m-0 t-sub text-text-2">{regionLabel ? `${regionLabel} · ` : ""}실거래 등록·지수 변동 알림</p>
      {extra}
      <div className="hidden lg:block">
        <RegionAlertButton />
      </div>
      <ul className="m-0 flex list-none flex-col divide-y p-0" data-tone="plain" aria-label="이어서 할 일">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="flex min-h-10 items-center justify-between gap-2 t-sub font-bold text-primary no-underline">
              {l.label}
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 폰 하단 바 — 화면에 한 번만 그린다(레일 복제본 안에 넣지 않는다) */
export function RegionPrimaryBar() {
  return (
    <MobilePrimaryBar label="이 지역 알림">
      <RegionAlertButton />
    </MobilePrimaryBar>
  );
}
