/**
 * [1007] 임장노트 작성 화면(/notes/new)의 진입 파라미터 — 순수 함수.
 *
 * 왜 생겼나: /notes/new 는 하루 1,790회(24h 실측) 서버리스 함수를 띄웠는데 사람 방문은
 * 한 자릿수였다. 페이지가 `searchParams`(quick·tpl·memo·intent·from·revisit)와
 * `safeAuth()`(revisit 의 소유자 판정)를 서버에서 읽어 force-dynamic 이었기 때문이다.
 * 정적 셸로 바꾸면서 판정을 여기(순수·테스트)로 옮기고, 클라이언트 진입 컴포넌트
 * (app/notes/new/NoteNewEntry.tsx)가 마운트 뒤 window.location 을 넘겨 부른다.
 * 값의 뜻·상한은 예전 page.tsx 와 같다 — 폼(NoteForm)의 props 계약은 그대로다.
 */

/** [995 · 3] uuid 모양만 조회한다 — 봇·오타 링크에 로그인 벽을 세울 이유가 없다 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NoteNewParams = {
  /** ?tpl={id} — 템플릿 체크리스트 프리셋(클라이언트가 /api/note-templates/{id} 로 읽는다) */
  tplId: string | null;
  /** ?memo= — 메모 초안(≤2000자). /calculator "임장노트에 저장" */
  presetMemo: string | null;
  /** ?intent=ai 또는 ?from=welcome — 저장 뒤 AI 정리 유도 */
  preferAi: boolean;
  /** ?from=welcome — 온보딩 루프(저장 뒤 지도로) */
  fromWelcome: boolean;
  /** ?quick=1 — 현장 퀵모드로 시작 */
  quickStart: boolean;
  /** [1006] URL 이 quick 을 명시했는가(1 이든 0 이든) — 설정 기본값보다 URL 이 우선 */
  quickExplicit: boolean;
  /** [995 · 3] ?revisit={noteId} — uuid 모양일 때만. 회차 프리필은 소유자에게만 */
  revisitId: string | null;
};

function one(sp: URLSearchParams, key: string): string {
  return (sp.get(key) ?? "").trim();
}

/** `window.location.search`(또는 URLSearchParams)를 폼 진입값으로 해석한다 */
export function parseNoteNewParams(search: string | URLSearchParams): NoteNewParams {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const tplId = one(sp, "tpl");
  const memo = one(sp, "memo");
  const intent = one(sp, "intent").toLowerCase();
  const from = one(sp, "from").toLowerCase();
  const quickRaw = one(sp, "quick");
  const revisitRaw = one(sp, "revisit");
  const fromWelcome = from === "welcome";
  return {
    tplId: tplId || null,
    presetMemo: memo ? memo.slice(0, 2000) : null,
    preferAi: intent === "ai" || fromWelcome,
    fromWelcome,
    quickStart: quickRaw === "1",
    quickExplicit: quickRaw === "1" || quickRaw === "0",
    revisitId: revisitRaw && UUID_RE.test(revisitRaw) ? revisitRaw : null,
  };
}

/** 회차 프리필은 로그인이 필요하다 — 비로그인이 돌아올 주소(예전 서버 redirect 와 같은 값) */
export function revisitLoginHref(revisitId: string): string {
  return `/login?callbackUrl=${encodeURIComponent(`/notes/new?revisit=${revisitId}`)}`;
}

/** 진입값이 서버 자료(템플릿·이전 노트)를 필요로 하는가 — 아니면 폼을 즉시 그린다 */
export function needsRemoteEntryData(p: NoteNewParams): boolean {
  return Boolean(p.tplId || p.revisitId);
}
