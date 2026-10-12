/**
 * [1058] 글·댓글·노트에 저장할 작성자 표시명 — 한 곳에서 정한다.
 *
 * 감사(2026-10-12): 다섯 쓰기 라우트(talk · community posts · posts/[id]/comments · inspection/notes ·
 * notes/[id]/comments)가 전부 `session.user.name` 을 그대로 author_label 에 넣었다. 그 값은 로그인 때
 * 공급자(구글 이름·카카오 닉네임·토스 실명)에서 한 번 굳은 값이라, 프로필 편집(app_users.name)으로
 * 이름을 바꿔도 새 글에 옛 이름(실명일 수 있다)이 계속 찍혔다 — 시트는 "공개 노트와 댓글에 이 이름이
 * 보여요"라고 적어 놓고도.
 *
 * 순서: app_users.name(프로필 편집 값) → profiles.full_name → fallback(세션 이름) → "○○** 이웃"(마스킹).
 * 이미 저장된 행의 author_label 은 그대로다 — 지난 글은 지난 이름으로 남는다(데이터 정정은 별건).
 * 조회 실패는 fallback 으로 접는다 — 이름을 못 읽었다고 글쓰기를 막지 않는다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { maskNoteAuthor } from "@/lib/town/shared";
import { looksLikeEmail } from "@/lib/privacy/mask-email";
import { logger } from "@/lib/log";

/** 표시명 상한 — talk(40자)·community 와 같은 자릿수로 자른다 */
const NAME_MAX = 40;

/** 공개 컬럼에 들어갈 값 — 이메일 모양이면 없는 것으로 친다(마스킹 폴백으로) */
function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return looksLikeEmail(s) ? "" : s;
}

/**
 * app_users.name → profiles.full_name → fallback → null. 마스킹하지 않는다(없으면 null).
 * 두 조회는 병렬(둘 다 이메일 유니크 조회) — 쓰기 응답에 왕복 하나만 더한다.
 */
export async function lookupDisplayName(
  email: string,
  fallback?: string | null,
): Promise<string | null> {
  const lower = String(email ?? "").trim().toLowerCase();
  const sb = getServiceSupabase();
  if (sb && lower) {
    try {
      const [au, pr] = await Promise.all([
        sb.from("app_users").select("name").eq("email", lower).maybeSingle(),
        /* profiles.email 은 대소문자가 섞여 있을 수 있다(listFollowingPublic 과 같은 두 벌 조회) */
        sb.from("profiles").select("full_name").in("email", [...new Set([email.trim(), lower])]).limit(1),
      ]);
      if (au.error) logger.warn("[display-name] app_users.name 조회 실패(세션 이름으로)", au.error.message);
      const fromApp = clean(au.data?.name);
      if (fromApp) return fromApp;
      if (pr.error) logger.warn("[display-name] profiles.full_name 조회 실패(세션 이름으로)", pr.error.message);
      const fromProfile = clean(pr.data?.[0]?.full_name);
      if (fromProfile) return fromProfile;
    } catch (e) {
      logger.warn("[display-name] 조회 예외(세션 이름으로)", e);
    }
  }
  const fb = clean(fallback);
  return fb || null;
}

/**
 * 저장용 표시명 — 위 순서로 찾고, 아무것도 없으면 "○○** 이웃"(lib/town/shared maskNoteAuthor).
 * 절대 빈 문자열·이메일을 돌려주지 않는다.
 */
export async function resolveDisplayName(email: string, fallback?: string | null): Promise<string> {
  const found = await lookupDisplayName(email, fallback);
  return maskNoteAuthor(found, String(email ?? ""));
}
