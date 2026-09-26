"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { formatKrwManwon } from "@/lib/format/krw";
import type { PickerOption } from "@/app/search/ComplexPickerList";
import { isBotBrowser } from "@/lib/client/is-bot-ua";
import { QUERY_TOO_LONG, SEARCH_QUERY_MAX, badRequestNotice } from "@/lib/search/complex-preview";

/* ============================================================
   단지 선택기 (분석 도구 공용) — 검색 → 서제스트 드롭다운 → 단지 선택.
   - 입력: 굳은 뒤(대기 규칙은 lib/search/settle) GET /api/search/suggest?q=
   - 선택: GET /api/complex/[id]/detail 로 지역·최근 실거래가 보강
   - 딥링크: props(initialComplexId/initialApt)가 없으면 현재 URL의
     ?complexId= / ?apt= 를 읽어 초기 선택 (지도/검색 → 분석 seamless)
   - onSelect 로 부모에 선택 단지(id·name·region·regionId) 전달
   - [1008 · S] 키보드 ↑↓ Enter Esc(콤보박스) · 검색어 강조 · 읍면동/세대수/6개월 거래로 같은 이름 가르기 ·
     결과 없음 문구 + 지도에서 찾기 + 비슷한 이름. 드롭다운은 입력 뒤에만 필요해 next/dynamic 으로
     따로 싣는다(app/search/ComplexPickerList — /analysis/ai/[tool] 첫 묶음 472/480KB 를 늘리지 않게).
   ============================================================ */

/** 드롭다운·선택 칩 — 친 뒤(또는 고른 뒤)에만 필요하다. 하이드레이션 뒤 한가할 때 미리 받아 둔다
 *  (아래 useEffect — 지역 카탈로그와 같은 방식). 칩이 늦게 뜨지 않게. */
const loadList = () => import("@/app/search/ComplexPickerList");
const ComplexPickerList = dynamic(loadList, { ssr: false });
const PickedChip = dynamic(() => loadList().then((m) => m.PickedChip), { ssr: false });

export type PickedComplex = {
  id: string;
  name: string;
  /** 사람이 읽는 지역 표기 (예: "안양시 동안구") — 실시세 지역명 매칭용 */
  region: string;
  /** 시세 API regionId (해석 실패 시 null) */
  regionId: string | null;
  /** 표시용 라벨 (예: "서울 강남구") */
  regionLabel: string | null;
  /** 최근 실거래가 라벨 (예: "8.4억") — 없으면 null */
  priceLabel: string | null;
};

type Suggestion = PickerOption;

/** [967 · 31] 만원 → "12억"/"8.0억"/"8,200만", 없으면 null — lib/format/krw.ts "listing" 스타일 */
function manwonLabel(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  return formatKrwManwon(manwon, { style: "listing" });
}

/* ============================================================
   [975] 지역 카탈로그를 첫 화면에서 뺀다.

   resolveRegion 은 서울 25구 + 수도권 목록(lib/map/seoul-districts, 묶음 ≈14KB)을
   통째로 끌고 온다. 그런데 이 함수가 필요한 순간은 **단지를 고른 뒤**다 —
   검색어를 치기도 전에 받아 둘 이유가 없다. /analysis 는 First Load 예산
   여유가 몇 KB뿐이라(scripts/check-bundle-budget.mjs) 이만한 상수 목록이
   첫 묶음에 들어앉는 게 그대로 예산이 된다.

   그렇다고 고르는 순간 내려받으면 칩이 늦게 뜬다. 그래서 **하이드레이션 직후
   한가할 때 미리 받아 두고**(아래 useEffect), 고를 때는 이미 받아 둔 약속을
   그대로 쓴다. 사용자가 체감하는 지연은 사실상 없다.
   ============================================================ */
let regionMapPromise: Promise<typeof import("./region-map")> | null = null;
function loadRegionMap(): Promise<typeof import("./region-map")> {
  if (!regionMapPromise) regionMapPromise = import("./region-map");
  return regionMapPromise;
}

