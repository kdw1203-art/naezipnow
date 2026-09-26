"use client";
import { RingLoader } from "@/app/components/ui/BrandLoader";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
/* [1009 · C] TrendChart+Bars → 손가락으로 훑는 추세선(ScrubLineLazy — 따로 받는 청크) */
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { Icon } from "@/app/components/Icon";
import { formatEokMan } from "@/lib/format/eok-man";
import Link from "next/link";
import { useToast } from "@/app/components/toast/ToastProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { regionIdForName } from "@/lib/region/catalog";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { formatKrwManwon, formatKrwWon } from "@/lib/format/krw";
import { readAreaUnitCookie } from "@/lib/prefs/area-unit";
import type { AreaUnit } from "@/lib/prefs/ui-prefs";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";
import { monthDeltaView, monthDeltasLatestFirst, ymRangeShort } from "@/lib/complex/month-delta";

/* ============================================================
   단지 정보 패널 — 검색/마커/목록 선택 시.
   GET /api/complex/[id]/detail 로 실거래·전월세·면적대·스펙·임장노트·지역대비·
   후기·인근을 한 화면에 밀도 있게 표시 (허브의 축약판).

   [1006 · B] 섹션 순서를 "읽는 순서"로 다시 잡았다:
     머리글(이름·주소·요약 한 줄) → 핵심 숫자 4칸 → 실거래 추이 → 면적대 → 월별 →
     전월세(새) → 스펙(없는 값은 이유 한 줄로 묶음) → 임장노트(새) → 지역 대비 →
     후기 → 이야기 → 인근.
   "시세" 라는 말은 쓰지 않는다 — 여기 숫자는 전부 국토부 실거래 신고분이다.
   ============================================================ */

interface ComplexDetail {
  id: string;
  canonical_id?: string;
  name: string;
  city: string;
  district: string;
  address: string | null;
  road_address: string | null;
  lat: number | null;
  lng: number | null;
  build_year: number | null;
  total_floors: number | null;
  households: number | null;
  building_count: number | null;
  parking_count: number | null;
  parking_per_hh: number | null;
  building_type: string | null;
  builder_name: string | null;
  heating: string | null;
  kapt_code: string | null;
}

interface TxRow {
  yyyymm: string;
  area_m2: number | null;
  avg_manwon: number;
  min_manwon: number | null;
  max_manwon: number | null;
  deal_count: number;
}

interface ReviewSummary {
  count: number;
  noise: number | null;
  parking: number | null;
  mgmt: number | null;
  neighbor: number | null;
  transport: number | null;
}

interface PostRow {
  id?: string;
  title: string;
  district?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  created_at?: string;
}

interface AreaBandRow {
  label: string;
  count: number;
  latestManwon: number;
  latestYm: string;
  avgManwon: number;
}

interface RegionRelativeRow {
  district: string;
  complexPerM2Manwon: number;
  districtPerM2Manwon: number;
  deltaPct: number;
  saleChangePct: number | null;
  jeonseRatio: number | null;
  period: string | null;
}

interface NearbyRow {
  id: string;
  name: string;
  meta: string;
}

/* [1006] 아래 세 DTO 는 lib/complex/complex-facts.ts 의 RentSummary·ComplexNotesBrief·
   ComplexFacts 와 같은 모양이다. 그 모듈을 import 하지 않는 이유: 지도 청크 예산(375KB)
   안에 있는 패널이라 서버 계산 모듈을 끌어오지 않고, 이미 계산된 값만 그린다. */
interface RentSummaryDto {
  windowMonths: number;
  fromYm: string;
  toYm: string;
  jeonseCount: number;
  jeonseMedianKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
  latest: {
    ym: string;
    jeonseCount: number;
    jeonseMedianKrw: number | null;
    wolseCount: number;
    wolseMedianDepositKrw: number | null;
    wolseMedianMonthlyKrw: number | null;
  } | null;
}

interface NotesBriefDto {
  count: number;
  latest: {
    id: string;
    title: string;
    visitDate: string | null;
    decision: { choice: "buy" | "hold" | "pass" | "revisit"; label: string } | null;
  } | null;
}

interface FactGapDto {
  key: string;
  label: string;
  reason: string;
  note: string;
}

interface FactsDto {
  completeness: { have: string[]; missing: FactGapDto[] };
  summaryLine: string | null;
  jeonseRatio: {
    pct: number;
    windowMonths: number;
    fromYm: string;
    toYm: string;
    jeonseCount: number;
    jeonseMedianKrw: number;
    tradeCount: number;
    tradeMedianKrw: number;
  } | null;
  jeonseRatioReason: string | null;
  tradeSummary: {
    windowMonths: number;
    fromYm: string;
    toYm: string;
    count: number;
    medianKrw: number | null;
    band: { label: string; count: number; medianKrw: number } | null;
    latestYm: string | null;
  } | null;
  rentSummary: RentSummaryDto | null;
}

interface DetailResponse {
  complex: ComplexDetail | null;
  transactions: TxRow[];
  posts?: PostRow[];
  reviews?: ReviewSummary | null;
  areaBands?: AreaBandRow[];
  regionRelative?: RegionRelativeRow | null;
  nearby?: NearbyRow[];
  listingCount?: number | null;
  /** [1006] 전월세 12개월 요약 — null 은 신고 없음(sideFailures "rent" 면 실패) */
  rent?: RentSummaryDto | null;
  /** [1006] 공개 임장노트 수·최신 1건 — null 은 못 읽음 */
  notes?: NotesBriefDto | null;
  /** [1006] 자료 완성도·전세가율·매매 12개월 요약 — not_found 면 null */
  facts?: FactsDto | null;
  /** [1006] 있는 숫자만 이은 한 줄 */
  summaryLine?: string | null;
  /** 조회에 실패한 부가 섹션 이름들 — 빈 값("없음")과 실패를 구분한다 */
  sideFailures?: string[];
  fetchedAt?: string;
  mode: string;
}

export interface ComplexInfoPanelProps {
  complexId: string;
  initialName?: string;
  /** 노트→지도 핸드오프 — 해당 임장노트·AI로 바로 이어가기 */
  focusNoteId?: string | null;
  onClose: () => void;
  onLoaded?: (info: { id: string; name: string; lat: number; lng: number }) => void;
}

