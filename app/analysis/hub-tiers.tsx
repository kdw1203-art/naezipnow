"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkbenchRow } from "./workbench-cards";
import { useHubPicked } from "./hub-context";
import { ROW_CLASS, RowChevron, RowText } from "./hub-row";

/* ============================================================
   단지 분석 12행 — [UI-03 · 975 · v4]

   [v4 · 한 화면 한 가지] 카드 4장(글리프 타일 · 성격 배지 · 설명 문단 · 숫자 줄 · "결과:" 줄) + "그 밖의 도구 8"
   칩 구름을 **구분선 목록 한 벌**로 바꿨다. 행 = 도구 이름 + 결과 한 줄("투자 점수 · 5개 항목") + `›`.
   앞 5행만 펼치고 나머지는 <details> "12개 모두 보기" 하나로 접는다(칩 구름 없음).

   [975] **고른 단지가 없으면 행을 눌러도 빈 도구 화면으로 가지 않는다.** 지도 서랍을 열고
   (검색도 그 안에 있다), 거기서 고른 단지로 **그 도구를** 곧장 연다. 새 탭/가운데 클릭 같은
   수식 클릭은 가로채지 않고, 서랍 안에 "단지 없이 먼저 보기" 길도 남긴다.
   고른 단지가 있으면 ?complexId= 를 실어 바로 간다.
   ============================================================ */

/** 처음에 펼쳐 두는 행 수 — 나머지는 접힌다 */
const OPEN_ROWS = 5;

export function WorkbenchList({ rows }: { rows: WorkbenchRow[] }) {
  const { picked, query, openMap } = useHubPicked();
  const router = useRouter();

  /* [980] 행 내용은 서버가 조립해 준다(app/analysis/workbench-cards.ts).
     여기서 tool-identity·tool-persona 를 직접 import 하면 두 모듈이 통째로
     브라우저 번들에 실려 /analysis 예산(490KB)을 넘긴다 — 실측 502KB. */
  const row = (c: WorkbenchRow) => (
    <li key={c.id}>
      <Link
        href={`${c.href}${query}`}
        onClick={(e) => {
          /* 단지가 이미 있으면 그대로 간다. 새 탭·가운데 클릭도 건드리지 않는다. */
          if (picked) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openMap({
            purpose: c.title,
            skipHref: c.href,
            onPicked: (p) => router.push(`${c.href}?complexId=${encodeURIComponent(p.id)}`),
          });
        }}
        className={ROW_CLASS}
        data-tool={c.id}
      >
        <RowText title={c.title} sub={c.sub} />
        <RowChevron />
      </Link>
    </li>
  );

  const head = rows.slice(0, OPEN_ROWS);
  const rest = rows.slice(OPEN_ROWS);

  return (
    /* [v4.1 · 리퀴드 목록] 바깥 카드 테두리·px 를 뗐다 — 안쪽 두 목록이 각각 유리판(테두리·14px 여백)이 되어 겹겹이 됐다.
       도구 목록 = hanji(바로 아래 "지역 시세" blue 와 구분), "모두 보기"로 이어지는 나머지도 같은 목록이라 같은 톤 */
    <div className="flex flex-col">
      <ul data-tone="hanji" className="flex flex-col divide-y divide-line">{head.map(row)}</ul>
      {rest.length > 0 && (
        <details className="group border-t border-line">
          {/* 네이티브 <details> 토글 — summary 줄 전체가 컨트롤이다. 펼치면 글자만 "접기"로 바뀐다 */}
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-1 t-sub font-bold text-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{rows.length}개 모두 보기</span>
            <span className="hidden group-open:inline">접기</span>
          </summary>
          <ul data-tone="hanji" className="flex flex-col divide-y divide-line border-t border-line">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
