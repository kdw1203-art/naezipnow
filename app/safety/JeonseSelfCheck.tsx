"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/app/components/Icon";
import { lookupAvgTradePrice } from "./actions";

/* 전세 안심 진단(자가진단) — 항목 F27 lite.
   입력 기반으로 전세가율·근저당비율·부채비율을 계산해 안전/주의/위험 3단계를 안내한다.
   시세는 직접 입력이 기본이고, 원하면 입력한 주소/단지명으로 해당 지역 실거래
   평균(국토부 실거래·근사 매칭)을 조회해 채울 수 있다.
   판정 결과를 지어내지 않으며, 어디까지나 일반 참고용 자가진단임을 명시한다. */

/** 상단 "안전 진단" 버튼이 스크롤 타깃으로 쓰는 앵커 id */
export const SELF_CHECK_ANCHOR_ID = "jeonse-self-check";

type HousingType = "아파트" | "빌라·다세대" | "오피스텔";
type Level = "안전" | "주의" | "위험";

/* 주택유형별 기준선. 빌라·다세대는 시세 변동성·환금성 때문에 더 보수적으로 본다. */
const THRESHOLDS: Record<
  HousingType,
  { debtSafe: number; debtWarn: number; jeonseSafe: number; jeonseWarn: number }
> = {
  아파트: { debtSafe: 70, debtWarn: 90, jeonseSafe: 80, jeonseWarn: 90 },
  오피스텔: { debtSafe: 70, debtWarn: 90, jeonseSafe: 80, jeonseWarn: 90 },
  "빌라·다세대": { debtSafe: 60, debtWarn: 80, jeonseSafe: 70, jeonseWarn: 80 },
};

const LEVEL_STYLE: Record<
  Level,
  { color: string; soft: string; icon: string; headline: string }
> = {
  안전: {
    color: "var(--success)",
    soft: "var(--success-soft)",
    icon: "shield",
    headline: "비교적 안전한 편이에요",
  },
  주의: {
    color: "var(--warning)",
    soft: "var(--warning-soft)",
    icon: "warning",
    headline: "주의가 필요해요",
  },
  위험: {
    color: "var(--danger)",
    soft: "var(--danger-soft)",
    icon: "warning",
    headline: "깡통전세 위험 신호가 있어요",
  },
};

const TIPS = [
  /* [1015 · 규칙 D] 권유형 어미 → 사실·명사형 */
  "잔금 당일 전입신고 + 확정일자: 대항력과 우선변제권 확보.",
  "전세보증금 반환보증(HUG·SGI) 가입 가능 여부와 요건을 미리 확인.",
  "계약 직전과 잔금일에 등기부등본 재열람: 근저당·가압류 변동 확인.",
  "임대인 국세·지방세 완납증명 요청, 선순위 근저당 말소 특약.",
] as const;

const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseNum = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** 값이 safeMax 이하면 안전, warnMax 미만이면 주의, 그 외 위험 */
function classify(value: number, safeMax: number, warnMax: number): Level {
  if (value <= safeMax) return "안전";
  if (value < warnMax) return "주의";
  return "위험";
}

function LevelBadge({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full chip-pad text-[12px] font-bold"
      style={{ background: s.soft, color: s.color }}
    >
      <Icon name={level === "안전" ? "check" : "warning"} size={12} />
      {level}
    </span>
  );
}

