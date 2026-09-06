/**
 * [967 · 31] 원(KRW) / 만원 → "억·만" 표기 공통 포맷터.
 *
 * 순수 함수만 있다 — 서버 모듈·React·환경변수를 전혀 import 하지 않으므로
 * "use client" 컴포넌트·API 라우트·크론·이메일 어디서든 그대로 쓴다.
 *
 * 왜 한 파일인가: 같은 "8.4억 / 9,800만" 을 만드는 함수가 lib·app 에 40개 가까이
 * 복사돼 있었고, 서로 미묘하게 달랐다(10억 이상 정수화 기준이 10억인지 100억인지,
 * "8.0억" 을 "8억" 으로 줄이는지, 1억 미만을 "0.5억" 으로 두는지, 빈값이 "—" 인지
 * "-" 인지 null 인지…). 이 차이는 화면마다 사용자에게 이미 보이는 얼굴이라 여기서
 * 하나로 "고치지" 않는다 — 관찰된 규칙을 전부 옵션으로 남기고, 각 호출부는 자기
 * 규칙을 명시해 부른다. 화면에 찍히는 문자열은 통합 전과 바이트 단위로 같다
 * (tests/unit/format-967.test.ts 가 옛 구현 사본과 대조해 고정한다).
 *
 * 억 소수 규칙(style):
 *  - "short"    실거래 요약 — 100억 이상 정수, 그 미만 0.1 반올림, 천단위 구분.
 *               "28.6억" · "123억" · "1,234억" · 12.0 → "12억"   (lib/market/format)
 *  - "listing"  매물·지도 — 10억 이상 정수(천단위), 그 미만 toFixed(1) 고정.
 *               "8.0억" · "12억"                                   (lib/listings/format)
 *  - "eok"      AI·홈 카드 — 10억 이상 소수 1자리, 미만 2자리, 뒤 0 제거.
 *               "8.4억" · "32.5억" · "0.85억"                        (lib/ai/market-insight)
 *  - "eok1"     단지 허브·검색 — toFixed(1) 뒤 ".0" 제거, 천단위 구분 없음.
 *               "8.4억" · "12억" · "1234.6억"                        (lib/complex/hub-trades)
 *  - "jo"       개발 딜 — 1조 이상 "1조 5,000억", 억은 0.1 반올림.   (lib/dev-deals/types)
 *  - "currency" 요금제 — "₩9,900".                                  (lib/subscriptions/format-plan-price)
 *
 * 1억 미만은 기본적으로 "N,NNN만"(반올림·천단위) 이고, `below: "eok"` 면 억으로 계속
 * 쓴다("0.5억"). 0·음수·NaN·null 은 기본 "—" 이며 `empty` 로 바꾸거나(`"-"`, `"미정"`)
 * `empty: false` 로 검사를 끄면 옛 구현처럼 그대로 계산한다("0억", "-5만").
 */

export type KrwStyle = "short" | "listing" | "eok" | "eok1" | "jo" | "currency";

export interface KrwFormatOptions {
  /** 억 소수 규칙. 기본 "short" */
  style?: KrwStyle;
  /** 1억 미만 처리 — "man"(기본, "9,800만") | "eok"("0.98억"처럼 억으로 계속) */
  below?: "man" | "eok";
  /** 만 단위 접미사. 기본 "만", 리포트 본문은 "만원" */
  manUnit?: "만" | "만원";
  /**
   * 0·음수·NaN·null 일 때 돌려줄 문자열. 기본 "—".
   * false 면 검사를 하지 않고 그대로 계산한다(옛 무방어 구현과 동일 출력).
   * null·undefined 는 검사를 꺼도 항상 "" 다.
   */
  empty?: string | false;
  /** 억 정수부의 천단위 구분(ko-KR). 지도 마커 계열은 끈다. 만 단위는 항상 구분한다 */
  groupEok?: boolean;
  /** "eok"/"eok1" 의 소수 뒤 0 제거. 끄면 "8.40억"·"8.0억" */
  trimZeros?: boolean;
}

