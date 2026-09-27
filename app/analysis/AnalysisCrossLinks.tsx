/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";

/* 분석 도구 간 이어가기(#411) — 각 도구 상세 하단에서 "지금 보던 컨텍스트
 * 그대로" 다음 도구로 넘어가는 스트립.
 *
 * 도구들은 서로의 존재를 몰랐다: 타이밍에서 강남 추세를 보다가 면적대별로
 * 가려면 허브로 나가 지역을 다시 골라야 했다. region 을 알고 있는 화면은
 * 쿼리로 실어 보낸다 — 받는 쪽(price·timing 은 ?region=, scenario 는
 * ?region= 프리필, map 은 ?region= 포커스)이 이미 읽는 파라미터만 쓴다.
 * region 을 모르면(비교·온도 등) 파라미터 없이 보낸다.
 */

const DESTS = [
  { id: "price", href: "/analysis/price", label: "면적대별 실거래 시세" },
  { id: "timing", href: "/analysis/timing", label: "시세·타이밍 분석" },
  { id: "scenario", href: "/analysis/scenario", label: "시장·대출 시나리오" },
  { id: "temperature", href: "/analysis/temperature", label: "지역별 시장 온도" },
  { id: "compare", href: "/analysis/compare", label: "후보 단지 비교" },
  { id: "map", href: "/map", label: "지도에서 보기" },
] as const;

export type AnalysisToolId = (typeof DESTS)[number]["id"];

/* 지역 어휘가 도구마다 다르다는 사실을 API 가 그대로 드러낸다:
   price 는 slug, timing·scenario 는 지역 id(gangnam…), map 은 한글 지역명.
   보내는 쪽은 자기가 **정확히 아는 값만** 채운다 — 잘못된 어휘로 보내면
   받는 쪽이 400/빈 화면이 되므로(타이밍 실측), 모르는 칸은 비워 파라미터
   없이 보낸다. */
export function AnalysisCrossLinks({
  current,
  regionFor,
  regionLabel,
  note,
  className,
}: {
  /** 지금 화면인 도구 — 목록에서 뺀다 */
  current: AnalysisToolId;
  /** 목적지별 region 파라미터 값 (그 도구의 어휘로) — 아는 것만 채운다 */
  regionFor?: Partial<Record<"price" | "timing" | "scenario" | "map", string>>;
  /** 캡션용 지역 표기(예: "강남구") — 없으면 캡션에 지역을 안 쓴다 */
  regionLabel?: string | null;
  /** 강조 행동 1개(예: 이 지역 노트 쓰기·알림 설정) — 첫 칩으로 프라이머리 스타일 */
  note?: { href: string; label: string };
  className?: string;
}) {
  const label = regionLabel?.trim() || null;
  /* [v4 · 규칙 5·2] 칩 구름(채움 파랑 칩 1 + 회색 칩 5, 여러 줄로 엇갈려 감김) → 구분선 목록 행(승인 시안 SummaryRow).
     강조 행동(note)은 첫 행 — 채움 파랑은 쓰지 않는다(화면의 채움 파랑은 각 도구의 주 행동 하나). */
  return (
    <nav aria-label="이어서 분석" className={`flex flex-col gap-2 ${className ?? ""}`}>
      <h2 className="flex items-baseline gap-1.5 t-section text-ink">
        이어서 분석
        {label && <span className="t-sub font-medium text-text-3">{label} 그대로</span>}
      </h2>
      <ul data-tone="hanji" className="card flex flex-col divide-y divide-line rounded-lg px-4">
        {note && <SummaryRow label={<span className="text-primary">{note.label}</span>} href={note.href} />}
        {DESTS.filter((d) => d.id !== current).map((d) => {
          const v =
            d.id === "temperature" || d.id === "compare"
              ? undefined
              : regionFor?.[d.id];
          const href = v ? `${d.href}?region=${encodeURIComponent(v)}` : d.href;
          return <SummaryRow key={d.id} label={d.label} href={href} />;
        })}
      </ul>
    </nav>
  );
}
