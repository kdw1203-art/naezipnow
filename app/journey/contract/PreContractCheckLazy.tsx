"use client";

import nextDynamic from "next/dynamic";

/* [1025 · 번들] 계약 전 자동 확인 카드(단지 검색 ComplexPicker + 건축물대장 조회)는 일정표(ContractPlanner) 아래에 있는
   두 번째 카드라 첫 화면에 없다. 본체를 첫 로드에서 떼어 /journey/contract 를 미등재 상한 495KB 안으로 돌린다
   (배포 빌드 실측 496KB — 예산은 올리지 않는다). 자리 틀은 같은 카드 높이로 그려 레이아웃이 튀지 않게 한다. */

function PreContractCheckShell() {
  return (
    <section
      aria-busy="true"
      className="jr-noprint card rounded-2xl p-4 max-md:p-3.5"
      aria-label="계약 전 자동 확인 불러오는 중"
    >
      <div className="h-6 w-40 rounded bg-bg" />
      <div className="mt-3 h-6 w-72 max-w-full rounded-full bg-bg" />
      <div className="mt-3 h-10 w-full rounded-lg bg-bg" />
    </section>
  );
}

const PreContractCheckBody = nextDynamic(
  () => import("./PreContractCheck").then((m) => m.PreContractCheck),
  { ssr: false, loading: () => <PreContractCheckShell /> },
);

export function PreContractCheckLazy() {
  return <PreContractCheckBody />;
}
