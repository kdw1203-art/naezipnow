"use client";

import Link from "@/app/components/IntentLink";
import { useRouter } from "next/navigation";
import { ToolGlyph } from "./ToolGlyph";
import type { WorkbenchCardDto } from "./workbench-cards";
import { useHubPicked } from "./hub-context";
import { TOOL_COL_GO, TOOL_COL_NAME, TOOL_COL_RESULT } from "./tool-cols";

/* ============================================================
   워크벤치 표 — [UI-03 · UI-06 · UI-08 · UI-10 · 958]

   [1110 · AI 분석 2차 통폐합] 소유자(2026-11-07 캡처 "1, 2 같은 문구는 필요없어"): 줄을 누르면 아래에 펼쳐지던
   "분석 순서 4단계 · 시장 신호 8칩 · 계산 방법 · 단지 고르고 ○○ 열기" 칸(1050 펼침)을 걷었다. 표의 네 줄은 **한 번 누르면
   바로 그 도구**다 — 단지를 골랐으면 그 단지로, 안 골랐으면 지도 서랍(975)에서 단지부터. 하는 일 · 결과 칸은 그대로.
   ("그 밖의 8종" 칸은 1109 에서 없어졌다 — core 네 줄만 그린다.)

   [975] **줄을 누르면 지도가 함께 뜬다.** 단지를 안 고른 채 누르면 빈 도구 화면이 아니라 지도 서랍(검색 포함)이 열리고,
   거기서 고른 단지로 **그 도구를** 곧장 연다. 새 탭/가운데 클릭 같은 수식 클릭은 가로채지 않고, 서랍 안에
   "단지 없이 먼저 보기" 길도 남긴다.
   [980] 카드 내용은 서버가 조립해 준다(app/analysis/workbench-cards.ts) — tool-identity·tool-persona 를 여기서
   import 하면 /analysis 예산(490KB)을 넘긴다.
   [1049 · 표] 자주 쓰는 도구는 판 한 장(글리프 · 이름 · 하는 일 · 결과).
   ============================================================ */

export function WorkbenchGrid({ core }: { core: WorkbenchCardDto[] }) {
  const { picked, query, openMap } = useHubPicked();
  const router = useRouter();

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
  const row = (c: WorkbenchCardDto) => (
    <tr
      key={c.id}
      className="cursor-pointer border-b border-line last:border-b-0 hover:bg-bg"
      onClick={(e) => {
        /* 링크 밖(하는 일 · 결과 · › 칸)을 눌러도 같은 동작 — 링크 안은 링크가 처리한다 */
        if ((e.target as HTMLElement).closest("a,button")) return;
        if (picked) router.push(`${c.href}${query}`);
        else launch(c);
      }}
    >
      <td className="px-3 py-1.5">
        <Link
          href={`${c.href}${query}`}
          onClick={open(c)}
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
      <td className={`hidden px-2 py-1.5 t-caption text-text-3 lg:table-cell ${TOOL_COL_RESULT}`}>{c.result ?? "—"}</td>
      {/* [1067 · 칸 흔들림] 폭은 한 값으로 고정 — 지역 시세 표의 › 칸과 같은 자리 */}
      <td className={`px-3 text-right t-body text-text-3 ${TOOL_COL_GO}`} aria-hidden="true">
        {/* dead-control-ok: 줄 전체가 링크(tr onClick · 첫 칸 링크) — 화살표는 그 표시 */}
        ›
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="card overflow-hidden rounded-2xl">
        {/* [1071] 칸 폭을 지역 시세 표와 같은 숫자로(tool-cols) — 두 표의 칸이 위아래로 줄을 맞춘다 */}
        <table className="w-full border-collapse md:table-fixed">
          <thead className="max-md:hidden">
            <tr className="border-b border-line bg-bg text-left t-caption text-text-3">
              <th scope="col" className={`px-3 py-2 font-bold ${TOOL_COL_NAME}`}>도구</th>
              <th scope="col" className="px-2 py-2 font-bold">하는 일</th>
              <th scope="col" className={`hidden px-2 py-2 font-bold lg:table-cell ${TOOL_COL_RESULT}`}>결과</th>
              <th scope="col" className={`px-3 py-2 ${TOOL_COL_GO}`}>
                <span className="sr-only">열기</span>
              </th>
            </tr>
          </thead>
          <tbody>{core.map(row)}</tbody>
        </table>
      </div>

      {/* [1015 · 규칙 B] 사용법 문장은 걷었다 — 고른 단지가 있을 때만 그 사실 한 줄 */}
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
