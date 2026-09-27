import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getBusinessInfo } from "@/lib/brand/business-info";

/* ============================================================
   크리에이터 입점 안내 — /creators (성장 전략 U4, docs/strategy/unfair-advantage.md)

   임장 콘텐츠 크리에이터를 모으는 아웃바운드 랜딩. 소유자가 섭외 DM 에
   이 링크 하나를 보내는 용도가 1순위, 자료실 유입의 판매 전환이 2순위.

   사실 규율(심사 확약과 동일 기준):
   - 수익 보장·수익 전망 문구 금지 (회신 확약: 수익문구 영구 미기재)
   - 판매 보상은 포인트 적립이 사실 전부 — 현금 전환·출금은 없고 도입하지 않는다(2026-08-23 토스 회신 반영)
   - 요율 숫자는 여기 복제하지 않는다(드리프트 방지) — /legal/fees 단일 원천
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "임장 크리에이터 입점 안내",
  description:
    "임장·지역 분석 리포트를 내집나우 자료실에서 판매하는 크리에이터 입점 안내. 노트 작성부터 리포트 판매까지의 절차와 보상 방식을 사실대로 안내합니다.",
  path: "/creators",
});

const WHY = [
  {
    icon: "footprints" as const,
    title: "비어 있는 칸의 첫 자리",
    desc: "임장·지역 분석 콘텐츠를 파는 전용 마켓은 아직 없습니다. 영상 조회수로 흘려보내던 답사 기록이 여기서는 계속 팔리는 재고가 됩니다.",
  },
  {
    icon: "eye" as const,
    title: "읽으러 온 독자가 아니라, 사러 온 독자",
    desc: "내집나우 방문자는 실거래가를 확인하고 임장을 준비하러 온 사람들입니다. 그 지역 리포트가 필요한 순간의 독자에게 바로 닿습니다.",
  },
  {
    icon: "rocket" as const,
    title: "초기 입점 우대",
    desc: "초기 입점 크리에이터에게 수수료 우대 프로모션을 운영합니다. 등급·기간별 요율은 수수료 안내에서 그대로 확인할 수 있습니다.",
  },
];

const STEPS = [
  {
    no: "1",
    title: "임장노트를 쓰고 공개",
    desc: "현장에서 기록한 노트를 공개로 전환하면 단지·지역 페이지와 검색에 연결됩니다.",
  },
  {
    no: "2",
    title: "크리에이터 센터에서 리포트로 승격",
    desc: "공개 노트를 골라 유료 리포트로 만들고 가격을 직접 정합니다.",
  },
  {
    no: "3",
    title: "자료실·검색에서 판매",
    desc: "리포트는 자료실과 검색에 노출되고, 구매자는 열람권을 얻습니다. 판매 실적은 크리에이터 센터에서 실시간 확인합니다.",
  },
];

const FAQ = [
  {
    q: "누가 입점할 수 있나요?",
    a: "내집나우 계정이 있으면 누구나 리포트를 등록할 수 있습니다. 본인·자격 인증을 마친 판매자와 전문가 구독 회원은 우대 요율이 적용됩니다.",
  },
  {
    q: "무엇을 팔 수 있나요?",
    a: "본인이 직접 작성한 임장 기록·지역 분석 리포트입니다. 타인 저작물, 무단 전재, 출처 없는 수치가 담긴 자료는 게시가 제한됩니다.",
  },
  {
    q: "판매 보상은 어떻게 받나요?",
    a: "판매 보상은 포인트(P)로 적립되며, 수수료율은 수수료 안내 페이지의 공표 요율을 따릅니다. 포인트는 현금으로 전환·출금되지 않으며, 매물 상단 노출·꾸미기 등 서비스 내 혜택에만 사용할 수 있습니다.",
  },
];

export default function CreatorsPage() {
  const { supportEmail } = getBusinessInfo();
  return (
    <PageShell breadcrumb="홈 › 크리에이터 입점">
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄(판매 · 보상 · 요율 원천) → 판매까지 3단계 행 → 왜 내집나우 행 → 고지 행 →
          FAQ 행 → 채움 파랑 1개 + 문의 캡션. 지운 것: 슬로건형 제목·소개 문단(→ 사실 줄), 아이콘 카드 3장(아이콘 타일 → 행),
          번호 원 카드(→ 행), 고지 회색 상자(→ 행), FAQ 카드(→ 행). 수익 보장·전망 문구 없음 · 요율 숫자 복제 없음(그대로). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">임장 크리에이터 입점 안내</h1>
          <p className="t-sub text-text-3">
            리포트 판매 · 보상은 포인트 적립 · 요율은 수수료 안내 공표분
          </p>
        </header>

        {/* 판매까지 3단계 */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">판매까지 3단계</h2>
          <ol className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {STEPS.map((s) => (
              <li key={s.no} className="flex gap-3 py-3">
                <span className="w-4 shrink-0 t-body t-num text-text-3">{s.no}</span>
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold text-ink">{s.title}</span>
                  <span className="mt-0.5 block t-sub leading-[1.6] text-text-2">{s.desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* 왜 내집나우인가 — [v4 · 규칙 7] 아이콘 타일 삭제(icon 값은 목록에 남긴다) */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">왜 내집나우인가</h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {WHY.map((w) => (
              <div key={w.title} className="py-3">
                <dt className="t-body font-bold text-ink">{w.title}</dt>
                <dd className="m-0 mt-0.5 t-sub leading-[1.65] text-text-2">{w.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 사실 고지 — 이 정직함이 브랜드다(문장은 그대로 · 상자만 걷음) */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">있는 그대로의 고지</h2>
          <ul className="card flex flex-col divide-y divide-line rounded-lg px-4 t-sub leading-[1.65] text-text-2">
            <li className="py-2.5">판매 수익 규모는 보장하지도, 전망으로 제시하지도 않습니다.</li>
            <li className="py-2.5">판매 보상은 포인트(P) 적립이며, 포인트는 현금으로 전환·출금되지 않습니다(서비스 내 혜택 전용).</li>
            <li className="py-2.5">
              수수료는{" "}
              <Link href="/legal/fees" className="tap-line font-bold text-primary no-underline">
                거래·수수료 안내
              </Link>
              의 공표 요율만 적용 — 이 페이지에 별도 요율 없음.
            </li>
          </ul>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">자주 묻는 것</h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {FAQ.map((f) => (
              <div key={f.q} className="py-3">
                <dt className="t-body font-bold text-ink">{f.q}</dt>
                <dd className="m-0 mt-1 t-sub leading-[1.65] text-text-2">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA — [v4 · 규칙 2] 채움 파랑 하나 · 동사 + 대상 */}
        <div className="flex flex-col gap-2">
          <Link href="/my/creator" className="btn-primary press flex min-h-12 items-center justify-center rounded-lg px-4 t-body no-underline">
            크리에이터 센터 열기
          </Link>
          <p className="t-caption text-text-3">
            입점·제휴 문의 <span className="font-medium">{supportEmail}</span>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
