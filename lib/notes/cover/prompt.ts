/**
 * 썸네일 문구 LLM 프롬프트·응답 해석 — **순수 모듈**(호출은 lib/notes/cover/ai.ts).
 *
 * 한 번 호출로 서로 다른 각도 3개(결론형·숫자형·질문형)를 받는다. 모델이 무엇을 쓰든 결과는
 * verify.ts 를 다시 통과해야 화면에 오른다 — 프롬프트의 규칙은 "잘 지키게 하는 것"이고,
 * 지켰는지 판정하는 것은 코드다.
 */
import { FACT_MAX, HEADLINE_MAX, squish } from "./spec";
import { buildSub, isLabCoverNote, shortName } from "./rules";
import { noteScore100, type CoverNote } from "./verify";
import { decisionFromMetadata, decisionLabel } from "@/lib/inspection/decision";

export type CoverLlmText = { angle: string; headline: string; fact: string | null };

/** 프롬프트 버전 — 캐시 키에 섞는다(프롬프트를 바꾸면 옛 캐시를 쓰지 않는다) */
export const COVER_PROMPT_VERSION = "cover-v1";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/* 본문 글 모으기 — 사람 노트는 sections 객체, Lab 노트는 [{no, title, lead}] 배열 */
function bodyText(note: CoverNote): string {
  const s = note.sections;
  if (Array.isArray(s)) {
    return s
      .map((x) => {
        if (!x || typeof x !== "object") return "";
        const o = x as Record<string, unknown>;
        return [o.title, o.lead].filter((v) => typeof v === "string" && v.trim()).join(": ");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (s && typeof s === "object") {
    const o = s as Record<string, unknown>;
    const label: Record<string, string> = { pros: "좋았던 점", cons: "아쉬운 점", memo: "메모", location: "입지", transport: "교통", school: "학군", facility: "시설", future: "미래가치" };
    return Object.entries(o)
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => `${label[k] ?? k}: ${squish(v)}`)
      .join("\n");
  }
  return "";
}

export function buildCoverPrompt(note: CoverNote): { system: string; user: string } {
  const system = [
    "너는 부동산 임장노트의 목록 썸네일 문구를 뽑는 편집자다.",
    "노트 원문에서 짧은 제목과 핵심 사실 한 줄을 뽑는다. 원문에 없는 내용·숫자를 만들지 않는다.",
    "규칙:",
    `- headline: ${HEADLINE_MAX}자 이하(공백 포함). 보통 단지명 또는 단지명을 줄인 말.`,
    `- fact: ${FACT_MAX}자 이하(공백 포함) 한 줄. 숫자를 쓰면 원문에 적힌 숫자를 그대로 쓴다(반올림·단위 환산·계산 금지). 마땅한 사실이 없으면 null.`,
    "- 세 후보는 각도가 달라야 한다: 결론형(노트의 판단·결론), 숫자형(가장 중요한 숫자 하나), 질문형(노트가 답하는 물음, 물음표 하나).",
    "- 이모지·느낌표·해시태그·따옴표 장식 금지. 수익 보장·투자 권유 표현 금지. 한국어.",
    '- 출력은 JSON 하나만: {"candidates":[{"angle":"결론형","headline":"…","fact":"…"},{"angle":"숫자형",…},{"angle":"질문형",…}]}',
  ].join("\n");

  const meta = note.metadata && typeof note.metadata === "object" ? (note.metadata as Record<string, unknown>) : {};
  const decision = decisionFromMetadata(note.metadata);
  const score = noteScore100(note.scores);
  const lines = [
    `제목: ${squish(note.title)}`,
    `단지명: ${squish(note.aptName) || "(없음)"}`,
    `지역: ${squish(note.region) || "(없음)"}`,
    `썸네일 보조 줄(코드가 붙임): ${buildSub(note)}`,
    `제목 자리 기본값: ${shortName(note)}`,
    isLabCoverNote(note) ? "작성: 내집나우 Lab(데이터 분석 노트)" : "작성: 직접 방문한 사용자",
    decision ? `작성자 판단: ${decisionLabel(decision.choice)}${decision.reasons.length ? ` — ${decision.reasons.join(" · ")}` : ""}` : "",
    score !== null && !isLabCoverNote(note) ? `기록 점수: ${score}점(5축 평균×20)` : "",
    note.summary ? `요약: ${clip(squish(note.summary), 700)}` : "",
    bodyText(note) ? `본문:\n${clip(bodyText(note), 1200)}` : "",
    meta.key_metrics ? `핵심 지표(JSON): ${clip(JSON.stringify(meta.key_metrics), 1200)}` : "",
  ].filter(Boolean);
  return { system, user: lines.join("\n") };
}

/** 모델 응답 → 후보 목록. 코드 펜스·앞뒤 잡음을 걷고, 모양이 틀린 항목은 버린다(최대 3) */
export function parseCoverLlm(text: string): CoverLlmText[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { candidates?: unknown }).candidates)
      ? ((parsed as { candidates: unknown[] }).candidates)
      : [];
  const out: CoverLlmText[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const headline = squish(o.headline);
    if (!headline) continue;
    const factRaw = o.fact;
    const fact = typeof factRaw === "string" && squish(factRaw) && squish(factRaw) !== "null" ? squish(factRaw) : null;
    out.push({ angle: squish(o.angle) || "", headline, fact });
    if (out.length >= 3) break;
  }
  return out;
}

/* djb2 — 캐시 키(노트 내용 해시). 보안 해시가 아니다 */
function hash36(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** 후보 캐시 키 — 프롬프트 입력이 같으면 같은 키(내용이 안 바뀌었으면 LLM 을 다시 부르지 않는다) */
export function coverPromptHash(note: CoverNote): string {
  const { system, user } = buildCoverPrompt(note);
  return `${COVER_PROMPT_VERSION}:${hash36(system)}:${hash36(user)}`;
}
