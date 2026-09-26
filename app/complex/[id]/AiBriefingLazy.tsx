"use client";

import { useState } from "react";
import nextDynamic from "next/dynamic";

/* [1008 · Q] AI 예습 브리핑 — 버튼을 누를 때 본체를 받는다(번들 상쇄).
   왜: /complex/[id] 첫 로드 JS 가 479/480KB 인데 이번 판에 "호가 점검" 입구(AskingCheckToggle +
   next/dynamic)가 더해진다. 브리핑 카드는 데스크탑 사이드바(lg 미만에선 숨김)에서 누를 때만 일하는데,
   본체(요청·한도·결과 렌더)가 통째로 첫 로드에 실려 있었다. 머리말·버튼은 그대로 두고 본체만 뗀다 —
   누르면 청크를 받고 곧바로 예전과 같은 요청(/api/ai/note-draft)을 한 번 보낸다. */

type Props = { complexId: string; region: string; aptName: string; noteHref: string };

function BriefingShell({ busy, onStart }: { busy: boolean; onStart?: () => void }) {
  return (
    <section className="card flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="t-body font-extrabold text-ink">✨ AI 예습 브리핑</h2>
          <p className="mt-0.5 t-caption text-text-3">
            방문 전에 이 단지의 실거래·시세·공급 데이터를 한 장으로 예습하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="btn-soft rounded-xl px-3.5 py-2 t-sub font-bold text-primary disabled:opacity-50"
        >
          {busy ? "브리핑 만드는 중…" : "브리핑 받기"}
        </button>
      </div>
      <p className="t-caption text-text-3">
        공개 데이터 기반 참고용이며, 투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </section>
  );
}

const AiBriefingCard = nextDynamic(() => import("./AiBriefingCard").then((m) => m.AiBriefingCard), {
  ssr: false,
  loading: () => <BriefingShell busy />,
});

export function AiBriefingLazy(props: Props) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <BriefingShell busy={false} onStart={() => setArmed(true)} />;
  return <AiBriefingCard {...props} autoRun />;
}
