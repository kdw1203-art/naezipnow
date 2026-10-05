/* [1026b · 노트 쓰기] 방문 목적 · 시간대 · 날씨 · 만족도(입력했을 때) 한 줄 + 태그 최대 3(+N) 한 줄 — 입력한 값만(facts, 폼 상태 그대로). */
/* [1026 · 노트 쓰기] 노트 카드 미리보기 — 폼 상태 그대로(단지명 · 지역 · 방문일 · 유형 · 사진 썸네일 최대 3 · 판단 배지).
   데스크톱 레일(NotePreviewRail)과 폰 3단계 "미리보기" 접힘(NoteFinishStep)이 같은 카드를 쓴다 — 둘 다 지연 조각이라
   /notes/new 첫 로드에는 실리지 않는다. 사진이 없으면 회색 견본 칸 3개(빈 상태 = 그림 윤곽), 단지를 안 골랐으면 "단지 미선택".
   새 데이터·새 계산 없음. 판단 칩 색은 lib/notes/note-preview 의 세 가지(좋음·보통·주의)뿐. */
import { decisionLabel, type DecisionChoice } from "@/lib/inspection/decision";
import { decisionTone, type PreviewTone } from "@/lib/notes/note-preview";
import { tagsLine, visitFactParts, type VisitFacts } from "@/lib/notes/finish-summary";
import { unitSummary } from "@/lib/notes/unit-core";

export const TONE_CHIP: Record<PreviewTone, string> = {
  good: "bg-success-soft text-success",
  normal: "bg-primary-soft text-primary",
  caution: "bg-warning-soft text-warning",
};

export type NotePreviewCardProps = {
  aptName: string;
  region: string;
  visitDate: string;
  /** 방문 정보의 유형(아파트·빌라·오피스텔) */
  propertyType: string;
  photos: readonly string[];
  decision: DecisionChoice | null;
  isPublic: boolean;
  /** [1026b] 목적 · 시간대 · 날씨 · 만족도 · 태그 — 생략하면 예전 카드 그대로 */
  facts?: VisitFacts;
};

export function NotePreviewCard(p: NotePreviewCardProps) {
  const thumbs = p.photos.slice(0, 3);
  const apt = p.aptName.trim();
  const meta = [p.region.trim(), p.visitDate.trim(), p.propertyType.trim()].filter(Boolean).join(" · ");
  const visitLine = p.facts ? visitFactParts(p.facts).join(" · ") : "";
  const tagLine = p.facts ? tagsLine(p.facts.tags) : "";
  const unitLine = p.facts?.unit ? unitSummary(p.facts.unit) : null;
  return (
    <article aria-label="노트 카드 미리보기" className="rounded-xl border border-line bg-surface p-3">
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) =>
          thumbs[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={thumbs[i]}
              src={thumbs[i]}
              alt=""
              loading="lazy"
              className="aspect-[4/3] w-full rounded-lg bg-divider object-cover"
            />
          ) : (
            <span key={`ghost-${i}`} aria-hidden="true" className={`block w-full rounded-lg bg-divider ${thumbs.length ? "aspect-[4/3]" : "h-10"}`} />
          ),
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate t-body font-bold ${apt ? "text-ink" : "text-text-3"}`}>{apt || "단지 미선택"}</div>
          {meta && <div className="truncate t-caption text-text-3">{meta}</div>}
          {/* [1033] 임장한 타입 — 단지 아래 한 줄(목록 카드와 같은 자리) */}
          {unitLine && <div className="truncate t-caption t-num text-text-2">{unitLine}</div>}
        </div>
        {p.decision && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 t-caption font-bold ${TONE_CHIP[decisionTone(p.decision)]}`}>
            {decisionLabel(p.decision)}
          </span>
        )}
      </div>
      {visitLine && <div className="mt-1 truncate t-caption text-text-2">{visitLine}</div>}
      {tagLine && <div className="mt-0.5 truncate t-caption text-text-2">{tagLine}</div>}
      <div className="mt-1 t-caption text-text-3">
        {p.isPublic ? "공개" : "비공개"} · 사진 {p.photos.length}장
      </div>
    </article>
  );
}
