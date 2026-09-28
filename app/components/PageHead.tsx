/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";

/* ============================================================
   [1022 · 정렬·글씨·테마] 페이지 머리 — 한 모양.

   소유자 지시 4(2026-09-28): "전체적으로 정렬을 맞추고 글씨크기·글씨체·전체 테마를 맞춰줘".
   1021 까지 머리는 세 벌이 있었다 — 분석 허브(hub-hero) · 동네 9칸(TownHero) · 그 밖의
   페이지(맨 h1, t-display h1, t-title h1, 브레드크럼 + h1 …). 모양은 비슷한데 칩 유무·
   글자 램프·정렬(items-end / items-baseline / items-center)이 제각각이라 화면을 옮길 때마다
   제목 위치가 흔들렸다.

   이 부품 하나로 통일한다:
     아이콘 칩(40px) + h1.t-title + 사실 한 줄(t-sub · 폰 숨김 가능) | 오른쪽 버튼/칩
     그 아래 선택으로 실측 캡션 줄(facts — 숫자는 페이지가 이미 들고 있는 값만).

   규칙:
   · 왼쪽 묶음은 세로 가운데(items-center) — 칩·제목·한 줄이 같은 축에 선다.
   · 오른쪽 묶음은 버튼 줄이므로 오른쪽 정렬(justify-end), 폰에서는 줄바꿈해 왼쪽부터.
   · 글자는 램프만(t-title / t-sub / t-caption). 임의 px 없음. 굵기는 램프가 가진 700 까지.
   · 배경은 없다(흰 바탕 위 한 줄) — 네이비·한지 면을 여기서 다시 만들지 않는다.
   · 부연 라벨("자동 수집"·"사람의 기록")·권유문("…해 보세요")은 sub 에 쓰지 않는다 —
     sub 는 "무엇을 보는 곳인가 — 출처·구성" 명사형 한 줄(TownPageHead 의 974 규칙 그대로).

   TownHero · TownPageHead · hub-hero 는 안에서 이 부품을 쓴다(호출부 API 는 그대로).
   ============================================================ */

export type PageHeadProps = {
  /** 아이콘 이름 — app/components/Icon.tsx ICON_PATHS 에 있는 이름만 */
  icon?: string;
  /** 아이콘 칩 색 — 토큰 클래스만(기본 bg-primary-soft text-primary) */
  tone?: string;
  title: ReactNode;
  /** 사실 한 줄(명사형). 권유문·부연 라벨 금지 */
  sub?: ReactNode;
  /** 폰에서 sub 를 숨길지(기본 true — 머리 높이를 아낀다) */
  subOnPhone?: boolean;
  /** 오른쪽 버튼·칩 묶음 */
  actions?: ReactNode;
  /** 머리 아래 실측 캡션 줄(t-caption) — 0 은 넣지 않는다(호출부 책임) */
  facts?: ReactNode;
  /** 문서 구조상 h2 가 맞으면 바꾼다(기본 h1) */
  as?: "h1" | "h2";
  /** 제목 id(스킵 링크·aria-labelledby 용) */
  titleId?: string;
  className?: string;
};

export function PageHead({
  icon,
  tone = "bg-primary-soft text-primary",
  title,
  sub,
  subOnPhone = false,
  actions,
  facts,
  as: Heading = "h1",
  titleId,
  className = "",
}: PageHeadProps) {
  return (
    <div className={`page-head rise-in flex flex-col gap-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
              aria-hidden="true"
            >
              <Icon name={icon} size={20} />
            </span>
          )}
          <div className="min-w-0">
            <Heading id={titleId} className="t-title text-ink">
              {title}
            </Heading>
            {sub && (
              <p className={`m-0 mt-0.5 t-sub text-text-2${subOnPhone ? "" : " max-md:hidden"}`}>
                {sub}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        )}
      </div>
      {facts && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-caption text-text-3">
          {facts}
        </div>
      )}
    </div>
  );
}

export default PageHead;
