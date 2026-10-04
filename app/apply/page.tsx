import type { Metadata } from "next";
import Link from "next/link";
import { ApplyDailyStrip } from "./ApplyDailyStrip";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { Explain } from "@/app/components/explain/Explain";
import { AdZone } from "@/app/components/ads/AdZone";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { ApplySearchClient } from "./ApplySearchClient";
import type { ApplyInitialResult } from "./ApplySearchClient";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

const APPLYHOME_URL = "https://www.applyhome.co.kr";

// 빌드 타임 외부 API 접근 회피 — 요청 시 서버에서 청약홈 데이터를 조회
/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 청약홈 공공데이터는 하루 단위 갱신 — 요청마다 SSR 할 이유가 없다. */
/* [1010] 1,800 → 86,400(1일). 재료는 청약홈 공고이고, 적재 크론
   (app/api/cron/supply-ingest)이 끝나면 SOURCE_MAP.supply 가 "/apply" 를 즉시 비운다.
   ※ /apply/calendar 는 아직 그 목록에 없어 TTL 을 올리지 않았다(보고서 참고). */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "청약 센터 — 청약홈 경쟁률·특별공급 | 내집나우",
  description:
    "청약홈(한국부동산원) 공공데이터 기반 아파트 청약 경쟁률·특별공급 접수현황 — 지역·단지명 검색.",
  alternates: seoAlternates("/apply"),
  robots: { index: true, follow: true },
};

/* 정직화 리라이트 기록:
   - 예전 이 페이지는 "과천지식정보타운 S7블록"이라는 실명 단지에 지어낸
     분양가(8.9억)·예상 경쟁률(120:1)·가점 컷(58점)·인근 시세 비교(안전마진 1.5억)를
     붙인 하드코딩 카드 + 정적 "8월 청약 캘린더" 상수 + 동작하지 않는 탭·알림 토글로
     구성돼 있었다. 실명에 붙은 가짜 수치는 "예시" 배지로 감당할 수 없는 종류라 전부
     제거하고, 실데이터(청약홈 경쟁률·특별공급 API)를 페이지 중심으로 승격했다.
   - 검색·탭·더보기는 이미 완성돼 있던 /api/applyhome/search 를 배선한 것(ApplySearchClient). */

/* 2026-07-27 디자인 고도화(#225) — /supply(입주 물량)·/auctions(공매 물건) 수준으로 올린다.
   바꾼 것: 테마 래핑, seoAlternates, 실패 원인 보존, 카테고리 연동 사이드, 요약 타일(클라이언트). */

/**
 * 구 lib(청약홈 odcloud)를 서버 컴포넌트에서 직접 호출 — 초기 화면용.
 *
 * 2026-07-27: 예전엔 `catch { return null }` 이었다. 그러면 화면에는 "불러오지
 * 못했어요" 한 줄만 남고 **왜** 실패했는지가 사라진다. 키 미설정(mode:"mock")·
 * 상세 API 미승인(detailNotice)·진짜 조회 실패는 서로 다른 상태이고 사용자가 할
 * 수 있는 일도 다르다. 원인을 그대로 넘겨 화면에서 구분해 쓴다.
 */
async function getInitialPayload(): Promise<ApplyInitialResult> {
  try {
    const payload = await searchApplyhome({ tab: "competition", page: 1, perPage: 15 });
    return { ok: true, payload };
  } catch (err) {
    logger.error("[apply] 청약홈 초기 조회 실패", err);
    return { ok: false, cause: err instanceof Error ? err.message : String(err) };
  }
}

/* 연동(#225) — 청약은 단독으로 보지 않는다. 같은 지역의 입주 물량(공급 압력),
   공매 물건(가격 하단), 정비사업(미래 공급)을 같이 봐야 판단이 선다.
   [1015] 부제는 그 화면의 자료 이름만(명사) — 설명문을 걷었다(브리프 규칙 D). */
const CROSS_LINKS: { href: string; icon: string; label: string; desc: string }[] = [
  {
    href: "/supply",
    icon: "calendar",
    label: "입주 물량",
    desc: "입주월 · 세대수",
  },
  {
    href: "/auctions",
    icon: "gavel",
    label: "공매 물건",
    desc: "감정가 · 최저입찰가",
  },
  {
    href: "/redevelopment",
    icon: "map",
    label: "정비사업 지도",
    desc: "재건축 · 재개발 단계",
  },
  /* [994] "단지 Q&A"(/qna) 제거 — Q&A 는 보관(비노출, 992) */
];

/* H1 — 이 자리에는 "AD / AdSense 320×64" 라고 적힌 점선 상자가 있었다.
   개발용 자리표시자가 그대로 프로덕션에 나가 있던 것으로, 사용자에게는
   광고가 실릴 자리가 아니라 **깨진 광고**로 보인다. 실제 슬롯
   (`app/components/ads/AdSlot.tsx`)으로 교체한다 — 등록 배너가 있으면 배너를,
   없으면 하우스 광고를, 둘 다 없으면 `null` 을 반환해 **빈 상자를 남기지 않는다.** */

