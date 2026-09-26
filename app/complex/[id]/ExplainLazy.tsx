"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Icon } from "@/app/components/Icon";
import type { Explain as ExplainType } from "@/app/components/explain/Explain";

/* [1009 · C] ⓘ 설명 버튼을 따로 받는 청크로 — ScrubLineLazy 와 같은 방식.
   왜: 단지 허브 라우트 번들은 472/480KB 인데 Explain 은 용어 이름표(lib/explain/term-index, 56개)를 함께 싣는다
   (terser 실측 ≈ 3.3KB). 서버 HTML 에는 버튼이 그대로 있고(첫 그림 동일), 브라우저는 이 청크를 받은 뒤 누를 수 있다.
   클라이언트 이동으로 처음 그릴 때만 같은 모양의 아이콘(누를 수 없는 자리표시)이 잠깐 보인다 — 자리가 흔들리지 않게. */
const Explain = nextDynamic(() => import("@/app/components/explain/Explain").then((m) => m.Explain), {
  loading: () => (
    <span className="explain-btn" aria-hidden="true">
      <Icon name="info" size={14} strokeWidth={2} />
    </span>
  ),
});

export function ExplainLazy(props: ComponentProps<typeof ExplainType>) {
  return <Explain {...props} />;
}

export default ExplainLazy;
