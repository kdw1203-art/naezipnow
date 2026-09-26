/**
 * [1006 · E] UTM 보존 — 순수 함수(클라이언트·서버·테스트 공용).
 *
 * 광고 랜딩(/lp/imjang)에 `?utm_source=google&utm_medium=cpc&utm_campaign=…` 로 들어온 사람이
 * CTA 를 누르면 다음 페이지(/notes/new)로 같은 utm 을 실어 보낸다. 세션 첫 뷰의 utm 은
 * TrafficRecorder(page_view_events)와 GA4 가 이미 붙잡지만, 새 탭으로 열거나 랜딩에서
 * 세션이 끊긴 경우엔 두 번째 페이지가 "직접 유입"으로 잡힌다 — 링크에 실어 두면 그 손실이 없다.
 *
 * utm_* 만 옮긴다. 다른 파라미터(gclid 등 자동 태깅 값)는 GA4 가 링커로 처리하므로 손대지 않고,
 * 우리 앱의 파라미터(callbackUrl·revisit)도 랜딩 URL 에 있을 이유가 없어 옮기지 않는다.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/** 최대 길이 — 값이 이보다 길면 버린다(주소창 조작으로 긴 문자열을 다음 페이지에 실어 보내지 않게) */
const MAX_VALUE_LEN = 120;

/** search("?a=1&utm_source=x") 에서 utm_* 만 골라낸다 — 없으면 빈 배열 */
export function pickUtmParams(search: string | null | undefined): Array<[string, string]> {
  if (!search) return [];
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return [];
  }
  const out: Array<[string, string]> = [];
  for (const k of UTM_KEYS) {
    const v = sp.get(k)?.trim();
    if (v && v.length <= MAX_VALUE_LEN) out.push([k, v]);
  }
  return out;
}

/**
 * href 에 utm_* 을 덧붙인 내부 링크. href 가 이미 같은 키를 갖고 있으면 href 쪽을 지킨다
 * (목적지가 명시한 값이 랜딩 값보다 우선). 해시(#)는 유지한다.
 */
export function withUtm(href: string, search: string | null | undefined): string {
  const utm = pickUtmParams(search);
  if (utm.length === 0) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const base = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = base.indexOf("?");
  const path = qAt >= 0 ? base.slice(0, qAt) : base;
  const sp = new URLSearchParams(qAt >= 0 ? base.slice(qAt + 1) : "");
  for (const [k, v] of utm) {
    if (!sp.has(k)) sp.set(k, v);
  }
  const q = sp.toString();
  return `${path}${q ? `?${q}` : ""}${hash}`;
}
