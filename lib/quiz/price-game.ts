/**
 * [1008 · Q] 실거래가 게임(/quiz) — 규칙·시드·표기(순수, 서버·클라이언트 공용).
 *
 * 왜 있나(실측): 30일 사람 트래픽에서 홈 중앙 체류 5.1초, 단지 페이지 착지의 48%가 다음 페이지 없이
 * 이탈했다(common 1008). 가볍게 들어와 한 판 하고 "오늘 본 단지"로 깊이 들어가는 입구가 없다.
 * 이 게임은 그 입구다 — 그래서 재미를 위해 **사실을 지어내지 않는다**:
 *  - 보기·정답·해설은 전부 국토교통부 실거래 신고 1건(매매·해제 신고 제외·전용 80~86㎡·최근 12개월).
 *  - KST 날짜가 시드 — 같은 날엔 누구나 같은 문제라 "오늘 7/10" 공유가 성립한다.
 *  - 연속 두 단지 가격 차이가 ±3% 이내면 건너뛴다(동전 던지기 문제 금지).
 * DB·React·Date.now() 를 모른다 — 조회는 lib/quiz/load-price-game.ts(server-only), 화면은 app/quiz.
 */

export const QUIZ_ROUNDS = 10;
/** 연속 두 단지 가격 차이가 이 비율 이하면 문제로 쓰지 않는다(±3%) */
export const QUIZ_MIN_GAP = 0.03;
/** 같은 면적대 — 전용 84㎡ 안팎 */
export const QUIZ_AREA_MIN_M2 = 80;
export const QUIZ_AREA_MAX_M2 = 86;
/** 계약 연월 창 — 이번 달을 포함한 12개월(단지 허브 countDealsInWindow 와 같은 달력 규칙) */
export const QUIZ_WINDOW_MONTHS = 12;

export type RegionBucket = "seoul" | "gyeonggi" | "metro" | "other";

/** 하루 풀 22곳(20~24) — 서울·경기·광역시·그 외를 섞는다 */
export const QUIZ_BUCKET_QUOTA: Readonly<Record<RegionBucket, number>> = {
  seoul: 7,
  gyeonggi: 6,
  metro: 5,
  other: 4,
};

const BUCKETS: readonly RegionBucket[] = ["seoul", "gyeonggi", "metro", "other"];

/* 실거래 region_name 은 "서울 관악구"·"부산 남구"·"안양 동안구"·"남양주시"·"광주시"처럼 적힌다
   (2026-09-21 complex_tx_stats 실측: 광역시는 "부산 X구" 두 낱말, 경기 시는 "시" 없는 두 낱말이거나
   "…시" 한 낱말). "광주 X구"(광주광역시)와 "광주시"(경기)는 낱말 수로 가른다. */
const METRO_HEADS = new Set(["부산", "인천", "대구", "울산", "광주", "대전"]);
const GYEONGGI_CITIES = new Set([
  "수원", "성남", "고양", "용인", "부천", "안산", "안양", "화성", "남양주", "평택", "시흥", "의정부",
  "김포", "파주", "군포", "광주", "이천", "구리", "양주", "하남", "오산", "광명", "의왕", "안성",
  "동두천", "포천", "여주", "과천",
]);
const GYEONGGI_COUNTIES = new Set(["양평군", "가평군", "연천군"]);

/** region_name → 서울·경기·광역시(세종 포함)·그 외 */
export function regionBucket(regionName: string): RegionBucket {
  const parts = regionName.trim().split(/\s+/).filter(Boolean);
  const head = parts[0] ?? "";
  if (head === "서울") return "seoul";
  if (parts.length >= 2 && METRO_HEADS.has(head)) return "metro";
  if (head === "세종시" || head === "세종") return "metro";
  if (GYEONGGI_COUNTIES.has(head)) return "gyeonggi";
  if (GYEONGGI_CITIES.has(head.replace(/시$/, ""))) return "gyeonggi";
  return "other";
}

/* ── 시드 ─────────────────────────────────────────────────────────────── */

/** 문자열 → 32비트 시드(FNV-1a) */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 결정적 난수(mulberry32) — 같은 시드면 같은 수열 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 피셔-예이츠 — 원본은 건드리지 않는다 */
export function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── 풀 고르기 ─────────────────────────────────────────────────────────── */

export interface QuizCandidate {
  region: string;
  name: string;
}

function nameKey(name: string): string {
  return name.replace(/\s+/g, "");
}

/**
 * 후보(최근 거래가 있는 단지 목록) → 오늘의 풀. 버킷별 할당량만큼 날짜 시드로 뽑고 섞는다.
 *  - 입력 순서에 기대지 않는다: (지역, 이름)으로 먼저 정렬한다 — DB 정렬의 동점 순서가 조회마다
 *    달라도 같은 날엔 같은 풀이 나온다.
 *  - 같은 이름(공백 무시)은 하루에 한 번만 — "롯데캐슬"(중구)·"롯데캐슬"(양천구)이 한 판에
 *    나오면 무엇이 무엇인지 헷갈린다(2026-09-21 실측 풀에 실제로 있었다).
 *  - 어떤 버킷이 모자라면 남은 후보로 채운다. reserve 는 풀이 모자랄 때 이어 쓸 예비 순서.
 */
