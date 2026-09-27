/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { PageShell } from "../../components/PageShell";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* ============================================================
   포트폴리오 분석 — 등록된 자산이 있어야 성립하는 화면인데, 자산을 저장하는
   경로 자체가 아직 없다([1000] 예시 숫자만 그리던 /my/assets 목업 화면은 삭제했다 —
   "자산 등록 화면 보기"로 보내 봐야 도착지에 등록할 곳이 없었다).

   그런데도 이전 화면은 "총 자산 14.2억 / 순자산 9.4억 / 3개월 ▼3,200만",
   "평촌 초원마을 59㎡ 2019 취득 · 대출 잔액 2.1억", "인천 검단 오피스텔"처럼
   특정인의 대차대조표를 그려놓고 있었다. 자산을 하나도 등록하지 않은 사람이
   들어와도 똑같은 화면이 나왔다 — 보는 사람의 재산을 지어낸 셈이라
   "예시" 배지를 달아 넘길 수 있는 종류가 아니다.

   함께 있던 것들도 같은 이유로 걷어냈다.
   - "1년 / 3년 / 전체" 알약 탭: 서버 컴포넌트의 <span> 이라 눌러도 아무 일이
     없는데 "3년"만 활성 색으로 칠해져 있었다. 게다가 아래 순자산 추이 SVG 의
     d= 는 고정 문자열이어서 기간을 바꿀 것도 없었다.
   - 순자산 추이 곡선·자산 구성 막대·리밸런싱 제안(실현손익 -1,600만 등):
     전부 위 가짜 자산에서 파생된 숫자였다.

   지금은 "등록된 자산 0건"이라는 사실만 말하고, 무엇을 하면 채워지는지 안내한다.
   자산 저장이 열리면 이 자리에 실제 등록분 기준 집계가 들어간다.
   ============================================================ */

/* 자산 알림은 알림 설정(/notifications)에 실제로 존재하는 항목 안내라 남긴다 —
   숫자를 주장하지 않고 "무엇을 받을 수 있는지"만 말한다. */
const ALERTS = [
  "월 순자산 리포트 (매월 1일)",
  "보유 단지 시세 ±3% 변동",
  "대환 실익 발생 시 (금리)",
];

/* 최적화 10 — 홈과 같은 제목을 달고 있던 화면(cycle/page.tsx 주석 참고).
   본문이 "아직 등록된 자산이 없어요" 하나뿐이라 색인은 걸지 않는다. */
export const metadata = buildPageMetadata({
  title: "자산 배분 시뮬레이터",
  description: "보유 자산을 등록하면 포트폴리오를 분석합니다. 자산 등록 기능은 아직 준비 중입니다.",
  path: "/analysis/portfolio",
  noIndex: true,
});

export default function PortfolioPage() {
  /* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 빈 상태 한 줄 → 지금 되는 화면 구분선 행 4개.
     지운 것: 아이콘 빈 상태(아이콘 + 세 문장), NextActions 칩(채움 파랑 포함 → 행), 자산 알림 카드(설명 + 목록 + 버튼 → 행 하나).
     링크는 전부 행으로 남겼다(관심 단지 대시보드 · 계산기 · 시나리오 · 타이밍 · 알림 설정). */
  return (
    <PageShell breadcrumb="분석 도구 › 자산 배분">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">자산 배분 시뮬레이터</h1>
          <p className="t-sub text-text-3">등록된 자산 0건 · 자산 등록 준비 중 · 예시 자산으로 채우지 않음</p>
        </header>

        <section aria-labelledby="pf-next" className="flex flex-col gap-2">
          <h2 id="pf-next" className="t-section text-ink">
            지금 쓸 수 있는 화면
          </h2>
          <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            <SummaryRow label="관심 단지 대시보드" sub="담은 단지의 현재가·변동" href="/my/watchlist" />
            <SummaryRow label="대출·비용 계산기" href="/calculator" />
            <SummaryRow label="매도 vs 보유 시나리오" href="/analysis/scenario" />
            <SummaryRow label="시세·타이밍 보기" href="/analysis/timing" />
            {/* 자산 알림은 알림 설정(/notifications)에 실제로 있는 항목 — 숫자를 주장하지 않고 받을 수 있는 것만 */}
            <SummaryRow label="자산 알림 설정" sub={`등록 뒤 · ${ALERTS.join(" · ")}`} href="/notifications" />
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
