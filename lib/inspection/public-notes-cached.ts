import "server-only";
import { after } from "next/server";
import { listPublicNotes, type InspectionNote } from "@/lib/inspection/store-db";
import { loadLastGood, saveLastGood } from "@/lib/cache/last-good";
import { MemoryLastGoodStore } from "@/lib/cache/memory-last-good";
import { logger } from "@/lib/log";

/**
 * [967 · 29a] 공개 임장노트 목록 — 마지막 정상본 폴백.
 *
 * ── 왜 (실측 2026-09-06, Vercel 오류 로그 6시간) ─────────────────────────────
 * `revalidating cache with key: …analysis-public-preview-v1… Error: inspection_notes
 * 조회 실패 (공개 노트) — TimeoutError` 가 약 20회. /analysis·/notes·/complex/browse 가
 * unstable_cache 안에서 listPublicNotes() 를 부르는데, DB 가 밀리는 시간대에 그 조회가
 * 타임아웃으로 죽으면 (1) unstable_cache 는 실패를 저장하지 않으므로 다음 방문도 같은
 * 조회를 다시 DB 에 꽂고 (2) 방문자는 "불러오지 못했습니다" 를 본다 — 내용은 모든
 * 방문자에게 같고 1시간 전 목록이면 충분한 화면인데도.
 *
 * ── 계약 ───────────────────────────────────────────────────────────────────
 *  · 성공: 그대로 돌려주고, 사본을 public_data_cache(last-good) 에 남긴다.
 *  · 실패: 24시간 안의 마지막 정상본이 있으면 stale=true 로 돌려준다. 호출부는 이 값을
 *    화면에 적어야 한다("잠시 전 목록") — 낡은 값을 방금 값처럼 내지 않는다.
 *  · 정상본도 없으면 원래 오류를 그대로 던진다 — "노트 없음" 으로 위장하지 않는다.
 *
 * ── 저장본에서 작성자 이메일을 뺀다 ────────────────────────────────────────
 * public_data_cache 는 공개 집계용 표라 anon 읽기 폴백(lib/market/base-rate.ts)이 있다.
 * inspection_notes.author_email 은 2026-08-06 컬럼 GRANT 로 anon 에게서 막은 값인데,
 * 그 값을 다른 표에 복사해 두면 막은 문이 옆문으로 다시 열린다. 이 목록을 쓰는 화면은
 * 이메일을 앞 두 글자 마스킹에만 쓰므로(app/notes/page.tsx maskAuthor) 폴백본에서는
 * "이웃** 이웃" 으로 보이는 것이 유일한 차이다. 폴로우 피드처럼 이메일로 대조하는
 * 경로는 이 함수를 쓰지 않는다(개인 데이터라 폴백 대상이 아니다).
 */

export type PublicNotesResult = {
  notes: InspectionNote[];
  /** true 면 DB 조회가 실패해 마지막 정상본을 대신 낸 것 — 화면에 적어야 한다 */
  stale: boolean;
  /** 정상본이 저장된 시각(ISO). stale 일 때만 채워진다. */
  fetchedAt: string | null;
};

const MAX_STALE_HOURS = 24;

/* ── [976] 폴백이 같은 DB 에 기대고 있었다 ─────────────────────────────────
 *
 * 967 에서 붙인 폴백은 public_data_cache(=같은 Postgres)에서 마지막 정상본을
 * 읽는다. 그런데 이 폴백이 필요한 상황은 **DB 가 밀려서 본 조회가 죽었을 때**다.
 * 그 순간에는 폴백 조회도 같은 풀에서 같은 대기를 하다 같이 죽는다. 그래서
 * 967 이후에도 `analysis-public-preview-v1 … TimeoutError` 가 그대로 남았다
 * (2026-09-08 실측: 최근 7일 477건 · 사용자 189명, 오늘 새 배포에서도 7건).
 *
 * 그래서 층을 하나 앞에 둔다 — **이 인스턴스가 직접 성공했던 마지막 값**을
 * 메모리에 들고 있다가 먼저 낸다. DB 왕복이 0이라 포화 상태에서도 확실히 뜨고,
 * 자기가 읽어 본 적 없는 값은 절대 내지 않는다(다른 사용자 데이터가 섞일 수
 * 없다 — 애초에 모두에게 같은 공개 목록이다).
 *
 * 서버리스라 인스턴스가 식으면 사라진다. 그건 결함이 아니라 이 층의 성격이다 —
 * 식은 인스턴스는 예전처럼 DB 정상본 → 실패 순서로 내려간다. 층은 셋이 된다:
 *   ① 메모리 정상본(이 인스턴스, 24시간) → ② DB 정상본(24시간) → ③ 실패를 던짐
 */
