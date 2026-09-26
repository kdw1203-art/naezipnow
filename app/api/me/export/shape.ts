/**
 * [1000] 내 데이터 내보내기 — JSON 본문을 만드는 순수 규칙.
 *
 * route.ts 가 각 원천을 따로 조회해(하나 실패해도 나머지는 내려간다) 여기로 넘긴다.
 * `server-only`·DB 클라이언트를 import 하지 않는다 — node:test 가 같은 모양을 검사한다.
 *
 * 원칙:
 *  - 본인 것만. 입력이 이미 본인 이메일로 조회된 행이지만, 여기서도 한 번 더 거른다
 *    (author_email / user_email 이 다른 행은 버린다) — 조회 코드가 바뀌어도 남의 행이 섞이지 않게.
 *  - 비밀값 없음. 결제는 주문번호·금액·상태·영수증 링크까지만(빌링키·고객키는 입력 타입에 없다).
 *  - 실패한 원천은 빈 배열 대신 `errors` 에 이름을 남긴다 — "없음" 과 "못 읽음" 은 다르다.
 */

import { decisionFromMetadata } from "@/lib/inspection/decision";

export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_LEDGER_LIMIT = 500;
export const EXPORT_PAYMENTS_LIMIT = 200;

/** 원천 하나의 조회 결과 — ok:false 면 errors 에 적힌다 */
export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EXPORT_SOURCES = [
  "profile",
  "notes",
  "bookmarks",
  "watchlist",
  "alerts",
  "points",
  "payments",
  "notificationPrefs",
  "preferences",
] as const;
export type ExportSourceName = (typeof EXPORT_SOURCES)[number];

/* ── 입력(구조적 타입 — lib 의 실제 타입이 이 모양을 만족한다) ── */

export type ProfileLike = {
  email: string;
  name: string | null;
  plan: string;
  createdAt: string | null;
  primaryRegion?: string | null;
};

export type NoteLike = {
  id: string;
  authorEmail: string;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  summary?: string | null;
  metadata?: unknown;
};

export type BookmarkLike = {
  userEmail: string;
  targetType: string;
  targetId: string;
  label?: string | null;
  createdAt: string;
};

export type WatchlistLike = {
  userEmail: string;
  complexId: string;
  complexName: string;
  alertPriceMin?: number | null;
  alertPriceMax?: number | null;
  createdAt: string;
};

export type AlertLike = {
  id: string;
  type: string;
  value: string;
  createdAt?: string;
};

export type LedgerLike = {
  delta: number;
  reason: string;
  refId: string | null;
  balance: number;
  createdAt: string;
  expiresAt: string | null;
};

export type PaymentLike = {
  id: string;
  orderId: string | null;
  plan: string | null;
  billing: string | null;
  amount: number | null;
  status: string | null;
  method: string | null;
  receiptUrl: string | null;
  requestedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
};

export type PrefsLike = Record<string, unknown> & { userEmail?: string };

/**
 * [1008 · J] user_preferences 한 행의 내 것 — 표시·기록 기본값(ui_prefs)과 내 집 마련 여정(journey_state).
 * route.ts 가 정규화된 값(lib/prefs/ui-prefs · lib/journey/state)으로 넘긴다. 저장한 적 없는 칸은 null.
 */
export type PreferencesLike = {
  uiPrefs: (Record<string, unknown> & { updatedAt?: string | null }) | null;
  journey: Record<string, unknown> | null;
};

export type ExportInput = {
  email: string;
  generatedAt: string;
  profile: SourceResult<ProfileLike>;
  notes: SourceResult<NoteLike[]>;
  bookmarks: SourceResult<BookmarkLike[]>;
  watchlist: SourceResult<WatchlistLike[]>;
  alerts: SourceResult<AlertLike[]>;
  points: SourceResult<LedgerLike[]>;
  payments: SourceResult<PaymentLike[]>;
  notificationPrefs: SourceResult<PrefsLike>;
  /** [1008 · J] 없으면(옛 호출) 내보내지 않는다 — route.ts 는 늘 넘긴다 */
  preferences?: SourceResult<PreferencesLike>;
};

/* ── 출력 ── */

