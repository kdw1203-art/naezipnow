/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 5곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 가이드 허브 — 카탈로그 10편 + 기존 2편(계약·규제). */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "부동산 실전 가이드 — 임장·시세·전세·청약 | 내집나우",
  description:
    "임장 체크리스트, 전세가율 보는 법, 실거래가 해석, 전세 안전 점검, 청약 일정까지 — 검색할 필요 없이 순서대로 따라 하는 실전 가이드 모음.",
  alternates: seoAlternates("/guides"),
};

const CATEGORY_ORDER = ["임장", "시세 읽기", "전세", "청약·분양", "경매·공매"] as const;
/* [v4.1 · 리퀴드 목록] 분류 묶음 톤 순환(globals.css `data-tone`) — 글 = hanji 부터 */
const CATEGORY_TONES = ["hanji", "blue", "mint", "sand"] as const;

export default function GuidesIndexPage() {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: GUIDES.filter((g) => g.category === cat),
  })).filter((x) => x.items.length > 0);

  const sections = [...byCategory, { cat: "계약·규제", items: LEGACY_GUIDES }];

  return (
    <PageShell breadcrumb="가이드">
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 분류별 구분선 행(제목 굵게 + 설명 한 줄 / ›).
          지운 것: 소개 문장(→ 사실 줄), 편마다의 테두리 카드(→ 행). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">부동산 실전 가이드</h1>
          {/* [1012] 규칙 6·7 — 슬로건 대신 실제 편수(카탈로그) */}
          <p className="t-sub text-text-3">
            {GUIDES.length + LEGACY_GUIDES.length}편 · 분류 {sections.length}개 · 끝에서 지도·계산기·임장노트로 연결
          </p>
        </header>

        {sections.map(({ cat, items }, si) => (
          <section key={cat} className="flex flex-col gap-2">
            <h2 className="flex items-baseline gap-1.5 t-section text-ink">
              {cat} <span className="t-num text-text-3">{items.length}</span>
            </h2>
            {/* [v4.1 · 리퀴드 목록] 분류마다 톤 순환(글 = hanji 부터) — 이웃한 분류가 같은 색을 갖지 않는다 */}
            <ul data-tone={CATEGORY_TONES[si % CATEGORY_TONES.length]} className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {items.map((g) => (
                <SummaryRow key={g.slug} label={g.title} sub={g.description} href={`/guides/${g.slug}`} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
