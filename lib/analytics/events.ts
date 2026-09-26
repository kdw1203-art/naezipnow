/**
 * [1007 · P2] GA4 맞춤 이벤트 — 동의 게이트 뒤에서만, 실패해도 흐름을 막지 않는다.
 *
 * 규칙(app/lp/imjang/LpCta.tsx 의 generate_lead 와 같다):
 *  - window.gtag 는 쿠키 동의 뒤 ga4-gtag-loader 가 만든다. 없으면 **아무 요청도 나가지 않는다**.
 *  - 계측은 곁가지다 — 예외는 여기서 삼킨다(저장·이동을 늦추거나 막지 않는다).
 *  - 개인정보는 싣지 않는다(노트 id·이메일 금지). 파라미터는 종류·모드 같은 범주값만.
 *
 * 왜 이 두 이벤트인가(실측 2026-09-20): GA4 에는 purchase·sign_up·generate_lead 만 있어
 * "가입 → 첫 노트 저장"(핵심 활성화)과 "소식 메일 동의"(리텐션 채널)를 전환으로 셀 수 없었다.
 * 광고를 켜면 이 둘이 GA4 → Ads 전환 가져오기의 후보가 된다(docs/ai-visibility-1006.md).
 *
 * 순수 모듈(React·server-only 없음) — 클라이언트 컴포넌트가 부르고, 테스트가 gtag 스텁으로 검사한다.
 */

type Gtag = (...args: unknown[]) => void;

/** 표준 이벤트 이름 — 콘솔에서 전환으로 표시할 때 이 문자열을 쓴다 */
export const EVENT_NOTE_SAVED = "note_saved";
export const EVENT_NEWSLETTER_OPT_IN = "newsletter_opt_in";

/** 동의 뒤에만 존재하는 gtag — 없으면 null(요청 0) */
function gtagOrNull(win: unknown = typeof window !== "undefined" ? window : undefined): Gtag | null {
  const g = (win as { gtag?: unknown } | undefined)?.gtag;
  return typeof g === "function" ? (g as Gtag) : null;
}

export interface NoteSavedParams {
  /** 새 노트인가 수정인가 */
  mode: "create" | "edit";
  /** 퀵 기록(?quick=1) 한 화면 저장인가 */
  quick?: boolean;
  /** 저장 시점의 사진 장수(범주값 — 0/1~3/4+ 로 접는다) */
  photoCount?: number;
  /** 공개 범위 */
  visibility?: "public" | "private";
}

function photoBucket(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "0";
  return n <= 3 ? "1-3" : "4+";
}

/**
 * 임장노트 저장 성공 — NoteForm 의 저장 성공 분기(router.push 직전)에서 한 줄로 부른다.
 * 반환값: 실제로 전송했는가(동의 전이면 false). 호출부는 반환값을 볼 필요가 없다.
 */
export function trackNoteSaved(params: NoteSavedParams, win?: unknown): boolean {
  try {
    const gtag = gtagOrNull(win);
    if (!gtag) return false;
    gtag("event", EVENT_NOTE_SAVED, {
      note_mode: params.mode,
      quick_mode: params.quick ? "1" : "0",
      photo_bucket: photoBucket(params.photoCount),
      ...(params.visibility ? { note_visibility: params.visibility } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 소식 메일 수신 동의를 **켤 때**(끌 때는 보내지 않는다 — 옵트아웃은 전환이 아니다).
 * 설정 > 개인정보 탭의 "혜택 · 소식 이메일 받기" 스위치가 부른다.
 */
export function trackNewsletterOptIn(source: "settings" | "signup" | "other" = "settings", win?: unknown): boolean {
  try {
    const gtag = gtagOrNull(win);
    if (!gtag) return false;
    gtag("event", EVENT_NEWSLETTER_OPT_IN, { opt_in_source: source });
    return true;
  } catch {
    return false;
  }
}
