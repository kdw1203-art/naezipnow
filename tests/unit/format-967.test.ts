import { test } from "node:test";
import assert from "node:assert/strict";
import { formatKrwManwon, formatKrwWon, type KrwFormatOptions } from "../../lib/format/krw.ts";
import { relativeTimeLabel, type RelativeTimeOptions } from "../../lib/format/relative-time.ts";
import { formatKrwShort } from "../../lib/market/format.ts";
import { formatPriceKrw, formatRentLabel } from "../../lib/listings/format.ts";
import { formatKrwEok } from "../../lib/dev-deals/types.ts";
import { formatPriceKrw as formatPlanPriceKrw } from "../../lib/subscriptions/format-plan-price.ts";
import { formatManwon } from "../../lib/complex/hub-trades.ts";
import { manwonLabel } from "../../lib/map/filter-summary.ts";

/* [967 · 31]·[967 · 32] 포맷터 통합 회귀 — "화면 문자열은 한 글자도 안 바뀐다" 증명.
 *
 * 아래 `legacy` 블록은 통합 전 각 파일에 있던 함수를 **그대로**(이름만 바꿔) 옮긴
 * 사본이다. 새 공통 함수가 같은 입력에서 같은 문자열을 내는지 호출부별 모드로 대조한다.
 * 상대시각 사본은 내부의 Date.now() 만 `now` 인자로 바꿨다(그 외 동일).
 *
 * 서버 전용 모듈(lib/ai/market-insight · lib/notes/feed-note 등)은 node:test 에서 로드할 수
 * 없어(server-only · next/cache) 그 래퍼는 여기서 직접 부르지 못한다 — 대신 래퍼가 넘기는
 * 옵션과 같은 모드를 공통 함수로 대조한다. 순수 모듈의 래퍼는 직접 대조한다. */

/* ------------------------------------------------------------------ */
/* [967 · 31] 억/만원                                                    */
/* ------------------------------------------------------------------ */

