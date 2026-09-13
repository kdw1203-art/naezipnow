import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { getAllRegionSnapshots } from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { regionIdForName } from "@/lib/region/catalog";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { listAnnouncementsInWindow, type AnnouncementRow } from "@/lib/applyhome/store";
import { normalizeApplyhomeRegion } from "@/lib/applyhome/regions";
import { weekLabelOf } from "@/lib/newui/digest";
import type {
  PersonalDigest,
  PersonalDigestApply,
  PersonalDigestComplex,
  PersonalDigestNoteComplex,
  PersonalDigestRegion,
} from "@/lib/digest/personal-format";
import { isPersonalDigestEmpty } from "@/lib/digest/personal-format";

/**
 * [995-4] 개인 주간 다이제스트 — 데이터 로더(서버 전용).
 *
 * 사이트 공통 다이제스트(getWeeklyDigest)는 누구에게나 같은 한 줄이라 "왔어요" 이상의
 * 이유가 되지 못했다. 여기서는 **그 사람의 행**만 읽어 네 섹션을 만든다:
 *   regions   app_users.watch_regions(없으면 primary_region, 그것도 없으면 user_watchlist 의
 *             alert:region 행) → market_region_price 스냅샷(평균가·전월 대비·기준월)
 *   watchlist user_watchlist 의 단지 중 지난 7일(적재 시각) 새 매매 신고가 있는 단지
 *   myNotes   최근 90일 임장노트의 단지 중 이번 주 새 신고가 있는 단지
 *   apply     관심 지역(시/도 정규화)에서 앞으로 7일 안에 접수 시작하는 청약 공고
 * 빈 섹션은 키 자체를 두지 않고, 네 섹션이 전부 비면 null — 지어낸 숫자로 채우지 않는다.
 *
 * 비용: 사용자당 DB 왕복 ≤ 4 (프로필 1 · 관심단지 1 · 노트 1 · 실거래 1). 프로필은 크론이
 *       대상 조회 때 이미 읽어 넘기면 0. 지역 스냅샷·청약 공고는 실행당 1회 공유(shared).
 * 예산: 사용자 하나가 배치를 멈추지 못하게 budgetMs(기본 4초) 안에 못 끝내면
 *       PersonalDigestBudgetExceeded 를 던진다 — 조회는 abortSignal 로 같이 끊는다.
 */

const DEFAULT_DAYS = 7;
const DEFAULT_BUDGET_MS = 4_000;
const MAX_REGIONS = 5;
const MAX_WATCH_ROWS = 50;
const MAX_NOTE_ROWS = 50;
const MAX_TX_NAMES = 40;
const MAX_TX_ROWS = 500;
const MAX_NOTE_COMPLEXES = 5;
const MAX_APPLY = 3;
const NOTE_LOOKBACK_DAYS = 90;
const KST_OFFSET_MS = 9 * 3600_000;

export class PersonalDigestBudgetExceeded extends Error {
  constructor(email: string, budgetMs: number) {
    super(`[995] 개인 다이제스트 예산 초과 (${budgetMs}ms): ${email}`);
    this.name = "PersonalDigestBudgetExceeded";
  }
}

export type PersonalDigestProfile = {
  /** app_users.watch_regions 원본(jsonb) — 형태는 app/api/me/regions 가 정한다 */
  watchRegions: unknown;
  primaryRegion: string | null;
};

/** 실행당 한 번만 읽는 공유 재료 — null 은 "못 읽음"(섹션 생략, 0 으로 위장하지 않음) */
export type PersonalDigestShared = {
  snapshots: Map<string, RegionMarketSnapshot> | null;
  /** 앞으로 days 일 안에 접수 시작하는 공고만(rcept_bgnde 기준) */
  upcomingApply: AnnouncementRow[] | null;
  windowFrom: string;
  windowTo: string;
  applyFrom: string;
  applyTo: string;
};

export type BuildPersonalDigestOptions = {
  now?: Date;
  days?: number;
  budgetMs?: number;
  /** 크론이 대상 조회 때 읽은 프로필 — 넘기면 app_users 왕복이 사라진다 */
  profile?: PersonalDigestProfile | null;
  shared?: PersonalDigestShared;
};

