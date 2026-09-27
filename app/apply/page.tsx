import type { Metadata } from "next";
import { ApplyDailyStrip, applyWeek, loadApplyDaily } from "./ApplyDailyStrip";
import { PageShell } from "@/app/components/PageShell";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero, TownSources } from "@/app/town/TownHero";
import { THEME_APPLY } from "@/lib/theme/presets";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { ApplySearchClient } from "./ApplySearchClient";
import type { ApplyInitialResult } from "./ApplySearchClient";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

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
   바꾼 것: 테마 래핑, seoAlternates, 실패 원인 보존, 카테고리 연동 사이드, 요약 타일(클라이언트).

   [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 머리(제목 + 7일 접수 수 + "청약 캘린더 보기") → 카테고리 탭 →
   앞으로 7일 접수(1px 선 행) → 주인공: 경쟁률·특별공급 검색과 표 → 맨 끝 "데이터 출처" 접힘 → 수익 문구 고지.
   지운 것: 네이비 히어로 · 본문 h2 + 출처 부제 · 칩 두 개(캘린더 → 머리, 청약홈 → 데이터 출처) · 파랑 안내 상자 ·
   오른쪽 사이드("이 숫자를 읽는 법" → 데이터 출처) · 하우스 광고(AdZone) · 요약 타일 3칸(클라이언트).
   요약 타일(클라이언트) 의 v4 정리는 ApplySearchClient 주석. */

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

/* 연동(#225) 의 CROSS_LINKS(입주 물량·공매·정비사업 아이콘 3개 나열)는 [1012] 에서 뺐다 —
   "아이콘 3개 나열 섹션"은 AI 신호 5번이고, 같은 세 입구가 바로 위 카테고리 줄(TownCategoryNav)에
   숫자 없이 서 있는 것과 중복이었다. */

/* H1 — 이 자리에는 "AD / AdSense 320×64" 라고 적힌 점선 상자가 있었다.
   개발용 자리표시자가 그대로 프로덕션에 나가 있던 것으로, 사용자에게는
   광고가 실릴 자리가 아니라 **깨진 광고**로 보인다. 실제 슬롯
   (`app/components/ads/AdSlot.tsx`)으로 교체한다 — 등록 배너가 있으면 배너를,
   없으면 하우스 광고를, 둘 다 없으면 `null` 을 반환해 **빈 상자를 남기지 않는다.**
   [v4 · 규칙 9] 그 슬롯(AdZone)도 이 화면에서 뺐다 — 자사 안내 카드는 주 화면에 두지 않는다. */

export default async function ApplyPage() {
  /* [v4] 오늘의 청약(캘린더 요약·최근 경쟁률)은 페이지가 한 번 읽어 머리 사실 줄과 목록이 같은 값을 쓴다 */
  const [initial, daily] = await Promise.all([getInitialPayload(), loadApplyDaily()]);
  // 유료 플랜 광고 제거(H4) — 이 페이지는 force-dynamic 이라 세션을 읽어도 비용이 없다
  /* ISR 전환(2026-08-10): getAdViewer(세션 접근)는 페이지를 동적으로 되돌린다.
     광고 숨김은 plan={null} 경로의 AdFreeGate(클라이언트)가 처리. */
  /* [v4 · 규칙 9] 하우스 광고(AdZone)는 이 화면에서 뺐다 — 위 주석은 기록으로 남긴다. */
  const week = applyWeek(daily.cal);
  /* 아래 청약홈 경쟁률 표가 첫 화면에 결과를 그리는가 — 그러면 저장소의 "최근 발표 경쟁률"은 싣지 않는다(같은 사실은 한 번) */
  const searchShowsRows = initial.ok && initial.payload.mode === "live" && (initial.payload.items?.length ?? 0) > 0;

  return (
    /* [970 · C-28] 다른 동네이야기 카테고리와 같은 머리. [v4] 브레드크럼 문자열("동네이야기 › 청약 센터")은
       바로 아래 제목·카테고리 탭과 같은 말이라 뺐다(같은 사실은 한 번). */
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        {/* [v4 · 규칙 1] 머리 — 제목 + 사실 한 줄(앞으로 7일 접수 시작·마감 수, 0 이면 빠진다) + 작은 "청약 캘린더 보기"
            (카탈로그 heroCta — 예전 본문 칩 "청약 캘린더 보기"·스트립 "날짜별 캘린더 보기"와 같은 곳이라 하나로) */}
        <TownHero
          href="/apply"
          stats={[
            { label: "7일 안 접수 시작", value: week.starts, unit: "건" },
            { label: "마감", value: week.ends, unit: "건" },
          ]}
        />
        {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
        <TownCategoryNav stick />

        <div style={THEME_APPLY} className="flex flex-col gap-8">
          {/* [994 · D4] 오늘의 청약 — 매일 적재 저장소(기준일 표기). 검색보다 먼저, 사실이 먼저. */}
          <ApplyDailyStrip data={daily} showCompetition={!searchShowsRows} />

          {/* 주인공 — 청약홈 실데이터 검색(경쟁률/특별공급 밑줄 탭 + 지역·단지명 + 표 + 더보기). 채움 파랑은 [공고 검색] 하나 */}
          <ApplySearchClient initial={initial} />

          {/* [v4 · 규칙 3] 예전 파랑 안내 상자("경쟁률·특별공급 표는 청약홈 공공데이터예요 …")와 오른쪽 사이드
              카드("이 숫자를 읽는 법" 세 문단)를 맨 끝 "데이터 출처" 접힘 하나로 모았다 — 문장은 사실 명사로 줄였다 */}
          <TownSources>
            <p>경쟁률·특별공급·접수 일정 — 청약홈(한국부동산원) 공공데이터 · 조회 시점 기준 · 실제 공고·결과는 청약홈 원문 우선</p>
            <p>경쟁률은 공고 · 주택형(타입) · 순위별 — 같은 단지가 타입 수만큼 여러 줄, 한 줄 = 그 타입 하나의 경쟁률</p>
            {/* [1011] "청약홈 분양정보(상세) API 승인 대기 상태라" 를 걷었다(소유자 지시) — 읽는 사람에게 필요한 사실은
                "이 행은 단지명을 아직 못 받았다"와 "지어내지 않는다" 둘이다. */}
            <p>&ldquo;단지명 미제공&rdquo; 행 — 단지명 미확보 · 공고 번호만 있음(타입코드를 단지명처럼 보이지 않음)</p>
            <p>당첨 가능성·안전마진 같은 예측치 없음</p>
            <p>
              접수 일정·공고 원문·청약 신청 —{" "}
              <a
                href={APPLYHOME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-line font-bold text-primary no-underline"
              >
                청약홈(applyhome.co.kr) ↗
              </a>
            </p>
          </TownSources>

          {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 청약·분양 표면 고지 */}
          <ComplianceNotice variant="market" />
        </div>
      </div>
    </PageShell>
  );
}