/** 만원 → "8.4억"/"8,200만", 없으면 null — **평균·요약**의 짧은 표기(eok1, 허브·지도 말풍선과 같은 얼굴).
 *  [1009 · C] 예전 "listing" 스타일("8.0억"·"12억")은 허브(eok1 "8억")와 소수 자리가 달랐다. 한 건 값은 formatEokMan. */
function manwonLabel(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  return formatKrwManwon(manwon, { style: "eok1" });
}

/** [1006] 원 → "30.9억"/"9,800만" — 요약 문장(서버)과 같은 얼굴(eok1). 없으면 null */
function wonLabel(krw: number | null | undefined): string | null {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return null;
  return formatKrwWon(krw, { style: "eok1" });
}

function ymLabel(yyyymm: string): string {
  if (!yyyymm || yyyymm.length < 6) return yyyymm;
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
}

function postDateLabel(iso?: string): string | null {
  if (!iso || iso.length < 10) return null;
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}

/** "202608" → 다음 달 */
function nextYm(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  return m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, "0")}`;
}

/**
 * [1009 · C] 실거래가 추이 — TrendChart+Bars(두 장) → ScrubLine 한 장(누르고 끌면 그 달 값·거래 수).
 *
 * 왜(1009 실측): ① 이 카드에서 배지는 상승=빨강인데 선은 상승=파랑(`up ? "text-primary" : "text-danger"`)이라
 * 한 카드 안에서 색이 반대로 읽혔다. ② 그 달 값을 읽으려면 아래 "월별 실거래" 목록을 따로 찾아야 했다(포인터 반응 0).
 * ③ 거래 건수 막대가 따로 있어 1건짜리 달과 20건짜리 달의 무게를 눈으로 맞춰 봐야 했다.
 * 이제 거래 수를 점에 싣는다(1~2건 달은 속 빈 점 — fewBelow 3). 값은 상세 API 의 월별 평균(면적 혼합) 그대로다 —
 * 그래서 "면적 혼합"이라고 적는다(평형별 추이는 전체 화면 /complex/[id] 에). 빈 달은 null(지어내지 않는다).
 */
function PriceTrend({ tx, name }: { tx: TxRow[]; name: string }) {
  const byYm = new Map<string, { sum: number; n: number; deals: number }>();
  for (const t of tx) {
    if (!/^\d{6}$/.test(t.yyyymm) || !Number.isFinite(t.avg_manwon) || t.avg_manwon <= 0) continue;
    const cur = byYm.get(t.yyyymm) ?? { sum: 0, n: 0, deals: 0 };
    cur.sum += t.avg_manwon;
    cur.n += 1;
    cur.deals += t.deal_count || 0;
    byYm.set(t.yyyymm, cur);
  }
  const known = [...byYm.keys()].sort();
  if (known.length < 2) return null;
  /* 달력으로 잇는다 — 거래 없는 달은 비운다(선은 점선으로 건너뛴다) */
  const yms: string[] = [];
  for (let ym = known[0]; ym <= known[known.length - 1] && yms.length < 60; ym = nextYm(ym)) yms.push(ym);
  const values = yms.map((ym) => {
    const v = byYm.get(ym);
    return v ? Math.round(v.sum / v.n) : null;
  });
  const counts = yms.map((ym) => byYm.get(ym)?.deals ?? 0);
  const dealSum = counts.reduce((a, b) => a + b, 0);
  /* 마지막 달이 1~2건이면 머리 숫자(ScrubLine — 최신 값 · 기간 시작 대비)가 그 한두 건에 끌려간다 — 허브와 같은 안내 */
  const lastI = values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  const lastFew = lastI >= 0 && counts[lastI] < 3 ? { ym: yms[lastI], n: counts[lastI] } : null;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-0.5">
        <span className="t-section text-ink">실거래가 추이</span>
        <Explain
          term="silgeoraega"
          title="실거래가 추이"
          how={[
            "그 달 신고된 매매 거래의 평균이에요. 평형을 나누지 않은 평균이라 그 달 팔린 평형 구성에 따라 출렁일 수 있어요 — 평형별 추이는 전체 화면에서 볼 수 있어요.",
            "거래가 1~2건인 달은 속 빈 점으로 그려요. 거래가 없는 달은 비워 두고 점선으로 건너뛰어요.",
            "해제 신고된 거래는 빼요.",
          ]}
          source="국토교통부 실거래가"
        />
        <span className="ml-auto t-caption text-text-3 tabular-nums">
          {yms.length}개월 · 거래 {dealSum.toLocaleString("ko-KR")}건
        </span>
      </div>
      {lastFew && (
        <p className="rounded-lg bg-bg px-2.5 py-1.5 t-caption text-text-2">
          최근 달({lastFew.ym.slice(2, 4)}.{lastFew.ym.slice(4, 6)})은 거래 {lastFew.n}건이라 그 값에 크게 흔들려요.
        </p>
      )}
      <ScrubLineLazy
        values={values}
        labels={yms.map((ym) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`)}
        fullLabels={yms.map((ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`)}
        counts={counts}
        countLabel="거래"
        fewBelow={3}
        format="eok1"
        tone="primary"
        title="월평균 실거래가"
        caption="면적 혼합"
        ranges={
          yms.length > 12
            ? [
                { key: "1y", label: "1년", last: 12 },
                { key: "all", label: "전체", last: 0 },
              ]
            : []
        }
        defaultRange="all"
        height={150}
        ariaLabel={`${name} 월평균 실거래가 추이`}
        footnote="국토교통부 실거래가(해제 신고 제외) · 월별 평균 · 면적 혼합 · 속 빈 점은 그 달 거래 1~2건"
      />
    </div>
  );
}

function WatchlistToggle({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const { showToast } = useToast();
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  /* [1009 · C] 켤 때 하트가 한 번 튄다(키를 바꿔 다시 재생 — njn-pop-once, 모션 최소화면 꺼짐) */
  const [pop, setPop] = useState(0);
  const busyRef = useRef(false);

  const askSignup = () =>
    promptSignup({
      action: "watchlist_add",
      title: "관심 단지로 저장할까요?",
      benefit:
        "가입하면 이 단지의 국토부 실거래가가 새로 등록될 때 알림을 받고, 임장노트와 함께 모아볼 수 있어요.",
      callbackUrl: "/map",
    });

  const disabled = !complexId || complexId.startsWith("mock-");

  useEffect(() => {
    if (disabled) {
      setWatching(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setWatching(Boolean(j.watching));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [complexId, disabled]);

  if (disabled) return null;

  /* [1009 · C] 뺄 때 확인 없이 바로 빼고 토스트에 "되돌리기"(실제 API 로 다시 담는다) — 허브 관심 버튼과 같은 흐름 */
  async function apply(target: boolean, opts: { undo?: boolean } = {}) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = target
        ? await fetch("/api/me/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complexId, complexName }),
          })
        : await fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`, { method: "DELETE" });
      if (res.status === 401) {
        askSignup();
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (target && handleUpgradeResponse(res.status, j)) {
        showToast(j.error ?? "관심 단지 한도를 초과했어요 — 다른 단지를 빼면 담을 수 있어요");
        return;
      }
      if (!res.ok) {
        showToast(
          j.error ??
            (target
              ? "관심 단지에 담지 못했어요 — 잠시 후 다시 눌러 주세요"
              : "관심 단지에서 빼지 못했어요 — 잠시 후 다시 눌러 주세요"),
        );
        return;
      }
      setWatching(target);
      if (target) {
        setPop((n) => n + 1);
        showToast(opts.undo ? "다시 관심 단지에 담았어요" : "관심 단지에 담았어요. 실거래 신고 알림을 받아요.");
      } else {
        showToast("관심 단지에서 뺐어요", {
          label: "되돌리기",
          onClick: () => {
            void apply(true, { undo: true });
          },
        });
      }
    } catch {
      showToast("네트워크 오류로 저장하지 못했어요 — 연결을 확인하고 다시 눌러 주세요");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void apply(!watching)}
      disabled={busy}
      aria-pressed={watching === true}
      aria-busy={busy}
      className={`press flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border p-[11px] text-xs font-extrabold transition-colors disabled:opacity-60 ${
        watching
          ? "border-primary bg-primary-soft text-primary"
          : "border-line bg-surface text-text-2"
      }`}
    >
      {/* [1009 · C] 하트 색이 "안 담음 = 빨강(text-danger)"이었다 — danger 는 오류 색이다. 담긴 상태만 채운 하트 */}
      <span key={pop} className={`inline-flex ${pop > 0 ? "njn-pop-once" : ""}`} aria-hidden="true">
        <Icon name="heart" size={14} className={watching ? "fill-current" : ""} />
      </span>
      {busy ? "저장 중…" : watching ? "관심 단지 담김 · 알림 받는 중" : "관심 단지 담고 실거래 알림 받기"}
    </button>
  );
}