const legacy = {
  /* lib/market/format.ts formatKrwShort — app 8곳 사본과 동일 */
  short(krw: number | null | undefined): string {
    if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
    if (krw >= 1e8) {
      const eok = krw / 1e8;
      return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
    }
    return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
  },
  /* app/admin/revenue/page.tsx won */
  adminRevenueWon(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0원";
    if (n >= 1e8) {
      const eok = n / 1e8;
      return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
    }
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
    return `${Math.round(n).toLocaleString("ko-KR")}원`;
  },
  /* lib/listings/format.ts formatPriceKrw */
  listing(won: number): string {
    if (!Number.isFinite(won) || won <= 0) return "—";
    if (won >= 100_000_000) {
      const eok = won / 100_000_000;
      return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
    }
    return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
  },
  /* lib/redevelopment/nearby.ts eokMan · app/api/map/listing(s) eokMan(Label) */
  listingDash(krw: number | null): string {
    if (krw == null || !Number.isFinite(krw) || krw <= 0) return "-";
    if (krw >= 100_000_000) {
      const eok = krw / 100_000_000;
      return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
    }
    return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
  },
  /* app/map/map-client.tsx manwonLabel · ComplexInfoPanel · analysis/ComplexPicker */
  listingManwonNull(manwon: number | null | undefined): string | null {
    if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
    if (manwon >= 10_000) {
      const eok = manwon / 10_000;
      return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
    }
    return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
  },
  /* app/map/map-client.tsx wonShort — 억 정수부 천단위 구분 없음 */
  wonShortNoGroup(krw: number | null): string | null {
    if (krw == null || !Number.isFinite(krw) || krw <= 0) return null;
    if (krw >= 100_000_000) {
      const eok = krw / 100_000_000;
      return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
    }
    return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
  },
  /* app/map/map-client.tsx manwonShort — 방어 없음·구분 없음 */
  manwonShortNoGuard(manwon: number): string {
    if (manwon >= 10_000) {
      const eok = manwon / 10_000;
      return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
    }
    return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
  },
  /* app/map/MapSearchBox.tsx priceLabel */
  mapSearchPriceLabel(manwon: number | null | undefined): string | null {
    if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
    if (manwon >= 10_000) {
      const eok = manwon / 10_000;
      return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
    }
    return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
  },
  /* lib/ai/market-insight formatEokWon · lib/newui/home-data formatEok · digest · recommend-data ·
     ScenarioClient eok · lib/agent/tools eok — 방어 없음, 1억 미만도 억 */
  eokWon(won: number): string {
    const eok = won / 100_000_000;
    const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
    return `${s.replace(/\.?0+$/, "")}억`;
  },
  /* app/analysis/price/page.tsx eok · app/reports/season eok */
  eokWonGuard(won: number): string {
    if (!won || won <= 0) return "—";
    const e = won / 100_000_000;
    const s = e >= 10 ? e.toFixed(1) : e.toFixed(2);
    return `${s.replace(/\.?0+$/, "")}억`;
  },
  /* app/reports/[ym]/page.tsx eok — null·0 이하만 방어 */
  eokWonNullOrZero(krw: number | null): string {
    if (krw === null || krw <= 0) return "—";
    const e = krw / 100_000_000;
    return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
  },
  /* app/analysis/compare/page.tsx fmtEok — null 만 방어(0 → "0억") */
  eokWonNullOnly(krw: number | null): string {
    if (krw === null) return "—";
    const e = krw / 100_000_000;
    return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
  },
  /* lib/inspection/deep-dive.ts manwonText — "-" · 만원 */
  deepDiveManwon(man: number | null | undefined): string {
    if (typeof man !== "number" || !Number.isFinite(man) || man <= 0) return "-";
    if (man >= 10_000) {
      const eok = man / 10_000;
      const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
      return `${s.replace(/\.?0+$/, "")}억`;
    }
    return `${Math.round(man).toLocaleString("ko-KR")}만원`;
  },
  /* lib/market/watchlist-brief.ts · price-record-watch.ts krwEok — 뒤 0 유지 */
  krwEokRaw(v: number): string {
    const eok = v / 100_000_000;
    return eok >= 10 ? `${eok.toFixed(1)}억` : `${eok.toFixed(2)}억`;
  },
  /* lib/complex/hub-trades.ts formatManwon · PriceTrendChart fmtEok · app/map/page formatManwon ·
     embed/complex formatManwon */
  manwonEok1(manwon: number): string {
    if (!Number.isFinite(manwon) || manwon <= 0) return "—";
    if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
    return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
  },
  /* app/complex/[id]/ComplexAreaBands.tsx manwon — 만 분기에 반올림 없음(입력은 항상 정수) */
  areaBandsManwon(m: number): string {
    if (!Number.isFinite(m) || m <= 0) return "—";
    if (m >= 10000) return `${(m / 10000).toFixed(1).replace(/\.0$/, "")}억`;
    return `${m.toLocaleString("ko-KR")}만`;
  },
  /* app/search/search-client.tsx 인라인 — 만 분기에 반올림 없음(입력은 bigint) */
  searchInline(v: number): string {
    return v >= 10_000
      ? `${(v / 10_000).toFixed(1).replace(/\.0$/, "")}억`
      : `${v.toLocaleString("ko-KR")}만`;
  },
  /* app/complex/[id]/ComplexRentSection.tsx fmtEok */
  rentEok(krw: number | null): string {
    if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
    const eok = krw / 100_000_000;
    if (eok >= 1) return `${eok.toFixed(1).replace(/\.0$/, "")}억`;
    return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
  },
  /* lib/ai/note-draft-core.ts fmtManwon — 방어 없음 · 만원 */
  noteDraftManwon(krw: number): string {
    const eok = krw / 100_000_000;
    return eok >= 1
      ? `${eok.toFixed(1).replace(/\.0$/, "")}억`
      : `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만원`;
  },
  /* lib/social/autopost.ts · lib/content/weekly-post.ts · app/api/og/complex-trend eok */
  eok1Only(n: number): string {
    return `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억`;
  },
  /* lib/dev-deals/types.ts formatKrwEok (toLocaleString() 기본 로케일 → ko-KR 고정) */
  devDeals(krw: number | null | undefined): string {
    if (krw == null || !Number.isFinite(krw) || krw <= 0) return "미정";
    const JO = 1e12;
    const EOK = 1e8;
    if (krw >= JO) {
      const jo = Math.floor(krw / JO);
      const remEok = Math.round((krw - jo * JO) / EOK);
      return remEok > 0
        ? `${jo.toLocaleString("ko-KR")}조 ${remEok.toLocaleString("ko-KR")}억`
        : `${jo.toLocaleString("ko-KR")}조`;
    }
    if (krw >= EOK) {
      const eok = krw / EOK;
      const rounded = eok % 1 === 0 ? eok : Math.round(eok * 10) / 10;
      return `${rounded.toLocaleString("ko-KR")}억`;
    }
    const man = Math.round(krw / 1e4);
    return `${man.toLocaleString("ko-KR")}만`;
  },
  /* lib/subscriptions/format-plan-price.ts formatPriceKrw */
  planPrice(amount: number): string {
    if (amount <= 0) return "무료";
    return `₩${amount.toLocaleString("ko-KR")}`;
  },
  /* lib/map/filter-summary.ts manwonLabel — Number(toFixed(1)) 로 ".0" 을 지운다 */
  filterSummary(manwon: number): string {
    if (manwon >= 10_000) {
      const eok = manwon / 10_000;
      return `${eok >= 10 ? Math.round(eok) : Number(eok.toFixed(1))}억`;
    }
    return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
  },
};

