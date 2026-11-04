"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { areaTextM2, cookieSaysPyeong } from "./area-text-m2";

/* [1009 · C] 면적 표기(㎡/평 설정)를 따로 받는 청크로 — 쿠키 읽기·평 환산(lib/prefs/area-unit 등, terser ≈ 1.7KB)이
   허브 라우트 번들(472/480KB)에 실리지 않게. 서버 HTML 은 실제 부품이 그린 ㎡ 표기 그대로다. 청크를 받기 전(클라이언트
   이동)에는 같은 ㎡ 글자를 자리표시로 보여 줘서 빈칸이 생기지 않는다 — next/dynamic 의 loading 은 props 를 못 받아
   React.lazy + Suspense 로 썼다. */
/* [1105 · 속도] 자리마다 Suspense 경계를 두지 않는다 — ㎡ 글자는 여기서 바로 그리고(서버 HTML 과 같은 글자 · area-text-m2.ts),
   "평" 쿠키일 때만 붙은 뒤에 청크를 받아 바꾼다. 예전엔 면적 글자 하나하나가 하이드레이션 경계였다(운영 단지 화면의 완료 경계
   18개 중 15개 — 실거래 표 10 · 면적대 5). 경계마다 하이드레이션 · 커밋이 따로 돌고, 붙은 뒤 루트 쪽 컨텍스트 값이 바뀌면
   React 는 아직 안 붙은 경계를 만날 때마다 그 렌더를 처음부터 다시 했다(운영 실측 · 폰 390 · CPU 4배: 한 번 로드에 25번 —
   그때마다 전체 메뉴 시트 77개 요소를 새로 만들고 버렸다). ㎡ 사용자는 이 청크를 아예 받지 않는다. 평 사용자는 예전처럼
   ㎡ → 평으로 바뀐다(예전에도 붙은 뒤 쿠키를 읽고 바꿨다). 클라이언트 이동 때 열린 구간이 잠깐 "~59㎡" 로 보이던 자리표시도
   이제 처음부터 "60㎡ 미만" 이다. */
const AreaText = lazy(() => import("./AreaText").then((m) => ({ default: m.AreaText })));

export function AreaTextLazy(props: { unitM2?: number | null; band?: string | null; prefix?: string }) {
  const [pyeong, setPyeong] = useState(false);
  useEffect(() => {
    if (cookieSaysPyeong()) setPyeong(true);
  }, []);
  const m2 = areaTextM2(props.unitM2, props.band);
  const plain = m2 ? <>{`${props.prefix ?? ""}${m2}`}</> : null;
  if (!pyeong) return plain;
  return (
    <Suspense fallback={plain}>
      <AreaText {...props} />
    </Suspense>
  );
}

export default AreaTextLazy;
