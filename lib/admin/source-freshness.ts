import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

/* [개선 #24·#44, 2026-08-22] 데이터 소스 신선도 — 단일 판정 출처.
 *
 * (주의: lib/admin/data-freshness.ts 는 기존의 "인제스트 실행 결과 요약" 모듈로
 *  별개다 — 이 파일은 소스 테이블의 **마지막 적재 시각**만 잰다.)
 *
 * 실측 배경: 입주물량(apartment_supply)이 7/20 이후 한 달째 정지해 있었는데
 * 아무도 몰랐다 — 소스별 마지막 적재 시각을 한눈에 보는 곳이 없어서다.
 * 이 모듈이 각 소스의 최신 행 시각과 허용 임계(시간)를 함께 돌려주고,
 * /admin/freshness 화면과 /api/cron/freshness-watch 감시가 같은 판정을 쓴다.
 *
 * 임계는 각 소스의 **실제 갱신 설계 주기 × 여유 2배** 언저리 — 빠듯하면
 * 정상 지연이 경보가 되어 경보가 소음이 된다.
 */

export type SourceFreshnessRow = {
  key: string;
  label: string;
  /** 갱신 경로 설명 — 어디를 고쳐야 하는지 바로 알 수 있게 */
  pipeline: string;
  lastAt: string | null;
  thresholdHours: number;
  /** null = 시각 조회 실패(테이블 없음 등) — stale 과 구분 */
  ageHours: number | null;
  stale: boolean;
};

type SourceDef = {
  key: string;
  label: string;
  pipeline: string;
  table: string;
  column: string;
  /** [945] 같은 표에 성격이 다른 행이 섞일 때(자동/수동 글 등) 최신 시각을 가르는 필터 */
  filter?: { column: string; value: boolean | string | number };
  /** [1177] 조건이 둘 이상일 때(적재 기록에서 "이 출처 · 성공"만) */
  filters?: { column: string; value: boolean | string | number }[];
  thresholdHours: number;
};

const SOURCES: SourceDef[] = [
  {
    key: "news",
    label: "뉴스 자동수집",
    pipeline: "매일 08:00 KST 수집 세션 → ingest_daily_news",
    table: "news_articles",
    column: "created_at",
    thresholdHours: 36,
  },
  {
    key: "onbid",
    label: "온비드 공매",
    pipeline: "GitHub Actions etl.yml → /api/cron/onbid-sync (매일)",
    table: "onbid_auctions",
    column: "updated_at",
    thresholdHours: 48,
  },
  {
    key: "supply",
    label: "입주 예정 물량",
    pipeline: "etl.yml → /api/cron/supply-ingest (매일, 청약홈 분양공고)",
    /* [1177] apartment_supply.created_at 은 1,036행 전부 비어 있다(운영 2026-11-14 · 적재가 그 칸을 채우지 않는다).
       그래서 "마지막 확인 불가"가 매일 울렸는데 적재는 매일 성공하고 있었다(적재 기록 11-13 ok).
       마지막 성공 적재 시각을 적재 기록에서 읽는다. */
    table: "market_ingest_log",
    column: "created_at",
    filters: [
      { column: "source", value: "applyhome" },
      { column: "status", value: "ok" },
    ],
    thresholdHours: 48, // 매일 도는 적재 — 이틀 넘게 성공 기록이 없으면 이상
  },
  {
    key: "applyhome",
    label: "청약 공고·경쟁률",
    pipeline: "etl.yml → /api/cron/supply-ingest 가 함께 적재 (매일)",
    table: "applyhome_announcements",
    column: "updated_at",
    thresholdHours: 48,
  },
  {
    key: "redevelopment",
    label: "서울 도시계획 조서",
    pipeline: "etl.yml → /api/cron/redevelopment-ingest (SEOUL_DATA_API_KEY) · [1029] 서울 UPIS 결정 조서",
    table: "seoul_upis_records",
    column: "fetched_at",
    thresholdHours: 48,
  },
  {
    key: "market_index",
    label: "시세 지수 (부동산원)",
    pipeline: "etl.yml → reb-ingest (매일)",
    /* [1177] market_price_indices(서울 광역 지수 전용)는 0행이다(운영 2026-11-14 · 적재 기록 seoulIdx=0).
       화면이 실제로 읽는 것은 구 단위 시계열(market_region_series)이고 그쪽은 매일 갱신된다.
       빈 표를 보고 울리던 경보를, 화면이 쓰는 표의 마지막 갱신으로 바꾼다. */
    table: "market_region_series",
    column: "updated_at",
    filter: { column: "source", value: "reb" },
    thresholdHours: 72, // 매일 도는 적재 — 사흘 넘게 갱신이 없으면 이상
  },
  {
    key: "molit_tx",
    label: "실거래 (국토부)",
    pipeline: "etl.yml → molit-transactions-ingest (매일)",
    table: "market_transactions",
    column: "created_at",
    thresholdHours: 72,
  },
  {
    /* [945 · 실사용50 #7] 동네 뉴스 자동 수집 — 자동 글의 최신 시각만 본다.
       사람 글이 섞이면 수집이 죽어도 초록불이 되므로 filter 로 가른다. */
    key: "town_news",
    label: "동네 뉴스 자동 수집",
    pipeline: "외부 자동화 → ingest_daily_news RPC (매일)",
    table: "board_posts",
    column: "created_at",
    filter: { column: "is_automated", value: true },
    thresholdHours: 24 * 4,
  },
  {
    key: "temperature",
    label: "시장 온도 주간 스냅샷",
    pipeline: "etl.yml → market-temperature-snapshot (주간)",
    table: "market_temperature_snapshot",
    column: "created_at",
    thresholdHours: 24 * 10,
  },
];

export async function loadSourceFreshness(): Promise<SourceFreshnessRow[]> {
  const sb = getServiceSupabase();
  const now = Date.now();
  return Promise.all(
    SOURCES.map(async (s) => {
      let lastAt: string | null = null;
      if (sb) {
        try {
          let q = sb
            .from(s.table)
            .select(s.column)
            .order(s.column, { ascending: false })
            .limit(1);
          for (const f of [...(s.filter ? [s.filter] : []), ...(s.filters ?? [])]) q = q.eq(f.column, f.value);
          /* [1177] 빈 값은 건너뛴다 — 내림차순 정렬은 빈 값을 맨 앞에 두어 "확인 불가"로 읽혔다 */
          q = q.not(s.column, "is", null);
          const { data } = await q.maybeSingle();
          const raw = (data as Record<string, unknown> | null)?.[s.column];
          lastAt = typeof raw === "string" ? raw : null;
        } catch {
          lastAt = null;
        }
      }
      const ageHours = lastAt ? (now - Date.parse(lastAt)) / 3_600_000 : null;
      return {
        key: s.key,
        label: s.label,
        pipeline: s.pipeline,
        lastAt,
        thresholdHours: s.thresholdHours,
        ageHours: ageHours !== null && Number.isFinite(ageHours) ? ageHours : null,
        /* 시각을 못 읽은 것도 stale 로 본다 — "모름"을 초록불로 칠하면
           이번 입주물량 사각지대가 그대로 반복된다. */
        stale: ageHours === null || !Number.isFinite(ageHours) || ageHours > s.thresholdHours,
      };
    }),
  );
}
