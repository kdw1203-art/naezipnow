"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToolGlyph } from "./ToolGlyph";
import type { WorkbenchCardDto } from "./workbench-cards";
import { useHubPicked } from "./hub-context";

/* ============================================================
   워크벤치 그리드 — [UI-03 · UI-06 · UI-08 · UI-10 · 958]

   예전: 12장이 한꺼번에 펼쳐졌고 전부 같은 문장을 달고 있었다. 지금: 자주
   쓰는 4종만 펼치고 8종은 접는다. 958 에서 카드마다 **결과물 모양 글리프**와
   "무엇이 나오는지"(metricLabel) 한 줄을 붙였다 — 이름만으로는 열두 도구가
   서로 뭐가 다른지 알 수 없었다.

   [975] **카드를 누르면 지도가 함께 뜬다.** 예전엔 단지를 안 고른 채 카드를
   누르면 빈 도구 화면이 열렸고, 거기서 단지명을 정확히 알아야 시작할 수 있었다.
   이제 고른 단지가 없으면 카드 클릭이 지도 서랍을 열고(검색도 그 안에 있다),
   거기서 고른 단지로 **그 도구를** 곧장 연다. 새 탭/가운데 클릭 같은 수식 클릭은
   가로채지 않고, 서랍 안에 "단지 없이 먼저 보기" 길도 남긴다.
   ============================================================ */

