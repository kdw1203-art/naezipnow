/**
 * [1027] 이력 백필 상한 160 → 45곳/실행 · 수동 상한 200 → 45(예산 240초 안에 끝나는 크기 — 아래 상수의 실측 주석)
 * [1025] 이력 백필 상한 40 → 160곳/실행(HISTORY_MAX_REGIONS_PER_RUN) · 수동 상한 200(HISTORY_MAX_REGIONS_CAP)
 * [1024] 국토부 실거래 적재의 **순수 도우미** — server-only 사슬 밖.
 *
 * molit-transactions.ts 는 supabase/service(server-only)를 물고 있어 node:test 가 직접 부르지 못한다
 * (region-catalog-998 테스트가 그래서 문자열 대조로 우회했다). 월 계산·raw 축약·커서 판정처럼
 * 규칙이 곧 사실인 함수는 여기 두고 테스트가 실제 코드를 부르게 한다. DB·fetch 는 없다.
 */

import type { SigunguInfo } from "@/lib/national-data/region-codes";

/**
 * 시군구 정보 → market_transactions.region_name 표기.
 * "서울특별시"+"종로구" → "서울 종로구" · "수원시 영통구" → "수원 영통구" · "광명시" → "광명시"
 * (기존 적재 데이터의 표기 규칙과 동일하게 맞춘다)
 * [1027] molit-transactions.ts 에서 옮겨 왔다(그 파일이 다시 내보낸다) — 규칙은 한 글자도 바꾸지 않았다.
 */
export function molitRegionLabel(info: Pick<SigunguInfo, "sido" | "sigungu">): string {
  const sigungu = info.sigungu.trim();
  if (sigungu.includes(" ")) return sigungu.replace(/시\s/, " ");
  /* [996] 전남광주통합특별시(12) — 구는 "광주 동구", 시·군은 "목포시"(다른 도와 같은 규칙) */
  if (info.sido === "전남광주통합특별시") {
    return sigungu.endsWith("구") ? `광주 ${sigungu}` : sigungu;
  }
  if (/(특별시|광역시)$/.test(info.sido)) {
    return `${info.sido.replace(/(특별시|광역시)$/, "")} ${sigungu}`;
  }
  return sigungu;
}

/** 수도권 시도 코드 앞 두 자리 — 서울 11 · 경기 41 · 인천 28 */
export const CAPITAL_AREA_PREFIXES = ["11", "41", "28"] as const;

export function isCapitalAreaCode(sigunguCd: string): boolean {
  return CAPITAL_AREA_PREFIXES.some((p) => sigunguCd.startsWith(p));
}

/** 비아파트 property_type 값 — 화면(rent-nonapt)·크론·집계 잠금 테스트가 같은 상수를 쓴다 */
export const NONAPT_PROPERTY_TYPES = ["officetel", "rowhouse", "house"] as const;
export type NonAptPropertyType = (typeof NONAPT_PROPERTY_TYPES)[number];

export function isNonAptPropertyType(v: unknown): v is NonAptPropertyType {
  return typeof v === "string" && (NONAPT_PROPERTY_TYPES as readonly string[]).includes(v);
}

/**
 * 계약월 yyyymm 이 "최근"(신고지연 흡수 구간)인가 — 최근이면 이미 행이 있어도 다시 받는다.
 * 예전엔 적재 루프 안에 인라인이었다(들여쓰기가 깨진 채). 백필·비아파트도 같은 규칙을 쓰므로 함수로 뺐다.
 */
export const RECENT_MONTHS = 3;
export function isRecentMonth(yyyymm: string, now: Date): boolean {
  const ymNum = Number(yyyymm);
  if (!/^\d{6}$/.test(yyyymm) || !Number.isFinite(ymNum)) return false;
  const nowYm = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1);
  const monthsAgo =
    (Math.floor(nowYm / 100) - Math.floor(ymNum / 100)) * 12 + ((nowYm % 100) - (ymNum % 100));
  return monthsAgo < RECENT_MONTHS;
}

/** yyyymm 에서 deltaMonths 만큼 이동(음수 = 과거) — 월 커서 계산 */
export function shiftYm(yyyymm: string, deltaMonths: number): string {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6));
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** yyyymm 형식 검사 */
export function isYm(v: unknown): v is string {
  return typeof v === "string" && /^\d{6}$/.test(v) && Number(v.slice(4, 6)) >= 1 && Number(v.slice(4, 6)) <= 12;
}

