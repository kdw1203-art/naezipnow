import "server-only";
/**
 * 전국 공동주택 단지 마스터 ETL
 * ─────────────────────────────────────────────────────────────────────
 * 국토교통부 공동주택 단지목록 API(AptListService2/getAptList)를 시군구 단위로
 * 페이징 조회해 `apartment_complexes` 테이블에 병합 upsert 한다.
 *
 * ── #150: 왜 적재 대상이 바뀌었나 ────────────────────────────────────
 * 이 모듈은 원래 `complexes` 테이블에 upsert 했다. **그 테이블은 운영 DB에 없다.**
 * PostgREST 는 없는 테이블에 대해 예외가 아니라 error 객체를 돌려주고, 아래 코드는
 * 그걸 logger.warn 으로만 남겼기 때문에 크론은 매번 200 OK 를 반환하면서
 * 한 행도 쓰지 않았다. 어드민 "데이터 신선도" 대시보드의 apt-master 카드는
 * 이미 apartment_complexes 를 보고 있었으므로, 카드가 안 움직이는 것이 유일한
 * 증상이었다 — 그리고 그건 "API 키가 없나 보다" 로 오인하기 딱 좋은 증상이다.
 *
 * ── 병합 upsert 인 이유(중요) ────────────────────────────────────────
 * apartment_complexes 의 source_key='k-apt-basic' 행 21,658건은 이미
 * roadAddress · heating · manageType · saleType · approvalDate 를 100% 채우고 있다.
 * 이 다섯 필드는 **단지 기본정보 API(AptBasisInfoService2/getAptsaleInfo)** 에서만
 * 나오고 여기서 쓰는 **단지 목록 API** 에는 아예 없다. 그래서 평범한 upsert 로
 * metadata 를 통째로 치환하면 21,658건의 난방·분양·관리 정보가 조용히 사라진다.
 * 그 사고를 코드 리뷰가 아니라 DB 가 막도록, 병합만 하는 RPC 를 통해서만 쓴다:
 *   public.upsert_apartment_complexes(rows jsonb)
 *   → metadata = 기존 || 신규, 신규의 null·빈 문자열 키는 병합 전에 제거.
 * (마이그레이션: upsert_apartment_complexes_merge)
 *
 * - 멱등: (source_key, external_id) 유니크 충돌 시 병합 → 재실행 안전.
 * - 환경 게이트: DATA_GO_KR 인증키 미설정 시 API가 mock/empty 를 반환하므로
 *   upsert 0건으로 안전하게 no-op 한다(예외 없음).
 * - 실패는 삼키지 않고 failed 카운트로 **올려보낸다** — 호출부(크론)가 이걸로
 *   market_ingest_log.status='error' 를 낼 수 있어야 하기 때문이다(F3/#147).
 */
import {
  fetchAptComplexDetail,
  fetchAptComplexList,
} from "@/lib/national-data/apartment-api";
import type { AptComplex, AptComplexDetail } from "@/lib/national-data/apartment-api";
import { getAllSido, getSigunguBySido } from "@/lib/national-data/region-codes";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { APT_MASTER_SOURCE_KEY } from "@/lib/complex/apartment-master";
import { orderSigunguByStaleness } from "@/lib/national-data/sigungu-rotation";

const NUM_OF_ROWS = 100;
const MAX_PAGES = 20;
/** [982] 목록 호출 간 간격(ms) — 상세 경로(DETAIL_DELAY_MS)와 같은 이유다 */
const LIST_DELAY_MS = 120;
const UPSERT_BATCH = 200;

/* apartment_complexes.source_key — 이 ETL 이 소유하는 네임스페이스.
   값의 단일 출처는 lib/complex/apartment-master.ts 다(조회 측에서도 같은 값으로
   스코프해야 하는데, 그쪽이 이 ETL 모듈을 import 하면 공공데이터 API 클라이언트가
   페이지 번들에 딸려온다). 기존 import 경로를 깨지 않으려고 여기서 재export 한다. */
export { APT_MASTER_SOURCE_KEY };

/**
 * 전국 실제 시군구 코드 목록.
 * getAllSido().flatMap(getSigunguBySido) 에서 시도 레벨 행(sigungu === sido)과
 * "000"으로 끝나는 코드를 제외하고, sigunguCd 오름차순으로 정렬(결정적 순서).
 */