/* 대표 입력 — 0·음수·NaN·null/undefined·1만 미만·1만~1억·1억 이상 비정수·10억·100억·1조 경계·소수 */
const WON_INPUTS: number[] = [
  0, -1, -50_000_000, -250_000_000, NaN, 1, 9_999, 10_000, 15_000, 123_456, 123_456.7, 4_999_999,
  5_000_000, 50_000_000, 84_950_000, 85_000_000, 99_994_999, 99_995_000, 99_999_999,
  100_000_000, 100_400_000, 105_000_000, 123_456_789, 800_000_000, 845_000_000, 849_500_000,
  850_000_000, 999_949_999, 999_950_000, 999_999_999, 1_000_000_000, 1_004_000_000,
  1_050_000_000, 1_234_567_890, 1_250_000_000, 2_500_000_000, 9_949_999_999, 9_950_000_000,
  9_999_999_999, 10_000_000_000, 12_345_678_900, 12_350_000_000, 99_999_999_999,
  100_000_000_000, 123_456_789_012, 123_450_000_000, 999_999_999_999, 1_000_000_000_000,
  1_500_000_000_000, 1_234_567_890_123, 2_000_050_000_000,
];
const MANWON_INPUTS: number[] = [
  0, -5, -12_345, NaN, 1, 499.5, 500, 8_200, 8_200.4, 9_999, 9_999.5, 10_000, 10_049, 10_050,
  12_345, 12_345.6, 84_500, 84_950, 99_999, 100_000, 100_049, 100_050, 123_456, 999_999,
  1_000_000, 1_000_049, 1_234_567, 9_999_999, 12_345_678,
];

function parity<T>(
  name: string,
  inputs: T[],
  oldFn: (v: T) => string | null,
  newFn: (v: T) => string | null,
) {
  test(`[967 · 31] parity — ${name}`, () => {
    for (const v of inputs) assert.equal(newFn(v), oldFn(v), `${name}(${String(v)})`);
  });
}

const won = (opts: KrwFormatOptions) => (v: number | null | undefined) => formatKrwWon(v, opts);
const man = (opts: KrwFormatOptions) => (v: number | null | undefined) => formatKrwManwon(v, opts);
const NULLISH: Array<number | null | undefined> = [null, undefined];

