/**
 * 썸네일 문구의 숫자 검증 — **순수 모듈**. 지어낸 숫자를 막는 유일한 관문이다.
 *
 * 규칙(브리프 "숫자 검증"):
 *  · 후보 문구(제목·사실·보조)의 **모든 숫자**는 노트 원문에 있어야 한다 — 제목·요약·본문(sections·체크리스트
 *    ·판단 근거·교통·날씨)·단지명·지역·metadata.key_metrics. 하나라도 없으면 그 후보를 버린다.
 *  · 비교는 값으로 한다: "25.00억" = 25, "1,152세대" = 1152. 반올림은 인정하지 않는다(71.4 ≠ 71).
 *  · 부호: 후보가 "−22.6%" 라고 쓰면 원문에도 음수 22.6 이 있어야 하고, "+11.9%" 라고 쓰면 원문의
 *    같은 값이 음수가 아니어야 한다(방향을 뒤집어 쓰는 것도 지어낸 숫자다). 부호 없는 숫자는 값만 본다.
 *  · 한글 수사("두 배"·"세 곳"·"수백 건"…)도 숫자다 — 원문에 같은 말이 그대로 있을 때만 통과.
 *  · 점수: 노트 5축 평균×20(목록·상세가 쓰는 같은 환산)은 노트가 가진 숫자로 친다 — "기록 64점".
 *
 * metadata.cover 자체는 원문에 넣지 않는다(자기 자신으로 자기를 검증하지 않는다).
 */
import { FACT_MAX, HEADLINE_MAX, SUB_MAX, charLength } from "./spec";

/** 검증에 필요한 노트 필드 — InspectionNote 의 부분집합(느슨하게: Lab 노트의 sections 는 배열이다) */
export type CoverNote = {
  id?: string;
  title?: string | null;
  aptName?: string | null;
  region?: string | null;
  summary?: string | null;
  sections?: unknown;
  checklist?: unknown;
  transportation?: string | null;
  weather?: string | null;
  scores?: Partial<Record<"location" | "school" | "transport" | "facility" | "future", number>> | null;
  metadata?: unknown;
  photos?: unknown;
  authorLabel?: string | null;
};

export type NumberToken = {
  /** 값을 정규화한 키 — String(Number(x)) */
  key: string;
  negative: boolean;
  /** 앞에 "+" 가 붙어 있었나 */
  plus: boolean;
  raw: string;
};

const SIGN_MINUS = new Set(["-", "−", "–"]);

/**
 * 글에서 숫자 뽑기. "1,152" → 1152 · "9.35" → 9.35 · "2025.06.18" → 2025·6·18 · "10억3건" → 10·3.
 * 부호는 바로 앞 글자가 −/-/+ 이고 그 앞이 숫자·글자가 아닐 때만 본다("2023-06" 의 - 는 부호가 아니다).
 */
export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  const re = /\d[\d.,]*\d|\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const start = m.index;
    const prev = text[start - 1] ?? "";
    const prev2 = text[start - 2] ?? "";
    const signable = !/[0-9A-Za-z가-힣]/.test(prev2);
    const negative = SIGN_MINUS.has(prev) && signable;
    const plus = prev === "+" && signable;
    const parts: string[] = [];
    const dots = (raw.match(/\./g) ?? []).length;
    if (dots >= 2) {
      /* 날짜(2025.06.18) — 조각마다 따로 */
      for (const p of raw.split(/[.,]/)) if (p) parts.push(p);
    } else if (raw.includes(",")) {
      const [intPart, decPart] = raw.split(".");
      if (/^\d{1,3}(,\d{3})+$/.test(intPart)) parts.push(intPart.replace(/,/g, "") + (decPart ? `.${decPart}` : ""));
      else for (const p of raw.split(/[,]/)) if (p) parts.push(p);
    } else {
      parts.push(raw);
    }
    parts.forEach((p, i) => {
      const n = Number(p);
      if (!Number.isFinite(n)) return;
      /* 부호는 첫 조각에만 붙는다 */
      out.push({ key: String(n), negative: i === 0 && negative, plus: i === 0 && plus, raw: p });
    });
  }
  return out;
}

/* 한글 수사 + 단위 — 숫자 없이 수량을 말하는 표현. 원문에 같은 말이 있어야 통과 */
const NUMERAL_WORD_RE =
  /(?:^|[^가-힣])((?:두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|수십|수백|수천|수만|몇)\s?(?:배|건|곳|위|층|평|해|달|개월|가구|채|명|번째|차례))/g;
const HALF_WORD_RE = /(절반|반값|반토막|곱절)/g;

export function numeralPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMERAL_WORD_RE)) out.push(m[1]);
  for (const m of text.matchAll(HALF_WORD_RE)) out.push(m[1]);
  return out;
}

export type NumberCorpus = {
  /** 값 키 → 원문에 나온 부호 */
  values: Map<string, { neg: boolean; nonNeg: boolean }>;
  /** 공백을 지운 원문 — 한글 수사 대조용 */
  compactText: string;
};

function addValue(corpus: NumberCorpus, key: string, negative: boolean): void {
  const cur = corpus.values.get(key) ?? { neg: false, nonNeg: false };
  if (negative) cur.neg = true;
  else cur.nonNeg = true;
  corpus.values.set(key, cur);
}

