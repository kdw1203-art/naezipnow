/**
 * [1006] 설정 › 기록 탭의 선택지 라벨 — 클라이언트 안전 순수 모듈.
 *
 * 투자자 역할 라벨은 lib/inspection/store-db.ts 의 ROLE_WEIGHT_PRESETS 와 **같은 말**을 쓴다
 * (실거주·투자·단기매매·임대수익·균형형). 그 모듈은 Supabase 클라이언트를 끌고 들어와
 * 설정 화면(클라이언트)에서 import 할 수 없어 라벨만 여기 다시 적는다 — 노트 상세의
 * AI 재분석 버튼이 보여 주는 말과 달라지면 사용자는 같은 것을 두 이름으로 배운다.
 */
import type { AreaUnit, InvestorRolePref, NoteVisibility } from "@/lib/prefs/ui-prefs";

export const AREA_UNIT_OPTIONS: ReadonlyArray<{ value: AreaUnit; label: string }> = [
  { value: "m2", label: "㎡" },
  { value: "pyeong", label: "평" },
];

export const NOTE_VISIBILITY_OPTIONS: ReadonlyArray<{ value: NoteVisibility; label: string }> = [
  { value: "public", label: "공개" },
  { value: "private", label: "비공개" },
];

/** 첫 항목(null)은 "노트마다 고른다" — 기본값을 강요하지 않는 선택지 */
export const INVESTOR_ROLE_OPTIONS: ReadonlyArray<{
  value: InvestorRolePref | null;
  label: string;
  hint: string;
}> = [
  { value: null, label: "노트마다 선택", hint: "저장할 때 그때 고를게요" },
  { value: "live", label: "실거주", hint: "입지·학군·생활 편의 중심" },
  { value: "invest", label: "투자", hint: "미래가치·교통 중심" },
  { value: "flip", label: "단기매매", hint: "미래가치·교통 비중이 가장 큼" },
  { value: "rent", label: "임대수익", hint: "교통·입지·편의 중심" },
  { value: "balanced", label: "균형형", hint: "다섯 축을 고르게" },
];

export function investorRoleLabel(v: InvestorRolePref | null): string {
  return INVESTOR_ROLE_OPTIONS.find((o) => o.value === v)?.label ?? "노트마다 선택";
}