parity("short(lib/market/format + 8 app 사본)", [...WON_INPUTS, ...NULLISH], legacy.short, won({}));
parity("short — 래퍼 formatKrwShort", [...WON_INPUTS, ...NULLISH], legacy.short, formatKrwShort);
parity(
  "admin/revenue won",
  WON_INPUTS,
  legacy.adminRevenueWon,
  (n) => {
    /* 래퍼와 같은 모양 — 1만 미만 "N원" 분기는 페이지 고유 */
    if (!Number.isFinite(n) || n <= 0) return "0원";
    if (n < 1e4) return `${Math.round(n).toLocaleString("ko-KR")}원`;
    return formatKrwWon(n);
  },
);
parity("listing(lib/listings/format)", WON_INPUTS, legacy.listing, won({ style: "listing" }));
parity("listing — 래퍼 formatPriceKrw", WON_INPUTS, legacy.listing, formatPriceKrw);
parity("listing '-'(nearby · api/map)", [...WON_INPUTS, null], legacy.listingDash, won({ style: "listing", empty: "-" }));
parity(
  "listing null(map-client manwonLabel · ComplexInfoPanel · ComplexPicker)",
  [...MANWON_INPUTS, ...NULLISH],
  legacy.listingManwonNull,
  (v) => (v == null || !Number.isFinite(v) || v <= 0 ? null : formatKrwManwon(v, { style: "listing" })),
);
parity(
  "listing no-group won(map-client wonShort)",
  [...WON_INPUTS, null],
  legacy.wonShortNoGroup,
  (v) => (v == null || !Number.isFinite(v) || v <= 0 ? null : formatKrwWon(v, { style: "listing", groupEok: false })),
);
parity(
  "listing no-group no-guard(map-client manwonShort)",
  MANWON_INPUTS,
  legacy.manwonShortNoGuard,
  man({ style: "listing", groupEok: false, empty: false }),
);
parity(
  "listing no-group null(MapSearchBox priceLabel)",
  [...MANWON_INPUTS, ...NULLISH],
  legacy.mapSearchPriceLabel,
  (v) => (v == null || !Number.isFinite(v) || v <= 0 ? null : formatKrwManwon(v, { style: "listing", groupEok: false })),
);
parity("eok 무방어(market-insight · home-data · digest · recommend · scenario · agent/tools)", WON_INPUTS, legacy.eokWon, won({ style: "eok", below: "eok", empty: false }));
parity("eok 방어(analysis/price · reports/season)", WON_INPUTS, legacy.eokWonGuard, won({ style: "eok", below: "eok" }));
parity(
  "eok null·0 방어(reports/[ym]) — NaN 제외(옛 구현은 'NaN억')",
  [...WON_INPUTS.filter((v) => !Number.isNaN(v)), null],
  legacy.eokWonNullOrZero,
  won({ style: "eok", below: "eok" }),
);
parity(
  "eok null 만 방어(analysis/compare)",
  [...WON_INPUTS, null],
  legacy.eokWonNullOnly,
  (v) => (v === null ? "—" : formatKrwWon(v, { style: "eok", below: "eok", empty: false })),
);
parity("eok '-'·만원(deep-dive manwonText)", [...MANWON_INPUTS, ...NULLISH], legacy.deepDiveManwon, man({ style: "eok", manUnit: "만원", empty: "-" }));
parity("eok 뒤 0 유지(watchlist-brief · price-record-watch)", WON_INPUTS, legacy.krwEokRaw, won({ style: "eok", below: "eok", empty: false, trimZeros: false }));
parity("eok1 manwon(hub-trades · PriceTrendChart · map/page · embed)", MANWON_INPUTS, legacy.manwonEok1, man({ style: "eok1" }));
parity("eok1 — 래퍼 formatManwon", MANWON_INPUTS, legacy.manwonEok1, formatManwon);
parity(
  "eok1 ComplexAreaBands(정수 입력)",
  MANWON_INPUTS.filter((v) => Number.isInteger(v) || Number.isNaN(v)),
  legacy.areaBandsManwon,
  man({ style: "eok1" }),
);
parity(
  "eok1 search-client 인라인(양의 정수 입력 — 호출부가 >0 을 먼저 거른다)",
  MANWON_INPUTS.filter((v) => Number.isInteger(v) && v > 0),
  legacy.searchInline,
  man({ style: "eok1" }),
);
parity("eok1 won(ComplexRentSection)", [...WON_INPUTS, null], legacy.rentEok, won({ style: "eok1" }));
parity("eok1 만원 무방어(note-draft-core)", WON_INPUTS, legacy.noteDraftManwon, won({ style: "eok1", manUnit: "만원", empty: false }));
parity("eok1 억만 무방어(autopost · weekly-post · og)", WON_INPUTS, legacy.eok1Only, won({ style: "eok1", below: "eok", empty: false }));
parity("jo(dev-deals)", [...WON_INPUTS, ...NULLISH], legacy.devDeals, won({ style: "jo", empty: "미정" }));
parity("jo — 래퍼 formatKrwEok", [...WON_INPUTS, ...NULLISH], legacy.devDeals, formatKrwEok);
parity(
  "currency(plan price) — NaN 제외(옛 구현은 '₩NaN')",
  WON_INPUTS.filter((v) => !Number.isNaN(v)),
  legacy.planPrice,
  won({ style: "currency", empty: "무료" }),
);
parity("currency — 래퍼 formatPriceKrw", WON_INPUTS.filter((v) => !Number.isNaN(v)), legacy.planPrice, formatPlanPriceKrw);
parity("filter-summary manwonLabel(그대로 둔 함수 — 회귀 고정)", MANWON_INPUTS, legacy.filterSummary, manwonLabel);

