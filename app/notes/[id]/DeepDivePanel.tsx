/**
 * 노트 상세의 **AI 심화 분석 8축** 블록 (서버 컴포넌트).
 *
 * 축의 숫자·문장은 전부 `lib/inspection/deep-dive.ts` 가 조회한 데이터로
 * 미리 만들어 저장해 둔 것이고, 여기서는 저장된 것을 그리기만 한다. 화면을
 * 여는 시점에 LLM 을 부르지 않는다 — 볼 때마다 결과가 달라지면 그건 더 이상
 * "이 노트의 분석"이 아니다.
 *
 * 못 채운 축을 감추지 않는다. 확인하지 못한 축은 접힌 상태로라도 남겨 두고
 * "왜 못 봤는지"를 그대로 적는다. 감추면 읽는 사람에게는 그런 축이 애초에
 * 없었던 것처럼 보이고, 그건 조회 실패를 "해당 없음"으로 바꿔 말하는 것과
 * 같다.
 */
import type { StoredDeepDiveSection } from "@/lib/inspection/deep-dive-view";
import { filledStoredAxisCount, readStoredDeepDive } from "@/lib/inspection/deep-dive-view";

/* [v4 · 규칙 5·6] 카드 → 구분선 목록 행(접힘). 축마다 돌려 쓰던 색 배지(eyebrow)·"해석" 파란 상자·사실 칩을 걷고
   글자 위계로만 가른다 — 행 = 축 이름(굵게) / 오른쪽 확인 상태 · `›`. 펼치면 헤드라인 · 해석 · 사실 한 줄 · 근거 · 출처. */
function AxisBlock({
  open,
  section,
}: {
  open: boolean;
  section: StoredDeepDiveSection;
}) {
  const unavailable = section.status === "unavailable";

  /* 행 바깥을 <li> 로 감싸지 않는다 — 폰 배율의 "li 안 t-sub 한 줄" 규칙(globals.css)이 펼친 본문의 사실·출처 줄까지 자른다 */
  return (
    <details open={open && !unavailable} className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 t-body font-bold text-ink">{section.label}</span>
        <span className={`shrink-0 t-sub ${unavailable ? "text-text-3" : "text-text-2"}`}>
          {unavailable ? "확인하지 못함" : section.status === "partial" ? "일부 확인" : "확인"}
        </span>
        <span aria-hidden="true" className="shrink-0 t-body text-text-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="flex flex-col gap-1.5 pb-3">
        {section.headline && <p className="t-body font-bold text-text-1">{section.headline}</p>}
        {section.insight && (
          <p className="t-body text-text-1">
            <b className="mr-1 font-bold text-text-3">해석</b>
            {section.insight}
          </p>
        )}
        {section.facts.length > 0 && (
          <p className="t-sub text-text-2">
            {section.facts.map((fact, i) => (
              <span key={`${fact.label}-${fact.value}`}>
                {i > 0 ? " · " : ""}
                <b className="font-bold text-text-1">{fact.label}</b> {fact.value}
              </span>
            ))}
          </p>
        )}
        {section.bullets.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-1.5 t-body text-text-1">
                <span aria-hidden="true" className="shrink-0 text-text-3">
                  ·
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
        {/* 못 채운 사유 — 비어 있는 축을 "해당 없음"으로 바꿔 적지 않는다. */}
        {section.note && <p className="t-sub text-text-3">{section.note}</p>}
        {section.sources.length > 0 && (
          <p className="t-caption text-text-3">출처 · {section.sources.join(" · ")}</p>
        )}
      </div>
    </details>
  );
}

export default function DeepDivePanel({
  analysis,
}: {
  analysis: Record<string, unknown> | null;
}) {
  const deepDive = readStoredDeepDive(analysis);
  if (!deepDive) return null;

  const filled = filledStoredAxisCount(deepDive);
  const total = deepDive.sections.length;

  return (
    <section aria-labelledby="deep-dive-h" className="flex flex-col gap-1">
      {/* [v4 · 규칙 3] "노트에 적힌 내용과 공개 데이터를 함께 읽어 N개 축으로 정리했어요" 설명 문장 → 숫자만 */}
      <h2 id="deep-dive-h" className="t-section text-ink">
        AI 심화 분석{" "}
        <span className="t-sub font-medium text-text-3">
          {filled}/{total}개 축 확인
        </span>
      </h2>

      <div data-tone="blue" className="divide-y divide-line border-y border-line">
        {deepDive.sections.map((section, i) => (
          <AxisBlock key={section.id} open={i < 2} section={section} />
        ))}
      </div>

      {/* 못 읽은 소스 — 어떤 축이 왜 비었는지 한 줄로 모아 둔다. */}
      {deepDive.gaps.length > 0 && (
        <p className="mt-1 t-caption text-text-3">
          <b className="font-bold text-text-2">확인하지 못한 자료</b> · {deepDive.gaps.join(" · ")}
        </p>
      )}

      {deepDive.disclaimer && <p className="t-caption text-text-3">{deepDive.disclaimer}</p>}
    </section>
  );
}
