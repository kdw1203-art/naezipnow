/**
 * [997] QR 인코더 — **순수 TS, 의존성 0**. 카드 마무리 장에 짧은 링크 QR 을 찍는다.
 *
 * 범위: 바이트 모드(UTF-8) · 버전 1~10 자동 선택 · EC L/M/Q/H · 리드-솔로몬(GF(256)) ·
 * 블록 인터리브 · 마스크 8종 중 페널티 최소 선택 · 포맷(BCH 15) · 버전 정보(BCH 18, v7+).
 * ISO/IEC 18004 절차를 그대로 따른다 — 판독은 tests/unit/qr-997.test.ts 가 jsqr 로 검증한다.
 *
 * 왜 직접 쓰나: 런타임 의존성을 얹지 않기 위해서다(카드 스튜디오는 이미 html-to-image 를
 * 누를 때만 받는다). 짧은 링크(32자)는 v2~3 이면 충분하지만, 여유로 v10(UTF-8 ≈270자)까지 둔다.
 */

export type QrEcLevel = "L" | "M" | "Q" | "H";

export type QrCode = {
  /** 한 변의 모듈 수 = 21 + 4(version − 1) */
  size: number;
  /** [row][col] — true 가 어두운 모듈 */
  modules: boolean[][];
  version: number;
  ecLevel: QrEcLevel;
  mask: number;
};

/* ── 버전/EC 표 (v1~10) ─ [ecPerBlock, [g1 blocks, g1 data], [g2 blocks, g2 data]] ── */
type BlockSpec = [ec: number, g1: [number, number], g2: [number, number]];
const EC_TABLE: Record<QrEcLevel, BlockSpec[]> = {
  L: [
    [7, [1, 19], [0, 0]], [10, [1, 34], [0, 0]], [15, [1, 55], [0, 0]], [20, [1, 80], [0, 0]],
    [26, [1, 108], [0, 0]], [18, [2, 68], [0, 0]], [20, [2, 78], [0, 0]], [24, [2, 97], [0, 0]],
    [30, [2, 116], [0, 0]], [18, [2, 68], [2, 69]],
  ],
  M: [
    [10, [1, 16], [0, 0]], [16, [1, 28], [0, 0]], [26, [1, 44], [0, 0]], [18, [2, 32], [0, 0]],
    [24, [2, 43], [0, 0]], [16, [4, 27], [0, 0]], [18, [4, 31], [0, 0]], [22, [2, 38], [2, 39]],
    [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
  ],
  Q: [
    [13, [1, 13], [0, 0]], [22, [1, 22], [0, 0]], [18, [2, 17], [0, 0]], [26, [2, 24], [0, 0]],
    [18, [2, 15], [2, 16]], [24, [4, 19], [0, 0]], [18, [2, 14], [4, 15]], [22, [4, 18], [2, 19]],
    [20, [4, 16], [4, 17]], [24, [6, 19], [2, 20]],
  ],
  H: [
    [17, [1, 9], [0, 0]], [28, [1, 16], [0, 0]], [22, [2, 13], [0, 0]], [16, [4, 9], [0, 0]],
    [22, [2, 11], [2, 12]], [28, [4, 15], [0, 0]], [26, [4, 13], [1, 14]], [26, [4, 14], [2, 15]],
    [24, [4, 12], [4, 13]], [28, [6, 15], [2, 16]],
  ],
};
/** 포맷 정보의 EC 비트 — L=01 M=00 Q=11 H=10 */
const EC_BITS: Record<QrEcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
const MAX_VERSION = 10;

/* ── GF(256), 원시다항식 0x11D ─────────────────────────────────────────── */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** 생성다항식 ∏(x − α^i), i=0..n−1 — 최고차 계수부터 */
function rsGenerator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** 데이터 블록 → EC 코드워드 n개(다항식 나눗셈의 나머지) */
function rsEncode(data: number[], n: number): number[] {
  const gen = rsGenerator(n);
  const rem = new Array<number>(n).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    if (factor === 0) continue;
    for (let j = 0; j < n; j++) rem[j] ^= gfMul(gen[j + 1], factor);
  }
  return rem;
}

