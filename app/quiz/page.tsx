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
   자정이 지나면 화면이 스스로 내일 판으로 넘어간다. 클라이언트는 API 를 부르지 않는다. */
export const revalidate = 21600;

export const metadata: Metadata = buildPageMetadata({
  title: "실거래가 게임 — 더 비쌀까, 더 쌀까?",
  description:
    "두 아파트 중 어느 쪽 최근 실거래가가 더 높을까요? 국토교통부 실거래 신고로만 만든 오늘의 10문제 — 풀다 보면 동네 실거래가 감이 생겨요.",
  path: "/quiz",
  og: { badge: "게임", sub: "오늘의 10문제 · 국토교통부 실거래로만" },
});

export default async function QuizPage() {
  const load = await loadQuizDays(Date.now());
  return (
    /* 브레드크럼은 두지 않는다 — 바로 아래 h1 과 같은 말을 한 번 더 적을 뿐이었다 */
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        <h1 className="t-title text-ink">
          실거래가 게임
          <span className="mt-0.5 block t-section font-bold text-text-2">더 비쌀까, 더 쌀까?</span>
        </h1>
        <p className="mt-1.5 t-sub text-text-3">
          A 단지의 최근 실거래가를 보고, B 단지가 더 비싸게 거래됐는지 맞혀 보세요. 두 단지 모두 전용 84㎡
          안팎의 실제 거래 한 건이에요.
        </p>
        {load.ok ? (
          <QuizGame days={load.days} />
        ) : (
          <ErrorState
            className="mt-4"
            title="오늘의 문제를 준비하지 못했어요"
            desc={
              load.reason === "unconfigured"
                ? "실거래 자료에 연결되지 않은 환경이에요. 지어낸 문제는 내지 않아요."
                : "지금은 실거래 자료를 읽지 못했어요. 잠시 뒤 다시 들어와 주세요 — 지어낸 문제는 내지 않아요."
            }
            action={{ href: "/map", label: "지도에서 실거래 보기" }}
          />
        )}
      </div>
    </PageShell>
  );
}
