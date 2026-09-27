/**
 * 썸네일 후보 — 규칙 기반 문구와 후보 3장 조립. **순수 모듈**.
 *
 * 규칙 기반(LLM 키가 없거나 실패·한도 초과일 때, 그리고 기존 공개 노트 백필):
 *   제목 = 단지명(짧은 표기) · 사실 = 노트가 이미 쓴 한 줄에서 — 실데이터만.
 *    · 사람 노트: 내 판단(metadata.decision) → "기록 N점"(5축 평균×20) → 메모·요약·제목의 짧은 마디
 *    · Lab 노트: 제목의 주장("거래1위·평단가 46위") → key_metrics 의 이름이 분명한 값 → 단지 낱말이 든 요약 마디
 *   모든 후보는 verify.ts 를 통과해야 한다(길이·숫자). 넘치면 자르지 않고 더 짧은 마디를 찾거나 뺀다.
 *
 * 후보 3장: AI 문구(검증 통과분) → 규칙 문구 순으로 채우고, 모자라면 같은 문구를 다른 변형으로 돌려
 * **항상 3장**. 변형은 사진이 있는 사람 노트면 photo·navy·hanji, 아니면 navy·hanji·light.
 */
import { isLabAuthor } from "@/lib/notes/author-label";
import { decisionFromMetadata, decisionLabel } from "@/lib/inspection/decision";
import { regionGroupOf } from "@/lib/notes/region-match";
import {
  FACT_MAX,
  HEADLINE_MAX,
  SUB_MAX,
  charLength,
  isAllowedCoverPhoto,
  squish,
  type CoverDraft,
  type CoverSource,
  type CoverVariant,
} from "./spec";
import {
  buildNumberCorpus,
  noteScore100,
  verifyCoverText,
  type CoverNote,
  type NumberCorpus,
} from "./verify";

export const COVER_CANDIDATE_COUNT = 3;

/** 제목·사실 한 쌍(변형·보조는 조립 단계에서 붙는다) */
export type CoverText = { headline: string; fact: string | null; source: CoverSource };

