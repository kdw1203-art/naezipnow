/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { loadUpcomingSupply, withSectionBudget } from "./section-loaders";
import { currentYm } from "@/lib/format/ym";
import { supplyPlaceLabel } from "@/lib/supply/place-label";

/* [948→949] 지역 키 6시간 데이터 캐시 + 요청 내 프리페치 dedupe — 둘 다
   section-loaders.ts 에 있다(실패는 던져서 캐시에 남지 않는다; 아래 .catch 가
   이번 렌더만 섹션을 생략한다). */

/* D4 — 향후 공급(입주물량) 섹션. 단지 소재 지역 인근 apartment_supply(실데이터) 중
   아직 도래하지 않았거나 최근의 입주 예정 물량. 없으면 렌더 생략(사실 우선). */

/** "202608" → "2026.08" */
function fmtYm(ym: string): string {
  const s = ym.trim();
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

/* [1055] 현재 달은 한국 달(lib/format/ym) — 서버(UTC) 달이면 매월 1일 00~09시(KST)에 지난달 입주가 "향후"로 분류되고 ISR 7일에 남았다 */

export async function UpcomingSupply({
  area,
  city = "",
}: {
  area: string;
  /** [970 · B-02] 시/도 — "중구"만으로는 여섯 도시의 입주물량이 섞인다(page.tsx v.city) */
  city?: string | null;
}) {
  const name = area.trim();
  if (!name) return null;
  const sido = (city ?? "").trim();

  // [968 · 1] 공유 예산 3초 — 넘기면 이번 렌더만 접는다
  const items = await withSectionBudget(loadUpcomingSupply(name, sido)).catch(() => []);
  if (items.length === 0) return null;

  // 향후(현재월 이상) 우선, 부족하면 최근 물량으로 채움
  const nowYm = currentYm();
  const upcoming = items.filter((i) => i.moveInYm && i.moveInYm >= nowYm);
  const shown = (upcoming.length > 0 ? upcoming : items).slice(0, 6);
  if (shown.length === 0) return null;

  const totalHouseholds = shown.reduce((s, i) => s + (i.households ?? 0), 0);

  return (
    /* [968 · 7] cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미룬다(page.tsx 주석 참고) */
    <section className="cv-auto rise-in-5 mt-6 max-md:mt-3">
      <h2 className="mb-2 px-1 t-section text-ink">
        인근 입주물량{" "}
        <span className="t-sub font-medium text-text-3">
          {name}
          {totalHouseholds > 0 ? ` · 약 ${totalHouseholds.toLocaleString("ko-KR")}세대` : ""}
        </span>
      </h2>
      {/* [1107] 목록 → 표(단지 · 위치 · 입주 · 세대). 주소 전체("경기도 안양시 동안구 관양동 521번지 일원 (… 도시개발사업 내 A1BL)")는
          머리의 지역과 겹치는 반복이라 동 하나로(lib/supply/place-label) · 공급 유형은 "분양"이 아닐 때만 이름 옆에.
          [1015 · 규칙 I] sand 리퀴드 판은 그대로. */}
      <div className="lq-panel overflow-x-auto" data-tone="sand">
        <table className="w-full t-sub">
          <thead>
            <tr className="text-left t-caption text-text-3">
              <th scope="col" className="py-1.5 font-medium">단지</th>
              <th scope="col" className="py-1.5 font-medium">위치</th>
              <th scope="col" className="py-1.5 text-right font-medium">입주</th>
              <th scope="col" className="py-1.5 text-right font-medium">세대</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i, idx) => (
              <tr key={`${i.moveInYm}-${i.aptName}-${idx}`} className="border-t border-divider">
                <th scope="row" className="break-keep py-2 pr-2 text-left t-body font-bold text-ink">
                  {i.aptName || "공급 예정 단지"}
                  {i.bizType && i.bizType !== "분양" ? <span className="ml-1 t-caption font-medium text-text-3">{i.bizType}</span> : null}
                </th>
                <td className="whitespace-nowrap py-2 pr-2 text-text-2">{supplyPlaceLabel(i.address) || i.region || "—"}</td>
                <td className="whitespace-nowrap py-2 text-right t-num font-bold text-ink">{fmtYm(i.moveInYm)}</td>
                <td className="whitespace-nowrap py-2 pl-2 text-right t-num text-text-2">
                  {i.households != null ? i.households.toLocaleString("ko-KR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* [1015 · 규칙 B·D] 설명 문장("영향을 줄 수 있어요")은 걷고 출처·주의만 */}
      <p className="mt-1.5 px-1 t-caption text-text-3">공공 공급 데이터 기준 · 일정은 변동될 수 있음</p>
    </section>
  );
}
