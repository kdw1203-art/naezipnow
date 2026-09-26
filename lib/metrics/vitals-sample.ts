/**
 * [1010] Web Vitals 표본 추출 비율 — 보내는 쪽(WebVitalsReporter)과 받는 쪽
 * (app/api/metrics/web-vitals)이 **같은 상수**를 본다.
 *
 * ── 왜 (실측) ──────────────────────────────────────────────────────────────
 * 2026-09-20~22 함수 호출 상위: `/api/metrics/web-vitals` 하루 842회. [1007 · V2a-5]
 * 가 봇 필터 + 문서당 1회 배치로 4,350 → 842 까지 줄였지만, 여기서 더 줄일 방법은
 * "모든 방문에서 보낸다"를 그만두는 것뿐이다. 이 엔드포인트는 화면을 그리지 않으므로
 * 호출 1회가 그대로 Invocations + Fluid CPU 다.
 *
 * ── 왜 10% 가 아니라 20% 인가 ──────────────────────────────────────────────
 * 브리프의 기본값은 10% 다. 그런데 842 라는 수는 **사람 표본의 수가 아니다**:
 * [1007 · V2a-5c] 실측에서 같은 엔드포인트 4,350회/일 중 사람 페이지뷰는 ~17/일이었고,
 * 나머지는 UA 를 속이거나 우리 봇 판정을 빠져나간 크롤러였다. 서버는 그런 줄을 UA 로
 * 걸러 204 로 버리므로(route.ts), **web_vitals 표에 실제로 쌓이는 것은 사람 몫뿐**이다.
 * 그 몫에 10% 를 걸면 하루 ~1.7건이 되어 /admin/perf 의 p75 가 무의미해진다
 * (그 화면은 이미 "표본 3건 미만 경로는 접는다"는 규칙을 쓴다).
 * 20% 면 호출은 842 → ~168(-80%)로 줄면서 사람 표본은 하루 ~3.4건 · 월 ~100건이 남아
 * 월 단위 p75 는 읽을 수 있다. 브리프가 허용한 상한이 20% 이므로 그 값을 쓴다.
 *
 * 이 값을 더 내리려면 /admin/perf 와 ops 집계(cwv_page_check ·
 * capture_seo_field_perf_rum)의 "표본 N건" 문턱을 먼저 비율로 보정해야 한다.
 *
 * 주사위는 **세션 단위로 한 번**만 굴린다. 지표마다 굴리면 한 방문의 LCP 만 남고
 * CLS·INP 는 버려지는 식으로 분포가 깨진다 — 같은 세션은 전부 보내거나 전부 안 보낸다.
 */
export const VITALS_SAMPLE_RATE = 0.2;

/** sessionStorage 키 — 한 세션(탭) 안에서 주사위 결과를 고정한다 */
export const VITALS_SAMPLE_KEY = "nz:vitals:sample";

/**
 * 세션의 표본 여부를 정한다(순수 함수 — 브라우저 API 없이 테스트한다).
 *
 * @param stored 이 세션에 이미 저장된 값("1"·"0") 또는 없으면 null
 * @param roll   0 이상 1 미만의 난수
 * @returns `sampled` 이 세션이 보내는가 · `store` 새로 저장해야 할 값(없으면 null)
 */
export function decideVitalsSample(
  stored: string | null,
  roll: number,
  rate: number = VITALS_SAMPLE_RATE,
): { sampled: boolean; store: "1" | "0" | null } {
  if (stored === "1") return { sampled: true, store: null };
  if (stored === "0") return { sampled: false, store: null };
  /* 난수가 이상하면(음수·NaN) 보내지 않는 쪽으로 — 텔레메트리가 비용을 늘리는 방향의
     기본값을 갖지 않게 한다. */
  const ok = Number.isFinite(roll) && roll >= 0 && roll < rate;
  return { sampled: ok, store: ok ? "1" : "0" };
}

/**
 * 표본 비율이 본문에 실려 왔을 때의 정규화 — 서버가 "이 줄은 전체의 몇 분의 일인가"를 안다.
 * 0 < r <= 1 이 아니면 null(모름). 옛 리포터(비율을 안 싣던 번들)는 null 로 온다.
 */
export function normalizeSampleRate(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1) return null;
  return n;
}
