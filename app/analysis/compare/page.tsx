"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";
import { useMapPick } from "../use-map-pick";
import {
  addToCompareTray,
  COMPARE_TRAY_MAX,
  fetchServerCompareList,
  listCompareTray,
  mergeServerCompareTray,
  removeCompareItemFromServer,
  removeFromCompareTray,
  subscribeCompareTray,
  type CompareTrayItem,
} from "@/lib/newui/compare-tray";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { hasSession } from "@/lib/client/has-session";
import { Radar } from "@/app/components/viz/Radar";
import { SkTable } from "@/app/components/ui/Skeleton";
import { ActionButton } from "@/app/components/ui/ActionButton";
import { Explain } from "@/app/components/explain/Explain";
import { useToast } from "@/app/components/toast/ToastProvider";
import { formatKrwManwon, formatKrwWon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";
import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, deltaDir } from "@/lib/format/delta";
/* [1008 · Q] 내 기준 순위 — 표의 값만으로(추가 조회 없음) */
import { MyCriteriaRank } from "./MyCriteriaRank";

/* ---------- 단지 선택기 → 비교 트레이에 담기 (검색·지도·딥링크 공용) ---------- */

/* 항목별 최고/최저를 표에서 배지로 알린다 — 숫자 5열을 눈으로 비교하던 자리.
   동점이면 둘 다 표시한다(임의로 하나를 고르면 그건 사실이 아니다). */
function bestOf<T>(items: readonly T[], pick: (x: T) => number | null, dir: "max" | "min"): Set<number> {
  const vals = items.map(pick);
  const usable = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (usable.length < 2) return new Set();
  const target = dir === "max" ? Math.max(...usable) : Math.min(...usable);
  const out = new Set<number>();
  vals.forEach((v, i) => {
    if (v !== null && v === target) out.add(i);
  });
  return out;
}

function WinBadge({ label }: { label: string }) {
  return (
    <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-extrabold text-success">
      {label}
    </span>
  );
}

function ComparePickerSection() {
  const { showToast } = useToast();

  /* [975] 담기는 검색·지도 두 길이 같은 함수로 모인다 — 지도에서 고른 단지도
     똑같이 트레이에 담기고 같은 안내 문구가 뜬다.
     [1009 · A] 결과는 토스트로(원인 + 해결) — 예전엔 검색창 아래 글자 한 줄이라 지도 서랍을 닫는 순간 놓쳤다. */
  const add = useCallback(
    (c: PickedComplex) => {
      const r = addToCompareTray({
        id: c.id,
        name: c.name,
        region: c.region || c.regionLabel || undefined,
      });
      showToast(
        r.ok
          ? `${c.name}을(를) 비교함에 담았어요`
          : r.reason === "full"
            ? `비교함이 가득 찼어요 · 최대 ${COMPARE_TRAY_MAX}곳이에요`
            : "비교함을 쓸 수 없어요 · 저장 공간이 막혀 있어요",
      );
    },
    [showToast],
  );
  const { openMap, mapNode } = useMapPick(add, "후보 단지 비교");

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      {mapNode}
      <div className="t-body font-extrabold text-ink">비교할 단지 담기</div>
      <ComplexPicker
        label="검색해서 최대 5개까지 담기"
        placeholder="단지명으로 검색 (예: 공작아파트)"
        clearOnSelect
        showChip={false}
        onSelect={add}
        /* 이름을 모르는 후보는 지도에서 눌러 담는다 */
        onMapClick={openMap}
      />
    </div>
  );
}

/* ---------- 내가 담은 후보 (localStorage 비교 트레이 + #46 서버 병합) ---------- */

/* [1009 · A · 리뷰] 되돌리기 = 다시 담기. 서버 관심 단지 목록(로그인)에 다시 넣고 **결과를 확인해** 사실대로 말한다.
   관심 단지 한도(요금제)에 걸리면 비교함에만 돌아온다. 지웠다 다시 넣은 관심 단지는 가격 알림 값이 비어 있다. */
