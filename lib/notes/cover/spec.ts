/**
 * 임장노트 썸네일(커버) — 저장 모양·상수·주소. **순수 모듈**(서버·클라이언트·node:test 공용).
 *
 * 소유자 지시(1012): 목록에 본문 데이터 카드가 그대로 썸네일로 나가던 것을, 노트에서 뽑은 짧은 제목 +
 * 핵심 숫자 하나를 **우리 템플릿**(네이비·한지·연파랑·사진 위 글자 — 같은 테마)으로 그린 정사각 이미지로
 * 바꾼다. 이미지 생성 모델·스톡·가짜 사진은 쓰지 않는다(글자와 브랜드 면만).
 *
 * 저장: `inspection_notes.metadata.cover` (jsonb — 마이그레이션 없음). 다른 metadata 키는 건드리지 않는다.
 * 그림: `/api/og/note-cover/{id}?v={coverVersion}` — v 가 맞으면 1년 immutable(내용 주소).
 */

export const COVER_SPEC_VERSION = 1 as const;

/** 변형 — navy·hanji·light 는 글자 템플릿, photo 는 사람 노트의 첫 사진 위 글자 */
export const COVER_VARIANTS = ["navy", "hanji", "photo", "light"] as const;
export type CoverVariant = (typeof COVER_VARIANTS)[number];

export type CoverSource = "ai" | "rule";

export type CoverSpec = {
  v: 1;
  variant: CoverVariant;
  /** 큰 제목 — ≤ HEADLINE_MAX 자(한 줄~두 줄) */
  headline: string;
  /** 핵심 사실 한 줄 — ≤ FACT_MAX 자. 없으면 null(지어내지 않는다) */
  fact: string | null;
  /** 보조 — "지역 · 단지명"(코드가 노트에서 조립한다) */
  sub: string;
  /** 문구 출처 — AI 가 뽑았나, 규칙이 뽑았나 */
  source: CoverSource;
  /** 고른 시각(ISO) — 그림 주소의 v(내용 해시) 재료 */
  chosenAt: string;
};

/** 후보(아직 고르지 않은 것) — 저장할 때 v·chosenAt 이 붙는다 */
export type CoverDraft = Omit<CoverSpec, "v" | "chosenAt">;

/** 글자 수 상한 — "자"는 코드포인트 수(공백 포함). 넘치면 자르지 않고 후보에서 뺀다 */
export const HEADLINE_MAX = 14;
export const FACT_MAX = 16;
export const SUB_MAX = 24;

/** 정사각 한 변(px) — 목록 격자·피드 카드·OG 모두 이 한 장 */
export const COVER_SIZE = 720;

/** 브랜드 마스터 v2.1 고정값 — satori 는 CSS 변수를 못 읽어 hex 로 둔다(globals.css --brand-* 와 같은 값) */
export const COVER_COLORS = {
  navy: "#0B2545",
  hanji: "#F6F1E7",
  /** 라이트 면의 주홍 온점 */
  red: "#C8442B",
  /** 어두운 면의 주홍 온점 */
  redDark: "#E0563A",
  /** 나우블루 — 연파랑 면의 숫자 */
  blue: "#1D4FD8",
  /** 연파랑 면(--primary-soft) */
  blueSoft: "#EDF2FE",
} as const;

export function isCoverVariant(v: unknown): v is CoverVariant {
  return typeof v === "string" && (COVER_VARIANTS as readonly string[]).includes(v);
}

