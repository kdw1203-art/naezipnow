/**
 * 결과 구간 판정 — 화면이 결과를 두고 **어떤 말투를 쓸지** 정한다.
 *
 * [980] 소유자 지시("결과에 따른 말투")를 구현하면서 가장 조심한 것: 말투를
 * 바꾸려고 **없는 판단을 만들어 내지 않는 것**이다. 그래서 구간은 서버가 이미
 * 준 것만으로 정한다 — 시그널(green/yellow/red/na), 플래그(warn/info),
 * 레이더 점수. 여기서 새로 계산하는 수치는 없다.
 *
 * 특히 `thin` 은 "판단을 아낀다"는 뜻이고, 좋은 쪽으로 반올림하지 않는다.
 * 재료가 없을 때 "괜찮아 보입니다"라고 말하는 화면이 가장 나쁘다.
 *
 * 리스크 계열(ai-risk·contract-risk)도 같은 규칙을 쓴다 — 그쪽에서 strong 은
 * "좋다"가 아니라 "걸리는 게 적다"이고, 말투 문장이 그렇게 쓰여 있다
 * (lib/ai/tool-persona.ts 의 tone).
 */

export type OutcomeBand = "strong" | "mixed" | "weak" | "thin";

export type BandInput = {
  /** 서버 판정이 아예 없으면(=insight null) 판단할 재료가 없다 */
  hasInsight: boolean;
  /** 레이더 점수 — null 은 "그 축을 못 쟀다" */
  radar: readonly (number | null)[];
  signals: readonly ("green" | "yellow" | "red" | "na")[];
  flags: readonly ("warn" | "info")[];
  /** 외부 서술이 빠졌거나 데이터가 모자라 축소 실행됐는가 */
  degraded?: boolean;
  /** 축소 사유 — 키 부재는 데이터 부족이 아니다(서술만 빠진 것) */
  reasonCode?: string | null;
};

/** 축소 사유가 "데이터가 모자라서"인가 — 키 부재는 아니다 */
export function degradedByData(degraded: boolean | undefined, reasonCode: string | null | undefined): boolean {
  if (!degraded) return false;
  const code = (reasonCode ?? "").toUpperCase();
  /* KEY_MISSING 은 서버에 AI 키가 없다는 뜻이라 **재료가 아니라 서술**이 빠진 것이다.
     이걸 데이터 부족으로 세면 규칙 계산이 멀쩡한데도 화면이 "모자랍니다"라고 말한다. */
  if (code.includes("KEY_MISSING")) return false;
  return true;
}

export function outcomeBand(input: BandInput): OutcomeBand {
  if (!input.hasInsight) return "thin";
  if (degradedByData(input.degraded, input.reasonCode)) return "thin";

  const scored = input.radar.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const live = input.signals.filter((s) => s !== "na");

  /* 잰 축도 없고 선 신호도 없으면 말할 것이 없다 */
  if (scored.length === 0 && live.length === 0) return "thin";

  const red = live.filter((s) => s === "red").length;
  const green = live.filter((s) => s === "green").length;
  const warn = input.flags.filter((f) => f === "warn").length;
  const avg = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;

  /* 약한 쪽을 먼저 본다 — 좋은 신호 하나가 경고 둘을 덮지 않게 */
  if (red > green) return "weak";
  if (warn >= 2) return "weak";
  if (avg != null && avg < 45) return "weak";

  const cleanSignals = red === 0 && (green >= 1 || live.length === 0);
  const cleanFlags = warn === 0;
  const cleanScore = avg == null || avg >= 65;
  if (cleanSignals && cleanFlags && cleanScore) return "strong";

  return "mixed";
}
