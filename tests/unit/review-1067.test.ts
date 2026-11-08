/* [1067] 소유자 캡처 두 장(2026-10-13) — "이건 칸에 맞게 정렬해줘"(요금제 하단 고지) · "이런것도 디자인적으로 개선해줘"(/analysis 표).
 *  Z1 고지 — 데스크톱에서 두 단으로 흘러 상자를 채운다(문단 폭 상한은 단이 맡는다) · 문구는 한 자도 안 바뀐다.
 *  Z2 표 칸 — 펼쳐도 칸 폭이 바뀌지 않는다(결과 칸이 줄마다 다른 자리에 서던 원인).
 *  Z3 상태 표시 — 열림·닫힘 모두 캐럿 하나로. "열기"는 펼친 칸의 단추가 이름까지 붙여 말한다(중복 제거).
 *  Z4 시장 신호 — 가운뎃점 한 줄 → 낱말 칩 + 모수·링크 한 줄(개수·이름은 그대로). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("Z1 고지 — 데스크톱 두 단 · 문단은 단 폭을 따른다 · 문구 불변", () => {
  const src = read("app/components/ComplianceNotice.tsx");
  assert.match(src, /md:columns-2/);
  assert.match(src, /md:gap-x-8/);
  /* 문단마다 md:max-w-none — 폰에서는 measure(72자), 데스크톱에서는 단 폭이 상한 */
  assert.equal((src.match(/md:max-w-none/g) ?? []).length, 4);
  /* 심사 고정 문구는 한 자도 바뀌지 않았다(문자열은 이 파일이 단일 출처 — check-toss-review-freeze 도 같은 자리를 본다) */
  for (const needle of [
    "내집나우는 수익 보장·확정 수익 등 수익을 약속하는 표현을 일절 기재하지 않으며",
    "모든 이용권(주간권·월간·연간)은 1회성 단건 결제로 자동 반복청구가 없습니다",
    "다음 결제일 전까지 구독 관리에서 언제든 해지할 수 있습니다",
    "상세 규정은 이용약관 제8조",
  ]) assert.ok(src.includes(needle), needle);
});

test("Z2·Z3 표 — [1110] 펼침 없음 · 칸 폭 고정 · 줄 끝은 › 하나", () => {
  const src = read("app/analysis/hub-tiers.tsx");
  /* 폭이 상태에 따라 갈리던 자리가 없다 · 펼침 상태 자체가 없다(1110) */
  assert.doesNotMatch(src, /isOpen/);
  /* [1071] 칸 폭은 표들이 같이 쓰는 상수(tool-cols)로 — 머리·몸이 같은 값을 쓴다 */
  assert.match(src, /<td className=\{`px-3 text-right t-body text-text-3 \$\{TOOL_COL_GO\}`\}/);
  assert.equal((src.match(/TOOL_COL_RESULT\}/g) ?? []).length, 2);
  assert.match(read("app/analysis/tool-cols.ts"), /TOOL_COL_GO = "w-10"/);
  assert.doesNotMatch(src, /"열기 ›"/);
});

/* [1110] Z4(시장 신호 칩 줄 — hub-tool-detail)는 펼침 칸과 함께 걷었다(소유자 "1, 2 같은 문구는 필요없어"). */

