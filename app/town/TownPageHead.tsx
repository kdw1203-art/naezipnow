import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

/* [978] **이 컴포넌트는 더 이상 9칸 머리가 아니다.**
   동네이야기 하위 9칸은 이제 홈과 같은 네이비 히어로(app/town/TownHero.tsx)를 쓴다.
   여기는 카테고리 목록에 없는 하위 상세 화면이 "아이콘 칩 + 제목 + 한 줄"이 필요할
   때를 위해 남겨 둔다. 9칸 페이지에서 이걸 다시 쓰면 홈과 머리가 갈라진다.

   [959] 동네이야기 하위 페이지 머리 — 한 모양.
   개편 전에는 다섯 가지가 섞여 있었다(히어로 띠 / 네이비 카드 / PageShell title /
   맨 h1 / sr-only h1). 카테고리 줄 아래에 **아이콘 칩 + 제목 + 한 줄 + 오른쪽 액션**
   한 줄로 통일한다. 아이콘·색은 카테고리 목록(단일 소스)에서 가져오므로 카드에서
   본 색이 페이지에서 이어진다.

   ── [974] 세 칸의 규칙 (소유자 지적: "카테고리마다 보이는 게 다르다") ──────────
   모양만 같고 **안에 넣는 말이 제각각**이면 통일이 아니다. 9칸을 나란히 놓고 보니
   부제가 두 문체로 갈려 있었다 — 다섯은 "청약홈 공공데이터 — 경쟁률·특별공급"
   같은 명사형 요약, 넷은 "…답을 받아요", "…찾아보세요" 같은 권유였다. 그래서:

   · title — **카테고리 줄·브레드크럼의 라벨과 같은 말.** 다르면 방문자는 "입주
     물량"을 눌렀는데 "아파트 입주 예정 물량" 페이지에 도착한다(실제로 그랬다).
     자세한 설명은 title 이 아니라 sub 가 맡는다.
   · sub — **명사형 한 줄: "무엇을 보는 곳인가 — 출처 또는 구성".**
     em 대시(—) 앞은 대상, 뒤는 근거·구성. 권유("…해 보세요")는 여기 쓰지 않는다 —
     그건 본문 CTA 와 빈 상태가 할 말이고, 아홉 칸이 나란히 권유하면 아무 말도 안 된다.
   · action — **이 카테고리에서 할 일 하나.**(전문가로 참여 · 모임 만들기)
     옆 카테고리로 보내는 링크는 넣지 않는다. 그 이동은 바로 위 카테고리 줄이
     이미 하고 있고, 같은 자리에서 두 종류를 말하면 자리의 뜻이 흐려진다. */
export function TownPageHead({
  href,
  title,
  sub,
  action,
  className = "",
}: {
  /** 카테고리 목록의 href — 아이콘·색·제목·한 줄을 여기서 찾는다 */
  href: string;
  /** 생략하면 카테고리 라벨. [974] 생략을 권장한다 — 라벨과 어긋날 자리가 없어진다. */
  title?: string;
  /** 생략하면 카테고리의 headSub. 이것도 생략을 권장한다(같은 이유). */
  sub?: string;
  action?: ReactNode;
  className?: string;
}) {
  const link = TOWN_CATEGORY_LINKS.find((l) => l.href === href);
  /* [974] 제목·한 줄의 단일 출처는 lib/town/category-links.ts 다. 여기 prop 은
     그 목록에 없는 페이지(하위 상세 등)를 위한 예외 통로로만 남긴다. */
  const heading = title ?? link?.label ?? "";
  const subline = sub ?? link?.headSub;
  return (
    <div className={`rise-in mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {link && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${link.tone}`}
            aria-hidden="true"
          >
            <Icon name={link.icon} size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="t-title text-ink">{heading}</h1>
          {subline && <p className="mt-0.5 t-sub text-text-2">{subline}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