const memoryLastGood = new MemoryLastGoodStore<InspectionNote[]>(
  MAX_STALE_HOURS * 3_600_000,
);

function cacheKey(limit: number): string {
  return `public-notes:${limit}`;
}

function stripAuthorEmail(notes: InspectionNote[]): InspectionNote[] {
  return notes.map((n) => ({ ...n, authorEmail: "" }));
}

/* 응답을 볼모로 잡지 않는 저장. Vercel 은 응답이 끝나면 함수를 얼릴 수 있어 그냥
   버려둔 Promise 는 안 끝날 수 있다 — after() 가 waitUntil 로 완료를 보장한다.
   빌드 프리렌더처럼 waitUntil 이 없는 자리에서는 after() 가 동기적으로 던지므로
   그때만 fire-and-forget 으로 남긴다(saveLastGood 은 스스로 실패를 삼킨다). */
function persistInBackground(key: string, notes: InspectionNote[]): void {
  const task = saveLastGood(key, stripAuthorEmail(notes));
  try {
    after(task);
  } catch {
    void task;
  }
}

/**
 * @param limit  목록 크기 — 정상본 키에도 쓰인다(`public-notes:<limit>`).
 * @param load   실제 조회. 기본은 listPublicNotes. /notes 첫 페이지처럼 같은 질의(공개·
 *               최신순·limit)를 다른 함수로 부르는 자리는 그 함수를 넘긴다 — 결과 집합이
 *               같으므로 정상본 키를 공유해도 된다.
 */
export async function listPublicNotesWithFallback(
  limit: number,
  load: (limit: number) => Promise<InspectionNote[]> = listPublicNotes,
): Promise<PublicNotesResult> {
  const key = cacheKey(limit);
  try {
    const notes = await load(limit);
    /* 메모리 정상본은 이메일을 지운 사본으로 둔다 — DB 정상본과 같은 규칙이다
       (위 stripAuthorEmail 주석). 폴백으로 나갈 때만 쓰는 값이므로 정상 경로의
       반환값에는 영향이 없다. */
    memoryLastGood.save(key, stripAuthorEmail(notes));
    persistInBackground(key, notes);
    return { notes, stale: false, fetchedAt: null };
  } catch (error) {
    /* ① 이 인스턴스의 메모리 정상본 — DB 를 한 번도 더 건드리지 않는다 */
    const mem = memoryLastGood.read(key);
    if (mem) {
      logger.warn(
        `[public-notes] ${key} 조회 실패 → 메모리 정상본 ${mem.value.length}건으로 대체 (${mem.fetchedAt})`,
        error instanceof Error ? error.message : error,
      );
      return { notes: mem.value, stale: true, fetchedAt: mem.fetchedAt };
    }
    /* ② DB 정상본 — 인스턴스가 식었을 때의 길 */
    const lkg = await loadLastGood<InspectionNote[]>(key, MAX_STALE_HOURS);
    if (lkg && Array.isArray(lkg.value)) {
      logger.warn(
        `[public-notes] ${key} 조회 실패 → ${lkg.fetchedAt} 정상본 ${lkg.value.length}건으로 대체`,
        error instanceof Error ? error.message : error,
      );
      return { notes: lkg.value, stale: true, fetchedAt: lkg.fetchedAt };
    }
    throw error;
  }
}
