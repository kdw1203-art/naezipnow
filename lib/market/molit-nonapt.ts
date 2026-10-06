/**
 * [1024] 비아파트(오피스텔·연립다세대·단독다가구) 실거래 수집 — 수도권 · 최근 12개월 · raw 미저장.
 *
 * 실측(2026-09-28): molit-api.ts 에 offi/rh/sh 매핑은 있었지만 MOLIT_PROPERTY_TYPES 기본값이 "apartment" 라
 * 수집이 0 이었다. 직방·다방은 호가만 보여 주고 신고된 실거래 월세는 안 보여 준다 — 이 표가 /rent/[region] 의 근거다.
 *
 * 두 단계(둘 다 같은 ingestMolitTransactions 를 쓴다 — 유형만 다르다)
 *  A. 최근월(autoTargetMonth: 당월/전월 교대) — 수도권 시군구를 12곳씩 **일수** 슬라이스로 돌며 다시 받는다
 *     (신고지연 흡수; external_key upsert 라 이중 계상 없음).
 *  B. 빈 (구, 월, 유형) 메우기 — 창(전월~11개월 전)을 커서로 한 칸씩 돌며 0행인 곳만 채운다(1회 30곳·3개월).
 *
 * 집계 오염 없음: 집계 뷰·RPC·rent.ts 는 property_type='apartment' 조건을 이미 갖는다(tests/unit/data-1024 가 잠근다).
 * 호출량: A 12곳×6 + B 30곳×6 ≈ 250회/일.
 */
import { needsServiceApproval } from "@/lib/market/ingest-outcome";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  autoTargetMonth,
  ingestMolitTransactions,
  listCapitalSigungu,
  type MolitIngestResult,
} from "@/lib/market/molit-transactions";
import {
  dailySliceIndex,
  isYm,
  nextNonAptGapYm,
  nonAptWindow,
  NONAPT_CURSOR_KEY,
  NONAPT_GAP_MONTHS_PER_RUN,
  NONAPT_GAP_REGIONS_PER_RUN,
  NONAPT_PROPERTY_TYPES,
  NONAPT_RECENT_SLICE,
  shouldAdvanceMonth,
} from "@/lib/market/molit-core";
import { readCursor, writeCursor } from "@/lib/market/molit-cursor";
import { logIngest } from "@/lib/market/store";

export interface NonAptIngestResult {
  ok: boolean;
  configured: boolean;
  types: string[];
  recent: { ym: string; slice: number; regions: number; attempted: number; inserted: number; errors: number } | null;
  gaps: { ym: string; attempted: number; inserted: number; errors: number; advanced: boolean }[];
  cursorYm: string | null;
  attempted: number;
  inserted: number;
  errors: number;
  touchedComplexes: { region: string; name: string }[];
  reason?: string;
}

interface NonAptCursor {
  ym: string;
  updatedAt: string;
}

