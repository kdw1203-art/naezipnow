import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { encodeQr } from "../../lib/qr/encode.ts";
import { qrDataUri, qrSvgProps, qrSvgString } from "../../lib/qr/svg.ts";
import { getFrame, type NoteCardSource } from "../../lib/notes/card-frames.ts";
import { shortNoteLabel, shortNoteUrl } from "../../lib/notes/short-code.ts";

/* 997 — 카드 마무리 장 QR.
   인코더는 의존성 없이 직접 썼다. 규격대로 만들었는지는 "다른 구현이 읽어 내는가"로만
   증명된다 — 그래서 판독기(jsqr, 테스트 전용)로 실제 디코드해 원문과 대조한다. */

/** 모듈 → RGBA 비트맵(모듈당 scale px, 사방 quiet 모듈 흰 여백) — 카메라가 보는 것과 같은 입력 */
function rasterize(modules: boolean[][], scale = 4, quiet = 4) {
  const n = modules.length + quiet * 2;
  const w = n * scale;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < modules.length; y++)
    for (let x = 0; x < modules.length; x++) {
      if (!modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: w, height: w };
}

function decode(modules: boolean[][]): string | null {
  const { data, width, height } = rasterize(modules);
  return jsQR(data, width, height)?.data ?? null;
}

const SHORT = "https://naezipnow.com/n/98624962";
const KOREAN = "강남구 대치동 은마아파트 임장 — 채광 좋음 · 소음 보통 · 주차 아쉬움 · 학군 최상 · 역세권 도보 7분".slice(0, 60);
const LONG = "https://naezipnow.com/n/98624962?utm_source=card&utm_medium=image&utm_campaign=note-card&".padEnd(200, "x");

test("짧은 링크 — 판독기가 원문 그대로 읽는다", () => {
  const qr = encodeQr(SHORT);
  assert.equal(qr.size, 21 + 4 * (qr.version - 1));
  assert.equal(qr.modules.length, qr.size);
  assert.ok(qr.modules.every((r) => r.length === qr.size));
  assert.equal(decode(qr.modules), SHORT);
});

test("한글 UTF-8 60자 — 바이트 모드로 그대로 복원된다", () => {
  assert.equal(KOREAN.length, 60);
  assert.ok(new TextEncoder().encode(KOREAN).length > 100, "한글은 글자당 3바이트 — 바이트 수로 버전이 정해진다");
  const qr = encodeQr(KOREAN);
  assert.equal(qr.size, 21 + 4 * (qr.version - 1));
  assert.equal(decode(qr.modules), KOREAN);
});

test("200자 — 상위 버전(v≥7, 버전 정보 포함)으로 올라가고 읽힌다", () => {
  assert.equal(LONG.length, 200);
  const qr = encodeQr(LONG);
  assert.ok(qr.version >= 7 && qr.version <= 10, `version ${qr.version}`);
  assert.equal(qr.size, 21 + 4 * (qr.version - 1));
  assert.equal(decode(qr.modules), LONG);
});

test("EC 레벨 4종 모두 판독된다(마스크·포맷 정보 검증)", () => {
  for (const ecLevel of ["L", "M", "Q", "H"] as const) {
    const qr = encodeQr(SHORT, { ecLevel });
    assert.equal(decode(qr.modules), SHORT, `EC ${ecLevel}`);
  }
});

test("1000자 — 버전 10 용량을 넘기면 throw", () => {
  assert.throws(() => encodeQr("a".repeat(1000)), /너무 깁니다/);
});

test("SVG — path 하나로 그린다, data URI 는 svg+xml", () => {
  const qr = encodeQr(SHORT);
  const svg = qrSvgString(qr.modules);
  assert.equal((svg.match(/<path/g) ?? []).length, 1);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes('fill="#0B1220"'));
  assert.ok(qrDataUri(qr.modules).startsWith("data:image/svg+xml;utf8,"));
});

test("SVG path — 합친 사각형을 다시 펼치면 모듈 격자와 같다(카드가 쓰는 quietZone 3)", () => {
  const qr = encodeQr(SHORT);
  const quiet = 3;
  const d = qrSvgProps(qr.modules, { quietZone: quiet }).path;
  const back = qr.modules.map((r) => r.map(() => false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [, x, y, w, w2] = m.map(Number);
    assert.equal(w, w2);
    for (let i = 0; i < w; i++) back[y - quiet][x - quiet + i] = true;
  }
  assert.deepEqual(back, qr.modules);
});

test("마무리 장 — 공개 노트(shareUrl)는 QR 주소를 싣고, 비공개는 싣지 않는다", () => {
  const cta = getFrame("cta")!;
  const base: NoteCardSource = {
    title: "t", aptName: null, region: null, visitLabel: null, verdict: null, intent: null,
    budgetLabel: null, summary: null, risks: null, weather: null, transportation: null,
    scores: [], checks: [], pros: [], cons: [], tags: [], hasLocation: false, market: null,
  };
  const id = "98624962-1111-2222-3333-444444444444";
  const pub = cta.build({ ...base, shareLabel: shortNoteLabel(id), shareUrl: shortNoteUrl(id) });
  const priv = cta.build(base);
  assert.equal(pub.kind, "cta");
  assert.equal(priv.kind, "cta");
  if (pub.kind === "cta" && priv.kind === "cta") {
    assert.equal(pub.qrUrl, SHORT);
    assert.equal(priv.qrUrl, null);
  }
});