const LAB_TITLE_RE = /\(\s*Lab\s*#\s*\d+\s*\)|\[\s*내집나우\s*Lab\s*\]/i;

/** Lab(운영진 데이터 카드) 노트인가 — 작성자 표기 또는 제목 표식 */
export function isLabCoverNote(note: CoverNote): boolean {
  return isLabAuthor(note.authorLabel ?? null) || LAB_TITLE_RE.test(note.title ?? "");
}

/**
 * 썸네일에 깔 사진 — 사람 노트의 첫 사진 중 허용 주소(우리 스토리지)만. Lab 노트의 사진은 본문 데이터
 * 카드라 깔지 않는다(글자 위에 글자가 겹친다). host 는 테스트용 주입.
 */
export function coverPhotoOf(note: CoverNote, host?: string | null): string | null {
  if (isLabCoverNote(note)) return null;
  const photos = Array.isArray(note.photos) ? note.photos : [];
  const first = photos.find((p) => typeof p === "string" && p.trim());
  if (typeof first !== "string") return null;
  const ok = host === undefined ? isAllowedCoverPhoto(first) : isAllowedCoverPhoto(first, host);
  return ok ? first : null;
}

/** 이 노트의 변형 3종(순서 = 후보 순서) */
export function variantsFor(hasPhoto: boolean): CoverVariant[] {
  return hasPhoto ? ["photo", "navy", "hanji"] : ["navy", "hanji", "light"];
}

const fits = (s: string, max: number) => s.length > 0 && charLength(s) <= max;
const hasDigit = (s: string) => /\d/.test(s);
const compact = (s: string) => s.replace(/\s+/g, "");

/**
 * 보조 줄 — "지역 · 단지명". 넘치면 구 단위 → 단지명만 → 지역만 순으로 줄인다.
 * 제목이 단지명과 같으면 단지명을 다시 적지 않는다(v4 규칙 8 — 같은 사실은 한 화면에 한 번).
 */
export function buildSub(note: CoverNote, headline?: string): string {
  const apt = squish(note.aptName);
  const group = regionGroupOf(note.region ?? "");
  const gu = group.split(" ").pop() ?? "";
  const sameAsHeadline = Boolean(apt && headline && compact(headline) === compact(apt));
  const options = apt && !sameAsHeadline
    ? [`${group} · ${apt}`, `${gu} · ${apt}`, apt, group, gu]
    : [group, gu, squish(note.region)];
  for (const o of options) {
    const s = squish(o.replace(/^ · | · $/g, ""));
    if (s && charLength(s) <= SUB_MAX) return s;
  }
  return "";
}

/* 제목의 표식 걷기 — "(Lab #33)" · "[내집나우 Lab] AI 임장노트 #15 — " */
function stripTitleMarks(title: string): string {
  return squish(title)
    .replace(/\s*\(\s*Lab\s*#\s*\d+\s*\)\s*$/i, "")
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/^AI\s*임장노트\s*#\s*\d+\s*[—–-]\s*/i, "")
    .trim();
}

/** 조사 하나 떼기(이름 대조용) — "길음뉴타운2단지가" → "길음뉴타운2단지" */
function stripParticle(s: string): string {
  return s.replace(/(은|는|이|가|의|을|를|도)$/, "");
}

/**
 * 제목을 "이름 + 주장" 으로 가른다. "상계주공9 거래1위·평단가 46위" → 이름 "상계주공9", 주장 "거래1위·평단가 46위".
 * "염창동아1차: 1,000가구 …" 처럼 쌍점이 있으면 쌍점 기준. 이름이 단지명과 안 맞으면 주장 = 제목 전체.
 */
export function splitTitle(note: CoverNote): { name: string | null; claim: string | null } {
  const t = stripTitleMarks(note.title ?? "");
  if (!t) return { name: null, claim: null };
  const colon = t.match(/^([^:：]{1,30})[:：]\s*(.+)$/);
  if (colon) return { name: colon[1].trim(), claim: colon[2].trim() || null };
  const apt = compact(squish(note.aptName));
  const tokens = t.split(" ");
  if (apt) {
    for (let k = 1; k <= Math.min(3, tokens.length - 1); k += 1) {
      const head = stripParticle(compact(tokens.slice(0, k).join("")));
      if (head.length >= 2 && (apt.includes(head) || head.includes(apt))) {
        return { name: tokens.slice(0, k).join(" "), claim: tokens.slice(k).join(" ") || null };
      }
    }
  }
  return { name: null, claim: t };
}

/** 짧은 단지명 — 제목 자리. 단지명 → 앞 낱말 뺀 단지명 → 끝 낱말 → 제목 속 이름 → 제목 → 구 → "임장 기록" */
export function shortName(note: CoverNote): string {
  const apt = squish(note.aptName);
  const options: string[] = [];
  if (apt) {
    options.push(apt);
    const tokens = apt.split(" ");
    if (tokens.length > 1) {
      options.push(tokens.slice(1).join(" "));
      options.push(tokens[tokens.length - 1]);
    }
  }
  const { name } = splitTitle(note);
  if (name) options.push(stripParticle(name));
  options.push(squish(note.title));
  const group = regionGroupOf(note.region ?? "");
  options.push(group, group.split(" ").pop() ?? "");
  for (const o of options) if (fits(o, HEADLINE_MAX)) return o;
  return "임장 기록";
}

/* 괄호 밖 쉼표로 가르기 — "15.4억→19.1억(+24%, 하루 약 88만원꼴)" 의 괄호 안 쉼표와
   "3,482만원" 의 천 단위 쉼표는 자르지 않는다 */
function splitOutsideParens(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  const chars = Array.from(s);
  let depth = 0;
  let buf = "";
  chars.forEach((ch, i) => {
    if (ch === "(" || ch === "（") depth += 1;
    if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
    const thousands = /\d/.test(chars[i - 1] ?? "") && /\d/.test(chars[i + 1] ?? "");
    if (depth === 0 && sep.test(ch) && !thousands) {
      out.push(buf);
      buf = "";
      return;
    }
    buf += ch;
  });
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

const stripParens = (s: string) => squish(s.replace(/\s*[(（][^)）]*[)）]/g, ""));
/* "24평(+16.9%)" → "24평 +16.9%" — 괄호 안이 부호 붙은 숫자 하나일 때만 */
const unwrapNumberParens = (s: string) => squish(s.replace(/\s*[(（]([+\-−]?\d[\d.,]*%?)[)）]/g, " $1"));

/** 짝이 맞는가 — 괄호·따옴표가 한쪽만 남은 조각("R²=0.274)")은 문구가 아니다 */
function balanced(s: string): boolean {
  const count = (re: RegExp) => (s.match(re) ?? []).length;
  if (count(/[(（]/g) !== count(/[)）]/g)) return false;
  if (count(/[「『“]/g) !== count(/[」』”]/g)) return false;
  if (count(/'/g) % 2 !== 0 || count(/"/g) % 2 !== 0) return false;
  return true;
}

/* 뜻 없는 주장 — "단지 분석" 같은 제목 꼬리는 사실이 아니다 */
const EMPTY_CLAIM_RE = /^(단지\s*)?(분석|리포트|정리|기록|후기)$/;

const FACT_MIN = 4;

/** 조각 다듬기 — 앞뒤 구두점을 걷고, 짝이 안 맞거나 통계 기호(=)가 있거나 너무 짧으면 버린다 */
function cleanFact(raw: string): string | null {
  const s = squish(raw)
    .replace(/^[—–\-·:;,，\s]+/, "")
    .replace(/[—–\-·:;,，.。\s]+$/, "")
    .trim();
  if (!s || EMPTY_CLAIM_RE.test(s)) return null;
  if (charLength(s) < FACT_MIN || charLength(s) > FACT_MAX) return null;
  if (!balanced(s) || s.includes("=")) return null;
  return s;
}

/* 수 묶음을 가르지 않는다 — "2억 4,000만원" 의 "2억" 뒤에서 자르면 금액이 바뀐다 */
function isNumberJoin(prev: string, next: string): boolean {
  return /\d(억|조)$/.test(prev) && /^\d/.test(next);
}

/* 조각이 시작해도 되는 자리 — 앞 낱말이 조사·연결 어미로 끝났거나(주어·목적어 뒤), 숫자로 시작할 때.
   "건"(= 것은)은 낱말 전체일 때만 — "26건" 의 건은 단위다 */
const BOUNDARY_END_RE = /(은|는|이|가|을|를|에서|에게|에|으로|로|보다|고|며|데|면|서|도)$/;
const isBoundary = (prev: string) => prev === "건" || BOUNDARY_END_RE.test(prev);
/* 조각 첫 낱말이 되면 안 되는 의존 명사 — "중 1건" "위" */
const BOUND_NOUN_RE = /^(중|위|것|수|등|및|vs)$/;

/* 떼면 뜻이 바뀌는 앞말 — 조건·양보·제외("은마 빼면 대치동 … 66건" 에서 "은마 빼면"을 떼면 66건이
   은마 것이 된다). 이런 낱말이 떼어 낼 앞말에 있으면 그 자리에서는 자르지 않는다 */
const CONDITION_RE = /(면|인데|는데|지만|어도|아도|라도|빼고|제외하고|제외|빼면|외에)$/;

/**
 * 제목 주장의 긴 마디에서 16자 안의 **뒤쪽** 조각(술어가 붙은 쪽) — **제목에서만** 쓴다. 제목은 그 단지에
 * 대한 주장이라 앞말을 떼도 대상이 바뀌지 않는다(요약 문장은 앞 문장의 주어 — 성북구 등 — 를 떼면 다른
 * 대상의 숫자가 이 단지 것처럼 읽히므로 쓰지 않는다). 숫자가 든 5자 이상 · 2낱말 이상만.
 * 앞쪽 조각("국평 82%가")은 술어가 잘려 문장이 되지 않아 만들지 않는다.
 */
function titleWindows(seg: string): string[] {
  const tokens = unwrapNumberParens(seg).split(" ");
  const out: string[] = [];
  for (let s = 1; s < tokens.length; s += 1) {
    if (tokens.slice(0, s).some((t) => CONDITION_RE.test(t))) break;
    if (isNumberJoin(tokens[s - 1], tokens[s])) continue;
    if (!isBoundary(tokens[s - 1]) && !/^[+\-−]?\d/.test(tokens[s])) continue;
    if (BOUND_NOUN_RE.test(tokens[s])) continue;
    const words = tokens.slice(s);
    const cand = words.length >= 2 ? cleanFact(words.join(" ")) : null;
    if (cand && hasDigit(cand) && charLength(cand) >= 5) out.push(cand);
  }
  return out;
}

/** 한 마디 → 그대로 쓸 수 있는 사실 후보(원문 → 괄호 숫자 풀기 → 괄호 걷기). 잘라 내지 않는다 */
function exactFacts(seg: string): string[] {
  const s = squish(seg.replace(/^[·•\-*■]\s*/, ""));
  const out: string[] = [];
  /* 괄호 숫자 풀기("24평 +16.9%") → 괄호 걷기("84㎡ 31.3억") → 원문 — 같은 뜻이면 짧고 깔끔한 쪽이 먼저 */
  const variants = [unwrapNumberParens(s), stripParens(s)].filter((v) => v !== s);
  for (const v of [...variants, s]) {
    const c = cleanFact(v);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** 글 → 마디(문장 → " — " → 괄호 밖 쉼표). 전체 마디를 먼저, 잘게 쪼갠 것을 뒤에 */
function segmentsOf(text: string): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/■[^\n]*\n?/g, "\n");
  const sentences = cleaned
    .split(/\n+|(?<=[.?。])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    out.push(sentence);
    for (const dashPart of sentence.split(/\s[—–]\s/)) {
      if (dashPart !== sentence) out.push(dashPart);
      const commaParts = splitOutsideParens(dashPart, /[,，]/);
      if (commaParts.length > 1) out.push(...commaParts);
    }
  }
  return out;
}

/** 제목의 주장에서 사실 후보 — 그대로 맞는 마디(숫자 먼저) → 조각(숫자 든 것) → 숫자 없는 마디 */
export function titleFacts(note: CoverNote): string[] {
  const { claim } = splitTitle(note);
  if (!claim) return [];
  const segs = segmentsOf(claim);
  const exact = segs.flatMap(exactFacts);
  /* 조각은 더 쪼개지지 않는 마디(쉼표·줄표로 나뉜 끝 마디)에서만 — 문장 전체에서 자르면 둘째 마디의 꼬리가
     첫째 마디보다 먼저 나온다 */
  const leaves = segs.filter((seg) => !segs.some((other) => other !== seg && other.length < seg.length && seg.includes(other)));
  /* 조각 중에서는 가격·비율·순위처럼 핵심 단위가 든 것을 먼저("24평 +16.9%" > "부지 250m 앞") */
  const KEY_UNIT_RE = /%|억|만원|위|배/;
  const windows = leaves.flatMap(titleWindows);
  windows.sort((a, b) => Number(KEY_UNIT_RE.test(b)) - Number(KEY_UNIT_RE.test(a)));
  return [...exact.filter(hasDigit), ...windows, ...exact.filter((f) => !hasDigit(f))];
}

/* Lab 요약에서 쓸 마디는 단지 자체를 말하는 낱말이 든 것만 — "1~7월 누적 +10.31%"(성북구 통계)가
   단지 썸네일에 붙으면 다른 대상의 숫자가 이 단지 것처럼 읽힌다 */
const PROPERTY_WORD_RE = /㎡|\d평|세대|가구|분양가|전세|매매|월세|실거래|신고가|중위|\d층/;

/** 요약·메모에서 숫자가 든 짧은 마디(그대로 맞는 것만 — 잘라 내지 않는다) */
export function summaryFacts(note: CoverNote, limit = 4): string[] {
  const sections = note.sections && typeof note.sections === "object" && !Array.isArray(note.sections)
    ? (note.sections as Record<string, unknown>)
    : {};
  const lab = isLabCoverNote(note);
  const apt = compact(squish(note.aptName));
  const texts = [squish(sections.memo as string), note.summary ?? ""].filter(Boolean);
  const out: string[] = [];
  for (const t of texts) {
    for (const f of segmentsOf(t).flatMap(exactFacts)) {
      if (!hasDigit(f)) continue;
      if (lab && !PROPERTY_WORD_RE.test(f) && !(apt && compact(f).includes(apt))) continue;
      out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 메모·요약의 첫 마디(숫자 없어도) — 사람 노트의 "한 줄 결론" */
function verdictFacts(note: CoverNote): string[] {
  const sections = note.sections && typeof note.sections === "object" && !Array.isArray(note.sections)
    ? (note.sections as Record<string, unknown>)
    : {};
  const out: string[] = [];
  for (const t of [squish(sections.memo as string), squish(note.summary)]) {
    if (!t) continue;
    const segs = segmentsOf(t).flatMap(exactFacts);
    if (segs[0]) out.push(segs[0]);
  }
  return out;
}

/* key_metrics 중 이름만으로 뜻이 분명한 값 — 이 표 밖의 키는 쓰지 않는다(키 이름을 추측해 문장을 만들지 않는다) */
function metricFacts(note: CoverNote): string[] {
  const meta = note.metadata && typeof note.metadata === "object" ? (note.metadata as Record<string, unknown>) : {};
  const km = meta.key_metrics && typeof meta.key_metrics === "object" ? (meta.key_metrics as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: string[] = [];
  const jr = num(km.jeonse_ratio_pct);
  if (jr !== null && jr > 0) out.push(`전세가율 ${jr}%`);
  const units = num(km.households) ?? num(km.units);
  if (units !== null && units > 0 && Number.isInteger(units)) out.push(`${units.toLocaleString("en-US")}세대`);
  const built = num(km.build_year) ?? num(km.built);
  if (built !== null && built >= 1950 && built <= 2100 && Number.isInteger(built)) out.push(`${built}년 준공`);
  return out;
}

/** 규칙 기반 사실 목록 — 우선순위 순, 중복 없음(검증 전) */
export function ruleFacts(note: CoverNote, corpus: NumberCorpus = buildNumberCorpus(note)): string[] {
  const lab = isLabCoverNote(note);
  const list: string[] = [];
  const score = noteScore100(note.scores);
  if (lab) {
    /* 제목 주장(그 단지에 대한 주장) → 이름이 분명한 key_metrics → 단지 낱말이 든 요약 마디 → 종합 점수 */
    list.push(...titleFacts(note));
    list.push(...metricFacts(note));
    list.push(...summaryFacts(note));
    /* Lab 노트의 5축은 AI 스코어카드다 — 본문에 "종합 N점" 이 그대로 있을 때만 */
    if (score !== null && corpus.compactText.includes(`종합${score}점`)) list.push(`종합 ${score}점`);
  } else {
    const decision = decisionFromMetadata(note.metadata);
    if (decision) list.push(`내 판단 · ${decisionLabel(decision.choice)}`);
    if (score !== null) list.push(`기록 ${score}점`);
    list.push(...verdictFacts(note));
    list.push(...titleFacts(note));
    list.push(...summaryFacts(note));
  }
  /* 같은 말의 잘린 사본("26건 중 1건" ⊂ "+3억은 26건 중 1건")은 다른 후보가 아니다 — 앞의 것에 들어 있으면 뺀다 */
  const keys: string[] = [];
  const out: string[] = [];
  for (const f of list) {
    const k = compact(f);
    if (!k || keys.some((prev) => prev.includes(k) || k.includes(prev))) continue;
    keys.push(k);
    out.push(f);
  }
  return out;
}

/** 규칙 문구(검증 통과분) — 최대 limit 개 */
export function ruleTexts(note: CoverNote, corpus: NumberCorpus = buildNumberCorpus(note), limit = COVER_CANDIDATE_COUNT): CoverText[] {
  const headline = shortName(note);
  const sub = buildSub(note, headline);
  const out: CoverText[] = [];
  for (const fact of ruleFacts(note, corpus)) {
    if (verifyCoverText({ headline, fact, sub }, corpus).ok) out.push({ headline, fact, source: "rule" });
    if (out.length >= limit) break;
  }
  if (!out.length && verifyCoverText({ headline, fact: null, sub }, corpus).ok) {
    out.push({ headline, fact: null, source: "rule" });
  }
  return out;
}

/**
 * 후보 3장 조립 — AI 문구(검증 통과분) 먼저, 규칙 문구로 채우고, 그래도 모자라면 같은 문구를 다른 변형으로.
 * 반환은 **항상 3장**이다(노트에 아무것도 없어도 "단지명/구 이름" 한 줄은 있다).
 */
export function composeCandidates(
  note: CoverNote,
  aiTexts: ReadonlyArray<{ headline: string; fact: string | null }> = [],
  opts: { photoHost?: string | null; corpus?: NumberCorpus } = {},
): CoverDraft[] {
  const corpus = opts.corpus ?? buildNumberCorpus(note);
  const photo = opts.photoHost === undefined ? coverPhotoOf(note) : coverPhotoOf(note, opts.photoHost);
  const variants = variantsFor(Boolean(photo));

  const texts: CoverText[] = [];
  const seen = new Set<string>();
  const push = (t: CoverText) => {
    const key = `${compact(t.headline)}|${compact(t.fact ?? "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    texts.push(t);
  };
  for (const t of aiTexts) {
    const headline = squish(t.headline);
    const fact = t.fact == null || !squish(t.fact) ? null : squish(t.fact);
    if (verifyCoverText({ headline, fact, sub: buildSub(note, headline) }, corpus).ok) push({ headline, fact, source: "ai" });
    if (texts.length >= COVER_CANDIDATE_COUNT) break;
  }
  if (texts.length < COVER_CANDIDATE_COUNT) {
    for (const t of ruleTexts(note, corpus)) {
      push(t);
      if (texts.length >= COVER_CANDIDATE_COUNT) break;
    }
  }
  if (!texts.length) texts.push({ headline: shortName(note), fact: null, source: "rule" });

  return variants.map((variant, i) => {
    const t = texts[i % texts.length];
    return { variant, headline: t.headline, fact: t.fact, sub: buildSub(note, t.headline), source: t.source };
  });
}

/**
 * 저장 요청 검증 — 사용자가 보낸 후보를 믿지 않고 다시 본다. 보조 줄은 노트에서 다시 조립하고,
 * 사진 변형은 사진이 있는 노트에서만. 통과하면 저장할 후보, 아니면 문제 목록.
 */
export function sanitizeCoverDraft(
  note: CoverNote,
  input: unknown,
  opts: { photoHost?: string | null } = {},
): { ok: true; draft: CoverDraft } | { ok: false; problems: string[] } {
  if (!input || typeof input !== "object") return { ok: false, problems: ["본문 없음"] };
  const o = input as Record<string, unknown>;
  const variant = o.variant;
  const photo = opts.photoHost === undefined ? coverPhotoOf(note) : coverPhotoOf(note, opts.photoHost);
  const allowed = variantsFor(Boolean(photo));
  if (typeof variant !== "string" || !(allowed as string[]).includes(variant)) {
    return { ok: false, problems: [`이 노트에서 쓸 수 없는 변형: ${String(variant)}`] };
  }
  const headline = squish(o.headline);
  const fact = o.fact == null || !squish(o.fact) ? null : squish(o.fact);
  const sub = buildSub(note, headline);
  const source: CoverSource = o.source === "ai" ? "ai" : "rule";
  const check = verifyCoverText({ headline, fact, sub }, buildNumberCorpus(note));
  if (!check.ok) return { ok: false, problems: check.problems };
  return { ok: true, draft: { variant: variant as CoverVariant, headline, fact, sub, source } };
}
