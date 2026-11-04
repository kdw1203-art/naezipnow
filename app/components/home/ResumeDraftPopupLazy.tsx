"use client";

/* [1103 · 번들] 홈 "작성 중인 노트 이어서 쓰기" 팝업의 지연 로더.
   팝업은 임시저장이 있는 사람에게만, 마운트 뒤에야 뜬다(서버 HTML 에는 원래 아무것도 없다 — draft 초깃값 null).
   그런데 정적 import 라 초안 요약 파서(lib/notes/draft-summary · note-scores)와 상대 시각 포맷까지 홈 첫 로드 번들에 실렸다(~8KB raw).
   ssr:false 로 하이드레이션 뒤 따로 받는다 — 서버 HTML 은 같다(빈 자리), 팝업이 뜨는 조건·모양도 같다. */
import nextDynamic from "next/dynamic";

export const ResumeDraftPopupLazy = nextDynamic(
  () => import("./ResumeDraftPopup").then((m) => m.ResumeDraftPopup),
  { ssr: false, loading: () => null },
);

export default ResumeDraftPopupLazy;
