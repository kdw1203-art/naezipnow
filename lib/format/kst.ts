/**
 * [970 · C-01 · C-04] 한국 시간(Asia/Seoul) 절대 시각 포맷 — 서버·클라이언트 공용 순수 함수.
 *
 * 왜: 서버 컴포넌트는 Vercel(UTC)에서 돈다. `d.getHours()`·`toLocaleString("ko-KR", {...})`
 * 처럼 **실행 환경의 시간대**에 기대는 표기는 모임 일시·기사 바이라인을 9시간 이르게
 * 찍었다(19:00 모임이 "10:00" 으로). 사용자는 전부 한국에 있으므로 시간대를 고정한다.
 *
 * Intl 의 완성 문자열(예: "9. 6. (토) 오후 02:30")을 그대로 쓰지 않고 formatToParts 로
 * 숫자만 뽑아 기존 화면의 얼굴("9.6 (토) 14:30" 등)을 그대로 조립한다 — ICU 버전에
 * 따라 구두점·공백이 달라지는 문제를 피한다. 상대시각(N분 전)은 lib/format/relative-time.
 */

export const KST_TIME_ZONE = "Asia/Seoul";

export type KstParts = {
  year: number;
  /** 1~12 */
  month: number;
  day: number;
  /** 0~23 */
  hour: number;
  minute: number;
  /** 0(일)~6(토) */
  weekday: number;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/* en-US 숫자 파트는 로케일 장식이 없어 안정적이다(ko-KR 은 "오후"·"." 이 섞인다). */
const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});

function toMs(input: string | number | Date | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  if (typeof input === "number") return input;
  if (input instanceof Date) return input.getTime();
  return Date.parse(input);
}

/** KST 기준 연·월·일·시·분·요일. 파싱 실패면 null */
export function kstParts(input: string | number | Date | null | undefined): KstParts | null {
  const t = toMs(input);
  if (!Number.isFinite(t)) return null;
  const out: Partial<KstParts> = {};
  for (const p of PARTS_FORMAT.formatToParts(new Date(t))) {
    switch (p.type) {
      case "year":
        out.year = Number(p.value);
        break;
      case "month":
        out.month = Number(p.value);
        break;
      case "day":
        out.day = Number(p.value);
        break;
      case "hour":
        /* hourCycle h23 이라도 일부 ICU 가 "24" 를 내던 적이 있다 — 0 으로 접는다 */
        out.hour = Number(p.value) % 24;
        break;
      case "minute":
        out.minute = Number(p.value);
        break;
      case "weekday":
        out.weekday = WEEKDAY_INDEX[p.value] ?? 0;
        break;
      default:
        break;
    }
  }
  if (
    out.year === undefined ||
    out.month === undefined ||
    out.day === undefined ||
    out.hour === undefined ||
    out.minute === undefined ||
    out.weekday === undefined
  ) {
    return null;
  }
  return out as KstParts;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026.09.06 14:30" — 기사 바이라인·등록 시각. 실패 시 "" */
export function formatKstDateTime(input: string | number | Date | null | undefined): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.year}.${pad2(p.month)}.${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "2026.09.06" — 날짜만. 실패 시 "" */
export function formatKstDate(input: string | number | Date | null | undefined): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.year}.${pad2(p.month)}.${pad2(p.day)}`;
}

/** "09.06" — 관련 기사 메타 등 짧은 날짜. 실패 시 "" */
export function formatKstShortDate(input: string | number | Date | null | undefined): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${pad2(p.month)}.${pad2(p.day)}`;
}

/** "9.6 (토) 14:30" — 모임 목록·채팅방 머리의 일시(기존 얼굴 유지). 실패 시 "" */
export function formatKstMeetingTime(input: string | number | Date | null | undefined): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.month}.${p.day} (${WEEKDAY_KO[p.weekday]}) ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * "2026년 9월 6일" / weekday → "2026년 9월 6일 (토)" / time → "… (토) 14:30".
 * 모임 상세·신청 접수일처럼 문장 안에 들어가는 긴 날짜. 실패 시 ""
 */
export function formatKstLongDate(
  input: string | number | Date | null | undefined,
  opts: { weekday?: boolean; time?: boolean } = {},
): string {
  const p = kstParts(input);
  if (!p) return "";
  let s = `${p.year}년 ${p.month}월 ${p.day}일`;
  if (opts.weekday) s += ` (${WEEKDAY_KO[p.weekday]})`;
  if (opts.time) s += ` ${pad2(p.hour)}:${pad2(p.minute)}`;
  return s;
}

/** 두 시각이 KST 기준 같은 달인가(포인트 지갑 "이번 달" 집계) */
export function isSameKstMonth(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
): boolean {
  const pa = kstParts(a);
  const pb = kstParts(b);
  return Boolean(pa && pb && pa.year === pb.year && pa.month === pb.month);
}
