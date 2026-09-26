"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
/* [975] 지도 서랍은 **열 때만** 내려받는다 — 이 라우트의 First Load 예산이
   461/480KB 라 지도(NaverMap 1,344줄)를 정적으로 얹으면 그 자리에서 깨진다. */
import { useMapPick } from "@/app/analysis/use-map-pick";
import { hasSession } from "@/lib/client/has-session";
import { useHumanGate } from "@/lib/client/human-gate";
import { isBotBrowser } from "@/lib/client/is-bot-ua";
import { SkBlock, SkLine } from "@/app/components/ui/Skeleton";
import { ActionButton, type ActionState } from "@/app/components/ui/ActionButton";
import { useToast } from "@/app/components/toast/ToastProvider";
import { isCoreAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { ToolPersona } from "@/lib/ai/tool-persona";
import { buildTuningInput, type TuningField } from "@/lib/ai/tool-tuning";
import { applyPriceAutofill, EMPTY_AUTOFILL, priceManString, type AutofillState } from "@/lib/ai/tuning-autofill";
import { formatKrwWon } from "@/lib/format/krw";
import type { PortfolioItem, ReadyState, RunResult, Similar } from "./workbench-types";

/* ============================================================
   [AI-31~38·42~43·46] 통합 워크벤치 클라이언트 — 입력과 흐름만 한다.
   서버 판정(결과 요약·그래프 재료·신호·체크리스트·출처)은 /api/ai/context 가 주고, 결과 그림은
   ResultView(next/dynamic 청크)가 그린다. 수치를 여기서 계산하지 않는다.

   [1008 · W] 소유자: "화면에서 보여주는 말들이 정리가 안 되어 있고, 무슨 말인지 모르겠고, 직관적이지
   않고, 데이터가 숫자나 그래프로 보이지 않아 처음 보는 사람이 뭘 봐야 하는지 모르겠다".
   · 순서: ① 단지 고르기 → (결과가 바로 선다) → ② 내 조건(선택, 기본 접힘) → ③ 분석 실행(내 조건 반영
     + 원하면 AI 해설). 모바일은 ① 다음에 결과가 오고 ②③ 은 그 아래 — 결과까지 스크롤이 없다.
   · 단지를 안 골랐으면 "이렇게 써요" 3단계 + 거래 많은 단지 빠른 선택(서버가 준 실데이터만).
   · 기준 가격은 단지를 고르면 최근 실거래가로 자동으로 채운다(lib/ai/tuning-autofill.ts).
   · 봇은 컨텍스트를 부르지 않는다(1007 V2a-4) — 피커의 딥링크 자동 선택도 여기서 막는다.
   ============================================================ */

/* [981] 보정 입력 폼은 **렌더될 때** 내려온다 — 데이터가 준비된 뒤 ② 를 펼칠 때만 마운트. */
const TuningFormLazy = dynamic(() => import("./TuningForm").then((m) => m.TuningForm), { ssr: false });
/* [1008] 결과 화면 전체(요약·그래프·다음 할 일·자세히)는 한 청크 — 본체 예산(480KB) 밖 */
const ResultViewLazy = dynamic(() => import("./ResultView").then((m) => m.ResultView), {
  ssr: false,
  loading: () => <ResultSkeleton />,
});
/* [996] "다른 도구로 본 이 단지" 보드 — 결과 아래, 사람이 볼 때만 도구 3종을 부른다(VerdictBoard.tsx) */
const VerdictBoardLazy = dynamic(() => import("./VerdictBoard").then((m) => m.VerdictBoard), { ssr: false });
/* [1008 · 리뷰 A-3] 내 자산 구성 진단 — 관심 단지를 불러왔을 때만 */
const PortfolioMixLazy = dynamic(() => import("./PortfolioMix").then((m) => m.PortfolioMix), { ssr: false });

function ResultSkeleton() {
  return (
    <div className="card flex flex-col gap-3 rounded-2xl p-4" aria-busy="true">
      <SkLine w="40%" h={14} />
      <SkLine w="85%" h={18} />
      <SkBlock h={84} />
      <SkBlock h={180} />
    </div>
  );
}

export type QuickPick = { id: string; name: string; region: string; recentTrades: number };

type CtxState = { phase: "idle" } | { phase: "loading"; key: string } | ReadyState | { phase: "error"; key: string };

/** 단지 없이 도는 도구(경제 모니터)의 컨텍스트 키 */
const ECONOMY_KEY = "region:강남구";

export function WorkbenchClient({
  tool,
  title,
  tips,
  persona,
  fields,
  llmAvailable = false,
  quickPicks = [],
  resultKind,
}: {
  tool: AiAnalysisToolId;
  /** 도구 이름 — 지도 서랍 제목("시세 예측")에 쓴다 */
  title: string;
  tips: string[];
  /* [993] 서버에 외부 모델 키가 있을 때만 "AI 해설" 선택을 보인다 */
  llmAvailable?: boolean;
  /* [981] 이 도구의 보정 입력 — 서버가 골라 내려준다(lib/ai/tool-tuning-fields.ts) */
  fields: readonly TuningField[];
  /* [980] 도구 성격(색·말투) — 서버가 골라 내려 준다(16종 문자열을 번들에 싣지 않게) */
  persona: ToolPersona;
  /** [1008] 첫 방문 빠른 선택 — 서버(ISR)가 실데이터로 고른 거래 많은 단지. 없으면 줄을 그리지 않는다 */
  quickPicks?: readonly QuickPick[];
  /** [1008] 이 도구가 보여 주는 결과 한 줄(첫 방문 안내 3단계의 마지막) */
  resultKind: string;
}) {
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  /* [AI-22] 비교 도구는 최대 3단지 트레이 */
  const [compareTray, setCompareTray] = useState<PickedComplex[]>([]);
  const compareCountRef = useRef(0);
  compareCountRef.current = compareTray.length;
  const compareTrayRef = useRef(compareTray);
  compareTrayRef.current = compareTray;
  const [ctxState, setCtxState] = useState<CtxState>({ phase: "idle" });
  const [tuning, setTuning] = useState<Record<string, string | boolean>>({});
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const autofillRef = useRef<AutofillState>(EMPTY_AUTOFILL);
  /* [1008 · 리뷰 A-3] 입력이 곧 결과인 도구(수익률 계산·계약 점검·갭)는 ② 를 펼쳐 둔다 */
  const [condOpen, setCondOpen] = useState(tool === "ai-simulator" || tool === "contract-risk" || tool === "ai-gap");
  const [useLlm, setUseLlm] = useState(false);
  const [running, setRunning] = useState(false);
  const [runningLlm, setRunningLlm] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  /* [1009 · A] ③ 버튼의 결과 반응 — 진행(링) → 완료(체크) / 실패(흔들림) 뒤 원래 문구로(ActionButton).
     예전엔 "계산하는 중…" 문구만 바뀌고 끝나서, 데스크톱(결과가 오른쪽에 그대로 있는 화면)에서는 다시 계산이
     됐는지 알 길이 없었다. */
  const [runFlash, setRunFlash] = useState<"done" | "error" | null>(null);
  /* 실패 원인 코드 — 결과(전환으로 늦게 그려짐)와 별개로 버튼 문구가 바로 쓴다 */
  const [runErrCode, setRunErrCode] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const { showToast } = useToast();
  /* [1009 · A · 리뷰] 토스트는 루트 레이아웃에 있어 화면을 떠나도 남는다 — 떠난 뒤 누른 "되돌리기"가 조용히
     아무것도 안 하지 않게, 이 화면이 살아 있는지 본다 */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);
  const flash = useCallback((k: "done" | "error") => {
    setRunFlash(k);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setRunFlash(null), 1600);
  }, []);
  const [signedIn, setSignedIn] = useState(false);

  const isCompare = tool === "ai-compare";
  const isPortfolio = tool === "ai-portfolio";
  const isEconomy = tool === "ai-economy";
  const isContract = tool === "contract-risk";
  const needsComplex = !isEconomy && !isContract;
  const coreTool = isCoreAiAnalysisToolId(tool);

  /* [AI-35] 프리셋 — 저장해 둔 단지 원클릭 복원. 게스트는 부르지 않는다(hasSession 은 힌트 쿠키 관문) */
  const [presets, setPresets] = useState<
    { id: string; name: string; objective: { complexId?: string; complexName?: string; region?: string } }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    void hasSession().then((ok) => {
      if (cancelled) return;
      setSignedIn(ok);
      if (!ok) return;
      fetch(`/api/ai/presets?tool=${tool}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled && Array.isArray(j?.presets)) setPresets(j.presets.slice(0, 5));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [tool]);

  /* [1008 · 리뷰 A-3] 결과 숫자가 실제로 쓰는 칸(calc)과 AI 해설에만 들어가는 칸을 나눈다 — 기본 실행에서
     바꿔도 숫자가 그대로인 칸을 "내 조건"이라며 보이지 않게(죽은 입력) */
  const calcFields = fields.filter((f) => f.calc);
  const aiFields = fields.filter((f) => !f.calc);
  const hasCalc = calcFields.length > 0;
  /* 계산 도구는 "AI 해설도 받기"를 켰을 때만 AI 칸을 보이고, 계산이 없는 도구는 실행 자체가 AI 해설이다 */
  const aiMode = llmAvailable && (hasCalc ? useLlm : true);
  const visibleFields = hasCalc ? [...calcFields, ...(aiMode ? aiFields : [])] : aiMode ? aiFields : [];
  const fieldKeys = fields.map((f) => f.key);
  const fieldKeysRef = useRef(fieldKeys);
  fieldKeysRef.current = fieldKeys;

  /* 단지 컨텍스트 — 같은 단지를 두 번 부르지 않는다(피커는 고른 순간과 상세를 받은 뒤 두 번 onSelect 한다).
     봇은 부르지 않는다: 피커가 ?complexId= 딥링크를 스스로 읽어 onSelect 를 부르므로 여기서 막아야
     1007 의 게이트(useHumanGate)가 새지 않는다. */
  const loadingKeyRef = useRef<string | null>(null);
  /* 같은 단지를 force 로 다시 받을 때 늦게 온 옛 응답이 새 응답을 덮지 않게 — 마지막 요청만 반영 */
  const loadSeqRef = useRef(0);
  const loadContext = useCallback(
    async (id: string, opts: { compareCount?: number; force?: boolean } = {}) => {
      if (isBotBrowser()) return;
      /* force — 같은 단지라도 다시 받는다(비교 묶음에서 단지를 빼 "N곳" 이 바뀐 때) */
      if (!opts.force && loadingKeyRef.current === id) return;
      loadingKeyRef.current = id;
      const seq = ++loadSeqRef.current;
      setCtxState({ phase: "loading", key: id });
      try {
        const res = await fetch(
          `/api/ai/context?complexId=${encodeURIComponent(id)}&tool=${encodeURIComponent(tool)}&series=1${
            tool === "ai-compare" ? `&compare=${opts.compareCount ?? compareCountRef.current}` : ""
          }`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (loadingKeyRef.current !== id || seq !== loadSeqRef.current) return;
        if (!res.ok || !json.ok) throw new Error("context");
        const cx = json.context?.complex as { id: string; name: string; region: string } | null;
        if (cx) {
          /* 같은 단지면 피커가 준 표기(regionLabel)는 두되, 지역 이름이 비었으면 서버 값으로 채운다
             (관심 단지 목록에서 고른 단지는 지역 자리에 단지 id 문자열이 들어가던 것 — 리뷰 A-22) */
          setPicked((prev) =>
            prev && prev.id === id
              ? prev.region
                ? prev
                : ({ ...prev, region: cx.region, regionLabel: prev.regionLabel || cx.region } as PickedComplex)
              : ({ id: cx.id, name: cx.name, region: cx.region, regionId: null, regionLabel: cx.region, priceLabel: null } as PickedComplex),
          );
        }
        /* [1008] 기준 가격 자동 채움 — 비었거나 우리가 채운 값이면 새 값, 사용자가 고친 값은 그대로 */
        const af = applyPriceAutofill({
          tuning: tuningRef.current,
          prev: autofillRef.current,
          complexId: id,
          fieldKeys: fieldKeysRef.current,
          suggestion: priceManString(json.context?.complex?.price?.priceKrw),
        });
        autofillRef.current = af.state;
        if (af.changed) setTuning(af.tuning);
        setCtxState({
          phase: "ready",
          key: id,
          ctx: json.context,
          footnotes: json.footnotes ?? [],
          insight: json.insight,
          similar: Array.isArray(json.similar) ? json.similar : [],
          verdict: json.verdict ?? null,
          series: json.series ?? null,
        });
      } catch {
        if (loadingKeyRef.current === id && seq === loadSeqRef.current) {
          loadingKeyRef.current = null;
          setCtxState({ phase: "error", key: id });
        }
      }
    },
    [tool],
  );

  const onPick = useCallback(
    (c: PickedComplex) => {
      /* 비교 도구 — 담은 수를 결론 문장("N곳을 나란히")에 바로 쓰게 새 수를 함께 넘긴다(상태 갱신은 다음 렌더) */
      let compareCount: number | undefined;
      if (isCompare) {
        const prev = compareTrayRef.current;
        const next = prev.some((x) => x.id === c.id) || prev.length >= 3 ? prev : [...prev, c];
        compareCount = next.length;
        setCompareTray(next);
      }
      /* 다른 단지로 바꾸면 옛 실행 결과를 내린다(옛 단지 결론이 새 단지 화면에 섞이지 않게) */
      if (pickedRef.current?.id !== c.id) setResult(null);
      setPicked(c);
      void loadContext(c.id, { compareCount });
    },
    [isCompare, loadContext],
  );

  const applyPreset = useCallback(
    (p: { objective: { complexId?: string; complexName?: string; region?: string } }) => {
      const o = p.objective;
      if (!o.complexId || !o.complexName) return;
      onPick({
        id: o.complexId,
        name: o.complexName,
        region: o.region ?? "",
        regionId: null,
        regionLabel: o.region ?? null,
        priceLabel: null,
      } as PickedComplex);
    },
    [onPick],
  );

  /* [1007 · V2a-4] 딥링크(?complexId= · ?apt=&region=)와 비교 트레이(?ids=)·경제 모니터는 사람일 때만.
     [OPT-48] base64url 인코딩은 서버의 encodeComplexId(region + \x01 + name)와 같은 규칙. */
  const humanReady = useHumanGate();
  useEffect(() => {
    if (!humanReady) return;
    const sp = new URLSearchParams(window.location.search);
    if (isCompare) {
      const ids = (sp.get("ids") ?? "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 3);
      if (ids.length === 0) return;
      let cancelled = false;
      (async () => {
        const resolved: PickedComplex[] = [];
        for (const id of ids) {
          try {
            const res = await fetch(`/api/ai/context?complexId=${encodeURIComponent(id)}&tool=${encodeURIComponent(tool)}`, { cache: "no-store" });
            const json = await res.json();
            const cx = json?.context?.complex as { id: string; name: string; region: string } | null;
            if (cx) resolved.push({ id: cx.id, name: cx.name, region: cx.region, regionId: null, regionLabel: cx.region, priceLabel: null } as PickedComplex);
          } catch {
            /* 하나 실패해도 나머지는 이어 받는다 */
          }
        }
        if (cancelled || resolved.length === 0) return;
        setCompareTray(resolved);
        setPicked(resolved[0]);
        void loadContext(resolved[0].id, { compareCount: resolved.length });
      })();
      return () => {
        cancelled = true;
      };
    }
    let id = sp.get("complexId");
    if (!id) {
      const apt = sp.get("apt")?.trim();
      const region = sp.get("region")?.trim();
      if (apt && region) {
        const bytes = new TextEncoder().encode(`${region}\u0001${apt}`);
        let bin = "";
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        id = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }
    }
    if (id) void loadContext(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanReady, isCompare]);

  /* [AI-16] 경제 모니터는 지역 없이도 거시 축만으로 */
  useEffect(() => {
    if (!isEconomy || !humanReady || isBotBrowser()) return;
    setCtxState({ phase: "loading", key: ECONOMY_KEY });
    fetch(`/api/ai/context?region=강남구&tool=${encodeURIComponent(tool)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) =>
        json?.ok
          ? setCtxState({
              phase: "ready",
              key: ECONOMY_KEY,
              ctx: json.context,
              footnotes: json.footnotes ?? [],
              insight: json.insight,
              similar: [],
              verdict: json.verdict ?? null,
              series: null,
            })
          : setCtxState({ phase: "error", key: ECONOMY_KEY }),
      )
      .catch(() => setCtxState({ phase: "error", key: ECONOMY_KEY }));
  }, [isEconomy, tool, humanReady]);

  /* [975] 지도에서 고르기 — 서랍은 열 때만 내려받고, 고른 값은 위 onPick 을 탄다. */
  const { openMap, mapNode } = useMapPick(onPick, title);

  /* [AI-25] 포트폴리오 — 관심 단지 자동 로드 */
  const [portfolio, setPortfolio] = useState<PortfolioItem[] | null>(null);
  const loadPortfolio = useCallback(async () => {
    try {
      if (!(await hasSession())) {
        setPortfolio([]);
        return;
      }
      const res = await fetch("/api/me/watchlist", { cache: "no-store" });
      if (res.status === 401) {
        setPortfolio([]);
        return;
      }
      const json = await res.json();
      const items = (Array.isArray(json.items) ? json.items : []) as {
        complexId: string;
        complexName: string;
        lastPriceKrw?: number | null;
        lastPriceBand?: string | null;
      }[];
      /* [1008 · 리뷰 A-3·22] 목록 전체의 쏠림(지역·가격대)은 결과 칸의 "관심 단지 구성" 카드가 센다.
         예전엔 첫 단지를 골라 그 단지 결과만 보였고, 지역 자리에 단지 id 문자열이 들어갔다. */
      setPortfolio(
        items.map((i) => ({
          complexId: i.complexId,
          complexName: i.complexName,
          lastPriceKrw: typeof i.lastPriceKrw === "number" ? i.lastPriceKrw : null,
          lastPriceBand: i.lastPriceBand ?? null,
        })),
      );
    } catch {
      setPortfolio([]);
    }
  }, []);

  const ready = ctxState.phase === "ready" ? ctxState : null;
  const ctx = ready?.ctx ?? null;
  const activeKey = ready?.key ?? null;
  const shownResult = result && result.forKey === activeKey ? result : null;
  const shownVerdict = shownResult?.ok && shownResult.verdict ? shownResult.verdict : (ready?.verdict ?? null);

  const run = useCallback(async () => {
    if (running || !ready) return;
    /* 계산이 없는 도구는 실행이 곧 AI 해설 요청이다 */
    const askLlm = aiMode;
    const forKey = ready.key;
    /* [1008 · 리뷰 A-15] 우리가 자동으로 채운 뒤 사용자가 안 건드린 값은 보내지 않는다 — 서버가 같은 최근
       실거래가를 쓰고, 결과도 "내가 넣은 기준 가격"이 아니라 "최근 실거래가"에서 출발했다고 말한다 */
    const auto = autofillRef.current.values;
    const effective: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(tuning)) if (!(typeof v === "string" && auto[k] != null && auto[k] === v)) effective[k] = v;
    const calcInput = buildTuningInput(calcFields, effective);
    const appliedCalc = Object.keys(calcInput).length > 0;
    if (askLlm && !(await hasSession())) {
      /* 로그인이 필요한 요청을 보내 401 을 맞지 않는다 — 결과 자리에서 로그인 안내 */
      setResult({ ok: false, source: "client", degraded: false, reasonCode: null, markdown: "", code: "LOGIN_REQUIRED", forKey, at: Date.now(), askedLlm: true });
      return;
    }
    setRunning(true);
    setRunningLlm(askLlm);
    try {
      const input: Record<string, unknown> = {
        complexId: picked?.id ?? null,
        complexName: picked?.name ?? null,
        region: picked?.region ?? ctx?.region?.name ?? null,
        /* [993] 판단 카드(임장 동선)가 "함께 볼 단지" 수를 적는 데 쓴다 */
        similarCount: ready.similar.length,
        /* [981] 도구별 보정 입력 — 비운 칸은 키 자체가 빠진다. AI 칸은 AI 해설을 부를 때만 */
        ...(askLlm ? buildTuningInput(aiFields, effective) : {}),
        ...calcInput,
        _promptVersion: "v2",
        /* [AI-02] 실행 시점 컨텍스트 요약을 입력 스냅샷에 고정 — 재현 근거 */
        live: ctx
          ? {
              priceKrw: ctx.complex?.price?.priceKrw ?? null,
              regionAvgSale: ctx.region?.snapshot?.avgSale ?? null,
              jeonseRatio: ctx.region?.snapshot?.jeonseRatio ?? null,
              monthlyChangePct: ctx.region?.snapshot?.saleChangeMonthly ?? null,
              tradeCount: ctx.region?.snapshot?.tradeCount ?? null,
              wolseSharePct: ctx.rent?.wolseSharePct ?? null,
              upcomingHouseholds: ctx.supply?.upcomingHouseholds ?? null,
              baseRatePct: ctx.macro?.baseRatePct ?? null,
              unsoldUnits: ctx.region?.demographics?.unsoldUnits ?? null,
              noteAvgScore: ctx.notes?.avgScore ?? null,
            }
          : null,
        compare: isCompare ? compareTray.map((c) => ({ id: c.id, name: c.name, region: c.region })) : undefined,
        portfolio: isPortfolio && portfolio ? portfolio : undefined,
      };
      const res = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input, skipExternalLlm: !askLlm }),
      });
      /* [1009 · A · 리뷰] JSON 이 아닌 응답(5xx·504 게이트웨이 페이지)을 "인터넷 연결 확인"으로 말하던 것 — 연결은
         됐고 서버가 못 답한 것이다. 상태 코드로 원인을 적는다(진짜 연결 실패만 아래 catch 로 간다). */
      const parsed = (await res.json().catch(() => null)) as RunResult | null;
      const json: RunResult =
        parsed ??
        ({
          ok: false,
          source: "error",
          degraded: true,
          reasonCode: res.status === 504 ? "TIMEOUT" : "SERVER",
          markdown: "",
          error:
            res.status === 504
              ? "계산이 너무 오래 걸려 멈췄어요 — 잠시 뒤 다시 눌러 주세요."
              : res.status === 429
                ? "너무 자주 눌렀어요 — 1분쯤 뒤에 다시 눌러 주세요."
                : `서버가 답하지 못했어요(${res.status}) — 잠시 뒤 다시 눌러 주세요.`,
        } as RunResult);
      const ok = res.ok && json.ok !== false;
      /* [OPT-50] 결과 렌더는 무거운 갱신 — 전환으로 미뤄 입력 반응성(INP)을 지킨다 */
      startTransition(() => {
        setResult({ ...json, ok, forKey, at: Date.now(), askedLlm: askLlm, appliedCalc });
      });
      setRunErrCode(ok ? null : (json.code ?? null));
      flash(ok ? "done" : "error");
      window.setTimeout(() => {
        const target = document.getElementById(askLlm ? "ai-narrative" : "ai-result");
        if (target && (askLlm || window.innerWidth < 1024)) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch {
      setResult({ ok: false, source: "error", degraded: true, reasonCode: "NETWORK", markdown: "", error: "실행하지 못했어요 — 인터넷 연결을 확인하고 다시 눌러 주세요.", forKey, at: Date.now(), askedLlm: askLlm });
      setRunErrCode(null);
      flash("error");
    } finally {
      setRunning(false);
    }
  }, [running, ready, aiMode, picked, ctx, calcFields, aiFields, tuning, isCompare, compareTray, isPortfolio, portfolio, tool, flash]);
  const runState: ActionState = running ? "busy" : (runFlash ?? "idle");

  const priceKrw = ctx?.complex?.price?.priceKrw ?? null;
  /* [1008 · 리뷰 A-3] ③ 은 누르면 실제로 달라지는 게 있을 때만 — 결과가 쓰는 입력(calc)이 있거나 AI 해설을 받을 수 있을 때 */
  const showRun = Boolean(ready) && (hasCalc || llmAvailable);
  const retry = () => {
    const key = ctxState.phase === "error" ? ctxState.key : null;
    if (key && key !== ECONOMY_KEY) {
      loadingKeyRef.current = null;
      void loadContext(key);
    }
  };

  return (
    <>
      {mapNode}
      {/* [993] 데스크톱: 입력 좌(380px)·결과 우. [1008] 모바일 순서 ① → 결과 → ②③ (결과까지 스크롤 없음) */}
      {/* 행 2개(auto · 1fr) — 결과 열이 두 행을 차지해도 ① 행이 늘어나 ①·② 사이가 벌어지지 않게 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-4">
        {/* ── ① 단지 고르기 ── */}
        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          {(needsComplex || isContract) && (
            <section className="card flex flex-col gap-2.5 rounded-2xl p-4" aria-label="단지 고르기">
              <h2 className="t-body font-extrabold text-ink">① 단지 고르기</h2>
              {isContract && (
                <p className="t-sub text-text-2">
                  단지를 고르면 그 지역 평균 전세가율을 참고값으로 보여 줘요. ② 에 이 집 전세가율·보증금과 확인 여부를
                  넣으면 이 계약 기준으로 다시 계산해요. 계약서 항목은{" "}
                  <Link href="/safety" className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
                    전세 안전 셀프체크 ›
                  </Link>
                </p>
              )}
              {/* [970 · B-27] 위 제목이 라벨이다 · [975] 지도 서랍 · [1008] 고른 단지는 아래 카드가 말한다(피커 칩은 끈다 —
                  동선·빠른 선택으로 단지가 바뀌어도 칩이 옛 단지를 가리키던 어긋남) */}
              {/* [1008 · 리뷰 B-1] 딥링크(?complexId=·?apt=&region=)는 워크벤치가 스스로 푼다 — 피커가 URL 을 다시 읽으면
                  `?apt=은마&region=대구 북구` 가 이름 검색으로 강남 은마에 덮였다. 초기값을 null 로 막는다 */}
              <ComplexPicker
                onSelect={onPick}
                label=""
                onMapClick={openMap}
                showChip={false}
                clearOnSelect
                initialComplexId={null}
                initialApt={null}
                placeholder="단지 이름 (예: 공작아파트)"
              />
              {picked && (
                <div className="flex flex-col gap-0.5 rounded-[12px] bg-primary-soft px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="break-words t-body font-extrabold text-ink">{picked.name}</b>
                    <span className="t-sub font-bold text-text-2">{picked.regionLabel || picked.region}</span>
                  </div>
                  <span className="t-sub text-text-2">
                    {ctxState.phase === "loading"
                      ? "실거래·전월세·입주 예정·지역 통계를 불러오는 중…"
                      : priceKrw
                        ? /* [1008 · 리뷰 A-14] 무엇의 평균인지 적는다 — 관심단지·알림은 면적대 기준이라 값이 다를 수 있다 */
                          `최근 실거래 ${formatKrwWon(priceKrw, { style: "short" })} · ${ctx?.complex?.price?.bandLabel ?? ""} 최근 ${ctx?.complex?.price?.sample ?? ""}건 평균`
                        : ready
                          ? ctx?.unavailable?.includes("실거래가")
                            ? "실거래가를 지금 불러오지 못했어요"
                            : "최근 매매 실거래가 적어 대표 가격이 없어요"
                          : ""}
                  </span>
                </div>
              )}
              {presets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="t-sub font-bold text-text-3">즐겨 쓰는 단지</span>
                  {presets.map((p) => (
                    <button key={p.id} type="button" onClick={() => applyPreset(p)} className="chip press min-h-[40px] border border-line bg-bg px-2.5 t-sub font-bold text-text-1">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {isCompare && compareTray.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {compareTray.map((c) => (
                    <span key={c.id} className="chip inline-flex min-h-[40px] items-center border border-line bg-bg pl-2.5 t-sub font-bold text-text-1">
                      {c.name}
                      <button
                        type="button"
                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center text-text-3"
                        aria-label={`${c.name} 빼기`}
                        onClick={() => {
                          /* [1008 · 리뷰 A-3] 빼면 결론("N곳을 나란히")·AI 해설이 옛 묶음 것으로 남지 않게 —
                             옛 실행 결과를 내리고 새 수로 결과 요약을 다시 받는다(담을 때와 같은 규칙) */
                          const next = compareTrayRef.current.filter((x) => x.id !== c.id);
                          setCompareTray(next);
                          setResult(null);
                          const cur = pickedRef.current;
                          if (cur) void loadContext(cur.id, { compareCount: next.length, force: true });
                          /* [1009 · A] 빼기는 되돌릴 수 있게(확인 창 대신 토스트의 "되돌리기") */
                          showToast(`${c.name}을(를) 비교에서 뺐어요`, {
                            label: "되돌리기",
                            onClick: () => {
                              /* [1009 · A · 리뷰] 되돌리지 못하는 경우를 조용히 넘기지 않는다(예전: 3곳이 차 있으면 무반응) */
                              if (!mountedRef.current) {
                                showToast("비교 화면을 떠나 되돌리지 못했어요");
                                return;
                              }
                              const now = compareTrayRef.current;
                              if (now.some((x) => x.id === c.id)) {
                                showToast(`${c.name}은(는) 이미 비교에 있어요`);
                                return;
                              }
                              if (now.length >= 3) {
                                showToast("되돌리지 못했어요 · 비교는 최대 3곳이에요");
                                return;
                              }
                              const back = [...now, c];
                              setCompareTray(back);
                              setResult(null);
                              const p = pickedRef.current;
                              if (p) void loadContext(p.id, { compareCount: back.length, force: true });
                            },
                          });
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <span className="t-caption text-text-3">최대 3곳 — 검색으로 더 담기</span>
                </div>
              )}
              {isPortfolio && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void loadPortfolio()} className="btn-secondary btn-md px-3 t-sub">
                    내 관심 단지 불러오기
                  </button>
                  {portfolio && (
                    <span className="t-sub text-text-3">
                      {portfolio.length > 0 ? `${portfolio.length}곳 불러옴` : "관심 단지가 없어요(로그인·담기 필요)"}
                    </span>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── 결과 ── */}
        <div id="ai-result" className="flex scroll-mt-20 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {ctxState.phase === "idle" && needsComplex && !(isPortfolio && portfolio && portfolio.length > 0) && (
            <FirstVisitGuide resultKind={resultKind} tips={tips} quickPicks={quickPicks} onQuickPick={(q) => onPick({ id: q.id, name: q.name, region: q.region, regionId: null, regionLabel: q.region, priceLabel: null } as PickedComplex)} />
          )}
          {ctxState.phase === "idle" && isContract && (
            <div className="card rounded-2xl p-4 t-body text-text-2">단지를 고르면 전세 계약 위험도가 여기에 바로 나와요.</div>
          )}
          {ctxState.phase === "loading" && <ResultSkeleton />}
          {ctxState.phase === "error" && (
            <div className="card flex flex-col items-start gap-2 rounded-2xl p-4" role="status">
              <p className="t-body font-bold text-warning">자료를 불러오지 못했어요 — 자료가 없는 것과는 달라요.</p>
              {ctxState.key !== ECONOMY_KEY && (
                <button type="button" onClick={retry} className="btn-secondary btn-md px-4 t-sub">
                  다시 불러오기
                </button>
              )}
            </div>
          )}
          {isPortfolio && portfolio && portfolio.length > 0 && (
            <PortfolioMixLazy items={portfolio} pickedId={picked?.id ?? null} onPick={(it) => onPick({ id: it.complexId, name: it.complexName, region: "", regionId: null, regionLabel: null, priceLabel: null } as PickedComplex)} />
          )}
          {ready && ctx && (
            <ResultViewLazy
              tool={tool}
              coreTool={coreTool}
              picked={picked ? { id: picked.id, name: picked.name, region: picked.region } : null}
              ctx={ctx}
              verdict={shownVerdict}
              insight={ready.insight}
              footnotes={ready.footnotes}
              series={ready.series}
              similar={ready.similar}
              result={shownResult}
              compareTray={isCompare ? compareTray.map((c) => ({ id: c.id, name: c.name, region: c.region })) : null}
              running={running}
              askedLlm={runningLlm}
              character={persona.character}
              fallbackAction={persona.nextAction}
              onPickSimilar={(s: Similar) =>
                onPick({ id: s.id, name: s.name, region: picked?.region ?? "", regionId: null, regionLabel: picked?.regionLabel ?? picked?.region ?? null, priceLabel: null } as PickedComplex)
              }
            />
          )}
          {/* [996] 다른 도구로 본 이 단지 — 비교·포트폴리오는 대상이 여럿이라 세우지 않는다 */}
          {picked && ready && !isCompare && !isPortfolio && (
            /* [1008 · 리뷰 A-19] 보드의 이 도구 칸은 화면 위와 같은 결과(실행했으면 실행 결과)로 */
            <VerdictBoardLazy tool={tool} complexId={picked.id} complexName={picked.name} region={picked.region} verdict={shownVerdict} />
          )}
        </div>

        {/* ── ② 내 조건 · ③ 분석 실행 ── */}
        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
          {ready && visibleFields.length > 0 && (
            <section className="card rounded-2xl" aria-label="내 조건">
              <button
                type="button"
                onClick={() => setCondOpen((v) => !v)}
                aria-expanded={condOpen}
                className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
              >
                <span className="t-body font-extrabold text-ink">
                  {hasCalc ? "② 내 조건" : "② AI 해설에 넣을 조건"} <span className="t-sub font-bold text-text-3">(선택)</span>
                </span>
                <span className="t-sub font-bold text-primary">{condOpen ? "접기" : "펼치기"}</span>
              </button>
              {condOpen && (
                <div className="border-t border-line px-4 pb-4">
                  <TuningFormLazy fields={visibleFields} value={tuning} onChange={setTuning} autoValues={autofillRef.current.values} />
                </div>
              )}
            </section>
          )}

          {showRun && (
            <section className="card flex flex-col gap-2.5 rounded-2xl p-4" aria-label={hasCalc ? "다시 계산" : "AI 해설 받기"}>
              <h2 className="t-body font-extrabold text-ink">{hasCalc ? "③ 내 조건으로 다시 계산" : "③ AI 해설 받기"}</h2>
              {/* [1008 · 리뷰 A-3] 누르면 실제로 하는 일만 말한다 — 입력을 결과가 쓰는 도구만 "다시 계산" */}
              <p className="t-sub text-text-2">
                {hasCalc
                  ? "숫자·그래프는 단지를 고르면 바로 나와요. ② 에 넣은 값으로 결과를 다시 계산해요."
                  : "숫자·그래프는 위에 이미 있어요. AI 해설은 외부 AI 모델이 위 숫자를 문장으로 풀어 줘요(로그인 필요)."}
                {signedIn ? " 결과는 내 분석 기록에 저장돼요." : hasCalc ? " 로그인하면 결과가 내 분석 기록에 저장돼요." : ""}
              </p>
              {hasCalc && llmAvailable && (
                <label className="flex min-h-[40px] items-center gap-2 t-sub font-bold text-text-1">
                  <input type="checkbox" className="h-5 w-5" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                  AI 해설도 받기 <span className="font-medium text-text-3">(로그인 필요 · 외부 AI 모델)</span>
                </label>
              )}
              <ActionButton
                state={runState}
                onClick={() => void run()}
                disabled={!ready}
                busyLabel={runningLlm ? "AI 해설 쓰는 중" : "계산하는 중"}
                doneLabel={runningLlm || aiMode ? "결과를 새로 받았어요" : "다시 계산했어요"}
                errorLabel={
                  /* [1009 · A · 리뷰] 다시 눌러도 안 되는 실패(무료 해설 소진·로그인 필요)에 "다시 눌러 주세요"를 띄우지 않는다 */
                  runErrCode === "QUOTA_EXCEEDED"
                    ? "무료 해설을 다 썼어요"
                    : runErrCode === "LOGIN_REQUIRED"
                      ? "로그인이 필요해요"
                      : "다시 눌러 주세요"
                }
                className={`btn-lg w-full ${runState === "idle" && ready ? "glow" : ""}`}
              >
                {hasCalc ? (aiMode ? "다시 계산 · AI 해설 받기" : "내 조건으로 다시 계산") : "AI 해설 받기"}
              </ActionButton>
              {signedIn && (
                <Link href="/my/analyses" className="inline-flex min-h-[24px] items-center self-start t-sub font-bold text-text-3 no-underline">
                  내 분석 기록 ›
                </Link>
              )}
            </section>
          )}

          {/* [AI-29] 경제 모니터 — 기준금리 알림 */}
          {isEconomy && ready && ctx?.macro?.baseRatePct != null && <EconomyWatchPanel currentRate={ctx.macro.baseRatePct} />}
        </div>
      </div>
    </>
  );
}

/* ── [1008] 첫 방문 안내 — 단지를 고르기 전 오른쪽(모바일은 검색 아래) ─────────────── */
function FirstVisitGuide({
  resultKind,
  tips,
  quickPicks,
  onQuickPick,
}: {
  resultKind: string;
  tips: readonly string[];
  quickPicks: readonly QuickPick[];
  onQuickPick: (q: QuickPick) => void;
}) {
  const steps = [
    { t: "단지 고르기", d: "이름으로 검색하거나 지도에서 눌러요." },
    { t: "자료는 자동으로", d: "국토부 실거래·전월세 신고·입주 예정·한국부동산원 통계를 불러와요." },
    { t: "숫자·그래프로 결과", d: resultKind },
  ];
  return (
    <section className="card flex flex-col gap-4 rounded-2xl p-4 md:p-5" aria-label="이렇게 써요">
      <h2 className="t-section font-extrabold text-ink">이렇게 써요</h2>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-2.5 rounded-[12px] bg-bg px-3 py-3 sm:flex-col sm:gap-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary t-sub font-extrabold text-white">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <b className="t-body font-extrabold text-ink">{s.t}</b>
              <span className="t-sub text-text-2">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
      {quickPicks.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="t-sub font-extrabold text-text-1">처음이라면 — 최근 거래가 많은 단지로 둘러보기</span>
          <div className="flex flex-wrap gap-1.5">
            {quickPicks.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onQuickPick(q)}
                className="chip press flex min-h-[40px] flex-col items-start border border-line bg-surface px-3 py-1.5 text-left"
              >
                <span className="t-sub font-extrabold text-ink">{q.name}</span>
                <span className="t-caption text-text-3">
                  {q.region} · 최근 6개월 {q.recentTrades.toLocaleString("ko-KR")}건
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {tips.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-line pt-3">
          {tips.map((t) => (
            <li key={t} className="t-sub text-text-3">
              · {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* [AI-29] 기준금리 임계 알림 등록 패널 */
function EconomyWatchPanel({ currentRate }: { currentRate: number }) {
  const [threshold, setThreshold] = useState(String(Math.round((currentRate + 0.25) * 100) / 100));
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail" | "login">("idle");
  const [note, setNote] = useState("");
  const { showToast } = useToast();

  const submit = async () => {
    if (state === "busy") return;
    /* [1009 · A · 리뷰] 원인별 문구 — 숫자가 틀렸을 때만 "숫자를 확인", 서버 오류·너무 잦은 요청은 그대로 말한다 */
    const t = Number(threshold);
    if (!Number.isFinite(t) || t <= 0 || t > 20) {
      setState("fail");
      setNote("0보다 크고 20 이하인 %로 넣어 주세요(예: 3.25).");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/me/economy-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: "base_rate", threshold: Number(threshold), direction }),
      });
      const json: { ok?: boolean; note?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.status === 401) setState("login");
      else if (res.ok && json.ok) {
        setState("done");
        setNote(json.note ?? "");
        /* [1009 · A] 결과는 토스트로 — 무엇을 걸었는지 한 문장 */
        /* 토스트는 한 줄(알림함 버튼과 함께) — 조건은 아래 안내 글(note)에 문장으로 남는다 */
        showToast(`알림 걸었어요 · ${threshold}% ${direction === "above" ? "이상" : "이하"}이면`, {
          label: "알림함",
          href: "/notifications",
        });
      } else {
        setState("fail");
        setNote(
          res.status === 400
            ? (json.error ?? "알림을 걸지 못했어요 — 숫자(예: 3.25)를 확인하고 다시 눌러 주세요.")
            : res.status === 429
              ? "너무 자주 눌렀어요 — 1분쯤 뒤에 다시 눌러 주세요."
              : json.error
                ? `알림을 걸지 못했어요 — ${json.error}`
                : `알림을 걸지 못했어요 — 서버가 답하지 못했어요(${res.status}). 잠시 뒤 다시 눌러 주세요.`,
        );
      }
    } catch {
      setState("fail");
      setNote("알림을 걸지 못했어요 — 인터넷 연결을 확인하고 다시 눌러 주세요.");
    }
  };

  return (
    <div id="economy-watch" className="card scroll-mt-20 rounded-2xl p-4">
      <div className="t-body font-extrabold text-ink">
        기준금리 알림 걸기{" "}
        <span className="t-sub font-medium text-text-3">지금 {currentRate}% · 조건이 되면 알림함으로 한 번</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "above" | "below")}
          aria-label="알림 조건"
          className="min-h-[40px] rounded-[10px] border border-line bg-surface px-2.5 t-body font-bold text-ink"
        >
          <option value="above">이상으로 오르면</option>
          <option value="below">이하로 내리면</option>
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          aria-label="기준금리(%)"
          className="min-h-[40px] w-[90px] rounded-[10px] border border-line bg-surface px-3 t-body font-bold text-ink"
        />
        <span className="t-sub font-bold text-text-2">%</span>
        <ActionButton
          state={state === "busy" ? "busy" : state === "done" ? "done" : state === "fail" ? "error" : "idle"}
          onClick={() => void submit()}
          busyLabel="등록하는 중"
          doneLabel="알림 걸었어요"
          errorLabel="다시 등록"
          className="btn-md"
        >
          알림 등록
        </ActionButton>
      </div>
      {state === "login" && <p className="mt-1.5 t-sub font-bold text-warning">로그인하면 알림을 걸 수 있어요.</p>}
      {note && <p className="mt-1.5 t-sub text-text-3">{note}</p>}
    </div>
  );
}
