import Link from "next/link";
import type { ReactNode } from "react";
import type { Verdict, VerdictDisplay, VerdictTile } from "@/lib/ai/verdict";
import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import { metricDisplay, tileCaption, tileDisplay, verdictSources } from "./verdict-display";

/* ============================================================
   [993] 판단 카드 → [1008 · W] **결과 요약** — AI 분석의 결과값을 한 형식으로.

   위 → 아래: 상태 알약(좋음·보통·주의·자료 부족) + "공공데이터 자동 계산 · 기준 월" → 쉬운 한 줄 결론
   → 대표 수치(크게) → 핵심 숫자 타일 4칸(큰 숫자 + 한 줄 출처, 모르면 "—" · 자료 없음)
   → (bare 가 아니면) 데이터 출처 · 결과가 달라지는 경우(접힘).
   숫자는 전부 서버(lib/ai/verdict.ts)가 실데이터에서 조립한 것이고 여기서는 그리기만 한다.

   [1008] "use client" 를 뺐다 — 훅·이벤트가 없는 표시 부품이라 서버 화면(단지 허브의 요약 카드 ·
   공유 결과 페이지)에서는 서버에서 그려져 브라우저 JS 가 0 이고(단지 허브 번들 479/480KB 에서 이 부품과
   insight-blocks 가 빠진다), 워크벤치에서는 결과 청크(ResultView, next/dynamic)가 가져간다.
   옛 스냅샷(공유 페이지)은 bandLabel 이 "갈림·판단 보류" 로 저장돼 있어 구간(band)으로 다시 읽는다.

   [1009 · A] 토스식 "결론 → 근거 → 출처" 한 방향으로 다시 세웠다(1008 픽스처 실측 — 390px 에서 알약 줄이
   3줄로 접혔고, 타일 설명이 "설명 · 기준 달 · 출처" 로 칸마다 3줄이었다).
    ① 알약 + 이유 → ② 결론 한 줄(서버 headline — 실제 값에서 만든 문장) → ③ 대표 수치(가격이면 <Won>,
    수익률이면 <Delta>) → ④ 칸 4개(가격 <Won> · 등락 <Delta> + 비교 기준) → ⑤ 출처·기준 한 줄.
    ⓘ 설명 버튼은 **부르는 쪽이 넣는다**(metricAside · tileAside) — 이 파일은 단지 허브(/complex/[id], 예산
    472/480KB)에서 서버로 그려지므로 클라이언트 부품(Explain)을 직접 import 하지 않는다. <Won>·<Delta> 는
    훅 없는 표시 부품이라 서버 화면에서는 JS 0 이다.
   ============================================================ */

const BAND_TEXT: Record<string, string> = { strong: "좋음", mixed: "보통", weak: "주의", thin: "자료 부족" };
const CONF_TEXT: Record<string, string> = { thin: "거래 적음 · 참고용", insufficient: "자료 부족", stale: "오래된 자료" };

