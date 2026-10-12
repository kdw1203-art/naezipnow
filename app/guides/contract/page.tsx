/* [1026c · 폰 배율 1] 단계 설명은 끝까지 읽혀야 한다 — 폰 배율의 한 줄 규칙(html[data-mscale] li p·div.t-sub)에서
   말줄임되지 않게 nz-wrap 예외를 달아 둔 자리였다. [1062] 그 설명이 접힌 FAQ 의 답(FaqCompact · li > p.t-sub)으로
   옮겨 갔으므로, 같은 예외가 globals.css 의 `.faq-compact` 쪽에 있어야 한다(globals.css 는 이번 묶음 다른 축 소유 —
   여기서 고치지 않고 보고한다). 칸 min-w-0 은 표·접기가 대신 받는다. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { breadcrumbJsonLd, howToJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { FactTable } from "@/app/components/compact/FactTable";
import { FaqCompact } from "@/app/components/compact/FaqCompact";

/* ============================================================
   항목 F30 — 계약 전 체크리스트 & 표준계약·특약 가이드 (정보성 콘텐츠)
   단계별 확인사항 / 표준계약서 핵심 조항 / 자주 쓰는 특약 예시 /
   등기부·건축물대장 확인 포인트. 실제 계약은 중개사무소 확인·설명과 관련 기관 확인 권고.
   [1008 · J] 이 글은 30일 조회 0 — "내 계약일 기준 언제까지"를 말하지 못한다. 맨 위에 계산하는 도구
   (/journey/contract 계약·잔금 일정표)로 가는 입구 한 줄을 둔다. 또 법률 서비스(법무사·변호사) 추천 금지
   원칙(토스 입점 심사 · scripts/check-toss-review-freeze.mjs)에 맞춰 화면 문구에서 "법무사 검토" 권고를 뺐다.

   [1062 · 글 줄이기] 소유자 지시 "글씨가 많이 나온 페이지들을 표·요약·키워드 형식으로 심플하게"(10-12).
   · 계약 단계 5개(제목 + 두 문장) → 접힌 행 + 핵심 낱말 칩. HowTo JSON-LD 는 그대로 STAGES 에서 낸다.
   · 조항 8개(왼쪽 선 + 문단) → "조항 | 적을 내용" 두 칸 표 두 장(임대차 · 매매).
   · 특약 예시 5개(테두리 상자 + 긴 인용문) → 접힌 행 + 낱말 칩, 인용문은 눌러야 펼쳐진다.
   · 등기부·건축물대장 확인 점 6개("표제부: …" 꼴 글머리) → 그대로 "항목 | 사실" 표의 두 칸이 된다.
   · 아이콘 색면(bg-primary-soft 사각형)은 섹션 머리에서 걷었다 — 강조는 굵기·크기로.
   문장·인용문은 한 글자도 지우지 않았다(DOM 에 그대로 · JSON-LD·검색 발췌 유지).
   ============================================================ */

const PATH = "/guides/contract";

export const metadata: Metadata = {
  title: "계약 전 체크리스트 & 표준계약·특약 가이드 | 내집나우",
  description:
    "가계약부터 잔금·입주까지 단계별 확인사항, 임대차·매매 표준계약서 핵심 조항, 자주 쓰는 특약 예시, 등기부·건축물대장 확인 포인트를 정리한 계약 가이드입니다.",
  alternates: seoAlternates(PATH),
};

/* ── 계약 단계 (가계약 → 계약 → 중도금 → 잔금 → 입주) ──
   keys = 그 단계 설명(desc) 안에 있는 낱말만 — 접힌 상태에서 설명을 대신 보여 준다. */
