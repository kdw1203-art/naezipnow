import { getServiceSupabase } from "@/lib/supabase/service";
import {
  SAVED_KINDS,
  addSaved,
  countSaved,
  isSaved,
  listSaved,
  removeSaved,
  type SavedKind,
} from "./settings-store";

/* [1056 · C1 → 1059] 임장노트("note")·매물("listing") 저장은 bookmarks 표에 못 넣는다 — 운영 DB 의 CHECK 제약
   (bookmarks_target_type_check)이 post · report · expert · meeting · market · complex 만 허용한다(2026-10-11 pg_constraint 실측).
   1056~1058 은 소유자에게 제약 교체 SQL 을 부탁했으나 소유자가 "코드로 되게 해 달라" → [1059] 두 종류는 사용자 프로필 설정 jsonb
   (profiles.settings.saved · lib/bookmarks/settings-store)에 저장한다. 바깥 API(add/remove/list/is/count)는 그대로고
   종류에 따라 표와 설정 중 한 곳으로 간다. 스키마 변경 없음. */
export type BookmarkTargetType =
  | "post"
  | "report"
  | "expert"
  | "meeting"
  | "market"
  | "complex"
  | "listing"
  | "note";

export type Bookmark = {
  id: string;
  userEmail: string;
  targetType: BookmarkTargetType;
  targetId: string;
  label?: string | null;
  note?: string | null;
  createdAt: string;
};

const memory = new Map<string, Bookmark>();

/** 설정 jsonb 로 가는 종류인가(note · listing) */
function isSettingsKind(type: BookmarkTargetType): type is SavedKind {
  return SAVED_KINDS.has(type);
}

function fromSaved(userEmail: string, e: { id: string; at: string; label?: string | null; kind: SavedKind }): Bookmark {
  return { id: `${e.kind}:${e.id}`, userEmail, targetType: e.kind, targetId: e.id, label: e.label ?? null, note: null, createdAt: e.at };
}

function key(userEmail: string, type: BookmarkTargetType, id: string) {
  return `${userEmail}|${type}|${id}`;
}

export async function addBookmark(
  input: Omit<Bookmark, "id" | "createdAt">,
): Promise<Bookmark> {
  if (isSettingsKind(input.targetType)) {
    const e = await addSaved(input.userEmail, input.targetType, input.targetId, input.label ?? null);
    return fromSaved(input.userEmail, { ...e, kind: input.targetType });
  }
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const k = key(input.userEmail, input.targetType, input.targetId);
  if (!sb) {
    const existing = memory.get(k);
    if (existing) return existing;
    const rec: Bookmark = { ...input, id: `mem-${k}`, createdAt: now };
    memory.set(k, rec);
    return rec;
  }
  const { data, error } = await sb
    .from("bookmarks")
    .upsert(
      {
        user_email: input.userEmail,
        target_type: input.targetType,
        target_id: input.targetId,
        label: input.label ?? null,
        note: input.note ?? null,
      },
      { onConflict: "user_email,target_type,target_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function removeBookmark(
  userEmail: string,
  type: BookmarkTargetType,
  id: string,
): Promise<void> {
  if (isSettingsKind(type)) {
    await removeSaved(userEmail, type, id);
    return;
  }
  const sb = getServiceSupabase();
  if (!sb) {
    memory.delete(key(userEmail, type, id));
    return;
  }
  await sb
    .from("bookmarks")
    .delete()
    .eq("user_email", userEmail)
    .eq("target_type", type)
    .eq("target_id", id);
}

export async function listBookmarks(
  userEmail: string,
  type?: BookmarkTargetType,
): Promise<Bookmark[]> {
  if (type && isSettingsKind(type)) {
    return (await listSaved(userEmail, type)).map((e) => fromSaved(userEmail, e));
  }
  const sb = getServiceSupabase();
  if (!sb) {
    return [...memory.values()]
      .filter((b) => b.userEmail === userEmail && (!type || b.targetType === type))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  let q = sb
    .from("bookmarks")
    .select("*")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false })
    .limit(200);
  if (type) q = q.eq("target_type", type);
  const { data, error } = await q;
  /* [1057 · B3] 실패를 [] 로 접어 "저장한 글 없음 · 저장한 매물 없음"이 됐고, 부르는 쪽의 ok:false 분기는 죽은 코드였다 — 던진다 */
  if (error) throw new Error(`bookmarks 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  const rows = (data ?? []).map(mapRow);
  if (type) return rows;
  /* 종류를 안 가린 목록은 설정 쪽(노트·매물)도 합쳐 최신순 */
  const extra = (await listSaved(userEmail)).map((e) => fromSaved(userEmail, e));
  return [...rows, ...extra].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** 북마크 개수 (한도 검사용 — head count). */
export async function countBookmarks(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return [...memory.values()].filter((b) => b.userEmail.trim().toLowerCase() === em).length;
  }
  const { count, error } = await sb
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("user_email", em);
  /* 못 센 것을 0 으로 돌려주면 두 곳에서 사실과 어긋난다.
     - 사용량 화면: 북마크를 채워 둔 사람에게 "0 / 30" 이라고 말한다.
     - 한도 게이트(checkBookmarkAddQuota): `used >= limit` 이 항상 거짓이 되어
       플랜 한도를 넘겨서도 계속 담기게 된다 — 실패가 한도를 여는 쪽으로 샌다.
     못 셌으면 던진다. 부르는 쪽(api/me/usage, api/bookmarks)이 503 으로 답한다. */
  if (error) {
    throw new Error(`bookmarks 개수 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  }
  /* [1059] 한도는 표 + 설정(노트·매물) 합산 */
  return (count ?? 0) + (await countSaved(em));
}

export async function isBookmarked(
  userEmail: string,
  type: BookmarkTargetType,
  id: string,
): Promise<boolean> {
  if (isSettingsKind(type)) return isSaved(userEmail, type, id);
  const sb = getServiceSupabase();
  if (!sb) return memory.has(key(userEmail, type, id));
  const { data } = await sb
    .from("bookmarks")
    .select("id")
    .eq("user_email", userEmail)
    .eq("target_type", type)
    .eq("target_id", id)
    .maybeSingle();
  return Boolean(data);
}

function mapRow(r: Record<string, unknown>): Bookmark {
  return {
    id: r.id as string,
    userEmail: r.user_email as string,
    targetType: r.target_type as BookmarkTargetType,
    targetId: r.target_id as string,
    label: (r.label as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
