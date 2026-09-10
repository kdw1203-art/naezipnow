/* [#134] JPEG EXIF DateTimeOriginal(0x9003) 최소 파서 — 촬영 시각만 읽는다.
 * 왜 직접 파나: 업로드 파이프라인(resizeImageFile)이 canvas 재인코딩으로 EXIF 를
 * 지우므로, 리사이즈 **전** 원본에서 읽어야 한다. 외부 의존성 없이 필요한 태그
 * 하나만 스캔한다. 실패는 전부 null — 이 값은 장식(방문 시간 배지)이지 사실
 * 판정이 아니다. HEIC 등 비 JPEG 는 null.
 *
 * [985 · 11] 여기에 단위 테스트를 붙이면서 두 가지를 고쳤다. 원래는 파서를 새로
 * 하나 더 쓰려 했는데, 같은 일을 하는 코드가 둘이면 다음에 한쪽만 고쳐진다 —
 * 이 파일을 단단하게 만드는 쪽으로 돌렸다.
 *   ① 있을 수 없는 날짜를 통과시켰다. Date.parse("2026-02-30T10:00:00") 은
 *      NaN 이 아니라 3월 2일로 굴러간다(실측). 카메라 시계가 틀어져 그런 값이
 *      들어오면 방문일 <input type="date"> 가 조용히 비었다. 이제 구성요소가
 *      그대로 돌아오는지 직접 확인한다.
 *   ② 손상된 IFD 의 항목 수(n)를 그대로 믿고 최대 65,535번 돌았다. 범위를 벗어난
 *      읽기가 예외를 던져 try/catch 가 받긴 했지만, 애초에 돌 이유가 없다.
 *   ③ 테스트에서 File 없이 확인할 수 있도록 ArrayBuffer 진입점을 뽑았다. */

function readAscii(view: DataView, off: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i += 1) {
    const c = view.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** 디지털 사진에 있을 수 있는 촬영 연도 범위 — 벗어나면 기기 시계가 틀어진 것이다 */
const MIN_YEAR = 1990;
const MAX_YEAR = 2200;

/** "YYYY:MM:DD HH:MM:SS" → ISO(로컬 가정) | null. 내보내는 이유는 테스트. */
export function exifStrToIso(v: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  /* Date.parse 는 2월 30일을 3월 2일로 굴린다 — 구성요소가 그대로 돌아오는지 본다 */
  const dt = new Date(year, month - 1, day, hour, minute, second);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

export async function readExifTakenAt(file: File): Promise<string | null> {
  try {
    if (!/^image\/jpe?g$/i.test(file.type)) return null;
    const buf = await file.slice(0, 256 * 1024).arrayBuffer(); // EXIF 는 파일 앞부분
    return readExifTakenAtFromBuffer(buf);
  } catch {
    return null;
  }
}

/** 바이트에서 바로 읽는다 — File 이 없는 단위 테스트의 진입점이다 */
export function readExifTakenAtFromBuffer(buf: ArrayBuffer): string | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4) return null;
    if (v.getUint16(0) !== 0xffd8) return null; // JPEG SOI

    // APP1(Exif) 세그먼트 탐색
    let off = 2;
    while (off + 4 < v.byteLength) {
      if (v.getUint8(off) !== 0xff) return null;
      const marker = v.getUint8(off + 1);
      const size = v.getUint16(off + 2);
      if (marker === 0xe1 && readAscii(v, off + 4, 4) === "Exif") {
        const tiff = off + 10; // "Exif\0\0" 뒤 TIFF 헤더
        const little = v.getUint16(tiff) === 0x4949;
        const u16 = (p: number) => v.getUint16(p, little);
        const u32 = (p: number) => v.getUint32(p, little);
        if (u16(tiff + 2) !== 0x002a) return null;
        const ifd0 = tiff + u32(tiff + 4);

        const findTag = (ifd: number, tag: number): number | null => {
          if (ifd + 2 > v.byteLength) return null;
          const n = u16(ifd);
          /* 손상된 IFD 는 항목 수가 터무니없다 — 12바이트 × n 이 버퍼를 넘으면 안 읽는다 */
          if (n > 4096 || ifd + 2 + n * 12 > v.byteLength) return null;
          for (let i = 0; i < n; i += 1) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return e;
          }
          return null;
        };

        // ① ExifIFD 포인터(0x8769) → DateTimeOriginal(0x9003)
        // ② 폴백: IFD0 의 DateTime(0x0132)
        const exifPtr = findTag(ifd0, 0x8769);
        const candidates: number[] = [];
        if (exifPtr !== null) {
          const exifIfd = tiff + u32(exifPtr + 8);
          const t = findTag(exifIfd, 0x9003);
          if (t !== null) candidates.push(t);
        }
        const t0 = findTag(ifd0, 0x0132);
        if (t0 !== null) candidates.push(t0);

        for (const e of candidates) {
          const count = u32(e + 4);
          if (count < 10 || count > 40) continue;
          const valOff = count <= 4 ? e + 8 : tiff + u32(e + 8);
          if (valOff + count > v.byteLength) continue;
          const iso = exifStrToIso(readAscii(v, valOff, count));
          if (iso) return iso;
        }
        return null;
      }
      if (marker === 0xda) return null; // SOS — 이후엔 EXIF 없음
      off += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}
