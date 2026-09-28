"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { COMPARE_PARAM, filterRegions, type RegionOption } from "./price-search-model";

/* [1022 · 면적대별 검색·비교] 지시 2 — 지역 바꾸기를 <select> 에서 **검색형 입력**으로.
   타이핑 → 시군구 자동완성(목록은 예전 셀렉트가 받던 같은 배열: 실거래 셀이 있는 지역만, 빈 지역은 고를 수 없다).
   고르면 예전처럼 /analysis/price?region=<slug> 로 이동(서버 컴포넌트가 다시 계산 — 경로 규칙 그대로).
   비교 중인 단지(?cmp=)는 지역을 바꿔도 따라간다. 콤보박스 키보드(↑↓ Enter Esc)는 ComplexPicker 와 같은 규칙,
   한글 조합 중에는 IME 몫이라 가로채지 않는다. 걸러내기(filterRegions)는 순수 함수 — 테스트 대상. */
export function RegionSelect({
  regions,
  current,
}: {
  regions: RegionOption[];
  current: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const options = open ? filterRegions(regions, query) : [];

  const go = (slug: string) => {
    setOpen(false);
    setActive(-1);
    setQuery("");
    /* 비교 중인 단지는 지역을 바꿔도 따라간다(URL 만 — 저장은 CompareComplexes 가 한다) */
    let cmp = "";
    try {
      cmp = new URLSearchParams(window.location.search).get(COMPARE_PARAM) ?? "";
    } catch {
      cmp = "";
    }
    const tail = cmp ? `&${COMPARE_PARAM}=${encodeURIComponent(cmp)}` : "";
    if (slug === current) return;
    router.push(`/analysis/price?region=${encodeURIComponent(slug)}${tail}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = active >= 0 ? options[active] : options[0];
      if (open && pick) go(pick.slug);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else e.currentTarget.blur();
    }
  };

  // 바깥 클릭 시 목록 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={boxRef} className="pxc-region">
      <span className="pxc-region-ico" aria-hidden="true">
        <Icon name="search" size={14} />
      </span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="지역 검색"
        aria-label="지역 검색"
        className="pxc-region-input t-sub font-bold text-ink"
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="지역" className="pxc-region-list m-0 list-none p-0" data-tone="plain">
          {options.length === 0 ? (
            <li role="status" className="px-3 py-2.5 t-sub text-text-3">
              “{query.trim()}” 지역은 실거래 집계에 없음
            </li>
          ) : (
            options.map((r, i) => (
              <li
                key={r.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={r.slug === current}
                className={`pxc-region-opt ${i === active ? "pxc-region-opt-on" : ""} ${r.slug === current ? "font-bold" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r.slug);
                }}
              >
                <span className="t-sub text-ink">{r.name}</span>
                <span className="t-caption t-num text-text-3">{r.txCount.toLocaleString("ko-KR")}건</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
