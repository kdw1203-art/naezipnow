import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  exifStrToIso,
  readExifTakenAtFromBuffer,
} from "../../lib/client/exif-datetime.ts";
import { visitDateFromTakenAt } from "../../lib/notes/note-form-utils.ts";

/* ── 테스트용 JPEG 조립 ───────────────────────────────────────────────
   이 파서의 계약은 "어떤 바이트가 와도 던지지 않고, 없는 값을 만들지 않는다"다.
   문자열만 넣어 보면 그 계약을 확인할 수 없어서 실제 바이트로 만든다.
   [#134] 이후 처음 붙는 테스트다 — 하드닝(985)과 같이 들어간다. */
function buildJpeg(opts: {
  dateTimeOriginal?: string;
  dateTime?: string;
  little?: boolean;
  breakMagic?: boolean;
  fakeEntryCount?: number;
}): ArrayBuffer {
  const little = opts.little ?? true;
  const push16 = (a: number[], n: number) =>
    little ? a.push(n & 0xff, (n >> 8) & 0xff) : a.push((n >> 8) & 0xff, n & 0xff);
  const push32 = (a: number[], n: number) =>
    little
      ? a.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff)
      : a.push((n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);

  const hasOrig = typeof opts.dateTimeOriginal === "string";
  const hasDt = typeof opts.dateTime === "string";
  const entries: Array<{ tag: number; type: number; count: number }> = [];
  if (hasDt) entries.push({ tag: 0x0132, type: 2, count: opts.dateTime!.length + 1 });
  if (hasOrig) entries.push({ tag: 0x8769, type: 4, count: 1 });

  const ifd0Size = 2 + entries.length * 12 + 4;
  let heap = 8 + ifd0Size;

  let exifIfdOff = 0;
  const exifBlock: number[] = [];
  if (hasOrig) {
    exifIfdOff = heap;
    const strOff = exifIfdOff + 2 + 12 + 4;
    push16(exifBlock, 1);
    push16(exifBlock, 0x9003);
    push16(exifBlock, 2);
    push32(exifBlock, opts.dateTimeOriginal!.length + 1);
    push32(exifBlock, strOff);
    push32(exifBlock, 0);
    for (const ch of opts.dateTimeOriginal!) exifBlock.push(ch.charCodeAt(0));
    exifBlock.push(0);
    heap += exifBlock.length;
  }

  const dtStrOff = heap;
  const dtBlock: number[] = [];
  if (hasDt) {
    for (const ch of opts.dateTime!) dtBlock.push(ch.charCodeAt(0));
    dtBlock.push(0);
  }

  const tiff: number[] = [];
  push16(tiff, little ? 0x4949 : 0x4d4d);
  push16(tiff, opts.breakMagic ? 0x0000 : 0x002a);
  push32(tiff, 8);
  push16(tiff, opts.fakeEntryCount ?? entries.length);
  for (const e of entries) {
    push16(tiff, e.tag);
    push16(tiff, e.type);
    push32(tiff, e.count);
    push32(tiff, e.tag === 0x8769 ? exifIfdOff : dtStrOff);
  }
  push32(tiff, 0);
  tiff.push(...exifBlock, ...dtBlock);

  const out: number[] = [0xff, 0xd8];
  const app1Len = 2 + 6 + tiff.length;
  out.push(0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff);
  out.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);
  out.push(...tiff);
  out.push(0xff, 0xda, 0x00, 0x02);
  return new Uint8Array(out).buffer;
}

test("정상 촬영 시각은 ISO(로컬 가정)로", () => {
  assert.equal(exifStrToIso("2026:09:08 15:20:11"), "2026-09-08T15:20:11");
});

test("형식이 어긋나면 null", () => {
  for (const bad of ["", "   ", "2026-09-08 15:20:11", "2026:09:08", "쓰레기"]) {
    assert.equal(exifStrToIso(bad), null, bad);
  }
});