const STAGES: { name: string; desc: string; keys: string[] }[] = [
  {
    name: "가계약",
    /* [1015 · 규칙 D] 단계 설명 "~예요/~하세요" → 사실 문장. 내용은 그대로 */
    desc: "매물을 잡기 위해 소액을 먼저 거는 단계. 걸기 전에 등기부·실거래·조건을 확인하고, 가계약금 반환 조건(계약 불성립 시)을 문자·계약서로 남긴다.",
    keys: ["소액을 먼저 거는 단계", "등기부·실거래·조건", "가계약금 반환 조건", "문자·계약서로 남긴다"],
  },
  {
    name: "계약 (본계약)",
    desc: "표준계약서를 작성하고 보통 매매대금·보증금의 10% 안팎을 계약금으로 지급한다. 소유자 신분증과 등기부상 소유자 일치를 확인하고 특약을 빠짐없이 적는다.",
    keys: ["표준계약서", "계약금 10% 안팎", "등기부상 소유자 일치", "특약을 빠짐없이"],
  },
  {
    name: "중도금",
    desc: "중도금을 지급하면 이행에 착수한 것으로 보아 일방적 계약 해제가 어려워진다. 자금 계획과 대출 실행 일정을 미리 점검.",
    keys: ["이행에 착수", "일방적 계약 해제가 어려워진다", "대출 실행 일정"],
  },
  {
    name: "잔금",
    desc: "잔금일에 등기부를 다시 열람해 근저당 등 권리변동을 확인하고 소유권 이전 등기를 접수한다. 관리비·공과금 정산도 이때 마무리.",
    keys: ["등기부를 다시 열람", "권리변동", "소유권 이전 등기", "관리비·공과금 정산"],
  },
  {
    name: "입주",
    desc: "임차인은 전입신고와 확정일자를 바로 받아 대항력·우선변제권을 확보한다. 시설·하자를 점검하고 열쇠·설비를 인수.",
    keys: ["전입신고와 확정일자", "대항력·우선변제권", "시설·하자를 점검", "열쇠·설비를 인수"],
  },
];

/* ── 표준계약서 핵심 조항 ── */
type Clause = { term: string; desc: string };
const LEASE_CLAUSES: Clause[] = [
  {
    term: "보증금·차임(월세)",
    desc: "보증금·월 차임 금액과 지급일, 연체 시 처리 방식을 명확히 적습니다.",
  },
  {
    term: "계약 기간·갱신",
    desc: "임대차 기간과 함께 계약갱신요구권·묵시적 갱신 관련 사항을 확인합니다.",
  },
  {
    term: "관리비·수선 의무",
    desc: "관리비 포함 범위와 수리·수선 책임을 임대인·임차인 중 누가 부담하는지 정합니다.",
  },
  {
    term: "특약사항",
    desc: "표준 조항으로 담기 어려운 개별 약속(수리·말소·협조 등)을 명시합니다.",
  },
];
const SALE_CLAUSES: Clause[] = [
  {
    term: "매매대금·지급 일정",
    desc: "계약금·중도금·잔금의 금액과 각 지급일을 구체적으로 정합니다.",
  },
  {
    term: "소유권 이전·인도 시기",
    desc: "잔금과 동시에 소유권 이전 등기·부동산 인도가 이뤄지는 시점을 정합니다.",
  },
  {
    term: "비용 부담·하자담보책임",
    desc: "등기·세금 등 비용 부담 주체와, 인도 후 하자에 대한 책임 범위를 정합니다.",
  },
  {
    term: "위약금·해제",
    desc: "계약 해제 사유와 위약금(계약금 배액·포기 등) 처리를 명확히 합니다.",
  },
];

/* ── 자주 쓰는 특약 예시 ──
   keys = 그 예시 문구(example) 안에 있는 낱말만. 문구는 토씨 하나 바꾸지 않는다. */
const SPECIAL_TERMS: { title: string; example: string; keys: string[] }[] = [
  {
    title: "근저당 말소 조건",
    example:
      "“잔금일까지 등기부상 근저당권 등 선순위 채권을 전액 상환·말소하며, 이행되지 않을 경우 매수인(임차인)은 계약을 해제할 수 있고 손해를 배상한다.”",
    keys: ["잔금일까지", "선순위 채권을 전액 상환·말소", "계약을 해제할 수 있고", "손해를 배상"],
  },
  {
    title: "누수·하자 수리 책임",
    example:
      "“인도일 기준 이미 존재하던 누수·하자는 매도인(임대인)이 책임지고 수리하며, 인도 후 일정 기간 내 발견된 하자에 대해서도 협의하여 처리한다.”",
    keys: ["인도일 기준", "매도인(임대인)이 책임지고 수리", "협의하여 처리"],
  },
  {
    title: "전입신고·확정일자 협조",
    example:
      "“임대인은 임차인의 전입신고·확정일자 및 전세보증금 반환보증 가입에 협조하고, 임대차 기간 중 임차인의 대항력을 해치는 담보 설정을 하지 않는다.”",
    keys: ["전입신고·확정일자", "전세보증금 반환보증 가입에 협조", "대항력을 해치는 담보 설정"],
  },
  {
    title: "미납 관리비·공과금 정산",
    example:
      "“잔금일(인도일) 현재까지 발생한 미납 관리비·공과금은 매도인(임대인)이 부담하고 정산한다.”",
    keys: ["잔금일(인도일) 현재까지", "매도인(임대인)이 부담하고 정산"],
  },
  {
    title: "세금 완납 확인",
    example:
      "“임대인(매도인)은 계약 시 국세·지방세 완납 사실을 증명서로 제시한다.”",
    keys: ["국세·지방세 완납", "증명서로 제시"],
  },
];