export function pickQuizCandidates(
  rows: readonly QuizCandidate[],
  date: string,
  quota: Readonly<Record<RegionBucket, number>> = QUIZ_BUCKET_QUOTA,
  reserveSize = 44,
): { primary: QuizCandidate[]; reserve: QuizCandidate[] } {
  const rand = mulberry32(hashSeed(`nz-quiz:${date}`));
  const sorted = rows
    .filter((r) => r.region.trim() && r.name.trim())
    .slice()
    .sort((a, b) =>
      a.region === b.region ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.region < b.region ? -1 : 1,
    );
  const byBucket: Record<RegionBucket, QuizCandidate[]> = { seoul: [], gyeonggi: [], metro: [], other: [] };
  for (const r of sorted) byBucket[regionBucket(r.region)].push(r);
  const shuffled = Object.fromEntries(
    BUCKETS.map((b) => [b, seededShuffle(byBucket[b], rand)]),
  ) as Record<RegionBucket, QuizCandidate[]>;

  const usedNames = new Set<string>();
  const picked: QuizCandidate[] = [];
  const leftovers: QuizCandidate[] = [];
  let deficit = 0;
  for (const b of BUCKETS) {
    let taken = 0;
    for (const c of shuffled[b]) {
      const k = nameKey(c.name);
      if (taken < quota[b] && !usedNames.has(k)) {
        usedNames.add(k);
        picked.push(c);
        taken++;
      } else {
        leftovers.push(c);
      }
    }
    deficit += Math.max(0, quota[b] - taken);
  }
  const rest = seededShuffle(leftovers, rand).filter((c) => {
    const k = nameKey(c.name);
    if (usedNames.has(k)) return false;
    usedNames.add(k);
    return true;
  });
  const fill = rest.slice(0, deficit);
  return {
    primary: seededShuffle([...picked, ...fill], rand),
    reserve: rest.slice(deficit, deficit + reserveSize),
  };
}

/* ── 문제 사슬 ─────────────────────────────────────────────────────────── */

export interface QuizTrade {
  /** 계약 연월 YYYYMM */
  ym: string;
  floor: number | null;
  /** 전용면적(㎡) */
  areaM2: number;
  /** 거래금액(만원 — 국토부 신고 단위 그대로) */
  priceManwon: number;
  buildYear: number | null;
}

export interface QuizEntry extends QuizCandidate, QuizTrade {
  /** 단지 허브 경로(/complex/…) */
  href: string;
}

export interface QuizDay {
  /** KST 날짜 YYYY-MM-DD — 이 날의 문제 */
  date: string;
  /** 계약 연월 창(포함) */
  fromYm: string;
  toYm: string;
  /** 사슬 — 라운드 i 는 entries[i](A) vs entries[i+1](B). 길이 = 라운드 수 + 1 */
  entries: QuizEntry[];
}

/** A 대비 B 의 가격 차이 비율 |B−A|/A (A 가 0 이하면 0) */
export function priceGap(aManwon: number, bManwon: number): number {
  if (!(aManwon > 0)) return 0;
  return Math.abs(bManwon - aManwon) / aManwon;
}

/**
 * 시드 순서의 단지들 → 문제 사슬(최대 rounds+1 개). 바로 앞 단지와 차이가 minGap 이하인 단지는
 * 그 자리에 쓰지 않고 뒤로 미뤄 다음 자리에서 다시 본다(버리면 풀이 금방 마른다).
 */
export function buildQuizChain<T extends { priceManwon: number }>(
  entries: readonly T[],
  rounds = QUIZ_ROUNDS,
  minGap = QUIZ_MIN_GAP,
): T[] {
  const pending = entries.filter((e) => Number.isFinite(e.priceManwon) && e.priceManwon > 0);
  const first = pending.shift();
  if (!first) return [];
  const chain: T[] = [first];
  while (chain.length < rounds + 1 && pending.length > 0) {
    const prev = chain[chain.length - 1];
    const idx = pending.findIndex((e) => priceGap(prev.priceManwon, e.priceManwon) > minGap);
    if (idx < 0) break;
    chain.push(pending.splice(idx, 1)[0]);
  }
  return chain;
}