export function ymLabel(asOf: string | null | undefined): string | null {
  if (!asOf) return null;
  if (/^\d{6}$/.test(asOf)) return `${asOf.slice(0, 4)}.${asOf.slice(4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) return asOf.slice(0, 10).replace(/-/g, ".");
  return asOf;
}

/** "6.5억" → ["6.5", "억"] · "+18.3%" → ["+18.3", "%"] · "협상 유리" → ["협상 유리", ""] */
function splitValue(v: string): [string, string] {
  const m = /^([+\-−]?[\d.,]+)\s*([^\d\s].*)?$/.exec(v.trim());
  return m ? [m[1], m[2] ?? ""] : [v, ""];
}

/** 옛 스냅샷(tiles 없음) — 값 있는 숫자만 타일로 옮긴다 */
function tilesOf(v: Verdict): VerdictTile[] {
  if (v.tiles && v.tiles.length) return v.tiles;
  return v.numbers.map((n) => ({ key: n.key, label: n.label, value: n.value, note: null, asOf: n.asOf, source: n.source, confidence: n.confidence }));
}

/** 표시 방법대로 값 하나 — 가격은 <Won>, 등락은 <Delta>(▲ 빨강·▼ 파랑·보합), 그 밖은 숫자·단위 나눠 */
function ShownValue({
  value,
  display,
  size,
  unit = "만원",
}: {
  value: string;
  display: VerdictDisplay | null;
  size: "t-title" | "t-display";
  unit?: "만원" | "만";
}) {
  if (display?.kind === "won") return <Won manwon={display.manwon} unit={unit} className={`${size} text-ink`} />;
  if (display?.kind === "delta") {
    return <Delta pct={display.pct} digits={display.digits} srContext={display.base} className={`${size} font-extrabold`} />;
  }
  const [num, u] = splitValue(value);
  return (
    <span className="flex items-baseline gap-0.5 break-words">
      <b className={`${size} font-extrabold tabular-nums text-ink`}>{num}</b>
      {u && <span className={`${size === "t-display" ? "t-body" : "t-sub"} font-bold text-text-2`}>{u}</span>}
    </span>
  );
}

export function VerdictTiles({
  tiles,
  tileAside,
}: {
  tiles: readonly VerdictTile[];
  /** [1009 · A] 칸 이름 옆 ⓘ — 부르는 쪽이 만든다(워크벤치·공유 페이지) */
  tileAside?: (t: VerdictTile) => ReactNode;
}) {
  if (tiles.length === 0) return null;
  return (
    <ul className={`grid grid-cols-2 gap-2 ${tiles.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`} aria-label="핵심 숫자">
      {tiles.map((t) => {
        const when = ymLabel(t.asOf);
        const display = tileDisplay(t);
        const aside = tileAside?.(t);
        return (
          <li key={t.key} className="flex min-w-0 flex-col rounded-[12px] bg-bg px-3 py-2.5">
            <span className="flex items-center gap-0.5 t-caption font-extrabold text-text-3">
              <span className="min-w-0 break-words">{t.label}</span>
              {aside}
            </span>
            <span className="mt-0.5 min-w-0">
              {t.value ? (
                <ShownValue value={t.value} display={display} size="t-title" unit="만" />
              ) : (
                <b className="t-title font-extrabold text-text-3">—</b>
              )}
            </span>
            {/* 등락 칸은 비교 기준을 값 바로 아래에 — "기준 없는 %" 를 두지 않는다 */}
            {display?.kind === "delta" && <span className="t-caption font-bold text-text-2">{display.base}</span>}
            <span className="mt-0.5 t-caption leading-snug text-text-3 break-words">{tileCaption(t, when)}</span>
            {t.value && t.confidence !== "ok" && CONF_TEXT[t.confidence] && (
              <span className="mt-1 self-start rounded bg-warning-soft px-1.5 py-px t-caption font-extrabold text-warning">
                {CONF_TEXT[t.confidence]}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function VerdictCard({
  verdict,
  toneLine,
  compact = false,
  extraChips,
  bare = false,
  metricAside,
  tileAside,
}: {
  verdict: Verdict;
  /** 도구 말투 한 줄(persona.tone[band]) — 결론 아래 보조 문장 */
  toneLine?: string | null;
  /** 요약만(알약·결론·대표 수치) */
  compact?: boolean;
  /** [996] 근거 줄 끝에 붙는 칩(내 임장노트) — 개인 데이터라 카드 밖에서 따로 받아 넘긴다 */
  extraChips?: ReactNode;
  /** [1008] 데이터 출처·달라지는 경우를 카드 밖(워크벤치 "자세히 보기")에서 그릴 때 */
  bare?: boolean;
  /** [1009 · A] 대표 수치 이름 옆 ⓘ */
  metricAside?: ReactNode;
  /** [1009 · A] 칸 이름 옆 ⓘ */
  tileAside?: (t: VerdictTile) => ReactNode;
}) {
  const m = verdict.metric;
  const asOf = ymLabel(m?.asOf ?? verdict.tiles?.find((t) => t.asOf)?.asOf ?? null);
  const tiles = tilesOf(verdict);
  const md = metricDisplay(m);
  const sources = verdictSources(verdict);
  return (
    <section className="verdict flex flex-col gap-3" data-band={verdict.band} aria-label="결과 요약">
      {/* ① 알약 + 이유 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="verdict-band inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 t-sub font-extrabold" data-band={verdict.band}>
          <span aria-hidden="true">●</span>
          {BAND_TEXT[verdict.band] ?? verdict.bandLabel}
        </span>
        {verdict.bandReason && <span className="min-w-0 t-sub font-bold text-text-2 break-words">{verdict.bandReason}</span>}
      </div>
      {/* ② 결론 한 줄 — 숫자보다 문장이 먼저(토스 관례) */}
      <p className="t-section font-extrabold text-ink break-words" style={{ textWrap: "balance" }}>
        {verdict.headline}
      </p>
      {toneLine && !compact && <p className="t-sub text-text-2">{toneLine}</p>}

      {/* ③ 대표 수치 */}
      {m && (
        <div className="verdict-metric flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[12px] px-3.5 py-3">
          <span className="flex items-center gap-0.5 t-sub font-extrabold text-text-2">
            {m.label}
            {metricAside}
          </span>
          <ShownValue value={`${m.value}${m.unit ?? ""}`} display={md} size="t-display" />
          {(md?.kind === "delta" || m.note) && (
            <span className="w-full t-caption text-text-3 break-words">
              {/* 비교 기준은 설명에 이미 있으면 되풀이하지 않는다("넣은 돈 대비 · … · 넣은 돈 대비" 이중 표기) */}
              {[md?.kind === "delta" && !(m.note ?? "").includes(md.base) ? md.base : null, m.note].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* ④ 핵심 숫자 칸 */}
      {!compact && <VerdictTiles tiles={tiles} tileAside={tileAside} />}

      {/* ⑤ 출처·기준 한 줄 — 칸마다 되풀이하던 출처를 여기 모은다 */}
      {!compact && (
        <p className="t-caption text-text-3 break-words">
          {sources ? `출처 ${sources} · ` : ""}공공데이터 자동 계산{asOf ? ` · 기준 ${asOf}` : ""}
        </p>
      )}

      {!compact && !bare && (verdict.evidence.length > 0 || extraChips) && (
        <details className="rounded-[10px] bg-bg px-3.5 py-2.5">
          <summary className="cursor-pointer t-sub font-extrabold text-text-2">데이터 출처 {verdict.evidence.length}곳</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {verdict.evidence.map((e) => (
              <li key={e.label} className="flex flex-wrap items-baseline gap-x-2 t-sub text-text-2">
                <b className="font-extrabold text-text-1">{e.label}</b>
                <span>{e.source}</span>
                {ymLabel(e.asOf) && <span className="text-text-3">{ymLabel(e.asOf)}</span>}
                {e.confidence !== "ok" && CONF_TEXT[e.confidence] && (
                  <span className="t-caption font-extrabold text-warning">{CONF_TEXT[e.confidence]}</span>
                )}
                {e.href && (
                  <Link href={e.href} className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
                    원본 ›
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {extraChips && <div className="mt-2 flex flex-wrap gap-1.5">{extraChips}</div>}
        </details>
      )}

      {!compact && !bare && verdict.counters.length > 0 && (
        <details className="rounded-[10px] bg-bg px-3.5 py-2.5">
          <summary className="cursor-pointer t-sub font-extrabold text-text-2">
            결과가 달라지는 경우 {verdict.counters.length}가지
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {verdict.counters.map((c, i) => (
              <li key={i} className="t-sub text-text-2">· {c}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
