import { PageShell } from "../components/PageShell";
import { GuestGate } from "@/app/components/GuestGate";
import { safeAuth } from "@/lib/safe-auth";
import { listAgentModels } from "@/lib/agent/loop";
import { AgentChat } from "./AgentChat";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "AI 에이전트",
  description:
    "내 임장노트와 국토교통부 실거래 데이터를 직접 조회해 답하는 내집나우 AI 에이전트.",
  path: "/agent",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 내집나우 AI 에이전트 — 임장노트·실거래 grounding 챗.
   로그인하지 않으면 채팅 대신 로그인 안내를 보여 준다(도구가 본인 노트를 읽는다). */

export default async function AgentPage() {
  const session = await safeAuth();
  const signedIn = Boolean(session?.user?.email);

  return (
    <PageShell breadcrumb="AI 분석 › AI 에이전트">
      <div className="mb-4">
        <h1 className="rise-in t-title text-ink">내집나우 AI 에이전트</h1>
        <p className="rise-in-1 mt-1 max-w-xl t-body text-text-2">
          내 임장노트와 국토교통부 실거래 데이터를 <b>직접 조회해서</b> 답해요.
          기억이나 추정으로 시세를 말하지 않고, 조회한 데이터 목록을 답변과 함께 보여줍니다.
        </p>
        <p className="rise-in-1 mt-1.5 max-w-xl t-sub text-text-3">
          AI 분석은 단지·노트 1건을 깊게, 에이전트는 여러 데이터를 검색·조합해
          질문에 답합니다 · 현재 수도권 실거래 기준
        </p>
      </div>

      {signedIn ? (
        <div className="rise-in-2">
          {/* 모델 선택지는 서버에서 계산 — 키가 설정된 벤더의 모델만 노출된다 */}
          <AgentChat models={listAgentModels()} />
        </div>
      ) : (
        /* [970 · C-40] 공용 GuestGate — 이 화면은 위에 h1 이 있으므로 카드 제목은 h2 */
        <div className="rise-in-2">
          <GuestGate
            as="h2"
            title="로그인하면 에이전트를 쓸 수 있어요"
            desc="에이전트는 회원님의 임장노트를 읽어 답하기 때문에 로그인이 필요해요."
            pathname="/agent"
          />
        </div>
      )}
    </PageShell>
  );
}