async function restoreToServer(item: { id: string; name: string }): Promise<"ok" | "quota" | "fail"> {
  try {
    const res = await fetch("/api/me/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: item.id, complexName: item.name }),
    });
    if (res.ok) return "ok";
    return res.status === 403 ? "quota" : "fail";
  } catch {
    return "fail";
  }
}

function CompareTraySection() {
  const [items, setItems] = useState<CompareTrayItem[]>([]);
  const { showToast } = useToast();
  /* [1009 · A · 리뷰] 빼기는 **바로** 지운다(비교함 + 로그인이면 서버 관심 단지 목록) — 되돌리기 창만큼 서버 삭제를
     미루던 설계는 화면 이동·탭 닫기·다시 담기와 어긋나 "되돌렸는데 서버에선 지워진" 상태를 만들었다(리뷰 실측).
     되돌리기는 다시 담기다: 비교함에 넣고, 로그인이면 서버에도 다시 넣은 뒤 그 결과를 토스트로 알린다.
     이 흐름은 컴포넌트 상태에 기대지 않아 다른 화면으로 옮긴 뒤 눌러도 똑같이 동작한다. */
  const remove = async (item: CompareTrayItem) => {
    setItems(removeFromCompareTray(item.id));
    /* #46 서버 관심 단지 목록에 있던 단지만 서버에서도 뺀다 — 이 화면의 검색·지도로 담은 단지는 이 기기 비교함에만
       있어서, 되돌리기가 없던 관심 단지를 새로 만들면 안 된다. 목록을 못 읽으면(로그인인데 실패) 예전처럼 지운다. */
    const signedIn = await hasSession();
    const server = signedIn ? await fetchServerCompareList() : null;
    const onServer = signedIn && (server === null || server.some((s) => s.id === item.id));
    if (onServer) removeCompareItemFromServer(item.id);
    showToast(
      /* 토스트는 한 줄(390px 에서 되돌리기 버튼과 함께 약 21자) — 핵심을 앞에, 단지 이름은 뒤에(잘려도 뜻이 남게) */
      onServer ? `관심 단지에서도 뺐어요 · ${item.name}` : `비교함에서 뺐어요 · ${item.name}`,
      {
        label: "되돌리기",
        onClick: () => {
          const r = addToCompareTray({ id: item.id, name: item.name, region: item.region });
          setItems(r.items);
          if (!r.ok) {
            showToast(
              r.reason === "full" ? "되돌리지 못했어요 · 비교함이 가득 찼어요" : "되돌리지 못했어요 · 저장 공간이 막혀 있어요",
            );
            return;
          }
          if (!onServer) {
            showToast(`비교함에 다시 담았어요 · ${item.name}`);
            return;
          }
          void restoreToServer(item).then((res) =>
            showToast(
              res === "ok"
                ? "다시 담았어요 · 가격 알림 값은 비어 있어요"
                : res === "quota"
                  ? "비교함에만 담았어요 · 관심 단지 한도가 찼어요"
                  : "비교함에만 담았어요 · 관심 목록에 못 넣었어요",
            ),
          );
        },
      },
    );
  };

  useEffect(() => {
    const sync = () => setItems(listCompareTray());
    sync();
    // #46 로그인 상태면 서버 user_watchlist 목록을 로컬 트레이에 병합 (실패·비로그인 시 로컬만)
    let cancelled = false;
    void mergeServerCompareTray().then((merged) => {
      if (!cancelled) setItems(merged);
    });
    const unsubscribe = subscribeCompareTray(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      <div className="t-body font-extrabold text-ink">
        내가 담은 후보 {items.length}개
        <span className="ml-1 font-semibold text-text-3">
          / 최대 {COMPARE_TRAY_MAX}개
        </span>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="chip chip-soft flex items-center gap-0.5 py-0 pl-[11px] pr-0 t-sub"
            >
              <Link href={`/complex/${encodeURIComponent(item.id)}`} className="inline-flex min-h-[40px] items-center break-words">
                {item.name}
                {item.region ? ` · ${item.region}` : ""}
              </Link>
              {/* [1009 · A] ✕ 가 글자 크기(약 12px)뿐이라 손가락으로 누르기 어려웠다 — 40px 로 */}
              <button
                type="button"
                aria-label={`${item.name} 비교에서 빼기`}
                onClick={() => void remove(item)}
                className="press inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full font-bold text-text-3"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="t-sub text-text-3">
          {/* [970 · B-45] 빈 상태 안내는 이 카드 한 장뿐 — 아래 비교표·시세 카드는 후보가 생기면 열린다 */}
          아직 담은 후보가 없어요 — 위 검색이나 단지 화면의 &quot;비교 담기&quot;로 최대{" "}
          {COMPARE_TRAY_MAX}개까지 담으면, 아래에 최근 6개월 실거래 비교표와 후보 지역 시세
          스냅샷이 열려요.
        </div>
      )}
      {/* [AI-22] 트레이 → AI 비교 해석 — 같은 후보로 워크벤치 비교 도구를 연다 */}
      {items.length >= 2 && (
        <Link
          href={`/analysis/ai/ai-compare?ids=${encodeURIComponent(items.slice(0, 3).map((i) => i.id).join(","))}`}
          className="btn-primary btn-md press self-start px-3.5 t-sub no-underline"
        >
          이 후보들로 AI 비교 해석 ›
        </Link>
      )}
    </div>
  );
}

