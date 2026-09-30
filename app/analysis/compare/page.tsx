"use client";
/* [1026b · 시나리오·비교] 1025 표준 — 머리(PageHead) 아래 절차 한 줄(단지 담기 · N곳 → 비교 → 결론 → 다음 행동) · 결론 한 줄(t-title
   "3곳 중 평당가 최저 {단지} 3,383만" + 칩 "거래 최다 {단지}" · 근거 = 6개월 평균가 최저 · 12개월 거래 — 기존 비교표의 1위 칸 그대로) ·
   대표 그림(비교표 · 레이더 — 폰은 단지 카드) · 손잡이(담은 단지 칩 + 단지 검색)는 데스크톱 레일 / 폰 결론·그림 아래 접이식(자리 하나만 —
   useDesktop) · 세부(내 기준 순위 · 후보 지역 스냅샷) · 다음 행동 카드(채움 파랑 "결정 카드에 담기" → 비교함 → /decide + AI 비교 해석 ·
   알림 받기 · 지도) · 폰 하단 바(같은 요소). 빈 상태(0곳) = 카드 하나 + 회색 표 윤곽 + 한 문장 + 단지 검색.
   채움 파랑은 하나 — 예전 "이 후보들로 AI 비교 해석"(채움) · "요약 생성"(ActionButton 채움) · 이어서 칩의 파란 "노트 쓰러 가기"는 링크·보조 버튼으로.
   번들(486KB): 비교표 · 레이더 · 내 기준 순위 · 스냅샷 · 단지 검색은 next/dynamic(CompareLazy.tsx). 비교 조회(POST)는 결론이 같은 값을 써야 해서
   여기 남는다(요청·응답·키 그대로). 문장은 lib/market/compare-conclusion(새 계산 없음 · 표 배지와 같은 bestOf).
   [1023 · AI 분석] 비교표 머리의 "실데이터 기준" 부연 라벨 제거 · AI 코멘트 판 네이비 → 흰 카드·잉크 토큰. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import type { PickedComplex } from "../ComplexPicker";
import { VerdictCard } from "../timing/region-verdict";
import { useDesktop } from "../scenario/use-desktop";
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
import { hasSession } from "@/lib/client/has-session";
import { StepLine } from "@/app/components/StepLine";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { SkBlock } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  COMPARE_DECIDE_HREF,
  compareActionLinks,
  compareConclusion,
  compareSteps,
  type ComparePhase,
} from "@/lib/market/compare-conclusion";
import { fmtEok, fmtPyeong, type CompareItem } from "./compare-format";
import { CompareTableLazy, ComparePickerLazy, MyCriteriaRankLazy, RegionMarketSummaryLazy } from "./CompareLazy";

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

const CARD = "card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5";
/** 빈 상태 회색 견본 — 비교표 칸 비율 그대로(머리 한 줄 + 세 줄) */
const OUTLINE_COLS = "grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] gap-2";