export function listAllSigunguCodes(): {
  sigunguCd: string;
  sido: string;
  sigungu: string;
}[] {
  return getAllSido()
    .flatMap(getSigunguBySido)
    .filter((i) => i.sigungu !== i.sido && !i.sigunguCd.endsWith("000"))
    .map((i) => ({ sigunguCd: i.sigunguCd, sido: i.sido, sigungu: i.sigungu }))
    .sort((a, b) => a.sigunguCd.localeCompare(b.sigunguCd));
}

/** 공백만 있는 값은 없는 값으로 본다(빈 문자열로 좋은 값을 덮지 않기 위해). */
function clean(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * 사용승인일 → YYYYMMDD.
 * 기존 행은 "19880116" 형태이고 complex-store 의 준공연도 추출이
 * `/^\d{8}$/` 로 검사한다(lib/complex/complex-store.ts). 8자리로 못 만들면
 * 키 자체를 넣지 않는다 — 형식이 어긋난 값은 준공연도를 조용히 null 로 만든다.
 */
function toApprovalDate(v: string | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function toPositiveInt(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** null 값을 제거한 얕은 객체 — RPC 도 한 번 더 걸러 주지만 전송량을 줄인다. */
function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/**
 * AptComplex → upsert_apartment_complexes RPC 행. 저장 불가(코드/이름 없음)면 null.
 *
 * metadata 키 이름은 **기존 21,658행의 모양을 그대로 따른다**. 같은 뜻의 값이
 * kaptCode/kapt_code 두 이름으로 섞이면 매칭하는 쪽(complex-store 의 D7 enrich)이
 * 어느 쪽을 봐야 하는지 알 수 없게 된다.
 *
 * ── householdCount 를 여기서 쓰지 않는 이유 (2026-07-28) ────────────────────
 * 예전에는 목록 API 의 hhldCnt 를 그대로 실었다. 이 값이 "상당수 과대하다"는 건
 * 이 주석에도 이미 적혀 있었고, 그래서 화면 쪽(complex-store)은 안 쓰고 있었다.
 * 그런데 그 뒤 complex_tx_stats 집계가 이 키를 읽기 시작하면서 결국 지도 단지
 * 패널·단지 홈의 "세대수"와 지도 세대수 필터로 흘러갔다.
 *
 * 실측(2026-07-28): 상세 조회가 성공한 행은 중앙값 437세대·최댓값 12,330세대로
 * 실제와 맞는다(최댓값이 올림픽파크포레온 12,032와 일치). 반면 상세를 못 받아
 * 목록 값이 그대로 남은 569행은 중앙값 4,840·최댓값 41,680이었다 —
 * "16개 동에 41,680세대" 같은 값이 화면에 나가고 필터에도 걸렸다.
 *
 * 믿을 수 있는 건 상세(fetchAptComplexDetail)가 준 값뿐이다. 목록 단계에서는
 * 아예 쓰지 않는다. 상세를 못 받은 단지는 세대수를 "모르는" 상태로 두는 게
 * 맞다 — 틀린 수를 적어 두면 사용자는 그걸 확인된 값으로 읽는다.
 * (이미 저장된 잘못된 값은 마이그레이션 20260728120000 에서 격리했다.)
 */
function toRpcRow(c: AptComplex, fallbackLawdCd: string): Record<string, unknown> | null {
  const kaptCode = clean(c.kaptCode);
  const name = clean(c.kaptName);
  if (!kaptCode || !name) return null;

  const sido = clean(c.as1);
  const sigunguRaw = clean(c.as2);
  /* 세종특별자치시는 시군구 층위가 없어 K-apt as2 가 빈다(2026-08-10 실측:
     대장 216행 전부 세종 — 목록에서 지역이 빈칸으로 보였다). 법정동코드 36110 의
     시군구명 슬롯은 "세종특별자치시" 그 자체이므로 표시용 sigungu 는 시도명으로
     채운다. regionLabel 은 원값(sigunguRaw)으로 만들어 "세종 세종 조치원읍"
     같은 중복 표기를 피한다. 기존 216행은 마이그레이션이 같은 규칙으로 채웠다. */
  const sigungu =
    sigunguRaw ?? (sido && sido.endsWith("특별자치시") ? sido : undefined);
  const emd = clean(c.as3);
  const jibun = clean(c.as4);
  const lawdCd = clean(c.sigunguCd) ?? clean(fallbackLawdCd);

  const regionLabel = [sido, sigunguRaw, emd].filter(Boolean).join(" ") || null;
  const address = jibun ?? regionLabel;

  return {
    source_key: APT_MASTER_SOURCE_KEY,
    external_id: kaptCode,
    name,
    address,
    lawd_cd: lawdCd,
    metadata: compact({
      name,
      sido,
      sigungu,
      emd,
      lawdCd,
      kaptCode,
      regionLabel,
      jibunAddress: jibun,
      approvalDate: toApprovalDate(c.kaptUsedate),
      buildingCount: toPositiveInt(c.kaptDongCnt),
      // householdCount 는 상세(toDetailPatch)에서만 채운다 — 위 주석 참고.
    }),
  };
}

export interface AptIngestResult {
  /** RPC 가 실제로 insert/update 한 행 수 */
  upserted: number;
  /**
   * API 에서 읽어 저장 가능한 형태로 만든 행 수(단지코드 기준 중복 제거 후).
   *
   * [971] upserted 만으로는 "이미 최신이라 바꿀 게 없었다"와 "한 건도 못 읽었다"가
   * 구별되지 않았다. 둘 다 0 이고, 크론은 둘 다 skipped 로 적었다. 그래서 대장이
   * 다 채워진 뒤로 매일 "건너뜀" 만 쌓였고, 그 사이에 **읽기 자체가 0 인 시군구**
   * (울산 중구·대전 중구·대전 서구 — 대장에 단 한 행도 없다)가 묻혔다.
   */
  fetched: number;
  /** API 가 보고한 해당 시군구 전체 단지 수 */
  totalCount: number;
  /** 실제로 읽은 페이지 수 */
  pages: number;
  /** 적재하지 못한 행 수 (RPC 오류 배치의 크기 합) */
  failed: number;
  /** 첫 오류 메시지 — 크론 로그에 남길 용도 */
  error?: string;
}

/**
 * 단일 시군구의 단지목록을 페이징 조회 후 apartment_complexes 에 배치 병합 upsert.
 * 절대 throw 하지 않음 — 실패는 failed/error 로 반환해 호출부가 판단하게 한다.
 */
export async function ingestAptMasterForSigungu(
  sigunguCd: string,
  opts?: { maxPages?: number; numOfRows?: number },
): Promise<AptIngestResult> {
  const maxPages = opts?.maxPages ?? MAX_PAGES;
  const numOfRows = opts?.numOfRows ?? NUM_OF_ROWS;

  let upserted = 0;
  let fetched = 0;
  let totalCount = 0;
  let pages = 0;
  let failed = 0;
  let error: string | undefined;

  try {
    const sb = getServiceSupabase();

    // 단지코드 기준 중복 제거(같은 배치 내 ON CONFLICT 이중 갱신 방지).
    const byKaptCode = new Map<string, Record<string, unknown>>();

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      /* [982] strict — HTTP 실패를 "빈 시군구"로 위장하지 않는다.
         페이지 사이에 짧은 간격을 둔다: 예전에는 목록 호출에 지연이 0 이라
         한 실행이 12시군구 × 최대 20페이지 = 240회를 연속으로 때렸다(상세 경로에는
         이미 60ms 간격이 있었다). 슬라이스 전체가 한꺼번에 비는 실패 모양이
         한도 초과와 정확히 일치한다. */
      if (pageNo > 1) await new Promise((r) => setTimeout(r, LIST_DELAY_MS));
      const { complexes, totalCount: tc, mode } = await fetchAptComplexList({
        sigunguCd,
        pageNo,
        numOfRows,
        strict: true,
      });
      pages = pageNo;
      totalCount = tc;

      if (complexes.length === 0) break; // mock/empty 또는 마지막 페이지

      for (const c of complexes) {
        const row = toRpcRow(c, sigunguCd);
        if (row) byKaptCode.set(row.external_id as string, row);
      }

      if (mode === "mock") break; // 키 미설정 — 안전 no-op
      if (pageNo * numOfRows >= tc) break; // 전체 수집 완료
    }

    const rows = [...byKaptCode.values()];
    fetched = rows.length;
    if (sb && rows.length > 0) {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const chunk = rows.slice(i, i + UPSERT_BATCH);
        const { data, error: rpcError } = await sb.rpc("upsert_apartment_complexes", {
          rows: chunk,
        });
        if (rpcError) {
          failed += chunk.length;
          error ??= rpcError.message;
          logger.warn("[apt-ingest] upsert 실패", {
            sigunguCd,
            rows: chunk.length,
            message: rpcError.message,
          });
        } else {
          // RPC 는 실제 반영 건수를 돌려준다. chunk.length 를 그대로 세면
          // 유효성 검사에서 걸러진 행까지 "적재됨"으로 보고하게 된다.
          upserted += Number(data) || 0;
        }
      }
    }
  } catch (err) {
    failed += 1;
    error ??= err instanceof Error ? err.message : String(err);
    logger.warn("[apt-ingest] ingest 실패", { sigunguCd, err });
  }

  return { upserted, fetched, totalCount, pages, failed, ...(error ? { error } : {}) };
}

/**
 * 주어진 시군구 코드들을 순차(딜레이 없음) 처리하며 카운트 합산.
 * 슬라이스 크기로 호출량을 bound 해 rate limit 을 존중한다.
 */
/**
 * 다음에 훑을 시군구 고르기 — **가장 오래 안 본 것부터**.
 *
 * [982] 예전에는 시계로 골랐다: `floor(now/12h) % ceil(total/12)`.
 * 하루 한 번 같은 시각에 도는 크론에서는 이 값이 매일 **2씩** 올라가므로
 * 짝수 슬라이스만 방문하고 홀수 11개(≈132개 시군구)는 **영원히 안 돈다**.
 * 적재 로그가 그대로였다 — 09-06 slice=0, 09-07 slice=2, 09-08 slice=4, 09-09 slice=6.
 *
 * 그래서 순서를 데이터가 정하게 한다:
 *   ① 대장에 **한 행도 없는** 시군구 (한 번도 못 받았거나 전부 실패) — 최우선
 *   ② 그다음은 마지막 갱신이 오래된 순
 * 커서 테이블이 없어도 되고(데이터 자체가 커서다), 빠진 지역이 저절로 앞으로 온다.
 * 실패해서 안 채워진 시군구는 다음 실행에서 다시 1순위가 된다 — 자기 치유.
 *
 * 조회가 실패하면 null 을 돌려준다. 호출부는 그때만 예전 시계 방식으로 떨어진다
 * — 조회 실패를 "빈 목록"으로 바꾸면 크론이 아무 일도 안 하고 성공처럼 보인다.
 */
export async function pickStalestSigungu(limit: number): Promise<string[] | null> {
  const all = listAllSigunguCodes().map((c) => c.sigunguCd);
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("apt_master_sigungu_freshness")
    .select("lawd_cd,last_update");
  if (error) {
    logger.warn(`[apt-master] 신선도 조회 실패 — 시계 순환으로 떨어집니다: ${error.message}`);
    return null;
  }
  const seen = new Map<string, number>();
  for (const r of (data ?? []) as { lawd_cd: string; last_update: string | null }[]) {
    const t = r.last_update ? Date.parse(r.last_update) : NaN;
    seen.set(r.lawd_cd, Number.isFinite(t) ? t : 0);
  }
  return orderSigunguByStaleness(all, seen).slice(0, limit);
}


export async function ingestAptMasterBatch(sigunguCds: string[]): Promise<{
  sigungu: number;
  /** 읽어서 저장 가능한 형태로 만든 행 수 합 */
  fetched: number;
  upserted: number;
  failed: number;
  /** [971] 한 행도 못 읽은 시군구 코드 — 수집 구멍이 여기서 드러난다. */
  empty: string[];
  errors: string[];
}> {
  let sigungu = 0;
  let fetched = 0;
  let upserted = 0;
  let failed = 0;
  const empty: string[] = [];
  const errors: string[] = [];
  for (const cd of sigunguCds) {
    /* 시군구 사이에도 간격을 둔다 — 12곳을 쉬지 않고 때리면 뒤쪽이 통째로 막힌다 */
    if (sigungu > 0) await new Promise((r) => setTimeout(r, LIST_DELAY_MS));
    const res = await ingestAptMasterForSigungu(cd);
    fetched += res.fetched;
    upserted += res.upserted;
    failed += res.failed;
    if (res.fetched === 0 && res.failed === 0) empty.push(cd);
    if (res.error && errors.length < 3) errors.push(`${cd}: ${res.error}`);
    sigungu += 1;
  }
  return { sigungu, fetched, upserted, failed, empty, errors };
}

/* ══════════════════════════════════════════════════════════════════════
   단지 기본정보(AptBasisInfoService2) 상세 백필 — D7 잔여 과제
   ──────────────────────────────────────────────────────────────────────
   위 마스터 ETL 이 쓰는 단지 목록 API 에는 좌표·주차·건설사가 없다. 그 값들은
   단지 기본정보 API(getAptsaleInfo)에만 있는데, 지금까지는 읽기 경로
   (/api/apt/complexes/[kaptCode])에서만 조회하고 DB 에는 아무도 되쓰지 않아
   단지 허브와 지도가 계속 데이터 빈곤 상태였다. 여기서 하루 N건씩(기본 50)
   미보강 행을 골라 상세를 받아 metadata 에 병합한다.

   - 멱등/커서: 시도한 행에 metadata.detailFetchedAt 을 찍고, 선택 쿼리가
     detailFetchedAt 이 없는 행만 고른다(external_id 오름차순 — 결정적 순서).
     별도 커서 테이블 없이 매 실행이 이어달리기가 된다.
   - 실패 처리: 상세가 안 오는 단지(miss)도 스탬프를 찍는다 — 안 찍으면 같은
     50건이 매일 다시 뽑혀 파이프라인이 영원히 멈춘다. 단, 한 배치에서 성공이
     0건이면 API 장애일 가능성이 높으므로 아무 행에도 찍지 않고 error 로
     올려보낸다(장애날 50건을 miss 로 낙인찍지 않기 위해).
   - 쓰기는 마스터 ETL 과 같은 병합 RPC(upsert_apartment_complexes)만 쓴다 —
     통째 치환으로 기존 키를 지우는 사고를 DB 가 막게 하기 위해서다(위 주석 참조).
   - 지도 좌표 캐시(complex_geocode)에는 여기서 쓰지 않는다. 그 테이블의 키는
     실거래 이름 (region_name="서울 송파구", complex_name="리센츠") 인데 대장의
     이름은 "잠실리센츠"·"서울특별시" 꼴이라 키가 맞지 않는다 — 대장 이름으로
     행을 넣으면 지도 조회(getCachedCoordMap)에 절대 걸리지 않는 죽은 행만 쌓인다.
     대장 좌표는 metadata.lat/lng 로 저장하고, 단지 허브가 D7 이름 매칭을 통해
     소비한다(lib/complex/complex-store.ts). 실거래 키 → 좌표는 기존
     geocode-complexes 크론(네이버 지오코딩)이 계속 담당한다.
   ══════════════════════════════════════════════════════════════════════ */

/** 상세 API 호출 간 지연(ms) — 공공 API 를 정중하게 호출한다. */
const DETAIL_DELAY_MS = 60;

/**
 * 상세 조회 동시 실행 수.
 *
 * 2026-07-27: 예전엔 `for … await` 로 완전 순차였다. fetchAptComplexDetail 은
 * 단지 하나당 API 를 두 번(기본정보 V4 + 상세 V4) 부르므로 200개 배치면
 * **왕복 400회가 한 줄로** 늘어섰고, 회당 0.5초만 잡아도 200초 — 예산(270초)에
 * 거의 다 쓰여 한 라운드가 200개를 못 채우고 잘렸다. 그 결과 3만 9천 단지 중
 * 3,404개(8.6%)만 상세가 채워진 채 몇 달이 지났고, 지도 상세의 세대수가 "—" 로
 * 비어 보였다.
 *
 * 동시성 메모(2026-07-29): 6으로 두면 data.go.kr 은 버티지만 Supabase Micro 의
 * statement_timeout / Postgres ERROR 비율이 치솟았다(Reports Postgres 477/585).
 * 2로 낮춰 DB 쓰기·PostgREST 부하를 먼저 줄인다. 백필이 느려지더라도
 * 사이트 조회(API Gateway)가 깨지는 편이 더 비싸다. 인스턴스를 키운 뒤 다시 올려도 된다.
 */
const DETAIL_CONCURRENCY = 2;

/**
 * 동시 실행 수를 제한한 map. 입력 순서대로 결과를 돌려준다.
 * (외부 의존성을 새로 들이지 않으려고 직접 둔다 — 하는 일이 이게 전부다.)
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 위경도 검증 — 한반도 밖 좌표는 버린다. 좌표는 지도에 바로 찍히는 값이라
 * (adapters.ts 의 molit-geocoder 주석과 같은 이유) 오염 위험이 가장 높다.
 */
function toKoreaCoord(
  latRaw: string | undefined,
  lngRaw: string | undefined,
): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

/**
 * AptComplexDetail → metadata 병합 패치.
 * 키 이름은 기존 행의 모양을 따른다(roadAddress·heating·manageType·approvalDate 는
 * 이미 21,658행에 있는 키). 새로 들어가는 키는 builder·parkingCount·elevatorCount·
 * lat·lng 뿐이며, 좌표는 lat·lng 둘 다 유효할 때만 넣는다(한쪽만 있는 좌표는 좌표가 아니다).
 */
function toDetailPatch(d: AptComplexDetail): Record<string, unknown> {
  const coord = toKoreaCoord(d.lat, d.lng);
  return compact({
    roadAddress: clean(d.doroJuso),
    heating: clean(d.heatSplyMthdCd),
    manageType: clean(d.kaptMgrStle),
    builder: clean(d.kaptdaNm),
    parkingCount: toPositiveInt(d.parkingLotCnt),
    elevatorCount: toPositiveInt(d.elevCnt),
    approvalDate: toApprovalDate(d.kaptUsedate),
    buildingCount: toPositiveInt(d.kaptDongCnt),
    householdCount: toPositiveInt(d.hhldCnt),
    lat: coord?.lat ?? null,
    lng: coord?.lng ?? null,
  });
}

/**
 * 같은 행이 이만큼 연속으로 상세를 못 받으면 성공이 0건이어도 커서를 넘긴다.
 *
 * [971] 왜 필요했나: 아래 "성공 0건이면 스탬프를 찍지 않는다" 규칙은 API 장애날
 * 배치 전체를 miss 로 낙인찍지 않으려는 안전장치였는데, **상세가 영영 안 오는
 * 행**에는 덫이 된다. 실제로 A10019968·A10019969·A10019970·A10019977 네 행이
 * 남아 매 실행 이 넷만 뽑히고 → 전부 miss → 성공 0건 → 스탬프 없음 → 다음 실행도
 * 같은 넷. 그 결과 백필이 몇 달째 "처리=4 병합=0 실패=4" 로 멈춰 있었고 매일
 * error 로그가 하나씩 쌓였다(신선도 경보의 상수항).
 *
 * 3회로 잡은 이유: 크론은 하루 한 번 돈다. 공공 API 가 사흘 연속 죽어 있는 일은
 * 드물고, 그런 날이 와도 잃는 건 그 행들이 miss 로 넘어가는 것뿐이다 —
 * retryAptDetailMissBatch 가 miss 를 계속 다시 두드리므로 영구 손실이 아니다.
 */
const DETAIL_POISON_ATTEMPTS = 3;

export interface AptDetailEnrichResult {
  /** 상세 조회를 시도한 행 수 */
  processed: number;
  /** 상세를 받아 metadata 에 병합한 행 수 */
  enriched: number;
  /** 상세를 받지 못한 행 수(miss + RPC 실패) */
  failed: number;
  /** 그중 **쓰기**가 실패한 수. miss(아직 없음)와 고장을 구분하려고 따로 센다. */
  rpcFailed?: number;
  /** 시도 상한에 걸려 miss 로 넘긴 행 수([971] 독성 행 탈출) */
  stalled?: number;
  /** 배치를 아예 시작하지 못한 사유 */
  skipped?: "no-service" | "no-rows";
  /** 어느 배치였나 — 신규 백필인지 miss 재시도인지 로그에서 구분하기 위해 */
  mode?: "backfill" | "retry-miss";
  /** 첫 오류 메시지들(최대 3) — 크론 로그용 */
  errors: string[];
}

/**
 * 미보강 단지 상세 백필 배치. 절대 throw 하지 않음 — 마스터 ETL 과 같은 계약으로
 * 실패를 failed/errors 로 반환해 호출부(크론)가 적재 로그 status 를 판단한다.
 */
export async function enrichAptDetailBatch(limit: number): Promise<AptDetailEnrichResult> {
  const sb = getServiceSupabase();
  if (!sb) {
    return { processed: 0, enriched: 0, failed: 0, skipped: "no-service", mode: "backfill", errors: [] };
  }

  // external_id(=kaptCode)는 k-apt-basic 네임스페이스에서 항상 채워져 있다
  // (마스터 ETL 의 toRpcRow 가 kaptCode 없는 행을 저장하지 않는다).
  const { data, error: selectError } = await sb
    .from("apartment_complexes")
    .select("external_id, name, address, lawd_cd, metadata")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .is("metadata->detailFetchedAt", null)
    .order("external_id", { ascending: true })
    .limit(limit);
  if (selectError) {
    return { processed: 0, enriched: 0, failed: limit, mode: "backfill", errors: [selectError.message] };
  }
  const rows = (data as AptDetailRow[] | null) ?? [];
  if (rows.length === 0) {
    return { processed: 0, enriched: 0, failed: 0, skipped: "no-rows", mode: "backfill", errors: [] };
  }

  return runDetailBatch(sb, rows, "backfill");
}

/**
 * 상세를 못 받았던 단지(detailStatus='miss')를 다시 두드리는 배치.
 *
 * [971] 왜: 지금 1,158 행이 miss 로 남아 있는데 아무도 다시 안 본다. 원래 배치는
 * detailFetchedAt 이 **없는** 행만 고르기 때문이다(스탬프가 커서니까 당연하다).
 * 그런데 miss 의 상당수는 영구 결번이 아니라 그날 API 가 안 준 것이거나, 준공
 * 직후라 아직 등록 전이던 단지다 — 시간이 지나면 채워진다.
 *
 * 커서는 detailFetchedAt 오름차순이다. 가장 오래 안 본 것부터 보고, 다시 miss 여도
 * 스탬프를 새로 찍어 뒤로 보낸다. 그래서 이 배치는 1,158 행을 한 바퀴 도는
 * 회전문이 되고, 어떤 행도 굶지 않는다.
 */
export async function retryAptDetailMissBatch(limit: number): Promise<AptDetailEnrichResult> {
  const sb = getServiceSupabase();
  if (!sb) {
    return { processed: 0, enriched: 0, failed: 0, skipped: "no-service", mode: "retry-miss", errors: [] };
  }

  const { data, error: selectError } = await sb
    .from("apartment_complexes")
    .select("external_id, name, address, lawd_cd, metadata")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .eq("metadata->>detailStatus", "miss")
    .order("metadata->>detailFetchedAt", { ascending: true })
    .limit(limit);
  if (selectError) {
    return { processed: 0, enriched: 0, failed: limit, mode: "retry-miss", errors: [selectError.message] };
  }
  const rows = (data as AptDetailRow[] | null) ?? [];
  if (rows.length === 0) {
    return { processed: 0, enriched: 0, failed: 0, skipped: "no-rows", mode: "retry-miss", errors: [] };
  }

  return runDetailBatch(sb, rows, "retry-miss");
}

/** 선택 쿼리가 돌려주는 행 모양 — 두 배치가 같은 모양을 쓴다. */
interface AptDetailRow {
  external_id: string;
  name: string;
  address: string | null;
  lawd_cd: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * 고른 행들에 대해 상세를 받아 쓰는 공통 몸통.
 *
 * 두 배치(신규 백필 · miss 재시도)의 차이는 **행을 어떻게 고르는가**뿐이라
 * 조회·병합·집계는 여기 한 곳에만 둔다.
 */
async function runDetailBatch(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  rows: AptDetailRow[],
  mode: "backfill" | "retry-miss",
): Promise<AptDetailEnrichResult> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  // 병합 RPC 행 — name/address/lawd_cd 는 읽은 값을 그대로 되돌려 보낸다
  // (상세의 kaptName 으로 이름을 갈아치우면 이름 기반 신원(D7)이 흔들린다).
  const toWriteRow = (r: AptDetailRow, metadata: Record<string, unknown>): Record<string, unknown> => ({
    source_key: APT_MASTER_SOURCE_KEY,
    external_id: r.external_id,
    name: r.name,
    address: r.address,
    lawd_cd: r.lawd_cd,
    metadata,
  });

  /** 이 행이 지금까지 상세를 시도한 횟수(이번 회차 포함). */
  const attemptsOf = (r: AptDetailRow): number => {
    const raw = Number(r.metadata?.detailAttempts);
    return (Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0) + 1;
  };

  /* DETAIL_CONCURRENCY 만큼 동시에 부른다(위 상수 주석에 이유). 각 워커는 자기
     호출 사이에만 짧게 쉬므로, 전체 호출률은 순차일 때의 약 6배로 유지된다. */
  const outcomes = await mapWithConcurrency(rows, DETAIL_CONCURRENCY, async (r) => {
    const attempts = attemptsOf(r);
    try {
      const { detail } = await fetchAptComplexDetail(r.external_id);
      await new Promise((res) => setTimeout(res, DETAIL_DELAY_MS));
      if (detail && detail.kaptCode) {
        return { kind: "ok" as const, r, attempts, patch: toDetailPatch(detail) };
      }
      return { kind: "miss" as const, r, attempts };
    } catch (err) {
      await new Promise((res) => setTimeout(res, DETAIL_DELAY_MS));
      return {
        kind: "miss" as const,
        r,
        attempts,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  for (const o of outcomes) {
    if ("error" in o && o.error && errors.length < 3) errors.push(o.error);
  }

  const okOutcomes = outcomes.filter((o) => o.kind === "ok");
  const missOutcomes = outcomes.filter((o) => o.kind === "miss");

  /* 성공이 0건이면 키 미설정 또는 API 장애일 수 있다 — 그날 배치를 통째로 miss 로
     낙인찍지 않으려고 스탬프를 미룬다. 다만 시도 횟수는 반드시 적는다.
     [971] 그 유예에 상한을 뒀다. 상한(DETAIL_POISON_ATTEMPTS)을 넘긴 행은 성공이
     0건이어도 스탬프를 찍어 커서를 넘긴다 — 안 그러면 네 행이 백필 전체를
     영원히 막는다(위 상수 주석의 실제 사고). 재시도 배치는 miss 도 계속 보므로
     넘긴다고 버리는 게 아니다. */
  const anyOk = okOutcomes.length > 0;
  const stalled = anyOk ? 0 : missOutcomes.filter((o) => o.attempts >= DETAIL_POISON_ATTEMPTS).length;

  const writeRows: Record<string, unknown>[] = [
    ...okOutcomes.map((o) =>
      toWriteRow(o.r, {
        ...("patch" in o ? o.patch : {}),
        detailStatus: "ok",
        detailAttempts: o.attempts,
        detailFetchedAt: fetchedAt,
      }),
    ),
    ...missOutcomes.map((o) =>
      anyOk || o.attempts >= DETAIL_POISON_ATTEMPTS
        ? toWriteRow(o.r, {
            detailStatus: "miss",
            detailAttempts: o.attempts,
            detailFetchedAt: fetchedAt,
          })
        : // 스탬프 없이 시도 횟수만 — 다음 실행이 이 행을 다시 고른다.
          toWriteRow(o.r, { detailAttempts: o.attempts }),
    ),
  ];

  let failed = 0;
  for (let i = 0; i < writeRows.length; i += UPSERT_BATCH) {
    const chunk = writeRows.slice(i, i + UPSERT_BATCH);
    const { error: rpcError } = await sb.rpc("upsert_apartment_complexes", { rows: chunk });
    if (rpcError) {
      failed += chunk.length;
      if (errors.length < 3) errors.push(rpcError.message);
      logger.warn("[apt-detail-enrich] upsert 실패", {
        rows: chunk.length,
        mode,
        message: rpcError.message,
      });
    }
  }
  // 상세 병합 성공 = ok 행 중 RPC 까지 통과한 수. ok/miss 를 한 배열로 썼으므로
  // RPC 실패 청크에 섞인 ok 행은 enriched 에서 빼고 failed 로 센다.
  const rpcFailedOk = Math.min(failed, okOutcomes.length);
  const enriched = okOutcomes.length - rpcFailedOk;

  return {
    processed: rows.length,
    enriched,
    failed: missOutcomes.length + rpcFailedOk,
    rpcFailed: failed,
    ...(stalled > 0 ? { stalled } : {}),
    mode,
    errors,
  };
}
