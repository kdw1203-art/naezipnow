/**
 * [1086 · 가입 전환] 가입·로그인 뒤 "하던 일"을 마저 하는 표식 — 순수 함수(tests/unit/review-1086.test.ts).
 *
 * 왜: 비회원이 임장노트를 다 쓰고 저장을 누르면 가입 창이 뜨고, 가입(→ 관심 지역 화면)을 마치면 작성 화면으로 돌아온다.
 * 그런데 돌아온 화면은 "작성 중이던 노트 · 이어서 쓰기" 배너만 띄우고 비어 있었다 — 저장하려던 사람이
 * 배너를 눌러 복원하고 저장을 한 번 더 눌러야 했다(가입한 이유가 첫 화면에서 이뤄지지 않았다).
 * 돌아올 주소에 `?resume=note_save` 를 실어, 작성 화면이 그 표식을 보면 초안을 바로 채우고 저장을 한 번 잇는다.
 *
 * 지키는 것:
 *  · 표식은 주소에만 — 서버에 따로 남기지 않는다. 작성 화면은 읽자마자 주소에서 지운다(새로고침에 또 저장하지 않게).
 *  · 모르는 값은 무시한다(null).
 */

export const RESUME_PARAM = "resume";
/** note_save: 초안 채우고 저장까지 · note_continue: 초안만 채운다(사진 올리기·AI 초안처럼 저장 전 단계에서 막힌 경우) */
export const RESUME_ACTIONS = ["note_save", "note_continue"] as const;
export type ResumeAction = (typeof RESUME_ACTIONS)[number];

/* 내부 경로만 받는다(외부 주소·"//" 는 "/") — URL 로 쪼개고 다시 붙인다(쿼리·해시 보존) */
function parse(path: string): URL {
  const raw = typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new URL(raw, "https://x.invalid");
}

const out = (u: URL) => `${u.pathname}${u.search}${u.hash}`;

/** 내부 경로(경로+쿼리)에 재개 표식을 붙인다 — 이미 있으면 바꾼다 */
export function withResume(path: string, action: ResumeAction): string {
  const u = parse(path);
  u.searchParams.set(RESUME_PARAM, action);
  return out(u);
}

/** 주소 쿼리(`?a=1&resume=note_save`)에서 표식을 읽는다 */
export function readResume(search: string | null | undefined): ResumeAction | null {
  const v = new URLSearchParams(String(search ?? "")).get(RESUME_PARAM);
  return v === "note_save" || v === "note_continue" ? v : null;
}

/** 표식을 뺀 주소 — 읽은 뒤 history.replaceState 로 바꿔 둔다 */
export function withoutResume(path: string): string {
  const u = parse(path);
  u.searchParams.delete(RESUME_PARAM);
  return out(u);
}

/**
 * 관심 지역 화면(/welcome?next=…)의 "하던 화면으로" 단추 이름 — next 가 무엇을 하던 곳인지 사실 낱말로.
 * 모르는 곳이면 "보던 화면". next 가 없거나 홈이면 null(가입 흐름의 기본 — 첫 노트 쓰기).
 */
export function resumeLabelFor(next: string | null | undefined): string | null {
  if (!next || next === "/" || !next.startsWith("/")) return null;
  const u = parse(next);
  const base = u.pathname;
  const params = u.searchParams;
  const resume = readResume(u.search);
  if (resume === "note_save") return "작성하던 임장노트 저장";
  if (resume === "note_continue") return "작성하던 임장노트";
  if (base === "/notes/new" || /^\/notes\/[^/]+\/edit$/.test(base)) return "작성하던 임장노트";
  if (base === "/map") return params.get("complexId") ? "지도의 그 단지" : "보던 지도";
  if (base.startsWith("/complex/")) return "보던 단지";
  if (base.startsWith("/notes/")) return "보던 임장노트";
  if (base.startsWith("/dong/") || base.startsWith("/region/")) return "보던 동네";
  return "보던 화면";
}
