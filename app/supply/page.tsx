import type { Metadata } from "next";
import { HubBreadcrumbLd } from "@/app/components/seo/HubBreadcrumbLd";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import { getSupplyAll, getSupplyDataAsOf } from "@/lib/market/supply";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { seoAlternates } from "@/lib/seo/alternates";
import { validYm } from "@/lib/supply/window";
import { MiniBar } from "@/app/components/compact/MiniBar";
import { FactTable } from "@/app/components/compact/FactTable";
import { Fineprint } from "@/app/components/Fineprint";
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

/* [1081 · #10] 제목의 해 — "2026 입주 예정 아파트" 류 검색어. 한국 날짜 기준 올해·내년, 매년 자동 */
const SUPPLY_TITLE_YEARS = (() => {
  const y = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  return `${y}~${y + 1}년`;
})();

export const metadata: Metadata = {
  title: `${SUPPLY_TITLE_YEARS} 아파트 입주 예정 물량 — 지역·월별 입주 단지·세대수 | 내집나우`,
  /* "캘린더" 표기는 제거(2026-08-22) — 실제 화면은 월별 물량 막대 + 단지 목록이지
     달력 격자가 아니다. 이름이 화면과 다르면 찾던 것을 못 찾았다고 느낀다. */
  description: `${SUPPLY_TITLE_YEARS} 전국·지역별 아파트 입주 예정 물량(공급). 입주월·단지명·세대수를 시기·지역별로 정리 — 공급이 몰리는 시기와 지역을 청약홈 공고 기준으로.`,
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/supply"),
};

const SOURCE_URL = "https://www.data.go.kr";

/* [1063 · 표·그래프] 소유자 지시 "표 및 그래프, 액션 적극 활용 · 글자크기 간결화"(10-12).
   머리 문장 대신 **센 숫자 넉 줄**(단지 · 세대수 · 시·도 · 기준 시점)로 열고, 바로 아래 연도별 세대수 막대를 둔다.
   숫자는 모두 이 화면이 이미 받은 배열(all.items)에서 센 값이다 — 새 조회도, 추정도 없다.
   기준·원천 문장과 면책은 접기 뒤로 보낸다(문장은 한 자도 바꾸지 않았다). */
type YearBucket = { label: string; value: number; note: string };