async function toPicked(
  id: string,
  name: string,
  region: string,
  priceLabel: string | null,
): Promise<PickedComplex> {
  const { resolveRegion } = await loadRegionMap();
  const ref = resolveRegion(region);
  return {
    id,
    name,
    region,
    regionId: ref?.id ?? null,
    regionLabel: ref?.label ?? (region.trim() || null),
    priceLabel,
  };
}

async function fetchDetail(
  id: string,
): Promise<{ region: string; priceLabel: string | null; name: string | null } | null> {
  try {
    const res = await fetch(`/api/complex/${encodeURIComponent(id)}/detail`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      complex?: { name?: string; city?: string; district?: string } | null;
      transactions?: { avg_manwon?: number }[];
    };
    const c = data.complex ?? null;
    const region = c ? [c.city, c.district].filter(Boolean).join(" ") : "";
    const tx = Array.isArray(data.transactions) ? data.transactions : [];
    const latest = tx.length ? tx[tx.length - 1] : null;
    return { region, priceLabel: manwonLabel(latest?.avg_manwon), name: c?.name ?? null };
  } catch {
    return null;
  }
}

/**
 * [975] id 하나로 PickedComplex 를 만든다 — 지도에서 마커를 눌러 고르는 경로가
 * 검색으로 고르는 경로와 **같은 값**을 내게 하려고 여기서 내보낸다.
 * (검색 드롭다운과 지도가 각자 조립하면 지역 표기·시세 라벨이 갈린다.)
 * 상세 조회가 실패하면 이름만 아는 상태로라도 돌려준다 — 지도에서 이미 이름은 봤다.
 */
export async function resolvePickedComplexById(
  id: string,
  fallbackName: string,
): Promise<PickedComplex> {
  const detail = await fetchDetail(id);
  return await toPicked(
    id,
    detail?.name?.trim() || fallbackName,
    detail?.region ?? "",
    detail?.priceLabel ?? null,
  );
}