/* ── 등기부·건축물대장 확인 포인트 ──
   [1062] "표제부: 부동산의 …" 꼴 글머리는 이미 "항목 | 사실" 두 칸이다 — 쌍점을 표의 칸 경계로 옮겼다(문장 그대로). */
const DOC_CHECKS: {
  title: string;
  lead: string;
  points: { label: string; value: string }[];
}[] = [
  {
    title: "등기부등본 (등기사항전부증명서)",
    lead: "부동산의 소유관계와 권리 상태를 보여주는 서류. 표제부·갑구·을구 세 부분.",
    points: [
      { label: "표제부", value: "부동산의 소재지·면적·구조 등 기본 표시가 계약서와 일치하는지 확인" },
      { label: "갑구", value: "소유자, 가압류·가처분·경매 개시 등 소유권 관련 사항. 소유자와 계약 상대방이 같은지 대조" },
      { label: "을구", value: "근저당권·전세권 등 담보. 선순위 채권 규모가 보증금·매매가에 비해 과도하지 않은지 확인" },
    ],
  },
  {
    title: "건축물대장",
    lead: "건물의 실제 면적·용도·구조와 위법 여부를 확인하는 서류. 등기부만으로는 알기 어려운 정보.",
    points: [
      { label: "위반건축물 표기", value: "불법 증축·용도 변경으로 '위반건축물'로 적혀 있는지 확인" },
      { label: "면적·용도·층수", value: "실제 사용 현황과 광고·계약 내용이 일치하는지 대조" },
      { label: "무허가·미등기 여부", value: "대장에 없는 부분이 있는지 확인" },
    ],
  },
];

