/**
 * [967 · 32] 상대 시각 라벨("방금 전 · N분 전 · N시간 전 · 어제 · N일 전 · 날짜") 공통 구현.
 *
 * 순수 함수 — 서버 모듈·React 를 import 하지 않아 "use client" 파일에서도 쓴다.
 *
 * 왜 옵션이 이렇게 많은가: 같은 일을 하는 함수가 app·lib 에 열 개 넘게 복사돼 있었고
 * 화면마다 이미 다른 얼굴로 굳어 있었다 — 1분 미만이 "방금 전"인지 "방금"인지 "1분 전"
 * 인지, 분 단위를 아예 안 쓰는 곳(Q&A·동네 홈), "어제" 를 쓰는 곳(피드), N일 전 상한이
 * 7일/30일/31일/무한인 곳, 상한을 넘겼을 때 "2026.08.19"·"08. 19."·"08.19"·"8월 19일"·
 * ISO 앞 10자 중 무엇을 찍는지. 이건 사용자에게 보이는 표기라 통합하면서 어느 하나로
 * "고치지" 않는다 — 관찰된 변형을 전부 옵션으로 남기고 각 호출부가 자기 규칙을 명시한다.
 * 출력은 통합 전과 문자열 단위로 같다(tests/unit/format-967.test.ts 가 경계값에서 대조).
 *
 * `now` 는 밀리초. 서버 컴포넌트는 요청당 한 번 잡은 값을 넘길 수 있고(hydration
 * 안전), 생략하면 Date.now().
 */

export type RelativeDateFallback =
  /** 로컬 시간대 "2026.08.19" */
  | "ymd"
  /** ko-KR 로케일 2자리 "08. 19." */
  | "md-ko"
  /** UTC "08.19" */
  | "md-utc"
  /** 입력 문자열 앞 10자(ISO 날짜부) — 문자열이 아니면 UTC ISO 날짜 */
  | "iso-date"
  /** ko-KR "8월 19일" */
  | "md-long";

export interface RelativeTimeOptions {
  /** 1분(분 단위) 또는 1시간(시간 단위) 미만 라벨. 기본 "방금 전" */
  justNow?: string;
  /** 1분 미만을 "1분 전" 으로 올려 적는다(댓글·임시저장 라벨). justNow 보다 우선 */
  minOneMinute?: boolean;
  /** 최소 단위. "hour" 면 분 표기 없이 1시간 미만은 justNow, "day" 면 오늘/어제/N일 전만 */
  unit?: "minute" | "hour" | "day";
  /**
   * 관리자 지표식 반올림 — 분→시→일 각 단계를 round 로 올린다("0분 전" 가능, justNow 없음).
   * 기본은 내림.
   */
  round?: boolean;
  /** 하루 전을 "어제" 로 */
  yesterday?: boolean;
  /** unit "day" 에서 0일 이하 라벨. 기본 "오늘" */
  today?: string;
  /** "N일 전" 을 쓰는 상한(일). 이 값 이상이면 fallback 날짜. 기본 7, Infinity 면 날짜 없음 */
  maxDays?: number;
  /** 상한을 넘겼을 때의 절대 날짜 표기. 기본 "ymd" */
  fallback?: RelativeDateFallback;
  /** 파싱 실패 시 돌려줄 값. 기본 "" */
  invalid?: string;
}

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function toMs(input: string | number | Date): number {
  if (typeof input === "number") return input;
  if (input instanceof Date) return input.getTime();
  return Date.parse(input);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function absoluteDate(t: number, input: string | number | Date, fallback: RelativeDateFallback): string {
  const d = new Date(t);
  switch (fallback) {
    case "md-ko":
      return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
    case "md-utc":
      return d.toISOString().slice(5, 10).replace("-", ".");
    case "iso-date":
      return typeof input === "string" ? input.slice(0, 10) : d.toISOString().slice(0, 10);
    case "md-long":
      return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    case "ymd":
    default:
      return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  }
}

/**
 * ISO 문자열·epoch ms·Date → 상대 시각 라벨.
 * 미래 시각(음수 차이)은 내림 모드에선 1분 미만과 같은 라벨, 반올림 모드에선 "0분 전".
 */
export function relativeTimeLabel(
  input: string | number | Date,
  now: number = Date.now(),
  opts: RelativeTimeOptions = {},
): string {
  const t = toMs(input);
  if (!Number.isFinite(t)) return opts.invalid ?? "";
  const diff = now - t;
  const maxDays = opts.maxDays ?? 7;
  const fallback = opts.fallback ?? "ymd";

  if (opts.round) {
    const mins = Math.max(0, Math.round(diff / MIN_MS));
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.round(hours / 24);
    if (days < maxDays) return `${days}일 전`;
    return absoluteDate(t, input, fallback);
  }

  const day = Math.floor(diff / DAY_MS);
  const unit = opts.unit ?? "minute";
  if (unit === "day") {
    if (day <= 0) return opts.today ?? "오늘";
  } else {
    const hour = Math.floor(diff / HOUR_MS);
    if (unit === "hour") {
      if (hour < 1) return opts.justNow ?? "방금 전";
    } else {
      const min = Math.floor(diff / MIN_MS);
      if (min < 1) return opts.minOneMinute ? "1분 전" : (opts.justNow ?? "방금 전");
      if (min < 60) return `${min}분 전`;
    }
    if (hour < 24) return `${hour}시간 전`;
  }
  if (opts.yesterday && day === 1) return "어제";
  if (day < maxDays) return `${day}일 전`;
  return absoluteDate(t, input, fallback);
}
