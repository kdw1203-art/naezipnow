"use client";
/* [1026b · AI 분석 8종] 나머지 8종(리스크 점검·비교·수익률 계산·갭·경제지표·자산 구성·체크리스트·계약 점검)도 4종과 같은 틀 하나 —
   예전 "① 단지 고르기 · ② 내 조건 · ③ 다시 계산(도구 색 채움 버튼)" 3칸 화면과 "이렇게 써요" 안내·맨 아래 보드를 걷었다.
   절차 한 줄(lib/ai/tool-steps — 비교 "단지 · N곳" · 경제지표 "지역" · 자산 구성 "관심 단지 · N곳") · 결론 히어로·대표 그림(ResultView) ·
   레일 = 내 조건(lg) + 다음 행동 카드(도구별 채움 파랑 하나 — ResultRail · 폰 하단 바가 같은 요소) · 빈 상태 = 카드 하나 + 회색 견본 + 한 문장.
   "로그인하고 AI 해설 받기"(채움)는 다음 행동의 텍스트 링크로, "내 조건으로 다시 계산"은 보조(테두리) 버튼으로. 기준금리 알림 패널은 레일 청크로
   옮겼다(첫 로드에서 빠짐). 데이터 로딩·재계산·저장·비교 담기/빼기·관심 단지 불러오기는 그대로. */
/* [1026 · 단지 분석 4종] 1025 표준 — ① 머리 아래 절차 한 줄(StepLine: 단지 · {단지명} → 내 조건 → 결과 · {판정} → 다음 행동)
   ② 결론 히어로·대표 그림·세부 접힘은 ResultView ③ 레일 340(minmax(0,1fr)_340px) = 내 조건(lg) + 다음 행동 카드(채움 파랑 "임장노트에 담기"
   하나 + 텍스트 링크) — 레일은 한 번만 그리고 폰에서는 본문 뒤로 이어지며, 채움 파랑은 폰 하단 바(MobilePrimaryBar · 레일 청크)가 든다
   ④ "다시 계산"은 보조(테두리) 버튼 · AI 해설은 다음 행동의 링크(계산 도구도 run(…, { llm: true })) ⑤ 빈 상태 = 카드 하나 + 회색 견본 + 한 문장
   ⑥ "다른 도구로 본 이 단지" 보드는 결론 아래 칩 줄(ResultView)로 올렸다. 도구 색(초록·주황)은 page.tsx 가 4종에서 걷는다.
   첫 로드에 더한 것은 StepLine(작은 서버·클라 겸용 부품)과 빈 상태 문장뿐 — 나머지는 전부 next/dynamic 청크. */
/* [1022 · 단지 분석 고도화] 지시 3 — 단지 분석 4종 분기에서 ResultView 에 내 조건 현재 값(tuning)을 넘긴다(시세 예측 손익분기 선 재료 —
   입력 즉시 반영, 새 상태 없음). 나머지 로딩·재계산·저장 로직은 그대로. */