export default function ComparePage() {
  const { showToast } = useToast();
  /** 비교함(이 기기 localStorage + #46 로그인 시 서버 병합). null = 아직 못 읽음(서버 렌더) */
  const [tray, setTray] = useState<CompareTrayItem[] | null>(null);
  /* [1026b] 딥링크(?complexId= · ?apt=)는 처음 마운트된 단지 검색 한 벌만 읽는다 */
  const [deepLinkRead, setDeepLinkRead] = useState(false);
  const markDeepLinkRead = useCallback(() => setDeepLinkRead(true), []);
  /* [1026b] 폰 손잡이 접이식(null = 아직 안 눌렀다 → 두 곳 미만이면 펼친 채) · 손잡이를 그릴 자리(데스크톱 레일 / 폰 접이식 중 하나만) */
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const desktop = useDesktop();

  useEffect(() => {
    const sync = () => setTray(listCompareTray());
    sync();
    // #46 로그인 상태면 서버 user_watchlist 목록을 로컬 트레이에 병합 (실패·비로그인 시 로컬만)
    let cancelled = false;
    void mergeServerCompareTray().then((merged) => {
      if (!cancelled) setTray(merged);
    });
    const unsubscribe = subscribeCompareTray(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* [975] 담기는 검색·지도 두 길이 같은 함수로 모인다.
     [1009 · A] 결과는 토스트로(원인 + 해결) — 예전엔 검색창 아래 글자 한 줄이라 지도 서랍을 닫는 순간 놓쳤다. */
  const add = useCallback(
    (c: PickedComplex) => {
      const r = addToCompareTray({ id: c.id, name: c.name, region: c.region || c.regionLabel || undefined });
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

  /* [1009 · A · 리뷰] 빼기는 **바로** 지운다(비교함 + 로그인이면 서버 관심 단지 목록). 되돌리기는 다시 담기다:
     비교함에 넣고, 로그인이면 서버에도 다시 넣은 뒤 그 결과를 토스트로 알린다. */
  const remove = async (item: CompareTrayItem) => {
    setTray(removeFromCompareTray(item.id));
    /* #46 서버 관심 단지 목록에 있던 단지만 서버에서도 뺀다 — 목록을 못 읽으면(로그인인데 실패) 예전처럼 지운다. */
    const signedIn = await hasSession();
    const server = signedIn ? await fetchServerCompareList() : null;
    const onServer = signedIn && (server === null || server.some((s) => s.id === item.id));
    if (onServer) removeCompareItemFromServer(item.id);
    showToast(onServer ? `관심 단지에서도 뺐어요 · ${item.name}` : `비교함에서 뺐어요 · ${item.name}`, {
      label: "되돌리기",
      onClick: () => {
        const r = addToCompareTray({ id: item.id, name: item.name, region: item.region });
        setTray(r.items);
        if (!r.ok) {
          showToast(r.reason === "full" ? "되돌리지 못했어요 · 비교함이 가득 찼어요" : "되돌리지 못했어요 · 저장 공간이 막혀 있어요");
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
    });
  };

  /* ---------- 단지별 실거래 비교 조회 (POST /api/analysis/complex-compare) — 결론과 비교표가 같은 값을 본다 ---------- */
  const [items, setItems] = useState<CompareItem[] | null>(null);
  /* [1009 · A · 리뷰] 서버가 실제로 센 기간(from6m·from12m) — ⓘ 가 "최근 6개월"이 아니라 그 기간을 그대로 말한다 */
  const [win, setWin] = useState<{ from6m: string; from12m: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const idsKey = tray === null ? "" : tray.map((t) => t.id).join("|");

  useEffect(() => {
    if (tray === null) return;
    if (!idsKey) {
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
        const data = (await res.json().catch(() => null)) as { items?: CompareItem[]; window?: { from6m?: string; from12m?: string } } | null;
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

  const count = tray?.length ?? 0;
  const conclusion = useMemo(() => (items ? compareConclusion(items, { avg: fmtEok, pyeong: fmtPyeong }) : null), [items]);
  const phase: ComparePhase = count < 2 ? "pick" : conclusion ? "result" : "compare";
  const plan = compareSteps(count, phase);
  const links = compareActionLinks((tray ?? []).map((t) => t.id));
  const withData = (items ?? []).filter((i) => i.hasData).length;

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
  const regions = [...new Set((tray ?? []).map((t) => (t.region ?? "").trim()).filter(Boolean))];

  /* 채움 파랑 — 결정 카드에 담기(비교함 = /decide 후보). 레일 카드(lg+)와 폰 하단 바가 이 요소를 나눠 그린다 */
  const toDecide = () => {
    const list = tray ?? [];
    let ok = 0;
    for (const t of list) if (addToCompareTray({ id: t.id, name: t.name, region: t.region }).ok) ok += 1;
    showToast(ok === list.length ? `결정 카드 후보 ${ok}곳` : "이 브라우저에서는 담을 수 없어요(저장 공간이 막혀 있어요)");
  };
  const primary = (
    <Link href={COMPARE_DECIDE_HREF} onClick={toDecide} className="btn-primary btn-md press w-full gap-1.5 no-underline">
      <Icon name="clipboard" size={16} />
      결정 카드에 담기
    </Link>
  );

  /* 단지 검색 — 화면에 한 벌씩(빈 상태 카드 · 손잡이). 딥링크는 처음 한 벌만 */
  const picker = <ComparePickerLazy onAdd={add} readDeepLink={!deepLinkRead} onMounted={markDeepLinkRead} />;

  /* 손잡이 — 담은 단지 칩(빼기 40px) + 단지 검색 */
  const handle = (
    <section className={CARD} aria-label="담은 단지">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="t-section text-ink">담은 단지 {count}곳</h2>
        <span className="t-caption text-text-3">최대 {COMPARE_TRAY_MAX}곳</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(tray ?? []).map((item) => (
          <span key={item.id} className="chip chip-soft flex items-center gap-0.5 py-0 pl-[11px] pr-0 t-sub">
            <Link href={`/complex/${encodeURIComponent(item.id)}`} className="inline-flex min-h-[40px] items-center break-words">
              {item.name}
              {item.region ? ` · ${item.region}` : ""}
            </Link>
            {/* [1009 · A] ✕ 40px */}
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
      {picker}
    </section>
  );

  /* 다음 행동 카드 + 이어서 분석 — 데스크톱 레일 · 폰 본문 끝(채움 파랑은 하단 바가 맡아 카드 안에서는 lg 에서만) */
  const railNodes = (
    <>
      <section className={CARD} aria-label="다음 행동">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h2 className="t-section text-ink">다음 행동</h2>
          <span className="t-caption tabular-nums text-text-3">후보 {count}곳</span>
        </div>
        <div className="hidden lg:block">{primary}</div>
        <ul className="m-0 flex list-none flex-col divide-y p-0" data-tone="plain" aria-label="이어서 할 일">
          {links.map((l) => (
            <li key={l.label}>
              <Link href={l.href} className="flex min-h-10 items-center justify-between gap-2 t-sub font-bold text-primary no-underline">
                {l.label}
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {/* #411 — 도구 간 이어가기 (비교는 지역 컨텍스트가 없어 링크만). [1026b] 파란 "노트 쓰러 가기" 칩은 걷었다(채움 파랑 하나) */}
      <AnalysisCrossLinks current="compare" />
    </>
  );

  const open = panelOpen ?? count < 2;

  return (
    <PageShell breadcrumb="분석 › 단지 비교">
      <div className="nz-dot-blue mx-auto w-full max-w-[1200px]">
        <PageHead icon="scale" title="후보 단지 비교" sub={`국토교통부 실거래 · 최대 ${COMPARE_TRAY_MAX}곳`} />

        {/* [1026b] 절차 한 줄 — 화면당 한 번 */}
        <StepLine className="mt-3" steps={plan.steps} current={plan.current} />

        {count === 0 ? (
          /* [1026b] 빈 상태 — 카드 하나 + 회색 표 윤곽 + 한 문장 + 단지 검색 */
          <section className="card mx-auto mt-3 flex w-full max-w-[640px] flex-col gap-3 rounded-2xl p-4 max-md:p-3.5" aria-label="비교할 단지 담기">
            <div className="flex flex-col gap-1.5" aria-hidden="true">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className={OUTLINE_COLS}>
                  {[0, 1, 2, 3, 4].map((c) => (
                    <span key={c} className={`block rounded-sm border border-dashed border-line-strong ${r === 0 ? "h-3" : "h-7"}`} />
                  ))}
                </div>
              ))}
            </div>
            {/* 비교함을 읽기 전(서버 렌더)에는 문장을 쓰지 않는다 — 담은 사람에게 "없어요"가 먼저 보이지 않게 */}
            {tray !== null && <p className="m-0 t-body font-bold text-ink">담은 단지가 없어요 · 최대 {COMPARE_TRAY_MAX}곳</p>}
            {picker}
          </section>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div className="flex min-w-0 flex-col gap-3">
              {/* [1026b] 결론 한 줄 — 비교표의 1위 칸. 불러오는 동안 자리만 */}
              {count >= 2 && (loading && !items ? <SkBlock h={92} className="rounded-2xl" /> : conclusion && <VerdictCard conclusion={conclusion} />)}

              {/* 대표 그림 — 비교표(레이더 · 표 / 폰 카드) */}
              <CompareTableLazy items={items} loading={loading} count={count} win={win} />

              {/* 손잡이(폰) — 결론·그림 아래 접이식(두 곳 미만이면 펼친 채). lg 는 오른쪽 레일 */}
              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => setPanelOpen(!open)}
                  aria-expanded={open}
                  aria-controls="compare-panel"
                  className="card flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-2 text-left"
                >
                  <span className="min-w-0 truncate t-sub font-bold text-ink">
                    담은 단지 {count}곳
                    <span className="ml-1 font-medium text-text-3">{(tray ?? []).map((t) => t.name).join(" · ")}</span>
                  </span>
                  <span aria-hidden="true" className={`shrink-0 text-text-3 transition-transform ${open ? "rotate-90" : ""}`}>
                    ›
                  </span>
                </button>
                <div id="compare-panel" className={open ? "mt-3 flex flex-col gap-3" : "hidden"}>
                  {desktop === false && handle}
                </div>
              </div>

              {/* 세부 — [1008 · Q] 값이 있는 후보가 둘 이상일 때만 내 기준 순위 · 지역 스냅샷("요약 생성"을 눌렀을 때만 조회) */}
              {items && withData >= 2 && <MyCriteriaRankLazy items={criteriaItems} />}
              {regions.length > 0 && <RegionMarketSummaryLazy regions={regions} />}

              {/* 폰 — 레일 내용(다음 행동 · 이어서 분석)을 본문 끝 한 열로 */}
              <div className="flex flex-col gap-3 lg:hidden">{railNodes}</div>
            </div>
            <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="담은 단지와 다음 행동">
              {desktop === true ? handle : desktop === null ? <SkBlock h={180} className="rounded-2xl" /> : null}
              {railNodes}
            </aside>
          </div>
        )}
        {/* [1026b] 폰 하단 바 — 레일의 채움 파랑과 같은 요소(담은 단지가 있을 때 · 화면에 한 번) */}
        {count > 0 && <MobilePrimaryBar label="결정 카드에 담기">{primary}</MobilePrimaryBar>}
      </div>
    </PageShell>
  );
}
