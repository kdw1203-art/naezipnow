/* [1050 · 펼침] AI 분석 허브 — 도구를 펼치면 보이는 내용(서버 조각 · 클라이언트 JS 0).
   소유자 지시(2026-10-09): "ai분석에서도 해당 기능을 누르면 펼쳐지기가 되어서 기능의 내용이 보이고 한 번 더 누르면 기능을 사용할 수 있도록".
   판(hub-tiers, "use client")은 펼치기/접기와 "열기"만 하고, 이 내용 마크업은 서버가 그려 넘긴다 — 클라이언트에서 그렸더니
   /analysis First Load 가 492KB 로 예산(490KB)을 넘었다(예산은 올리지 않는다).
   fromTable: 표 줄은 데스크톱에서 "하는 일"(md)·"결과"(lg)를 이미 보여 주므로 그 폭에서는 다시 적지 않는다.
   [1052] 시장 신호 요인 줄 옆 "계산 방법 ›" — 다요인 분석(규칙 계산)의 공식 칸(/methodology#signals)으로.
   보이는 줄 높이는 그대로(음수 마진) · 눌리는 범위만 폰 40px · 데스크톱 24px. */
import Link from "next/link";
import type { WorkbenchCardDto } from "./workbench-cards";

export function ToolDetailBody({
  c,
  steps,
  signalLabels,
  fromTable,
}: {
  c: WorkbenchCardDto;
  steps: readonly string[];
  signalLabels: readonly string[];
  fromTable: boolean;
}) {
  return (
    /* [1068 · 꼴 맞추기] 소유자(2026-10-13) "분석 순서 등이 너무 디자인적으로 별로야".
       캡처에서 보이던 것: ① 순서는 맨 글자에 작은 동그라미 번호만 붙어 큰 간격으로 흩어져 있고,
       바로 아래 신호는 테두리 칩이라 **같은 칸 안에서 두 가지 꼴**이 부딪혔다. ② 라벨 칸이 auto 라
       줄마다 내용 시작 자리가 조금씩 달랐다. ③ 순서인지 그냥 나열인지 모양만으로는 알 수 없었다.
       고친 것: 라벨 칸을 한 폭으로 고정(내용이 늘 같은 x 에서 시작) · 순서도 칩으로 통일하되
       번호를 칩 **안**에 두어 차례임을 유지 · 칩 사이에 작은 › 를 두지 않는다(글자 아닌 기호를 늘리지 않는다). */
    <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 t-sub max-md:grid-cols-[60px_minmax(0,1fr)]">
      <dt className={`text-text-3 ${fromTable ? "md:hidden" : ""}`}>하는 일</dt>
      <dd className={`m-0 text-text-1 ${fromTable ? "md:hidden" : ""}`}>{c.premise}</dd>
      {c.result && (
        <>
          <dt className={`text-text-3 ${fromTable ? "lg:hidden" : ""}`}>결과</dt>
          <dd className={`m-0 font-bold text-ink ${fromTable ? "lg:hidden" : ""}`}>{c.result}</dd>
        </>
      )}
      <dt className="pt-1 text-text-3">분석 순서</dt>
      <dd className="m-0">
        <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
          {steps.map((st, i) => (
            <li
              key={`${i}-${st}`}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1.5 pr-2.5 text-text-1"
            >
              <span className="tool-soft-bg tool-ink inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full t-caption font-bold tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">{st}</span>
            </li>
          ))}
        </ol>
      </dd>
      {signalLabels.length > 0 && (
        <>
          <dt className="pt-1 text-text-3">시장 신호</dt>
          {/* [1067 · 낱말로] 여덟 가지를 가운뎃점으로 이어 붙인 한 줄 끝에 링크까지 달려 있었다 — 어디까지가 신호
              이름이고 어디부터가 링크인지 읽어야 알 수 있었다(소유자 캡처 2026-10-13). 낱말은 칩으로 끊어 놓고,
              모수("고른 실행에 N가지")와 링크는 그 아래 한 줄로 내린다. 사실·개수·문구는 그대로. */}
          {/* [1070 · 줄 줄이기] 칩 줄 아래에 모수 한 줄 + 링크가 따로 서 있어 칸이 세 줄이었다(소유자 2026-10-16
              "분석 순서·계산 방법·접기 디자인을 보기 편하고 심플하게"). 모수와 링크를 **칩 줄 끝에** 이어 붙여
              한 줄로 접는다 — 사실("고른 실행에 N가지")도 링크도 그대로다. 좁아지면 자연스럽게 다음 줄로 넘어간다. */}
          <dd className="m-0">
            <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0" aria-label="시장 신호">
              {signalLabels.map((s) => (
                /* 순서 칩과 같은 꼴 — 펼친 칸 바탕이 회색(bg-bg)이라 칩은 흰 바탕이어야 칩으로 읽힌다 */
                <li key={s} className="rounded-full border border-line bg-surface px-2.5 py-1 t-caption font-medium text-text-2">
                  {s}
                </li>
              ))}
              <li className="ml-1 t-caption text-text-3">고른 실행에 {signalLabels.length}가지</li>
              <li>
                <Link
                  href="/methodology#signals"
                  className="-my-2.5 inline-flex min-h-[40px] items-center t-caption font-semibold text-primary no-underline md:-my-0.5 md:min-h-6"
                >
                  계산 방법 ›
                </Link>
              </li>
            </ul>
          </dd>
        </>
      )}
    </dl>
  );
}
