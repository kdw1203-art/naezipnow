"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { formatKrwManwon } from "@/lib/format/krw";
import { FuzzyBadge, Hl } from "@/app/search/complex-hit";
import {
  NO_MATCH_EXAMPLE,
  NO_MATCH_HINT,
  QUERY_TOO_LONG,
  SEARCH_QUERY_MAX,
  badRequestNotice,
  complexFacts,
  complexPlace,
  noMatchTitle,
} from "@/lib/search/complex-preview";

/* ============================================================
   지도 단지 검색 박스 (6a·item1) — 아파트명·주소 자동완성.
   - 입력(디바운스) → GET /api/search/suggest?q= 로 단지 후보 드롭다운.
   - 주소성 질의(숫자·로/길/동/구/시)면 GET /api/map/geocode?q= 도 함께 조회해
     "📍 '주소'로 이동" 옵션을 상단에 제시(설정 안 됐거나 실패하면 조용히 생략).
   - 내부 단지 결과가 얇으면 서버가 외부 장소검색(Naver)을 폴백으로 붙여
     places[] 로 함께 반환 → "지도 장소" 그룹으로 노출(키 미설정 시 빈 배열=미표시).
   - 선택 시 상위(map-client)로 위임: 단지→recenter+하이라이트, 주소·장소→지도 이동.
   자체 fetch·아웃사이드 클릭·키보드(↑↓ Enter Esc)만 담당하는 프레젠테이션 컴포넌트.
   [1008 · S] 단지 줄: 검색어 강조(괄호·띄어쓰기 건너뜀) · 시군구 읍면동 · 세대수 · 6개월 거래 · 평균 실거래가 ·
   [비슷한 이름]. 0건이면 "“{q}” 와 일치하는 단지가 없어요" · 띄어 쓰는 요령 · 비슷한 이름(suggest 의 similar)
   · 지도에서 직접 찾기(목록을 닫아 지도를 보이게). 이 파일은 지도 동적 청크 안이라 첫 묶음 예산과 무관하다.
   [1008 · 리뷰 B] suggest 의 failed:true·실패 응답은 "지금 검색이 안 돼요"(없음과 다르게) · 80자 넘는 검색어는
   보내지 않고 "검색어는 80자까지예요" · listbox 안에는 option(과 그 묶음 group)만 — 안내·단추는 밖 ·
   목록을 여는 동안(0건 안내 포함) aria-expanded=true · Enter 는 '비슷한 이름' 을 저절로 고르지 않는다. */

interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
  /** [1008 · S] 대표 지번의 읍면동 — 같은 이름 단지 가르기 */
  area?: string | null;
  /** [1008 · S] 이름이 비슷한 후보(오타 추정) */
  fuzzy?: boolean;
  address?: string;
  /* 미리보기 값 — 고르기 전에 판단할 근거. 같은 브랜드 단지가 전국에 깔려
     있어서 이름·지역만으로는 어느 것인지 못 고른다.
     모르는 값은 null 로 온다. 0 으로 그리면 "거래 0건"이라는 거짓이 된다. */
  avgPriceManwon?: number | null;
  recentTradeCount?: number | null;
  buildYear?: number | null;
  households?: number | null;
  lat?: number | null;
  lng?: number | null;
}

/** 만원 → "12억" / "8.0억" / "8,200만". 없으면 null (호출부가 자리를 비운다)
 *  [967 · 31] 본체는 lib/format/krw.ts "listing" — 지도 마커와 같은 구분 없는 얼굴(groupEok:false) */
function priceLabel(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  return formatKrwManwon(manwon, { style: "listing", groupEok: false });
}

interface GeocodeItem {
  address: string;
  lat: number;
  lng: number;
}

/** 외부(지도) 장소검색 폴백 항목 — 내부 단지 결과가 얇을 때만 서버가 채워줌. */
interface PlaceItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface MapSearchSelectComplex {
  id: string;
  name: string;
  region: string;
  /** 지오코딩용 주소(도로명 우선) — 목록 밖 단지의 지도 이동에 사용 */
  address?: string;
}

export interface MapSearchSelectAddress {
  address: string;
  lat: number;
  lng: number;
}

interface MapSearchBoxProps {
  onSelectComplex: (item: MapSearchSelectComplex) => void;
  onSelectAddress: (item: MapSearchSelectAddress) => void;
  className?: string;
  placeholder?: string;
  /** header: 헤더 인라인(투명 배경) / floating: 독립 글래스 바 */
  variant?: "header" | "floating";
  autoFocus?: boolean;
}


/** 주소성 질의 판정 — 숫자 포함 또는 행정구역/도로명 접미 */
function looksLikeAddress(q: string): boolean {
  return /\d/.test(q) || /(로|길|동|구|시|번지|읍|면|리)$/.test(q);
}

