"use client";
/* [1025 · 결정·비서] 결정 카드 /decide — 시안 mock1025/decide-{m,d}.
   후보(비교함 + 관심 단지, 최대 3) → 기준 슬라이더 4개 → "지금 기준 1순위"(숫자만) → 결정 저장 → 지난 결정.
   점수는 lib/decide/score(순수). 후보 값은 /api/complex/[id]/detail(있는 칸만), 학교는 /api/decide/school.

   [1025b · 결정·비서] 다듬기 — "다음 한 걸음만 보인다".
   · 후보 0곳: 카드 하나(사실 한 줄 + 단지 검색 + 비교함·관심 단지 칩). 슬라이더·1순위·결정·레일은 그리지 않는다.
   · 후보 1곳: 후보 카드 1 + "한 곳 더 담으면 비교" + 검색.
   · 후보 ≥2(값 도착 뒤): 후보 행 → 내 기준 → 1순위 → 결정 → 지난 결정(있을 때만).
   · 채움 파랑은 "결정 저장" 하나 — 요소(saveButton) 하나를 데스크톱 레일(lg+)과 폰 하단 바(MobilePrimaryBar)가 나눠 그린다.
   · 세그먼트(살까·보류·패스·다시 보기)는 chip/chip-active. 섹션 점은 파랑 하나(.nz-dot-blue). 머리 아래 상태 줄 없음.

   [1025c · 결정·비서] 대표 그림 + 결론 한 줄 + 손잡이(시안 mock1025c/decide-{m,d}).
   · 그림: 후보 ≤3 겹친 레이더(축 = 쓸 수 있는 기준 · 학교 없으면 3축) + 기준별 순위 막대(DecideViz · 기하 lib/decide/radar-geometry·rank-bars).
   · 결론: 1순위 카드에 원형 게이지(0~100 = score.ts 가중 정규화 점수 그대로 · 반올림) + "{단지} · {점수}점" + "가격 1위 · 전세가율 1위 …".
   · 손잡이: 슬라이더(있음) — 움직이면 레이더·막대·게이지·1순위가 같은 result 로 바로 바뀐다.
   · 결정 칩은 아이콘 칩(check · clock · x · repeat) · 지난 결정은 세로 타임라인(날짜 점 · 단지 · 결정 배지) · 빈 상태는 회색 견본. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PageHead } from "@/app/components/PageHead";
import { StepLine } from "@/app/components/StepLine";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  addToCompareTray,
  fetchServerCompareList,
  listCompareTray,
  subscribeCompareTray,
} from "@/lib/newui/compare-tray";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { formatEokMan } from "@/lib/format/eok-man";
import { formatKstDate } from "@/lib/format/kst";
import { AI_DISCLAIMER } from "@/lib/ai/disclaimer";
import {
  DECIDE_AXES,
  DECIDE_MAX_CANDIDATES,
  DECIDE_VERDICTS,
  GUEST_DECISIONS_KEY,
  GUEST_DECISIONS_MAX,
  MEMO_MAX,
  VERDICT_LABEL,
  WEIGHT_MAX,
  WEIGHT_MIN,
  axisLabel,
  dropReasonText,
  parseDecideWeights,
  parseDecisionList,
  parseDecisionRecord,
  scoreCandidates,
  topCandidates,
  usedWeightsLine,
  type DecideAxis,
  type DecideVerdict,
  type DecideWeights,
  type DecisionRecord,
} from "@/lib/decide/score";
import {
  candidateFromDetail,
  candidateMetaLine,
  failedCandidate,
  latestBasisYm,
  ymDash,
  type DecideCandidate,
} from "@/lib/decide/candidate";
import { decideRadar, scoreOutOf100 } from "@/lib/decide/radar-geometry";
import { axisRankOf, rankBarGroups, type RankBarGroup } from "@/lib/decide/rank-bars";
import { DecideRadarSvg, DecideRankBars, RadarGhost, ScoreRing, TimelineItem, seriesTone } from "./DecideViz";

const WEIGHTS_KEY = "nz:decide-weights:v1";
const SELECTED_KEY = "nz:decide-selected:v1";
/** 지난 결정 — 처음 보이는 건수(그 뒤는 "더 보기") */
const PAST_PREVIEW = 3;

type PoolItem = { id: string; name: string; region?: string; from: "tray" | "watch" };

const NA = "—";

function fmtKrw(krw: number | null): string {
  return krw === null || !Number.isFinite(krw) || krw <= 0 ? NA : formatEokMan(krw / 10_000);
}

/** 기준 값 표기 — 가격은 억·만, 전세가율 %, 거래 건, 학교 m. 없으면 — */
function fmtAxis(key: DecideAxis, v: number | null): string {
  if (v === null) return NA;
  switch (key) {
    case "price":
      return fmtKrw(v);
    case "jeonse":
      return `${v.toFixed(1)}%`;
    case "volume":
      return `${v.toLocaleString("ko-KR")}건`;
    case "school":
      return `${v.toLocaleString("ko-KR")}m`;
  }
}