const EOK_WON = 100_000_000;
const MAN_WON = 10_000;
const JO_WON = 1_000_000_000_000;

function groupKo(n: number, group: boolean): string {
  return group ? n.toLocaleString("ko-KR") : String(n);
}

/** 억 부분 숫자 문자열(단위 제외). 각 분기는 원래 구현의 식을 그대로 옮긴 것이다 */
function eokDigits(eok: number, opts: KrwFormatOptions): string {
  const group = opts.groupEok ?? true;
  const trim = opts.trimZeros ?? true;
  switch (opts.style ?? "short") {
    case "listing":
      return eok >= 10 ? groupKo(Math.round(eok), group) : eok.toFixed(1);
    case "eok": {
      const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
      return trim ? s.replace(/\.?0+$/, "") : s;
    }
    case "eok1": {
      const s = eok.toFixed(1);
      return trim ? s.replace(/\.0$/, "") : s;
    }
    case "jo":
      /* 정수면 그대로, 아니면 0.1 반올림 — 정수는 반올림해도 같으니 한 식으로 */
      return groupKo(Math.round(eok * 10) / 10, group);
    case "short":
    default:
      return groupKo(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10, group);
  }
}

function manText(manRounded: number, opts: KrwFormatOptions): string {
  return `${manRounded.toLocaleString("ko-KR")}${opts.manUnit ?? "만"}`;
}

/**
 * 공통 본체. `won`·`eok`·`man` 은 각 진입점이 원래 구현과 같은 식으로 계산해
 * 넘긴다(만원→억 을 원으로 갔다가 다시 나누면 마지막 자리 부동소수가 달라질 수 있다).
 */
function render(
  won: number,
  isEok: boolean,
  eok: number,
  manRounded: number,
  opts: KrwFormatOptions,
): string {
  const style = opts.style ?? "short";
  if (style === "currency") return `₩${won.toLocaleString("ko-KR")}`;
  if (style === "jo" && won >= JO_WON) {
    const jo = Math.floor(won / JO_WON);
    const remEok = Math.round((won - jo * JO_WON) / EOK_WON);
    return remEok > 0
      ? `${jo.toLocaleString("ko-KR")}조 ${remEok.toLocaleString("ko-KR")}억`
      : `${jo.toLocaleString("ko-KR")}조`;
  }
  if (isEok || opts.below === "eok") return `${eokDigits(eok, opts)}억`;
  return manText(manRounded, opts);
}

/** 빈값 검사 — 통과하면 null, 아니면 돌려줄 문자열 */
function emptyLabel(v: number | null | undefined, opts: KrwFormatOptions): string | null {
  if (v === null || v === undefined) return opts.empty === false ? "" : (opts.empty ?? "—");
  if (opts.empty === false) return null;
  if (!Number.isFinite(v) || v <= 0) return opts.empty ?? "—";
  return null;
}

/** 원(KRW) → 억/만 표기. 예) 1_250_000_000 → "12.5억", 85_000_000 → "8,500만" */
export function formatKrwWon(won: number | null | undefined, opts: KrwFormatOptions = {}): string {
  const empty = emptyLabel(won, opts);
  if (empty !== null) return empty;
  const v = won as number;
  return render(v, v >= EOK_WON, v / EOK_WON, Math.round(v / MAN_WON), opts);
}

/** 만원 → 억/만 표기. 예) 12_500 → "1.3억"(short) · 8_500 → "8,500만" */
export function formatKrwManwon(manwon: number | null | undefined, opts: KrwFormatOptions = {}): string {
  const empty = emptyLabel(manwon, opts);
  if (empty !== null) return empty;
  const v = manwon as number;
  return render(v * MAN_WON, v >= MAN_WON, v / MAN_WON, Math.round(v), opts);
}
