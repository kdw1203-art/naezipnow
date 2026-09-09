/**
 * 화면(라우트) 단위 Web Vitals 장부.
 *
 * ── 왜 필요했나 (2026-09-08 실측) ───────────────────────────────────────────
 * 리포터는 지표를 보낼 때 `window.location.pathname` 을 그대로 실었다. 그런데
 * CLS·INP 는 **문서 수명 전체**를 누적하는 지표이고, web-vitals 는 그 값을
 * 페이지가 숨는 순간에 한 번 확정한다. 앱 라우터에서 화면을 옮기는 것은 새 문서를
 * 여는 게 아니므로, 한 번의 방문에서 쌓인 CLS 가 **마지막으로 머문 화면**의 것으로
 * 기록된다.
 *
 * 헤드리스 크롬으로 그대로 재현했다(2026-09-08, 모바일 390×844 · CPU 4배 감속):
 *   홈(/)에서 CLS 0.0199 가 쌓임 → 링크로 /map 이동 → 페이지 숨김
 *   → 리포터가 보낸 것: `CLS value=0.02 path=/map
 *      el=a.btn-primary.glow…rise-in-3` (홈에만 있는 요소다)
 *
 * 그래서 운영 콘솔의 "화면별 CLS" 는 **그 화면에서 생긴 흔들림**이 아니라
 * "그 화면에서 방문이 끝난 사람의 방문 전체 흔들림" 이었다. /auctions CLS 1.374
 * (n=1, 대상 `#main-content`), /map 평균 0.544 같은 값이 그렇게 만들어진다.
 * ops.cwv_page_check 의 경보와 소유자 알림도 같은 표를 읽는다.
 *
 * ── 어떻게 고치나 ──────────────────────────────────────────────────────────
 * web-vitals 는 `metric.delta`(마지막으로 보고한 값과의 차이)를 준다. 공식 문서가
 * 분석 도구에 합산용으로 쓰라고 안내하는 값이다. `reportAllChanges: true` 로 받아
 * **그 시점에 보고 있던 화면의 통**에 delta 를 더한다. 화면을 옮기거나 페이지가
 * 숨을 때 통을 비워 보낸다 → 화면별 값의 합 = 문서 전체 CLS.
 *
 * 한 번만 확정되는 지표(LCP·FCP·TTFB)는 **문서가 처음 연 화면**의 것이다. 값이
 * 늦게 확정된다는 이유로 그때 보고 있던 화면에 달면 안 된다. 예외는 bfcache
 * 복귀(`navigationType === "back-forward-cache"`) — 그때는 web-vitals 가 지표를
 * 다시 재는 것이고, 다시 재는 대상은 지금 화면이다.
 *
 * ── 왜 문서 단위 줄도 같이 보내는가 ────────────────────────────────────────
 * 화면 단위로 쪼개면 **단위가 바뀐다**. 예전 한 줄(방문당 CLS)이 여러 줄(화면당
 * CLS)이 되므로, 같은 표를 주 단위로 집계하는 seo 필드 성능 시계열
 * (public.capture_seo_field_perf_rum)의 p75 가 사이트가 좋아진 것도 아닌데
 * 내려앉는다. 구글 CrUX 가 재는 단위도 **문서 하나**다.
 * 그래서 숨는 순간 문서 전체 값을 `scope: "doc"` 한 줄로 따로 남긴다.
 *   · 화면별 콘솔·경보 → scope "route" (CLS·INP) + scope "doc" (LCP)
 *   · 주간 시계열      → scope "doc" + 옛 표본(NULL) — 단위가 같아 선이 이어진다
 *
 * 이 파일에는 브라우저 API 가 없다 — 시각은 인자로 받는다. 그래야 테스트가 된다
 * (tests/unit/vitals-route-979.test.ts). 전송은 리포터가 한다.
 */

/** 이 줄이 재는 단위 — 화면 하나인가, 문서(방문) 하나인가 */
export type VitalScope = "route" | "doc";

export type RouteVitalSample = {
  metric: string;
  value: number;
  rating: string | null;
  path: string;
  /** 이 방문에서 몇 번째 화면인가 — 0 이면 문서가 처음 연 화면 */
  navIndex: number;
  /**
   * 문서의 navigationType(navigate·reload·back-forward…) 또는 `"soft-nav"`.
   *
   * navIndex > 0 은 문서를 새로 연 것이 아니라 앱 라우터가 화면만 바꾼 것이다.
   * 그 줄에 문서의 navigationType 을 그대로 적으면 "이 화면을 새로 열었을 때의
   * 값" 으로 읽히므로 `soft-nav` 라고 사실대로 적는다.
   */
  navType: string | null;
  scope: VitalScope;
  element: string | null;
  attrUrl: string | null;
};