test("[985] 있을 수 없는 날짜를 거른다 — Date.parse 는 2월 30일을 3월 2일로 굴린다", () => {
  /* 굴러가는 것을 먼저 증명한다 — 이게 원래 통과했던 이유다 */
  assert.ok(!Number.isNaN(Date.parse("2026-02-30T10:00:00")));
  assert.equal(exifStrToIso("2026:02:30 10:00:00"), null);
  assert.equal(exifStrToIso("2026:04:31 10:00:00"), null);
  /* 윤년은 통과해야 한다 */
  assert.equal(exifStrToIso("2028:02:29 10:00:00"), "2028-02-29T10:00:00");
  assert.equal(exifStrToIso("2026:02:29 10:00:00"), null);
});

test("[985] 기기 시계가 틀어진 값을 거른다", () => {
  assert.equal(exifStrToIso("1980:01:01 10:00:00"), null);
  assert.equal(exifStrToIso("2300:01:01 10:00:00"), null);
  assert.equal(exifStrToIso("2026:13:01 10:00:00"), null);
  assert.equal(exifStrToIso("2026:09:08 25:00:00"), null);
});

test("JPEG 바이트에서 DateTimeOriginal 을 읽는다 (리틀·빅엔디안)", () => {
  assert.equal(
    readExifTakenAtFromBuffer(buildJpeg({ dateTimeOriginal: "2026:09:08 15:20:11" })),
    "2026-09-08T15:20:11",
  );
  assert.equal(
    readExifTakenAtFromBuffer(
      buildJpeg({ dateTimeOriginal: "2026:07:01 08:00:00", little: false }),
    ),
    "2026-07-01T08:00:00",
  );
});

test("촬영 시각이 없으면 IFD0 의 DateTime 으로 내려가고, 있으면 그쪽이 이긴다", () => {
  assert.equal(
    readExifTakenAtFromBuffer(buildJpeg({ dateTime: "2026:05:04 11:22:33" })),
    "2026-05-04T11:22:33",
  );
  assert.equal(
    readExifTakenAtFromBuffer(
      buildJpeg({ dateTimeOriginal: "2026:09:08 15:00:00", dateTime: "2026:01:01 00:00:00" }),
    ),
    "2026-09-08T15:00:00",
  );
});

test("어떤 바이트가 와도 던지지 않고, 없는 값을 만들지 않는다 — 이 파서의 계약", () => {
  const cases: ArrayBuffer[] = [
    new ArrayBuffer(0),
    new ArrayBuffer(2),
    new Uint8Array([0xff, 0xd8]).buffer,
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, // PNG
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x02]).buffer,
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45, 0x78, 0x69, 0x66]).buffer,
    buildJpeg({ dateTimeOriginal: "2026:09:08 15:20:11", breakMagic: true }),
    buildJpeg({ dateTimeOriginal: "2026:09:08 15:20:11", fakeEntryCount: 60000 }),
  ];
  for (const [i, buf] of cases.entries()) {
    assert.doesNotThrow(() => readExifTakenAtFromBuffer(buf), `case ${i}`);
    const r = readExifTakenAtFromBuffer(buf);
    assert.ok(r === null || /^\d{4}-\d{2}-\d{2}T/.test(r), `case ${i}: ${r}`);
  }
});

test("[985] 손상된 IFD(항목 수 과장)는 읽지 않는다", () => {
  assert.equal(
    readExifTakenAtFromBuffer(
      buildJpeg({ dateTimeOriginal: "2026:09:08 15:20:11", fakeEntryCount: 60000 }),
    ),
    null,
  );
});

test("방문일 프리필 — 미래 촬영은 안 쓰고, 거른 값은 애초에 오지 않는다", () => {
  assert.equal(visitDateFromTakenAt("2026-09-08T15:00:00", "2026-09-10"), "2026-09-08");
  assert.equal(visitDateFromTakenAt("2026-09-11T15:00:00", "2026-09-10"), null);
  assert.equal(visitDateFromTakenAt(null, "2026-09-10"), null);
  /* 파서가 이미 걸러 주므로 폼에는 이런 값이 오지 않는다 — 그래도 확인해 둔다 */
  assert.equal(exifStrToIso("2026:02:30 10:00:00"), null);
});