function deriveYearly(items: readonly { moveInYm: string; households: number | null }[]): YearBucket[] {
  const m = new Map<string, { count: number; households: number }>();
  for (const it of items) {
    /* 입주월이 없거나 달이 잘못 적힌 자료는 연도 막대에서 빠진다(아래 접기에 그대로 적는다) */
    if (!validYm(it.moveInYm)) continue;
    const y = it.moveInYm.slice(0, 4);
    const e = m.get(y) ?? { count: 0, households: 0 };
    e.count += 1;
    e.households += Number(it.households ?? 0) || 0;
    m.set(y, e);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([y, v]) => ({ label: `${y}년`, value: v.households, note: `· ${v.count}곳` }));
}

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

  /* [1063] 머리 숫자 — 받은 배열에서 직접 센다(조회 실패면 요약 판 자체를 그리지 않는다) */
  const items = all.ok ? all.items : [];
  const totalHouseholds = items.reduce((s, it) => s + (Number(it.households ?? 0) || 0), 0);
  const regionCount = new Set(items.map((it) => it.region || "기타")).size;
  const yearly = deriveYearly(items);
  /* 라벨에 "전체"를 적는다 — 아래 월별 합계·지역 요약은 24개월 창이라 모수가 다르다(접기에 그 차이를 적는다) */
  const facts: { k: string; v: string }[] = [
    { k: "전체 단지", v: `${items.length.toLocaleString("ko-KR")}곳` },
    { k: "전체 세대수", v: `${totalHouseholds.toLocaleString("ko-KR")}세대` },
    { k: "시·도", v: `${regionCount.toLocaleString("ko-KR")}곳` },
    ...(asOfLabel ? [{ k: "기준 시점", v: asOfLabel }] : []),
  ];

  return (
    <PageShell breadcrumb="동네이야기 › 입주 물량" wide>
      <HubBreadcrumbLd trail={[{ name: "동네이야기", path: "/town" }, { name: "입주 예정 물량", path: "/supply" }]} />
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      {/* [978] 홈과 같은 네이비 히어로 — 카테고리별로 제목·설명·색만 바뀐다 */}
      <TownHero href="/supply" />
      <TownCategoryNav stick />
      {/* 테마 구분: 입주 물량 = 초록(공급·신축). 값은 globals.css .theme-supply —
          인라인 style 이면 다크 값을 못 얹고 대비 게이트도 못 본다([975]). */}
      <div className="theme-supply">
        {/* 상단 CTA — 예전의 정적 탭 4개(전체·이번 분기·예정·지난 입주)는 클릭해도
            아무 동작이 없는 장식이라 제거했다. "입주 물량 알림" 칩도 뺐다 —
            /notifications 는 알림함일 뿐 입주 알림을 켜는 설정이 없어서, 신청할 수
            없는 알림을 신청 버튼처럼 걸어 두면 신청했다고 오해하게 만든다. */}
        {/* [1015] 이 줄 아래 있던 안내 띠("입주는 월 단위로 …예요. …합친 자료예요. …다를 수 있어요")를 걷었다
            (브리프 규칙 B). 같은 사실(월 단위 · 두 원천 · 기준 시점)은 "월별 입주 물량" 제목 옆 ⓘ(SupplyClient)
            시트 안에 이미 있고, 일정 변경 면책은 페이지 끝 한 줄이 맡는다. */}
        {/* [1063] 숫자 줄 + 연도 막대 + 접기 한 판. 예전에는 이 자리에 기준 문장 한 줄과 알약 링크 둘이 있었다 —
            문장은 접기 안 "기준 · 원천" 줄로, 출처 링크는 접기 안으로, 청약 링크는 이 화면의 **유일한 채움 파랑**으로 올렸다.
            머리카락 선(sm:border-l)만으로 칸을 나눈다 — 숫자가 내용이고 상자는 내용이 아니다(1062 선례).
            폰은 2열 × 2줄(390px 에서 라벨이 접히고 숫자는 제자리), 데스크톱은 한 줄 넉 칸. */}
        {all.ok && (
          <section className="rise-in card mb-4 p-[var(--pad-card)] max-md:mb-3" aria-label="입주 물량 요약">
            {/* [1063 고침] 폰은 숫자 줄 아래 액션 — 한 줄에 두면 단추가 줄어들지 않아 숫자 칸을 덮는다(390px 실측) */}
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between md:gap-x-4">
              <dl className="m-0 grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {facts.map((f) => (
                  <div
                    key={f.k}
                    className="flex min-w-0 flex-col-reverse gap-0.5 sm:border-l sm:border-line sm:pl-3 sm:first:border-l-0 sm:first:pl-0"
                  >
                    <dt className="t-caption text-text-3">{f.k}</dt>
                    <dd className="m-0 t-num t-section text-ink">{f.v}</dd>
                  </div>
                ))}
              </dl>
              {/* [1063] 이 화면의 단 하나뿐인 주 액션 — 입주(완성 공급) 다음 칸인 청약(앞단)으로 잇는다.
                  "지도에서 보기"(→/map)는 제거(2026-08-22) — 지도에 입주 물량 레이어가 없어서, 누르면 목적과
                  무관한 화면이 나오는 링크였다. 지도에 공급 레이어가 생기면 그때 되살린다. */}
              <Link
                href="/apply"
                className="btn-primary inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl px-4 t-body no-underline md:min-h-9"
              >
                청약 경쟁률 보기
              </Link>
            </div>

            {/* 연도별 세대수 막대 — 월별(아래 24개월)보다 넓게, 자료 전체가 어느 해에 몰려 있는지 한눈에.
                값은 실집계 세대수 하나뿐이라 단위가 섞이지 않는다(곳수는 줄 끝 보조 표기). */}
            {yearly.length > 1 && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="t-section font-bold text-ink">연도별 입주 세대수</h2>
                  <span className="t-caption text-text-3">자료 전체 · 세대수 기준</span>
                </div>
                <MiniBar className="mt-2" rows={yearly} unit="세대" label="연도별 입주 세대수" />
              </div>
            )}

            <Fineprint className="mt-3" label="기준 · 출처">
              <FactTable
                dense
                rows={[
                  ...(asOfLabel
                    ? [
                        {
                          label: "기준 · 원천",
                          value: `${asOfLabel} 기준 · 청약홈 분양공고 · 공공데이터 입주예정물량`,
                        },
                      ]
                    : []),
                  {
                    label: "세는 방법",
                    value:
                      "위 숫자는 이 화면이 받은 자료 전체에서 센 값입니다. 아래 월별 합계·지역별 요약은 이번 달부터 24개월입니다.",
                  },
                  {
                    label: "연도 막대",
                    value: "입주월이 없거나 달이 잘못 적힌 단지는 연도 막대에서 빠집니다.",
                  },
                  {
                    label: "출처",
                    value: (
                      <a
                        href={SOURCE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-line inline-flex min-h-[40px] items-center font-bold text-primary no-underline md:min-h-6"
                      >
                        공공데이터 출처 ↗
                      </a>
                    ),
                  },
                ]}
              />
            </Fineprint>
          </section>
        )}

        {all.ok ? (
          <SupplyClient
            items={all.items}
            truncated={all.truncated}
            asOfLabel={asOfLabel}
            builtAtMs={Date.now()}
            adSlot={<AdZone placement="community_feed" seed={0} plan={null} />}
          />
        ) : (
          /* 조회 실패 — "데이터 없음" 과 구별해 그린다 (0건이 아니라 조회 실패).
             예전 로더들은 실패를 [] 로 삼켜 빈 상태처럼 보였다 — getSupplyAll 이
             ok 로 구별한다. 이 화면도 revalidate 주기 동안은 캐시되지만,
             빈 데이터를 "정상 0건" 처럼 눌러앉히는 것보다는 정직하다. */
          <div className="card rounded-2xl px-4 py-10 text-center t-body text-text-2">
입주 물량 불러오기 실패 · 잠시 후 다시
          </div>
        )}

        {/* 면책 (초록 톤 유지) — [1063] 문장은 그대로 두고 접기 뒤로(첫 화면은 숫자부터) */}
        <Fineprint className="mt-6" label="면책">
          입주 예정 물량은 공개 자료를 취합한 참고용 정보이며, 사업 진행·일정
          변경에 따라 실제와 다를 수 있습니다.
        </Fineprint>
      </div>
    </PageShell>
  );
}
