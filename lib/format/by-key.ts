/**
 * [1009] 이름으로 고르는 숫자 포맷 — 서버 컴포넌트가 클라이언트 부품(ScrubLine·TweenNumber)에
 * **함수 대신 이름**을 넘기기 위해 쓴다(서버→클라이언트 props 는 직렬화돼야 한다).
 * 각 이름은 기존 포맷터를 그대로 부른다 — 새 규칙을 만들지 않는다.
 */
import { formatKrwManwon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";

export type NumFormatKey =
  /** 만원 → "8.4억" · "9,800만" (허브·검색 요약, krw eok1) */
  | "eok1"
  /** 만원 → "8억 4,000만" (한 건 가격·정밀) */
  | "eokman"
  /** 만원 → "8억 4,000만원" (문장·계산 결과) */
  | "eokmanwon"
  /** 원 → "1,234,567원" */
  | "won"
  /** % 값 → "55.3%" */
  | "pct1"
  /** 소수 한 자리 + 단위 → "102.5pt" */
  | "num1"
  /** 정수 + 단위 → "1,234건" */
  | "int";

export function formatByKey(v: number, key: NumFormatKey, suffix = ""): string {
  if (!Number.isFinite(v)) return "—";
  /* [1009 · 리뷰 RA] 반올림 뒤 0 이 되는 음수는 "-0"·"-0.0" 이 아니라 0 — `+ 0` 은 -0 을 +0 으로 바꾼다 */
  const r1 = Math.round(v * 10) / 10 + 0;
  switch (key) {
    case "eok1":
      return formatKrwManwon(v, { style: "eok1" });
    case "eokman":
      return formatEokMan(v);
    case "eokmanwon":
      return formatEokMan(v, { unit: "만원" });
    case "won":
      return `${(Math.round(v) + 0).toLocaleString("ko-KR")}원`;
    case "pct1":
      return `${r1.toFixed(1)}%`;
    case "num1":
      return `${r1.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
    case "int":
    default:
      return `${(Math.round(v) + 0).toLocaleString("ko-KR")}${suffix}`;
  }
}