/**
 * raw 미저장 모드의 raw 값. 컬럼이 NOT NULL 이라 빈 객체를 넣는다(행당 1.6KB → 수십 바이트).
 * 해제 근거(cdealType·cdealDay)만은 남긴다 — 나중에 "왜 해제로 분류됐나"를 되짚을 수 있어야 한다.
 * 실측(2026-09-28): market_transactions 1,477MB 의 대부분이 raw 다. 과거 5년치를 raw 째 넣으면 표가 배로 는다.
 */
export function compactRaw(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const type = String(raw.cdealType ?? "").trim();
  const day = String(raw.cdealDay ?? "").trim();
  if (type) out.cdealType = type;
  if (day) out.cdealDay = day;
  return out;
}

/** 적재 로그 dataset 표기 — 아파트만이면 예전 문자열 그대로(신선도 화면·검색이 그 문구를 본다) */
export function molitDatasetLabel(propertyTypes: readonly string[]): string {
  const KO: Record<string, string> = {
    apartment: "아파트",
    officetel: "오피스텔",
    rowhouse: "연립다세대",
    house: "단독다가구",
  };
  const names = propertyTypes.map((p) => KO[p] ?? p);
  if (names.length === 0 || (names.length === 1 && names[0] === "아파트")) return "아파트 매매·전월세 실거래";
  return `${names.join("·")} 매매·전월세 실거래`;
}

/* ── 이력 백필 커서 ──────────────────────────────────────────────────────── */

/** 백필 시작 월(2026-01 부터는 일일 크론이 채웠다 — 실측: 계약월 2026-01~09 만 존재) */
export const HISTORY_BACKFILL_START_YM = "202512";
/** 하한 — 이 달보다 과거는 받지 않는다 */
export const HISTORY_BACKFILL_FLOOR_YM = "202101";
/**
 * 1회 실행 시군구 상한. data.go.kr 일일 한도 10,000 회 안에서 다른 크론과 나눠 쓴다.
 * 시군구 1곳 = 유형 2종 × 최대 3페이지 = 최대 6회.
 * [1025] 40 → 160(≤ 960회/실행) · 크론 하루 2회(02:40·14:40 UTC) → ≤ 1,920회/일. 40곳·1회로는 수도권 ≈80곳 × 60개월이
 * 넉 달 걸렸다. 하루 합계: 관리비 200곳 × 22회 = 4,400 · 백필 ≤ 1,920 · 비아파트 ≈250 · 아파트 일일 ≈32 · apt-master/
 * detail ≈400 → ≈ 7,000 < 10,000.
 * [1027] 160 → 45 · 크론 하루 2회 → 6회(02·06·10·14·18·22시 40분 UTC) → ≤ 1,620회/일(1025 때의 하루 총량 1,920 아래).
 * 160곳은 크론 예산 240초 안에 끝나지 않았다. 운영 기록(market_ingest_log, 2026-09-29~10-03): 시군구 1곳에
 * 1.5~4.5초 — 160곳 실행은 4~12분이 걸려 "시간 초과로 중단" 오류가 7회 중 4회 남았고(일이 뒤에서 끝난 날도,
 * 함수째 끊겨 커서를 못 넘긴 날도 있었다), 그 오류가 운영 알림으로 갔다. 가장 느린 4.5초로 쳐도 45곳은 203초 —
 * 빈 달 판정(달마다 HEAD 카운트 ≈80회)까지 넣어도 예산 안이다. 속도: 270곳·월/일 → 수도권 ≈80곳 × 남은 48개월 ≈ 2주.
 */
export const HISTORY_MAX_REGIONS_PER_RUN = 45;
/** 수동 ?regions= 상한. [1027] 200 → 45 — 그 위는 크론 예산(240초) 안에 못 끝난다(위 실측). 수동으로는 줄이기만 한다 */
export const HISTORY_MAX_REGIONS_CAP = 45;
/** 1회 실행에서 넘길 수 있는 최대 월 수 — 빈 달 판정(HEAD 카운트 ≈80회/월)이 예산을 먹지 않게 */
export const HISTORY_MAX_MONTHS_PER_RUN = 3;
/** public_data_cache.cache_key */
export const HISTORY_CURSOR_KEY = "molit-history-backfill:cursor";