function kstYmd(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 공유 재료 적재 — 지역 스냅샷(1h 인프로세스 캐시) + 청약 공고 창 조회. 각각 실패는 null. */
export async function loadPersonalDigestShared(now: Date, days = DEFAULT_DAYS): Promise<PersonalDigestShared> {
  const nowMs = now.getTime();
  const applyFrom = kstYmd(nowMs);
  const applyTo = kstYmd(nowMs + days * 86_400_000);
  const [snapR, applyR] = await Promise.allSettled([
    getAllRegionSnapshots(),
    listAnnouncementsInWindow(applyFrom, applyTo),
  ]);
  if (snapR.status === "rejected") logger.warn("[995] 지역 스냅샷 조회 실패", snapR.reason);
  if (applyR.status === "rejected") logger.warn("[995] 청약 공고 조회 실패", applyR.reason);
  return {
    snapshots: snapR.status === "fulfilled" ? snapR.value : null,
    /* listAnnouncementsInWindow 는 마감이 창에 드는 공고도 주므로 접수 **시작**만 남긴다 */
    upcomingApply:
      applyR.status === "fulfilled"
        ? applyR.value.filter((a) => a.rcept_bgnde && a.rcept_bgnde >= applyFrom && a.rcept_bgnde <= applyTo)
        : null,
    windowFrom: kstYmd(nowMs - days * 86_400_000),
    windowTo: applyFrom,
    applyFrom,
    applyTo,
  };
}

/* ── 관심 지역 이름 ─────────────────────────────────────────────────────── */

/** watch_regions(jsonb 배열: {city, district, label, isPrimary}) → 이름 목록 */
function regionNamesOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const label = String(o.label ?? "").trim();
    const city = String(o.city ?? "").trim();
    const district = String(o.district ?? "").trim();
    const name = label || [city, district].filter(Boolean).join(" ");
    if (name) out.push(name);
  }
  return out;
}

