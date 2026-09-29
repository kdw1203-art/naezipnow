import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, howToJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { buildContractTimeline, CONTRACT_PHASES } from "@/lib/journey/contract";
import { ContractPlanner } from "./ContractPlanner";
import { PreContractCheck } from "./PreContractCheck";

/* ============================================================
   [1008 · J] /journey/contract — 계약·잔금 일정표(체크리스트 + D-day + 캘린더 .ics + 인쇄).

   왜(실측): /guides/contract 30일 조회 0 — 정적 글은 "내 계약일 기준 언제까지"를 말하지 못한다. 여기서는
   계약일·잔금일만 넣으면 계약 전 확인 → 계약일 → 거래신고(30일) → 잔금 → 취득세·등기(60일) → 전입신고(14일)가
   날짜순으로 선다. 법정 기한·근거는 lib/journey/contract.ts 머리 주석(2026-09-21 국가법령정보센터 원문 확인).

   정적 페이지(force-static) — 입력·계산·저장은 전부 브라우저(ContractPlanner). 서버는 세션·쿠키를 읽지 않는다.
   HowTo 는 화면이 처음 그리는 것과 같은 일정표(날짜 없는 상태)에서 만든다 — 화면에 없는 단계를 스키마에 넣지 않는다.

   [1020 · 담당 B] 소유자 지시 "시안(contract-d/m.png)대로 좀더 고도화" — 본문이 2열(입력 340px + 타임라인)이 되어
   폭 880 → 1120. 제목 줄 오른쪽 버튼(ics·인쇄)은 넣지 않는다(입력 카드 안 하나로 충분 — 채움 파랑 화면당 1개). 부제 한 줄 유지.
   ============================================================ */

export const dynamic = "force-static";

const PATH = "/journey/contract";
const DESCRIPTION =
  "계약일·잔금일을 넣으면 계약 전 확인(등기부·건축물대장·토지거래허가구역)부터 부동산 거래신고(30일)·취득세 신고와 소유권이전등기 신청(잔금일부터 60일)·전입신고(14일)까지 할 일과 법정 기한을 날짜순으로 정리합니다. 캘린더(.ics) 저장·인쇄 가능, 일반 정보이며 법률·세무 자문이 아닙니다.";

export const metadata = buildPageMetadata({
  title: "계약·잔금 일정표 — 거래신고·취득세·등기·전입신고 기한 계산",
  description: DESCRIPTION,
  path: "/journey/contract",
  og: { badge: "계약·잔금", sub: "법정 기한 D-day · 캘린더 저장" },
});

export default function ContractSchedulePage() {
  const steps = buildContractTimeline(
    { contractDate: null, midDate: null, balanceDate: null, moveInDate: null },
    new Set(),
    null,
  ).map((g) => ({
    /* 화면과 같은 글만 — 기한 설명은 화면도 법정·권장 단계에만 적는다(ContractPlanner) */
    name: g.meta.legal || g.meta.suggested ? `${g.meta.title}(${g.meta.dueText})` : g.meta.title,
    text: g.items.map((i) => i.item.title).join(", "),
  }));
  const howTo = howToJsonLd({
    name: "부동산 매매 계약부터 잔금·입주까지 할 일과 법정 기한",
    description: DESCRIPTION,
    path: PATH,
    steps,
  });
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "내 집 마련 여정", url: "/journey" },
    { name: "계약·잔금 일정표", url: PATH },
  ]);

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, howTo]) }} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 max-md:gap-3">
        {/* <header> 가 아니라 <div> — 전역 인쇄 규칙(globals.css @media print)이 header 를 숨겨 제목이 종이에서 빠졌다 */}
        {/* [1015 · 규칙 B] 사용법 문단("계약일과 잔금일을 넣으면 … 인쇄할 수 있어요") → 사실 한 줄 */}
        <div className="flex flex-col gap-1.5">
          <Link
            href="/journey"
            className="jr-noprint inline-flex min-h-[24px] w-fit items-center gap-1 t-sub font-bold text-primary no-underline hover:underline"
          >
            ‹ 내 집 마련 여정 · 6단계 계약·잔금·입주
          </Link>
          <h1 className="m-0 t-title text-ink">계약·잔금 일정표</h1>
          <p className="m-0 t-sub text-text-2">
            {/* 숫자는 lib/journey/contract CONTRACT_PHASES(법정 기한)에서 — 손으로 적지 않는다 */}
            {`거래신고 ${CONTRACT_PHASES.report.offsetDays}일 · 취득세·등기 ${CONTRACT_PHASES.afterBalance.offsetDays}일 · 전입신고 ${CONTRACT_PHASES.moveIn.offsetDays}일 · 캘린더(.ics)·인쇄`}
          </p>
        </div>
        <ContractPlanner />
        {/* [1025 · 담당 S] 계약 전 자동 확인 — 건축물대장(건축HUB) 조회 + 등기소·자가진단 링크. 일정표 아래 카드 하나 */}
        <PreContractCheck />
      </div>
    </PageShell>
  );
}
