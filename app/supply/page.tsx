import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { getSupplyAll, getSupplyDataAsOf } from "@/lib/market/supply";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero, TownSources } from "@/app/town/TownHero";
import { seoAlternates } from "@/lib/seo/alternates";
import { SupplyClient } from "./SupplyClient";

/* ── ISR 전환 (사용량 절감 9차, 2026-08-10) ─────────────────────────────────
   예전에는 force-dynamic + ?region= 서버 필터(요청마다 함수 실행 + DB 4쿼리)였다.
   실측: apartment_supply 전량 675행(17개 시도, 최다 지역 209행) — 페치 상한
   2000 안에 넉넉히 들어오므로 클라이언트 메모리 필터가 서버 .eq 필터와 동치다.
   ① 데이터는 전량 1쿼리(getSupplyAll) + 기준시점 1쿼리 = 4쿼리 → 2쿼리
   ② 필터·파생(월별 집계/분기 카드/표)은 SupplyClient 가 마운트 후
      location.search 로 처리 — SSR 은 전국 전량을 그대로 그린다
   ③ 세션(getAdViewer)은 제거 — 세션을 읽는 순간 dynamic 으로 굴러떨어진다.
      광고는 plan={null} 서버 조각 + AdFreeGate 클라이언트 게이트(complex/[id] 선례)
   [1009 · H 리뷰] 청약홈 분양공고 자동 적재(매일 06:00 UTC, lib/market/supply-ingest.ts)가 하루 한 번이라 600초면 충분히 신선하다.
   실패는 캐시에 눌러앉히지 않도록 ok 판별로 구별해 그린다 (dev-deals 교훈 —
   단, 실패 화면도 revalidate 주기로는 캐시되므로 600초를 넘기지 않는다). */
/* [1010] 600 → 86,400(1일). 재료는 수동 적재 데이터(자동 갱신 없음)이고, 적재 크론
   (app/api/cron/supply-ingest)이 끝나면 SOURCE_MAP.supply 가 "/supply" 를 즉시 비운다.
   바뀌지 않는 날에는 크롤러가 몇 번을 와도 CDN HIT 이면 된다. */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "아파트 입주 예정 물량 | 내집나우",
  /* "캘린더" 표기는 제거(2026-08-22) — 실제 화면은 월별 물량 막대 + 단지 목록이지
     달력 격자가 아니다. 이름이 화면과 다르면 찾던 것을 못 찾았다고 느낀다. */
  description:
    "전국·지역별 아파트 입주 예정 물량(공급) — 입주월·단지·세대수. 공급이 많은 시기와 지역을 한눈에.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/supply"),
};

const SOURCE_URL = "https://www.data.go.kr";

export default async function SupplyPage() {
  const [all, dataAsOf] = await Promise.all([
    getSupplyAll(),
    getSupplyDataAsOf(),
  ]);

  // 갱신 기준 표기 — 하드코딩 대신 DB(apartment_supply) 최신 적재 시점(created_at).
  // [1009 · H 리뷰] 두 원천(청약홈 분양공고 매일 자동 · 2026-02 수동 업로드분)을 함께 적는다 — 예전 "자동 갱신 없음"은
  // 자동 경로(#21)가 생기기 전 문구였다(운영 실측: 1,338행 중 983행이 청약홈 자동 적재, 마지막 적재 2026-09-20).
  const asOfLabel =
    dataAsOf && dataAsOf.length >= 7 ? `${dataAsOf.slice(0, 4)}.${dataAsOf.slice(5, 7)}` : null;

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 머리(제목 + 입주 예정 단지 수) → 카테고리 탭 → 지역 칩 한 줄 →
       월별 입주 물량 막대(주인공) → 입주 예정 단지 목록 → 지난 입주(접힘) → "데이터 출처" 접힘.
       지운 것: 브레드크럼 문자열(제목·탭과 같은 말) · 오른쪽 칩 두 개(공공데이터 원문 → 데이터 출처, 청약 경쟁률 → 카테고리 탭의
       "청약") · 초록 안내 배너 문장 · 끝 면책 문장(→ 데이터 출처 한 줄) · 하우스 광고(AdZone). */
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        {/* [1012] 규칙 7 — 머리에 실측(이 화면에 실린 단지 수). 조회 실패면 숫자 없음.
            [v4] 네이비 히어로 → 흰 머리 사실 한 줄. 기준월·원천은 맨 끝 "데이터 출처" */}
        <TownHero
          href="/supply"
          stats={all.ok ? [{ label: "입주 예정 단지", value: all.items.length, unit: "곳" }] : []}
        />
        {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
        <TownCategoryNav stick />
        {/* 테마 구분: 입주 물량 = 초록(공급·신축). 값은 globals.css .theme-supply —
            인라인 style 이면 다크 값을 못 얹고 대비 게이트도 못 본다([975]). */}
        <div className="theme-supply flex flex-col gap-8">
          {all.ok ? (
            <SupplyClient
              items={all.items}
              truncated={all.truncated}
              asOfLabel={asOfLabel}
              builtAtMs={Date.now()}
            />
          ) : (
            /* 조회 실패 — "데이터 없음" 과 구별해 그린다 (0건이 아니라 조회 실패).
               예전 로더들은 실패를 [] 로 삼켜 빈 상태처럼 보였다 — getSupplyAll 이
               ok 로 구별한다. [v4] 카드 → 한 줄 */
            <p className="py-12 text-center t-body text-text-2">
              입주 물량 데이터를 불러오지 못했어요 — 0건이 아니라 조회 실패 · 잠시 뒤 새로고침
            </p>
          )}

          {/* [v4 · 규칙 3] 예전 초록 안내 배너 문장("입주는 월 단위로 공개되는 자료라 …")과 끝 면책 문장,
              "공공데이터 원문 보기 ↗" 칩을 맨 끝 접힘 하나로 — 문장은 사실 명사로 줄였다 */}
          <TownSources>
            {/* [1011] "자동 적재 · 수동 적재분 · 최근 적재" 같은 내부 낱말을 걷었다(소유자 지시).
                다만 "2026년 2월에 받은"은 그 절반이 오래된 자료라는 **신선도 경고**라 남긴다. */}
            <p>
              청약홈 분양공고 입주예정월(매일 갱신) + 2026년 2월에 받은 공공데이터 입주예정물량
              {asOfLabel ? ` · ${asOfLabel} 기준` : ""}
            </p>
            <p>입주는 월 단위 공개 — 일자 없음 · 사업 진행·일정 변경에 따라 실제와 다를 수 있는 참고용 정보</p>
            <p>
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-line font-bold text-primary no-underline"
              >
                {/* [1012] 규칙 5 — 동사 + 대상 */}
                공공데이터 원문 보기 ↗
              </a>
            </p>
          </TownSources>
        </div>
      </div>
    </PageShell>
  );
}
