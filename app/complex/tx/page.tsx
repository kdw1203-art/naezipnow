import { redirect } from "next/navigation";

/* [970 · B-18] /complex/tx 인덱스 — 예전엔 이 경로에 페이지가 없어 `/complex/[id]` 가
   id="tx" 로 받아 소프트 404 를 냈다(매물 상세의 "실거래가 비교 →" 폴백이 여기로 왔다).
   실거래 단지 목록의 살아 있는 화면은 /complex/browse 라 그리로 보낸다. 단지별 상세
   (/complex/tx/[slug])는 그대로다. 캐시 정책 게이트 때문에 lib/http/cache-policy.ts 에
   제 이름으로 올라가 있다([id] 패턴에 가려진 실제 페이지). */
export default function ComplexTxIndexRedirectPage() {
  redirect("/complex/browse");
}
