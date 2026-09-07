import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";

export interface HeroKpi {
  /** 큰 숫자 */
  value: ReactNode;
  /** 이 숫자가 무엇인지 */
  label: string;
  /** 기준·출처 한 줄 (없으면 생략) */
  note?: string;
  /** 전기 대비 — 값이 있을 때만 배지가 붙는다 */
  delta?: { pct: number; label?: string } | null;
}

function DeltaBadge({ pct, label }: { pct: number; label?: string }) {
  const tone = pct > 0 ? "delta-up-b" : pct < 0 ? "delta-down-b" : "delta-flat-b";
  const sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "–";
  return (
    <span className={`delta ${tone}`}>
      {sign} {Math.abs(pct).toLocaleString("ko-KR")}%{label ? ` ${label}` : ""}
    </span>
  );
}

/* 분석 도구 페이지 공통 히어로.
 *
 * ── [974] 글자가 안 보이던 문제 ────────────────────────────────────────────
 * 이 히어로의 배경은 `.hub-hero` = **네이비**(rgb 11,37,69)인데, 안의 글자는
 * 라이트 테마 토큰(text-ink · text-text-2 · text-text-3)을 쓰고 있었다.
 * 실측: 제목 rgb(25,31,40) → 대비 **1.1:1**. 안 보이는 게 아니라 배경과 같은
 * 색이었다(소유자 캡처: /analysis/price 의 "면적대별 실거래 시세").
 * KPI 칸만 멀쩡했던 이유는 그 칸에 흰 배경이 따로 깔려 있어서다.
 *
 * 네이비 위 글자는 on-dark 토큰만 쓴다(970 의 text-surface → text-on-dark 정리와
 * 같은 규칙). 색 토큰 대비 검사(scripts/check-contrast-tokens.mjs)는 토큰 쌍을
 * 보기 때문에 "라이트 토큰을 어두운 면 위에 얹은" 이 조합은 잡지 못한다 —
 * 그래서 여기 주석으로 못 박는다: `.hub-hero` 안에서는 ink/text-2/text-3 금지.
 *
 * 왜: 기능 페이지들이 "제목 한 줄 → 바로 표"로 시작했다. 도구가 무슨 숫자를
 * 내는지가 첫 화면에 없어서, 들어온 사람이 뭘 읽어야 하는지 모른 채 스크롤하다
 * 나갔다(체류 1~3초 실측). 첫 화면을 **핵심 숫자 + 그림 + 다음 행동**으로 바꾼다.
 *
 * 사실 우선: KPI 는 값이 있는 것만 넘긴다. 없는 칸을 "—"로 채우지 않는다.
 */
export function ToolHero({
  eyebrow,
  icon,
  title,
  lead,
  kpis,
  chart,
  actions,
  source,
  toneClass = "text-primary",
}: {
  eyebrow?: string;
  /** 선형 아이콘 이름 (Icon.tsx) */
  icon?: string;
  title: string;
  lead?: ReactNode;
  kpis?: readonly HeroKpi[];
  /** 오른쪽(모바일에선 아래) 그림 — 차트 컴포넌트를 그대로 넣는다 */
  chart?: ReactNode;
  actions?: ReactNode;
  /** 기준·출처 — 숫자를 냈으면 반드시 적는다 */
  source?: ReactNode;
  /** 계열 색 (차트의 currentColor 가 이걸 탄다) */
  toneClass?: string;
}) {
  return (
    <section className="hub-hero card-pad-lg flex flex-col gap-4" data-reveal="">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && (
            <span className="t-caption font-bold uppercase tracking-wider text-brand-red-dark">
              {eyebrow}
            </span>
          )}
          <div className="flex items-center gap-2.5">
            {icon && (
              <span
                className={`tile-ico flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft ${toneClass}`}
              >
                <Icon name={icon} size={17} />
              </span>
            )}
            <h1 className="t-display text-balance text-on-dark">{title}</h1>
          </div>
          {lead && <p className="t-body max-w-[52ch] text-on-dark-muted">{lead}</p>}
        </div>
        {chart && (
          <div className={`w-full shrink-0 md:w-[320px] ${toneClass}`}>{chart}</div>
        )}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="kpi-row">
          {kpis.map((k) => (
            <div key={k.label} className="kpi">
              <span className="kpi-k">{k.label}</span>
              <span className="kpi-v flex flex-wrap items-baseline gap-1.5">
                {k.value}
                {k.delta && <DeltaBadge pct={k.delta.pct} label={k.delta.label} />}
              </span>
              {k.note && <span className="kpi-d">{k.note}</span>}
            </div>
          ))}
        </div>
      )}

      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
      {source && <p className="t-caption text-on-dark-muted">{source}</p>}
    </section>
  );
}
