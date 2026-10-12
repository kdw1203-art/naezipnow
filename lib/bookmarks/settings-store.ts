import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [1059] 임장노트·매물 저장 — DB 표(bookmarks)의 CHECK 제약이 post·report·expert·meeting·market·complex 만 허용해
 * note·listing 은 insert 단계에서 거절됐다(1056~1058 에서 소유자에게 SQL 두 줄을 부탁했지만, 소유자가 "코드로 되게 해 달라"고 했다).
 * 스키마를 바꾸지 않고 되게 하는 자리는 **사용자 프로필의 설정 jsonb**(profiles.settings — auth 트리거가 모든 계정에 행을 만든다 ·
 * 닉네임 효과도 같은 열을 쓴다)다. 모양:
 *   settings.saved = { note: [{ id, at, label? }, …], listing: [{ id, at, label? }, …] }   (최신이 앞 · 종류당 300개)
 * 같은 행을 두 요청이 동시에 고치면 한쪽이 사라지므로 updated_at 조건 갱신 + 재시도(글 댓글과 같은 방식).
 * "이 노트를 저장한 사람 수"는 jsonb 포함 질의(settings @> {saved:{note:[{id}]}})로 센다 — 프로필 수만큼의 표 훑기라
 * 회원 수가 수만이 되면 색인이 필요하다(그때 표로 옮긴다). */

export type SavedKind = "note" | "listing";
export const SAVED_KINDS: ReadonlySet<string> = new Set(["note", "listing"]);
export const SAVED_CAP_PER_KIND = 300;

export type SavedEntry = { id: string; at: string; label?: string | null };
type SavedBag = Partial<Record<SavedKind, SavedEntry[]>>;

const memory = new Map<string, SavedBag>();

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 설정 jsonb 에서 saved 묶음만 — 모양이 어긋난 값은 버린다(순수 · 시험 대상) */
export function readSavedBag(settings: unknown): SavedBag {
  const out: SavedBag = {};
  if (!settings || typeof settings !== "object") return out;
  const saved = (settings as { saved?: unknown }).saved;
  if (!saved || typeof saved !== "object") return out;
  for (const kind of ["note", "listing"] as const) {
    const arr = (saved as Record<string, unknown>)[kind];
    if (!Array.isArray(arr)) continue;
    const seen = new Set<string>();
    const rows: SavedEntry[] = [];
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const id = String((e as { id?: unknown }).id ?? "").trim();
      const at = String((e as { at?: unknown }).at ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = (e as { label?: unknown }).label;
      rows.push({ id, at, label: typeof label === "string" ? label : null });
    }
    out[kind] = rows;
  }
  return out;
}

/** 묶음에 하나 넣기 — 이미 있으면 그대로, 없으면 맨 앞에 · 상한 넘치면 오래된 것부터 버림(순수) */
export function withSaved(bag: SavedBag, kind: SavedKind, entry: SavedEntry): { bag: SavedBag; added: boolean } {
  const cur = bag[kind] ?? [];
  if (cur.some((e) => e.id === entry.id)) return { bag, added: false };
  const next = [entry, ...cur].slice(0, SAVED_CAP_PER_KIND);
  return { bag: { ...bag, [kind]: next }, added: true };
}

export function withoutSaved(bag: SavedBag, kind: SavedKind, id: string): { bag: SavedBag; removed: boolean } {
  const cur = bag[kind] ?? [];
  const next = cur.filter((e) => e.id !== id);
  if (next.length === cur.length) return { bag, removed: false };
  return { bag: { ...bag, [kind]: next }, removed: true };
}

type ProfileRow = { id: string; settings: Record<string, unknown>; updatedAt: string | null };

