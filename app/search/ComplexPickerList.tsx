"use client";

import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { FuzzyBadge, Hl, complexMetaLine } from "./complex-hit";
import {
  NO_MATCH_EXAMPLE,
  NO_MATCH_HINT,
  noMatchTitle,
  type ComplexPreview,
} from "@/lib/search/complex-preview";

/* ============================================================
   [1008 · S] 단지 선택기(app/analysis/ComplexPicker) 드롭다운 — 입력을 친 뒤에만 필요한 부분이라
   next/dynamic 으로 따로 싣는다(/analysis/ai/[tool] 472/480KB · /analysis 474/490KB 첫 묶음을 늘리지 않게).

   한 줄: 이름(검색어 강조) + [비슷한 이름] · 둘째 줄: 시군구 읍면동 · 세대수 · 6개월 거래
   — 같은 이름 단지가 여럿일 때(은마 3곳·공작 3곳·롯데캐슬 수십 곳) 고를 근거.
   결과가 없으면: "“{q}” 와 일치하는 단지가 없어요" + 띄어 쓰는 요령 + 지도에서 찾기 + 비슷한 이름.
   포커스는 입력창에 남고 활성 항목은 aria-activedescendant 로만 가리킨다(계속 타이핑해 좁힐 수 있게).
   활성·호버 배경은 bg-bg(중립) — AI 도구 화면(.tool-scope)은 --primary-soft 를 도구 색으로 갈아 끼우는데
   다크에서 밝은 연보라가 그대로 남아 글자(text-ink)가 사라졌다(2026-09-21 다크 스크린샷).
   [1008 · 리뷰 B] listbox 안에는 option 만(제목·안내·지도 단추는 밖) · 목록이 비어도 listbox 는 그린다
   (입력창 aria-controls 대상) · 안내는 role=status · notice(검색어 80자 초과 등)가 오면 장애·없음 문구 대신.
   ============================================================ */

export type PickerOption = ComplexPreview & { dong?: string };

export default function ComplexPickerList({
  listId,
  query,
  items,
  similar,
  active,
  failed,
  notice,
  onHover,
  onPick,
  onMap,
  mapHref,
}: {
  listId: string;
  /** 결과를 받아 온 검색어(아직 굳지 않은 입력이 아니라) */
  query: string;
  items: PickerOption[];
  /** 결과가 0건일 때만 오는 "비슷한 이름" 제안 */
  similar: PickerOption[];
  active: number;
  failed: boolean;
  /** 장애·결과 없음 대신 보일 안내(검색어 80자 초과 등) */
  notice?: string | null;
  onHover: (i: number) => void;
  onPick: (s: PickerOption) => void;
  /** 지도 서랍을 여는 함수(있으면) — 없고 mapHref 도 없으면 지도 단추를 그리지 않는다 */
  onMap?: () => void;
  mapHref?: string;
}) {
  const empty = items.length === 0;
  const opts = notice || failed ? [] : empty ? similar : items;
  const similarHead = `${listId}-similar`;
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-[10px] border border-line bg-surface shadow-[0_14px_36px_rgba(16,28,54,.16)]">
      {notice ? (
        <div role="status" className="px-3 py-3 t-sub font-bold text-text-2">
          {notice}
        </div>
      ) : failed ? (
        <div role="status" className="px-3 py-3 t-sub text-text-3">
          지금은 단지 검색이 되지 않아요 (결과 없음이 아니에요)
        </div>
      ) : empty ? (
        <div className="flex flex-col gap-1 px-3 pb-2 pt-3">
          <div role="status" className="flex flex-col gap-1">
            <p className="break-words t-sub font-extrabold text-ink">{noMatchTitle(query)}</p>
            <p className="break-words t-caption text-text-3">
              {NO_MATCH_HINT} · {NO_MATCH_EXAMPLE}
            </p>
          </div>
          {onMap ? (
            <button
              type="button"
              onClick={onMap}
              className="press mt-1 inline-flex min-h-10 w-fit items-center gap-1 rounded-[10px] border border-line px-3 t-sub font-bold text-primary"
            >
              <Icon name="map" size={14} /> 지도에서 찾기
            </button>
          ) : mapHref ? (
            <Link
              href={mapHref}
              className="mt-1 inline-flex min-h-10 w-fit items-center gap-1 rounded-[10px] border border-line px-3 t-sub font-bold text-primary no-underline"
            >
              <Icon name="map" size={14} /> 지도에서 찾기
            </Link>
          ) : null}
        </div>
      ) : null}
      {empty && opts.length > 0 && (
        <div id={similarHead} className="border-t border-divider px-3 pb-0.5 pt-2 t-caption font-bold text-text-3">
          혹시 이 단지인가요? · 이름이 비슷한 단지
        </div>
      )}
      <div
        role="listbox"
        id={listId}
        {...(empty && opts.length > 0 ? { "aria-labelledby": similarHead } : { "aria-label": "단지 검색 결과" })}
      >
        {opts.map((s, i) => (
          <button
            key={s.id}
            id={`${listId}-${i}`}
            type="button"
            role="option"
            aria-selected={active === i}
            tabIndex={-1}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(s)}
            className={`flex min-h-10 w-full flex-col items-start gap-0.5 border-b border-divider px-3 py-2 text-left last:border-b-0 hover:bg-bg ${
              active === i ? "bg-bg" : ""
            }`}
          >
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span className="min-w-0 break-words text-xs font-extrabold text-ink">
                <Hl text={s.name} q={query} />
              </span>
              {s.fuzzy && !empty && <FuzzyBadge />}
            </span>
            <span className="break-words t-caption text-text-3">{complexMetaLine(s) || s.dong}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 고른 단지 칩 — 선택기 첫 묶음에서 빼 여기 둔다(드롭다운과 같은 조각, 하이드레이션 뒤 미리 받음) */
export function PickedChip({
  picked,
}: {
  picked: { name: string; regionLabel: string | null; priceLabel: string | null };
}) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-[10px] bg-primary-soft px-3 py-2">
      <span className="text-xs font-extrabold text-primary">{picked.name}</span>
      {picked.regionLabel && <span className="text-[10px] font-bold text-text-2">{picked.regionLabel}</span>}
      {picked.priceLabel && <span className="text-[10px] font-bold text-text-2">· 최근 {picked.priceLabel}</span>}
      <span className="ml-auto rounded border border-line px-1 py-px text-[10px] font-bold text-text-3">
        실데이터 기준
      </span>
    </div>
  );
}