test("[967 · 31] 대표 문자열 — 모드별 얼굴이 서로 다르다는 사실을 문서화", () => {
  /* 8.45억 — Math.round(84.5)=85 인 short 와, 이진수로 8.45 가 살짝 작아 "8.4" 가 되는
     toFixed(1) 계열이 갈린다. 옛 구현의 이 얼굴을 그대로 둔다(반올림을 "고치지" 않는다) */
  const v = 845_000_000;
  assert.equal(formatKrwWon(v), "8.5억");
  assert.equal(formatKrwWon(v, { style: "listing" }), "8.4억");
  assert.equal(formatKrwWon(v, { style: "eok", below: "eok" }), "8.45억");
  assert.equal(formatKrwWon(v, { style: "eok1" }), "8.4억");
  assert.equal(formatKrwWon(800_000_000, { style: "listing" }), "8.0억");
  assert.equal(formatKrwWon(800_000_000), "8억");
  assert.equal(formatKrwWon(123_456_789_012), "1,235억");
  assert.equal(formatKrwWon(123_456_789_012, { style: "listing" }), "1,235억");
  assert.equal(formatKrwWon(123_456_789_012, { style: "eok", below: "eok" }), "1234.6억");
  assert.equal(formatKrwWon(123_456_789_012, { style: "jo" }), "1,234.6억");
  assert.equal(formatKrwWon(1_500_000_000_000, { style: "jo" }), "1조 5,000억");
  assert.equal(formatKrwWon(50_000_000), "5,000만");
  assert.equal(formatKrwWon(50_000_000, { style: "eok", below: "eok" }), "0.5억");
  assert.equal(formatKrwWon(50_000_000, { manUnit: "만원" }), "5,000만원");
  assert.equal(formatKrwWon(0), "—");
  assert.equal(formatKrwWon(0, { empty: "미정" }), "미정");
  assert.equal(formatKrwWon(0, { style: "eok", below: "eok", empty: false }), "0억");
  assert.equal(formatKrwWon(null), "—");
  assert.equal(formatKrwWon(9_900, { style: "currency", empty: "무료" }), "₩9,900");
  assert.equal(formatKrwManwon(12_345), "1.2억");
  assert.equal(formatKrwManwon(12_345_678, { style: "eok1" }), "1234.6억");
  assert.equal(formatRentLabel(50_000_000, 850_000), "5,000만/85만");
});

/* ------------------------------------------------------------------ */
/* [967 · 32] 상대 시각                                                  */
/* ------------------------------------------------------------------ */