export type ExportedNote = {
  id: string;
  title: string;
  region: string;
  complex: string | null;
  visitDate: string;
  isPublic: boolean;
  summary: string | null;
  /** metadata.decision — 살까·보류·패스·다시 보기 (없으면 null) */
  decision: { choice: string; reasons: string[]; decidedAt: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportPayload = {
  format: "naezipnow-export";
  version: number;
  generatedAt: string;
  account: { email: string };
  profile: {
    name: string | null;
    email: string;
    plan: string;
    primaryRegion: string | null;
    createdAt: string | null;
  } | null;
  notes: ExportedNote[];
  bookmarks: { targetType: string; targetId: string; label: string | null; createdAt: string }[];
  watchlist: {
    complexId: string;
    complexName: string;
    alertPriceMin: number | null;
    alertPriceMax: number | null;
    createdAt: string;
  }[];
  alerts: { type: string; value: string; createdAt: string | null }[];
  points: {
    delta: number;
    reason: string;
    refId: string | null;
    balance: number;
    createdAt: string;
    expiresAt: string | null;
  }[];
  payments: PaymentLike[];
  notificationPrefs: Record<string, unknown> | null;
  /**
   * [1008 · J] user_preferences — 설정 › 표시·기록 기본값(displayDefaults)과 내 집 마련 여정(journey: 단계 체크 시각,
   * 계약·잔금 일정표의 날짜·매매가·체크). 저장한 적 없는 칸은 null.
   */
  preferences: { displayDefaults: Record<string, unknown> | null; journey: Record<string, unknown> | null } | null;
  /** 조회에 실패한 원천 — 이 목록에 있는 항목은 "없음"이 아니라 "못 읽음" */
  errors: { source: ExportSourceName; message: string }[];
};

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 알림 설정 중 사용자 것이 아닌 내부 필드(이메일·갱신 시각)는 뺀다 */
const PREF_INTERNAL_KEYS = new Set(["userEmail", "updatedAt", "smsConsentAt"]);

export function buildExportPayload(input: ExportInput): ExportPayload {
  const errors: ExportPayload["errors"] = [];
  const take = <T,>(source: ExportSourceName, r: SourceResult<T>): T | null => {
    if (r.ok) return r.value;
    errors.push({ source, message: r.error || "조회 실패" });
    return null;
  };

  const profile = take("profile", input.profile);
  const notes = take("notes", input.notes) ?? [];
  const bookmarks = take("bookmarks", input.bookmarks) ?? [];
  const watchlist = take("watchlist", input.watchlist) ?? [];
  const alerts = take("alerts", input.alerts) ?? [];
  const points = take("points", input.points) ?? [];
  const payments = take("payments", input.payments) ?? [];
  const prefs = take("notificationPrefs", input.notificationPrefs);
  const userPrefs = input.preferences ? take("preferences", input.preferences) : null;

  return {
    format: "naezipnow-export",
    version: EXPORT_FORMAT_VERSION,
    generatedAt: input.generatedAt,
    account: { email: input.email },
    profile:
      profile && sameEmail(profile.email, input.email)
        ? {
            name: profile.name ?? null,
            email: profile.email,
            plan: profile.plan,
            primaryRegion: profile.primaryRegion ?? null,
            createdAt: profile.createdAt ?? null,
          }
        : null,
    notes: notes
      .filter((n) => sameEmail(n.authorEmail, input.email))
      .map((n) => {
        const d = decisionFromMetadata(n.metadata);
        return {
          id: n.id,
          title: n.title,
          region: n.region,
          complex: n.aptName?.trim() || null,
          visitDate: n.visitDate,
          isPublic: Boolean(n.isPublic),
          summary: n.summary ?? null,
          decision: d ? { choice: d.choice, reasons: [...d.reasons], decidedAt: d.decidedAt } : null,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        };
      }),
    bookmarks: bookmarks
      .filter((b) => sameEmail(b.userEmail, input.email))
      .map((b) => ({
        targetType: b.targetType,
        targetId: b.targetId,
        label: b.label ?? null,
        createdAt: b.createdAt,
      })),
    watchlist: watchlist
      .filter((w) => sameEmail(w.userEmail, input.email))
      .map((w) => ({
        complexId: w.complexId,
        complexName: w.complexName,
        alertPriceMin: w.alertPriceMin ?? null,
        alertPriceMax: w.alertPriceMax ?? null,
        createdAt: w.createdAt,
      })),
    alerts: alerts.map((a) => ({ type: a.type, value: a.value, createdAt: a.createdAt ?? null })),
    points: points.slice(0, EXPORT_LEDGER_LIMIT).map((r) => ({
      delta: r.delta,
      reason: r.reason,
      refId: r.refId,
      balance: r.balance,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
    payments: payments.slice(0, EXPORT_PAYMENTS_LIMIT).map((p) => ({
      id: p.id,
      orderId: p.orderId,
      plan: p.plan,
      billing: p.billing,
      amount: p.amount,
      status: p.status,
      method: p.method,
      receiptUrl: p.receiptUrl,
      requestedAt: p.requestedAt,
      paidAt: p.paidAt,
      cancelledAt: p.cancelledAt,
    })),
    notificationPrefs: prefs
      ? Object.fromEntries(Object.entries(prefs).filter(([k]) => !PREF_INTERNAL_KEYS.has(k)))
      : null,
    preferences: userPrefs
      ? {
          /* 기본값(저장 시각 없음)은 "설정한 적 없음" — 기본값을 내 설정인 것처럼 내보내지 않는다 */
          displayDefaults: userPrefs.uiPrefs && userPrefs.uiPrefs.updatedAt ? { ...userPrefs.uiPrefs } : null,
          journey: userPrefs.journey ? { ...userPrefs.journey } : null,
        }
      : null,
    errors,
  };
}

/** `naezipnow-export-YYYYMMDD.json` — 한국 날짜 기준 */
export function exportFilename(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `naezipnow-export-${get("year")}${get("month")}${get("day")}.json`;
}

/** Promise 결과를 SourceResult 로 — route.ts 의 allSettled 결과를 받는다 */
export function settledToSource<T>(r: PromiseSettledResult<T>): SourceResult<T> {
  if (r.status === "fulfilled") return { ok: true, value: r.value };
  const reason = r.reason;
  const message =
    reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "조회 실패";
  return { ok: false, error: message };
}
