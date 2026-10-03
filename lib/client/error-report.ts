/**
 * [1027 · 제안 27·28] 오류 경계가 같이 쓰는 두 가지 — 청크를 못 받았을 때 한 번 새로고침 · 오류 보고 본문.
 * 순수 판정·본문 조립은 테스트가 직접 부른다(tests/unit/ops-1027.test.ts). 브라우저 전역은 함수 안에서만 만진다.
 *
 * ── 27: 한 번 새로고침 ──────────────────────────────────────────────────
 * 배포 직후 예전 화면을 띄워 둔 탭은 화면 파일(청크)을 못 받아 오류 경계로 떨어진다. 코드 문제가 아니라
 * 파일이 바뀐 것이므로 한 번만 새로고침한다. 사이트 전체 오류 화면(app/error · app/global-error)은 이미 그렇게
 * 하는데, 구역 오류 화면(AreaError — 지도·노트·분석·마이·결제·구독·퀴즈·전월세) 여덟 곳은 하지 않았다.
 * 같은 세션·같은 화면에서 두 번째면 새로고침하지 않고 오류 화면을 그대로 둔다(무한 새로고침 방지 —
 * 열쇠는 세 화면이 같은 "nz:chunk-reload:<경로>").
 *
 * ── 28: 화면 쪽 정보 ────────────────────────────────────────────────────
 * 예전 보고는 오류 문구만 보냈고, 서버가 그 문구로 새 Error 를 만들어 저장했다 — 남은 스택은 서버 수신부의
 * 것이라 실제 원인(브라우저의 어느 파일 몇 번째 줄)이 없었다. 이제 브라우저의 스택·오류 이름·화면 경로와
 * 그 탭이 받은 빌드(<meta name="nz-build">, app/layout)를 같이 보낸다. 주소의 ?뒤(쿼리)는 보내지 않는다 —
 * 결제 완료 주소처럼 열쇠가 실리는 화면이 있다.
 */

/* 루트 오류 화면의 세 문구(크롬 계열) + 같은 사건의 다른 얼굴: 이름 붙은 청크("app/map/page") · CSS 청크 ·
   파이어폭스("error loading dynamically imported module") · 사파리("Importing a module script failed"). */
export const CHUNK_FAIL_RE =
  /Loading (?:CSS )?chunk \S+ failed|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isChunkLoadFailure(message: unknown, name?: unknown): boolean {
  return name === "ChunkLoadError" || CHUNK_FAIL_RE.test(String(message ?? ""));
}

export const CHUNK_RELOAD_KEY_PREFIX = "nz:chunk-reload:";

/** 청크 실패면 이 화면에서 한 번만 새로고침한다. 새로고침을 걸었으면 true. 저장소가 막혀 있으면 걸지 않는다. */
export function reloadOnceOnChunkFailure(error: { message?: unknown; name?: unknown } | null | undefined): boolean {
  try {
    if (!isChunkLoadFailure(error?.message, error?.name)) return false;
    const key = CHUNK_RELOAD_KEY_PREFIX + window.location.pathname;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** 서버 저장 칸(ops.error_log.stack)이 4,000자다 — 넘치는 꼬리는 버린다 */
export const CLIENT_STACK_MAX = 4000;

/**
 * 스택 속 주소의 ?뒤·#뒤를 지운다(줄:칸 번호는 남긴다). 인라인 스크립트·eval 프레임에는 화면 주소가 통째로
 * 실리는데, 결제 완료 주소처럼 쿼리에 열쇠가 있는 화면이 있다 — 경로(path)에서 쿼리를 뺀 것과 같은 이유다.
 */
export function scrubStack(stack: string): string {
  return stack.replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*?((?::\d+){0,2})(?=\)|\s|$)/g, "$1$2");
}

/* 그 탭이 받은 빌드 표식(<meta name="nz-build"> — app/layout). 한 번 읽으면 붙잡아 둔다:
   루트 레이아웃까지 깨져 global-error 가 문서를 갈아 끼우면 메타가 사라질 수 있다. */
let buildMarkSeen: string | null = null;

export function readBuildMark(): string | null {
  if (buildMarkSeen) return buildMarkSeen;
  if (typeof document === "undefined") return null;
  try {
    const v = document.querySelector('meta[name="nz-build"]')?.getAttribute("content")?.trim();
    if (v) buildMarkSeen = v;
    return v || null;
  } catch {
    return null;
  }
}

/* 이 모듈이 브라우저에서 처음 실행될 때(오류 경계 묶음이 실리는 때 — 화면이 멀쩡할 때) 한 번 읽어 둔다 */
readBuildMark();

export type ClientErrorBody = {
  message: string;
  name: string | null;
  stack: string | null;
  digest: string | null;
  path: string | null;
  scope: string;
  build: string | null;
};

/** 보고 본문 — 순수. path 는 경로만(쿼리·해시 없음), build 는 그 탭이 받은 빌드 표식 */
export function clientErrorBody(
  error: { message?: unknown; name?: unknown; stack?: unknown; digest?: unknown } | null | undefined,
  scope: string,
  env: { path: string | null; build: string | null },
  fallbackMessage = "unknown client error",
): ClientErrorBody {
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const path = str(env.path, 256);
  return {
    message: str(error?.message, 500) ?? fallbackMessage,
    name: str(error?.name, 80),
    stack: typeof error?.stack === "string" && error.stack.trim() ? scrubStack(error.stack.trim()).slice(0, CLIENT_STACK_MAX) : null,
    digest: str(error?.digest, 64),
    path: path ? path.split(/[?#]/)[0]! : null,
    scope: scope.slice(0, 32),
    build: str(env.build, 40),
  };
}

/** 오류 경계에서 부른다 — 실패해도 조용히(오류 화면이 또 깨지면 안 된다) */
export function reportClientError(
  error: (Error & { digest?: string }) | null | undefined,
  scope: string,
  fallbackMessage?: string,
): void {
  try {
    const build = readBuildMark();
    const body = clientErrorBody(
      error,
      scope,
      { path: typeof window !== "undefined" ? window.location.pathname : null, build },
      fallbackMessage,
    );
    void fetch("/api/monitoring/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* noop */
  }
}