export function WorkbenchGrid({
  core,
  more,
  details = {},
}: {
  core: WorkbenchCardDto[];
  more: WorkbenchCardDto[];
  /** [1050 · 펼침] 도구 id → 펼친 내용(서버 조각 hub-tool-detail · 하는 일 · 결과 · 분석 순서 · 시장 신호) */
  details?: Partial<Record<string, ReactNode>>;
}) {
  const { picked, query, openMap } = useHubPicked();
  const router = useRouter();
  /* [1050 · 펼침] 소유자 지시(2026-10-09): "ai분석에서도 해당 기능을 누르면 펼쳐지기가 되어서 기능의 내용이 보이고
     한 번 더 누르면 기능을 사용할 수 있도록". 첫 누름 = 그 도구 아래에 내용(하는 일 · 결과 · 분석 순서 4단계 ·
     함께 보는 시장 신호)이 펼쳐진다. 같은 도구를 다시 누름(또는 펼친 칸의 "도구 열기") = 예전 동작 그대로
     (단지를 골랐으면 그 도구 · 안 골랐으면 지도 서랍). 새 탭·가운데 클릭은 가로채지 않는다. 펼침은 한 번에 하나. */
  const [openId, setOpenId] = useState<string | null>(null);

  /* [980] 카드 내용은 서버가 조립해 준다(app/analysis/workbench-cards.ts).
     여기서 tool-identity·tool-persona 를 직접 import 하면 두 모듈이 통째로
     브라우저 번들에 실려 /analysis 예산(490KB)을 넘긴다 — 실측 502KB. */
  /* [1049 · 표] 소유자 지시(2026-10-09) "AI 분석 디자인 개선과 간결화 · 표 적극 도입" — 카드 4장(왼쪽 색 띠) + 칩 한 줄로
     갈려 있던 12종을 **판 한 장**으로. 자주 쓰는 4종은 표(글리프 · 이름 · 하는 일 · 결과), 그 밖의 8종은 같은 판 아래 촘촘한 칸.
     누르는 동작은 그대로(단지를 안 골랐으면 지도 서랍 → 그 도구). */
  /* 지도 서랍 → 고른 단지로 그 도구 */
  const launch = (c: WorkbenchCardDto) =>
    openMap({
      purpose: c.title,
      skipHref: c.href,
      onPicked: (p) => router.push(`${c.href}?complexId=${encodeURIComponent(p.id)}`),
    });
  const open = (c: WorkbenchCardDto) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    /* 단지가 이미 있으면 그대로 간다. 새 탭·가운데 클릭도 건드리지 않는다. */
    if (picked) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    launch(c);
  };
  const tap = (c: WorkbenchCardDto) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (openId === c.id) return open(c)(e);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setOpenId(c.id);
  };
  /* 펼친 칸 — 내용은 서버 조각(details), 여기는 "열기"(예전 동작)와 "접기"만 */
  const detail = (c: WorkbenchCardDto) => (
    <div id={`tool-open-${c.id}`} className="tool-scope flex flex-col gap-2.5" style={c.vars}>
      {details[c.id]}
      <div className="flex items-center gap-1">
        <Link href={`${c.href}${query}`} onClick={open(c)} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold no-underline">
          {c.title} 열기 ›
        </Link>
        <button
          type="button"
          onClick={() => setOpenId(null)}
          aria-label={`${c.title} 접기`}
          className="inline-flex min-h-10 items-center rounded-full px-3 t-sub font-bold text-text-2 hover:bg-surface"
        >
          접기 ▴
        </button>
      </div>
    </div>
  );
  const row = (c: WorkbenchCardDto) => {
    const isOpen = openId === c.id;
    return (
    <Fragment key={c.id}>
    <tr
      className={`cursor-pointer border-b border-line last:border-b-0 ${isOpen ? "bg-bg" : ""}`}
      onClick={(e) => {
        /* 링크 밖(하는 일 · 결과 · › 칸)을 눌러도 같은 순서 — 링크 안은 링크가 처리한다 */
        if ((e.target as HTMLElement).closest("a,button")) return;
        if (!isOpen) setOpenId(c.id);
        else if (picked) router.push(`${c.href}${query}`);
        else launch(c);
      }}
    >
      <td className="px-3 py-1.5">
        <Link
          href={`${c.href}${query}`}
          onClick={tap(c)}
          aria-expanded={isOpen}
          aria-controls={isOpen ? `tool-open-${c.id}` : undefined}
          className="tool-scope press flex min-h-11 min-w-0 items-center gap-2.5 no-underline"
          style={c.vars}
          data-tool={c.id}
        >
          <span className="tool-soft-bg tool-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
            <ToolGlyph id={c.glyph} size={24} />
          </span>
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">{c.title}</span>
            <span className="block truncate t-caption text-text-3 md:hidden">{c.premise}</span>
          </span>
        </Link>
      </td>
      <td className="hidden px-2 py-1.5 t-sub text-text-2 md:table-cell">{c.premise}</td>
      <td className="hidden w-[180px] px-2 py-1.5 t-caption text-text-3 lg:table-cell">{c.result ?? "—"}</td>
      <td className={`px-3 text-right ${isOpen ? "w-16 whitespace-nowrap t-caption font-bold text-primary" : "w-8 t-body text-text-3"}`} aria-hidden="true">
        {/* dead-control-ok: 줄 전체가 펼침 단추(tr onClick · 첫 칸 링크의 첫 누름) — 캐럿은 그 상태 표시 */}
        {isOpen ? "열기 ›" : "▾"}
      </td>
    </tr>
    {isOpen && (
      <tr className="border-b border-line bg-bg last:border-b-0">
        <td colSpan={4} className="px-3 pb-3 pt-1 md:pl-[60px]">
          {detail(c)}
        </td>
      </tr>
    )}
    </Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="card overflow-hidden rounded-2xl">
        <table className="w-full border-collapse">
          <thead className="max-md:hidden">
            <tr className="border-b border-line bg-bg text-left t-caption text-text-3">
              <th scope="col" className="px-3 py-2 font-bold">도구</th>
              <th scope="col" className="px-2 py-2 font-bold">하는 일</th>
              <th scope="col" className="hidden px-2 py-2 font-bold lg:table-cell">결과</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">열기</span>
              </th>
            </tr>
          </thead>
          <tbody>{core.map(row)}</tbody>
        </table>
        {/* 그 밖의 8종 — 같은 판 아래 촘촘한 칸(글리프 · 이름). 폰 2열 · 데스크톱 4열 — 표 한 줄씩이면 화면이 길어진다 */}
        {more.length > 0 && (
          <div className="border-t border-line bg-bg/60 px-3 py-2">
            <p className="m-0 pb-1 t-caption font-bold text-text-3">그 밖의 도구 {more.length}</p>
            {/* [1050 · 펼침] 누른 칸 줄 바로 아래에 내용 — 같은 줄의 나머지 칸은 dense 로 제 줄에 남는다 */}
            <ul className="m-0 grid list-none grid-flow-row-dense grid-cols-2 gap-x-2 p-0 md:grid-cols-4">
              {more.map((c) => {
                const isOpen = openId === c.id;
                return (
                <Fragment key={c.id}>
                <li className="min-w-0">
                  <Link
                    href={`${c.href}${query}`}
                    onClick={tap(c)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? `tool-open-${c.id}` : undefined}
                    className={`tool-scope press flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1 no-underline ${isOpen ? "bg-surface" : ""}`}
                    style={c.vars}
                    data-tool={c.id}
                    title={c.premise}
                  >
                    <span className="tool-ink inline-flex shrink-0" aria-hidden="true">
                      <ToolGlyph id={c.glyph} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate t-sub font-bold text-text-1">{c.title}</span>
                    {isOpen && <span className="shrink-0 t-caption font-bold text-primary">열기 ›</span>}
                  </Link>
                </li>
                {isOpen && (
                  <li className="col-span-2 mb-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 md:col-span-4">
                    {detail(c)}
                  </li>
                )}
                </Fragment>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* [1015 · 규칙 B] 사용법 문장("카드를 누르면 지도가 떠요 …")은 걷었다 — 고른 단지가 있을 때만 그 사실 한 줄 */}
      {picked && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-sub text-text-3">
            <span className="font-bold text-primary">{picked.name}</span> 기준
          </span>
        </div>
      )}
    </div>
  );
}