/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
/* [1021 · 단지 분석 /analysis/ai] 단지 분석 4종(진단·예측·동선·타이밍)은 시안(mock8)대로 새 뼈대 —
   머리(아이콘 칩·제목·useCase 한 줄·기준 시점 칩) → `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]`
   왼쪽: 단지 줄 → 대표 그림 → 타일 → 근거 → 행동(ResultView variant="complex") · 오른쪽 레일: 내 조건·이 결과로·이어서 보기(ResultRail).
   단지를 고르기 전에는 "이렇게 써요" 카드 대신 대표 그림의 빈 틀(empty-frames.tsx) 위에 단지 고르기.
   데이터 로딩·재계산·저장·노트·비교·게이트는 전부 예전 로직 그대로다. 나머지 8종 도구는 예전 화면. */

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { useToast } from "@/app/components/toast/ToastProvider";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { ToolPersona } from "@/lib/ai/tool-persona";
import { buildTuningInput, type TuningField } from "@/lib/ai/tool-tuning";
import { applyPriceAutofill, EMPTY_AUTOFILL, priceManString, type AutofillState } from "@/lib/ai/tuning-autofill";
import { toolSteps } from "@/lib/ai/tool-steps";
import { formatKrwWon } from "@/lib/format/krw";
import type { PortfolioItem, ReadyState, RunResult, Similar } from "./workbench-types";
import { EmptyFrame } from "./empty-frames";
import { StepLine } from "@/app/components/StepLine";

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
/* [1008 · 리뷰 A-3] 내 자산 구성 진단 — 관심 단지를 불러왔을 때만 */
const PortfolioMixLazy = dynamic(() => import("./PortfolioMix").then((m) => m.PortfolioMix), { ssr: false });
/* [1021] 오른쪽 레일(내 조건·다음 행동) — 결과가 선 뒤에만. [1026b] 12종 공통(경제지표 알림 패널도 이 청크) */
const ResultRailLazy = dynamic(() => import("./ResultRail").then((m) => m.ResultRail), { ssr: false });

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
  persona,
  fields,
  llmAvailable = false,
  quickPicks = [],
  header = null,
  emptyLine = null,
}: {
  tool: AiAnalysisToolId;
  /** [1021] 단지 분석 4종의 머리 — 아이콘(서버가 그린 글리프)·useCase 한 줄·빵부스러기. 없으면 서버 PageHead 가 머리다(나머지 8종) */
  header?: { icon: ReactNode; useCase: string; crumb: string } | null;
  /** [1026 → 1026b] 빈 상태 한 문장(12종 — 서버가 넘긴다, 경제지표 모니터는 없음) */
  emptyLine?: string | null;
  /** 도구 이름 — 지도 서랍 제목("시세 예측")에 쓴다 */
  title: string;
  /* [993] 서버에 외부 모델 키가 있을 때만 "AI 해설" 선택을 보인다 */
  llmAvailable?: boolean;
  /* [981] 이 도구의 보정 입력 — 서버가 골라 내려준다(lib/ai/tool-tuning-fields.ts) */
  fields: readonly TuningField[];
  /* [980] 도구 성격(색·말투) — 서버가 골라 내려 준다(16종 문자열을 번들에 싣지 않게) */
  persona: ToolPersona;
  /** [1008] 첫 방문 빠른 선택 — 서버(ISR)가 실데이터로 고른 거래 많은 단지. 없으면 줄을 그리지 않는다 */
  quickPicks?: readonly QuickPick[];
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
  /* [1008 · 리뷰 A-3] 입력이 곧 결과인 도구(수익률 계산·계약 점검·갭)는 내 조건을 펼쳐 둔다([1026b] 폰 접이식의 처음 상태) */
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
  /* [1021] 단지 줄의 "단지 바꾸기"(비교는 "단지 담기")를 누르면 고르기 카드를 다시 편다 */
  const [pickerOpen, setPickerOpen] = useState(false);

  const isCompare = tool === "ai-compare";
  const isPortfolio = tool === "ai-portfolio";
  const isEconomy = tool === "ai-economy";
  const isContract = tool === "contract-risk";

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

  const run = useCallback(async (override?: Record<string, string | boolean>, opts?: { llm?: boolean }) => {
    if (running || !ready) return;
    /* [1021] 시세 예측 기간 칩 — 방금 바꾼 입력으로 바로 계산(상태 갱신을 기다리지 않는다) */
    const tuningNow = override ?? tuning;
    /* 계산이 없는 도구는 실행이 곧 AI 해설 요청이다. [1026] 단지 분석 4종 "다음 행동"의 AI 해설 받기는 계산 도구에서도 AI 해설을 함께 */
    const askLlm = opts?.llm ? llmAvailable : aiMode;
    const forKey = ready.key;
    /* [1008 · 리뷰 A-15] 우리가 자동으로 채운 뒤 사용자가 안 건드린 값은 보내지 않는다 — 서버가 같은 최근
       실거래가를 쓰고, 결과도 "내가 넣은 기준 가격"이 아니라 "최근 실거래가"에서 출발했다고 말한다 */
    const auto = autofillRef.current.values;
    const effective: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(tuningNow)) if (!(typeof v === "string" && auto[k] != null && auto[k] === v)) effective[k] = v;
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
        /* [1027] _promptVersion 은 서버(app/api/ai/analysis)가 찍는다 — 여기 글자로 박아 두면 버전을 올려도 안 바뀐다 */
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
              ? "계산이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."
              : res.status === 429
                ? "너무 자주 눌렀어요. 1분쯤 뒤에 다시 눌러 주세요."
                : `서버가 답하지 못했어요(${res.status}). 잠시 후 다시 시도해 주세요.`,
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
  }, [running, ready, aiMode, llmAvailable, picked, ctx, calcFields, aiFields, tuning, isCompare, compareTray, isPortfolio, portfolio, tool, flash]);
  const runState = running ? "busy" : (runFlash ?? "idle");

  const retry = () => {
    const key = ctxState.phase === "error" ? ctxState.key : null;
    if (key && key !== ECONOMY_KEY) {
      loadingKeyRef.current = null;
      void loadContext(key);
    }
  };

  /* [1009 · A] 비교에서 단지 빼기 — 되돌릴 수 있게(확인 창 대신 토스트의 "되돌리기").
     [1008 · 리뷰 A-3] 빼면 결론("N곳을 나란히")·AI 해설이 옛 묶음 것으로 남지 않게 — 옛 실행 결과를 내리고 새 수로 결과 요약을 다시 받는다 */
  const removeFromCompare = (c: PickedComplex) => {
    const next = compareTrayRef.current.filter((x) => x.id !== c.id);
    setCompareTray(next);
    setResult(null);
    const cur = pickedRef.current;
    if (cur) void loadContext(cur.id, { compareCount: next.length, force: true });
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
  };

  /* ── [1021 → 1026 → 1026b] AI 분석 12종 — 한 틀 ─────────────────────────────────────────────── */
  /* 머리(4종은 여기 · 8종은 서버 PageHead) → 절차 한 줄(StepLine) → 본문 | 레일 340(단지를 고른 뒤 · 경제지표는 늘). 레일은 한 번만 그리고
     폰에서는 본문 뒤로 이어진다. 채움 파랑은 레일 "다음 행동" 카드의 주 행동 하나(폰은 같은 요소를 하단 바가 든다). 내 조건의 "다시 계산"은
     보조(테두리) 버튼 · AI 해설은 다음 행동의 링크. 비교는 담은 단지 칩(빼기 · 되돌리기) · 자산 구성은 관심 단지 불러오기 + 구성 카드. */
  const runLabel =
    runState === "busy"
      ? runningLlm
        ? "AI 해설 쓰는 중"
        : "계산하는 중"
      : runState === "done"
        ? runningLlm || aiMode
          ? "결과를 새로 받았어요"
          : "다시 계산했어요"
        : runState === "error"
          ? runErrCode === "QUOTA_EXCEEDED"
            ? "무료 해설을 다 썼어요"
            : runErrCode === "LOGIN_REQUIRED"
              ? "로그인 필요"
              : "다시 눌러 주세요"
          : aiMode
            ? "다시 계산 · AI 해설 받기"
            : "내 조건으로 다시 계산";
  /* 계산이 없는 도구(진단·동선·타이밍·리스크 …)의 칸은 AI 해설에 넣는 조건 — 실행은 "다음 행동"의 AI 해설 받기가 한다(버튼 두 개를 두지 않는다) */
  const condNode: ReactNode =
    ready && (visibleFields.length > 0 || hasCalc) ? (
      <div className="flex flex-col gap-2">
        {visibleFields.length > 0 && (
          <TuningFormLazy fields={visibleFields} value={tuning} onChange={setTuning} autoValues={autofillRef.current.values} />
        )}
        {hasCalc && (
          <>
            {llmAvailable && (
              <label className="flex min-h-[40px] items-center gap-2 t-sub font-bold text-text-1">
                <input type="checkbox" className="h-5 w-5" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                AI 해설도 받기 <span className="font-medium text-text-3">(로그인 필요 · 외부 AI 모델)</span>
              </label>
            )}
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              aria-busy={running || undefined}
              aria-live="polite"
              className="btn-secondary btn-md w-full gap-1.5"
            >
              {running && <span className="njn-ring njn-ring--ink" aria-hidden="true" />}
              {runLabel}
            </button>
          </>
        )}
        {signedIn && (
          <Link href="/my/analyses" className="inline-flex min-h-[24px] items-center self-start t-sub font-bold text-text-3 no-underline">
            내 분석 기록 ›
          </Link>
        )}
      </div>
    ) : null;
  /* 기준 시점 칩(4종 머리) — 있을 때만(도구마다 기준이 다르다) */
  const headChip = (() => {
    if (!header || !ready || !ctx) return null;
    const v = shownVerdict;
    if (tool === "ai-prediction") {
      const ym = ctx.complex?.price?.latestYm;
      return ym ? `${ym.slice(0, 4)}.${ym.slice(4)} 실거래 기준` : null;
    }
    if (tool === "ai-timing") {
      const period = ctx.region?.snapshot?.period;
      const region = (ctx.region?.name ?? "").trim().split(/\s+/).pop();
      return region && period && /^\d{6}$/.test(period) ? `${region} · ${period.slice(0, 4)}.${period.slice(4)}` : null;
    }
    if (tool === "ai-inspection") return picked?.regionLabel || picked?.region || null;
    if (!v?.computedAt) return null;
    const d = new Date(v.computedAt);
    if (Number.isNaN(d.getTime())) return null;
    const ymd = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .filter((x) => x.type === "year" || x.type === "month" || x.type === "day")
      .map((x) => x.value)
      .join(".");
    return `${ymd} 기준`;
  })();
  const price = ctx?.complex?.price ?? null;
  /* 고르기 카드 — 단지 전(경제지표 모니터는 없음) · "단지 바꾸기/담기"를 눌렀을 때 · 비교는 2곳이 찰 때까지 */
  const showPickCard = !isEconomy && (!picked || pickerOpen || (isCompare && compareTray.length < 2));
  /* 본문 | 레일 2열 — 단지를 고른 뒤(경제지표 모니터는 단지 없이 늘) */
  const twoCol = isEconomy || Boolean(picked);
  const flow = toolSteps({
    tool,
    pickedName: picked?.name ?? null,
    compareCount: compareTray.length,
    portfolioCount: portfolio ? portfolio.length : null,
    regionName: isEconomy ? (ctx?.region?.name ?? null) : null,
    ready: Boolean(ready),
    bandLabel: shownVerdict?.bandLabel ?? null,
  });
  /* 입력이 곧 결과인 도구(수익률 계산·계약 점검)는 "(선택)"을 달지 않는다 */
  const condOptional = tool !== "ai-simulator" && !isContract;
  const railProps = {
    tool,
    picked: picked && ctx?.complex ? { id: picked.id, name: picked.name, region: picked.region } : null,
    verdict: shownVerdict,
    result: shownResult,
    /* AI 해설 — 서버에 외부 모델 키가 있을 때만. 계산 도구도 이 링크는 AI 해설을 함께 받는다 */
    ai: llmAvailable ? { signedIn, running, onAsk: () => void run(undefined, { llm: true }) } : null,
    /* [1026b] 비교 — 담은 단지 전부를 결정 카드 후보로 · 경제지표 — 기준금리 알림 패널 */
    compareTray: isCompare ? compareTray.map((c) => ({ id: c.id, name: c.name, region: c.region })) : null,
    economyRate: isEconomy ? (ctx?.macro?.baseRatePct ?? null) : null,
  };
  return (
    <div className="nz-dot-blue flex flex-col gap-3">
      {mapNode}
      {/* 머리(단지 분석 4종) — 아이콘 칩 + 제목 + 사실 한 줄 + 기준 시점 칩(있을 때만). 나머지 8종은 서버 PageHead */}
      {header && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary" aria-hidden="true">
              {header.icon}
            </span>
            <div className="min-w-0">
              <nav className="t-caption text-text-3">
                <Link href="/analysis" className="inline-flex min-h-[24px] items-center text-text-3 no-underline hover:underline">
                  AI 분석
                </Link>{" "}
                › {header.crumb}
              </nav>
              <h1 className="t-title text-ink">{title}</h1>
              <p className="t-sub text-text-2">{header.useCase}</p>
            </div>
          </div>
          {headChip && (
            <span className="chip inline-flex min-h-[32px] items-center self-center border border-line bg-surface px-3 t-sub font-bold tabular-nums text-text-1">
              {headChip}
            </span>
          )}
        </header>
      )}

      {/* [1026 → 1026b] 절차 한 줄(화면당 한 번) — 단지 · {단지명} → 내 조건 → 결과 · {판정} → 다음 행동(lib/ai/tool-steps) */}
      <StepLine current={flow.current} steps={flow.steps} />

      <div className={`grid grid-cols-1 gap-3 lg:gap-6 ${twoCol ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        {/* ── 본문: 단지 줄 → 결론 히어로 + 대표 그림 → KPI → (폰) 내 조건 → 세부(접힘) ── */}
        <div id="ai-result" className="flex min-w-0 scroll-mt-20 flex-col gap-3">
          {picked && (
            <section className="card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 max-md:p-3.5" aria-label={isCompare ? "담은 단지" : "고른 단지"}>
              {isCompare ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {compareTray.map((c) => (
                    <span key={c.id} className="chip inline-flex min-h-[40px] items-center border border-line bg-surface pl-3 t-sub font-bold text-text-1">
                      {c.name}
                      <button
                        type="button"
                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center text-text-3"
                        aria-label={`${c.name} 빼기`}
                        onClick={() => removeFromCompare(c)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <span className="t-caption tabular-nums text-text-3">{compareTray.length}/3곳</span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-hanji t-body font-bold text-brand-hanji-ink" aria-hidden="true">
                    {picked.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <b className="break-words t-body font-bold text-ink">{picked.name}</b>
                      <span className="t-caption text-text-3">{picked.regionLabel || picked.region}</span>
                    </div>
                    <span className="t-caption text-text-3">
                      {ctxState.phase === "loading"
                        ? "실거래·전월세·입주 예정·지역 통계를 불러오는 중…"
                        : price
                          ? `${price.bandLabel} 최근 ${price.sample ?? ""}건 평균 ${formatKrwWon(price.priceKrw, { style: "short" })} · 최근 거래 ${price.latestYm.slice(0, 4)}.${price.latestYm.slice(4)}`
                          : ready
                            ? ctx?.unavailable?.includes("실거래가")
                              ? "실거래가 불러오기 실패"
                              : "최근 매매 실거래가 적어 대표 가격 없음"
                            : ""}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-expanded={pickerOpen}
                  disabled={isCompare && compareTray.length >= 3}
                  className="chip press inline-flex min-h-[40px] items-center border border-line bg-surface px-3 t-sub font-bold text-text-1 disabled:text-text-3"
                >
                  {isCompare ? "단지 담기" : "단지 바꾸기"}
                </button>
                <button type="button" onClick={openMap} className="chip press inline-flex min-h-[40px] items-center border border-line bg-surface px-3 t-sub font-bold text-text-1">
                  지도에서
                </button>
              </div>
            </section>
          )}

          {/* [1026 → 1026b] 빈 상태 — 카드 하나 + 회색 견본(대표 그림 윤곽 · 값 없음) + 한 문장 + 단지 검색 + 최근 거래 많은 단지 칩 */}
          {showPickCard && (
            <section className="card rounded-2xl p-4 max-md:p-3.5" aria-label="단지 고르기">
              <div className={picked ? "flex flex-col gap-3" : "grid grid-cols-1 items-center gap-4 md:grid-cols-2"}>
                {!picked && (
                  <div className="mx-auto w-full max-w-[240px] md:max-w-[320px]" aria-hidden="true">
                    <EmptyFrame tool={tool} />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-3">
                  {!picked && emptyLine && <p className="t-body font-bold text-ink">{emptyLine}</p>}
                  {isPortfolio && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => void loadPortfolio()} className="btn-secondary btn-md px-3 t-sub">
                        내 관심 단지 불러오기
                      </button>
                      {portfolio && (
                        <span className="t-sub text-text-3">
                          {portfolio.length > 0 ? `${portfolio.length}곳 불러옴` : "관심 단지 없음(로그인·담기 필요)"}
                        </span>
                      )}
                    </div>
                  )}
                  {/* [970 · B-27] 고른 단지는 위 단지 줄이 말한다(피커 칩은 끈다) · [1008 · 리뷰 B-1] 딥링크는 워크벤치가 스스로 푼다(초기값 null) */}
                  <ComplexPicker
                    onSelect={(c) => {
                      setPickerOpen(false);
                      onPick(c);
                    }}
                    label=""
                    onMapClick={openMap}
                    showChip={false}
                    clearOnSelect
                    initialComplexId={null}
                    initialApt={null}
                    placeholder="단지 이름"
                  />
                  {isContract && (
                    <Link href="/safety" className="inline-flex min-h-[24px] items-center self-start t-sub font-bold text-primary no-underline">
                      전세 안전 셀프체크 ›
                    </Link>
                  )}
                  {presets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="t-sub font-bold text-text-3">즐겨 쓰는 단지</span>
                      {presets.map((p) => (
                        <button key={p.id} type="button" onClick={() => { setPickerOpen(false); applyPreset(p); }} className="chip press min-h-[40px] border border-line bg-surface px-2.5 t-sub font-bold text-text-1">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {quickPicks.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="t-sub font-bold text-text-1">최근 6개월 거래가 많은 단지 {quickPicks.length}곳</span>
                      <div className="flex flex-wrap gap-1.5">
                        {quickPicks.map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => {
                              setPickerOpen(false);
                              onPick({ id: q.id, name: q.name, region: q.region, regionId: null, regionLabel: q.region, priceLabel: null } as PickedComplex);
                            }}
                            className="chip press flex min-h-[40px] flex-col items-start border border-line bg-surface px-3 py-1.5 text-left"
                          >
                            <span className="t-sub font-bold text-ink">{q.name}</span>
                            <span className="t-caption text-text-3">
                              {q.region} · 최근 6개월 {q.recentTrades.toLocaleString("ko-KR")}건
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* [1008 · 리뷰 A-3] 내 자산 구성 진단 — 불러온 관심 단지 목록의 쏠림(지역·가격대) · 누르면 그 단지 결과 */}
          {isPortfolio && portfolio && portfolio.length > 0 && (
            <PortfolioMixLazy items={portfolio} pickedId={picked?.id ?? null} onPick={(it) => onPick({ id: it.complexId, name: it.complexName, region: "", regionId: null, regionLabel: null, priceLabel: null } as PickedComplex)} />
          )}

          {ctxState.phase === "loading" && <ResultSkeleton />}
          {ctxState.phase === "error" && (
            <div className="card flex flex-col items-start gap-2 rounded-2xl p-4" role="status">
              <p className="t-body font-bold text-warning">자료 불러오기 실패 · 잠시 후 다시</p>
              {ctxState.key !== ECONOMY_KEY && (
                <button type="button" onClick={retry} className="btn-secondary btn-md px-4 t-sub">
                  다시 불러오기
                </button>
              )}
            </div>
          )}
          {ready && ctx && (
            <ResultViewLazy
              tool={tool}
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
              onPickSimilar={(s: Similar) =>
                onPick({ id: s.id, name: s.name, region: picked?.region ?? "", regionId: null, regionLabel: picked?.regionLabel ?? picked?.region ?? null, priceLabel: null } as PickedComplex)
              }
              tuning={tuning}
              onHorizon={
                tool === "ai-prediction" && fieldKeys.includes("horizonMonths")
                  ? (months: string) => {
                      const next = { ...tuningRef.current, horizonMonths: months };
                      setTuning(next);
                      void run(next);
                    }
                  : null
              }
              phoneCondition={
                condNode ? (
                  <details className="card rounded-2xl" open={condOpen} onToggle={(e) => setCondOpen(e.currentTarget.open)}>
                    <summary className="flex min-h-[48px] cursor-pointer items-center justify-between gap-2 px-4 t-body font-bold text-ink">
                      내 조건 {condOptional && <span className="t-sub font-bold text-text-3">(선택)</span>}
                    </summary>
                    <div className="border-t border-line px-4 pb-4 pt-1">{condNode}</div>
                  </details>
                ) : undefined
              }
            />
          )}
        </div>

        {/* ── 레일(lg+ 오른쪽 sticky · 폰은 본문 뒤): 내 조건(lg) · 다음 행동 · (타이밍) 이 지역 알림 · (경제지표) 기준금리 알림 ── */}
        {twoCol && (
          <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="내 조건과 다음 행동">
            {ready && ctx ? <ResultRailLazy {...railProps} condition={condNode} /> : null}
          </aside>
        )}
      </div>
    </div>
  );
}
