import { getServiceSupabase } from "@/lib/supabase/service";

/* [1056 · C1] 임장노트 저장("note")은 여기 못 넣는다 — 운영 DB 의 CHECK 제약(bookmarks_target_type_check)이
   post · report · expert · meeting · market · complex 만 허용한다(2026-10-11 pg_constraint 실측). 마이그레이션 없이
   타입만 더하면 API 가 받고 DB 가 거절해 500 이 된다. 같은 이유로 아래 "listing" 도 CHECK 목록에 **없다** —
   매물 저장(components/ListingSaveButton)은 insert 단계에서 거절된다(가산 마이그레이션으로 note · listing 을 CHECK 에
   더해야 한다 — 이 묶음은 스키마를 바꾸지 않는다). /my "저장한 노트" 가 늘 0건이던 원인이 이것이다. */
export type BookmarkTargetType =
  | "post"
  | "report"
  | "expert"
  | "meeting"
  | "market"
  | "complex"
  | "listing";

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

function key(userEmail: string, type: BookmarkTargetType, id: string) {
  return `${userEmail}|${type}|${id}`;
}

export async function addBookmark(
  input: Omit<Bookmark, "id" | "createdAt">,
): Promise<Bookmark> {
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
  return (data ?? []).map(mapRow);
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
  return count ?? 0;
}

export async function isBookmarked(
  userEmail: string,
  type: BookmarkTargetType,
  id: string,
): Promise<boolean> {
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
