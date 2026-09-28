import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadQuizDays } from "@/lib/quiz/load-price-game";
import { QuizGame } from "./QuizGame";

/* [1008 · Q] 실거래가 게임 — "가볍게 들어오는" 입구(소유자 목표 원문: "재미가 있고 사람들이 가볍게
   들어와서 심도있는 고민과 … 매매 단계까지"). 한 판 10문제를 풀고 끝 화면의 "오늘 본 단지"로
   단지 허브에 들어간다(단지 착지 이탈 48% — 막다른 길이 아닌 입구를 하나 더 둔다).

   캐시: 개인화 없음(쿠키·세션·searchParams 를 읽지 않는다) → ISR 6시간. 문제는 KST 날짜별
   데이터 캐시(lib/quiz/load-price-game)라 재생성해도 그 날의 문제는 같고, 내일 판을 미리 실어
   자정이 지나면 화면이 스스로 내일 판으로 넘어간다. 클라이언트는 API 를 부르지 않는다.

   [1020] 소유자 지시("시안대로 좀더 고도화") — 폭 560 한 열 → 데스크톱(lg) 두 열: 가운데 대결판(minmax(0,1fr)) +
   오른쪽 레일 300px(기록·지금까지 나온 단지). 제목 줄은 여기 그대로, 진행 점·레일은 QuizGame 이 그린다
   (게임 루트는 `contents` 라 본문·레일이 이 그리드의 칸이 된다). 폰은 한 열(레일 없음). */
export const revalidate = 21600;

export const metadata: Metadata = buildPageMetadata({
  title: "실거래가 게임 — 오늘의 10문제",
  description:
    "두 아파트 중 최근 실거래가가 더 높은 쪽을 고르는 게임. 국토교통부 실거래 신고로만 만든 오늘의 10문제, 전용 84㎡ 안팎.",
  path: "/quiz",
  og: { badge: "게임", sub: "오늘의 10문제 · 국토교통부 실거래로만" },
});

export default async function QuizPage() {
  const load = await loadQuizDays(Date.now());
  return (
    /* 브레드크럼은 두지 않는다 — 바로 아래 h1 과 같은 말을 한 번 더 적을 뿐이었다 */
    <PageShell>
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="lg:grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
          <div className="min-w-0 lg:col-start-1">
            {/* [1015 · 규칙 D] 물음형 부제("더 비쌀까, 더 쌀까?")·사용법 문단 → 사실 한 줄. 문제 수·기준은 실데이터(오늘 판) */}
            <h1 className="t-title text-ink">실거래가 게임</h1>
            <p className="mt-1 t-sub text-text-3">
              {load.ok ? `오늘 ${Math.max(0, (load.days[0]?.entries.length ?? 1) - 1)}문제 · ` : ""}전용 84㎡ 안팎 · 국토교통부 실거래 신고 · 날마다 새 문제
            </p>
          </div>
          {load.ok ? (
            <QuizGame days={load.days} />
          ) : (
            <div className="min-w-0 lg:col-start-1">
              <ErrorState
                className="mt-4"
                title="오늘의 문제를 준비하지 못했어요"
                desc={
                  load.reason === "unconfigured"
                    ? "실거래 자료에 연결되지 않은 환경이에요. 지어낸 문제는 내지 않아요."
                    : "지금은 실거래 자료를 읽지 못했어요. 지어낸 문제는 내지 않아요."
                }
                action={{ href: "/map", label: "지도에서 실거래 보기" }}
              />
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