/** 글자 수(코드포인트) — "㎡"·한글·이모지 서로게이트를 한 자로 센다 */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** 공백 정리 — 줄바꿈·연속 공백을 한 칸으로 */
export function squish(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

/**
 * metadata.cover 읽기 — 모양이 하나라도 어긋나면 null(깨진 값으로 그림을 만들지 않는다).
 * 길이 상한도 다시 본다: 저장 뒤 규칙이 바뀌었으면 옛 값은 커버가 아니라 "없음"으로 읽힌다.
 */
export function readCoverSpec(metadata: unknown): CoverSpec | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).cover;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== COVER_SPEC_VERSION) return null;
  if (!isCoverVariant(c.variant)) return null;
  const headline = squish(c.headline);
  const sub = squish(c.sub);
  const fact = c.fact == null ? null : squish(c.fact);
  if (!headline || charLength(headline) > HEADLINE_MAX) return null;
  if (fact !== null && (!fact || charLength(fact) > FACT_MAX)) return null;
  if (charLength(sub) > SUB_MAX) return null;
  if (c.source !== "ai" && c.source !== "rule") return null;
  if (typeof c.chosenAt !== "string" || !Number.isFinite(Date.parse(c.chosenAt))) return null;
  return {
    v: COVER_SPEC_VERSION,
    variant: c.variant,
    headline,
    fact,
    sub,
    source: c.source,
    chosenAt: c.chosenAt,
  };
}

/** 후보 → 저장 모양. chosenAt 은 호출부가 찍는다(테스트가 시각을 고정할 수 있게) */
export function toCoverSpec(draft: CoverDraft, chosenAt: string): CoverSpec {
  return {
    v: COVER_SPEC_VERSION,
    variant: draft.variant,
    headline: draft.headline,
    fact: draft.fact,
    sub: draft.sub,
    source: draft.source,
    chosenAt,
  };
}

/** metadata 에 cover 만 병합 — 다른 키(key_metrics·cardConfig·decision …)는 그대로 둔다 */
export function mergeCoverIntoMetadata(metadata: unknown, spec: CoverSpec): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base.cover = spec;
  return base;
}

/* djb2 · 36진수 — lib/notes/content-hash 와 같은 계열(짧고 결정적). 보안 해시가 아니라 캐시 키다. */
function hash36(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * 그림 주소의 v — chosenAt(+ 사진 변형이면 그 사진 주소)의 해시.
 * 커버를 다시 고르면 chosenAt 이 바뀌어 주소가 바뀌고, 사진 변형은 첫 사진이 바뀌어도 주소가 바뀐다 →
 * 한 주소의 그림은 영원히 같다(1년 immutable 의 근거).
 */
export function coverVersion(spec: Pick<CoverSpec, "chosenAt" | "variant">, photoUrl?: string | null): string {
  const photo = spec.variant === "photo" ? (photoUrl ?? "") : "";
  return hash36(`${spec.chosenAt}|${photo}`);
}

/** 렌더 라우트 주소(상대) — 목록 카드·OG 가 같은 함수로 만든다 */
export function coverImagePath(noteId: string, version: string): string {
  return `/api/og/note-cover/${encodeURIComponent(noteId)}?v=${encodeURIComponent(version)}`;
}

/* ── 사진 주소 허용 규칙 ─────────────────────────────────────────────────────
 * 노트 photos 는 작성 API 가 문자열 배열을 그대로 받는다 — 아무 주소나 들어올 수 있다. 렌더 라우트가
 * 그 주소를 서버에서 받아 오면 SSRF 가 된다. 그래서 **우리 Supabase 스토리지 객체**만 받는다
 * (next.config images.remotePatterns 와 같은 판단: 호스트 하나 + /storage/v1/object/). */
const STORAGE_PATH_PREFIX = "/storage/v1/object/";

function supabaseHostFromEnv(): string | null {
  const raw = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_SUPABASE_URL?.trim() : "";
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/**
 * 썸네일에 깔아도 되는 사진 주소인가. host 를 넘기면 그 호스트만(테스트), 안 넘기면
 * NEXT_PUBLIC_SUPABASE_URL 의 호스트만 — 값이 없으면 어떤 사진도 받지 않는다(열어 두는 쪽보다 안전).
 */
export function isAllowedCoverPhoto(url: unknown, host: string | null = supabaseHostFromEnv()): url is string {
  if (typeof url !== "string" || url.length > 2048 || !host) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === host &&
    !u.username &&
    !u.password &&
    (u.port === "" || u.port === "443") &&
    u.pathname.startsWith(STORAGE_PATH_PREFIX)
  );
}
