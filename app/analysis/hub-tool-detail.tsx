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
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 t-sub">
      <dt className={`text-text-3 ${fromTable ? "md:hidden" : ""}`}>하는 일</dt>
      <dd className={`m-0 text-text-1 ${fromTable ? "md:hidden" : ""}`}>{c.premise}</dd>
      {c.result && (
        <>
          <dt className={`text-text-3 ${fromTable ? "lg:hidden" : ""}`}>결과</dt>
          <dd className={`m-0 font-bold text-ink ${fromTable ? "lg:hidden" : ""}`}>{c.result}</dd>
        </>
      )}
      <dt className="text-text-3">분석 순서</dt>
      <dd className="m-0">
        <ol className="m-0 flex list-none flex-col gap-1 p-0 md:flex-row md:flex-wrap md:gap-x-4">
          {steps.map((st, i) => (
            <li key={`${i}-${st}`} className="flex min-w-0 items-center gap-1.5 text-text-1">
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
          <dt className="text-text-3">시장 신호</dt>
          <dd className="m-0 text-text-2">
            단지·지역을 고른 실행에 {signalLabels.length}가지 · {signalLabels.join(" · ")}
            {" · "}
            <Link
              href="/methodology#signals"
              className="-my-2.5 inline-flex min-h-[40px] items-center font-semibold text-primary no-underline md:-my-0.5 md:min-h-6"
            >
              계산 방법 ›
            </Link>
          </dd>
        </>
      )}
    </dl>
  );
}
