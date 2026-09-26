/**
 * [1008 · 리뷰 A-3] 전월세 계약 점검 — 입력만으로 만드는 **사실 목록**(순수 함수 · 테스트 대상).
 *
 * 1007 까지 자체 엔진(lib/ai/analysis-engine.ts contract-risk)이 이 목록(핵심 이슈·특약)을 본문으로 냈다.
 * 1008 결과 화면이 엔진 본문을 싣지 않게 되면서 보증금·등기부·보증보험 입력이 화면 어디에도 반영되지 않았다
 * (리뷰: "계약 점검은 보증금·등기부·보증보험 무시"). 같은 규칙을 여기로 옮겨 결과 카드로 살린다 —
 * 엔진 규칙(90%·80% 경계, 고액 기준 20억, 특약 3+1개)은 그대로다.
 *
 * 법령: 전입신고(주민등록)·확정일자의 효력은 주택임대차보호법 제3조(대항력)·제3조의2(우선변제).
 * 화면은 "일반 정보, 법률 자문 아님"을 함께 적는다.
 */

export type ContractLevel = "안전" | "주의" | "위험";

export interface ContractIssue {
  text: string;
  /** danger = 숫자로 걸림 · todo = 아직 확인 전(할 일) */
  tone: "danger" | "warning" | "todo";
}

export interface ContractCheck {
  /** 전세가율(%) — 입력값 또는 지역 평균 */
  ratioPct: number | null;
  ratioSource: "input" | "region" | null;
  /** 입력 전세가율로 매긴 위험도 — 지역 평균만 있으면 참고 위험도 */
  level: ContractLevel | null;
  /** 보증금 ÷ 전세가율 로 거꾸로 잡은 매매가(만원) — 둘 다 있을 때만 */
  saleEstimateMan: number | null;
  issues: ContractIssue[];
  clauses: string[];
  registryChecked: boolean;
  insured: boolean;
}

/** 엔진과 같은 경계 */
export const CONTRACT_RULE = { dangerPct: 90, cautionPct: 80, highDepositMan: 200_000 } as const;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function contractLevelOf(ratioPct: number): ContractLevel {
  return ratioPct >= CONTRACT_RULE.dangerPct ? "위험" : ratioPct >= CONTRACT_RULE.cautionPct ? "주의" : "안전";
}

export function contractCheck(
  input: {
    jeonseMan?: unknown;
    marketRatioPct?: unknown;
    hasRegistrationCheck?: unknown;
    hasInsurance?: unknown;
  },
  regionRatioPct: number | null | undefined,
): ContractCheck {
  const inputRatio = num(input.marketRatioPct);
  const regionRatio = num(regionRatioPct);
  const ratioPct = inputRatio ?? regionRatio;
  const ratioSource = inputRatio != null ? "input" : regionRatio != null ? "region" : null;
  const jeonseMan = num(input.jeonseMan);
  const registryChecked = input.hasRegistrationCheck === true;
  const insured = input.hasInsurance === true;
  const level = ratioPct != null ? contractLevelOf(ratioPct) : null;

  const issues: ContractIssue[] = [];
  const whose = ratioSource === "region" ? "지역 평균 전세가율" : "전세가율";
  if (ratioPct != null && ratioPct >= CONTRACT_RULE.dangerPct) {
    issues.push({ text: `${whose} ${ratioPct}% — 90% 이상이면 집값이 조금만 내려도 보증금을 돌려받기 어려울 수 있어요(깡통전세 위험).`, tone: "danger" });
  } else if (ratioPct != null && ratioPct >= CONTRACT_RULE.cautionPct) {
    issues.push({ text: `${whose} ${ratioPct}% — 80% 이상이면 시세가 내릴 때 보증금을 못 돌려받을 수 있어요.`, tone: "warning" });
  }
  if (!registryChecked) {
    issues.push({ text: "등기부등본 확인 전 — 근저당·가압류·가처분이 있는지 계약 전에 꼭 보세요.", tone: "todo" });
  }
  if (!insured) {
    issues.push({ text: "전세보증보험 가입 전 — HUG·HF 가입이 되는 집인지 계약 전에 확인하세요.", tone: "todo" });
  }
  if (jeonseMan != null && jeonseMan > CONTRACT_RULE.highDepositMan) {
    issues.push({ text: "보증금이 20억 원을 넘어요 — 계약 해제·보증금 반환 특약을 더 꼼꼼히 보세요.", tone: "warning" });
  }

  const clauses = [
    "임대인이 바뀌면 계약을 해지하고 보증금을 바로 돌려받는다.",
    "잔금 전날까지 등기부등본·건축물대장을 다시 확인하고, 새 근저당이 생기면 계약을 해제한다.",
    "잔금일에 전입신고와 확정일자를 받는다(임차인이 할 일).",
  ];
  if (ratioPct != null && ratioPct >= CONTRACT_RULE.cautionPct) {
    clauses.push("전세보증보험 가입이 거절되면 계약을 해제하고 계약금을 돌려받는다.");
  }

  return {
    ratioPct,
    ratioSource,
    level,
    saleEstimateMan: jeonseMan != null && ratioPct != null ? Math.round(jeonseMan / (ratioPct / 100)) : null,
    issues,
    clauses,
    registryChecked,
    insured,
  };
}