/** 문자열·숫자·배열·객체를 훑어 문자열 조각과 숫자 값을 모은다(깊이 제한 — 이상한 jsonb 에 갇히지 않게) */
function collect(value: unknown, texts: string[], nums: number[], depth = 0): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    texts.push(value);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) nums.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value.slice(0, 200)) collect(v, texts, nums, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>).slice(0, 200)) collect(v, texts, nums, depth + 1);
  }
}

/** 노트 5축 평균×20(입력된 축만) — 없으면 null. store-db inspectionAverageScore 와 같은 규칙 */
export function noteScore100(scores: CoverNote["scores"]): number | null {
  if (!scores) return null;
  const axes = [scores.location, scores.school, scores.transport, scores.facility, scores.future]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!axes.length) return null;
  return Math.round((axes.reduce((s, v) => s + v, 0) / axes.length) * 20);
}

/** 노트 원문에서 숫자 사전 만들기 */
export function buildNumberCorpus(note: CoverNote): NumberCorpus {
  const texts: string[] = [];
  const nums: number[] = [];
  collect(note.title, texts, nums);
  collect(note.aptName, texts, nums);
  collect(note.region, texts, nums);
  collect(note.summary, texts, nums);
  collect(note.sections, texts, nums);
  collect(note.checklist, texts, nums);
  collect(note.transportation, texts, nums);
  collect(note.weather, texts, nums);
  const meta =
    note.metadata && typeof note.metadata === "object" && !Array.isArray(note.metadata)
      ? (note.metadata as Record<string, unknown>)
      : {};
  /* 원문 = 본문 + key_metrics + 작성자의 판단 근거. metadata 의 나머지(좌표·가설·게이트·cover)는 넣지 않는다 */
  collect(meta.key_metrics, texts, nums);
  const decision = meta.decision as { reasons?: unknown } | undefined;
  if (decision && typeof decision === "object") collect(decision.reasons, texts, nums);

  const corpus: NumberCorpus = { values: new Map(), compactText: texts.join(" ").replace(/\s+/g, "") };
  for (const t of texts) for (const tok of extractNumbers(t)) addValue(corpus, tok.key, tok.negative);
  for (const n of nums) addValue(corpus, String(Math.abs(n)), n < 0);
  const score = noteScore100(note.scores);
  if (score !== null) addValue(corpus, String(score), false);
  return corpus;
}

/** 원문에 없는 숫자(또는 한글 수사) 목록 — 빈 배열이면 통과 */
export function unverifiedNumbers(text: string, corpus: NumberCorpus): string[] {
  const bad: string[] = [];
  for (const tok of extractNumbers(text)) {
    const seen = corpus.values.get(tok.key);
    const shown = `${tok.negative ? "−" : tok.plus ? "+" : ""}${tok.raw}`;
    if (!seen) bad.push(shown);
    else if (tok.negative && !seen.neg) bad.push(shown);
    else if (tok.plus && !seen.nonNeg) bad.push(shown);
  }
  for (const phrase of numeralPhrases(text)) {
    if (!corpus.compactText.includes(phrase.replace(/\s+/g, ""))) bad.push(phrase);
  }
  return bad;
}

/* 문구 모양 규칙 — 이모지·느낌표·따옴표 장식·물음표 두 개 이상은 버린다(디자인 시스템 v3 규칙 4·6) */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}]/u;

export type CoverTextCheck = { ok: boolean; problems: string[] };

/**
 * 후보 한 장 검증 — 길이 + 모양 + 숫자. 문제 목록을 돌려준다(로그·테스트용).
 * sub 는 코드가 노트에서 조립하지만 같은 잣대로 본다(단지명의 "9단지" 도 원문에 있으니 통과한다).
 */
export function verifyCoverText(
  text: { headline: string; fact: string | null; sub: string },
  corpus: NumberCorpus,
): CoverTextCheck {
  const problems: string[] = [];
  const headline = text.headline ?? "";
  const fact = text.fact;
  if (!headline.trim()) problems.push("제목 없음");
  if (charLength(headline) > HEADLINE_MAX) problems.push(`제목 ${charLength(headline)}자 > ${HEADLINE_MAX}`);
  if (fact !== null && !fact.trim()) problems.push("사실 빈 문자열");
  if (fact !== null && charLength(fact) > FACT_MAX) problems.push(`사실 ${charLength(fact)}자 > ${FACT_MAX}`);
  if (charLength(text.sub ?? "") > SUB_MAX) problems.push(`보조 ${charLength(text.sub)}자 > ${SUB_MAX}`);
  for (const [label, s] of [
    ["제목", headline],
    ["사실", fact ?? ""],
    ["보조", text.sub ?? ""],
  ] as const) {
    if (EMOJI_RE.test(s)) problems.push(`${label}에 이모지`);
    if (/[!！]/.test(s)) problems.push(`${label}에 느낌표`);
    if (/[<>{}]/.test(s)) problems.push(`${label}에 허용하지 않는 기호`);
    const bad = unverifiedNumbers(s, corpus);
    if (bad.length) problems.push(`${label}의 숫자가 원문에 없음: ${bad.join(", ")}`);
  }
  return { ok: problems.length === 0, problems };
}
