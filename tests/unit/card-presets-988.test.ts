import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_PRESETS,
  CARD_IMAGE_SIZE,
  getCardPreset,
  isCardPresetId,
  presetToConfig,
} from "../../lib/notes/card-presets.ts";
import { CARD_THEMES } from "../../lib/notes/card-themes.ts";
import { CARD_FRAMES } from "../../lib/notes/card-frames.ts";

/* 988 — 공유 카드 완성본 3종.
   프리셋이 존재하지 않는 테마·장을 가리키면 카드가 조용히 빈 채로 나온다.
   그건 화면을 열어 보기 전에는 모른다 — 그래서 여기서 대조한다. */

const THEME_IDS = new Set(CARD_THEMES.map((t) => t.id));
const FRAME_IDS = new Set(CARD_FRAMES.map((f) => f.id));

test("요청대로 완성본은 3벌이다 — 빌더가 아니라 고르면 끝나는 벌", () => {
  assert.equal(CARD_PRESETS.length, 3);
  assert.deepEqual(CARD_PRESETS.map((p) => p.id), ["field", "digest", "figures"]);
});

test("프리셋이 가리키는 테마가 실제로 있다", () => {
  const missing = CARD_PRESETS.filter((p) => !THEME_IDS.has(p.themeId)).map((p) => `${p.id}:${p.themeId}`);
  assert.deepEqual(missing, []);
});

test("프리셋이 가리키는 장이 실제로 있다", () => {
  const missing: string[] = [];
  for (const p of CARD_PRESETS) {
    for (const f of p.frameIds) if (!FRAME_IDS.has(f)) missing.push(`${p.id}:${f}`);
  }
  assert.deepEqual(missing, [], `없는 장을 가리킨다: ${missing.join(", ")}`);
});

test("세 벌이 서로 다른 얼굴이다 — 테마도 장 구성도 겹치지 않는다", () => {
  assert.equal(new Set(CARD_PRESETS.map((p) => p.themeId)).size, 3);
  assert.equal(new Set(CARD_PRESETS.map((p) => p.frameIds.join(","))).size, 3);
});

test("모든 벌이 표지로 시작하고 마무리 장으로 끝난다", () => {
  for (const p of CARD_PRESETS) {
    assert.equal(p.frameIds[0], "cover", `${p.id}: 표지로 시작하지 않는다`);
    assert.equal(p.frameIds[p.frameIds.length - 1], "cta", `${p.id}: 마무리 장이 없다`);
  }
});

test("장이 한 벌 안에서 중복되지 않는다", () => {
  for (const p of CARD_PRESETS) {
    assert.equal(new Set(p.frameIds).size, p.frameIds.length, `${p.id}: 같은 장이 두 번`);
  }
});

test("노트 밖 데이터를 얹는 벌은 하나뿐이고, 그 벌만 market 장을 가진다", () => {
  const withMarket = CARD_PRESETS.filter((p) => p.withMarket);
  assert.equal(withMarket.length, 1);
  assert.equal(withMarket[0].id, "figures");
  for (const p of CARD_PRESETS) {
    assert.equal(p.frameIds.includes("market"), p.withMarket, `${p.id}: market 장과 플래그가 어긋난다`);
  }
});

test("프리셋을 스튜디오 설정으로 바꾸면 그대로 나온다 — 고른 뒤에도 손볼 수 있게", () => {
  const p = CARD_PRESETS[0];
  const cfg = presetToConfig(p);
  assert.equal(cfg.themeId, p.themeId);
  assert.deepEqual(cfg.frameIds, p.frameIds);
  /* 복사본이어야 한다 — 사용자가 장을 빼도 원본 프리셋이 망가지지 않게 */
  cfg.frameIds.pop();
  assert.equal(p.frameIds.length, CARD_PRESETS[0].frameIds.length);
});

test("모르는 id 는 null — 화면이 죽지 않는다", () => {
  assert.equal(getCardPreset("없는것"), null);
  assert.equal(isCardPresetId("field"), true);
  assert.equal(isCardPresetId("없는것"), false);
  assert.equal(getCardPreset("digest")?.label, "한 장 요약");
});

test("내보낼 이미지는 4:5 — 카톡·인스타에서 안 잘리는 비율", () => {
  assert.deepEqual(CARD_IMAGE_SIZE, { width: 1080, height: 1350 });
  assert.equal(CARD_IMAGE_SIZE.height / CARD_IMAGE_SIZE.width, 1.25);
});

test("이름·설명이 비어 있지 않다", () => {
  for (const p of CARD_PRESETS) {
    assert.ok(p.label.trim().length >= 2, p.id);
    assert.ok(p.premise.trim().length >= 8, p.id);
  }
});