export function MapSearchBox({
  onSelectComplex,
  onSelectAddress,
  className = "",
  placeholder = "아파트명·주소 검색",
  variant = "header",
  autoFocus = false,
}: MapSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complexes, setComplexes] = useState<SuggestItem[]>([]);
  /* [1008 · S] 0건일 때만 오는 "비슷한 이름" · 키보드 활성 항목 */
  const [similar, setSimilar] = useState<SuggestItem[]>([]);
  const [active, setActive] = useState(-1);
  /* [1008 · 리뷰 B] 조회 실패(없음과 다르다) · 장애도 없음도 아닌 안내(80자 초과) */
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listId = useId();
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [address, setAddress] = useState<GeocodeItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(query);
  /* 아직 굳지 않은 입력은 "아직 안 물어본 상태"다. 이걸 대기로 안 치면 치는
     도중에 "일치하는 단지가 없어요"가 떴다 사라진다 — 확인한 적 없는 사실을
     화면에 쓰는 셈이다. */
  const busy = loading || (query.trim() !== "" && query.trim() !== settledQuery);

  /* 검색 — 단지 서제스트 + (주소성) 지오코딩 best-effort.
     대기 규칙은 lib/search/settle 한 군데에서만 정한다. 예전에는 이 파일이
     280ms, 헤더가 200ms, 통합검색이 250ms 를 각자 적어 뒀고 왜 다른지는
     아무 데도 없었다. 한글 조합 중에는 더 길게 기다린다 — 조합 중간 상태는
     검색어가 아니다. */
  useEffect(() => {
    const q = settledQuery;
    if (q.length < 1) {
      abortRef.current?.abort();
      setComplexes([]);
      setSimilar([]);
      setPlaces([]);
      setAddress(null);
      setFailed(false);
      setNotice(null);
      setLoading(false);
      return;
    }
    if (q.trim().length > SEARCH_QUERY_MAX) {
      abortRef.current?.abort();
      setComplexes([]);
      setSimilar([]);
      setPlaces([]);
      setAddress(null);
      setActive(-1);
      setFailed(false);
      setNotice(QUERY_TOO_LONG);
      setLoading(false);
      setOpen(true);
      return;
    }
    setLoading(true);
    {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      type SuggestJson = {
        suggestions?: SuggestItem[];
        places?: PlaceItem[];
        similar?: SuggestItem[];
        failed?: boolean;
      };
      const suggestP: Promise<{ j: SuggestJson | null; notice: string | null; failed: boolean }> = fetch(
        `/api/search/suggest?q=${encodeURIComponent(q)}`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          if (r.ok) {
            const j = (await r.json()) as SuggestJson;
            return { j, notice: null, failed: j.failed === true };
          }
          const n = await badRequestNotice(r);
          return { j: null, notice: n, failed: !n };
        })
        .catch(() => ({ j: null, notice: null, failed: true }));

      const geoP: Promise<GeocodeItem | null> = looksLikeAddress(q)
        ? fetch(`/api/map/geocode?q=${encodeURIComponent(q)}&limit=1`, {
            signal: controller.signal,
          })
            .then((r) => (r.ok ? (r.json() as Promise<{ items?: GeocodeItem[] }>) : null))
            .then((j) => {
              const it = j?.items?.[0];
              return it && Number.isFinite(it.lat) && Number.isFinite(it.lng) ? it : null;
            })
            .catch(() => null)
        : Promise.resolve(null);

      void Promise.all([suggestP, geoP]).then(([sug, geo]) => {
        if (controller.signal.aborted) return;
        setComplexes(sug.j?.suggestions ?? []);
        setSimilar(sug.j?.similar ?? []);
        setActive(-1);
        setPlaces(sug.j?.places ?? []);
        setAddress(geo);
        setFailed(sug.failed);
        setNotice(sug.notice);
        setLoading(false);
        setOpen(true);
      });
      return () => controller.abort();
    }
  }, [settledQuery]);

  // 아웃사이드 클릭 → 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    setQuery("");
    setComplexes([]);
    setSimilar([]);
    setPlaces([]);
    setAddress(null);
    setFailed(false);
    setNotice(null);
    setOpen(false);
  }, []);

  const pickComplex = useCallback(
    (c: SuggestItem) => {
      onSelectComplex({ id: c.id, name: c.name, region: c.region, address: c.address });
      setQuery(c.name);
      setOpen(false);
    },
    [onSelectComplex],
  );

  const pickAddress = useCallback(
    (a: GeocodeItem) => {
      onSelectAddress({ address: a.address, lat: a.lat, lng: a.lng });
      setQuery(a.address);
      setOpen(false);
    },
    [onSelectAddress],
  );

  // 외부 장소 선택 → 주소 이동 흐름 재사용(지도 recenter). 좌표를 그대로 위임.
  const pickPlace = useCallback(
    (p: PlaceItem) => {
      const label = p.address ? `${p.name} (${p.address})` : p.name;
      onSelectAddress({ address: label, lat: p.lat, lng: p.lng });
      setQuery(p.name);
      setOpen(false);
    },
    [onSelectAddress],
  );

  /* [1008 · S] 결과가 0건이면 "비슷한 이름" 을 단지 자리에 보여 준다(고를 수 있게). 키보드 순서는 화면 순서
     그대로 — 주소 이동 → 단지(또는 비슷한 이름) → 지도 장소. */
  const shown = complexes.length ? complexes : busy ? [] : similar;
  type Opt = { key: string; pick: () => void };
  const options: Opt[] = [
    ...(address ? [{ key: "addr", pick: () => pickAddress(address) }] : []),
    ...shown.map((c) => ({ key: `c-${c.id}`, pick: () => pickComplex(c) })),
    ...places.map((p, i) => ({ key: `p-${i}`, pick: () => pickPlace(p) })),
  ];
  const optIndex = (key: string) => options.findIndex((o) => o.key === key);
  const optId = (key: string) => `${listId}-${optIndex(key)}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      if (open) setOpen(false);
      else e.currentTarget.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = options.length;
      if (!open) {
        if (n) setOpen(true);
        return;
      }
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
      return;
    }
    if (e.key === "Enter") {
      if (open && active >= 0 && options[active]) options[active].pick();
      /* 가리킨 줄이 없으면 첫 단지 — 단 '비슷한 이름'(오타 추정)은 Enter 한 번으로 고르지 않는다 */
      else if (complexes.length > 0 && !complexes[0].fuzzy) pickComplex(complexes[0]);
      else if (address) pickAddress(address);
      else if (places.length > 0) pickPlace(places[0]);
    }
  };

  const hasResults = complexes.length > 0 || address !== null || places.length > 0;
  const shellClass =
    variant === "floating"
      ? /* [1008] 세로 패딩 0 + 최소 44px — 터치 기기에서는 전역 규칙([989] input min-height 44px)이 입력칸을
           44px 로 올려 py-2.5 와 합쳐 66px 이 됐고, 82px 에서 시작하는 이 카드가 128px 레인의 줌 탭(시군구·동·단지)
           위쪽 20px 을 덮었다(1008 · M 가짜 SDK 캡처·실측 82→148px). 이제 82→126px. */
        "glass-strong flex min-h-[44px] items-center gap-2 rounded-2xl px-3.5 py-0"
      : "flex w-full items-center gap-2 rounded-xl border border-[rgba(255,255,255,.9)] bg-[var(--glass-bg)] px-3.5 py-2";
  const rowClass = (key: string) =>
    `flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-bg ${
      active >= 0 && active === optIndex(key) ? "bg-bg" : ""
    }`;
  const q = settledQuery.trim();
  const panelOpen = open && query.trim().length >= 1;
  const showSimilar = !busy && !notice && complexes.length === 0 && similar.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className={shellClass}>
        <span aria-hidden="true" className="text-[13px] text-text-3">
          ⌕
        </span>
        {/* [968 · 26] 모바일 글자 크기는 여기서 키우지 않는다 — 16px 은 타입 램프 밖이다.
            globals.css [968 · 28] 의 전역 규칙(767px 이하 input { font-size: 1rem },
            특이성 (0,3,1))이 이 text-[13px] 유틸리티(0,1,0)를 이기므로 iOS 포커스 확대가
            나지 않는다. enterKeyHint 는 키보드 확인 키를 "검색"으로, 자동완성·자동교정은
            단지명(고유명사)에 방해라 끈다. */}
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          {...compositionProps}
          onFocus={() => (hasResults || similar.length > 0 || failed || !!notice) && setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          placeholder={placeholder}
          aria-label="단지·주소 검색"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="검색어 지우기"
            className="shrink-0 text-xs text-text-3"
          >
            ✕
          </button>
        )}
      </div>

      {panelOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-[rgba(255,255,255,.9)] bg-[var(--glass-bg-strong)] p-1.5 shadow-[0_16px_40px_rgba(16,28,54,.2)]">
          {/* 안내(검색 중·80자·조회 실패·결과 없음)는 listbox 밖 — role=status 로 읽힌다 */}
          {busy && !hasResults && (
            <div role="status" className="px-3 py-3 text-xs text-text-3">
              검색 중…
            </div>
          )}
          {!busy && notice && (
            <div role="status" className="px-3 py-3 t-sub font-bold text-text-2">
              {notice}
            </div>
          )}
          {!busy && !notice && failed && !hasResults && (
            <div role="status" className="px-3 py-3 t-sub text-text-3">
              지금은 단지 검색이 되지 않아요 (결과 없음이 아니에요)
            </div>
          )}
          {!busy && !notice && !failed && !hasResults && (
            /* [1008 · S] 결과 없음 — 사실(없음) · 다음 할 일(띄어 쓰는 요령 · 지도에서 직접 찾기) */
            <div className="flex flex-col gap-1 px-3 pb-1 pt-2.5">
              <div role="status" className="flex flex-col gap-1">
                <p className="break-words t-sub font-extrabold text-ink">{noMatchTitle(q || query.trim())}</p>
                <p className="break-words t-caption text-text-3">
                  {NO_MATCH_HINT} · {NO_MATCH_EXAMPLE}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-10 w-fit items-center gap-1 t-sub font-bold text-primary"
              >
                <Icon name="map" size={14} /> 목록 닫고 지도에서 직접 찾기
              </button>
            </div>
          )}
          <div id={listId} role="listbox" aria-label="단지·주소 검색 결과">
            {!notice && address && (
              <button
                type="button"
                role="option"
                id={optId("addr")}
                aria-selected={active === optIndex("addr")}
                tabIndex={-1}
                onMouseEnter={() => setActive(optIndex("addr"))}
                onClick={() => pickAddress(address)}
                className={rowClass("addr")}
              >
                <Icon name="📍" size={16} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate t-body font-bold text-ink">{address.address}</span>
                  <span className="t-sub text-text-3">이 주소로 지도 이동</span>
                </span>
              </button>
            )}
            {!notice && shown.length > 0 && (
              <div
                role="group"
                {...(showSimilar ? { "aria-labelledby": `${listId}-similar` } : { "aria-label": "단지" })}
              >
                {showSimilar && (
                  <div
                    role="presentation"
                    id={`${listId}-similar`}
                    className="mt-1 border-t border-[rgba(16,28,54,.06)] px-3 pb-0.5 pt-2 t-caption font-bold text-text-3"
                  >
                    혹시 이 단지인가요? · 이름이 비슷한 단지
                  </div>
                )}
                {shown.map((c) => {
                  /* 미리보기 — 있는 값만 점으로 잇는다. 없는 항목은 자리를 비우고 "0"이나 "—"로 채우지 않는다.
                     [1008 · S] 둘째 줄 = 시군구 읍면동(같은 이름 가르기), 셋째 줄 = 세대수 · 6개월 거래 · 평균 실거래가 · 준공 */
                  const price = priceLabel(c.avgPriceManwon);
                  const bits = [
                    ...complexFacts(c),
                    price ? `평균 실거래 ${price}` : null,
                    c.buildYear ? `${c.buildYear}년` : null,
                  ].filter(Boolean) as string[];
                  const key = `c-${c.id}`;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      id={optId(key)}
                      aria-selected={active === optIndex(key)}
                      tabIndex={-1}
                      onMouseEnter={() => setActive(optIndex(key))}
                      onClick={() => pickComplex(c)}
                      className={rowClass(key)}
                    >
                      <Icon name="🏢" size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate t-body font-bold text-ink">
                            <Hl text={c.name} q={q} />
                          </span>
                          {c.fuzzy && complexes.length > 0 && <FuzzyBadge />}
                        </span>
                        {c.region && <span className="block truncate t-sub text-text-3">{complexPlace(c)}</span>}
                        {bits.length > 0 && (
                          <span className="mt-0.5 block truncate t-sub text-text-2">{bits.join(" · ")}</span>
                        )}
                      </span>
                      <span className="shrink-0 t-sub font-bold text-primary">선택 ›</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!notice && places.length > 0 && (
              <div
                role="group"
                aria-labelledby={`${listId}-places`}
                className="mt-1 border-t border-[rgba(16,28,54,.06)] pt-1"
              >
                <div
                  role="presentation"
                  id={`${listId}-places`}
                  className="px-3 pb-0.5 pt-1.5 t-caption font-bold uppercase tracking-wide text-text-3"
                >
                  지도 장소 · 실시간 검색
                </div>
                {places.map((p, i) => (
                  <button
                    key={`place-${i}-${p.name}`}
                    type="button"
                    role="option"
                    id={optId(`p-${i}`)}
                    aria-selected={active === optIndex(`p-${i}`)}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(optIndex(`p-${i}`))}
                    onClick={() => pickPlace(p)}
                    className={rowClass(`p-${i}`)}
                  >
                    <Icon name="📍" size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-ink">{p.name}</span>
                      {p.address && <span className="block truncate t-sub text-text-3">{p.address}</span>}
                    </span>
                    <span className="shrink-0 t-sub font-bold text-primary">이동 ›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
