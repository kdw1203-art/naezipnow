import { Icon } from "./components/Icon";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
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
  title: "페이지를 찾을 수 없어요",
  description: "주소가 바뀌었거나 삭제된 페이지입니다.",
});

/** 봇·옛 링크가 가장 많이 닿는 목적지 — 라벨은 그 화면이 실제로 하는 일.
 *  [v4 · 규칙 2·5] 가운데 버튼 두 개(홈으로 · 지도 열기) + 알약 칩 다섯 → 1px 선 목록 행 일곱(홈·지도가 맨 위). */
const POPULAR_PATHS = [
  { href: "/", label: "홈" },
  { href: "/map", label: "지도" },
  { href: "/complex/browse", label: "단지 찾기" },
  { href: "/tx", label: "지역 실거래" },
  { href: "/town/news", label: "뉴스룸" },
  { href: "/town", label: "동네이야기" },
  { href: "/notes", label: "공개 임장노트" },
] as const;

/* [v4 · 한 화면 한 가지] 제목 한 줄 + 사실 한 줄 → 주인공(검색창, 채움 파랑 [검색] 1개) → 자주 찾는 곳 목록 행.
   지운 것: 브랜드 심볼 그림(처마·온점) · 가운데 정렬 · 설명 두 문장 · 두 번째 채움 파랑("홈으로") · 임의 그림자.
   [1012 · 규칙 8] 굵기 800 → 700. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-0.5">
        <p className="rise-in t-caption font-bold tracking-[0.2em] text-text-3">404</p>
        <h1 className="rise-in-1 t-title text-ink">
          이 집은 이사 갔어요<span className="text-brand-red">.</span>
        </h1>
        <p className="rise-in-2 t-sub text-text-3">주소가 바뀌었거나 삭제된 페이지 · 단지·동네 검색</p>
      </header>

      {/* 검색 — JS 없이 동작하는 GET 폼. 통합 검색(/search?q=)이 단지·지역·노트·이야기·뉴스를 찾는다. */}
      <form
        action="/search"
        method="get"
        role="search"
        className="rise-in-2 flex w-full items-center gap-2 rounded-lg border-[1.5px] border-primary bg-surface px-3 py-1.5 text-ink"
      >
        <Icon name="search" size={16} className="shrink-0 text-text-3" />
        <input
          type="search"
          name="q"
          placeholder="단지명·지역·동네 검색"
          aria-label="통합 검색"
          autoComplete="off"
          enterKeyHint="search"
          /* 모바일 16px 은 globals.css [968 · 28] 전역 규칙(iOS 줌 방지)이 입힌다 — 여기선 램프 글자만 */
          className="min-h-10 w-full min-w-0 bg-transparent t-body text-ink outline-none placeholder:text-text-3"
        />
        <button type="submit" className="btn-primary btn-md shrink-0">
          검색
        </button>
      </form>

      {/* 자주 찾는 곳 — 행 높이 ≥ 56px(SummaryRow). 라벨은 목적지가 실제로 하는 일 그대로 */}
      <nav aria-labelledby="nf-popular-h" className="rise-in-3 flex flex-col">
        <h2 id="nf-popular-h" className="t-section text-ink">
          자주 찾는 곳
        </h2>
        <ul className="divide-y divide-line">
          {POPULAR_PATHS.map((p) => (
            <SummaryRow key={p.href} label={p.label} href={p.href} />
          ))}
        </ul>
      </nav>
    </main>
  );
}
