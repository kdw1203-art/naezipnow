import type { HomeEntry } from "@/lib/newui/home-entries";
import { HOME_LIST, HomeRow } from "./HomeRows";

/* ============================================================
   [1012 · 규칙 7 · 채점 A] 홈 검색 아래 입구 — 실데이터가 붙은 목록(그리기만. 재료는 lib/newui/home-entries).

   왜: 예전 자리는 "어디서부터 시작할까요?" 아이콘 4문 타일(구경·후보·계약·처음) + 예산 칩이었다.
   기준 사이트 4곳(호갱노노·당근·네이버·숨고)에는 아이콘을 나열한 "특징" 섹션도, 상황을 고르는
   문도 없다 — 검색·지도·목록으로 바로 들어간다(docs/design-system.md v3 신호표 3·5번). 입구는
   **숫자가 붙은 행**이어야 한다: 눌러 보기 전에 무엇이 얼마나 있는지 보이는 줄.

   [v4 · 규칙 5] 형태: 승인 시안의 목록 행 — 왼쪽 이름(굵게) + 보조 한 줄 / 오른쪽 숫자 + `›`, 1px 구분선.
   예전 md+ 2열 격자(`data-cols` · gap-px 판)는 데스크톱 가운데 한 줄(760px)에서 필요 없어 뺐다 — 모바일과 같은 1열.
   서버 컴포넌트 · 클라이언트 JS 없음(홈 번들 예산 0바이트) — 첫 화면은 정적([991]).
   ============================================================ */
export function HomeEntryList({ entries }: { entries: HomeEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <nav aria-label="지금 볼 수 있는 것" className="w-full">
      {/* [v4.1 · 리퀴드 목록] 실데이터 입구 = blue (아래 임장노트 hanji 와 구분) */}
      <ul data-tone="blue" className={HOME_LIST}>
        {entries.map((e) => (
          <HomeRow key={e.key} href={e.href} label={e.label} sub={e.meta} value={e.value} />
        ))}
      </ul>
    </nav>
  );
}
