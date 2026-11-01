"use client";

/* [1096 · 비용] 비교 허브(/complex/compare)의 조합 타일(1,119개) — 서버는 압축 행만 넘기고 타일은 여기서 그린다.
   왜: 서버 컴포넌트로 그린 타일은 HTML 과 RSC 양쪽에 원소 트리로 실려 허브 한 장이 1,842KB(마크업 696KB · RSC 1,010KB)였다 —
   타일마다 주소(퍼센트 인코딩 162B)가 key · href · HTML 세 번, 이름이 네 번 실렸다(로컬 실측 2026-10-31). 이 허브는 적재 크론이
   끝날 때마다 비워져(revalidatePath) 하루 한 번 다시 저장된다 — 사이트에서 가장 큰 ISR 쓰기였다.
   클라이언트 조각은 RSC 에 props(조합당 80B 안팎)만 싣고 주소는 이름·지역에서 만든다(buildComplexPairSlug · 비교 화면과 같은 규칙).
   첫 화면 HTML(SSR) · 링크 · 색인은 그대로(TxRegionGroups · DongComplexTable 과 같은 방식). 지역 칩 · details · 지역 화면 링크는
   서버(page.tsx)에 그대로 — 63개뿐이라 작다. */
import Link from "@/app/components/IntentLink";
import { buildComplexPairSlug } from "@/lib/market/complex-pair-slug";

/** [단지 A, 단지 B, 동, A 12개월 건수, B 12개월 건수] */
export type ComparePairWire = [string, string, string, number, number];

const n = (v: number) => v.toLocaleString("ko-KR");

export function ComparePairTiles({ regionId, pairs }: { regionId: string; pairs: ComparePairWire[] }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {pairs.map(([a, b, dong, txA, txB]) => {
        const slug = buildComplexPairSlug(a, b, regionId);
        return (
          <Link key={slug} href={`/complex/compare/${slug}`} className="tile rounded-lg border border-border px-3 py-2.5">
            {/* [1005] body 는 keep-all — 띄어쓰기 없는 긴 단지명(예: 17자)은 못 꺾여 390px 에서 화면을 35px 밀어냈다. 넘칠 때만 꺾는다(overflow-wrap). */}
            <span className="block break-words t-body font-bold text-ink">
              {a}
              <span className="mx-1 t-sub font-medium text-text-3">vs</span>
              {b}
            </span>
            <span className="mt-0.5 block t-sub text-text-3">
              {dong} · 12개월 {n(txA)}건 vs {n(txB)}건
            </span>
          </Link>
        );
      })}
    </div>
  );
}