export function JeonseSelfCheck({ subject }: { subject?: string | null }) {
  const [deposit, setDeposit] = useState(""); // 전세보증금 (만원)
  const [price, setPrice] = useState(""); // 매매가 추정 (만원)
  const [lien, setLien] = useState(""); // 선순위 근저당 채권최고액 (만원)
  const [type, setType] = useState<HousingType>("아파트");

  /* 실거래 평균 조회 — 상단에서 입력한 주소/단지명(subject) 기반 근사 매칭 */
  const [lookingUp, startLookup] = useTransition();
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const runLookup = () => {
    const q = (subject ?? "").trim();
    if (!q || lookingUp) return;
    startLookup(async () => {
      const r = await lookupAvgTradePrice(q);
      if (r.ok) {
        setPrice(String(r.avgManwon));
        const ym =
          r.latestYm.length === 6 ? `${r.latestYm.slice(0, 4)}.${r.latestYm.slice(4, 6)}` : "";
        setLookupNote(
          `${[r.regionName, r.complexName].filter(Boolean).join(" ")} 최근 매매 ${r.sampleSize}건 평균` +
            `${ym ? ` (~${ym})` : ""}. 단지명 부분일치 근사값이라 실제 가격과 다를 수 있음.`,
        );
      } else {
        setLookupNote(
          r.reason === "not-found" || r.reason === "empty-query"
            ? "입력한 주소/단지명과 일치하는 최근 실거래를 찾지 못했어요. 매매가를 직접 입력해 주세요."
            : "실거래 조회가 지금은 어려워요. 매매가를 직접 입력해 주세요.",
        );
      }
    });
  };

  const depositN = parseNum(deposit);
  const priceN = parseNum(price);
  const lienN = parseNum(lien);
  const ready = depositN > 0 && priceN > 0;

  const result = useMemo(() => {
    if (!ready) return null;
    const t = THRESHOLDS[type];
    const jeonseRatio = (depositN / priceN) * 100; // 전세가율
    const lienRatio = (lienN / priceN) * 100; // 근저당비율
    const debtRatio = ((depositN + lienN) / priceN) * 100; // 부채비율(깡통전세 핵심)

    const jeonseLevel = classify(jeonseRatio, t.jeonseSafe, t.jeonseWarn);
    const lienLevel = classify(lienRatio, 30, 60);
    const debtLevel = classify(debtRatio, t.debtSafe, t.debtWarn);

    // 종합 등급: 세 지표 중 가장 나쁜 쪽을 따른다 — 어느 한 축이라도 '위험'이면
    // 종합이 '안전'으로 나오지 않는다(근저당비율 포함).
    const levels: Level[] = [jeonseLevel, lienLevel, debtLevel];
    const overall: Level = levels.includes("위험")
      ? "위험"
      : levels.includes("주의")
        ? "주의"
        : "안전";

    return {
      t,
      overall,
      indicators: [
        {
          key: "전세가율",
          value: jeonseRatio,
          level: jeonseLevel,
          formula: "보증금 ÷ 매매가",
          explain:
            "매매가 대비 보증금 비율. 높을수록 집값이 내렸을 때 보증금을 온전히 돌려받기 어렵다.",
        },
        {
          key: "근저당비율",
          value: lienRatio,
          level: lienLevel,
          formula: "선순위 근저당 ÷ 매매가",
          explain:
            "집에 이미 잡혀 있는 대출(근저당) 규모. 경매로 넘어가면 근저당이 내 보증금보다 먼저 변제된다.",
        },
        {
          key: "부채비율",
          value: debtRatio,
          level: debtLevel,
          formula: "(보증금 + 근저당) ÷ 매매가",
          explain:
            "보증금과 선순위 근저당을 합친 총부담이 매매가에서 차지하는 비율. 깡통전세를 가늠하는 핵심 지표로, 통상 90%를 넘으면 위험이 크다.",
        },
      ] as const,
    };
  }, [ready, type, depositN, priceN, lienN]);

  const inputCls =
    "w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary";

  return (
    <section id={SELF_CHECK_ANCHOR_ID} className="mt-5 scroll-mt-[72px]">
      <div className="card flex flex-col gap-4 rounded-3xl p-[22px] max-md:gap-3 max-md:p-3.5">
        {/* 헤더 */}
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
          >
            <Icon name="shield" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="t-section text-ink">전세 안심 자가진단</div>
            {/* [1015 · 규칙 B·D] 사용법 문장("입력하면 … 알려드려요") → 사실 한 줄 */}
            <p className="t-sub leading-[1.6] text-text-2">전세가율 · 근저당비율 · 부채비율 → 안전 · 주의 · 위험</p>
            {subject ? (
              <p className="t-sub font-bold text-primary">진단 대상: {subject}</p>
            ) : null}
          </div>
        </div>

        {/* 입력 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              전세보증금 <span className="text-text-3">(만원)</span>
            </span>
            <input
              inputMode="numeric"
              value={depositN ? fmt(depositN) : ""}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder=""
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              매매가(추정) <span className="text-text-3">(만원)</span>
            </span>
            <div className="flex gap-1.5">
              <input
                inputMode="numeric"
                value={priceN ? fmt(priceN) : ""}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setLookupNote(null);
                }}
                placeholder=""
                className={inputCls}
              />
              <button
                type="button"
                onClick={runLookup}
                disabled={!subject?.trim() || lookingUp}
                title={subject?.trim() ? "입력한 주소/단지명의 최근 실거래 평균 조회" : "상단에 주소/단지명을 먼저 입력"}
                className="btn-soft shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[12px] font-bold disabled:opacity-50"
              >
                {lookingUp ? "조회 중…" : "실거래 평균"}
              </button>
            </div>
            {lookupNote ? (
              <span className="t-caption leading-[1.5] text-text-3">{lookupNote}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              선순위 근저당 <span className="text-text-3">(채권최고액·만원)</span>
            </span>
            <input
              inputMode="numeric"
              value={lienN ? fmt(lienN) : ""}
              onChange={(e) => setLien(e.target.value)}
              placeholder="없으면 0"
              className={inputCls}
            />
          </label>
        </div>

        {/* 주택유형 (선택) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-text-1">
            주택유형 <span className="font-medium text-text-3">(선택)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["아파트", "빌라·다세대", "오피스텔"] as HousingType[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setType(h)}
                className={`chip px-3 py-1.5 text-[12px] ${
                  type === h ? "chip-active" : "chip-soft"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          {type === "빌라·다세대" && (
            <span className="t-sub text-text-3">환금성이 낮아 기준을 더 보수적으로 적용</span>
          )}
        </div>

        {/* 결과 */}
        {!result ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center t-sub text-text-3 max-md:py-4">
            전세보증금과 매매가를 넣으면 위험도 계산
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 종합 등급 배너 */}
            <div
              className="flex items-center gap-3 rounded-lg px-4 py-3.5"
              style={{
                background: LEVEL_STYLE[result.overall].soft,
                color: LEVEL_STYLE[result.overall].color,
              }}
            >
              <Icon name={LEVEL_STYLE[result.overall].icon} size={24} />
              <div className="flex flex-col">
                <span className="text-[15px] font-bold">
                  종합 {result.overall}
                </span>
                <span className="t-sub font-medium leading-[1.5] opacity-90">
                  {LEVEL_STYLE[result.overall].headline} · {type} 기준(부채비율{" "}
                  {result.t.debtSafe}% 이하 안전 / {result.t.debtWarn}% 이상 위험) · 세 지표 중 가장 나쁜 등급
                </span>
              </div>
            </div>

            {/* 지표별 값 + 설명 */}
            <div className="flex flex-col gap-2.5">
              {result.indicators.map((ind) => (
                <div
                  key={ind.key}
                  className="rounded-lg border border-line bg-surface px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-text-1">
                        {ind.key}
                      </span>
                      <span className="t-caption text-text-3">
                        {ind.formula}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[15px] font-bold"
                        style={{ color: LEVEL_STYLE[ind.level].color }}
                      >
                        {ind.value.toFixed(1)}%
                      </span>
                      <LevelBadge level={ind.level} />
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] leading-[1.6] text-text-2">
                    {ind.explain}
                  </p>
                </div>
              ))}
            </div>

            {/* 실행 팁 */}
            <div className="rounded-lg bg-bg px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-ink">
                <Icon name="check" size={14} /> 계약 전 실행 팁
              </div>
              <ul className="flex flex-col gap-1.5">
                {TIPS.map((tip) => (
                  <li
                    key={tip}
                    className="flex gap-1.5 text-[12px] leading-[1.6] text-text-2"
                  >
                    <span className="text-primary">·</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 면책 */}
        <div
          className="flex items-start gap-1.5 rounded-lg px-3 py-2.5 text-[12px] leading-[1.6]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          <span>
            본 진단은 일반 참고용 자가진단이며 법적 효력이 없습니다. 실제 계약 전
            등기부·건축물대장 확인과 전문가 상담이 필요합니다.
          </span>
        </div>
      </div>
    </section>
  );
}