function uniqNames(names: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = n.replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/* ── 행 타입 ───────────────────────────────────────────────────────────── */

type WatchRow = { complex_id: string | null; complex_name: string | null };
type NoteRow = {
  id: string;
  apt_name: string | null;
  region: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
type TxRow = {
  complex_name: string | null;
  region_name: string | null;
  deal_amount_krw: number | string | null;
  contract_ym: string | null;
  created_at: string;
  area_m2: number | string | null;
  floor: number | string | null;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** 단지 키 — 관심단지·노트·실거래를 같은 이름으로 잇는다 */
function nameKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

type ComplexRef = { complexId: string; name: string; region: string | null };

/** 실거래 행을 단지별로 접는다 — 최신 신고(created_at) 1건이 대표 */
function foldTx(rows: TxRow[], refs: ComplexRef[]): Map<string, PersonalDigestComplex> {
  const byKey = new Map<string, PersonalDigestComplex & { _latestMs: number }>();
  const refByKey = new Map<string, ComplexRef>();
  for (const r of refs) if (!refByKey.has(nameKey(r.name))) refByKey.set(nameKey(r.name), r);
  for (const t of rows) {
    const name = String(t.complex_name ?? "").trim();
    if (!name) continue;
    const ref = refByKey.get(nameKey(name));
    if (!ref) continue;
    /* 동명 단지 오집계 방지 — 단지 id 에 지역이 있으면 신고 행의 region_name 과 맞아야 한다 */
    if (ref.region && t.region_name && ref.region !== t.region_name) continue;
    const ms = Date.parse(t.created_at) || 0;
    const cur = byKey.get(nameKey(name)) ?? {
      complexId: ref.complexId,
      name: ref.name,
      txCount: 0,
      latestPriceWon: null,
      latestContractYm: null,
      latestReportedAt: null,
      areaM2: null,
      floor: null,
      _latestMs: -1,
    };
    cur.txCount += 1;
    if (ms > cur._latestMs) {
      cur._latestMs = ms;
      cur.latestPriceWon = num(t.deal_amount_krw);
      cur.latestContractYm = t.contract_ym ? String(t.contract_ym).trim() : null;
      cur.latestReportedAt = t.created_at;
      cur.areaM2 = num(t.area_m2);
      cur.floor = num(t.floor);
    }
    byKey.set(nameKey(name), cur);
  }
  const out = new Map<string, PersonalDigestComplex>();
  for (const [k, v] of byKey) {
    const { _latestMs: _drop, ...rest } = v;
    void _drop;
    out.set(k, rest);
  }
  return out;
}

/* ── 본체 ──────────────────────────────────────────────────────────────── */

async function buildInner(
  email: string,
  opts: Required<Pick<BuildPersonalDigestOptions, "now" | "days" | "budgetMs">> & BuildPersonalDigestOptions,
  signal: AbortSignal,
): Promise<PersonalDigest | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const em = email.trim().toLowerCase();
  const shared = opts.shared ?? (await loadPersonalDigestShared(opts.now, opts.days));
  const sinceIso = new Date(opts.now.getTime() - opts.days * 86_400_000).toISOString();
  const noteSinceIso = new Date(opts.now.getTime() - NOTE_LOOKBACK_DAYS * 86_400_000).toISOString();

  /* 1단: 프로필(넘겨받지 않았을 때만) · 관심단지 · 노트 — 서로 독립이라 동시에 */
  const [profileR, watchR, noteR] = await Promise.allSettled([
    opts.profile !== undefined
      ? Promise.resolve(opts.profile)
      : sb
          .from("app_users")
          .select("watch_regions, primary_region")
          .eq("email", em)
          .abortSignal(signal)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw new Error(error.message);
            if (!data) return null;
            const o = data as Record<string, unknown>;
            return { watchRegions: o.watch_regions, primaryRegion: o.primary_region ? String(o.primary_region) : null };
          }),
    sb
      .from("user_watchlist")
      .select("complex_id, complex_name")
      .eq("user_email", em)
      .limit(MAX_WATCH_ROWS)
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as WatchRow[];
      }),
    sb
      .from("inspection_notes")
      .select("id, apt_name, region, metadata, created_at")
      .eq("author_email", em)
      .gte("created_at", noteSinceIso)
      .order("created_at", { ascending: false })
      .limit(MAX_NOTE_ROWS)
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as NoteRow[];
      }),
  ]);
  if (profileR.status === "rejected") logger.warn(`[995] app_users 조회 실패 (${em})`, profileR.reason);
  if (watchR.status === "rejected") logger.warn(`[995] user_watchlist 조회 실패 (${em})`, watchR.reason);
  if (noteR.status === "rejected") logger.warn(`[995] inspection_notes 조회 실패 (${em})`, noteR.reason);
  const profile = profileR.status === "fulfilled" ? profileR.value : null;
  const watchRows = watchR.status === "fulfilled" ? watchR.value : null;
  const noteRows = noteR.status === "fulfilled" ? noteR.value : null;

  /* 관심 지역 이름: watch_regions → primary_region → alert:region 구독 */
  const alertRegionNames = (watchRows ?? [])
    .map((r) => String(r.complex_id ?? ""))
    .filter((id) => id.startsWith("alert:region:"))
    .map((id) => id.slice("alert:region:".length).trim());
  const regionNames = uniqNames(
    [
      ...regionNamesOf(profile?.watchRegions),
      ...(profile?.primaryRegion ? [profile.primaryRegion] : []),
      ...alertRegionNames,
    ],
    MAX_REGIONS,
  );

  /* (a) regions — 스냅샷에 유효 평균가가 있는 지역만 */
  const regions: PersonalDigestRegion[] = [];
  if (shared.snapshots) {
    for (const name of regionNames) {
      const regionId = regionIdForName(name);
      const snap = regionId ? shared.snapshots.get(regionId) : undefined;
      const won = snap?.avgSale ?? snap?.medianSale;
      if (!snap || typeof won !== "number" || won <= 0) continue;
      regions.push({
        name,
        regionId,
        regionName: snap.regionName,
        avgSaleWon: won,
        changeMonthlyPct: typeof snap.saleChangeMonthly === "number" && Number.isFinite(snap.saleChangeMonthly)
          ? snap.saleChangeMonthly
          : null,
        period: /^\d{6}$/.test(snap.period) ? snap.period : null,
        tradeCount: typeof snap.tradeCount === "number" && snap.tradeCount > 0 ? snap.tradeCount : null,
      });
    }
  }

  /* 단지 참조 — 관심단지(alert: 제외) + 노트 단지(metadata.complexId 우선, 없으면 apt_name) */
  const watchRefs: ComplexRef[] = [];
  for (const r of watchRows ?? []) {
    const id = String(r.complex_id ?? "");
    const name = String(r.complex_name ?? "").trim();
    if (!id || id.startsWith("alert:") || !name) continue;
    watchRefs.push({ complexId: id, name, region: decodeComplexId(id)?.region ?? null });
  }
  const noteRefs: Array<ComplexRef & { noteId: string }> = [];
  const seenNote = new Set<string>();
  for (const n of noteRows ?? []) {
    const cid = typeof n.metadata?.complexId === "string" ? n.metadata.complexId : "";
    const decoded = cid ? decodeComplexId(cid) : null;
    const name = (decoded?.name ?? n.apt_name ?? "").trim();
    if (!name || seenNote.has(nameKey(name))) continue;
    seenNote.add(nameKey(name));
    noteRefs.push({ complexId: cid || `note:${nameKey(name)}`, name, region: decoded?.region ?? null, noteId: n.id });
  }

  /* 2단: 실거래 한 번 — 관심단지 ∪ 노트 단지 이름으로. watchlist-brief 와 같은 필터. */
  const txNames = uniqNames([...watchRefs.map((r) => r.name), ...noteRefs.map((r) => r.name)], MAX_TX_NAMES);
  let txRows: TxRow[] | null = null;
  if (txNames.length > 0) {
    const fromYm = (() => {
      const d = new Date(opts.now.getTime());
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const { data, error } = await sb
      .from("market_transactions")
      .select("complex_name, region_name, deal_amount_krw, contract_ym, created_at, area_m2, floor")
      .in("complex_name", txNames)
      .eq("transaction_type", "trade")
      .eq("is_cancelled", false)
      .eq("property_type", "apartment")
      .gte("contract_ym", fromYm)
      .gte("created_at", sinceIso)
      .not("deal_amount_krw", "is", null)
      .limit(MAX_TX_ROWS)
      .abortSignal(signal);
    if (error) logger.warn(`[995] market_transactions 조회 실패 (${em})`, error.message);
    else txRows = (data ?? []) as TxRow[];
  }

  /* (b) watchlist · (c) myNotes — 같은 실거래 행을 각자의 참조로 접는다 */
  let watchlist: PersonalDigest["watchlist"];
  let myNotes: PersonalDigest["myNotes"];
  if (txRows && txRows.length > 0) {
    const w = foldTx(txRows, watchRefs);
    if (w.size > 0) {
      const items = [...w.values()].sort((a, b) => b.txCount - a.txCount);
      watchlist = {
        complexCount: items.length,
        txCount: items.reduce((s, c) => s + c.txCount, 0),
        items: items.slice(0, 3),
      };
    }
    const n = foldTx(txRows, noteRefs);
    if (n.size > 0) {
      const noteIdByKey = new Map(noteRefs.map((r) => [nameKey(r.name), r.noteId]));
      const items: PersonalDigestNoteComplex[] = [...n.entries()]
        .map(([k, c]) => ({ ...c, noteId: noteIdByKey.get(k) ?? "" }))
        .filter((c) => c.noteId)
        .sort((a, b) => b.txCount - a.txCount);
      if (items.length > 0) myNotes = { complexCount: items.length, items: items.slice(0, MAX_NOTE_COMPLEXES) };
    }
  }

  /* (d) apply — 관심 지역을 시/도로 정규화해 접수 시작 공고와 맞춘다(applyhome-alerts 와 같은 규칙) */
  let apply: PersonalDigest["apply"];
  if (shared.upcomingApply && shared.upcomingApply.length > 0 && regionNames.length > 0) {
    const sidos = regionNames
      .map((name) => ({ sido: normalizeApplyhomeRegion(name), gu: name.split(/\s+/)[1] ?? "" }))
      .filter((s) => s.sido !== "전체");
    const hits: Array<{ a: AnnouncementRow; strong: boolean }> = [];
    const seen = new Set<string>();
    for (const a of shared.upcomingApply) {
      const key = `${a.house_manage_no}:${a.pblanc_no}`;
      if (seen.has(key)) continue;
      const region = a.region ?? "";
      for (const s of sidos) {
        if (region !== s.sido && !region.includes(s.sido)) continue;
        seen.add(key);
        hits.push({ a, strong: s.gu.length > 0 && Boolean(a.address?.includes(s.gu)) });
        break;
      }
    }
    hits.sort((x, y) => Number(y.strong) - Number(x.strong) || (x.a.rcept_bgnde ?? "").localeCompare(y.a.rcept_bgnde ?? ""));
    if (hits.length > 0) {
      const items: PersonalDigestApply[] = hits.slice(0, MAX_APPLY).map(({ a }) => ({
        houseNm: a.house_nm,
        region: a.region,
        address: a.address,
        totSupply: a.tot_supply,
        rceptBgnde: a.rcept_bgnde as string,
        rceptEndde: a.rcept_endde,
        url: a.pblanc_url,
      }));
      apply = { count: hits.length, items };
    }
  }

  const digest: PersonalDigest = {
    weekLabel: weekLabelOf(opts.now),
    windowFrom: shared.windowFrom,
    windowTo: shared.windowTo,
    ...(regions.length > 0 ? { regions } : {}),
    ...(watchlist ? { watchlist } : {}),
    ...(myNotes ? { myNotes } : {}),
    ...(apply ? { apply } : {}),
  };
  return isPersonalDigestEmpty(digest) ? null : digest;
}

/**
 * 한 사람의 이번 주 요약. 네 섹션이 전부 비면 null.
 * budgetMs 안에 못 끝내면 PersonalDigestBudgetExceeded 를 던진다(호출부가 세어서 응답에 드러낸다).
 */
export async function buildPersonalDigest(
  email: string,
  options: BuildPersonalDigestOptions = {},
): Promise<PersonalDigest | null> {
  if (!email.trim()) return null;
  const opts = {
    ...options,
    now: options.now ?? new Date(),
    days: options.days ?? DEFAULT_DAYS,
    budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
  };
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new PersonalDigestBudgetExceeded(email, opts.budgetMs));
    }, opts.budgetMs);
  });
  try {
    return await Promise.race([buildInner(email, opts, ac.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
