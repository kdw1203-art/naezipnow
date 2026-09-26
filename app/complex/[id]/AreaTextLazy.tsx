"use client";

import { lazy, Suspense } from "react";

/* [1009 · C] 면적 표기(㎡/평 설정)를 따로 받는 청크로 — 쿠키 읽기·평 환산(lib/prefs/area-unit 등, terser ≈ 1.7KB)이
   허브 라우트 번들(472/480KB)에 실리지 않게. 서버 HTML 은 실제 부품이 그린 ㎡ 표기 그대로다. 청크를 받기 전(클라이언트
   이동)에는 같은 ㎡ 글자를 자리표시로 보여 줘서 빈칸이 생기지 않는다 — next/dynamic 의 loading 은 props 를 못 받아
   React.lazy + Suspense 로 썼다. */
const AreaText = lazy(() => import("./AreaText").then((m) => ({ default: m.AreaText })));

export function AreaTextLazy(props: { unitM2?: number | null; band?: string | null; prefix?: string }) {
  const m2 = props.band ?? (props.unitM2 != null ? `${props.unitM2}㎡` : "");
  return (
    <Suspense fallback={m2 ? <>{`${props.prefix ?? ""}${m2}`}</> : null}>
      <AreaText {...props} />
    </Suspense>
  );
}

export default AreaTextLazy;
