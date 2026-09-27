"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { RingLoader } from "@/app/components/ui/BrandLoader";

import { useEffect, useMemo, useRef, useState } from "react";
/* [v4 · 부품 표] 목록 행은 단지 허브의 승인 시안 조각을 그대로 쓴다(새 행 부품을 만들지 않는다 — JS 없는 순수 조각) */
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
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

   [v4 · 한 화면 한 가지] 머리(이름 + 사실 한 줄: 준공·세대수·주소) → 주인공 1개(매매 중앙값 t-display) →
   요약 행(전세·월세·전세가율·동네 대비·임장노트·후기·매물 — SummaryRow) → 추이 → 면적대·월별·이야기·인근(구분선 행) →
   행동(테두리) → 맨 끝 <details> 데이터 출처(출처·신고 지연·단지 정보·빈 자료) · 바닥 채움 파랑 "이 단지 보기" 하나.
   카드 안 카드·옅은 상자·배지·설명 문장은 지웠다. 조회·계산은 그대로다.
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
  /* [v4 · 규칙 5] 테두리 카드 → 섹션(제목 한 줄 + 오른쪽 사실) · 안내 상자 → 캡션 한 줄 */
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-0.5">
        <h3 className="t-section text-ink">실거래가 추이</h3>
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
        <p className="t-caption text-text-2">
          최근 달({lastFew.ym.slice(2, 4)}.{lastFew.ym.slice(4, 6)}) 거래 {lastFew.n}건 · 값이 크게 흔들림
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
        footnote="국토교통부 실거래가(해제 제외) · 월평균 · 면적 혼합 · 속 빈 점 = 거래 1~2건"
      />
    </section>
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
      /* [v4] 반경 12 → 8 · 12px 글자 → t-sub · 켜짐 = 한지 + 남색(그대로) · 문구 한 줄로 짧게 */
      className={`press flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border p-[11px] t-sub font-bold transition-colors disabled:opacity-60 ${
        watching
          ? "border-brand-hanji-ink bg-brand-hanji text-brand-hanji-ink"
          : "border-line-strong bg-surface text-text-1"
      }`}
    >
      {/* [1009 · C] 하트 색이 "안 담음 = 빨강(text-danger)"이었다 — danger 는 오류 색이다. 담긴 상태만 채운 하트 */}
      <span key={pop} className={`inline-flex ${pop > 0 ? "njn-pop-once" : ""}`} aria-hidden="true">
        <Icon name="heart" size={14} className={watching ? "fill-current" : ""} />
      </span>
      {busy ? "저장 중…" : watching ? "관심 단지 · 알림 받는 중" : "관심 단지 담기 · 실거래 알림"}
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

/** [v4] 머리 사실 줄이 이미 말하는 스펙 칸 */
const HEAD_SPEC_LABELS = new Set(["세대수", "준공", "지역"]);