/* ---------- 단지별 실거래 비교표 (POST /api/analysis/complex-compare) ---------- */

type CompareItem = {
  id: string;
  name: string;
  region: string;
  hasData: boolean;
  /** [1008 · Q] 조회 실패(hasData=false 와 함께) — "거래 없음"과 다른 문장으로 */
  failed?: boolean;
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count6m: number;
  count12m: number;
  latest: { ym: string; amountKrw: number; areaM2: number | null; floor: number | null } | null;
};

/** [967 · 31] 원 → "8.45억" — lib/format/krw.ts "eok". null 만 "—" 이고 0 은 "0억" 이던 기존 얼굴 유지 */
function fmtEok(krw: number | null): string {
  if (krw === null) return "—";
  return formatKrwWon(krw, { style: "eok", below: "eok", empty: false });
}

/** [1009 · A] 원 → 평당가 "3,383만" · "1억 2,017만" — 예전 fmtManwon 은 1억 이상을 억으로 바꾸지 않아
    강남권 평당가가 "12,017만"처럼 자릿수를 세야 읽혔다(표기 표준: 억 미전환 금지). 평균이라 머리글에 "평균"을 적는다 */
function fmtPyeong(krw: number | null): string {
  if (krw === null) return "—";
  return formatEokMan(krw / 10_000);
}

/** [1009 · A] 한 건의 실거래 — 정밀 표기 "8억 4,500만"(네이버 부동산 목록 관례). 평균(6개월 평균가)은 짧은 "8.45억" 그대로 */
function fmtDeal(krw: number | null): string {
  if (krw === null) return "—";
  return formatEokMan(krw / 10_000);
}

function ratio(v: number | null, max: number): number {
  if (v === null || !Number.isFinite(v) || max <= 0) return 0;
  return Math.min(1, Math.max(0.06, v / max));
}

function pctOf(v: number | null, max: number): string {
  if (v === null || !Number.isFinite(v) || max <= 0) return "0%";
  return `${Math.round((v / max) * 100)}%`;
}

/** 최근 거래가 얼마나 최근인지 0~1 (12개월 전=0, 이번 달=1). 없으면 0. */
function recencyRatio(ym: string | null): number {
  if (!ym || !/^\d{6}$/.test(ym)) return 0;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4));
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.min(1, Math.max(0, 1 - months / 12));
}

