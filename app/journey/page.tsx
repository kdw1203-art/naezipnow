import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, howToJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { journeyHowToSteps } from "@/lib/journey/stages";
import { JourneyBoard } from "./JourneyBoard";

/* ============================================================
   [1008 · J] /journey — 내 집 마련 여정(시장 감 → 예산 → 후보 → 임장 → 비교·결정 → 계약·잔금·입주).

   왜(실측, 30일): 도구는 흩어져 있는데 "지금 어느 단계이고 다음에 뭘 하면 되는지"가 없었다 —
   /calculator·/guides/contract 조회 0, 단지 페이지 착지의 48%(13/27)가 다음 페이지 없이 이탈.
   이 화면은 그 도구들을 순서대로 잇는 지도다(새 계산·새 데이터 없음).

   정적 페이지(force-static): 서버는 누구에게나 같은 HTML 을 준다 — 세션·쿠키·주소 쿼리를 읽지 않는다
   (lib/http/cache-policy.ts 공개 캐시 목록, tests/unit/journey-1008.test.ts 가 잠근다). 진행 체크는
   브라우저(이 기기) 또는 로그인한 사람만 /api/me/journey 에서 읽는다.
   JSON-LD HowTo 는 화면에 그리는 같은 배열(JOURNEY_STAGES)에서 만든다.
   ============================================================ */

export const dynamic = "force-static";

const PATH = "/journey";
const TITLE = "내 집 마련 여정 — 시장 감부터 계약·잔금까지 6단계";
const DESCRIPTION =
  "시장 감 잡기·예산 정하기·후보 좁히기·현장 확인(임장)·비교·결정·계약·잔금·입주 — 여섯 단계마다 왜 필요한지, 할 일, 바로 쓸 화면(실거래 지도·계산기·임장노트·비교·계약 일정표)을 이어 둔 안내입니다.";

export const metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/journey",
  og: { badge: "내 집 마련", sub: "6단계 · 단계마다 할 일과 바로 쓸 화면" },
});

export default function JourneyPage() {
  const howTo = howToJsonLd({
    name: "내 집 마련 여섯 단계 — 시장 감 잡기부터 계약·잔금·입주까지",
    description: DESCRIPTION,
    path: PATH,
    steps: journeyHowToSteps(),
  });
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "내 집 마련 여정", url: PATH },
  ]);
  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, howTo]) }} />
      <JourneyBoard />
    </PageShell>
  );
}
