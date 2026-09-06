import type { Metadata } from "next";
import type { ReactNode } from "react";

/** 판매자 온보딩은 심사 접수 미연결 상태(감사 P1-5) — 검색 색인 제외.
    [970 · C-26] description 이 비어 있었다 — /seller 는 지금 /creators 로 보내는 경유지라
    (C-16) 그 사실만 적는다. */
export const metadata: Metadata = {
  title: "판매 시작하기 | 내집나우",
  description: "리포트 판매 시작 안내는 임장 크리에이터 입점 안내(/creators)로 이동했어요.",
  robots: { index: false, follow: false },
};

export default function SellerLayout({ children }: { children: ReactNode }) {
  return children;
}
