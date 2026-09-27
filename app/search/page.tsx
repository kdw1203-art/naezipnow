import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { SearchClient } from "./search-client";
import { RecentComplexChips } from "../components/RecentComplexes";

/* ============================================================
   통합 검색 — 단지 + 매물 + 임장노트 + 뉴스
   실제 검색 경험은 클라이언트(SearchClient)에서 /api/search/unified 사용
   ============================================================ */

export const metadata: Metadata = {
  /* [970 · A-31|C-25] 접미 없던 제목에 `| 내집나우`. buildPageMetadata 를 안 쓰는 이유:
     아래 robots 가 index:false·follow:true 라 헬퍼의 noIndex(follow:false)와 다르다. */
  title: "통합 검색 | 내집나우",
  /* [1012 · 규칙 5·6] "검색하세요" → 무엇을 찾을 수 있는지 사실로 */
  description: "단지 이름·지역·임장노트·뉴스를 한 번에 찾는 통합 검색. 국토교통부 실거래 신고분 기준.",
  /* 검색 결과 화면은 색인 대상이 아니다(항목 46a) — 내용이 쿼리마다 다르고
     검색엔진 자신의 결과와 경쟁하는 빈 껍데기로 읽힌다. 사이트맵에서도 뺐다. */
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    /* [v4 · 규칙 1·2·12] 가운데 한 줄(760px): 제목 한 줄 → 주인공(검색창) → 목록. PageShell 제목·브레드크럼("검색",
       글자뿐)은 1240 컨테이너 왼쪽 끝이라 가운데 줄과 어긋났다 */
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <h1 className="t-title text-ink">통합 검색</h1>
        {/* 고도화 6 잔여 — 최근 본 단지 칩. 검색 시작점이 가장 자연스러운 자리다(기록 없으면 미렌더). */}
        <RecentComplexChips />
        <SearchClient />
      </div>
    </PageShell>
  );
}