/** [1025c] 결정 칩 아이콘 — 살까 check · 보류 clock · 패스 x · 다시 보기 repeat(ICON_PATHS 에 있는 이름) */
const VERDICT_ICON: Record<DecideVerdict, string> = { buy: "check", hold: "clock", pass: "x", revisit: "repeat" };

function readJson<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(window.localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 사생활 보호 모드 등 — 이번 화면에서만 유지 */
  }
}

/** 칩 — 세그먼트·후보 고르기 공용(흰 바탕 · 고르면 chip-active). 네이비 채움은 쓰지 않는다 */
const CHIP = "chip press inline-flex min-h-10 items-center gap-1 border px-3 t-sub";
const CHIP_OFF = "border-line bg-surface text-text-2";

/* ── 후보 카드 ─────────────────────────────────────────────────────────── */

function Kv({ k, v, sub }: { k: string; v: string; sub?: string | null }) {
  const na = v === NA;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="t-sub text-text-3">{k}</dt>
      <dd className={`m-0 text-right t-body t-num ${na ? "font-medium text-text-3" : "font-bold text-ink"}`}>
        {v}
        {sub && <span className="block t-caption font-medium text-text-3">{sub}</span>}
      </dd>
    </div>
  );
}

/** 4줄 고정 — 이름·지역·세대 / 최근 거래가(월·면적대) / 전세가율 / 12개월 거래. 없는 값은 "—" */
function CandidateCard({
  c,
  rank,
  loading,
  onRemove,
}: {
  c: DecideCandidate;
  rank: number | null;
  loading: boolean;
  onRemove: () => void;
}) {
  const meta = candidateMetaLine(c);
  return (
    <section className="card w-[280px] shrink-0 snap-start p-[var(--pad-card)] md:w-auto" aria-label={c.name}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {rank !== null && (
            <span
              className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg t-caption font-bold ${
                rank === 1 ? "bg-primary-soft text-primary" : "bg-bg text-text-2"
              }`}
              aria-label={`${rank}위`}
            >
              {rank}
            </span>
          )}
          <div className="min-w-0">
            <Link href={complexHrefFromId(c.id)} className="block truncate t-body font-bold text-ink no-underline">
              {c.name}
            </Link>
            <div className="t-caption text-text-3">{meta ?? NA}</div>
          </div>
        </div>
        {/* 삭제 × — 글리프 24px, 손가락 히트는 40px(음수 여백으로 카드 안쪽에 맞춘다) */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${c.name} 후보에서 빼기`}
          className="press -mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-3"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      {loading ? (
        <p className="mt-2 t-sub text-text-3">불러오는 중</p>
      ) : c.status === "failed" ? (
        <p className="mt-2 t-sub text-text-3">실거래 불러오기 실패 · 잠시 후 다시</p>
      ) : c.status === "not_found" ? (
        <p className="mt-2 t-sub text-text-3">실거래 자료 없음</p>
      ) : (
        <dl className="mt-2 flex flex-col divide-y" data-tone="plain">
          <Kv
            k="최근 거래가"
            v={c.latest ? fmtKrw(c.latest.krw) : NA}
            sub={c.latest ? `${ymDash(c.latest.ym)} · ${c.latest.band}` : null}
          />
          <Kv k="전세가율" v={c.jeonsePct !== null ? `${c.jeonsePct.toFixed(1)}%` : NA} />
          <Kv k="12개월 거래" v={c.count12m !== null ? `${c.count12m.toLocaleString("ko-KR")}건` : NA} />
        </dl>
      )}
    </section>
  );
}

/* ── 1순위 카드(원형 게이지 + 결론 한 줄) ─────────────────────────────── */

function RankCard({
  scorable,
  result,
  groups,
  weights,
  schoolPending,
  basisYm,
}: {
  scorable: DecideCandidate[];
  result: ReturnType<typeof scoreCandidates>;
  groups: readonly RankBarGroup[];
  weights: DecideWeights;
  schoolPending: boolean;
  basisYm: string | null;
}) {
  const tops = topCandidates(result);
  const top = tops[0] ?? null;
  const topC = top ? scorable.find((c) => c.id === top.id) ?? null : null;
  const score100 = top ? scoreOutOf100(top.score) : null;

  /* 근거 3줄 — 숫자만. 1순위의 값 + 나머지 후보와의 위치("3곳 중 최저" · "나머지 2곳 —") */
  const lines = useMemo(() => {
    if (!top || !topC) return [];
    const out: { k: string; v: string }[] = [];
    const others = scorable.filter((c) => c.id !== top.id);
    const valueOf = (c: DecideCandidate, key: DecideAxis): number | null =>
      key === "price" ? c.priceKrw : key === "jeonse" ? c.jeonsePct : key === "volume" ? c.count12m : c.schoolM;
    for (const key of result.used) {
      const def = DECIDE_AXES.find((a) => a.key === key)!;
      const mine = fmtAxis(key, valueOf(topC, key));
      const missing = others.filter((o) => valueOf(o, key) === null).length;
      const have = scorable.filter((c) => valueOf(c, key) !== null);
      /* 이 기준에서 1순위의 자리 — 값이 있는 후보들 사이 순서(같은 값은 같은 자리) */
      const myV = valueOf(topC, key);
      const ahead = myV === null ? 0 : have.filter((c) => (def.better === "low" ? (valueOf(c, key) as number) < myV : (valueOf(c, key) as number) > myV)).length;
      const tail =
        myV === null
          ? "값 없음"
          : missing === others.length && others.length > 0
            ? `나머지 ${missing}곳 —`
            : ahead === 0
              ? `${have.length}곳 중 ${def.better === "low" ? "최저" : "최고"}${missing > 0 ? ` · ${missing}곳 —` : ""}`
              : `${have.length}곳 중 ${ahead + 1}위${missing > 0 ? ` · ${missing}곳 —` : ""}`;
      out.push({ k: axisLabel(key), v: `${mine} · ${tail}` });
    }
    return out.slice(0, 3);
  }, [top, topC, scorable, result.used]);

  const excluded = result.dropped.map((d) => `${axisLabel(d.key)}(${d.reason === "unavailable" && schoolPending ? "조회 중" : dropReasonText(d.reason)})`);
  /* 결론 둘째 줄 — 기준마다 1순위의 자리("가격 1위 · 전세가율 1위 · 거래량 1위"). 값 없는 기준은 "—" */
  const rankLine = top ? axisRankOf(groups, top.id).map((r) => `${r.label} ${r.rank === null ? NA : `${r.rank}위`}`).join(" · ") : "";
  /* 셋째 줄 — 나머지 후보의 점수 */
  const others = result.ranked.filter((s) => s.score !== null && s.rank !== 1);
  const otherLine = others.map((s) => `${s.rank}위 ${s.name} ${scoreOutOf100(s.score)}점`).join(" · ");
  const noScore = result.ranked.filter((s) => s.score === null).map((s) => s.name);

  return (
    <section className="card p-[var(--pad-card)]" aria-label="지금 기준 1순위">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-section text-ink">지금 기준 1순위</h2>
        {result.used.length > 0 && <span className="t-caption text-text-3">{usedWeightsLine(result, weights)}</span>}
      </div>
      {scorable.length < 2 ? (
        <p className="mt-2 t-sub text-text-3">값이 있는 후보 {scorable.length}곳 · 2곳부터 순위</p>
      ) : !top || !topC || score100 === null ? (
        <p className="mt-2 t-sub text-text-3">쓸 수 있는 기준 없음 · {excluded.join(" · ") || "값이 없음"}</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <ScoreRing score={score100} label={`${tops.length > 1 ? "공동 1위" : topC.name} ${score100}점 · 100점 만점`} />
            <div className="min-w-0 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg bg-primary-soft t-caption font-bold text-primary">
                  1
                </span>
                <span className="t-title text-ink">
                  {tops.length > 1 ? tops.map((t) => t.name).join(" · ") : topC.name} · {score100}점
                </span>
              </div>
              {tops.length > 1 ? (
                <p className="t-sub text-text-2">공동 1위 · {rankLine}</p>
              ) : (
                <p className="t-sub text-text-2">{rankLine}</p>
              )}
              {(otherLine || noScore.length > 0) && (
                <p className="t-caption text-text-3">
                  {otherLine}
                  {noScore.length > 0 ? `${otherLine ? " · " : ""}${noScore.join(" · ")} 점수 없음` : ""}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-2 flex flex-col divide-y" data-tone="plain">
            {lines.map((l) => (
              <Kv key={l.k} k={l.k} v={l.v} />
            ))}
          </dl>
          <p className="mt-2 t-caption text-text-3">
            {excluded.length > 0 ? `${excluded.join(" · ")} · 점수에서 제외` : "기준 4개 모두 반영"}
            {basisYm ? ` · 실거래 ${ymDash(basisYm)} 기준` : ""}
          </p>
        </>
      )}
    </section>
  );
}

/* ── 대표 그림 카드(겹친 레이더 + 기준별 순위 막대) ─────────────────────── */

function VizCard({
  scorable,
  result,
  groups,
  schoolOff,
  schoolPending,
}: {
  scorable: DecideCandidate[];
  result: ReturnType<typeof scoreCandidates>;
  groups: readonly RankBarGroup[];
  schoolOff: boolean;
  schoolPending: boolean;
}) {
  const radar = useMemo(() => decideRadar(scorable, result), [scorable, result]);
  const axesN = radar ? radar.axes.length : groups.length;
  const notScored = radar ? radar.axes.filter((a) => !a.scored) : [];
  const reasonOf = (key: DecideAxis) => {
    const d = result.dropped.find((x) => x.key === key);
    return d ? dropReasonText(d.reason) : "";
  };
  const legend = result.ranked
    .map((s) => ({ s, i: scorable.findIndex((c) => c.id === s.id) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const aria = radar
    ? `후보 ${scorable.length}곳 레이더 — ${radar.series
        .map((s) => `${s.name} ${s.values.map((v, k) => `${radar.axes[k].label} ${v === null ? "값 없음" : Math.round(v * 100)}`).join(" ")}`)
        .join(", ")}`
    : "";
  return (
    <section className="card p-[var(--pad-card)]" aria-labelledby="decide-viz-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="decide-viz-title" className="t-section text-ink">
          후보 {scorable.length}곳 비교
        </h2>
        <span className="t-caption text-text-3">
          {axesN}축{schoolOff ? ` · 학교 ${schoolPending ? "조회 중" : "자료 없음"}` : ""}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
          {radar ? (
            <DecideRadarSvg radar={radar} label={aria} />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <RadarGhost />
              <p className="t-sub text-text-3">축 {axesN}개 · 레이더는 3축부터</p>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {legend.map(({ s, i }) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 t-caption text-text-2">
                <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${seriesTone(i).bg}`} aria-hidden="true" />
                {s.name} {s.score === null ? NA : `${scoreOutOf100(s.score)}점`}
              </span>
            ))}
          </div>
          <p className="mt-1 t-caption text-text-3">
            값 없음(—)은 0 자리에 점
            {notScored.length > 0 ? ` · 점수 제외: ${notScored.map((a) => `${a.label}(${reasonOf(a.key)})`).join(" · ")}` : ""}
          </p>
        </div>
        <div className="min-w-0">
          <div className="t-caption font-bold text-text-3">기준별 순위</div>
          <DecideRankBars groups={groups} format={fmtAxis} />
        </div>
      </div>
    </section>
  );
}

/* ── 결정 카드(아이콘 칩 4 + 메모 · 버튼은 레일에서만) ──────────────────── */

function DecideCard({
  verdict,
  setVerdict,
  memo,
  setMemo,
  chosenName,
  signedIn,
  button,
}: {
  verdict: DecideVerdict;
  setVerdict: (v: DecideVerdict) => void;
  memo: string;
  setMemo: (v: string) => void;
  chosenName: string | null;
  signedIn: boolean;
  /** 데스크톱 레일만 버튼을 안에 그린다. 폰은 하단 바(MobilePrimaryBar)가 같은 요소를 든다 */
  button?: ReactNode;
}) {
  return (
    <section className="card p-[var(--pad-card)]" aria-label="결정">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-section text-ink">결정</h2>
        <span className="t-caption text-text-3">
          {chosenName ? `${chosenName} · ` : ""}
          {formatKstDate(new Date())}
        </span>
      </div>
      <div role="radiogroup" aria-label="결정" className="mt-2 flex flex-wrap gap-1.5">
        {DECIDE_VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={verdict === v}
            onClick={() => setVerdict(v)}
            className={`${CHIP} ${verdict === v ? "chip-active" : CHIP_OFF}`}
          >
            <Icon name={VERDICT_ICON[v]} size={14} />
            {VERDICT_LABEL[v]}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={memo}
        maxLength={MEMO_MAX}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 한 줄"
        aria-label="메모 한 줄"
        className="mt-2 min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 t-body text-ink"
      />
      {button && <div className="mt-2">{button}</div>}
      <p className="mt-2 t-caption text-text-3">{signedIn ? "내 계정에 저장" : "게스트는 이 기기에만 저장"}</p>
    </section>
  );
}

/* ── 본체 ───────────────────────────────────────────────────────────────── */

export function DecideClient({ signedIn, initialWeights }: { signedIn: boolean; initialWeights: DecideWeights }) {
  const { showToast } = useToast();
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, DecideCandidate>>({});
  const [weights, setWeights] = useState<DecideWeights>(initialWeights);
  const [picking, setPicking] = useState(false);
  const [verdict, setVerdict] = useState<DecideVerdict>("buy");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [past, setPast] = useState<DecisionRecord[] | null>(null);
  const [pastFailed, setPastFailed] = useState(false);
  const [pastAll, setPastAll] = useState(false);
  const fetched = useRef(new Set<string>());

  /* 후보 풀 — 비교함(이 기기) + 관심 단지(로그인). 처음 3곳(저장된 선택이 있으면 그것)을 고른다 */
  useEffect(() => {
    let cancelled = false;
    const build = (watch: PoolItem[]) => {
      const tray: PoolItem[] = listCompareTray().map((t) => ({ id: t.id, name: t.name, region: t.region, from: "tray" }));
      const seen = new Set<string>();
      const merged: PoolItem[] = [];
      for (const it of [...tray, ...watch]) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        merged.push(it);
      }
      return merged;
    };
    let watch: PoolItem[] = [];
    const sync = () => {
      const merged = build(watch);
      setPool(merged);
      setSelected((prev) => {
        const kept = prev.filter((id) => merged.some((m) => m.id === id));
        if (kept.length > 0) return kept;
        const stored = readJson(SELECTED_KEY, (raw) => {
          try {
            const arr: unknown = raw ? JSON.parse(raw) : null;
            return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
          } catch {
            return [];
          }
        }).filter((id) => merged.some((m) => m.id === id));
        return (stored.length > 0 ? stored : merged.map((m) => m.id)).slice(0, DECIDE_MAX_CANDIDATES);
      });
    };
    sync();
    const unsub = subscribeCompareTray(sync);
    void (signedIn ? fetchServerCompareList() : Promise.resolve(null)).then((server) => {
      if (cancelled) return;
      watch = (server ?? []).map((s) => ({ id: s.id, name: s.name, from: "watch" as const }));
      sync();
      setPoolReady(true);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [signedIn]);

  useEffect(() => {
    if (poolReady) writeJson(SELECTED_KEY, selected);
  }, [selected, poolReady]);

  /* 가중치 — 이 기기 저장값이 있으면 그것, 없으면 서버 페르소나(props) */
  useEffect(() => {
    const raw = readJson(WEIGHTS_KEY, (r) => r);
    if (raw) setWeights(parseDecideWeights(raw));
  }, []);
  const setWeight = (key: DecideAxis, v: number) => {
    setWeights((prev) => {
      const next = { ...prev, [key]: v };
      writeJson(WEIGHTS_KEY, next);
      return next;
    });
  };

  /* 후보 값 — /api/complex/[id]/detail 한 번 + 좌표가 있으면 /api/decide/school */
  useEffect(() => {
    for (const id of selected) {
      if (fetched.current.has(id)) continue;
      fetched.current.add(id);
      const name = pool.find((p) => p.id === id)?.name ?? id;
      void (async () => {
        let c: DecideCandidate;
        try {
          const res = await fetch(`/api/complex/${encodeURIComponent(id)}/detail`);
          const json: unknown = res.ok ? await res.json().catch(() => null) : null;
          c = json ? candidateFromDetail(id, name, json) : failedCandidate(id, name);
        } catch {
          c = failedCandidate(id, name);
        }
        setDetails((prev) => ({ ...prev, [id]: c }));
        if (c.status !== "ok" || c.lat === null || c.lng === null) {
          setDetails((prev) => ({ ...prev, [id]: { ...prev[id], school: "none" } }));
          return;
        }
        try {
          const res = await fetch(`/api/decide/school?lat=${c.lat}&lng=${c.lng}`);
          const j = (await res.json().catch(() => null)) as
            | { available?: boolean; nearest?: { distanceM?: number } | null }
            | null;
          setDetails((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              school: !res.ok || !j ? "none" : j.available === false ? "unavailable" : j.nearest ? "ok" : "none",
              schoolM: res.ok && j?.nearest && typeof j.nearest.distanceM === "number" ? j.nearest.distanceM : null,
            },
          }));
        } catch {
          setDetails((prev) => ({ ...prev, [id]: { ...prev[id], school: "none" } }));
        }
      })();
    }
  }, [selected, pool]);

  /* 지난 결정 — 로그인은 서버, 게스트는 이 기기 */
  useEffect(() => {
    if (!signedIn) {
      setPast(readJson(GUEST_DECISIONS_KEY, parseDecisionList));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/decisions");
        const j = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
        if (cancelled) return;
        if (!res.ok || !j || !Array.isArray(j.items)) {
          setPastFailed(true);
          setPast([]);
          return;
        }
        setPast(j.items.map(parseDecisionRecord).filter((x): x is DecisionRecord => x !== null));
      } catch {
        if (!cancelled) {
          setPastFailed(true);
          setPast([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const items = useMemo(
    () =>
      selected.map((id) => details[id] ?? { ...failedCandidate(id, pool.find((p) => p.id === id)?.name ?? id), status: "ok" as const, school: "pending" as const }),
    [selected, details, pool],
  );
  const loadedItems = useMemo(() => items.filter((c) => details[c.id] !== undefined), [items, details]);
  const loading = selected.some((id) => details[id] === undefined);

  /* 학교 축 — 한 곳이라도 자료가 있으면 켠다. 전부 unavailable 이면 "자료 준비 중" 으로 끈다 */
  const schoolStates = loadedItems.map((c) => c.school);
  const schoolPending = schoolStates.some((s) => s === "pending");
  const schoolAvailable = schoolStates.some((s) => s === "ok") || (!schoolPending && schoolStates.some((s) => s === "none"));
  const schoolOff = !schoolAvailable;

  const scorable = useMemo(() => loadedItems.filter((c) => c.status === "ok"), [loadedItems]);
  const result = useMemo(() => scoreCandidates(scorable, weights, { schoolAvailable }), [scorable, weights, schoolAvailable]);
  /* [1025c] 기준별 순위 막대 — 레이더와 같은 축(자료 없음·가중치 0 제외) */
  const groups = useMemo(() => {
    const hidden = new Set(result.dropped.filter((d) => d.reason === "unavailable" || d.reason === "off").map((d) => d.key));
    return rankBarGroups(
      scorable,
      DECIDE_AXES.map((a) => a.key).filter((k) => !hidden.has(k)),
    );
  }, [scorable, result]);
  const rankOf = new Map(result.ranked.map((s) => [s.id, s.rank]));
  const tops = topCandidates(result);
  const chosen = tops.length === 1 ? scorable.find((c) => c.id === tops[0].id) ?? null : null;
  const basisYm = latestBasisYm(loadedItems);

  /* 다음 한 걸음 — 후보 2곳의 값이 도착해야 기준·1순위·결정(레일·하단 바)이 나타난다 */
  const ready = selected.length >= 2 && !loading;
  const showPicker = picking || selected.length < 2;
  const trayN = pool.filter((p) => p.from === "tray").length;
  const watchN = pool.filter((p) => p.from === "watch").length;

  const toggleSelect = (id: string) => {
    if (!selected.includes(id) && selected.length >= DECIDE_MAX_CANDIDATES) {
      showToast(`후보는 최대 ${DECIDE_MAX_CANDIDATES}곳`);
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= DECIDE_MAX_CANDIDATES ? prev : [...prev, id]));
  };
  const removeCandidate = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));

  const addPicked = useCallback(
    (c: PickedComplex) => {
      const r = addToCompareTray({ id: c.id, name: c.name, region: c.region || c.regionLabel || undefined });
      if (!r.ok) {
        showToast(r.reason === "full" ? "비교함이 가득 찼어요" : "비교함을 쓸 수 없어요 · 저장 공간이 막혀 있어요");
        return;
      }
      setSelected((prev) => (prev.includes(c.id) || prev.length >= DECIDE_MAX_CANDIDATES ? prev : [...prev, c.id]));
    },
    [showToast],
  );

  const [savedOnce, setSavedOnce] = useState(false);
  const save = async () => {
    if (!ready || saving) return;
    setSavedOnce(false);
    setSaving(true);
    const payload = {
      complexIds: selected,
      chosenId: chosen?.id ?? null,
      chosenName: chosen?.name ?? null,
      verdict,
      memo: memo.trim() || null,
      weights,
    };
    try {
      if (signedIn) {
        const res = await fetch("/api/me/decisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await res.json().catch(() => null)) as { item?: unknown; error?: string } | null;
        const rec = res.ok && j?.item ? parseDecisionRecord(j.item) : null;
        if (!rec) {
          showToast(j?.error ?? "결정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
          return;
        }
        setPast((prev) => [rec, ...(prev ?? [])]);
        setSavedOnce(true);
      } else {
        const rec: DecisionRecord = {
          id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          complexIds: payload.complexIds,
          chosenId: payload.chosenId,
          chosenName: payload.chosenName,
          verdict,
          memo: payload.memo,
          weights,
          createdAt: new Date().toISOString(),
        };
        const next = [rec, ...(past ?? [])].slice(0, GUEST_DECISIONS_MAX);
        writeJson(GUEST_DECISIONS_KEY, next);
        setPast(next);
        setSavedOnce(true);
      }
      setMemo("");
      showToast(`${VERDICT_LABEL[verdict]} · 저장했어요`);
    } catch {
      showToast("결정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  /* 채움 파랑 하나 — 같은 요소를 레일(lg+)과 폰 하단 바(lg 미만)가 나눠 그린다 */
  const saveButton = (
    <button type="button" onClick={() => void save()} disabled={saving || !ready} className={`btn-primary btn-md press w-full ${saving ? "is-busy" : ""}`}>
      결정 저장
    </button>
  );
  const rankCard = <RankCard scorable={scorable} result={result} groups={groups} weights={weights} schoolPending={schoolPending} basisYm={basisYm} />;

  const pickerCard = (
    <section className="card p-[var(--pad-card)]" aria-label="후보 담기">
      {selected.length === 0 && <RadarGhost />}
      <p className="t-body font-bold text-ink">
        {selected.length === 0
          ? "후보를 담으면 내 기준으로 순위가 나와요"
          : selected.length === 1
            ? "한 곳 더 담으면 비교"
            : `후보 ${selected.length}곳 · 최대 ${DECIDE_MAX_CANDIDATES}곳`}
      </p>
      {selected.length === 0 && <p className="mt-0.5 t-caption text-text-3">후보 3곳의 가격·전세가율·거래량을 이 자리에 겹쳐 그려요</p>}
      <div className="mt-2">
        <ComplexPicker label="단지 검색" placeholder="단지명 검색" clearOnSelect showChip={false} onSelect={addPicked} onMapClick={null} />
      </div>
      {pool.length > 0 && (
        <>
          <p className="mt-3 t-caption text-text-3">
            {[trayN > 0 ? `비교함 ${trayN}` : null, watchN > 0 ? `관심 단지 ${watchN}` : null].filter(Boolean).join(" · ")} 에서 담기
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pool.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleSelect(p.id)} className={`${CHIP} ${on ? "chip-active" : CHIP_OFF}`}>
                  {p.name}
                  {p.region ? <span className="t-caption font-medium text-text-3">{p.region}</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );

  const pastList = past ?? [];
  /* [1025c] 지난 결정 — 있으면 타임라인, 없어도 후보 2곳이 준비되면 회색 견본(다음 결정이 쌓일 자리) */
  const pastVisible = past !== null && (pastList.length > 0 || pastFailed || ready);
  const pastRows = pastAll ? pastList : pastList.slice(0, PAST_PREVIEW);
  const weightsLine = (w: DecideWeights) => DECIDE_AXES.map((a) => `${a.label} ${w[a.key]}`).join(" · ");

  return (
    <div className="nz-dot-blue">
      <PageHead
        icon="clipboard"
        title="결정 카드"
        sub="국토교통부 실거래 · 매물 호가 아님"
        actions={
          selected.length >= 2 ? (
            <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} className="btn-secondary btn-md press gap-1.5">
              <Icon name="plus" size={16} />
              후보 담기
            </button>
          ) : undefined
        }
      />

      {/* [1025b] 절차 한 줄 — 담기 → 기준 → 결과 → 결정. 현재 단계만 파랑(UI-10: 화면당 한 번) */}
      <StepLine
        className="mt-3"
        current={savedOnce ? 4 : ready ? (chosen ? 3 : 2) : selected.length >= 2 ? 1 : 0}
        steps={[
          { label: "후보 담기", note: `${selected.length}/${DECIDE_MAX_CANDIDATES}` },
          { label: "내 기준" },
          { label: "1순위", note: chosen ? chosen.name : undefined },
          { label: "결정 저장" },
        ]}
      />

      <div className={`mt-3 grid grid-cols-1 gap-3 ${ready ? "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5" : ""}`}>
        <div className="min-w-0 flex flex-col gap-3">
          {selected.length === 0 && pickerCard}

          {selected.length > 0 && (
            <section aria-labelledby="decide-cands-title">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 id="decide-cands-title" className="t-section text-ink">
                  후보
                </h2>
                <span className="t-caption text-text-3">
                  {selected.length === 1 ? "한 곳 더 담으면 비교" : basisYm ? `실거래 ${ymDash(basisYm)} 기준` : `최대 ${DECIDE_MAX_CANDIDATES}곳`}
                </span>
              </div>
              <div className="-mx-3.5 mt-2 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3.5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
                {items.map((c) => (
                  <CandidateCard
                    key={c.id}
                    c={c}
                    loading={details[c.id] === undefined}
                    rank={ready && details[c.id] ? (rankOf.get(c.id) ?? null) : null}
                    onRemove={() => removeCandidate(c.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {selected.length > 0 && showPicker && pickerCard}

          {/* 폰·태블릿: 1순위(게이지)가 그림보다 먼저 — 결론이 위, 근거 그림이 아래 */}
          {ready && <div className="lg:hidden">{rankCard}</div>}

          {ready && <VizCard scorable={scorable} result={result} groups={groups} schoolOff={schoolOff} schoolPending={schoolPending} />}

          {ready && (
            <section className="card p-[var(--pad-card)]" aria-labelledby="decide-weights-title">
              <div className="flex items-center justify-between gap-2">
                <h2 id="decide-weights-title" className="t-section text-ink">
                  내 기준
                </h2>
                <span className="t-caption text-text-3">
                  {WEIGHT_MIN}~{WEIGHT_MAX} · 기본 5
                </span>
              </div>
              <p className="mt-1 t-caption text-text-3">움직이면 레이더·막대·점수·1순위에 바로 반영</p>
              <div className="mt-1 flex flex-col divide-y" data-tone="plain">
                {DECIDE_AXES.map((a) => {
                  const id = `decide-w-${a.key}`;
                  if (a.key === "school" && schoolOff) {
                    /* 학교 자료가 없으면 슬라이더 대신 회색 줄 하나 */
                    return (
                      <div key={a.key} className="grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-2.5 py-2 text-text-3">
                        <span className="t-body font-bold">{a.label}</span>
                        <span className="t-sub">{schoolPending ? "조회 중" : "자료 준비 중"}</span>
                        <span className="text-right t-sub font-bold">{NA}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={a.key} className="grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-2.5 py-2">
                      <label htmlFor={id} className="t-body font-bold text-text-1">
                        {a.label}
                      </label>
                      <input
                        id={id}
                        type="range"
                        min={WEIGHT_MIN}
                        max={WEIGHT_MAX}
                        step={1}
                        value={weights[a.key]}
                        onChange={(e) => setWeight(a.key, Number(e.target.value))}
                        className="h-10 w-full cursor-pointer accent-primary"
                        aria-label={`${a.label} 가중치`}
                        title={a.hint}
                      />
                      <span className="text-right t-sub font-bold t-num text-ink">{weights[a.key]}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {ready && (
            <div className="lg:hidden">
              <DecideCard verdict={verdict} setVerdict={setVerdict} memo={memo} setMemo={setMemo} chosenName={chosen?.name ?? null} signedIn={signedIn} />
            </div>
          )}

          {pastVisible && (
            <section className="card p-[var(--pad-card)]" aria-labelledby="decide-past-title">
              <div className="flex items-center justify-between gap-2">
                <h2 id="decide-past-title" className="t-section text-ink">
                  지난 결정
                </h2>
                <span className="t-caption text-text-3">{pastList.length > 0 ? `${pastList.length}건 · ` : ""}
                  {signedIn ? "내 계정" : "이 기기"}</span>
              </div>
              {pastFailed && pastList.length === 0 ? (
                <p className="mt-2 t-sub text-text-3">지난 결정 불러오기 실패 · 잠시 후 다시</p>
              ) : pastList.length === 0 ? (
                /* 회색 견본 — 결정을 저장하면 이 모양으로 쌓인다 */
                <ul className="m-0 mt-2 flex list-none flex-col p-0">
                  <TimelineItem tone="ghost">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="t-caption t-num">{formatKstDate(new Date())}</span>
                      <span className="t-body font-bold">{chosen?.name ?? "1순위 단지"}</span>
                      <span className="rounded border border-dashed border-line-strong px-1.5 py-px t-caption font-bold">{VERDICT_LABEL[verdict]}</span>
                      <span className="t-caption">저장 전</span>
                    </div>
                    <div className="t-caption">{weightsLine(weights)}</div>
                  </TimelineItem>
                  <TimelineItem tone="ghost" last>
                    <p className="t-sub">저장한 결정이 여기에 쌓여요 · 날짜 · 단지 · 결정</p>
                  </TimelineItem>
                </ul>
              ) : (
                <ul className="m-0 mt-2 flex list-none flex-col p-0">
                  {pastRows.map((d, i) => (
                    <TimelineItem key={d.id} tone={i === 0 ? "now" : "past"} last={i === pastRows.length - 1}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="t-caption t-num text-text-3">{formatKstDate(d.createdAt)}</span>
                        <span className="truncate t-body font-bold text-ink">
                          {d.chosenName ?? (d.chosenId ? d.chosenId : `후보 ${d.complexIds.length}곳`)}
                        </span>
                        <span className="shrink-0 rounded border border-line px-1.5 py-px t-caption font-bold text-text-2">{VERDICT_LABEL[d.verdict]}</span>
                      </div>
                      <div className="t-caption text-text-3">
                        {weightsLine(d.weights)} · 후보 {d.complexIds.length}곳
                        {d.memo ? ` · ${d.memo}` : ""}
                      </div>
                    </TimelineItem>
                  ))}
                </ul>
              )}
              {pastList.length > PAST_PREVIEW && (
                <button type="button" onClick={() => setPastAll((v) => !v)} aria-expanded={pastAll} className="btn-secondary btn-md press mt-2 w-full">
                  {pastAll ? "접기" : `더 보기 · ${pastList.length - PAST_PREVIEW}건`}
                </button>
              )}
            </section>
          )}

          <p className="t-caption text-text-3">{AI_DISCLAIMER}</p>
        </div>

        {/* 데스크톱 레일 — 후보 2곳의 값이 있을 때만 그린다(비어 있는 1순위·저장 불가 카드는 없다) */}
        {ready && (
          <aside className="hidden lg:sticky lg:top-[76px] lg:flex lg:flex-col lg:gap-3">
            {rankCard}
            <DecideCard verdict={verdict} setVerdict={setVerdict} memo={memo} setMemo={setMemo} chosenName={chosen?.name ?? null} signedIn={signedIn} button={saveButton} />
          </aside>
        )}
      </div>

      {ready && <MobilePrimaryBar label="결정 저장">{saveButton}</MobilePrimaryBar>}
    </div>
  );
}