export type VitalInput = {
  name: string;
  value: number;
  delta?: number;
  rating?: string | null;
  navType?: string | null;
  element?: string | null;
  attrUrl?: string | null;
};

/** 클라이언트 라우팅으로 옮겨 온 화면 — 문서 로드가 아니다 */
export const SOFT_NAV = "soft-nav";

/** 지나가기만 한 화면(이만큼도 머물지 않음)은 0 을 보내지 않는다 — 아래 drain 주석 참고 */
export const MIN_DWELL_MS = 1500;

type Sum = {
  value: number;
  rating: string | null;
  element: string | null;
  attrUrl: string | null;
  /** 지금까지 본 가장 큰 delta — 범인 요소를 이걸로 고른다 */
  biggest: number;
};
type Worst = { value: number; rating: string | null; element: string | null; attrUrl: string | null };

type Bucket = {
  path: string;
  navIndex: number;
  enteredAt: number;
  /** CLS 처럼 더해지는 지표 */
  sums: Map<string, Sum>;
  /** INP 처럼 "가장 나쁜 하나" 로 정해지는 지표 */
  worst: Map<string, Worst>;
};

function newBucket(path: string, navIndex: number, now: number): Bucket {
  return { path, navIndex, enteredAt: now, sums: new Map(), worst: new Map() };
}

function addToSum(map: Map<string, Sum>, m: VitalInput, d: number): void {
  const cur = map.get(m.name);
  if (!cur) {
    map.set(m.name, {
      value: d,
      rating: m.rating ?? null,
      element: m.element ?? null,
      attrUrl: m.attrUrl ?? null,
      biggest: d,
    });
    return;
  }
  cur.value += d;
  cur.rating = m.rating ?? cur.rating;
  /* 요소(largestShiftTarget)는 **가장 큰 delta 를 만든 것**을 남긴다 — 마지막 것을
     남기면 0.001 짜리 마지막 흔들림이 0.4 짜리 범인을 덮는다. */
  if (d >= cur.biggest) {
    cur.biggest = d;
    cur.element = m.element ?? cur.element;
    cur.attrUrl = m.attrUrl ?? cur.attrUrl;
  }
}

function keepWorst(map: Map<string, Worst>, m: VitalInput): void {
  const cur = map.get(m.name);
  if (cur && cur.value >= m.value) return;
  map.set(m.name, {
    value: m.value,
    rating: m.rating ?? null,
    element: m.element ?? null,
    attrUrl: m.attrUrl ?? null,
  });
}

export class RouteVitalsLedger {
  private entryPath: string;
  private current: Bucket;
  private navIndex: number;
  /** 문서를 어떻게 열었나 — 지표가 알려 주는 대로 한 번만 채운다 */
  private docNavType: string | null;
  /** 문서 전체(= 방문 하나) 누적 — 주간 시계열의 단위를 지키기 위한 별도 집계 */
  private docSums: Map<string, Sum>;
  private docWorst: Map<string, Worst>;
  private docFlushed: boolean;

  constructor(entryPath: string, now: number) {
    this.entryPath = entryPath;
    this.navIndex = 0;
    this.current = newBucket(entryPath, 0, now);
    this.docNavType = null;
    this.docSums = new Map();
    this.docWorst = new Map();
    this.docFlushed = false;
  }

  /** 지금 보고 있는 화면 — bfcache 복귀분을 어디에 달지 정할 때 쓴다 */
  currentPath(): string {
    return this.current.path;
  }

  /** navIndex 0 은 문서를 연 방식, 그 뒤는 클라이언트 라우팅이다 */
  private navTypeFor(navIndex: number): string | null {
    return navIndex > 0 ? SOFT_NAV : this.docNavType;
  }

  private noteNavType(navType: string | null | undefined): void {
    if (this.docNavType === null && typeof navType === "string" && navType) {
      this.docNavType = navType;
    }
  }