function fmtYm(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

/** [1009 · A · 리뷰] 서버가 센 기간을 말로 — from="202603", n=6 → "2026.03부터 이번 달까지(이번 달 포함 달력 7개월)".
    서버(/api/analysis/complex-compare)는 "n개월 전 달 1일 ~ 오늘"을 센다 — "최근 n개월"보다 한 달 길다 */
function windowText(from: string | undefined, n: number): string {
  return from && /^\d{6}$/.test(from)
    ? `${from.slice(0, 4)}.${from.slice(4)}부터 이번 달까지(이번 달 포함 달력 ${n + 1}개월)`
    : `${n}개월 전 달부터 이번 달까지(달력 ${n + 1}개월)`;
}

/** 트레이에 담은 단지들의 실거래 요약 비교표.
    예전 이 자리에는 "단지별 항목 비교표는 준비 중이에요" 카드가 있었다. */
function ComplexCompareTable() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [items, setItems] = useState<CompareItem[] | null>(null);
  /* [1009 · A · 리뷰] 서버가 실제로 센 기간(from6m·from12m) — ⓘ 가 "최근 6개월"이 아니라 그 기간을 그대로 말한다 */
  const [win, setWin] = useState<{ from6m: string; from12m: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sync = () => setIds(listCompareTray().map((t) => t.id));
    sync();
    return subscribeCompareTray(sync);
  }, []);

  const idsKey = ids === null ? "" : ids.join("|");

  useEffect(() => {
    if (ids === null) return;
    if (ids.length === 0) {
      setItems(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/analysis/complex-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsKey.split("|") }),
        });
        const data = (await res.json().catch(() => null)) as
          | { items?: CompareItem[]; window?: { from6m?: string; from12m?: string } }
          | null;
        if (!cancelled) {
          setItems(res.ok && Array.isArray(data?.items) ? data.items : null);
          const w = data?.window;
          setWin(w && typeof w.from6m === "string" && typeof w.from12m === "string" ? { from6m: w.from6m, from12m: w.from12m } : null);
        }
      } catch {
        if (!cancelled) setItems(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  /* 표의 셀 배경 막대와 "최저·최다" 배지를 위한 파생값. 값이 있는 단지가
     2곳 미만이면 비교 자체가 성립하지 않아 배지도 안 붙는다. */
  const withData = useMemo(() => (items ?? []).filter((i) => i.hasData), [items]);
  const maxAvg = Math.max(0, ...withData.map((i) => i.avg6mKrw ?? 0));
  const maxPyeong = Math.max(0, ...withData.map((i) => i.avgPyeong6mKrw ?? 0));
  const maxCount = Math.max(0, ...withData.map((i) => i.count12m));
  const cheapest = bestOf(items ?? [], (i) => (i.hasData ? i.avg6mKrw : null), "min");
  const cheapestPyeong = bestOf(items ?? [], (i) => (i.hasData ? i.avgPyeong6mKrw : null), "min");
  const mostActive = bestOf(items ?? [], (i) => (i.hasData ? i.count12m : null), "max");

  /* [1008 · Q] "내 기준" 순위 재료 — 표 행 그대로(값이 없는 칸은 순위 계산이 그 기준에서 뺀다) */
  const criteriaItems = useMemo(
    () =>
      (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        hasData: i.hasData,
        avg6mKrw: i.avg6mKrw,
        avgPyeong6mKrw: i.avgPyeong6mKrw,
        count12m: i.count12m,
        latestYm: i.latest?.ym ?? null,
        failed: i.failed === true,
      })),
    [items],
  );

  const RADAR_TONES = ["text-primary", "text-success", "text-warning"] as const;
  /* [1009 · A] 축마다 그 단지의 실제 값(표와 같은 표기) — 레이더 초점 단지의 값을 축 이름 아래에 적는다 */
  const radar = useMemo(
    () =>
      withData.slice(0, 3).map((it, i) => ({
        name: it.name,
        toneClass: RADAR_TONES[i] ?? "text-primary",
        axes: [
          { key: "avg", label: "평균가", ratio: ratio(it.avg6mKrw, maxAvg), display: fmtEok(it.avg6mKrw) },
          /* 차트 라벨은 짧은 표기(표준) — "1억 4,838만" 은 390px 레이더 오른쪽 끝에서 잘렸다(실측) */
          {
            key: "pyeong",
            label: "평당가",
            ratio: ratio(it.avgPyeong6mKrw, maxPyeong),
            display: it.avgPyeong6mKrw === null ? "—" : formatKrwManwon(it.avgPyeong6mKrw / 10_000, { style: "eok1" }),
          },
          { key: "c12", label: "12개월 거래", ratio: ratio(it.count12m, maxCount), display: `${it.count12m.toLocaleString("ko-KR")}건` },
          {
            key: "c6",
            label: "최근 6개월",
            ratio: ratio(it.count6m, Math.max(1, ...withData.map((x) => x.count6m))),
            display: `${it.count6m.toLocaleString("ko-KR")}건`,
          },
          { key: "recent", label: "최근성", ratio: recencyRatio(it.latest?.ym ?? null), display: it.latest ? fmtYm(it.latest.ym) : "—" },
        ],
      })),
    [withData, maxAvg, maxPyeong, maxCount],
  );
  const [focus, setFocus] = useState(0);
  const focusAt = Math.min(focus, Math.max(0, radar.length - 1));

  /* [970 · B-45] 후보 0개면 카드를 그리지 않는다 — 트레이 카드가 이미 "담으면 아래에
     비교표·시세 스냅샷이 열려요"라고 안내한다(같은 빈 문구가 세 장 반복됐다). */
  if (!ids || ids.length === 0) return null;

  return (
    <>
    <div className="card flex flex-col gap-3 rounded-[14px] p-4" data-reveal="">
      <div className="chart-head">
        <span className="t-section text-ink">단지별 실거래 비교표</span>
        <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
          실데이터 기준
        </span>
      </div>
      {loading && !items ? (
        /* 예전엔 "집계하는 중…" 한 줄이라 표가 나타날 때 화면이 통째로 튀었다 */
        <SkTable rows={Math.min(4, ids.length)} />
      ) : items ? (
        <>
          {/* 성격 비교 — 표는 항목별 우열은 보여 주지만 "어떤 단지인가"는 안 보여 준다.
              값이 있는 단지가 2곳 이상일 때만 그린다(한 곳짜리 레이더는 의미 없다). */}
          {radar.length >= 2 && (
            <div className="flex flex-wrap items-center justify-center gap-4 rounded-[10px] bg-bg p-3">
              <Radar series={radar} size={236} focus={focusAt} className="max-w-full overflow-visible" />
              <div className="flex flex-col gap-1.5">
                {/* [1009 · A] 단지를 누르면 그 단지 모양이 진해지고 축에 실제 값이 나온다(같은 화면 상태 전환) */}
                <div role="group" aria-label="레이더에서 볼 단지" className="flex flex-col gap-1">
                  {radar.map((r, i) => (
                    <button
                      key={r.name}
                      type="button"
                      aria-pressed={i === focusAt}
                      onClick={() => setFocus(i)}
                      className={`press flex min-h-[40px] items-center gap-2 rounded-[10px] px-2.5 text-left ${
                        i === focusAt ? "bg-surface shadow-sm" : ""
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.toneClass}`} style={{ background: "currentColor" }} />
                      <span className={`t-sub break-words ${i === focusAt ? "font-extrabold text-ink" : "font-bold text-text-2"}`}>{r.name}</span>
                    </button>
                  ))}
                </div>
                <p className="t-caption max-w-[230px] text-text-3">
                  각 축은 담긴 단지들 사이의 상대 위치예요(값이 클수록 바깥 — 가격은 비쌀수록 바깥). 누른 단지의 값이 축
                  이름 아래에 나와요.
                </p>
              </div>
            </div>
          )}

          {/* relative — 칸 안 sr-only 가 가로 스크롤 상자를 벗어나 문서 폭을 늘리지 않게(표 안 <Delta>·ⓘ) */}
          <div className="relative overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="t-sub grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] gap-2 border-b border-divider pb-2 font-bold text-text-3">
                <span>단지</span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  6개월 평균가
                  <Explain
                    term="silgeoraega"
                    title="6개월 평균가"
                    how={[
                      `${windowText(win?.from6m, 6)} 계약된 매매 실거래 금액을 면적 구분 없이 단순 평균했어요.`,
                      "해제(취소) 신고된 거래는 빼요. 이번 달·지난달 계약은 아직 신고 중이라 덜 잡혀요.",
                    ]}
                    source="국토교통부 실거래가"
                    size={12}
                  />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  평당가 평균
                  <Explain
                    term="pyeongdanga"
                    how={[`${windowText(win?.from6m, 6)} 계약된 거래마다 금액 ÷ (전용면적 ÷ 3.3058)로 평당가를 내고 평균했어요.`]}
                    source="국토교통부 실거래가"
                    size={12}
                  />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  거래 6/12개월
                  <Explain
                    term="geoRae-ryang"
                    how={[
                      `앞 숫자: ${windowText(win?.from6m, 6)} 매매 신고 건수 · 뒤 숫자: ${windowText(win?.from12m, 12)} 건수예요.`,
                      "이번 달·지난달 계약은 아직 신고 중이라 덜 잡혀요. 뒤 숫자는 단지마다 최근 300건까지 세요.",
                    ]}
                    size={12}
                  />
                </span>
                <span className="text-center">최근 거래(1건)</span>
              </div>
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="row-hl grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] items-center gap-2 border-b border-divider py-2.5"
                >
                  <span className="t-sub font-bold text-ink">
                    <Link href={complexHrefFromId(it.id)} className="no-underline">
                      {it.name}
                    </Link>
                    <span className="t-caption ml-1 font-semibold text-text-3">{it.region}</span>
                  </span>
                  {it.hasData ? (
                    <>
                      <span
                        className="cell-bar t-sub t-num text-center text-primary"
                        style={{ ["--w" as string]: pctOf(it.avg6mKrw, maxAvg) }}
                      >
                        {fmtEok(it.avg6mKrw)}
                        {cheapest.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span
                        className="cell-bar t-sub t-num text-center text-primary"
                        style={{ ["--w" as string]: pctOf(it.avgPyeong6mKrw, maxPyeong) }}
                      >
                        {fmtPyeong(it.avgPyeong6mKrw)}
                        {cheapestPyeong.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span
                        className="cell-bar t-sub t-num text-center text-success"
                        style={{ ["--w" as string]: pctOf(it.count12m, maxCount) }}
                      >
                        {it.count6m}/{it.count12m}건
                        {mostActive.has(idx) && <WinBadge label="최다" />}
                      </span>
                      <span className="t-sub text-center text-text-2">
                        {it.latest
                          ? `${fmtYm(it.latest.ym)} · ${fmtDeal(it.latest.amountKrw)}${
                              it.latest.areaM2 ? ` · ${Math.round(it.latest.areaM2)}㎡` : ""
                            }${it.latest.floor ? ` · ${it.latest.floor}층` : ""}`
                          : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="t-sub col-span-4 text-center text-text-3">
                      {/* [1008 · Q] 조회 실패와 거래 없음을 가른다(리뷰 C) */}
                      {it.failed ? "실거래를 불러오지 못했어요 · 잠시 후 다시" : "최근 12개월 실거래 없음"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="t-caption text-text-3">
            국토교통부 실거래 기준(해제 신고분 제외) · 면적·타입 구분 없는 단순 평균이므로
            같은 단지라도 평형 구성에 따라 체감과 다를 수 있어요. &ldquo;최저·최다&rdquo;
            배지는 담긴 단지들 사이의 비교일 뿐 좋고 나쁨의 판정이 아닙니다.
          </p>
        </>
      ) : (
        <p className="t-sub text-text-3">집계에 실패했어요. 잠시 후 다시 시도해 주세요.</p>
      )}
    </div>
    {/* [1008 · Q] 값이 있는 후보가 둘 이상일 때만 — 한 곳짜리 순위는 비교가 아니다 */}
    {items && withData.length >= 2 && <MyCriteriaRank items={criteriaItems} />}
    </>
  );
}

/* ---------- 지역 실시세 병합 + 종합 코멘트 (POST /api/ai/compare-summary) ---------- */

type RegionSnapshotItem = {
  regionId: string;
  regionName: string;
  period: string;
  source: string;
  avgSaleLabel: string | null;
  saleChangeMonthly: number | null;
  jeonseRatio: number | null;
};

type SummaryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "limited"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "done";
      items: RegionSnapshotItem[];
      comment: string;
      mode: "llm" | "rule";
      disclaimer: string;
    };

/** [1009 · A] 등락 표준(lib/format/delta) — 예전엔 상승을 오류색(text-danger), 하락을 테마색(text-primary)으로 칠해
    AI 도구 테마 안에서 하락이 보라·초록이 됐고, 0 은 "— 0.0%"였다. 이제 ▲ 빨강 · ▼ 파랑 · 보합 회색 · 모르면 "변동 미상". */
function DeltaCell({ pct }: { pct: number | null }) {
  const dir = deltaDir(pct);
  if (dir === null) return <span className="text-center font-bold text-text-3">변동 미상</span>;
  if (dir === "flat") return <span className="text-center font-bold delta-flat">보합</span>;
  return (
    <span className={`text-center tabular-nums ${DELTA_CLASS[dir]}`}>
      <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
      <span className="sr-only">{DELTA_WORD[dir]} </span>
      {Math.abs(pct as number).toFixed(1)}%
    </span>
  );
}

/** 비교 트레이의 후보 지역 실시세 요약 — "요약 생성" 버튼을 눌렀을 때만 호출 */
function RegionMarketSummary() {
  const [state, setState] = useState<SummaryState>({ kind: "idle" });
  const [trayItems, setTrayItems] = useState<CompareTrayItem[] | null>(null);

  useEffect(() => {
    const sync = () => setTrayItems(listCompareTray());
    sync();
    return subscribeCompareTray(sync);
  }, []);

  const regions = [
    ...new Set((trayItems ?? []).map((t) => (t.region ?? "").trim()).filter(Boolean)),
  ];
  /* [970 · B-45] 후보 지역이 없으면(트레이 비었거나 지역 없는 항목뿐) 카드를 접는다 */
  if (regions.length === 0) return null;

  const generate = async () => {
    if (state.kind === "loading" || regions.length === 0) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/compare-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        items?: RegionSnapshotItem[];
        comment?: string;
        mode?: string;
        disclaimer?: string;
      } | null;
      if (res.status === 429) {
        setState({
          kind: "limited",
          message:
            data?.error ?? "요약 생성 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 확인해 주세요.",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: data?.error ?? "요약 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({
        kind: "done",
        items: data.items,
        comment: data.comment ?? "",
        mode: data.mode === "llm" ? "llm" : "rule",
        disclaimer:
          data.disclaimer ?? "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다",
      });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  return (
    <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-[22px]">
      <div className="flex items-center justify-between gap-2">
        <div className="t-section text-ink">
          후보 지역 실시세 스냅샷
        </div>
        {regions.length > 0 && (
          /* [1009 · A] 진행(링) → 완료(체크) / 실패(흔들림) — 예전엔 누르면 버튼이 사라졌다가 다시 나타났다 */
          <ActionButton
            state={state.kind === "loading" ? "busy" : state.kind === "limited" || state.kind === "error" ? "error" : "idle"}
            onClick={generate}
            busyLabel="불러오는 중"
            errorLabel="다시 생성"
            className="btn-md shrink-0 rounded-[10px] px-3 text-xs"
          >
            {state.kind === "done" ? "요약 다시 생성" : "요약 생성"}
          </ActionButton>
        )}
      </div>

      {state.kind === "idle" ? (
        <div className="t-sub text-text-3">
          담은 후보 {regions.length}개 지역의 시세 스냅샷을 준비했어요. &quot;요약
          생성&quot; 버튼을 누르면 지역 실시세와 종합 코멘트를 불러와요.
        </div>
      ) : state.kind === "loading" ? (
        <div className="text-xs text-text-3">지역 시세를 불러오는 중…</div>
      ) : state.kind === "empty" ? (
        <div className="t-sub text-text-3">
          담은 후보 지역의 실시세 데이터가 아직 없어요. 시세 수집 후 다시 시도해 주세요.
        </div>
      ) : state.kind === "limited" || state.kind === "error" ? (
        <div className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-xs font-bold text-danger">
          {state.message}
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-divider pb-2 t-sub font-bold text-text-3">
                <span>지역 (기준월)</span>
                <span className="text-center">평균 매매가</span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  지난달 대비
                  <Explain note="delta" size={12} />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  전세가율
                  <Explain term="jeonse-garyul" how="지역 아파트의 매매가 대비 전세가 비율(공표 통계)이에요 — 단지 값이 아니라 지역 평균이에요." size={12} />
                </span>
              </div>
              {state.items.map((it) => {
                return (
                  <div
                    key={it.regionId}
                    className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 border-b border-divider py-2.5 text-xs"
                  >
                    <span className="font-bold text-ink">
                      {it.regionName}
                      <span className="ml-1 t-caption font-semibold text-text-3">
                        {it.period} · {it.source.toUpperCase()}
                      </span>
                    </span>
                    <span className="text-center font-extrabold text-text-1">
                      {it.avgSaleLabel ?? "—"}
                    </span>
                    <DeltaCell pct={it.saleChangeMonthly} />
                    <span className="text-center font-bold text-text-1">
                      {it.jeonseRatio !== null ? `${it.jeonseRatio.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {state.comment && (
            <div className="ai-panel flex flex-col gap-2 rounded-2xl p-[18px]">
              <div className="flex items-start gap-3">
                <span className="ai-chip h-[22px] w-[22px] shrink-0 rounded-[7px] t-sub">
                  AI
                </span>
                <div className="flex-1 text-xs leading-[1.65] text-ai-text">
                  {state.comment}
                </div>
                <span className="shrink-0 rounded border border-on-dark-faint px-1.5 py-px t-caption font-bold text-ai-muted">
                  {state.mode === "llm" ? "AI 생성" : "규칙 기반 요약"}
                </span>
              </div>
              <div className="t-caption text-ai-muted">
                {state.disclaimer}.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <PageShell breadcrumb="AI 분석 › 단지 비교">
      <h1 className="sr-only">단지 비교</h1>
      <div className="flex flex-col gap-3.5">
        {/* 단지 선택기 → 비교 트레이 (검색·지도·?complexId=/?apt= 딥링크) */}
        <ComparePickerSection />

        {/* 내가 담은 후보 (비교 트레이) */}
        <CompareTraySection />

        {/* 단지별 실거래 비교표 — "준비 중" 카드였던 자리. 이제 트레이에 담은
            단지들의 최근 6개월 평균가·평당가·거래량을 실거래에서 직접 집계한다. */}
        <ComplexCompareTable />

        {/* 지역 실시세 요약 — "요약 생성" 버튼을 눌렀을 때만 API 호출 */}
        <RegionMarketSummary />

        {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
        {/* #411 — 도구 간 이어가기 (비교는 지역 컨텍스트가 없어 링크만) */}
        <AnalysisCrossLinks
          current="compare"
          note={{ label: "노트 쓰러 가기", href: "/notes/new" }}
        />
      </div>
    </PageShell>
  );
}