export default async function ApplyPage() {
  const initial = await getInitialPayload();
  // 유료 플랜 광고 제거(H4) — 이 페이지는 force-dynamic 이라 세션을 읽어도 비용이 없다
  /* ISR 전환(2026-08-10): getAdViewer(세션 접근)는 페이지를 동적으로 되돌린다.
     광고 숨김은 plan={null} 경로의 AdFreeGate(클라이언트)가 처리. */

  return (
    /* [970 · C-28] 다른 동네이야기 카테고리와 같은 머리(브레드크럼 "동네이야기 › …" +
       카테고리 줄 + TownPageHead). /qna 와 함께 통일. */
    <PageShell breadcrumb="동네이야기 › 청약 센터" wide>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownHero href="/apply" />
      <TownCategoryNav stick />

      {/* [1030 · 3차] 예전 THEME_APPLY 인라인 style(--primary #1d4fd8 · --primary-soft #edf2fe 인라인 고정)를 뺐다 — 값은 전역 라이트 토큰과
          같아 라이트에선 차이가 없고, 다크에선 .dark 토큰(#5b8bff · #1a2540)을 덮어 "날짜별 캘린더 ›"·칩 글자가 어두운 파랑(대비 2.6:1),
          관련 데이터 아이콘 상자가 흰 하늘색으로 떴다(2026-10-04 운영 다크 캡처 · axe color-contrast 3곳). */}
      <div>
        {/* 상단 CTA — 예전의 정적 탭(전체·예정·접수 중·지난 청약)은 클릭해도 아무
            동작이 없는 장식이라 제거했다. 실동작 탭(경쟁률/특별공급)은 아래 검색 영역에 있다. */}
        {/* [1015] 제목 옆 "청약홈 실데이터" 부연 라벨과 아래 안내 띠("…예요. …확인하세요. 예측치는 만들지
            않습니다"), 오른쪽 레일의 "이 숫자를 읽는 법" 카드를 걷고 ⓘ 하나로 접었다(브리프 규칙 B·C).
            읽는 법(공고·주택형·순위별 행 · 단지명 미제공 행)과 출처는 그대로 시트 안에 있다. */}
        <div className="rise-in mt-4 mb-4 flex flex-wrap items-center gap-2 max-md:mb-3">
          <h2 className="flex items-center gap-0.5 t-section text-ink">
            청약 경쟁률 · 특별공급
            <Explain
              title="청약 경쟁률 · 특별공급"
              body={[
                "경쟁률·특별공급 표는 청약홈(한국부동산원) 공공데이터입니다. 접수 일정·공고 원문·청약 신청은 청약홈(applyhome.co.kr)에서 봅니다.",
                "당첨 가능성·안전마진 같은 예측치는 이 화면에서 만들지 않습니다.",
              ]}
              how={[
                "경쟁률은 공고 · 주택형(타입) · 순위별로 제공됩니다. 같은 단지가 타입 수만큼 여러 줄로 보이고, 한 줄의 경쟁률은 그 타입 하나의 값입니다.",
                "단지명이 ‘단지명 미제공’인 행은 공고 번호만 있는 경우입니다. 타입코드를 단지명처럼 보여 주지 않습니다.",
              ]}
              source="청약홈(한국부동산원) 공공데이터포털 · 조회 시점 기준, 실제 공고·결과는 청약홈 원문이 우선"
            />
          </h2>
          <div className="flex-1" />
          {/* [1030 · 4차 · 57] "청약 캘린더" 알약은 뺐다 — 머리글 오른쪽 버튼(TownHero heroCta)과 같은 행동이 한 화면 250px 안에 두 번 있었다
              (폰 실측). 접수 띠의 "날짜별 캘린더 ›"도 같은 곳으로 간다. */}
          <a
            href={APPLYHOME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="glass press rounded-full px-3.5 py-2 text-xs font-bold text-primary no-underline"
          >
            청약홈 공고 보기 ↗
          </a>
        </div>

        {/* [994 · D4] 오늘의 청약 — 매일 적재 저장소(기준일 표기). 검색보다 먼저, 사실이 먼저. */}
        <ApplyDailyStrip />

        <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* 본문 — 청약홈 실데이터 검색 (경쟁률/특별공급 탭 + 지역·단지명 + 더보기) */}
          <ApplySearchClient initial={initial} />

          {/* 우측 사이드 — 관련 링크 · 데이터 출처 · 광고 1 (브리프 규칙 F·G) */}
          <aside className="flex flex-col gap-3.5 max-md:gap-3">
            <div className="rise-in-4 card flex flex-col gap-1.5 p-[18px] max-md:p-3.5">
              <div className="t-body font-bold text-ink">관련 데이터</div>
              {CROSS_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="press flex items-center gap-2.5 rounded-xl px-2 py-2 no-underline hover:bg-primary-soft"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft">
                    <Icon name={l.icon} className="h-4 w-4 text-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block t-body font-bold text-ink">{l.label}</span>
                    <span className="block truncate t-sub text-text-3">{l.desc}</span>
                  </span>
                </Link>
              ))}
            </div>

            <p className="px-1 t-caption text-text-3">
              출처 청약홈(한국부동산원) 공공데이터포털 ·{" "}
              <Link href="/data-sources" className="font-bold text-primary no-underline">
                데이터 출처와 한계
              </Link>
            </p>

            <div className="rise-in-5">
              <AdZone
                placement="community_feed"
                seed={0}
                plan={null}
              />
            </div>
          </aside>
        </div>
        {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 청약·분양 표면 고지 */}
        <ComplianceNotice variant="market" className="mt-6" />
      </div>
    </PageShell>
  );
}