export function ComplexPicker({
  onSelect,
  initialComplexId,
  initialApt,
  showChip = true,
  clearOnSelect = false,
  placeholder = "단지명으로 검색 (예: 공작아파트)",
  label = "단지 선택",
  labelClassName = "text-text-3",
  onMapClick,
}: {
  onSelect: (c: PickedComplex) => void;
  /** ?complexId= 딥링크 값 (undefined면 URL에서 자동 인식) */
  initialComplexId?: string | null;
  /** ?apt= 딥링크 값 (undefined면 URL에서 자동 인식) */
  initialApt?: string | null;
  /** 선택 단지 칩 표시 (compare처럼 자체 표시가 있으면 false) */
  showChip?: boolean;
  /** 선택 후 입력창 비우기 (여러 단지 연속 담기용) */
  clearOnSelect?: boolean;
  placeholder?: string;
  label?: string;
  /**
   * [975] 라벨 글자색. 밝은 카드 위(기본)는 text-text-3 로 충분하지만,
   * 네이비 히어로 위에 그대로 얹으면 2.8:1 까지 무너진다(시세·타이밍에서 실측).
   * 어두운 면에 놓는 쪽이 text-on-dark-muted 를 넘겨 준다.
   */
  labelClassName?: string;
  /**
   * [975] 옆의 지도 단추가 하는 일.
   *  · 함수 → 그 자리에서 지도 서랍을 연다(화면을 떠나지 않는다).
   *  · null → 단추 자체를 그리지 않는다(이미 지도 안에 있을 때).
   *  · 없음 → 예전대로 /map 으로 이동한다.
   */
  onMapClick?: (() => void) | null;
}) {
  const [query, setQuery] = useState("");
  /* 대기 규칙은 lib/search/settle 한 군데에서만 정한다(예전엔 여기 250ms 를
     따로 적어 뒀다). 한글 조합 중에는 더 오래 기다린다 — 조합 중간 상태
     ("ㄹ","라","래","램"…)로 단지 서제스트를 부르는 건 헛수고다. */
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(query);
  /* [1008 · S] 마지막 응답 한 덩어리 — 물어본 검색어(q)·결과·0건일 때만 오는 "비슷한 이름"·조회 실패.
     따로 두면 "결과는 새 검색어, 강조는 옛 검색어" 처럼 어긋난 조합이 한 번씩 그려진다. */
  const [res, setRes] = useState<{
    q: string;
    items: Suggestion[];
    similar: Suggestion[];
    failed: boolean;
    /** [1008 · 리뷰 B] 장애도 없음도 아닌 안내(검색어 80자 초과) */
    notice?: string | null;
  } | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickedComplex | null>(null);
  const listId = useId();
  const items = res?.items ?? [];
  const options = items.length ? items : res?.similar ?? [];

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  /** 지금 입력(굳기 전) — 굳은 값이 이미 지난 값이면 그걸로 검색하지 않는다(아래 굳은 뒤 검색) */
  const queryRef = useRef(query);
  queryRef.current = query;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const initRef = useRef(false);
  /* [1008 · 리뷰 B] 요청 순번 — 굳기 전 Enter(자동 선택)와 굳은 뒤 검색이 겹치면 늦게 온 옛 응답이 새 결과를
     덮거나, 이미 고른 뒤에 목록을 다시 열었다. 새 요청·선택마다 순번을 올리고 이전 요청은 끊는다. */
  const reqRef = useRef<{ seq: number; ac: AbortController | null; q: string; auto: boolean }>({
    seq: 0,
    ac: null,
    q: "",
    auto: false,
  });
  const cancelPending = useCallback(() => {
    reqRef.current.seq += 1;
    reqRef.current.ac?.abort();
    reqRef.current.ac = null;
    reqRef.current.q = "";
    reqRef.current.auto = false;
    setLoading(false);
  }, []);

  const choose = useCallback(
    async (s: { id: string; name: string; region: string }) => {
      cancelPending();
      setOpen(false);
      setRes(null);
      // 후보 데이터로 즉시 반영 후 상세로 보강
      let picked = await toPicked(s.id, s.name, s.region, null);
      setSelected(picked);
      setQuery(clearOnSelect ? "" : s.name);
      onSelectRef.current(picked);
      const detail = await fetchDetail(s.id);
      if (detail) {
        picked = await toPicked(
          s.id,
          detail.name ?? s.name,
          detail.region || s.region,
          detail.priceLabel,
        );
        if (!clearOnSelect) setSelected(picked);
        onSelectRef.current(picked);
      }
    },
    [clearOnSelect, cancelPending],
  );

  const runSuggest = useCallback(
    async (q: string, autoselect = false) => {
      const term = q.trim();
      cancelPending();
      const seq = reqRef.current.seq;
      if (!term) {
        setRes(null);
        setOpen(false);
        return;
      }
      reqRef.current.q = term;
      reqRef.current.auto = autoselect;
      /* [1008 · 리뷰 B] 80자 넘는 입력은 보내지 않는다 — 서버 400 을 예전엔 "검색이 되지 않아요"(장애)로 적었다 */
      if (term.length > SEARCH_QUERY_MAX) {
        setRes({ q: term, items: [], similar: [], failed: false, notice: QUERY_TOO_LONG });
        setActive(-1);
        setOpen(true);
        return;
      }
      const ac = new AbortController();
      reqRef.current.ac = ac;
      setLoading(true);
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ac.signal });
        const notice = await badRequestNotice(r);
        const data: { suggestions?: Suggestion[]; similar?: Suggestion[]; failed?: boolean } = notice
          ? {}
          : await r.json();
        if (seq !== reqRef.current.seq) return; // 더 새 요청(또는 선택)이 있었다
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        if (autoselect) {
          /* [1008 · 리뷰 B] '비슷한 이름'(오타 추정)은 조용히 고르지 않는다 — "광교 호수공원" 이 호수공원(대림1)@안산
             한 건(비슷한 이름)을 딥링크 초기 선택으로 골랐다. 확실한 일치 중에서만: 이름이 같은 것, 아니면 하나뿐일 때. */
          const sure = list.filter((s) => !s.fuzzy);
          const exact = sure.find((s) => s.name === term) ?? (sure.length === 1 ? sure[0] : null);
          if (exact) {
            await choose(exact);
            return;
          }
        }
        const failed = !notice && (!r.ok || !!data.failed);
        /* 실패는 같은 검색어로 다시 물어볼 수 있게 — 아래 '같은 검색어 중복 요청 막기' 에서 빼 둔다 */
        if (failed) reqRef.current.q = "";
        setRes({ q: term, items: list, similar: data.similar ?? [], failed, notice });
        setActive(-1);
        /* [1008 · S] 0건도 연다 — "없어요" 와 다음 할 일(띄어 쓰는 요령·지도·비슷한 이름)을 보여 준다 */
        setOpen(true);
      } catch {
        if (seq !== reqRef.current.seq) return; // 끊긴 요청(abort)·더 새 요청
        reqRef.current.q = "";
        setRes({ q: term, items: [], similar: [], failed: true });
        setOpen(true);
      } finally {
        if (seq === reqRef.current.seq) {
          reqRef.current.ac = null;
          reqRef.current.auto = false;
          setLoading(false);
        }
      }
    },
    [choose, cancelPending],
  );

  /* [1008 · S] 콤보박스 키보드 — ↑↓ 순환 · Enter 활성 항목(없으면 첫 결과) · Esc 목록만 닫기(한 번 더면 입력을 떠남).
     한글 조합 중 방향키·Enter 는 IME 몫이라 가로채지 않는다. 아직 굳지 않은 입력에서 Enter 면
     옛 결과를 고르지 않고 지금 입력으로 바로 찾는다(정확히 한 곳이면 바로 선택). */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (res) setOpen(true);
        return;
      }
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selected && query === selected.name) return; // 방금 고른 이름 그대로 — 다시 고르지 않는다
      if (query.trim() !== res?.q) {
        void runSuggest(query, true);
        return;
      }
      /* 가리킨 줄이 없으면 첫 결과 — 단 '비슷한 이름'(오타 추정)은 Enter 한 번으로 고르지 않는다(↓로 가리켜 고른다) */
      const pick = active >= 0 ? options[active] : items[0] && !items[0].fuzzy ? items[0] : null;
      if (open && pick) void choose(pick);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else e.currentTarget.blur();
    }
  };

  // 딥링크 초기값 (?complexId= / ?apt=)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    /* [1008] 크롤러는 딥링크 초기 선택을 하지 않는다 — 단지 허브·결과 보드의 링크(?complexId=)를 따라온 봇이
       마운트마다 /api/complex/[id]/detail(1007 실측 614회/일, 대부분 봇)·자동완성을 일으켰다. 워크벤치 쪽
       조회는 1007 human-gate 로 막혀 있고, 이 초기 선택만 남아 있었다(1008 · W 보고). */
    if (isBotBrowser()) return;
    let cid = initialComplexId ?? null;
    let apt = initialApt ?? null;
    if (
      initialComplexId === undefined &&
      initialApt === undefined &&
      typeof window !== "undefined"
    ) {
      const sp = new URLSearchParams(window.location.search);
      cid = sp.get("complexId");
      apt = sp.get("apt");
    }
    if (cid) {
      const id = cid;
      void (async () => {
        const detail = await fetchDetail(id);
        if (detail && (detail.region || detail.name)) {
          const picked = await toPicked(
            id,
            detail.name ?? apt ?? "단지",
            detail.region,
            detail.priceLabel,
          );
          if (!clearOnSelect) setSelected(picked);
          setQuery(clearOnSelect ? "" : picked.name);
          onSelectRef.current(picked);
        } else if (apt) {
          setQuery(apt);
          void runSuggest(apt, true);
        }
      })();
    } else if (apt) {
      setQuery(apt);
      void runSuggest(apt, true);
    }
  }, [initialComplexId, initialApt, clearOnSelect, runSuggest]);

  // 입력이 굳은 뒤 검색 (대기 규칙: lib/search/settle)
  useEffect(() => {
    if (!settledQuery) {
      /* 입력을 비웠으면 진행 중인 검색은 버린다 — 단 딥링크 자동 선택(?apt=)은 마운트 직후 이 자리(빈 입력)를
         지나가므로 끊지 않는다(끊으면 자동 선택이 사라지고 같은 검색을 한 번 더 보냈다 — 리뷰 B 재현). */
      if (!reqRef.current.auto) cancelPending();
      setRes(null);
      setOpen(false);
      return;
    }
    if (selected && settledQuery === selected.name) return; // 방금 선택한 값은 재검색 안 함
    /* [1008 · 리뷰 B] 굳은 값이 지금 입력보다 뒤처졌으면(굳기 전 Enter 로 이미 골랐거나 더 쳤다) 검색하지 않는다 —
       예전엔 고른 순간(selected 변경) 이 효과가 옛 굳은 값("공작")으로 다시 돌아 목록을 도로 열었다(재현). */
    if (settledQuery.trim() !== queryRef.current.trim()) return;
    /* 굳기 전 Enter 가 같은 검색어로 이미 물어봤다(진행 중이거나 끝났다) — 같은 요청을 한 번 더 보내지 않는다 */
    if (settledQuery.trim() === reqRef.current.q) return;
    void runSuggest(settledQuery);
  }, [settledQuery, selected, runSuggest, cancelPending]);

  /* [975] 지역 카탈로그 미리 받기 — 하이드레이션 뒤 한 번. 첫 묶음에서는 뺐지만
     고르는 순간에는 이미 있어야 칩이 바로 뜬다(위 loadRegionMap 주석). */
  useEffect(() => {
    void loadRegionMap();
    void loadList();
  }, []);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      {/* [970 · B-27] label="" 이면 줄 자체를 안 그린다 — 호출측이 이미 제목을 붙인 자리
          (워크벤치 "① 단지 선택")에서 라벨이 두 번 보였다. 접근성 이름은 아래 폴백. */}
      {label && (
        <span className={`text-[12px] font-bold ${labelClassName}`}>{label}</span>
      )}
      {/* 검색 입력 + 지도로 찾기 — 이름을 모르면 지도에서 눌러 고른다.
          지도(/map)는 단지 선택 시 '/analysis?complexId=' 로 되돌려보내고,
          이 선택기가 그 값을 읽어 자동 선택한다(맞물린 왕복). */}
      <div className="flex items-stretch gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          {...compositionProps}
          onFocus={() => {
            void loadList();
            if (res && !selected) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={placeholder}
          aria-label={label || "단지 검색"}
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs font-bold text-ink outline-none focus:border-primary"
        />
        {/* [975] 지도 단추 — 부르는 쪽이 서랍을 갖고 있으면 화면을 떠나지 않는다.
            (예전엔 무조건 /map 으로 나갔다가 다시 ?complexId= 로 돌아와야 했다.) */}
        {onMapClick === null ? null : onMapClick ? (
          <button
            type="button"
            onClick={onMapClick}
            className="press flex shrink-0 items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-[12px] font-bold text-primary hover:border-primary"
            aria-label="지도에서 단지 찾기"
          >
            <Icon name="map" size={14} /> 지도로 찾기
          </button>
        ) : (
          <Link
            href="/map"
            className="flex shrink-0 items-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 text-[12px] font-bold text-primary no-underline hover:border-primary"
            aria-label="지도에서 단지 찾기"
          >
            <Icon name="map" size={14} /> 지도로 찾기
          </Link>
        )}
      </div>

      {open && res && (
        <ComplexPickerList
          listId={listId}
          query={res.q}
          items={res.items}
          similar={res.similar}
          active={active}
          failed={res.failed}
          notice={res.notice}
          onHover={setActive}
          onPick={(s) => void choose(s)}
          onMap={onMapClick ?? undefined}
          mapHref={onMapClick === undefined ? `/map?q=${encodeURIComponent(res.q)}` : undefined}
        />
      )}

      {loading && <span className="text-[10px] text-text-3">검색 중…</span>}

      {showChip && selected && <PickedChip picked={selected} />}
    </div>
  );
}