/* ── 날짜 ──────────────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** epoch ms → KST 날짜 "YYYY-MM-DD" (한국은 서머타임이 없어 +9h 고정) */
export function kstDateOf(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" + n일 */
export function addDaysIso(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** YYYYMM ± n개월 */
export function shiftYm(ym: string, months: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + months;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, "0")}`;
}

/** 그 날의 계약 연월 창 — 이번 달 포함 12개월 */
export function quizWindow(date: string, months = QUIZ_WINDOW_MONTHS): { fromYm: string; toYm: string } {
  const toYm = `${date.slice(0, 4)}${date.slice(5, 7)}`;
  return { fromYm: shiftYm(toYm, -(months - 1)), toYm };
}

/** "2026-09-21" → "9월 21일" */
export function quizDateLabel(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

/** "202608" → "2026.08" */
export function ymDotLabel(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : ym;
}

/** 전용면적 표기 — 신고값을 소수 둘째 자리에서 자른다(84.9477 → "84.94").
 *  정수로 옮긴 뒤 자른다: `Math.floor(m2 * 100)` 는 부동소수 오차로 80.07 → 80.06, 81.6 → 81.59 처럼
 *  신고값보다 0.01 작게 적었다(리뷰 C — 게임 면적 범위에서 30개 값). 먼저 소수 넷째 자리까지 반올림해
 *  오차를 걷어 내고(신고값은 소수 넷째 자리까지다) 그다음에 자른다. */
export function areaLabel(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return "—";
  return String(Math.floor(Math.round(m2 * 10_000) / 100) / 100);
}

/* ── 채점·해설 ─────────────────────────────────────────────────────────── */

export type QuizGuess = "higher" | "lower";

export function isCorrectGuess(aManwon: number, bManwon: number, guess: QuizGuess): boolean {
  return guess === "higher" ? bManwon > aManwon : bManwon < aManwon;
}

/** 해설 재료 — B 가 A 보다 얼마나(만원·%) 비싼지/싼지 */
export function compareFact(aManwon: number, bManwon: number): {
  direction: QuizGuess;
  diffManwon: number;
  pct: number;
} {
  const diff = bManwon - aManwon;
  return {
    direction: diff > 0 ? "higher" : "lower",
    diffManwon: Math.abs(diff),
    pct: aManwon > 0 ? Math.round((Math.abs(diff) / aManwon) * 100) : 0,
  };
}

/* ── 기록(localStorage) — 파싱·갱신은 순수, 읽기·쓰기는 화면이 try/catch 로 ─────── */

export const QUIZ_STORE_KEY = "nz:quiz:v1";
const STORE_KEEP_DAYS = 60;

export interface QuizDayRecord {
  score: number;
  total: number;
  /** 최장 연속 정답 */
  streak: number;
}

export interface QuizStore {
  days: Record<string, QuizDayRecord>;
  best: (QuizDayRecord & { date: string }) | null;
}

function isRecord(v: unknown): v is QuizDayRecord {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return [o.score, o.total, o.streak].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
}

/** 저장 문자열 → 기록. 깨졌거나 없으면 빈 기록(예외를 던지지 않는다) */
export function parseQuizStore(raw: string | null | undefined): QuizStore {
  const empty: QuizStore = { days: {}, best: null };
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw) as { days?: unknown; best?: unknown };
    const days: Record<string, QuizDayRecord> = {};
    if (o.days && typeof o.days === "object") {
      for (const [k, v] of Object.entries(o.days as Record<string, unknown>)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isRecord(v)) days[k] = { score: v.score, total: v.total, streak: v.streak };
      }
    }
    const b = o.best as Record<string, unknown> | null | undefined;
    const best =
      b && isRecord(b) && typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
        ? { score: b.score, total: b.total, streak: b.streak, date: b.date }
        : null;
    return { days, best };
  } catch {
    return empty;
  }
}

/** 오늘 결과를 남긴다 — 그 날의 **첫 판만** 기록(다시 풀기는 기록을 바꾸지 않는다), 최고 기록 갱신 */
export function recordQuizResult(store: QuizStore, date: string, rec: QuizDayRecord): QuizStore {
  if (store.days[date]) return store;
  const days = { ...store.days, [date]: rec };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - STORE_KEEP_DAYS))) delete days[k];
  const better =
    !store.best || rec.score > store.best.score || (rec.score === store.best.score && rec.streak > store.best.streak);
  return { days, best: better ? { ...rec, date } : store.best };
}

/** 공유 문구 — 점수만(개인정보·단지명 없음). 다시 풀기(답을 아는 판)면 그렇다고 적는다 */
export function quizShareText(date: string, rec: QuizDayRecord, replay = false): string {
  return `내집나우 실거래가 게임 ${quizDateLabel(date)}${replay ? "(다시 풀기)" : ""} — ${rec.score}/${rec.total} 정답 · 최장 연속 ${rec.streak}`;
}

/** 끝 화면 한마디 — 정확히 절반은 "절반 넘게"가 아니다(리뷰 C: 5/10) */
export function quizScoreMessage(score: number, total: number): string {
  if (total > 0 && score === total) return "전부 맞혔어요! 실거래 감각이 대단해요";
  if (score >= Math.ceil(total * 0.8)) return "훌륭해요 — 실거래가 감이 살아 있어요";
  if (score * 2 > total) return "절반 넘게 맞혔어요";
  if (total > 0 && score * 2 === total) return "딱 절반 맞혔어요 — 내일은 한 문제 더!";
  return "어려웠죠? 오늘 본 단지를 둘러보고 내일 다시 도전해요";
}
