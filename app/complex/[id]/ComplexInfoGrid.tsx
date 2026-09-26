/* [1009 · C] 단지 정보 — 네이버 부동산 단지 화면의 "단지 정보" 격자(라벨 위 · 값 아래, 칸 단위).

   왜: 예전 "단지 스펙"은 라벨·값을 한 줄에 좌우로 늘어놓은 목록(text-xs)이라 값이 오른쪽 끝에 붙어 흩어졌고,
   데이터가 아닌 상수("유형 아파트" — 실거래 적재가 아파트만 받아서 모든 단지가 같은 값)까지 한 칸을 차지했다.
   지금은 **데이터에 실제로 있는 항목만** 칸으로 만든다(없는 칸은 만들지 않는다 — "—" 나열 금지). 빠진 항목과 이유는
   바로 아래 "자료 완성도"(ComplexFactsCard)가 말한다. 숫자는 tabular-nums. 서버 조각 — JS 없음. */

import { complexInfoCells, type ComplexInfoFacts } from "@/lib/complex/info-cells";

export type { ComplexInfoFacts } from "@/lib/complex/info-cells";

export function ComplexInfoGrid({ facts, nowYear }: { facts: ComplexInfoFacts; nowYear: number }) {
  const cells = complexInfoCells(facts, nowYear);
  const addr = facts.roadAddress?.trim() || facts.address?.trim() || null;
  const jibun = facts.roadAddress?.trim() && facts.address?.trim() ? facts.address.trim() : null;
  if (cells.length === 0 && !addr) return null;
  return (
    <section aria-labelledby="complex-info-title" className="rise-in-1 card mt-3 rounded-2xl px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="complex-info-title" className="t-body font-extrabold text-ink">
          단지 정보
        </h2>
        <span className="t-caption text-text-3">{cells.length > 0 ? `${cells.length}개 항목` : "주소만 확인"}</span>
      </div>
      {cells.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {cells.map((c) => (
            <div key={c.label} className={`min-w-0 ${c.wide ? "col-span-2 sm:col-span-1 lg:col-span-2" : ""}`}>
              <dt className="t-caption text-text-3">{c.label}</dt>
              <dd className="mt-0.5 break-words t-body font-bold text-ink tabular-nums">
                {c.value}
                {c.sub && <span className="ml-1 t-sub font-medium text-text-3">{c.sub}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {addr && (
        <div className="mt-3 border-t border-divider pt-2.5">
          <div className="t-caption text-text-3">주소</div>
          <p className="mt-0.5 break-words t-body text-ink">{addr}</p>
          {jibun && jibun !== addr && <p className="break-words t-sub text-text-3">{jibun}</p>}
        </div>
      )}
      <p className="mt-2 t-caption text-text-3">
        출처 · 공동주택 단지 정보(K-apt)·국토교통부 실거래 신고{facts.kaptCode ? ` · 단지코드 ${facts.kaptCode}` : ""}
      </p>
    </section>
  );
}

export default ComplexInfoGrid;
