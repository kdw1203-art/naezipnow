/* [1066] 노트 한 건 로더 — 종전 app/notes/[id]/page.tsx 안에 있던 것을 그대로 옮겼다.
 *
 * 왜 옮겼나: 같은 세그먼트의 layout.tsx 가 "없는 노트"를 먼저 걸러 **진짜 404**(HTTP 404)를
 * 내보내는데, 레이아웃과 본문이 각자 cache() 를 만들면 한 요청에 노트 조회가 두 번 나간다.
 * React cache() 는 **함수 정체성**으로 묶이므로 두 파일이 이 모듈 하나를 가져와야 한 번이 된다.
 *
 * 내용은 손대지 않았다(아래 주석도 그대로):
 * [969 · 20] 노트 행 — 공개 노트는 데이터 캐시(5분, note:<id>)에서 먼저 찾는다.
 * 누가 보든 같은 값이라 뷰어별 분기(소유자·구매 열람)는 이 결과 위에서 그대로 한다.
 * 캐시 로더(lib/inspection/note-cache.ts)는 공개가 아닌 행을 절대 돌려주지 않고(null),
 * 여기서는 그 null 을 "비공개거나 없음" 으로만 읽어 실조회로 내려간다 — 비공개 본문은
 * 캐시에 실리지 않는다. 캐시 결과를 쓰기 전에 isPublic 을 한 번 더 확인한다(방어).
 * 실패는 던지지 않고 3분기(정상·미존재·조회실패)로 돌려준다. */
import { cache } from "react";
import { getNote, type InspectionNote } from "@/lib/inspection/store-db";
import { getPublicNoteCached } from "@/lib/inspection/note-cache";

export type LoadResult =
  | { kind: "ok"; note: InspectionNote; source: "cache" | "db" }
  | { kind: "missing"; source: "db" }
  | { kind: "error"; message: string };

/* [969 · 20] 노트 행 — 공개 노트는 데이터 캐시(5분, note:<id>)에서 먼저 찾는다.
   누가 보든 같은 값이라 뷰어별 분기(소유자·구매 열람)는 이 결과 위에서 그대로 한다.
   캐시 로더(lib/inspection/note-cache.ts)는 공개가 아닌 행을 절대 돌려주지 않고(null),
   여기서는 그 null 을 "비공개거나 없음" 으로만 읽어 실조회로 내려간다 — 비공개 본문은
   캐시에 실리지 않는다. 캐시 결과를 쓰기 전에 isPublic 을 한 번 더 확인한다(방어).

   React cache(): generateMetadata 와 페이지가 같은 요청 안에서 getNote 를 **각각**
   불렀다 — 요청당 노트 조회 2회 중 1회는 그냥 중복이었다. 이제 한 번만 한다
   (공개·비공개 모두). 실패는 던지지 않고 3분기(정상·미존재·조회실패)로 돌려준다. */
export const loadNote = cache(async (id: string): Promise<LoadResult> => {
  try {
    const cached = await getPublicNoteCached(id);
    if (cached && cached.isPublic) return { kind: "ok", note: cached, source: "cache" };
    const note = await getNote(id);
    return note ? { kind: "ok", note, source: "db" } : { kind: "missing", source: "db" };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
});
