import Link from "@/app/components/IntentLink";
import { PageShell } from "../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getBusinessInfo } from "@/lib/brand/business-info";

/* ============================================================
   크리에이터 입점 안내 — /creators (성장 전략 U4, docs/strategy/unfair-advantage.md)

   임장 콘텐츠 크리에이터를 모으는 아웃바운드 랜딩. 소유자가 섭외 DM 에
   이 링크 하나를 보내는 용도가 1순위.

   사실 규율(심사 확약과 동일 기준):
   - 수익 보장·수익 전망 문구 금지 (회신 확약: 수익문구 영구 미기재)
   - 요율 숫자는 여기 복제하지 않는다(드리프트 방지) — /legal/fees 단일 원천

   [1058 · C6] 틀린 사실들의 수정(코드가 실제로 하는 일에 맞춘다)
   · "공개 노트를 골라 유료 리포트로" — POST /api/creator/reports 는 공개 노트를 400 으로 거절한다. 판매 대상은 비공개 노트.
     자격(게이트 lib/creator/gate.ts)은 전문가 인증 또는 공개 노트 1건 이상 — 자격과 판매 대상은 다른 규칙이라 둘 다 적는다.
   · "자료실·검색에서 판매" — /town/library 는 보관 화면(노출 없음). 구매는 리포트 상세 직접 링크(/town/library/{id})뿐.
   · "판매 보상은 포인트(P)로 적립" — 구매 라우트는 구매자 포인트 차감 · 구매 기록 · 크리에이터 알림까지만 한다.
     크리에이터 포인트 적립·정산은 없다 → "구매 알림만 · 정산 없음".
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "임장 크리에이터 입점 안내",
  description:
    "비공개 임장노트를 유료 리포트로 등록하는 크리에이터 입점 안내. 등록 조건·판매 대상·구매 경로·현재 보상(정산 없음)을 사실대로 안내합니다.",
  path: "/creators",
});

const WHY = [
  {
    icon: "footprints" as const,
    title: "비어 있는 칸의 첫 자리",
    desc: "임장·지역 분석 콘텐츠를 파는 전용 마켓은 아직 없습니다. 답사 기록을 리포트로 묶어 두면 직접 링크로 계속 팔 수 있는 재고가 됩니다.",
  },
  {
    icon: "eye" as const,
    title: "실거래가·임장 준비 방문자",
    desc: "내집나우 방문자는 실거래가를 확인하고 임장을 준비하러 온 사람들입니다. 리포트는 리포트 상세 직접 링크로 전달되며, 자료실 목록·검색 노출은 현재 없습니다.",
  },
  /* [1077] "요율은 한 곳에서" 칸을 걷었다 — 아래 "고지사항" 셋째 줄과 같은 말(한 화면에 같은 사실 두 번 금지) */
];

const STEPS = [
  {
    no: "1",
    title: "임장노트 작성 · 자격",
    desc: "크리에이터 센터 열람·등록 조건은 전문가 인증 또는 공개 임장노트 1건 이상. 공개 노트는 단지·지역 페이지와 검색에 연결됩니다.",
  },
  {
    no: "2",
    title: "비공개 노트를 유료 리포트로 등록",
    desc: "판매 대상은 비공개 노트만(공개 노트는 무료 열람이라 판매 불가). 크리에이터 센터에서 노트를 고르고 가격(100P~100,000P)을 직접 정합니다.",
  },
  {
    no: "3",
    title: "구매는 리포트 상세 직접 링크",
    desc: "구매자는 리포트 상세 링크에서 포인트로 구매하고 연결된 노트 열람권을 얻습니다. 자료실 목록은 보관 상태라 노출 없음 · 판매 실적은 크리에이터 센터에서 확인.",
  },
];

const FAQ = [
  {
    q: "누가 등록할 수 있나요?",
    a: "내집나우 계정에 전문가 인증 또는 공개 임장노트 1건 이상이 있어야 합니다. 등록하는 리포트의 전달물은 본인의 비공개 노트여야 합니다.",
  },
  {
    q: "무엇을 팔 수 있나요?",
    a: "본인이 직접 작성한 비공개 임장노트 한 건을 유료 리포트로 연결합니다. 타인 저작물, 무단 전재, 출처 없는 수치가 담긴 자료는 게시가 제한됩니다.",
  },
  {
    q: "판매 보상은 어떻게 받나요?",
    a: "현재 크리에이터 정산 없음. 구매 시 구매자 포인트가 차감되고 구매 기록이 남으며, 크리에이터에게는 구매 알림만 갑니다. 포인트 적립·현금 전환·출금은 없습니다.",
  },
];

