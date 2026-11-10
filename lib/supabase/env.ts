/**
 * 최종 폴백 상수 — 프로젝트 URL과 publishable 키는 설계상 공개 값(RLS로 보호).
 * 일부 배포 환경의 env에 "[SENSITIVE]" 마스킹 플레이스홀더가 저장돼 있어
 * env가 무효할 때 이 값으로 동작한다. env가 유효하면 env가 우선.
 */
/* [1134 · 새 프로젝트] 2026-11-10 기존 프로젝트(pbhiskvwpwwhtkmnhkbm)를 떠나 새 프로젝트로 옮겼다 — 폴백도 새 값으로.
   옛 값이 폴백으로 남아 있으면 env 의 공개 키가 무효일 때 "새 주소 + 옛 키" 조합이 되어 가입(Supabase Auth)이 Invalid API key 로 거절됐다. */
const FALLBACK_SUPABASE_URL = "https://gjhnrpiiuhjzjzuuvdck.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "sb_publishable_Fc-mhrDFV0KJcqL2w2Fkvg_5IRVI51V";
/** 옛 프로젝트의 공개 키 — env 에 남아 있으면 무효로 친다(프로젝트를 옮긴 뒤 바꾸지 않은 값) */
const RETIRED_PUBLISHABLE_KEYS: readonly string[] = ["sb_publishable_UjkQXcYY6f9oBbjjfZvFAA_jYpui-OX"];

/** 주소에서 프로젝트 ref("https://xxx.supabase.co" → "xxx") */
function refOfUrl(u: string | undefined): string | null {
  try {
    return u ? (new URL(u).hostname.split(".")[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** anon JWT 의 ref 클레임 — 못 읽으면 null(검사하지 않는다) */
export function refOfAnonJwt(key: string): string | null {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { ref?: unknown };
    return typeof json.ref === "string" ? json.ref : null;
  } catch {
    return null;
  }
}

/** 이 공개 키를 지금 주소의 프로젝트에 쓸 수 있나 — 다른 프로젝트의 anon JWT · 옛 프로젝트의 공개 키는 걸러 낸다 */
export function publicKeyFitsProject(key: string | undefined, projectRef: string | null): boolean {
  if (!key) return false;
  if (key.startsWith("sb_publishable_")) return !RETIRED_PUBLISHABLE_KEYS.includes(key);
  if (!key.startsWith("eyJ")) return false;
  const ref = refOfAnonJwt(key);
  return ref === null || projectRef === null || ref === projectRef;
}

/** 브라우저·서버(SSR) 공통 — anon(레거시) 또는 Publishable 키(신규) */
export function getSupabaseUrl(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    process.env.SUPABASE_URL?.trim(),
  ];
  // http(s) URL만 허용 — 일부 환경엔 SUPABASE_URL이 Postgres 연결 문자열로
  // 들어가 있어 그대로 쓰면 @supabase/ssr가 throw함 (edge 500 원인)
  for (const u of candidates) {
    if (!u) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return u;
    } catch {
      // 무시하고 다음 후보
    }
  }
  return FALLBACK_SUPABASE_URL;
}

export function getSupabasePublicKey(): string | undefined {
  // 형식 검증: JWT(anon) 또는 sb_publishable_ — 마스킹 플레이스홀더 배제
  // [1134] + 프로젝트 검증: 주소와 다른 프로젝트의 anon JWT · 옛 프로젝트 공개 키는 무효(다음 후보 · 폴백으로)
  const projectRef = refOfUrl(getSupabaseUrl());
  const valid = (k?: string) => (publicKeyFitsProject(k, projectRef) ? k : undefined);
  const anon =
    valid(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) ||
    valid(process.env.SUPABASE_ANON_KEY?.trim());
  const publishable =
    valid(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) ||
    valid(process.env.SUPABASE_PUBLISHABLE_KEY?.trim());
  return anon || publishable || FALLBACK_PUBLISHABLE_KEY;
}

/** `https://xxx.supabase.co` → 프로젝트 ref `xxx` (대시보드 URL용). */
export function getSupabaseProjectRefFromUrl(): string | null {
  const u = getSupabaseUrl();
  if (!u) return null;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) return null;
    const ref = host.replace(/\.supabase\.co$/i, "");
    return ref || null;
  } catch {
    return null;
  }
}

/** API 키(service_role) 복사 페이지로 바로 이동. */
export function getSupabaseDashboardApiSettingsUrl(): string | null {
  const ref = getSupabaseProjectRefFromUrl();
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}/settings/api`;
}