const legacyTime = {
  /* lib/notes/feed-note.ts relativeTime */
  feed(iso: string, now: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diffMs = now - t;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day === 1) return "어제";
    if (day < 31) return `${day}일 전`;
    return iso.slice(0, 10);
  },
  /* app/town/shared.tsx relativeTime (app/town/news/[id]/page.tsx 사본은 방어만 없음) */
  town(iso: string, now: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const min = Math.floor((now - t) / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    return new Date(t).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  },
  /* app/town/news/[id]/page.tsx relativeTime — 유효 입력에서만 대조 */
  newsDetail(iso: string, now: number) {
    const diff = now - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    return new Date(iso).toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    });
  },
  /* app/town/[region]/page.tsx relTime */
  townHome(iso: string, now: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = now - t;
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "방금";
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}일 전`;
    return new Date(t).toISOString().slice(5, 10).replace("-", ".");
  },
  /* app/my/consultations/page.tsx · app/my/leads/page.tsx timeAgo */
  my(iso: string, now: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = now - t;
    if (diff < 60_000) return "방금 전";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
    const d = new Date(t);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  },
  /* app/complex/[id]/ComplexQna.tsx timeAgo */
  qnaComment(iso: string, now: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = now - t;
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
    const d = new Date(t);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  },
  /* app/components/home/ResumeDraftPopup.tsx savedAgo */
  draft(iso: string, now: number): string | null {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const diff = now - t;
    if (diff < 0) return null;
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    return `${Math.floor(diff / 86_400_000)}일 전`;
  },
  /* lib/newui/admin-metrics.ts relativeLabel */
  admin(iso: string | null, now: number): string {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return "대기";
    const mins = Math.max(0, Math.round((now - t) / 60_000));
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.round(hours / 24)}일 전`;
  },
  /* app/qna/page.tsx · app/qna/[id]/page.tsx shortDate */
  qna(iso: string, now: number): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = now - d.getTime();
    const day = 24 * 60 * 60 * 1000;
    if (diff < day) {
      const h = Math.floor(diff / (60 * 60 * 1000));
      return h < 1 ? "방금 전" : `${h}시간 전`;
    }
    if (diff < 30 * day) return `${Math.floor(diff / day)}일 전`;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  },
  /* app/town/prompt/[idx]/page.tsx relativeDay — 유효 입력에서만 대조 */
  promptDay(iso: string, now: number): string {
    const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
    if (days <= 0) return "오늘";
    if (days === 1) return "어제";
    if (days < 30) return `${days}일 전`;
    return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  },
};

/* 고정 now — 로컬 시간대 날짜 폴백은 옛/새 구현이 같은 API 를 쓰므로 TZ 와 무관하게 일치한다.
   정오(UTC) 로 잡아 아래 "대표 문자열" 의 날짜 리터럴도 어느 TZ 에서든 같은 날이 되게 한다 */
const NOW = Date.parse("2026-08-26T12:00:00Z");
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;
/* 경계 전후 — 미래·0·59s·60s·61s·59m·60m·90m·23h·24h·25h·47h·48h·6d·7d·29d·30d·31d·365d */
const OFFSETS_MS: number[] = [
  -H, -1 * S, 0, 1 * S, 29 * S, 30 * S, 31 * S, 59 * S, 59 * S + 999, 60 * S, 61 * S, 89 * S + 999, 90 * S,
  119 * S, 2 * M, 29 * M + 29 * S, 29 * M + 31 * S, 59 * M, 59 * M + 59 * S, 60 * M, 61 * M,
  89 * M + 29 * S, 89 * M + 31 * S, 90 * M, 119 * M, 2 * H, 12 * H, 23 * H, 23 * H + 29 * M, 23 * H + 31 * M,
  23 * H + 59 * M + 59 * S, 24 * H, 24 * H + 1 * S, 25 * H, 35 * H, 36 * H, 37 * H, 47 * H + 59 * M, 48 * H,
  2 * D + 11 * H, 2 * D + 13 * H, 6 * D, 6 * D + 23 * H + 59 * M, 7 * D, 7 * D + 1 * S, 8 * D, 29 * D,
  29 * D + 23 * H, 30 * D, 30 * D + 1 * S, 31 * D, 45 * D, 365 * D, 400 * D,
];
const ISO_INPUTS = OFFSETS_MS.map((off) => new Date(NOW - off).toISOString());
const BAD_INPUTS = ["", "not-a-date", "2026-13-45"];

function timeParity(
  name: string,
  inputs: string[],
  oldFn: (iso: string, now: number) => string | null,
  newFn: (iso: string, now: number) => string | null,
) {
  test(`[967 · 32] parity — ${name}`, () => {
    for (const iso of inputs) assert.equal(newFn(iso, NOW), oldFn(iso, NOW), `${name}(${iso})`);
  });
}

const rel = (opts: RelativeTimeOptions) => (iso: string, now: number) => relativeTimeLabel(iso, now, opts);
const ALL = [...ISO_INPUTS, ...BAD_INPUTS];

