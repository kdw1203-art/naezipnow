"use client";

import { useState } from "react";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { APPLYHOME_REGIONS } from "@/lib/applyhome/regions";
import type {
  ApplyhomeListingItem,
  ApplyhomeSearchPayload,
  ApplyhomeSearchTab,
} from "@/lib/applyhome/types";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/**
 * 청약홈 실데이터 검색 — 이미 완성돼 있던 /api/applyhome/search 를 화면에 배선.
 * 경쟁률/특별공급 탭 + 지역·단지명 필터 + 더보기(페이지네이션).
 * 서버에서 만든 초기 페이로드(initial)로 첫 화면을 그리고, 이후 상호작용은
 * 클라이언트에서 API 를 호출한다. 실패·미설정 시에도 지어내지 않고 상태를 말한다.
 *
 * 2026-07-27 고도화(#225) — /supply·/auctions 와 같은 수준으로 올린다.
 *   - 지역 필터를 <select> → 칩 줄로 (한 번에 어떤 지역이 있는지 보인다)
 *   - 요약 타일 추가. 단, **세는 대상을 라벨에 그대로 쓴다** — "총 공고"는 서버가 준
 *     totalCount, "표시 중"은 지금 화면에 그려진 행 수다. 평균 경쟁률처럼 일부 페이지만
 *     보고 계산하면 틀리는 값은 만들지 않는다.
 *   - 손으로 만든 에러/빈 카드 → 공용 ErrorState/EmptyState. 세 상태(키 미설정 mock /
 *     조회 실패 / 진짜 0건)를 절대 한 문장으로 합치지 않는다.
 *
 * [v4] "한 화면 한 가지" — 이 섹션이 /apply 의 주인공이다(채움 파랑은 [공고 검색] 하나).
 *   - 경쟁률/특별공급 알약 탭 → 밑줄 탭 + 같은 줄 오른쪽 총 공고 수(예전 요약 타일 "총 공고")
 *   - 요약 타일 3칸 삭제 — 총 공고는 탭 줄, "표시 중"은 더 보기 버튼, 조회 시각은 표 끝 출처 줄이 이미 말한다
 *   - 지역 칩 → 한 줄 가로 스크롤 필터 칩(선택 = 한지 + 남색), 정렬 알약(네이비 채움) → 작은 글자 토글
 *   - 표를 감싼 카드·로딩 카드·더 보기 카드 → 테두리 없이. 상태 칩(접수 예정·접수 중) → 의미색 글자
 */

const PER_PAGE = 15;

/** 서버(page.tsx)에서 넘어오는 초기 조회 결과 — 성공/실패를 구분해 받는다. */
export type ApplyInitialResult =
  | { ok: true; payload: ApplyhomeSearchPayload }
  | { ok: false; cause: string };

type Props = { initial: ApplyInitialResult };

type ViewState = {
  tab: ApplyhomeSearchTab;
  region: string;
  q: string;
  page: number;
  items: ApplyhomeListingItem[];
  totalCount: number;
  mode: "live" | "mock" | "error";
  /** 분양정보(상세) API 사용 가능 여부 — false면 지역·검색 필터 자체가 불가하다 */
  detailAvailable: boolean;
  detailNotice?: string;
  fetchedAt?: string;
};

/** 조회 실패 — 원인 원문을 같이 들고 다닌다(화면에 그대로 노출한다). */
type ErrState = { message: string; cause?: string } | null;

function fromPayload(p: ApplyhomeSearchPayload, prevItems?: ApplyhomeListingItem[]): ViewState {
  /* 모양이 어긋난 200 응답(items 누락 등)에도 TypeError 로 터지지 않게 방어 —
     이전에는 `[... p.items]` 가 undefined 전개로 죽을 수 있었다. */
  const incoming = Array.isArray(p.items) ? p.items : [];
  const merged = prevItems ? [...prevItems, ...incoming] : incoming;
  // 페이지 경계 중복 방어 — id 기준 dedupe
  const seen = new Set<string>();
  const items = merged.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return {
    tab: p.tab,
    region: p.filters?.region ?? "전체",
    q: p.filters?.q ?? "",
    page: 1,
    items,
    totalCount: typeof p.totalCount === "number" ? p.totalCount : items.length,
    mode: p.mode,
    detailAvailable: Boolean(p.detailAvailable),
    detailNotice: p.detailNotice,
    fetchedAt: p.fetchedAt,
  };
}