/* ── 비트 버퍼 ─────────────────────────────────────────────────────────── */
class Bits {
  bits: number[] = [];
  push(value: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function dataCodewords(spec: BlockSpec): number {
  return spec[1][0] * spec[1][1] + spec[2][0] * spec[2][1];
}

/** 바이트 모드: 4비트 모드 + 글자수(v≤9: 8비트, v10+: 16비트) + 데이터 */
function neededBits(byteLen: number, version: number): number {
  return 4 + (version <= 9 ? 8 : 16) + byteLen * 8;
}

/** 데이터 비트열 → 코드워드(종결자·바이트 정렬·패딩 0xEC/0x11) */
function buildCodewords(bytes: number[], version: number, capacity: number): number[] {
  const bb = new Bits();
  bb.push(0b0100, 4);
  bb.push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) bb.push(b, 8);
  const cap = capacity * 8;
  bb.push(0, Math.min(4, cap - bb.bits.length)); // 종결자
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    out.push(v);
  }
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** 블록 분할 → RS → 인터리브(데이터 열 우선, 그 뒤 EC 열 우선) */
function interleave(codewords: number[], spec: BlockSpec): number[] {
  const [ec, [g1n, g1len], [g2n, g2len]] = spec;
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  let off = 0;
  for (let i = 0; i < g1n + g2n; i++) {
    const len = i < g1n ? g1len : g2len;
    const block = codewords.slice(off, off + len);
    off += len;
    blocks.push(block);
    ecs.push(rsEncode(block, ec));
  }
  const out: number[] = [];
  const maxLen = Math.max(g1len, g2len);
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

/* ── 매트릭스 ──────────────────────────────────────────────────────────── */

/** 정렬 패턴 중심 좌표(v≤40 공식; v1 은 없음) */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = 17 + version * 4;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const pos = [6];
  for (let p = size - 7; pos.length < count; p -= step) pos.splice(1, 0, p);
  return pos;
}

type Grid = { size: number; mod: boolean[][]; fn: boolean[][] };

function newGrid(size: number): Grid {
  const row = () => new Array<boolean>(size).fill(false);
  return { size, mod: Array.from({ length: size }, row), fn: Array.from({ length: size }, row) };
}

function setFn(g: Grid, col: number, row: number, dark: boolean) {
  g.mod[row][col] = dark;
  g.fn[row][col] = true;
}

/** 파인더(3) + 분리선, 타이밍, 정렬, 다크 모듈, 포맷·버전 자리 예약 */
function drawFunctionPatterns(g: Grid, version: number) {
  const { size } = g;
  for (let i = 0; i < size; i++) {
    setFn(g, 6, i, i % 2 === 0);
    setFn(g, i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(g, x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const ap = alignmentPositions(version);
  for (let i = 0; i < ap.length; i++)
    for (let j = 0; j < ap.length; j++) {
      const corner =
        (i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          setFn(g, ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  drawFormat(g, 0, 0); // 자리 예약(값은 마스크 결정 후 다시 쓴다)
  drawVersion(g, version);
}

/** 포맷 정보 15비트 = BCH(15,5)(EC 2비트 + 마스크 3비트) XOR 0x5412, 두 벌 */
function drawFormat(g: Grid, ecBits: number, mask: number) {
  const { size } = g;
  const data = (ecBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, bit(i));
  setFn(g, 8, 7, bit(6));
  setFn(g, 8, 8, bit(7));
  setFn(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(g, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(g, 8, size - 15 + i, bit(i));
  setFn(g, 8, size - 8, true); // 다크 모듈
}

/** 버전 정보 18비트 = BCH(18,6), v7+ 만. 우상단(6×3)·좌하단(3×6) 두 벌 */
function drawVersion(g: Grid, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(g, a, b, dark);
    setFn(g, b, a, dark);
  }
}

/** 코드워드 비트를 오른쪽 아래부터 2열씩 지그재그로 채운다(6열은 건너뜀). 남는 모듈은 0. */
function drawCodewords(g: Grid, cw: number[]) {
  const { size } = g;
  let i = 0;
  const total = cw.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (g.fn[y][x] || i >= total) continue;
        g.mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 데이터 모듈에만 마스크 XOR(두 번 적용하면 원상복구) */
function applyMask(g: Grid, mask: number) {
  const f = MASKS[mask];
  for (let y = 0; y < g.size; y++)
    for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && f(x, y)) g.mod[y][x] = !g.mod[y][x];
}

/** 페널티 4규칙: ①같은 색 5+ 연속 ②2×2 블록 ③파인더 유사 패턴(1011101+0000) ④명암 비율 */
function penalty(g: Grid): number {
  const { size, mod } = g;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let s = "";
    let run = 0;
    let prev: boolean | null = null;
    for (let i = 0; i < size; i++) {
      const v = get(i);
      s += v ? "1" : "0";
      if (v === prev) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else {
        prev = v;
        run = 1;
      }
    }
    for (const pat of ["10111010000", "00001011101"]) {
      let idx = s.indexOf(pat);
      while (idx !== -1) {
        score += 40;
        idx = s.indexOf(pat, idx + 1);
      }
    }
  };
  for (let y = 0; y < size; y++) line((x) => mod[y][x]);
  for (let x = 0; x < size; x++) line((y) => mod[y][x]);
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
  let dark = 0;
  for (const row of mod) for (const v of row) if (v) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/* ── 공개 API ──────────────────────────────────────────────────────────── */

/** UTF-8 바이트 모드 QR. 너무 길면(v10 초과) throw. */
export function encodeQr(text: string, opts: { ecLevel?: QrEcLevel } = {}): QrCode {
  const ecLevel: QrEcLevel = opts.ecLevel ?? "M";
  const bytes = utf8Bytes(text);
  const table = EC_TABLE[ecLevel];
  let version = 0;
  let spec: BlockSpec | null = null;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const s = table[v - 1];
    if (neededBits(bytes.length, v) <= dataCodewords(s) * 8) {
      version = v;
      spec = s;
      break;
    }
  }
  if (!spec) throw new Error(`[qr] 입력이 너무 깁니다 — ${bytes.length}바이트 (버전 ${MAX_VERSION}·${ecLevel} 초과)`);

  const codewords = interleave(buildCodewords(bytes, version, dataCodewords(spec)), spec);
  const g = newGrid(17 + version * 4);
  drawFunctionPatterns(g, version);
  drawCodewords(g, codewords);

  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(g, m);
    drawFormat(g, EC_BITS[ecLevel], m);
    const s = penalty(g);
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
    applyMask(g, m);
  }
  applyMask(g, best);
  drawFormat(g, EC_BITS[ecLevel], best);

  return { size: g.size, modules: g.mod, version, ecLevel, mask: best };
}