timeParity("feed-note relativeTime", ALL, legacyTime.feed, rel({ yesterday: true, maxDays: 31, fallback: "iso-date" }));
timeParity("town/shared relativeTime", ALL, legacyTime.town, rel({ fallback: "md-ko" }));
timeParity("town/news/[id] relativeTime(유효 입력)", ISO_INPUTS, legacyTime.newsDetail, rel({ fallback: "md-ko" }));
timeParity("town/[region] relTime", ALL, legacyTime.townHome, rel({ unit: "hour", justNow: "방금", maxDays: 30, fallback: "md-utc" }));
timeParity("my/consultations · my/leads timeAgo", ALL, legacyTime.my, rel({}));
timeParity("ComplexQna timeAgo", ALL, legacyTime.qnaComment, rel({ minOneMinute: true }));
timeParity(
  "ResumeDraftPopup savedAgo",
  ALL,
  legacyTime.draft,
  (iso, now) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || now - t < 0) return null;
    return relativeTimeLabel(t, now, { minOneMinute: true, maxDays: Infinity });
  },
);
timeParity("admin-metrics relativeLabel", ALL, legacyTime.admin, rel({ round: true, maxDays: Infinity, invalid: "대기" }));
test("[967 · 32] parity — admin-metrics relativeLabel(null)", () => {
  assert.equal(relativeTimeLabel(NaN, NOW, { round: true, maxDays: Infinity, invalid: "대기" }), "대기");
});
timeParity("qna shortDate", ALL, legacyTime.qna, rel({ unit: "hour", maxDays: 30 }));
timeParity("town/prompt relativeDay(유효 입력)", ISO_INPUTS, legacyTime.promptDay, rel({ unit: "day", yesterday: true, maxDays: 30, fallback: "md-long" }));

test("[967 · 32] 대표 문자열 — 모드별 얼굴", () => {
  const at = (off: number) => new Date(NOW - off).toISOString();
  assert.equal(relativeTimeLabel(at(30 * S), NOW), "방금 전");
  assert.equal(relativeTimeLabel(at(30 * S), NOW, { justNow: "방금" }), "방금");
  assert.equal(relativeTimeLabel(at(30 * S), NOW, { minOneMinute: true }), "1분 전");
  assert.equal(relativeTimeLabel(at(30 * S), NOW, { round: true }), "1분 전");
  assert.equal(relativeTimeLabel(at(10 * S), NOW, { round: true }), "0분 전");
  assert.equal(relativeTimeLabel(at(59 * M), NOW), "59분 전");
  assert.equal(relativeTimeLabel(at(59 * M), NOW, { unit: "hour" }), "방금 전");
  assert.equal(relativeTimeLabel(at(60 * M), NOW), "1시간 전");
  assert.equal(relativeTimeLabel(at(24 * H), NOW), "1일 전");
  assert.equal(relativeTimeLabel(at(24 * H), NOW, { yesterday: true }), "어제");
  assert.equal(relativeTimeLabel(at(24 * H), NOW, { unit: "day" }), "1일 전");
  assert.equal(relativeTimeLabel(at(6 * D), NOW), "6일 전");
  assert.equal(relativeTimeLabel(at(7 * D), NOW), "2026.08.19");
  assert.equal(relativeTimeLabel(at(7 * D), NOW, { maxDays: 30 }), "7일 전");
  assert.equal(relativeTimeLabel(at(7 * D), NOW, { fallback: "md-utc" }), "08.19");
  assert.equal(relativeTimeLabel(at(7 * D), NOW, { fallback: "iso-date" }), "2026-08-19");
  assert.equal(relativeTimeLabel(at(7 * D), NOW, { fallback: "md-ko" }), "08. 19.");
  assert.equal(relativeTimeLabel(at(7 * D), NOW, { fallback: "md-long" }), "8월 19일");
  assert.equal(relativeTimeLabel(at(400 * D), NOW, { maxDays: Infinity }), "400일 전");
  assert.equal(relativeTimeLabel(at(-H), NOW), "방금 전");
  assert.equal(relativeTimeLabel("nope", NOW), "");
  assert.equal(relativeTimeLabel("nope", NOW, { invalid: "대기" }), "대기");
  /* 서버 컴포넌트가 now 를 넘기면 결과가 시계와 무관하게 고정된다 */
  assert.equal(relativeTimeLabel(new Date(NOW - 5 * M), NOW), "5분 전");
  assert.equal(relativeTimeLabel(NOW - 5 * M, NOW), "5분 전");
});