export default function CreatorsPage() {
  const { supportEmail } = getBusinessInfo();
  return (
    <PageShell breadcrumb="홈 › 크리에이터 입점">
      {/* 히어로 — 수익 보장·전망 없이, 구조만 말한다 */}
      <div className="mb-7 max-w-[720px]">
        <h1 className="rise-in t-title text-ink">
          {/* [1030 · 2차] 권유문 → 낱말 */}
          임장 콘텐츠 · 유료 리포트 등록
        </h1>
        <p className="mt-2 t-sub leading-[1.7] text-text-2">
          발로 뛰어 만든 지역 분석과 임장 기록(비공개 노트)을 유료 리포트로 등록하고 직접 링크로 판매하는 구조입니다.
          {/* [1077] "정산 없음"은 아래 고지·FAQ 가 말한다 — 머리에서 되풀이하지 않는다 */}
          수익을 약속하지 않습니다 · 구조와 보상 방식은 아래 고지에 그대로.
        </p>
      </div>

      {/* 왜 내집나우인가 — [1077] 칸 둘(요율 칸은 고지로) */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {WHY.map((w) => (
          <div key={w.title} className="card rounded-2xl px-4 py-4">
            <Icon name={w.icon} size={20} className="text-primary" />
            <div className="mt-2 t-sub font-bold text-ink">{w.title}</div>
            <p className="mt-1 t-sub leading-[1.65] text-text-2">{w.desc}</p>
          </div>
        ))}
      </div>

      {/* 등록까지 3단계 */}
      <h2 className="mb-3 t-section text-ink">등록까지 3단계</h2>
      <ol className="mb-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.no} className="card flex gap-3 rounded-2xl px-4 py-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft t-sub font-bold text-primary">
              {s.no}
            </span>
            {/* [1073] 폰 한 줄 규칙(li 안 t-sub → 말줄임)에 설명 문장까지 걸려 칸이 539px 밖으로 밀렸다(390px 실측 가로 넘침).
                설명은 끝까지 읽혀야 하는 글이라 nz-wrap · 묶음에 min-w-0 */}
            <div className="min-w-0">
              <div className="t-sub font-bold text-ink">{s.title}</div>
              <p className="nz-wrap mt-0.5 t-sub leading-[1.6] text-text-2">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* 사실 고지 — 이 정직함이 브랜드다 */}
      <div className="mb-8 max-w-[720px] rounded-2xl border border-line bg-bg px-4 py-3.5">
        <div className="t-sub font-bold text-ink">고지사항</div>
        <ul className="mt-1.5 flex flex-col gap-1 t-caption leading-[1.65] text-text-2">
          <li>· 판매 수익 규모는 보장하지도, 전망으로 제시하지도 않습니다.</li>
          {/* [1077] 흐름(포인트 차감 · 구매 기록 · 알림)은 FAQ 한 곳에만 — 여기는 사실 한 줄 */}
          <li>· 현재 크리에이터 정산·포인트 적립·현금 전환 없음(흐름은 아래 FAQ).</li>
          <li>
            · 수수료는{" "}
            <Link href="/legal/fees" className="tap-line font-bold text-primary underline underline-offset-2">
              거래·수수료 안내
            </Link>
            의 공표 요율만 적용됩니다 — 이 페이지에 별도 요율은 없습니다.
          </li>
        </ul>
      </div>

      {/* FAQ */}
      <h2 className="mb-3 t-section text-ink">자주 묻는 질문</h2>
      <div className="mb-8 flex max-w-[720px] flex-col gap-3">
        {FAQ.map((f) => (
          <div key={f.q} className="card rounded-2xl px-4 py-3.5">
            <div className="t-sub font-bold text-ink">{f.q}</div>
            <p className="mt-1 t-sub leading-[1.65] text-text-2">{f.a}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Link href="/my/creator" className="btn-primary press rounded-xl px-5 py-2.5 t-sub">
          크리에이터 센터 ›
        </Link>
      </div>
      <p className="t-caption text-text-3">
        입점·제휴 문의: <span className="font-semibold">{supportEmail}</span>
      </p>
    </PageShell>
  );
}