/** 이메일로 프로필 한 행 — 소문자 일치를 먼저, 없으면 대소문자 무시(옛 행의 표기 보존) */
async function readProfile(email: string): Promise<ProfileRow | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const key = normEmail(email);
  let { data, error } = await sb.from("profiles").select("id, settings, updated_at").eq("email", key).limit(1).maybeSingle();
  if (!error && !data) {
    const esc = key.replace(/[\\%_]/g, (m) => `\\${m}`);
    ({ data, error } = await sb.from("profiles").select("id, settings, updated_at").ilike("email", esc).limit(1).maybeSingle());
  }
  if (error) throw new Error(`profiles 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  if (!data) return null;
  const settings =
    data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {};
  return { id: String(data.id), settings, updatedAt: (data.updated_at as string | null) ?? null };
}

/** saved 묶음을 바꿔 쓴다 — updated_at 이 그대로일 때만(동시 갱신 유실 방지) · 3회 재시도 */
async function mutateSaved(
  email: string,
  mutate: (bag: SavedBag) => { bag: SavedBag; changed: boolean },
): Promise<void> {
  const sb = getServiceSupabase();
  const key = normEmail(email);
  if (!sb) {
    const r = mutate(memory.get(key) ?? {});
    if (r.changed) memory.set(key, r.bag);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readProfile(email);
    if (!row) throw new Error("profiles 행 없음 — 저장할 자리가 없다");
    const r = mutate(readSavedBag(row.settings));
    if (!r.changed) return;
    const nextSettings = { ...row.settings, saved: r.bag };
    const nextUpdated = new Date(Math.max(Date.now(), row.updatedAt ? Date.parse(row.updatedAt) + 1 : 0)).toISOString();
    let q = sb.from("profiles").update({ settings: nextSettings, updated_at: nextUpdated }).eq("id", row.id);
    q = row.updatedAt ? q.eq("updated_at", row.updatedAt) : q.is("updated_at", null);
    const { data, error } = await q.select("email");
    if (error) throw new Error(`profiles 저장 실패: ${error.message ?? "알 수 없는 오류"}`);
    if (Array.isArray(data) && data.length > 0) return;
    logger.warn("[saved] profiles.settings 동시 갱신 — 다시 읽음", { attempt });
  }
  throw new Error("profiles 저장 실패: 동시 갱신 3회");
}

export async function addSaved(email: string, kind: SavedKind, id: string, label?: string | null): Promise<SavedEntry> {
  const entry: SavedEntry = { id, at: new Date().toISOString(), label: label ?? null };
  let stored = entry;
  await mutateSaved(email, (bag) => {
    const existing = (bag[kind] ?? []).find((e) => e.id === id);
    if (existing) {
      stored = existing;
      return { bag, changed: false };
    }
    const r = withSaved(bag, kind, entry);
    return { bag: r.bag, changed: r.added };
  });
  return stored;
}

export async function removeSaved(email: string, kind: SavedKind, id: string): Promise<void> {
  await mutateSaved(email, (bag) => {
    const r = withoutSaved(bag, kind, id);
    return { bag: r.bag, changed: r.removed };
  });
}

/** 종류별 목록(최신 앞) — 조회 실패는 던진다(빈 목록으로 둔갑시키지 않는다) */
export async function listSaved(email: string, kind?: SavedKind): Promise<Array<SavedEntry & { kind: SavedKind }>> {
  const sb = getServiceSupabase();
  const bag = sb ? readSavedBag((await readProfile(email))?.settings ?? {}) : (memory.get(normEmail(email)) ?? {});
  const kinds: SavedKind[] = kind ? [kind] : ["note", "listing"];
  const out: Array<SavedEntry & { kind: SavedKind }> = [];
  for (const k of kinds) for (const e of bag[k] ?? []) out.push({ ...e, kind: k });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function isSaved(email: string, kind: SavedKind, id: string): Promise<boolean> {
  return (await listSaved(email, kind)).some((e) => e.id === id);
}

export async function countSaved(email: string): Promise<number> {
  return (await listSaved(email)).length;
}

/** 이 대상을 저장한 사람 수 — jsonb 포함 질의(실패는 던진다) */
export async function countSavedForTarget(kind: SavedKind, id: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) {
    let n = 0;
    for (const bag of memory.values()) if ((bag[kind] ?? []).some((e) => e.id === id)) n++;
    return n;
  }
  const { count, error } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .contains("settings", { saved: { [kind]: [{ id }] } });
  if (error) throw new Error(`저장 수 집계 실패: ${error.message ?? "알 수 없는 오류"}`);
  if (typeof count !== "number") throw new Error("저장 수 집계 결과가 숫자가 아닙니다");
  return count;
}
