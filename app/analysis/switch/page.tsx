import { PageShell } from "../../components/PageShell";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* ============================================================
   갈아타기 추천 — 추천 엔진이 아직 없어 화면 전체를 빈 상태로 되돌렸다.

   이전 화면에는 다음이 있었고 전부 손으로 적은 값이었다.
   - "지역 안양·과천·의왕 ▾" / "금액대 7~10억 ▾" — <select> 가 아니라 ▾ 문자를
     붙인 <div> 였다. 눌러도 아무 일이 없는데 누를 수 있게 생겼었다.
   - "추천 오픈 준비 중" — 테두리·패딩까지 갖춘 버튼 모양의 <span>.
     준비 중이라는 사실은 문장으로 말하면 되지, 버튼처럼 보일 이유가 없다.
   - "✎ 프로필 수정" — href 도 onClick 도 없는데 캡션은 "수정 가능"이라 적혀 있었다.
   - "내 프로필: 30대 · 남 · 2인 거주" — 보는 사람이 누구든 같은 값이 나오는,
     보는 사람의 신상을 지어낸 칩이었다.
   - "1. 안양 관양동 · 적합도 92% · 내 노트 3건 보유" 같은 추천 목록 — 계산한
     적합도가 아니고, 특히 "내 노트 3건"은 이용자 본인의 데이터를 지어낸 것이라
     제일 나빴다. 노트를 한 건도 안 쓴 사람에게도 3건이라고 말하고 있었다.
   - "평촌에서 갈아탄 이용자들은 관양동 38%" — 이용자 이동 통계를 집계하는
     경로가 없다. "예시" 배지를 달아도 실제 이용자 행동을 지어낸 숫자는
     남겨둘 근거가 못 된다(설명용 계산 예시와 다르다).

   추천은 등록 자산·프로필 조건과 실거래·지수 데이터가 붙어야 계산할 수 있다.
   그때까지는 없는 걸 없다고 말하고, 지금 실제로 되는 화면으로 보낸다.
   ============================================================ */

/* 최적화 10 — 홈과 같은 제목을 달고 있던 화면(cycle/page.tsx 주석 참고).
   본문이 "갈아타기 추천은 아직 준비 중이에요" 하나뿐이라 색인은 걸지 않는다.
   제목은 h1 과 맞춘다 — 탭·북마크·방문 기록에서 홈과 구분되게. */
export const metadata = buildPageMetadata({
  title: "갈아타기 추천 지역",
  description: "갈아타기 추천 엔진은 아직 준비 중입니다. 지금은 지역 시세와 공개 임장노트로 후보를 비교할 수 있어요.",
  path: "/analysis/switch",
  noIndex: true,
});

export default function SwitchPage() {
  /* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 지금 되는 화면 구분선 행.
     지운 것: 아이콘 빈 상태(아이콘 + 두 문장), NextActions 칩(채움 파랑 포함 → 행), 알림 안내 카드(→ 행 하나). 링크는 전부 행으로. */
  return (
    <PageShell breadcrumb="AI 분석 › 포트폴리오 › 갈아타기 추천">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">갈아타기 추천 지역</h1>
          <p className="t-sub text-text-3">추천 계산 준비 중 · 적합도·순위를 지어내지 않음</p>
        </header>

        <section aria-labelledby="sw-next" className="flex flex-col gap-2">
          <h2 id="sw-next" className="t-section text-ink">
            지금 쓸 수 있는 화면
          </h2>
          <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            <SummaryRow label="지역 시장 온도·시세 타이밍" sub="실데이터" href="/analysis/timing" />
            <SummaryRow label="관심 단지 비교하기" href="/analysis/compare" />
            <SummaryRow label="대출·비용 계산기" href="/calculator" />
            <SummaryRow label="추천이 열리면 알림 받기" href="/notifications" />
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
