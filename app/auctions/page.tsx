import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero, TownSources } from "@/app/town/TownHero";
import { getAuctions, getActiveAuctionCount } from "@/lib/onbid/store";
import { seoAlternates } from "@/lib/seo/alternates";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { AuctionsClient } from "./AuctionsClient";
import { slimAuctionItems } from "./slim";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

/* 비용 실측(2026-08-10, 사용량 절감 8차): 서버가 ?usage/gu/source 를 읽어
   요청마다 렌더 — 크롤 1회 = 함수 호출 1회였다. 다른 목록과 달리 전량
   클라이언트 필터로 못 바꾼다: 진행 물건 1,130건 > 페치 상한 200이라 필터
   결과가 조용히 축소된다(실측). 구조를 셋으로 갈랐다 —
   · 이 페이지(파라미터 없음): ISR 10분, 기본 목록 200건이 SSR HTML 에 전부.
   · 필터: /api/auctions (조합별 CDN 캐시 s-maxage=600) 를 클라이언트가 fetch.
   · source=court: AuctionsClient 안의 클라이언트 분기.
   D-day·진행/마감·캘린더는 클라이언트가 조회 시각으로 계산 — 요청 시각 기준
   이던 예전보다 오히려 신선하다(SSR 은 builtAtMs 로 하이드레이션 일치). */
/* [1010] 600 → 21,600(6시간). 위 구조대로 기본 목록 200건이 서버 HTML 에 전부 실리므로
   TTL 이 곧 신선도였다. 이제 온비드 적재 크론이 **물건이 실제로 들어왔을 때만**
   /auctions 를 비운다(app/api/cron/onbid-sync/route.ts) — 시간은 안전망으로만 남는다.
   D-day·진행/마감은 원래도 클라이언트가 조회 시각으로 계산하므로 TTL 과 무관하다. */
export const revalidate = 21_600;

export const metadata: Metadata = {
  title: "수도권 공매 물건 (온비드) | 내집나우",
  description:
    "한국자산관리공사 온비드 공매 부동산 — 서울·경기·인천 아파트·오피스텔·빌라 감정가·최저입찰가·입찰일정. 공공 데이터 기반.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/auctions"),
};

/** 테마 구분: 공매·경매 = 보라 (딜·긴급). subtree 안에서 text-primary·bg-primary-soft·
 *  chip-active·btn-primary 가 보라로 재테마됨 (예시 배지 앰버는 그대로 대비 유지).
 *  [970 · B-36] 인라인 style 은 라이트 값만 심어 다크에서 연보라 배경이 형광처럼 떴다 —
 *  globals.css `.theme-auction`(+ `.dark .theme-auction`)로 옮겼다. */

export default async function AuctionsPage() {
  /* 2026-07-26: store 가 실패 때 `[]`·`0` 을 돌려주던 걸 던지도록 고쳤다.
     여기서 받아서 "지금 불러오지 못했다"고 말한다 — 물건이 0건인 것과 조회가
     죽은 것을 같은 화면으로 그리면 안 된다. ISR 에서 던지면 이전 정상 캐시가
     유지되고(stale), 캐시가 아예 없으면 이 에러 분기가 나간다. */
  const loaded = await Promise.all([
    getAuctions({ limit: 200 }),
    getActiveAuctionCount(),
  ]).then(
    ([items, activeTotal]) => ({ ok: true as const, items, activeTotal }),
    (err: unknown) => {
      logger.error("[auctions] 온비드 공매 조회 실패", err);
      return { ok: false as const };
    },
  );

  if (!loaded.ok) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-[760px]">
          <TownHero href="/auctions" />
          <TownCategoryNav stick />
          <div className="theme-auction">
            <ErrorState
              title="공매 물건을 지금 불러오지 못했어요"
              desc="진행 중인 물건이 0건인 게 아니라 조회 자체가 실패했어요. 잠시 후 새로고침해 주세요. 급하면 온비드 공고에서 볼 수 있어요."
              action={{ href: "https://www.onbid.co.kr", label: "온비드 공고 보기" }}
            />
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 머리(제목 + 입찰 중·예정 건수) → 카테고리 탭 → 필터 칩 두 줄 →
       물건 목록(주인공) → 알림 받기(채움 파랑 하나) → 캘린더·지난 공고(접힘) → "데이터 출처" 접힘 → 수익 문구 고지.
       브레드크럼 문자열("동네이야기 › 공매 물건")은 제목·카테고리 탭과 같은 말이라 뺐고, 하우스 광고(AdZone)도 뺐다. */
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        {/* [1012] 규칙 7 — 머리에 실측(입찰 중·예정 건수). [v4] 네이비 히어로 → 흰 머리 사실 한 줄 */}
        <TownHero
          href="/auctions"
          stats={[{ label: "입찰 중·예정", value: loaded.activeTotal, unit: "건" }]}
        />
        <TownCategoryNav stick />
        <div className="theme-auction flex flex-col gap-8">
          <AuctionsClient
            initialItems={slimAuctionItems(loaded.items)}
            initialActiveTotal={loaded.activeTotal}
            builtAtMs={Date.now()}
          />

          {/* [v4 · 규칙 3] 예전 요약 문장 · 파랑 안내 상자 · 목록 끝 출처 문장 · 사이드 "온비드 바로가기"를 한 곳으로 */}
          <TownSources>
            <p>한국자산관리공사 온비드(공공데이터포털) · 감정가·최저입찰가·입찰일정 · 매일 자동 갱신</p>
            <p>갱신 사이 변경·취소 가능 — 실제 입찰·명도 조건은 온비드 공고 원문 우선</p>
            <p>참고용 정보 — 권리분석·명도·정확한 입찰조건은 온비드 공고 원문과 전문가 확인 필요</p>
            <p>
              <a
                href="https://www.onbid.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="tap-line font-bold text-primary no-underline"
              >
                {/* [1012] 규칙 5 — 동사 + 대상 */}
                온비드 공고 보기 ↗
              </a>
            </p>
          </TownSources>

          {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 마켓(공매) 표면 고지 */}
          <ComplianceNotice variant="market" />
        </div>
      </div>
    </PageShell>
  );
}
