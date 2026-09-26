import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLAT_PCT,
  absManwonText,
  changeSentence,
  deltaDir,
  deltaText,
  diffDir,
  pctChange,
  signedPctText,
} from "@/lib/format/delta";
import { eokManParts, formatEokMan } from "@/lib/format/eok-man";
import { formatByKey } from "@/lib/format/by-key";

/* [1009] 등락·금액 표기 공통 규칙 — 토스증권·네이버 부동산 관례(상승 ▲ · 하락 ▼ · ±0.05% 미만 보합). */

test("[1009] 변동률·방향 — 기준이 없거나 0 이하면 모른다(null)", () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(90, 100), -10);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(null, 100), null);
  assert.equal(pctChange(100, Number.NaN), null);
  assert.equal(deltaDir(3.2), "up");
  assert.equal(deltaDir(-0.06), "down");
  assert.equal(deltaDir(0.049), "flat");
  assert.equal(deltaDir(-FLAT_PCT + 0.001), "flat");
  assert.equal(deltaDir(null), null);
  assert.equal(diffDir(0), "flat");
  assert.equal(diffDir(-3), "down");
  assert.equal(diffDir(0.04, 0.05), "flat");
});

test("[1009] 화면 표준 한 토막 — ▲/▼ + 절댓값, 보합, 변동 미상", () => {
  assert.equal(deltaText(3.24), "▲ 3.2%");
  assert.equal(deltaText(-1.06), "▼ 1.1%");
  assert.equal(deltaText(0.02), "보합");
  assert.equal(deltaText(null), "변동 미상");
  assert.equal(deltaText(12.345, { digits: 2, compact: true }), "▲12.35%");
  assert.equal(signedPctText(3.24), "+3.2%");
  assert.equal(signedPctText(-1.06), "-1.1%");
  assert.equal(signedPctText(0.01), "0.0%");
});

test("[1009] 만원 차이 — 억·만 정밀 표기(원값 그대로)", () => {
  assert.equal(absManwonText(-12_000), "1억 2,000만원");
  assert.equal(absManwonText(800), "800만원");
  assert.equal(absManwonText(0), "0원");
  assert.equal(absManwonText(20_000, "만"), "2억");
});

test("[1009] 결론 한 줄 — 숫자보다 문장 먼저, 모르면 null", () => {
  assert.equal(
    changeSentence({ curr: 84_000, base: 81_500, since: "1년 전보다", unit: "manwon" }),
    "1년 전보다 2,500만원(3.1%) 올랐어요",
  );
  assert.equal(
    changeSentence({ curr: 79_000, base: 80_000, since: "지난달보다", unit: "manwon" }),
    "지난달보다 1,000만원(1.3%) 내렸어요",
  );
  assert.equal(changeSentence({ curr: 56.4, base: 55.2, since: "지난달보다", unit: "pct" }), "지난달보다 1.2%p 올랐어요");
  assert.equal(changeSentence({ curr: 92, base: 80, since: "지난달보다", unit: "count" }), "지난달보다 12건(15.0%) 늘었어요");
  assert.equal(changeSentence({ curr: 100.02, base: 100, since: "지난주보다", unit: "index" }), "지난주보다 거의 그대로예요");
  assert.equal(changeSentence({ curr: null, base: 100, since: "지난달보다", unit: "index" }), null);
  assert.equal(changeSentence({ curr: 10, base: 0, since: "지난달보다", unit: "count" }), null);
});

test("[1009] formatEokMan 기본 출력은 1008 그대로 · 옵션으로 만원/빈값", () => {
  assert.equal(formatEokMan(124_500), "12억 4,500만");
  assert.equal(formatEokMan(120_000), "12억");
  assert.equal(formatEokMan(9_800), "9,800만");
  assert.equal(formatEokMan(0), "—");
  assert.equal(formatEokMan(124_500, { unit: "만원" }), "12억 4,500만원");
  assert.equal(formatEokMan(120_000, { unit: "만원" }), "12억원");
  assert.equal(formatEokMan(9_800, { unit: "만원" }), "9,800만원");
  assert.equal(formatEokMan(null, { empty: "-" }), "-");
  assert.equal(formatEokMan(84_499.6), "8억 4,500만");
  assert.deepEqual(eokManParts(124_500), { eok: 12, man: 4_500 });
  assert.equal(eokManParts(-1), null);
});

test("[1009] 이름으로 고르는 포맷 — 기존 포맷터와 같은 결과", () => {
  assert.equal(formatByKey(84_000, "eok1"), "8.4억");
  assert.equal(formatByKey(9_800, "eok1"), "9,800만");
  assert.equal(formatByKey(84_000, "eokman"), "8억 4,000만");
  assert.equal(formatByKey(84_000, "eokmanwon"), "8억 4,000만원");
  assert.equal(formatByKey(1_234_567.4, "won"), "1,234,567원");
  assert.equal(formatByKey(55.25, "pct1"), "55.3%");
  assert.equal(formatByKey(102.5384, "num1", "pt"), "102.5pt");
  assert.equal(formatByKey(1234.4, "int", "건"), "1,234건");
  assert.equal(formatByKey(Number.NaN, "int"), "—");
});

test("[1009 · 리뷰] 음수 0 은 0 으로 · %p 경계는 % 와 같은 '미만'", () => {
  assert.equal(formatByKey(-0.04, "pct1"), "0.0%");
  assert.equal(formatByKey(-0.3, "int", "건"), "0건");
  assert.equal(formatByKey(-0.02, "num1", "pt"), "0.0pt");
  assert.equal(diffDir(0.05, 0.05), "up");
  assert.equal(diffDir(0.049, 0.05), "flat");
  assert.equal(diffDir(0, 0.05), "flat");
  assert.equal(deltaDir(0.05), "up");
});