export async function ingestMolitNonApt(opts: {
  now?: Date;
  /** 유형 그룹 키(기본: officetel·rowhouse·house) — ?types= 로 좁힐 수 있다 */
  types?: readonly string[];
  recentSlice?: number;
  gapRegions?: number;
  gapMonths?: number;
  /** A 단계(최근월 재수집) 생략 — 수동 백필 시 */
  skipRecent?: boolean;
} = {}): Promise<NonAptIngestResult> {
  const now = opts.now ?? new Date();
  const types = (opts.types?.length ? opts.types : NONAPT_PROPERTY_TYPES).map((t) => t.toLowerCase());
  const result: NonAptIngestResult = {
    ok: true,
    configured: true,
    types,
    recent: null,
    gaps: [],
    cursorYm: null,
    attempted: 0,
    inserted: 0,
    errors: 0,
    touchedComplexes: [],
  };
  if (!getServiceSupabase()) {
    return { ...result, ok: false, configured: false, reason: "Supabase 미설정" };
  }

  const capital = listCapitalSigungu();
  const codesAll = capital.map((c) => c.sigunguCd);
  const absorb = (r: MolitIngestResult) => {
    result.attempted += r.attempted;
    result.inserted += r.inserted;
    result.errors += r.errors;
    result.touchedComplexes.push(...r.touchedComplexes);
    if (!r.configured) result.configured = false;
  };

  /* A. 최근월 — 일수 슬라이스 */
  if (!opts.skipRecent) {
    const sliceSize = Math.max(1, Math.min(60, opts.recentSlice ?? NONAPT_RECENT_SLICE));
    const slice = dailySliceIndex(now, codesAll.length, sliceSize);
    const codes = codesAll.slice(slice * sliceSize, slice * sliceSize + sliceSize);
    const ym = autoTargetMonth(now);
    const r = await ingestMolitTransactions({ yyyymm: ym, codes, keepRaw: false, types, now });
    absorb(r);
    result.recent = { ym, slice, regions: codes.length, attempted: r.attempted, inserted: r.inserted, errors: r.errors };
    if (!r.configured) {
      result.ok = false;
      result.reason = "MOLIT 인증키 미설정 또는 API 응답 없음 — 빈 달 메우기 생략";
      await logNonApt(result, types);
      return result;
    }
    if (r.aborted) {
      result.ok = false;
      result.reason = r.reason;
      await logNonApt(result, types);
      return result;
    }
  }

  /* B. 빈 (구, 월, 유형) 메우기 — 커서로 창을 한 칸씩 */
  const window = nonAptWindow(now);
  const cursor = await readCursor<NonAptCursor>(NONAPT_CURSOR_KEY);
  /* 커서가 창 안(전월~11개월 전)이면 그 달부터, 창 밖(달이 넘어갔거나 처음)이면 전월부터 */
  let ym: string | null =
    isYm(cursor?.ym) && window.slice(1).includes(cursor.ym) ? cursor.ym : nextNonAptGapYm(null, window);
  let regionsLeft = Math.max(1, Math.min(60, opts.gapRegions ?? NONAPT_GAP_REGIONS_PER_RUN));
  const maxMonths = Math.max(1, Math.min(12, opts.gapMonths ?? NONAPT_GAP_MONTHS_PER_RUN));
  let months = 0;
  let lastYm: string | null = null;

  while (ym && months < maxMonths && regionsLeft > 0) {
    const limit = regionsLeft;
    const r = await ingestMolitTransactions({
      yyyymm: ym,
      codes: codesAll,
      gapsFirst: true,
      sliceSize: limit,
      keepRaw: false,
      types,
      now,
    });
    absorb(r);
    months += 1;
    regionsLeft -= r.attempted;
    const advanced = shouldAdvanceMonth({
      configured: r.configured,
      aborted: r.aborted,
      errors: r.errors,
      attempted: r.attempted,
      inserted: r.inserted,
      limit,
    });
    result.gaps.push({ ym, attempted: r.attempted, inserted: r.inserted, errors: r.errors, advanced });
    lastYm = ym;
    if (!advanced) {
      if (!r.configured) result.reason = "MOLIT 인증키 미설정 또는 API 응답 없음";
      else if (r.aborted || r.errors > 0) result.reason = r.reason ?? `오류 ${r.errors}건 — 같은 달을 다음 실행이 다시 봄`;
      break;
    }
    ym = nextNonAptGapYm(ym, window);
  }

  /* 커서: 넘겼으면 다음 달, 못 넘겼으면 그 달(다음 실행이 이어서). 키 없음이면 건드리지 않는다. */
  if (result.configured && lastYm) {
    const last = result.gaps[result.gaps.length - 1];
    const nextYm = last.advanced ? (nextNonAptGapYm(lastYm, window) ?? lastYm) : lastYm;
    result.cursorYm = nextYm;
    await writeCursor(NONAPT_CURSOR_KEY, { ym: nextYm, updatedAt: now.toISOString() } satisfies NonAptCursor);
  }

  result.ok = result.errors === 0 && result.configured;
  await logNonApt(result, types);
  return result;
}

async function logNonApt(result: NonAptIngestResult, types: string[]): Promise<void> {
  const a = result.recent;
  await logIngest({
    source: "molit",
    dataset: "비아파트 실거래(수도권 · 오피스텔·연립다세대·단독다가구)",
    origin: "cron-fetch",
    rows: result.inserted,
    /* [1040] 활용신청 대기(국토부 30번 응답)는 skipped — 승인 전까지 매일 "수집 실패"로 켜지지 않게(needsServiceApproval) */
    status: !result.configured
      ? "skipped"
      : needsServiceApproval(result.reason) && result.inserted === 0
        ? "skipped"
        : result.errors > 0
          ? "error"
          : result.inserted > 0
            ? "ok"
            : "skipped",
    message:
      /* [1030 · 5차] "시도=" 는 실행 전체(최근월 + 빈달) — 예전엔 최근월 조각만 적어 관리자 화면이 "12곳 중 42곳 실패"로 읽었다 */
      `유형=${types.join(",")} 시도=${result.attempted} ` +
      (a ? `최근월 ${a.ym} slice=${a.slice}(${a.regions}곳) 최근시도=${a.attempted} 적재=${a.inserted} ` : "") +
      `빈달=${result.gaps.map((g) => `${g.ym}:시도${g.attempted}/적재${g.inserted}${g.advanced ? "/넘김" : ""}`).join(" ") || "없음"} ` +
      `커서=${result.cursorYm ?? "유지"} 오류=${result.errors} raw=미저장` +
      (result.reason ? ` — ${result.reason.slice(0, 200)}` : ""),
  });
}
