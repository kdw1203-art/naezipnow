import NotFoundBody from "./components/NotFoundBody";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 최적화 10 — 404 화면의 <title> 이 홈과 글자 하나까지 같았다. 주소를 잘못
   눌러 404 로 떨어져도 탭·방문 기록에는 "내집나우 — 임장 기록이 판단 근거가
   됩니다" 로 남아서, 나중에 기록을 되짚을 때 홈에 다녀온 것처럼 보였다.
   (not-found.tsx 에서 metadata export 가 먹는지는 문서로 믿지 않고 빌드
   산출물 _not-found.html 을 열어 확인했다 — 먹는다.)

   noIndex 는 **일부러 빼 뒀다**. 넣었더니 같은 문서에 robots 메타가 두 개
   나왔다(Next 가 404 에 자동으로 붙이는 `noindex` + 내 `noindex, nofollow`).
   색인 차단은 어차피 Next 쪽이 이미 하고 있고, 겹쳐 봐야 서로 다른 값 두 개를
   내보내는 것뿐이다. 게다가 남는 `noindex`(follow 허용) 쪽이 404 에는 더 맞다 —
   크롤러가 이 화면의 "홈으로" 링크는 따라가는 편이 낫다.

   [1007 · P2] 정적 여부: `/_not-found` 는 빌드 때 프리렌더된다(○). 이 파일은 dynamic API
   (cookies·headers·searchParams)를 쓰지 않고 루트 레이아웃도 정적이라 그 조건을 지킨다.
   `export const dynamic` 은 여기 두어도 효력이 없다 — /_not-found 의 page 모듈은 Next 내장
   global-not-found 이고 이 파일은 그 트리의 not-found 슬롯이다(next/dist/build/entries.js).
   그러니 "정적으로 유지"의 실제 조건은 **이 파일과 루트 레이아웃이 dynamic API 를 안 쓰는 것**이다.

   보강 이유(실측): 하루 요청 경로 종류 10,925개 중 대부분이 1회성 크롤·옛 링크다 — 봇과 옛
   북마크가 가장 많이 닿는 화면이 404 다. 홈 링크 하나로는 막다른 길이라 (1) 바로 치는 검색창
   (JS 없는 GET 폼 → /search?q=) (2) 실제 트래픽 상위 목적지(단지 찾기·지역 실거래·뉴스룸·
   동네이야기·공개 노트)를 40px 칩으로 둔다. "실거래 시세"·"내 임장노트" 라벨은 사실과 달랐다
   (/tx 는 실거래만 있고, /notes 는 공개 노트 피드) — 하는 일 그대로 쓴다. */
export const metadata = buildPageMetadata({
  title: "페이지 없음 · 404",
  description: "주소가 바뀌었거나 삭제된 페이지 · 단지 찾기 · 지역 실거래 · 뉴스룸 · 통합 검색",
});

/* [1091] 몸체는 클라이언트 조각(app/components/NotFoundBody) — 모든 화면의 RSC 에 실리던 4KB 마크업을 뺀다(그 파일 머리 주석).
   이 파일은 dynamic API · "use client" 없이 메타데이터와 참조만 — /_not-found 정적 프리렌더 조건(위 [1007 · P2])은 그대로다. */
export default function NotFound() {
  return <NotFoundBody />;
}
