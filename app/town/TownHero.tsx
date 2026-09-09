import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { CountUp } from "@/app/components/motion/CountUp";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

/* ============================================================
   [978] 동네이야기 하위 9칸의 공통 머리 — 홈과 같은 네이비 히어로.

   ── 왜 ────────────────────────────────────────────────────────────────
   소유자 지시: "동네이야기에서 각 하부 카테고리를 들어가더라도 (홈 머리가)
   고정되면 좋겠다. 고정은 되되, 각 하부 카테고리 주제에 맞게 내용이나 기능,
   약간의 부연설명 정도가 변경되는 수준으로."

   974 에서 9칸의 **작은 머리**(아이콘 칩 + 제목 + 한 줄)는 통일했다. 그런데
   홈(/town)에 들어갔다가 카테고리로 한 발 들어가면 화면의 격이 갑자기 낮아진다 —
   홈은 네이비 히어로인데 하위는 흰 바탕 한 줄이라, 같은 동네이야기 안에 있다는
   느낌이 끊긴다. 그래서 히어로를 하위에도 세우고, **안에 넣는 말만** 카테고리를
   따라 바뀌게 한다.

   고정하는 범위는 소유자가 골랐다 — **히어로 + 카테고리 9칸 격자까지**.
   지역 칩과 "오늘의 동네 글감"은 홈에만 둔다. 그 둘은 "동네 고르기"와 "글 쓸
   거리"라 카테고리 본문과 성격이 다르고, 넣으면 본문이 한 화면 아래로 밀린다.

   ── 무엇이 바뀌는가 (네 가지) ─────────────────────────────────────────
   ① 제목·설명 — heroTitle(3토막, 강조 한 단어) · headSub. 둘 다 단일 소스
      (lib/town/category-links.ts). 974 에서 본문과 스켈레톤이 어긋났던 이유가
      같은 문장을 두 곳에 적어서였다.
   ② 통계줄 — 페이지가 **자기 화면의 실측**을 넘긴다(stats). 홈의 "오늘 새 글 ·
      이번 주 · 이 피드 N건" 자리를 카테고리의 숫자가 대신한다.
   ③ 오른쪽 버튼 — heroCta. 없으면 안 그린다.
   ④ 아이콘·색 — 카테고리 아이콘 + heroTone.

   ── 숫자에 대한 규칙 (홈에서 그대로 가져온다) ─────────────────────────
   · 0 은 그리지 않는다. "오늘 새 글 0" 은 살아 있다는 신호가 아니라 비었다는
     고백이다(970 · C-30). value <= 0 인 칸은 통째로 빠진다.
   · 무엇을 센 건지 note 로 적는다. 숫자를 정확히 부르지 못할 바엔 모수를 밝힌다.
   · **여기서 새로 세지 않는다.** 페이지가 이미 들고 있는 값만 받는다 —
     976 에서 DB 왕복을 줄여 놓고 머리를 붙이면서 9개 화면에 조회를 새로 얹으면
     그건 되돌리는 짓이다. 마땅한 숫자가 없는 카테고리는 통계줄이 없다.

   ── 색이 왜 토큰인가 ──────────────────────────────────────────────────
   9칸 카드가 쓰는 tone(bg-primary-soft 등)은 테마를 탄다 — 다크에서 그 값들은
   네이비와 거의 같은 색이 되어 칩이 사라진다. 네이비 카드는 테마와 무관한
   고정면이므로 그 위의 색도 고정이어야 한다(globals.css --on-navy-*).
   ============================================================ */

export type TownHeroStat = {
  /** 무엇을 센 건지 — "이번 주 접수" 처럼 모수가 드러나게 */
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
  note,
  action,
}: {
  /** 카테고리 목록의 href — 제목·한 줄·아이콘·색·버튼을 여기서 찾는다 */
  href: string;
  /** 이 화면의 실측 숫자. 0 이하인 칸은 자동으로 빠진다. */
  stats?: readonly TownHeroStat[];
  /** 통계줄 끝에 붙는 모수 설명 — 숫자가 있을 때만 그린다 */
  note?: string;
  /** heroCta 대신 그릴 조각(클라이언트 버튼 등). 주면 heroCta 는 안 그린다. */
  action?: ReactNode;
}) {
  const link = TOWN_CATEGORY_LINKS.find((l) => l.href === href);
  if (!link) return null;
  const [before, accent, after] = link.heroTitle;
  const shown = stats.filter((s) => Number.isFinite(s.value) && s.value > 0);

  return (
    <section className="brand-navy-card rise-in mb-4 rounded-[18px] px-5 py-5 md:px-6">
      <BrandWatermark />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 max-w-[600px] items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-on-dark-panel ${link.heroTone}`}
            aria-hidden="true"
          >
            <Icon name={link.icon} size={22} />
          </span>
          <div className="min-w-0">
            <span className="t-caption font-extrabold tracking-wider text-on-dark-muted">
              동네이야기 · {link.label}
            </span>
            <h1 className="mt-1 t-display text-balance text-on-dark">
              {before}
              <span className="text-brand-red-dark">{accent}</span>
              {after}
            </h1>
            <p className="mt-1.5 t-body text-on-dark-muted">{link.headSub}</p>
          </div>
        </div>
        {action ? (
          <div className="flex gap-2">{action}</div>
        ) : link.heroCta.length > 0 ? (
          <div className="flex gap-2">
            {link.heroCta.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={
                  c.primary
                    ? "btn-primary btn-cta rounded-xl px-4 py-2.5 t-body no-underline"
                    : "brand-photo-chip rounded-xl px-4 py-2.5 t-body font-bold no-underline"
                }
              >
                {c.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {shown.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-on-dark-faint pt-3">
          {shown.map((s) =>
            s.href ? (
              <Link
                key={s.label}
                href={s.href}
                className="t-sub text-on-dark-muted no-underline"
              >
                {s.label}{" "}
                <b className="t-num text-on-dark">
                  <CountUp value={s.value} />
                  {s.unit ?? ""}
                </b>
              </Link>
            ) : (
              <span key={s.label} className="t-sub text-on-dark-muted">
                {s.label}{" "}
                <b className="t-num text-on-dark">
                  <CountUp value={s.value} />
                  {s.unit ?? ""}
                </b>
              </span>
            ),
          )}
          {note && <span className="t-caption text-on-dark-muted">{note}</span>}
        </div>
      )}
    </section>
  );
}