/* [v4 · 규칙 5·6] 판단 칩 색표(DECISION_CHIP)·섹션 머리(SectionHead)·핵심 숫자 칸(KpiCell)은 지웠다 —
   머리 = 제목 한 줄 + 사실 한 줄, 주인공 = 매매 중앙값 하나(t-display), 나머지는 단지 허브와 같은 목록 행(SummaryRow). */

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

  /* ── [1006] 핵심 숫자 ─────────────────────────────────────────────
     매매 중앙(12개월) / 전세 중앙(12개월). 없는 값은 "—" 가 아니라 **왜 없는지**(신고 없음·조회 실패)를 쓴다.
     [v4] 세대수·준공 칸은 머리 사실 줄로 올렸다(없으면 그 토막을 뺀다 — 빠진 이유는 맨 끝 "데이터 출처"의 비어 있는 자료). */

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
    return { value: `${tradeSummary.count}건`, sub: "표본 3건 미만 · 중앙값 생략", muted: true };
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
      return { value: `전세 ${rent.jeonseCount}건`, sub: "표본 3건 미만 · 중앙값 생략", muted: true };
    }
    return {
      value: "12개월 전세 없음",
      sub: rent.wolseCount > 0 ? `월세 ${rent.wolseCount}건` : null,
      muted: true,
    };
  })();

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
  ]
    /* [v4 · 규칙 8] 머리 사실 줄에 이미 있는 칸(세대수·준공·지역)은 "데이터 출처" 의 단지 정보에서 되풀이하지 않는다 */
    .filter((v): v is { label: string; value: string } => Boolean(v))
    .filter((r) => !HEAD_SPEC_LABELS.has(r.label));

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

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 숫자·장소만(있는 값만). 예전 머리의 요약 문장(summaryLine — 아래 숫자를 한 번 더
     이어 적은 문장)과 "요약할 숫자가 아직 없어요 — …" 안내는 지웠다(규칙 3·8). */
  const headFacts = [
    complex?.build_year ? `${complex.build_year}년 준공` : null,
    complex?.households ? `${complex.households.toLocaleString("ko-KR")}세대` : null,
    address || null,
  ].filter(Boolean);
  const regionHubId = cityDistrict ? regionIdForName(cityDistrict) : null;
  const reviewLine =
    reviews && reviews.count > 0
      ? REVIEW_LABELS.filter(({ key }) => reviews[key] != null)
          .map(({ key, label }) => `${label} ${reviews[key]}`)
          .join(" · ")
      : "";

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
      {/* [1012 · 규칙 2] 70px 짜리 임의 그림자 → --shadow-lg(시트·모달 허용, 알파 12%)
          [v4 · 규칙 12] 한 줄로 읽히게 폭 820 → 640 */}
      <aside className="lq-scope rise-in relative z-10 flex max-h-[min(94dvh,960px)] w-full max-w-[640px] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[var(--shadow-lg)] sm:rounded-3xl">
        {/* 머리 — 이름 한 줄 + 사실 한 줄(준공 · 세대수 · 주소). [1012 · 규칙 3] 그라데이션 없음 · 1px --line */}
        <div className="border-b border-line bg-surface px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate t-title text-ink">{name}</h2>
                {loading && <RingLoader ink label="단지 정보 불러오는 중" />}
              </div>
              {headFacts.length > 0 ? (
                <p className="mt-0.5 truncate t-sub text-text-3">{headFacts.join(" · ")}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="패널 닫기"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center t-body text-text-3"
            >
              {/* [1012 · 규칙 4] ✕ 활자 → 선 아이콘 x */}
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
          {/* [v4 · 규칙 2] 주인공 — 매매 중앙값 하나(t-display) + 사실 한 줄. 예전 핵심 숫자 4칸(매매·전세·세대수·준공)은
              매매만 여기 남기고 전세는 아래 행, 세대수·준공은 머리 사실 줄로 갔다.
              대표행이 없거나(not_found) 못 읽었으면 그리지 않는다 — "—" 는 정보가 아니다. */}
          {(loading || facts) && (
            <div>
              <div className={tradeKpi.muted ? "t-section text-ink" : "t-display text-ink tabular-nums"}>
                {tradeKpi.value}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-1 t-sub text-text-3">
                <span>
                  매매 중앙 · 12개월{tradeKpi.sub ? ` · ${tradeKpi.sub}` : ""} · 국토교통부
                </span>
                <Explain
                  title="매매 중앙값 · 12개월"
                  how={[
                    "최근 12개월 매매 실거래 중 거래가 가장 많은 면적대의 가운데 값(중앙값)이에요 — 한두 건의 특이 거래에 평균보다 덜 끌려가요.",
                    "그 면적대가 3건이 안 되면 면적을 섞은 전체 중앙값을, 전체도 3건이 안 되면 건수만 적어요.",
                  ]}
                  source="국토교통부 실거래가"
                />
              </p>
            </div>
          )}

          {failed && (
            <p role="status" className="t-sub font-bold text-ink">
              단지 상세 조회 실패 · 아래 &ldquo;이 단지 보기&rdquo;로 다시 열기
            </p>
          )}

          {data?.mode === "not_found" && !failed && (
            <p className="t-sub text-text-2">단지 대장 미연결 · 실거래·이야기만 표시</p>
          )}

          {/* [v4] 이어보기 — 파란 옅은 상자 + 설명 문장 + 채움 파랑 "AI 정리 보기" → 목록 행 두 줄 */}
          {focusNoteHref && (
            <section>
              <h3 className="t-section text-ink">임장노트에서 이어보기</h3>
              <ul data-tone="hanji" className="mt-1 divide-y divide-line">
                <SummaryRow label="노트 보기" sub="이 단지로 들어온 노트" href={focusNoteHref} />
                <SummaryRow label="AI 정리 보기" sub="그 노트의 AI 정리" href={analysisHref} />
              </ul>
            </section>
          )}

          {/* [v4 · 규칙 5·8] 요약 행 — 전월세 카드(전세·월세 상자 + 전세가율 상자) · 이 동네 대비 카드 · 후기 5칸 격자 ·
              임장노트 카드 · 매물/이야기 배지를 한 목록으로. 같은 숫자(전세 중앙)가 두 번(핵심 칸 + 전월세 카드) 나오던 것을 한 번으로. */}
          {(facts || region || (reviews && reviews.count > 0) || (listingCount != null && listingCount > 0)) && (
            <ul data-tone="blue" className="-mt-2 divide-y divide-line">
              {facts &&
                (rentKpi.muted ? (
                  <SummaryRow
                    label="전세 · 12개월"
                    sub={[rentFailed ? "조회 실패(없음 아님)" : rentKpi.value, rentKpi.sub].filter(Boolean).join(" · ")}
                  />
                ) : (
                  <SummaryRow label="전세 중앙 · 12개월" sub={rentKpi.sub ?? undefined} value={rentKpi.value} />
                ))}
              {facts && rent && rent.wolseCount > 0 && (
                <SummaryRow
                  label="월세 중앙 · 보증금/월"
                  sub={`${rent.wolseCount}건${rent.wolseCount < 3 ? " · 표본 적음" : ""}`}
                  value={`${wonLabel(rent.wolseMedianDepositKrw) ?? "—"}/${formatKrwWon(rent.wolseMedianMonthlyKrw)}`}
                />
              )}
              {facts && (rent || rentFailed) && (
                <SummaryRow
                  label={
                    <span className="inline-flex items-center gap-0.5">
                      단지 전세가율
                      <Explain
                        term="jeonse-garyul"
                        how={[
                          "최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 거래가 중앙값 × 100이에요.",
                          "전세·매매가 각각 3건 이상일 때만 계산해요. 면적은 가중하지 않아요.",
                        ]}
                        source="국토교통부 매매·전월세 실거래 신고"
                      />
                    </span>
                  }
                  sub={
                    ratio
                      ? `최근 ${ratio.windowMonths}개월 · 전세 ${ratio.jeonseCount}건 ÷ 매매 ${ratio.tradeCount}건 중앙`
                      : (facts.jeonseRatioReason ?? "계산 안 함")
                  }
                  value={ratio ? `${ratio.pct}%` : undefined}
                />
              )}
              {region && (
                /* [1009 · C] 상승=파랑·하락=빨강으로 뒤집혀 있던 두 숫자(평균 대비·구 변동)를 <Delta> 로, 기준을 적는다 */
                <SummaryRow
                  label={
                    <span className="inline-flex items-center gap-0.5">
                      {region.district} 대비 ㎡당
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
                  sub={`이 단지 ${region.complexPerM2Manwon.toLocaleString("ko-KR")}만 · 평균 ${region.districtPerM2Manwon.toLocaleString("ko-KR")}만 · ${
                    region.period ? ymLabel(region.period) : "최근"
                  }`}
                  value={<Delta pct={region.deltaPct} srContext={`${region.district} 평균보다`} flatLabel="비슷" />}
                />
              )}
              {region && region.saleChangePct != null && (
                <SummaryRow
                  label={`${region.district} 매매가격`}
                  sub={`전월 대비${region.jeonseRatio != null ? ` · 전세가율 ${region.jeonseRatio}%` : ""} · 한국부동산원`}
                  value={<Delta pct={region.saleChangePct} srContext="전월보다" />}
                />
              )}
              {region && region.saleChangePct == null && region.jeonseRatio != null && (
                <SummaryRow label={`${region.district} 전세가율`} sub="한국부동산원" value={`${region.jeonseRatio}%`} />
              )}
              {facts && (
                /* [1006] 임장노트 — 공개 노트 수 + 최신 1건(제목·판단). 0건이면 정직한 빈 상태.
                   [v4] 판단 색 칩 → 보조 줄 글자 · 카드 머리의 채움 파랑 "이 단지 임장노트 쓰기" → 아래 행동 줄(테두리) 하나로 */
                <SummaryRow
                  label="임장노트"
                  sub={
                    notesFailed
                      ? "조회 실패(없음 아님)"
                      : notes?.latest
                        ? [
                            notes.latest.title,
                            notes.latest.visitDate ? `방문 ${notes.latest.visitDate}` : null,
                            notes.latest.decision ? notes.latest.decision.label : "판단 미기록",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "공개 노트 없음"
                  }
                  value={!notesFailed && notes && notes.count > 0 ? `${notes.count.toLocaleString("ko-KR")}건` : undefined}
                  href={!notesFailed && notes?.latest ? `/notes/${encodeURIComponent(notes.latest.id)}` : undefined}
                />
              )}
              {reviews && reviews.count > 0 && (
                <SummaryRow label="거주민 후기 · 5점" sub={reviewLine || undefined} value={`${reviews.count}건`} />
              )}
              {listingCount != null && listingCount > 0 && <SummaryRow label="등록 매물" value={`${listingCount}건`} />}
            </ul>
          )}

          <PriceTrend tx={tx} name={name} />

          {/* 면적대 — 전체. [v4] 배경 길이 막대(cell-bar)·옅은 상자 → 구분선 행(오른쪽 = 최근 한 건) */}
          {bands.length > 0 && (
            <section>
              <h3 className="t-section text-ink">
                면적대별 실거래 <span className="t-sub font-medium text-text-3">{bands.length}개 구간</span>
              </h3>
              <ul data-tone="blue" className="mt-1 divide-y divide-line">
                {bands.map((b) => (
                  <li key={b.label} className="flex min-h-14 items-center justify-between gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block t-body font-bold text-ink">{bandLabel(b.label)}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3 tabular-nums">
                        {b.count}건 · 최근 {ymLabel(b.latestYm)} · 평균 {manwonLabel(b.avgManwon) ?? "—"}
                      </span>
                    </span>
                    {/* [1009 · C] 최근 = 한 건 실거래 → 반올림 없이("29억 6,750만"), 평균만 짧은 표기 */}
                    <span className="shrink-0 t-body t-num text-ink">
                      {b.latestManwon > 0 ? formatEokMan(b.latestManwon) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 t-caption text-text-3">국토교통부 실거래가 · 오른쪽 = 최근 한 건</p>
            </section>
          )}

          {/* 최근 실거래 14개월 */}
          {recent.length > 0 && (
            <section>
              {/* [1009 · C 리뷰] "최근 N개월"의 N 은 거래 있는 달 수였다 — 실제 계약월 범위로. 등락 기준은 줄마다 적는다 */}
              <h3 className="t-section text-ink">월별 실거래</h3>
              <p className="mt-0.5 t-sub text-text-3">
                {ymRangeShort(recent[recent.length - 1].yyyymm, recent[0].yyyymm)} · 합 {dealSum}건 · 월평균(면적 혼합) ·{" "}
                {recent.every((t) => {
                  const v = monthDeltaView(t.yyyymm, recentDeltas.get(t.yyyymm));
                  return v.basis === null || v.adjacent;
                })
                  ? "전월 대비"
                  : "앞 거래 달 대비"}
              </p>
              <ul data-tone="mint" className="mt-1 max-h-[280px] divide-y divide-line overflow-y-auto">
                {recent.map((t, i) => {
                  /* [1009 · C] 색·화살표는 <Delta>(상승 ▲ 빨강 · 하락 ▼ 파랑 · ±0.05% 보합). 예전엔 상승=파랑(text-primary)·
                     하락=빨강(text-danger)으로 뒤집혀 있었다. [1009 · C 리뷰] 기준은 앞 줄 — 전월이 아니면 기준 달을 적는다 */
                  const dv = monthDeltaView(t.yyyymm, recentDeltas.get(t.yyyymm));
                  const d = recentDeltas.get(t.yyyymm)?.pct ?? null;
                  return (
                    <li key={`${t.yyyymm}-${i}`} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 t-sub text-text-2 tabular-nums">
                        {ymLabel(t.yyyymm)}
                        <span className="ml-1.5 text-text-3">{t.deal_count}건</span>
                        {t.min_manwon && t.max_manwon && t.min_manwon !== t.max_manwon ? (
                          <span className="ml-1 hidden t-caption text-text-3 sm:inline">
                            {manwonLabel(t.min_manwon)}~{manwonLabel(t.max_manwon)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="t-body t-num text-ink">{manwonLabel(t.avg_manwon) ?? "—"}</span>
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
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!loading && recent.length === 0 && !failed && <p className="t-sub text-text-2">최근 실거래 없음</p>}

          {/* 이야기 6건 — [v4] 옅은 상자 카드 → 구분선 행(제목 + 사실 한 줄) */}
          {posts.length > 0 && (
            <section>
              <h3 className="t-section text-ink">
                단지 이야기 <span className="t-sub font-medium text-text-3">{posts.length}건</span>
              </h3>
              <ul data-tone="hanji" className="mt-1 divide-y divide-line">
                {posts.slice(0, 6).map((p, i) => {
                  const meta = [
                    postDateLabel(p.created_at),
                    p.district || null,
                    p.like_count != null ? `공감 ${p.like_count}` : null,
                    p.comment_count != null && p.comment_count > 0 ? `댓글 ${p.comment_count}` : null,
                    p.view_count != null && p.view_count > 0 ? `조회 ${p.view_count}` : null,
                  ].filter(Boolean);
                  return (
                    <li key={p.id || `${p.title}-${i}`} className="py-3">
                      <span className="block truncate t-body font-bold text-ink">{p.title}</span>
                      {meta.length > 0 && (
                        <span className="mt-0.5 block truncate t-sub text-text-3">{meta.join(" · ")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* 부가 섹션 조회 실패 고지 — 섹션이 안 보이는 이유가 "없어서"가
              아니라 "지금 못 읽어서"일 때, 그 사실을 말한다. [v4] 노란 상자 → 한 줄 */}
          {failedSections.length > 0 && (
            <p role="status" className="t-sub font-bold text-warning">
              {failedSections.join(" · ")} 조회 실패(없음 아님)
            </p>
          )}

          {/* 인근 단지 — [v4] 2열 카드 격자 → 구분선 행(단지 허브 "다른 단지"와 같은 SummaryRow) */}
          {nearby.length > 0 && (
            <section>
              <h3 className="t-section text-ink">
                {`${complex?.district || "근처"} 다른 단지`}{" "}
                <span className="t-sub font-medium text-text-3">{nearby.length}곳</span>
              </h3>
              <ul data-tone="blue" className="mt-1 divide-y divide-line">
                {nearby.map((n) => (
                  <SummaryRow
                    key={n.id}
                    label={n.name}
                    sub={n.meta || undefined}
                    href={`/complex/${encodeURIComponent(n.id)}`}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* 행동 — 관심 · 노트 쓰기 · AI 분석(전부 테두리. 채움 파랑은 맨 아래 "이 단지 보기" 하나) */}
          <div className="flex flex-col gap-2">
            <WatchlistToggle complexId={complexId} complexName={name} />
            <div className="grid grid-cols-2 gap-2">
              <Link href={noteHref} className="btn-secondary rounded-lg p-3 text-center text-[13px] no-underline">
                임장노트 쓰기
              </Link>
              <Link href={analysisHref} className="btn-secondary rounded-lg p-3 text-center text-[13px] no-underline">
                AI 분석
              </Link>
            </div>
          </div>

          {/* [3차] 지도 → 지역 허브 연결 — 단지에서 그 동네 시장 전체(지수·거래량·
              입주·시장 흐름 읽기)로 이어지는 유일한 다리. cityDistrict 가 카탈로그와
              매칭될 때만 그린다(없는 링크를 만들지 않는다). [v4] 테두리 버튼 → 목록 행 */}
          {regionHubId && (
            <ul data-tone="hanji" className="-mt-2 divide-y divide-line">
              <SummaryRow label={`${cityDistrict} 시장`} sub="지수 · 거래량 · 입주" href={`/region/${regionHubId}`} />
            </ul>
          )}

          {/* [v4 · 규칙 3] 맨 끝 <details> "데이터 출처" 하나(단지 허브 ComplexDataSources 와 같은 모양) —
              갱신 시각 캡션 · 신고 지연 안내 · 단지 스펙 격자 · 빠진 스펙의 이유 줄을 여기에 접었다. */}
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              데이터 출처
              <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-4 pb-3 pt-1">
              <div>
                <h4 className="t-sub font-bold text-text-2">출처</h4>
                <p className="mt-1 t-caption text-text-3">
                  국토교통부 실거래가(매매·전월세) · K-apt 단지 대장{region ? " · 한국부동산원" : ""}
                  {fetchedLabel ? ` · ${fetchedLabel}` : ""}
                </p>
                <p className="mt-0.5 t-caption text-text-3">
                  최근 1~2개월은 신고 지연(계약 후 30일)으로 적게 잡힐 수 있음 · 전월세는 갱신·신규 계약 섞임
                </p>
              </div>
              {specRows.length > 0 && (
                <div>
                  <h4 className="t-sub font-bold text-text-2">단지 정보</h4>
                  <dl data-tone="blue" className="mt-1 divide-y divide-line">
                    {specRows.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
                        <dt className="shrink-0 t-sub text-text-3">{row.label}</dt>
                        <dd className="min-w-0 break-words text-right t-sub text-ink tabular-nums">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {/* [1006] 없는 스펙은 이유별 한 줄 — 대장 미연결과 대장엔 있는데 값이 빈 것은 다른 사실이다 */}
              {specGapLines.length > 0 && (
                <div>
                  <h4 className="t-sub font-bold text-text-2">비어 있는 자료</h4>
                  <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
                    {specGapLines.map((line) => (
                      <li key={line.note} className="t-caption leading-[1.6] text-text-3">
                        <span className="font-bold text-text-2">{line.labels}</span> — {line.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* 이 줄은 시트 맨 아래에 고정으로 붙는 CTA 바다. 모바일에서 시트가
            화면 바닥에 닿으므로 아래 여백에 safe-area 를 더한다(점검 337).
            안 더하면 standalone 에서 12px 만 남아 버튼 아래쪽이 홈 인디케이터
            자리에 들어간다 — 탭 모드에서는 인셋이 0이라 아무 일도 안 일어나
            조용히 지나가는 종류의 버그다. sm 이상은 시트가 가운데 뜬다. */}
        <div className="border-t border-line bg-surface px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Link
            href={detailHref}
            className="btn-primary block rounded-lg p-3 text-center t-body no-underline"
          >
            {/* [1012 · 규칙 5] "더 자세히 보기" → 동사 + 구체 대상 · [v4 · 규칙 2] 이 판의 채움 파랑 하나, 한 줄로 끝나게 */}
            이 단지 보기
          </Link>
        </div>
      </aside>
    </div>
  );
}