  /**
   * 한 번만 확정되는 지표(LCP·FCP·TTFB). 문서가 처음 연 화면의 것으로 단다.
   * 단위가 문서 하나이므로 scope 는 "doc" 이다.
   */
  oneShot(m: VitalInput): RouteVitalSample {
    this.noteNavType(m.navType);
    const bfcache = m.navType === "back-forward-cache";
    const navIndex = bfcache ? this.current.navIndex : 0;
    return {
      metric: m.name,
      value: m.value,
      rating: m.rating ?? null,
      path: bfcache ? this.current.path : this.entryPath,
      navIndex,
      /* bfcache 복귀는 그 자체가 문서를 다시 보여 준 사건이라 soft-nav 가 아니다 */
      navType: bfcache ? "back-forward-cache" : this.navTypeFor(navIndex),
      scope: "doc",
      element: m.element ?? null,
      attrUrl: m.attrUrl ?? null,
    };
  }

  /** 더해지는 지표(CLS). delta 를 지금 화면 통과 문서 통에 각각 더한다. */
  addDelta(m: VitalInput): void {
    this.noteNavType(m.navType);
    const d = typeof m.delta === "number" && Number.isFinite(m.delta) ? m.delta : 0;
    if (d <= 0) return;
    addToSum(this.current.sums, m, d);
    addToSum(this.docSums, m, d);
  }

  /**
   * "가장 나쁜 하나" 로 정해지는 지표(INP). 값이 나빠진 시점에 보고 있던 화면에 단다.
   * 문서 전체 INP 는 화면별 최댓값의 최댓값이라 정보가 사라지지 않는다.
   */
  addWorst(m: VitalInput): void {
    this.noteNavType(m.navType);
    keepWorst(this.current.worst, m);
    keepWorst(this.docWorst, m);
  }

  /** 지금 화면 통을 비워 보낼 것들로 만든다. 비운 뒤 통은 같은 화면으로 다시 연다. */
  private drain(now: number): RouteVitalSample[] {
    const b = this.current;
    const dwell = Math.max(0, now - b.enteredAt);
    const out: RouteVitalSample[] = [];
    const push = (metric: string, v: Worst) => {
      out.push({
        metric,
        value: v.value,
        rating: v.rating,
        path: b.path,
        navIndex: b.navIndex,
        navType: this.navTypeFor(b.navIndex),
        scope: "route",
        element: v.element,
        attrUrl: v.attrUrl,
      });
    };
    for (const [name, v] of b.sums) push(name, v);
    for (const [name, v] of b.worst) push(name, v);

    /* 값이 0 인 화면도 보낸다 — 나쁜 방문만 기록되면 p75 가 위로 치우친다.
       다만 **머문 적 없는** 화면(링크를 스쳐 지나간 경우)까지 0 으로 세면 이번엔
       아래로 치우친다. 그래서 "값이 있거나, 최소한 머물렀거나" 를 기준으로 한다.
       INP 만 있고 CLS 가 없는 화면도 CLS 0 을 남긴다 — 그 화면의 CLS 는 실제로 0 이다. */
    if (!b.sums.has("CLS") && dwell >= MIN_DWELL_MS) {
      out.push({
        metric: "CLS",
        value: 0,
        rating: "good",
        path: b.path,
        navIndex: b.navIndex,
        navType: this.navTypeFor(b.navIndex),
        scope: "route",
        element: null,
        attrUrl: null,
      });
    }
    b.sums.clear();
    b.worst.clear();
    b.enteredAt = now;
    return out;
  }

  /** 화면 이동 — 떠나는 화면의 통을 비워 보내고 새 통을 연다 */
  enterRoute(path: string, now: number): RouteVitalSample[] {
    if (path === this.current.path) return [];
    const out = this.drain(now);
    this.navIndex += 1;
    this.current = newBucket(path, this.navIndex, now);
    return out;
  }

  /**
   * 페이지가 숨을 때 — 남은 화면 통 + 문서 전체 한 줄을 비운다.
   * 두 번 불려도 같은 값을 또 보내지 않는다(문서 줄은 한 번만).
   */
  flush(now: number): RouteVitalSample[] {
    const out = this.drain(now);
    if (this.docFlushed) return out;
    this.docFlushed = true;
    const docPush = (metric: string, v: Worst) => {
      out.push({
        metric,
        value: v.value,
        rating: v.rating,
        path: this.entryPath,
        navIndex: 0,
        navType: this.docNavType,
        scope: "doc",
        element: v.element,
        attrUrl: v.attrUrl,
      });
    };
    for (const [name, v] of this.docSums) docPush(name, v);
    for (const [name, v] of this.docWorst) docPush(name, v);
    /* 문서 전체 CLS 가 0 인 방문도 남긴다 — 주간 p75 가 나쁜 방문 쪽으로 치우치지 않게 */
    if (!this.docSums.has("CLS")) {
      docPush("CLS", { value: 0, rating: "good", element: null, attrUrl: null });
    }
    return out;
  }
}