const REVIEW_LABELS: { key: keyof Omit<ReviewSummary, "count">; label: string }[] = [
  { key: "noise", label: "소음" },
  { key: "parking", label: "주차" },
  { key: "mgmt", label: "관리" },
  { key: "neighbor", label: "이웃" },
  { key: "transport", label: "교통" },
];

/* [1006] 판단 칩 색 — lib/inspection/decision.ts 의 4종. 토큰 클래스만 쓴다(다크 안전). */
const DECISION_CHIP: Record<"buy" | "hold" | "pass" | "revisit", string> = {
  buy: "bg-primary-soft text-primary",
  hold: "bg-warning-soft text-warning",
  pass: "bg-danger-soft text-danger",
  revisit: "bg-bg text-text-2",
};

function SectionHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="t-body font-extrabold text-ink">{title}</div>
        {sub ? <div className="mt-0.5 t-caption text-text-3">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

/** [1006] 핵심 숫자 한 칸 — 값이 문장("대장 미연결")이면 작게, 숫자면 크게 */
function KpiCell({
  label,
  value,
  sub,
  muted,
  explain,
}: {
  label: string;
  value: string;
  sub?: string | null;
  muted?: boolean;
  /** [1009 · C] 라벨 옆 ⓘ(<Explain>) */
  explain?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg px-2.5 py-2">
      <div className="flex items-center gap-0.5 t-caption text-text-3">
        {label}
        {explain}
      </div>
      <div
        className={`mt-0.5 break-words ${
          muted ? "t-sub font-bold text-text-2" : "t-section text-ink tabular-nums"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate t-caption text-text-3">{sub}</div> : null}
    </div>
  );
}

export function ComplexInfoPanel({
  complexId,
  initialName,
  focusNoteId = null,
  onClose,
  onLoaded,
}: ComplexInfoPanelProps) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /* [1006] 면적 단위 — 쿠키는 클라이언트에서만 읽는다(서버 렌더 개인화 금지, lib/prefs/area-unit.ts) */
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("m2");
  useEffect(() => {
    setAreaUnit(readAreaUnitCookie());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setData(null);
    fetch(`/api/complex/${encodeURIComponent(complexId)}/detail`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<DetailResponse>) : null))
      .then((j) => {
        if (cancelled) return;
        if (!j) {
          setFailed(true);
          return;
        }
        setData(j);
        const c = j.complex;
        if (c && c.lat != null && c.lng != null && onLoaded) {
          onLoaded({ id: complexId, name: c.name, lat: c.lat, lng: c.lng });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [complexId, onLoaded]);

  const complex = data?.complex ?? null;
  const name = complex?.name ?? initialName ?? "단지";
  // ?? [] 를 그대로 두면 렌더마다 새 배열이라 tx 를 의존하는 useMemo 가 매번 다시 돈다
  const tx = useMemo(() => data?.transactions ?? [], [data?.transactions]);
  const posts = data?.posts ?? [];
  const reviews = data?.reviews ?? null;
  const bands = data?.areaBands ?? [];
  const region = data?.regionRelative ?? null;
  const nearby = data?.nearby ?? [];
  const sideFailed = new Set(data?.sideFailures ?? []);
  const listingCount = data?.listingCount;
  const facts = data?.facts ?? null;
  const rent = data?.rent ?? null;
  const notes = data?.notes ?? null;
  const tradeSummary = facts?.tradeSummary ?? null;
  const summaryLine = data?.summaryLine ?? null;
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const recent = useMemo(() => [...tx].reverse().slice(0, 14), [tx]);
  /* [1009 · C 리뷰] 줄마다 등락의 기준 — 바로 더 이른 **줄**(거래 있던 달)과 비교하므로 가운데 달이 비면 전월이 아니다.
     기준 달을 세어(표에 보이는 14줄 밖의 한 줄까지) 전월이면 "전월 대비", 아니면 "26.02 대비"로 적는다(lib/complex/month-delta). */
  const recentDeltas = useMemo(
    () => monthDeltasLatestFirst([...tx].reverse().slice(0, 15).map((t) => ({ ym: t.yyyymm, avg: t.avg_manwon }))),
    [tx],
  );
  const cityDistrict = [complex?.city, complex?.district].filter(Boolean).join(" ");
  const address =
    complex?.road_address ??
    complex?.address ??
    (cityDistrict || (initialName ? "" : "주소 준비 중"));

  const dealSum = recent.reduce((s, t) => s + (t.deal_count || 0), 0);
  const bandLabel = (label: string) => areaBandLabelByUnit(label, areaUnit);

  const detailHref = `/complex/${encodeURIComponent(complexId)}`;
  /* 임장노트 작성기(app/notes/new/NoteForm.tsx)가 읽는 파라미터 그대로: apt·region·complexId·lat·lng */
  const noteHref = (() => {
    const params = new URLSearchParams({ apt: name });
    if (cityDistrict) params.set("region", cityDistrict);
    if (complexId && !complexId.startsWith("mock-")) params.set("complexId", complexId);
    if (complex?.lat != null && complex?.lng != null) {
      params.set("lat", String(complex.lat));
      params.set("lng", String(complex.lng));
    }
    return `/notes/new?${params.toString()}`;
  })();
  const analysisHref = focusNoteId
    ? `/analysis?noteId=${encodeURIComponent(focusNoteId)}`
    : `/analysis?complexId=${encodeURIComponent(complexId)}`;
  const focusNoteHref = focusNoteId
    ? `/notes/${encodeURIComponent(focusNoteId)}`
    : null;

  /* ── [1006] 핵심 숫자 4칸 ─────────────────────────────────────────────
     매매 중앙(12개월) / 전세 중앙(12개월) / 세대수 / 준공.
     없는 값은 "—" 가 아니라 **왜 없는지**(대장 미연결·신고 없음·조회 실패)를 쓴다. */
  const gapByKey = new Map((facts?.completeness.missing ?? []).map((g) => [g.key, g]));
  const shortGap = (key: string, fallback: string): string => {
    const g = gapByKey.get(key);
    if (!g) return fallback;
    if (g.reason === "master_unlinked") return "대장 미연결";
    if (g.reason === "master_empty") return "대장에 없음";
    if (g.reason === "fetch_failed") return "조회 실패";
    return fallback;
  };

  const tradeKpi = (() => {
    if (!data) return { value: loading ? "…" : "—", sub: null as string | null, muted: true };
    if (!facts) return { value: "—", sub: null, muted: true };
    if (!tradeSummary) return { value: "조회 실패", sub: "매매 12개월", muted: true };
    if (tradeSummary.count === 0) {
      return {
        value: "12개월 거래 없음",
        sub: latest ? `마지막 신고 ${ymLabel(latest.yyyymm)}` : null,
        muted: true,
      };
    }
    const b = tradeSummary.band;
    if (b) {
      return {
        value: wonLabel(b.medianKrw) ?? "—",
        sub: `${bandLabel(b.label)} ${b.count}건 / 전체 ${tradeSummary.count}건`,
        muted: false,
      };
    }
    if (tradeSummary.medianKrw != null) {
      return {
        value: wonLabel(tradeSummary.medianKrw) ?? "—",
        sub: `${tradeSummary.count}건 · 면적 혼합`,
        muted: false,
      };
    }
    return { value: `${tradeSummary.count}건`, sub: "표본 3건 미만 — 중앙값 생략", muted: true };
  })();

  const rentKpi = (() => {
    if (!data) return { value: loading ? "…" : "—", sub: null as string | null, muted: true };
    if (!facts) return { value: "—", sub: null, muted: true };
    if (sideFailed.has("rent")) return { value: "조회 실패", sub: "전세 12개월", muted: true };
    if (!rent) return { value: "24개월 신고 없음", sub: null, muted: true };
    if (rent.jeonseCount >= 3 && rent.jeonseMedianKrw != null) {
      return { value: wonLabel(rent.jeonseMedianKrw) ?? "—", sub: `전세 ${rent.jeonseCount}건`, muted: false };
    }
    if (rent.jeonseCount > 0) {
      return { value: `전세 ${rent.jeonseCount}건`, sub: "표본 3건 미만 — 중앙값 생략", muted: true };
    }
    return {
      value: "12개월 전세 없음",
      sub: rent.wolseCount > 0 ? `월세 ${rent.wolseCount}건` : null,
      muted: true,
    };
  })();

  const chips = [
    listingCount != null && listingCount > 0 ? `매물 ${listingCount}건` : null,
    posts.length > 0 ? `이야기 ${posts.length}건` : null,
  ].filter((v): v is string => Boolean(v));

  const specRows = [
    complex?.households
      ? { label: "세대수", value: `${complex.households.toLocaleString("ko-KR")}세대` }
      : null,
    complex?.building_count
      ? { label: "동 수", value: `${complex.building_count}동` }
      : null,
    complex?.parking_count
      ? { label: "총 주차", value: `${complex.parking_count.toLocaleString("ko-KR")}대` }
      : null,
    complex?.parking_per_hh
      ? { label: "세대당 주차", value: `${complex.parking_per_hh}대` }
      : null,
    complex?.heating ? { label: "난방", value: complex.heating } : null,
    complex?.builder_name ? { label: "시공사", value: complex.builder_name } : null,
    complex?.build_year
      ? {
          label: "준공",
          value: `${complex.build_year}년 (${new Date().getFullYear() - complex.build_year}년차)`,
        }
      : null,
    complex?.total_floors ? { label: "층수", value: `${complex.total_floors}층` } : null,
    /* [1009 · C] "유형 아파트"는 데이터가 아니라 상수(실거래 적재가 아파트만 받는다)라 뺐다 — 허브 단지 정보와 같은 규칙 */
    complex?.kapt_code ? { label: "단지코드", value: complex.kapt_code } : null,
    cityDistrict ? { label: "지역", value: cityDistrict } : null,
  ].filter((v): v is { label: string; value: string } => Boolean(v));

  /* [1006] 없는 스펙은 줄마다 "—" 를 나열하지 않고 **이유별로 한 줄**로 묶는다.
     대장 미연결(소규모 단지엔 대장이 없다)과 대장엔 있는데 값이 빈 것은 다른 사실이다. */
  const MASTER_KEYS = ["households", "building_count", "parking", "builder", "heating", "road"];
  const specGaps = (facts?.completeness.missing ?? []).filter((g) => MASTER_KEYS.includes(g.key));
  const specGapLines = (() => {
    /* 같은 문장끼리 묶는다 — "대장 미연결" 여섯 항목은 한 줄, 세대수의 "같은 필지" 문장은 따로 */
    const byNote = new Map<string, FactGapDto[]>();
    for (const g of specGaps) {
      const arr = byNote.get(g.note) ?? [];
      arr.push(g);
      byNote.set(g.note, arr);
    }
    return [...byNote.entries()].map(([note, gaps]) => ({
      note,
      labels: gaps.map((g) => g.label).join("·"),
    }));
  })();

  const fetchedLabel = data?.fetchedAt
    ? (() => {
        const t = Date.parse(data.fetchedAt);
        if (!Number.isFinite(t)) return null;
        const d = new Date(t);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 갱신`;
      })()
    : null;

  const ratio = facts?.jeonseRatio ?? null;
  const rentFailed = sideFailed.has("rent");
  const notesFailed = sideFailed.has("notes") || (Boolean(facts) && notes == null);
  const failedSections = [
    sideFailed.has("regionRelative") ? "이 동네 대비" : null,
    sideFailed.has("nearby") ? "인근 단지" : null,
    sideFailed.has("tradeWindow") ? "매매 12개월 요약" : null,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[48] flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} 단지 정보`}
    >
      <button
        type="button"
        aria-label="단지 정보 닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(11,20,40,.48)]"
      />
      {/* 소유자 캡처 제보(2026-08-16): glass-strong(반투명+블러)이 뒤의 어두운
          지도 딤과 겹쳐, backdrop-filter 가 약한 환경에서 패널이 탁한 어둠으로
          렌더돼 "보기가 힘들다". 시트/모달은 불투명이 정답 — bg-surface 로 고정해
          어떤 GPU·브라우저에서도 같은 흰 패널을 보장한다. */}
      <aside className="rise-in relative z-10 flex max-h-[min(94dvh,960px)] w-full max-w-[820px] flex-col overflow-hidden rounded-t-[22px] bg-surface shadow-[0_28px_70px_rgba(16,28,54,.34)] sm:rounded-[24px]">
        {/* 머리글 — 이름·주소·요약 한 줄 (핵심 숫자 4칸은 스크롤 본문 맨 위) */}
        <div className="relative border-b border-[rgba(16,28,54,.06)] bg-gradient-to-br from-primary-soft via-surface to-bg px-5 pb-3.5 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate t-title tracking-tight text-ink sm:t-title">
                  {name}
                </h2>
                {loading && <RingLoader ink label="단지 정보 불러오는 중" />}
              </div>
              {address ? (
                <div className="mt-0.5 truncate t-sub text-text-2">{address}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="패널 닫기"
              /* [966] 표면 토큰 — 다크 모드에서 흰 원 위에 밝은 글자가 얹히지 않게 */
              className="relative ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface/70 t-body text-text-3 after:absolute after:-inset-1.5 after:content-['']"
            >
              ✕
            </button>
          </div>

          {/* [1006] 요약 한 줄 — 서버가 있는 숫자만 이어 만든 문장(facts.summaryLine).
              없는 항목은 문장에서 빠지므로 빈 괄호가 생기지 않는다. */}
          {summaryLine ? (
            <p className="mt-2 break-words t-sub font-semibold leading-snug text-ink">
              {summaryLine}
            </p>
          ) : data && facts && !loading ? (
            <p className="mt-2 t-sub text-text-3">
              요약할 숫자가 아직 없어요 — 최근 12개월 실거래·세대수·준공 중 하나라도 있으면 여기에 적혀요.
            </p>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5 sm:px-5">
          {/* [1006] 핵심 숫자 4칸 — 머리글이 아니라 스크롤 본문 맨 위에 둔다. 390px 에서 머리글이
              300px 을 넘으면 본문이 한 화면의 절반도 못 쓴다(하네스 실측). 값이 없으면 "—" 대신 이유.
              대표행이 없거나(not_found) 못 읽었으면 칸 자체를 그리지 않는다 — "—" 네 개는 정보가 아니다. */}
          {(loading || facts) && (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <KpiCell
                label="매매 중앙 · 12개월"
                value={tradeKpi.value}
                sub={tradeKpi.sub}
                muted={tradeKpi.muted}
                explain={
                  <Explain
                    title="매매 중앙값 · 12개월"
                    how={[
                      "최근 12개월 매매 실거래 중 거래가 가장 많은 면적대의 가운데 값(중앙값)이에요 — 한두 건의 특이 거래에 평균보다 덜 끌려가요.",
                      "그 면적대가 3건이 안 되면 면적을 섞은 전체 중앙값을, 전체도 3건이 안 되면 건수만 적어요.",
                    ]}
                    source="국토교통부 실거래가"
                  />
                }
              />
              <KpiCell label="전세 중앙 · 12개월" value={rentKpi.value} sub={rentKpi.sub} muted={rentKpi.muted} />
              <KpiCell
                label="세대수"
                value={
                  complex?.households
                    ? complex.households.toLocaleString("ko-KR")
                    : data && facts
                      ? shortGap("households", "자료 없음")
                      : loading
                        ? "…"
                        : "—"
                }
                sub={complex?.households ? (complex.building_count ? `${complex.building_count}동` : null) : null}
                muted={!complex?.households}
              />
              <KpiCell
                label="준공"
                value={complex?.build_year ? `${complex.build_year}년` : data && facts ? "자료 없음" : loading ? "…" : "—"}
                sub={complex?.build_year ? `${new Date().getFullYear() - complex.build_year}년차` : null}
                muted={!complex?.build_year}
              />
            </div>
          )}

          {chips.length > 0 && (
            <div className="-mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span
                  key={c}
                  className="chip-soft rounded-full chip-pad t-caption font-bold text-text-2"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {failed && (
            <div className="rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-xs text-text-2">
              단지 상세를 불러오지 못했어요. 전체 화면에서 다시 확인해 주세요.
            </div>
          )}

          {data?.mode === "not_found" && !failed && (
            <div className="rounded-xl bg-bg px-3.5 py-2.5 text-xs text-text-2">
              단지 마스터와 아직 연결되지 않았어요. 실거래·이야기는 아래를 참고해 주세요.
            </div>
          )}

          {focusNoteHref && (
            <div className="rounded-2xl border border-primary/25 bg-primary-soft/60 px-3.5 py-3">
              <div className="t-sub font-extrabold text-ink">임장노트에서 이어보기</div>
              <p className="mt-0.5 t-sub text-text-2">
                이 단지를 노트·AI와 함께 지도에서 비교하고 있어요.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={focusNoteHref}
                  className="rounded-xl bg-surface px-2.5 py-2 text-center t-sub font-extrabold text-primary shadow-sm"
                >
                  노트 보기
                </Link>
                <Link
                  href={analysisHref}
                  className="rounded-xl bg-primary px-2.5 py-2 text-center t-sub font-extrabold text-white"
                >
                  AI 정리 보기
                </Link>
              </div>
            </div>
          )}

          <PriceTrend tx={tx} name={name} />

          {/* 면적대 — 전체 */}
          {bands.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="면적대별 실거래" sub={`${bands.length}개 구간 · 국토부`} />
              {/* 면적대 간 격차를 배경 길이로 먼저 보인다 — 숫자 네 줄을
                  세로로 읽어야 "어느 평형이 비싼가"가 잡히던 자리. */}
              <div className="overflow-hidden rounded-[10px] bg-bg">
                {bands.map((b, i) => {
                  const maxLatest = Math.max(1, ...bands.map((x) => x.latestManwon || 0));
                  const w = Math.round(((b.latestManwon || 0) / maxLatest) * 100);
                  return (
                    <div
                      key={b.label}
                      className={`cell-bar row-hl flex items-center justify-between gap-2 px-3 py-2 t-sub text-primary ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                      style={{ ["--w" as string]: `${w}%` }}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-ink">{bandLabel(b.label)}</div>
                        <div className="t-caption text-text-3 tabular-nums">
                          {b.count}건 · 최근 {ymLabel(b.latestYm)}
                        </div>
                      </div>
                      {/* [1009 · C] 최근 = 한 건 실거래 → 반올림 없이("29억 6,750만"), 평균만 짧은 표기 */}
                      <div className="shrink-0 text-right">
                        <div className="t-num font-bold text-ink">
                          {b.latestManwon > 0 ? formatEokMan(b.latestManwon) : "—"}
                        </div>
                        <div className="t-caption text-text-3 tabular-nums">
                          평균 {manwonLabel(b.avgManwon) ?? "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 최근 실거래 14개월 */}
          {recent.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              {/* [1009 · C 리뷰] "최근 N개월"의 N 은 거래 있는 달 수였다 — 실제 계약월 범위로. 등락 기준은 줄마다 적는다 */}
              <SectionHead
                title="월별 실거래"
                sub={`${ymRangeShort(recent[recent.length - 1].yyyymm, recent[0].yyyymm)} · 합 ${dealSum}건 · 월평균(면적 혼합) · ${
                  recent.every((t) => {
                    const v = monthDeltaView(t.yyyymm, recentDeltas.get(t.yyyymm));
                    return v.basis === null || v.adjacent;
                  })
                    ? "전월 대비"
                    : "앞 거래 달 대비"
                }`}
              />
              <div className="max-h-[220px] overflow-y-auto rounded-xl bg-bg">
                {recent.map((t, i) => {
                  /* [1009 · C] 색·화살표는 <Delta>(상승 ▲ 빨강 · 하락 ▼ 파랑 · ±0.05% 보합). 예전엔 상승=파랑(text-primary)·
                     하락=빨강(text-danger)으로 뒤집혀 있었다. [1009 · C 리뷰] 기준은 앞 줄 — 전월이 아니면 기준 달을 적는다 */
                  const dv = monthDeltaView(t.yyyymm, recentDeltas.get(t.yyyymm));
                  const d = recentDeltas.get(t.yyyymm)?.pct ?? null;
                  return (
                    <div
                      key={`${t.yyyymm}-${i}`}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <span className="text-text-2 tabular-nums">
                        {ymLabel(t.yyyymm)}
                        <span className="ml-1.5 text-text-3">{t.deal_count}건</span>
                        {t.min_manwon && t.max_manwon && t.min_manwon !== t.max_manwon ? (
                          <span className="ml-1 hidden t-caption text-text-3 sm:inline">
                            {manwonLabel(t.min_manwon)}~{manwonLabel(t.max_manwon)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-extrabold text-ink tabular-nums">
                          {manwonLabel(t.avg_manwon) ?? "—"}
                        </span>
                        {d != null && dv.basis ? (
                          <span className="flex flex-col items-end">
                            <Delta
                              pct={d}
                              className="t-caption"
                              srContext={dv.adjacent ? "전월보다" : `${dv.basis.replace(/ 대비$/, "")}보다`}
                            />
                            {!dv.adjacent && (
                              <span className="t-caption leading-none text-text-3 tabular-nums">{dv.basis}</span>
                            )}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && recent.length === 0 && !failed && (
            <div className="rounded-xl bg-bg px-3.5 py-2.5 text-xs text-text-3">
              최근 실거래 데이터가 아직 없어요.
            </div>
          )}

          {/* [1006] 전월세 — 실거래의 62% 가 전월세인데 패널엔 없었다. 12개월 요약 + 가장 최근 달 +
              단지 전세가율(6개월, 표본 3건 이상일 때만). 신고 없음·실패는 각각 문장으로. */}
          {facts && (rent || rentFailed) && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead
                title="전월세 실거래"
                sub={rent ? `최근 ${rent.windowMonths}개월 · 국토부 신고` : "국토부 신고"}
              />
              {rentFailed ? (
                <p className="rounded-xl border border-warning-border bg-warning-soft px-3 py-2 t-sub text-warning">
                  전월세 실거래를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했어요.
                </p>
              ) : rent ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-bg px-3 py-2">
                      <div className="t-caption text-text-3">전세 보증금 중앙</div>
                      <div className="t-section text-ink tabular-nums">
                        {rent.jeonseCount > 0 ? (wonLabel(rent.jeonseMedianKrw) ?? "—") : "없음"}
                      </div>
                      <div className="t-caption text-text-3">
                        {rent.jeonseCount > 0
                          ? `${rent.jeonseCount}건${rent.jeonseCount < 3 ? " · 표본 적음" : ""}`
                          : "12개월 신고 없음"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-bg px-3 py-2">
                      <div className="t-caption text-text-3">월세 중앙 (보증금/월세)</div>
                      <div className="t-section text-ink tabular-nums">
                        {rent.wolseCount > 0
                          ? `${wonLabel(rent.wolseMedianDepositKrw) ?? "—"} / ${formatKrwWon(rent.wolseMedianMonthlyKrw)}`
                          : "없음"}
                      </div>
                      <div className="t-caption text-text-3">
                        {rent.wolseCount > 0
                          ? `${rent.wolseCount}건${rent.wolseCount < 3 ? " · 표본 적음" : ""}`
                          : "12개월 신고 없음"}
                      </div>
                    </div>
                  </div>
                  {rent.latest && (
                    <div className="mt-2 t-caption text-text-2">
                      가장 최근 {ymLabel(rent.latest.ym)} · 전세 {rent.latest.jeonseCount}건
                      {rent.latest.jeonseCount > 0 && rent.latest.jeonseMedianKrw != null
                        ? ` 중앙 ${wonLabel(rent.latest.jeonseMedianKrw)}`
                        : ""}
                      {" · "}월세 {rent.latest.wolseCount}건
                    </div>
                  )}
                  <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-0.5 t-sub font-bold text-ink">
                        단지 전세가율
                        <Explain
                          term="jeonse-garyul"
                          how={[
                            "최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 거래가 중앙값 × 100이에요.",
                            "전세·매매가 각각 3건 이상일 때만 계산해요. 면적은 가중하지 않아요.",
                          ]}
                          source="국토교통부 매매·전월세 실거래 신고"
                        />
                      </div>
                      <div className="mt-0.5 t-caption text-text-3">
                        {ratio
                          ? `최근 ${ratio.windowMonths}개월 전세 ${ratio.jeonseCount}건 중앙 ${wonLabel(ratio.jeonseMedianKrw)} ÷ 매매 ${ratio.tradeCount}건 중앙 ${wonLabel(ratio.tradeMedianKrw)} · 면적 가중 없음`
                          : (facts.jeonseRatioReason ?? "계산하지 않았어요")}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 tabular-nums ${
                        ratio ? "text-[19px] font-extrabold text-ink" : "t-sub font-bold text-text-3"
                      }`}
                    >
                      {ratio ? `${ratio.pct}%` : "미산출"}
                    </div>
                  </div>
                  <p className="mt-1.5 t-caption text-text-3">
                    최근 1~2개월은 신고 지연으로 적게 잡힐 수 있고, 갱신·신규 계약이 섞여 있어요.
                  </p>
                </>
              ) : null}
            </div>
          )}

          {/* 스펙 — 값 있는 줄만 그리고, 없는 항목은 이유별 한 줄로 */}
          {(specRows.length > 0 || specGapLines.length > 0) && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="단지 스펙" sub="국토부 실거래 · K-apt 대장 기준" />
              {specRows.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3">
                  {specRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-2 border-b border-divider py-2 t-body last:border-b-0"
                    >
                      <span className="shrink-0 text-text-3">{row.label}</span>
                      <span className="truncate text-right font-bold text-ink">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {specGapLines.length > 0 && (
                <div className={`flex flex-col gap-1 ${specRows.length > 0 ? "mt-2" : ""}`}>
                  {specGapLines.map((line) => (
                    <p key={line.note} className="rounded-xl bg-bg px-3 py-2 t-caption text-text-2">
                      <b className="text-ink">{line.labels}</b> — {line.note}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* [1006] 임장노트 — 공개 노트 수 + 최신 1건(제목·판단) + 쓰기. 0건이면 정직한 빈 상태. */}
          {facts && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead
                title="임장노트"
                sub={
                  notesFailed
                    ? "지금 못 읽음"
                    : notes && notes.count > 0
                      ? `공개 ${notes.count.toLocaleString("ko-KR")}건`
                      : "아직 없음"
                }
                right={
                  <Link
                    href={noteHref}
                    className="inline-flex min-h-[40px] shrink-0 items-center rounded-xl bg-primary px-3 t-sub font-extrabold text-white"
                  >
                    이 단지 임장노트 쓰기
                  </Link>
                }
              />
              {notesFailed ? (
                <p className="rounded-xl border border-warning-border bg-warning-soft px-3 py-2 t-sub text-warning">
                  임장노트를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했어요.
                </p>
              ) : notes?.latest ? (
                <Link
                  href={`/notes/${encodeURIComponent(notes.latest.id)}`}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 transition-colors hover:bg-primary-soft/60"
                >
                  <div className="min-w-0">
                    <div className="truncate t-sub font-bold text-ink">{notes.latest.title}</div>
                    <div className="mt-0.5 t-caption text-text-3">
                      최신 노트{notes.latest.visitDate ? ` · 방문 ${notes.latest.visitDate}` : ""}
                      {notes.count > 1 ? ` · 외 ${(notes.count - 1).toLocaleString("ko-KR")}건은 전체 화면에서` : ""}
                    </div>
                  </div>
                  {notes.latest.decision ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 t-caption font-extrabold ${DECISION_CHIP[notes.latest.decision.choice]}`}
                    >
                      {notes.latest.decision.label}
                    </span>
                  ) : (
                    <span className="shrink-0 t-caption text-text-3">판단 미기록</span>
                  )}
                </Link>
              ) : (
                <p className="rounded-xl bg-bg px-3 py-2 t-sub text-text-2">
                  아직 이 단지 공개 임장노트가 없어요. 다녀온 기록이 있다면 첫 노트가 돼요.
                </p>
              )}
            </div>
          )}

          {/* 지역 대비 */}
          {region && (
            <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
              {/* [1009 · C] 상승=파랑·하락=빨강으로 뒤집혀 있던 두 숫자(평균 대비·구 변동)를 <Delta> 로, 기준을 적는다 */}
              <SectionHead
                title="이 동네 대비"
                sub={`${region.district} · ㎡당 · ${region.period ? ymLabel(region.period) : "최근"} 기준`}
                right={
                  <span className="inline-flex items-center gap-0.5">
                    <Delta pct={region.deltaPct} className="t-title" srContext={`${region.district} 평균보다`} flatLabel="비슷" />
                    <Explain
                      term="pyeongdanga"
                      title="이 동네 대비(㎡당)"
                      how={[
                        "면적이 다른 집끼리 견주려고 평당가 대신 ㎡당 가격을 써요(㎡당 × 3.3058 = 평당).",
                        "이 단지: 최근 매매 60건(전용면적이 있는 거래)마다 거래금액 ÷ 전용면적을 구해 평균했어요.",
                        `${region.district} 평균: 한국부동산원 ${region.period ? ymLabel(region.period) : "최근"} 아파트 ㎡당 평균 매매가격이에요.`,
                        `차이 = (이 단지 − ${region.district} 평균) ÷ ${region.district} 평균 × 100. 층·향·연식은 반영하지 않아요.`,
                      ]}
                      source="국토교통부 실거래가 · 한국부동산원"
                    />
                  </span>
                }
              />
              <p className="-mt-1 mb-2 t-caption text-text-3">{region.district} 평균 대비</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="t-caption text-text-3">이 단지</div>
                  <div className="t-section text-ink tabular-nums">
                    {region.complexPerM2Manwon.toLocaleString("ko-KR")}
                    <span className="t-caption font-bold text-text-3">만/㎡</span>
                  </div>
                </div>
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="t-caption text-text-3">{region.district} 평균</div>
                  <div className="t-section text-ink tabular-nums">
                    {region.districtPerM2Manwon.toLocaleString("ko-KR")}
                    <span className="t-caption font-bold text-text-3">만/㎡</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-caption text-text-3">
                {region.saleChangePct != null && (
                  <span className="inline-flex items-center gap-x-1">
                    {region.district} 매매가격
                    <Delta pct={region.saleChangePct} srContext="전월보다" />
                    전월 대비
                  </span>
                )}
                {region.jeonseRatio != null && (
                  <span>
                    {region.district} 전세가율 <b className="text-text-2">{region.jeonseRatio}%</b>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 후기 */}
          {reviews && reviews.count > 0 && (
            <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
              <SectionHead title="거주민 후기" sub={`${reviews.count}건 평균`} />
              <div className="grid grid-cols-5 gap-1.5">
                {REVIEW_LABELS.map(({ key, label }) => {
                  const v = reviews[key];
                  const pct = v != null ? Math.min(100, Math.round((v / 5) * 100)) : 0;
                  return (
                    <div key={key} className="rounded-xl bg-bg px-1 py-2 text-center">
                      <div className="t-caption text-text-3">{label}</div>
                      <div className="t-section text-ink">
                        {v != null ? v : "—"}
                      </div>
                      <div className="mx-auto mt-1 h-1 w-[80%] overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 이야기 6건 */}
          {posts.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="단지 이야기" sub={`${posts.length}건 · 공개 글`} />
              <div className="flex flex-col gap-1">
                {posts.slice(0, 6).map((p, i) => (
                  <div
                    key={p.id || `${p.title}-${i}`}
                    className="rounded-xl bg-bg px-3 py-2"
                  >
                    <div className="truncate t-sub font-bold text-ink">{p.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 t-caption text-text-3">
                      {postDateLabel(p.created_at) && <span>{postDateLabel(p.created_at)}</span>}
                      {p.district && <span>{p.district}</span>}
                      {p.like_count != null && <span>공감 {p.like_count}</span>}
                      {p.comment_count != null && p.comment_count > 0 && (
                        <span>댓글 {p.comment_count}</span>
                      )}
                      {p.view_count != null && p.view_count > 0 && (
                        <span>조회 {p.view_count}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 부가 섹션 조회 실패 고지 — 섹션이 안 보이는 이유가 "없어서"가
              아니라 "지금 못 읽어서"일 때, 그 사실을 말한다. */}
          {failedSections.length > 0 && (
            <div className="rounded-2xl border border-warning-border bg-warning-soft px-3.5 py-2.5 t-sub text-warning">
              {failedSections.join(" · ")} 정보를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했습니다.
            </div>
          )}

          {/* 인근 단지 */}
          {nearby.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead
                title={`${complex?.district || "근처"} 다른 단지`}
                sub="같은 지역 비교"
              />
              <div className="grid grid-cols-2 gap-1.5">
                {nearby.map((n) => (
                  <Link
                    key={n.id}
                    href={`/complex/${encodeURIComponent(n.id)}`}
                    className="rounded-xl border border-line bg-bg px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <div className="truncate t-sub font-extrabold text-ink">{n.name}</div>
                    <div className="mt-0.5 truncate t-caption text-text-3">
                      {n.meta || "단지 정보"}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <WatchlistToggle complexId={complexId} complexName={name} />

          <div className="grid grid-cols-2 gap-2">
            <Link href={noteHref} className="btn-secondary rounded-xl p-[11px] text-center text-xs">
              임장노트 쓰기
            </Link>
            <Link
              href={analysisHref}
              className="btn-secondary rounded-xl p-[11px] text-center text-xs"
            >
              AI 분석
            </Link>
          </div>

          {/* [3차] 지도 → 지역 허브 연결 — 단지에서 그 동네 시장 전체(지수·거래량·
              입주·시장 흐름 읽기)로 이어지는 유일한 다리. cityDistrict 가 카탈로그와
              매칭될 때만 그린다(없는 링크를 만들지 않는다). */}
          {(() => {
            const rid = cityDistrict ? regionIdForName(cityDistrict) : null;
            if (!rid) return null;
            return (
              <Link
                href={`/region/${rid}`}
                className="btn-secondary block rounded-xl p-[11px] text-center text-xs"
              >
                {cityDistrict} 시장 전체 보기 — 지수·거래량·입주
              </Link>
            );
          })()}

          {fetchedLabel && (
            <p className="text-center t-caption text-text-3">{fetchedLabel} · 실거래·공공데이터</p>
          )}
        </div>

        {/* 이 줄은 시트 맨 아래에 고정으로 붙는 CTA 바다. 모바일에서 시트가
            화면 바닥에 닿으므로 아래 여백에 safe-area 를 더한다(점검 337).
            안 더하면 standalone 에서 12px 만 남아 버튼 아래쪽이 홈 인디케이터
            자리에 들어간다 — 탭 모드에서는 인셋이 0이라 아무 일도 안 일어나
            조용히 지나가는 종류의 버그다. sm 이상은 시트가 가운데 뜬다. */}
        <div className="border-t border-[rgba(16,28,54,.06)] bg-surface px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Link
            href={detailHref}
            className="btn-primary btn-cta block rounded-xl p-3 text-center t-body font-extrabold text-white"
          >
            전체 화면으로 더 자세히 보기 ›
          </Link>
        </div>
      </aside>
    </div>
  );
}
