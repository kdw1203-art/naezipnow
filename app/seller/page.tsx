import { redirect } from "next/navigation";

/* [970 · C-16] /seller 는 고아 페이지였다 — 어떤 화면도 여기로 링크하지 않았고(check-route-links
   기준 0건), 4단계 위저드의 마지막 버튼은 접수 API 가 없어 영구 disabled 였으며, 안에
   적힌 수수료 체계(12%/10%/7%/5% · 최소 500원 · D+14)는 코드 어디에도 집행되지 않는
   세 번째 요율표였다(C-15: 단일 출처는 lib/billing/marketplace-fees.ts). 크리에이터
   입점 안내(/creators)가 같은 목적의 살아 있는 화면이라 그리로 보낸다. layout.tsx 의
   noindex 메타는 그대로 둔다(리다이렉트 응답에는 영향 없음). */
export default function SellerRedirectPage() {
  redirect("/creators");
}