const EMPTY_STATE: ViewState = {
  tab: "competition",
  region: "전체",
  q: "",
  page: 1,
  items: [],
  totalCount: 0,
  mode: "error",
  detailAvailable: false,
};

type SortKey = "default" | "rate" | "supply";

/** 경쟁률 문자열("152.3:1" | "152.3" | "△" | "-")에서 숫자만. 없으면 null(미달·미공개). */
function parseRate(raw?: string): number | null {
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** 표시 중인 행만 정렬한다(전체가 아니라 '화면에 그려진 것' 기준 — 라벨로 명시). */
function sortItems(items: ApplyhomeListingItem[], key: SortKey): ApplyhomeListingItem[] {
  if (key === "default") return items;
  const arr = [...items];
  if (key === "rate") {
    arr.sort((a, b) => (parseRate(b.competitionRate) ?? -1) - (parseRate(a.competitionRate) ?? -1));
  } else {
    arr.sort((a, b) => (b.supplyCount ?? 0) - (a.supplyCount ?? 0));
  }
  return arr;
}

/** 특공 유형별 경쟁률 라벨 — 접수/공급. 공급 0이면 "—", 미달이면 "미달". */
function typeRateLabel(supply: number, requests: number): string {
  if (!supply || supply <= 0) return "—";
  if (requests <= 0) return "0";
  const r = requests / supply;
  return requests < supply ? "미달" : `${r.toFixed(1)}:1`;
}

/** "YYYYMMDD" | "YYYY-MM-DD" → "YYYY.MM.DD". 형식이 다르면 원문. */
function ymd(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  return raw;
}

/** 접수 기간("2026-08-19 ~ 2026-08-21")으로 지금 상태를 계산 — 데이터에 이미 있는
    날짜만 쓴다(추정 없음). 과거 공고가 대부분이라 '마감' 칩은 소음 — 진행·예정만
    칩으로 강조하고, 파싱 실패·과거는 null 로 아무것도 그리지 않는다. */
function applyStatus(period?: string): { label: string; cls: string } | null {
  if (!period) return null;
  const dates = period.match(/\d{4}[-.]?\d{2}[-.]?\d{2}/g);
  if (!dates || dates.length === 0) return null;
  const toMs = (s: string) => {
    const d = s.replace(/[^0-9]/g, "");
    return Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00+09:00`);
  };
  const start = toMs(dates[0]);
  const endDay = toMs(dates[dates.length - 1]);
  if (!Number.isFinite(start) || !Number.isFinite(endDay)) return null;
  const end = endDay + 24 * 60 * 60 * 1000 - 1; // 마감일 그날 자정(KST)까지 접수 중
  const now = Date.now();
  if (now < start) return { label: "접수 예정", cls: "text-primary" };
  if (now <= end) return { label: "접수 중", cls: "text-success" };
  return null;
}

function StatusChip({ period }: { period?: string }) {
  const st = applyStatus(period);
  if (!st) return null;
  return (
    /* [1012] 규칙 9 — 사실 명사(접수 예정·접수 중). [v4 · 규칙 6] 면 있는 배지 → 의미색 글자 */
    <span className={`ml-1.5 inline-block align-middle t-caption font-bold ${st.cls}`}>{st.label}</span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-caption font-semibold text-text-3">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}

export function ApplySearchClient({ initial }: Props) {
  const [state, setState] = useState<ViewState>(
    initial.ok ? fromPayload(initial.payload) : EMPTY_STATE,
  );
  const [qInput, setQInput] = useState(initial.ok ? initial.payload.filters.q : "");
  const [loading, setLoading] = useState(false);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<ErrState>(
    initial.ok
      ? null
      : { message: "청약홈 데이터를 지금 불러오지 못했어요.", cause: initial.cause },
  );
  /* 정렬은 '표시 중인 행'만 다시 세운다(서버 전체가 아니라). 확장 행은 청약 일정·
     시행사·원문(경쟁률 탭) 또는 8개 특공 유형별 물량·접수(특별공급 탭)를 편다 —
     이미 받아 놓고 표에서 버리던 데이터를 여는 것뿐이라 지어낸 값이 아니다. */
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function load(opts: {
    tab?: ApplyhomeSearchTab;
    region?: string;
    q?: string;
    page?: number;
    append?: boolean;
  }): Promise<void> {
    const tab = opts.tab ?? state.tab;
    const region = opts.region ?? state.region;
    const q = opts.q ?? state.q;
    const page = opts.page ?? 1;
    const append = Boolean(opts.append);
    if (append) setAppending(true);
    else setLoading(true);
    setError(null);
    if (!append) setExpanded(new Set()); // 새 결과엔 이전 확장 상태를 남기지 않는다
    try {
      const params = new URLSearchParams({
        tab,
        region,
        q,
        page: String(page),
        perPage: String(PER_PAGE),
      });
      const res = await fetch(`/api/applyhome/search?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`청약홈 조회 응답 ${res.status}`);
      const data = (await res.json()) as ApplyhomeSearchPayload;
      setState((prev) => ({
        ...fromPayload(data, append ? prev.items : undefined),
        page,
      }));
    } catch (err) {
      setError({
        message: "청약홈 데이터를 지금 불러오지 못했어요.",
        cause: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      setAppending(false);
    }
  }

  /* 페이지 단위가 경로마다 다르다(2026-08-22 수리):
       필터 없음 → 행(row) 페이지네이션: 행 수 vs 행 총계 비교가 맞다.
       필터 있음 → 공고(detail) 페이지네이션: 한 공고가 타입·순위별 여러 행을
         만들므로 행 수와 공고 총계를 비교하면 안 된다(45행 > 공고 20건이라
         더 있는데도 버튼이 사라지는 식). 소비한 공고 수(page×PER_PAGE)로 센다. */
  const filteredMode = state.region !== "전체" || state.q.trim().length > 0;
  const canLoadMore =
    !error &&
    state.mode === "live" &&
    state.items.length > 0 &&
    (filteredMode
      ? state.page * PER_PAGE < state.totalCount
      : state.items.length < state.totalCount);

  /* [v4] 밑줄 탭 — 동네이야기 피드(feed-client)의 유형 탭과 같은 값. 채움 파랑은 [공고 검색] 하나 */
  const tabClass = (on: boolean) =>
    `-mb-px min-h-10 border-b-2 pb-2.5 pt-2 t-body font-bold transition-colors ${
      on ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
    }`;

  /* [v4] 선택 칩 = 한지 + 남색(.chip-active), 나머지 = 흰 면 + 1px 선 */
  const regionPill = (on: boolean) =>
    `press chip shrink-0 px-3 py-1.5 t-sub font-bold ${on ? "chip-active border" : "border border-line bg-surface text-text-2"}`;

  const tabLabel = state.tab === "competition" ? "청약 경쟁률" : "특별공급 접수현황";
  /* 예전 요약 타일의 "총 공고" — 탭 줄 오른쪽 숫자 하나로(결과를 그릴 때만) */
  const showTotal = !error && state.mode === "live" && state.items.length > 0;
  const displayItems = sortItems(state.items, sortKey);
  const hasResults = !error && !loading && state.items.length > 0;

  /* [v4] 정렬 — 네이비 채움 알약 → 작은 글자 토글(선택 = 굵은 잉크). 표시 중인 행만 다시 세운다는 사실은 title 로 */
  const sortClass = (on: boolean) => (on ? "font-bold text-ink" : "text-text-3");
  const sortTitle = `지금 표시 중인 ${state.items.length}건 안에서 다시 세운다(전체 아님)`;

  return (
    <section aria-labelledby="apply-search-title" className="flex flex-col gap-3">
      <h2 id="apply-search-title" className="t-section text-ink">
        경쟁률 · 특별공급
      </h2>
      {/* [v4] 탭 줄 — 밑줄 탭(왼쪽) + 총 공고 수(오른쪽) 한 줄 */}
      <div className="flex items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-4" role="group" aria-label="청약 자료">
          <button
            type="button"
            onClick={() => void load({ tab: "competition", page: 1 })}
            aria-pressed={state.tab === "competition"}
            className={tabClass(state.tab === "competition")}
          >
            경쟁률
          </button>
          <button
            type="button"
            onClick={() => void load({ tab: "special", page: 1 })}
            aria-pressed={state.tab === "special"}
            className={tabClass(state.tab === "special")}
          >
            특별공급
          </button>
        </div>
        {showTotal && (
          <span className="shrink-0 pb-2.5 t-sub text-text-3">
            {state.region === "전체" ? "전국" : state.region} <span className="t-num">{state.totalCount.toLocaleString()}</span>건
          </span>
        )}
      </div>

      {/* 검색 — 입력 + [공고 검색](이 화면의 채움 파랑 하나) */}
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void load({ q: qInput.trim(), page: 1 });
        }}
      >
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          maxLength={80}
          placeholder="단지명·주소 검색"
          aria-label="단지명·주소 검색"
          className="min-h-10 min-w-[160px] flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 t-body text-ink placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary btn-md press disabled:opacity-60"
        >
          {/* [1012] 규칙 5 — 동사 + 대상 */}
          공고 검색
        </button>
      </form>

      {/* 지역 칩 — <select> 였다. 어떤 지역이 있는지 한눈에 보이고 한 번에 눌린다. [v4] 한 줄 가로 스크롤 */}
      <div role="group" aria-label="지역 필터" className="rail-x -mx-3.5 px-3.5 md:mx-0 md:px-0">
        {APPLYHOME_REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => void load({ region: r, page: 1 })}
            aria-pressed={state.region === r}
            className={regionPill(state.region === r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 상세 API 미승인 등 데이터 한계 안내 — 서버가 준 사실 그대로. [v4] 파랑 상자 → 캡션 한 줄 */}
      {state.detailNotice && <p className="t-sub text-text-3">{state.detailNotice}</p>}

      {/* 결과 — 실패 / 미설정 / 0건 / 목록을 절대 섞지 않는다 */}
      {error ? (
        <div role="alert">
          <ErrorState
            title={error.message}
            desc="공고가 없는 게 아니라 조회 자체가 실패했어요. 잠시 후 다시 시도해 주세요."
            cause={error.cause}
            onRetry={() => void load({ page: 1 })}
          />
        </div>
      ) : loading ? (
        <p className="py-12 text-center t-body text-text-3">청약홈 데이터를 불러오는 중…</p>
      ) : state.items.length === 0 ? (
        <div>
          {state.mode === "mock" ? (
            /* [970 · C-44] env 변수명(DATA_GO_KR_SERVICE_KEY)이 사용자 화면에 나갔다 — 일반 문구로 */
            <EmptyState
              icon="lock"
              /* [1011] "청약홈 연동 준비 중" · "공공데이터가 연결되지 않아" 를 걷었다(소유자 지시) —
                 970·C-44 에서 env 변수명을 걷어낸 것과 같은 줄기로, 연동 상태는 운영 쪽 말이다.
                 지어내지 않는다는 약속(정직성)은 그대로 남긴다. */
              title="청약 공고를 아직 보여 줄 수 없어요"
              desc="청약홈 공고 자료를 아직 불러오지 못해요. 지어낸 수치로 표를 채우지는 않아요."
              action={{ href: "https://www.applyhome.co.kr", label: "청약홈 공고 보기 ↗" }}
            />
          ) : filteredMode && !state.detailAvailable ? (
            /* 0건이 아니라 **필터 기능 자체가 지금 불가**한 상태 — 상세(분양정보)
               API 미승인이면 지역·검색 필터를 걸 수 없다. "조건에 맞는 공고가
               없어요"라고 말하면 있는 공고를 없다고 말하는 셈이라 구분한다. */
            <EmptyState
              icon="lock"
              title="지역·단지명 필터를 지금 사용할 수 없어요"
              /* [1011] "분양정보(상세) API 연동이 준비되지 않아" 를 걷었다(소유자 지시) — 970·C-44 에서
                 env 변수명을 걷어낸 것과 같은 줄기다. 남길 사실은 "지금은 못 쓴다"와 "0건이 아니다" 둘. */
              desc="지역·단지명으로 걸러 보는 기능이 아직 준비 중이에요. 공고가 없다는 뜻이 아니에요 — ‘전체’로 돌아가면 전국 공고를 볼 수 있어요."
              action={{ href: "/apply", label: "전체 공고 보기" }}
            />
          ) : (
            <EmptyState
              icon="search"
              /* [1012] 규칙 6 — 어디서(지역·검색어)·무엇(탭)·숫자(0건)·출처 */
              title={`${state.region === "전체" ? "전국" : state.region}${state.q ? ` ‘${state.q}’` : ""} ${tabLabel} 공고가 0건이에요`}
              desc="청약홈 공공데이터 조회 결과예요 — 지역이나 검색어를 바꾸면 다른 공고가 나올 수 있어요."
              action={{ href: "/apply", label: `전국 ${tabLabel} 보기` }}
            />
          )}
        </div>
      ) : (
        <>
          {/* 정렬 — 표시 중인 행만 다시 세운다(전체 아님). [v4] 작은 글자 토글 한 줄, 그 사실은 title 로 */}
          {hasResults && (
            <div className="flex items-center justify-end gap-2.5 t-sub" role="group" aria-label="정렬">
              {(
                [
                  ["default", "기본"],
                  ["rate", "경쟁률순"],
                  ["supply", "공급순"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={sortKey === k}
                  onClick={() => setSortKey(k)}
                  title={k === "default" ? undefined : sortTitle}
                  className={sortClass(sortKey === k)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* [v4] 표 — 카드 테두리 없이. 좁은 화면은 가로 스크롤(5열 표) */}
          <div className="-mx-3.5 overflow-x-auto px-3.5 md:mx-0 md:px-0">
            {/* [v4.1 · 리퀴드 목록] 표 묶음도 유리판 한 장(lq-panel) — 경쟁률·공급 숫자 표라 blue */}
            <div data-tone="blue" className="lq-panel min-w-[480px]">
              {state.tab === "competition" ? (
                <>
                  <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                    <span>단지 · 지역</span>
                    <span className="text-center">타입</span>
                    <span className="text-center">공급</span>
                    <span className="text-center">접수</span>
                    <span className="text-center">경쟁률</span>
                  </div>
                  {displayItems.map((item, i, arr) => {
                    const open = expanded.has(item.id);
                    const hasDetail = Boolean(
                      item.rankCode ||
                        item.subscriptionPeriod ||
                        item.announceDate ||
                        item.builder ||
                        item.portalUrl,
                    );
                    return (
                      <div
                        key={item.id}
                        className={i < arr.length - 1 ? "border-b border-divider" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpand(item.id)}
                          aria-expanded={open}
                          className={`grid w-full grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] items-center gap-2 py-2.5 text-left text-xs ${
                            hasDetail ? "press" : "cursor-default"
                          }`}
                        >
                          <span className="font-bold text-ink">
                            {hasDetail && (
                              <span className="mr-1 inline-block w-2.5 text-center t-sub font-bold text-text-3">
                                {open ? "−" : "+"}
                              </span>
                            )}
                            {item.houseName}
                            <StatusChip period={item.subscriptionPeriod} />
                            <span className="ml-1 t-caption font-medium text-text-3">
                              {item.region}
                              {item.resideLabel ? ` · ${item.resideLabel}` : ""}
                            </span>
                          </span>
                          <span className="text-center font-bold text-text-1">{item.houseType}</span>
                          <span className="text-center font-bold text-text-1">
                            {item.supplyCount.toLocaleString()}
                          </span>
                          <span className="text-center font-bold text-text-1">
                            {item.requestCount ?? "—"}
                          </span>
                          <span className="text-center font-bold text-danger">
                            {item.competitionRate ?? "—"}
                          </span>
                        </button>
                        {open && hasDetail && (
                          <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-bg px-3.5 py-3 t-sub sm:grid-cols-3">
                            {item.rankCode ? (
                              <DetailField label="순위" value={`${item.rankCode}순위`} />
                            ) : null}
                            {item.subscriptionPeriod ? (
                              <DetailField label="청약 접수" value={item.subscriptionPeriod} />
                            ) : null}
                            {ymd(item.announceDate) ? (
                              <DetailField label="모집공고일" value={ymd(item.announceDate)!} />
                            ) : null}
                            {item.builder ? <DetailField label="시행사" value={item.builder} /> : null}
                            {item.houseKind ? <DetailField label="구분" value={item.houseKind} /> : null}
                            {item.portalUrl ? (
                              <div className="col-span-2 sm:col-span-3">
                                <a
                                  href={item.portalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block py-[5px] font-bold text-primary underline"
                                >
                                  청약홈 공고 원문 보기 ↗
                                </a>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                    <span>단지 · 지역</span>
                    <span className="text-center">타입</span>
                    <span className="text-center">특공 세대</span>
                    <span className="text-center">접수</span>
                    <span className="text-center">결과</span>
                  </div>
                  {displayItems.map((item, i, arr) => {
                    const requests = item.specialMetrics?.reduce((s, m) => s + m.requests, 0);
                    const typeRows = (item.specialMetrics ?? []).filter(
                      (m) => m.supply > 0 || m.requests > 0,
                    );
                    const open = expanded.has(item.id);
                    const hasDetail = typeRows.length > 0;
                    return (
                      <div
                        key={item.id}
                        className={i < arr.length - 1 ? "border-b border-divider" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpand(item.id)}
                          aria-expanded={open}
                          className={`grid w-full grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-left text-xs ${
                            hasDetail ? "press" : "cursor-default"
                          }`}
                        >
                          <span className="font-bold text-ink">
                            {hasDetail && (
                              <span className="mr-1 inline-block w-2.5 text-center t-sub font-bold text-text-3">
                                {open ? "−" : "+"}
                              </span>
                            )}
                            {item.houseName}
                            <StatusChip period={item.subscriptionPeriod} />
                            <span className="ml-1 t-caption font-medium text-text-3">
                              {item.region}
                            </span>
                          </span>
                          <span className="text-center font-bold text-text-1">{item.houseType}</span>
                          <span className="text-center font-bold text-text-1">
                            {(item.specialSupplyTotal ?? item.supplyCount).toLocaleString()}
                          </span>
                          <span className="text-center font-bold text-text-1">
                            {requests != null ? requests.toLocaleString() : "—"}
                          </span>
                          <span className="text-center font-bold text-danger">
                            {item.resultLabel ?? "—"}
                          </span>
                        </button>
                        {open && hasDetail && (
                          <div className="mb-2 rounded-xl bg-bg px-3.5 py-3">
                            <div className="mb-1.5 t-caption font-bold text-text-3">
                              특별공급 유형별 · 공급 / 접수 / 경쟁률
                            </div>
                            <div className="grid grid-cols-[1.4fr_.8fr_.8fr_.9fr] gap-x-2 gap-y-1 t-sub">
                              {typeRows.map((m) => (
                                <div key={m.id} className="contents">
                                  <span className="text-text-2">{m.label}</span>
                                  <span className="text-center tabular-nums text-text-1">
                                    {m.supply.toLocaleString()}
                                  </span>
                                  <span className="text-center tabular-nums text-text-1">
                                    {m.requests.toLocaleString()}
                                  </span>
                                  <span className="text-center font-bold text-danger">
                                    {typeRateLabel(m.supply, m.requests)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-1.5 t-caption text-text-3">
                              경쟁률 = 접수 ÷ 공급 · 접수가 공급보다 적으면 &lsquo;미달&rsquo;
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              <div className="pb-2 pt-1 t-caption text-text-3">
                출처 청약홈(한국부동산원) 공공데이터
                {state.fetchedAt ? ` · ${state.fetchedAt.slice(0, 10)} 조회` : ""}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 더보기 (페이지네이션) */}
      {canLoadMore && (
        <button
          type="button"
          disabled={appending}
          onClick={() => void load({ page: state.page + 1, append: true })}
          className="press btn-ghost btn-md w-full disabled:opacity-60"
        >
          {/* [1012] 규칙 5 — 동사 + 구체 대상(건수). [v4] 카드 → 고스트 버튼, 문장 → "(본 수 / 전체)" */}
          {appending
            ? "불러오는 중…"
            : filteredMode
              ? `공고 더 보기 (${Math.min(state.page * PER_PAGE, state.totalCount).toLocaleString()} / ${state.totalCount.toLocaleString()}건)`
              : `공고 더 보기 (${state.items.length.toLocaleString()} / ${state.totalCount.toLocaleString()}건)`}
        </button>
      )}
    </section>
  );
}