export default function ContractGuidePage() {
  /* 항목 46 잔여 — HowTo 구조화 데이터. 화면에 실제 렌더되는 STAGES 배열
     그대로에서 생성한다(스키마 전용 단계 추가 금지 — faqJsonLd 와 같은 규칙). */
  const howTo = howToJsonLd({
    name: "부동산 계약 단계별 확인사항(가계약부터 입주까지)",
    description:
      "가계약·본계약·중도금·잔금·입주 다섯 단계에서 각각 확인할 사항을 정리한 절차 안내입니다. 실제 계약 내용은 중개사무소와 관련 기관에 확인하세요.",
    path: PATH,
    steps: STAGES.map((s) => ({ name: s.name, text: s.desc })),
  });
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "계약 전 체크리스트 & 특약 가이드", url: PATH },
  ]);

  return (
    <PageShell
      breadcrumb="가이드 › 계약 전 체크리스트 & 특약 가이드"
      title="계약 전 체크리스트 & 표준계약·특약 가이드"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, howTo]) }}
      />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 max-md:gap-3">
        {/* [1015 · 규칙 B] 머리의 "일반적인 확인 포인트예요 … 확인하세요" 안내 블록 삭제 — 맨 끝 고지 한 줄이 같은 말을 한다 */}

        {/* [1008 · J] 계산하는 도구로 가는 입구 한 줄 — 계약일·잔금일을 넣으면 날짜가 붙은 할 일 목록이 된다 */}
        <Link
          href="/journey/contract"
          className="tile flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 no-underline"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon name="calendar" size={18} />
            </span>
            <span className="min-w-0">
              <span className="block t-body font-bold text-ink">계약·잔금 일정표</span>
              <span className="block t-sub text-text-2">계약일·잔금일 입력 → 거래신고·취득세·등기·전입신고 기한 날짜순</span>
            </span>
          </span>
          <span aria-hidden="true" className="tile-go shrink-0 t-body font-bold text-primary">
            ›
          </span>
        </Link>

        {/* 1. 계약 단계별 확인사항 — 접힌 행(단계 이름 + 낱말 칩), 설명은 눌러야 펼쳐진다.
            절차 순서는 HowTo JSON-LD(위 howTo)와 번호 접두가 함께 지킨다. */}
        <FaqCompact
          className="rise-in"
          title="계약 단계별 확인사항"
          jsonLd={false}
          items={STAGES.map((s, i) => ({
            q: `${i + 1}. ${s.name}`,
            a: s.desc,
            keys: s.keys,
          }))}
        />

        {/* 2. 표준계약서 핵심 조항 — 왼쪽 선 + 문단 8개 → "조항 | 적을 내용" 두 칸 표 두 장 */}
        <section className="rise-in-1 card rounded-2xl p-5 max-md:p-3.5 md:p-6">
          <h2 className="t-section font-bold text-ink">표준계약서 핵심 조항</h2>
          <p className="measure mt-2 t-sub leading-[1.7] text-text-2">
            국토교통부 표준임대차·표준매매 계약서 기준. 당사자 인적사항과 목적물 표시(등기부와 일치)를 먼저 확인한 뒤 아래
            핵심 조항 점검.
          </p>
          <div className="mt-4 grid gap-5 max-md:mt-3 max-md:gap-4 sm:grid-cols-2">
            <div>
              <h3 className="t-body font-bold text-ink">임대차 계약</h3>
              <FactTable
                dense
                className="mt-1.5"
                rows={LEASE_CLAUSES.map((c) => ({ label: c.term, value: c.desc }))}
              />
            </div>
            <div>
              <h3 className="t-body font-bold text-ink">매매 계약</h3>
              <FactTable
                dense
                className="mt-1.5"
                rows={SALE_CLAUSES.map((c) => ({ label: c.term, value: c.desc }))}
              />
            </div>
          </div>
        </section>

        {/* 3. 자주 쓰는 특약 예시 — 긴 인용문은 접기 뒤, 접힌 줄에는 그 문구의 낱말만 */}
        <section className="rise-in-2">
          <h2 className="t-section font-bold text-ink">자주 쓰는 특약 예시</h2>
          <p className="measure mt-2 t-sub leading-[1.7] text-text-2">
            특약은 표준 조항으로 담기 어려운 개별 약속을 적는 부분. 아래는 참고용 예시 표현이며 실제 문구는 상황에 맞게 조정.
          </p>
          <FaqCompact
            className="mt-3"
            title="예시 문구"
            headingLevel={3}
            jsonLd={false}
            items={SPECIAL_TERMS.map((t) => ({ q: t.title, a: t.example, keys: t.keys }))}
          />
        </section>

        {/* 4. 등기부·건축물대장 확인 포인트 — 글머리 "표제부: …" 를 표의 두 칸으로 */}
        <section className="rise-in-3 card rounded-2xl p-5 max-md:p-3.5 md:p-6">
          <h2 className="t-section font-bold text-ink">등기부·건축물대장 확인 포인트</h2>
          <div className="mt-3 flex flex-col gap-4 max-md:gap-3">
            {DOC_CHECKS.map((d) => (
              <div key={d.title}>
                <h3 className="t-body font-bold text-ink">{d.title}</h3>
                <p className="measure mt-1 t-sub leading-[1.7] text-text-2">{d.lead}</p>
                <FactTable dense className="mt-2" rows={d.points} />
              </div>
            ))}
          </div>
          {/* [1015 · 규칙 C·D] 파란 색면 안내 → 흰 면 위 사실 한 줄. [1062] 발급처·재열람도 표의 두 칸으로 */}
          <FactTable
            dense
            className="mt-4 border-t border-line pt-3 max-md:mt-3"
            rows={[
              { label: "등기부등본", value: "인터넷등기소(iros.go.kr)" },
              { label: "건축물대장", value: "정부24(gov.kr)" },
              {
                label: "재열람",
                value: (
                  <>
                    계약~잔금 사이 권리가 바뀔 수 있어 <b>잔금 직전 재열람</b> 권장.
                  </>
                ),
              },
            ]}
          />
        </section>

        {/* 관련 가이드 */}
        <Link
          href="/guides/regulations"
          className="tile flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="t-body font-bold text-ink">
              부동산 규제·의무 안내
            </div>
            <div className="mt-0.5 t-sub text-text-2">규제지역·대출·세금·청약 제도의 개념</div>
          </div>
          <span className="shrink-0 rounded-lg bg-primary-soft px-3.5 py-2 t-sub font-bold text-primary">
            가이드 보기 ›
          </span>
        </Link>

        {/* 공통 면책 */}
        <p className="px-1 pb-2 t-sub leading-[1.7] text-text-3">
          본 안내는 일반 정보이며 법률·세무 자문이 아닙니다. 실제 거래·신고·세금은
          중개사무소·세무 전문가와 관련 기관 확인이 필요합니다.
        </p>
      </div>
    </PageShell>
  );
}