export interface HistoryCursor {
  /** 다음 실행이 볼 계약월 */
  ym: string;
  updatedAt: string;
  /** 하한까지 다 돌았다 */
  done?: boolean;
}

/** 한 달 처리 결과의 요약(ingestMolitTransactions 결과에서 뽑는다) */
export interface MonthOutcome {
  configured: boolean;
  aborted: boolean;
  errors: number;
  /** API 를 부른 시군구 수(빈 응답 포함) */
  attempted: number;
  inserted: number;
  /** 이번 호출에 준 시군구 상한 */
  limit: number;
}

/**
 * 한 달을 돌고 난 뒤 커서를 넘길지 판정한다.
 *
 *  · 키 없음(configured=false)·중단·오류 → 머문다(다음 실행이 같은 달을 다시 본다). 오류를 "다 됐다"로 읽지 않는다.
 *  · 빈 곳이 상한보다 적었다(attempted < limit) → 이 달의 빈 곳을 전부 봤다 → 넘긴다.
 *    (API 가 0건을 준 구는 계속 빈 곳으로 남지만, 그 사실을 이유로 매일 되돌아오지 않는다 — 옹진군 같은 곳은
 *     실제로 아파트 거래가 없는 달이 있다.)
 *  · 상한만큼 봤다 → 더 있을 수 있다 → 머문다.
 */
export function shouldAdvanceMonth(o: MonthOutcome): boolean {
  if (!o.configured || o.aborted || o.errors > 0) return false;
  return o.attempted < o.limit;
}

/** 커서 월이 하한 아래면 끝 */
export function isBackfillDone(ym: string, floorYm = HISTORY_BACKFILL_FLOOR_YM): boolean {
  return ym < floorYm;
}

/* ── 비아파트 수집 창 ────────────────────────────────────────────────────── */

/** 비아파트는 최근 이 개월만 본다(수도권) */
export const NONAPT_WINDOW_MONTHS = 12;
/** 매일 다시 받는 최근월 슬라이스 크기(시군구 수) — 6회/구 → 72회 */
export const NONAPT_RECENT_SLICE = 12;
/** 빈 (구, 월) 메우기 상한(시군구 수) — 6회/구 → 180회 */
export const NONAPT_GAP_REGIONS_PER_RUN = 30;
/** 한 번에 훑는 빈 달 수 상한(HEAD 카운트 ≈80×3) */
export const NONAPT_GAP_MONTHS_PER_RUN = 3;
export const NONAPT_CURSOR_KEY = "molit-nonapt-ingest:cursor";

/** 최근 12개월 창(최신 → 과거, 당월 포함) */
export function nonAptWindow(now: Date, months = NONAPT_WINDOW_MONTHS): string[] {
  const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return Array.from({ length: months }, (_, i) => shiftYm(cur, -i));
}

/**
 * 하루 한 번 도는 크론의 슬라이스 — **일수**로 돈다. [982] 12시간 창으로 고르면 매일 2씩 뛰어
 * 홀수 슬라이스를 영원히 건너뛴다. 창 수가 바뀌어도(시군구 추가) 0..windows-1 안에 든다.
 */
export function dailySliceIndex(now: Date, total: number, sliceSize: number): number {
  const windows = Math.max(1, Math.ceil(total / Math.max(1, sliceSize)));
  const dayNum = Math.floor(now.getTime() / 86_400_000);
  return dayNum % windows;
}

/**
 * 빈 달 훑기의 다음 커서 — 창 안에서 과거로 한 칸, 창을 벗어나면 창의 두 번째 달(전월)로 되감는다.
 * 당월(창[0])은 매일 슬라이스로 다시 받으므로 빈 달 훑기에서는 뺀다.
 */
export function nextNonAptGapYm(current: string | null, window: string[]): string | null {
  if (window.length < 2) return null;
  const gapMonths = window.slice(1);
  if (!current) return gapMonths[0];
  const idx = gapMonths.indexOf(current);
  if (idx < 0 || idx + 1 >= gapMonths.length) return gapMonths[0];
  return gapMonths[idx + 1];
}
