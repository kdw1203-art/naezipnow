/* [1025 · 결정·비서] /decide — 결정 카드(시장 9 "정보 대신 결정을 판다"). 서버는 세션·페르소나 가중치 초기값만 읽고,
   후보·값·점수·저장은 DecideClient(비교 트레이는 이 기기의 localStorage 라 클라이언트가 읽는다). */
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { safeAuth } from "@/lib/safe-auth";
import { getPreferences } from "@/lib/me/preferences-store";
import { logger } from "@/lib/log";
import { DEFAULT_DECIDE_WEIGHTS, weightsFromPriorities, type DecideWeights } from "@/lib/decide/score";
import { DecideClient } from "./DecideClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "결정 카드",
  description: "비교함·관심 단지에서 고른 후보 최대 3곳을 가격·전세가율·거래량·학교 기준 가중치로 줄 세우고 결정(살까·보류·패스·다시 보기)을 남깁니다. 국토교통부 실거래 기준.",
  path: "/decide",
});

export default async function DecidePage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  /* 페르소나가 있으면 그 우선순위(가격·학군)를 슬라이더 초기값으로, 없으면 균등 5 */
  let initialWeights: DecideWeights = { ...DEFAULT_DECIDE_WEIGHTS };
  if (email) {
    try {
      const prefs = await getPreferences(email);
      if (prefs.persona) initialWeights = weightsFromPriorities(prefs.priorities);
    } catch (e) {
      logger.warn("[decide] 페르소나 조회 실패 — 균등 가중치로 시작", e);
    }
  }
  return (
    <PageShell wide>
      <DecideClient signedIn={Boolean(email)} initialWeights={initialWeights} />
    </PageShell>
  );
}
