/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { loadUpcomingSupply, withSectionBudget } from "./section-loaders";
import { supplyRows, ymDotLabel } from "@/lib/complex/hub-summary";

/* [948→949] 지역 키 7일 데이터 캐시 + 요청 내 프리페치 dedupe — 둘 다
   section-loaders.ts 에 있다(실패는 던져서 캐시에 남지 않는다; 아래 .catch 가
   이번 렌더만 섹션을 생략한다).

   D4 — 향후 공급(입주물량) 섹션. 단지 소재 지역 인근 apartment_supply(실데이터) 중
   아직 도래하지 않았거나 최근의 입주 예정 물량. 없으면 렌더 생략(사실 우선).

   [v4 · 규칙 5] 카드 안 목록 → 1px 구분선 행(최대 4행) · 제목 옆 요약 숫자·"시세·전세에 영향을 줄 수 있어요" 설명
   문장을 걷고 출처 한 줄만. 이번 달(KST 아님 — 서버 달, 예전과 같음) 이후가 없으면 최근 물량으로 채우고 제목도
   "최근 입주물량"으로 바꾼다(지난 물량을 "예정"이라 부르지 않는다). 요약 목록 "인근 입주 예정" 행이 여기로 내려온다. */

/** 현재 달(YYYYMM) 이상만 향후 공급으로 간주. */
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

  const { rows, upcoming } = supplyRows(items, currentYm());
  if (rows.length === 0) return null;

  return (
    <section id="upcoming-supply" aria-labelledby="upcoming-supply-title" className="scroll-mt-28">
      <h2 id="upcoming-supply-title" className="t-section text-ink">
        {upcoming ? "인근 입주 예정" : "인근 최근 입주"} <span className="t-sub font-medium text-text-3">{name}</span>
      </h2>
      <ul data-tone="sand" className="mt-1 divide-y divide-line">
        {rows.map((i, idx) => (
          <li key={`${i.moveInYm}-${i.aptName}-${idx}`} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate t-body font-bold text-ink">{i.aptName || "공급 예정 단지"}</div>
              <div className="truncate t-sub text-text-3">
                {[i.address || i.region, i.bizType].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="t-body t-num text-ink">{ymDotLabel(i.moveInYm)}</div>
              {i.households != null && (
                <div className="t-sub text-text-3 tabular-nums">{i.households.toLocaleString("ko-KR")}세대</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1 t-caption text-text-3">출처 청약홈 분양 공고·공공 공급 자료 · 입주 월은 바뀔 수 있음</p>
    </section>
  );
}
