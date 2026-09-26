import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { invalidatePathList, type InvalidateStats } from "@/lib/cache/invalidate";
import {
  expertPaths,
  imjangPathsForNoteRegion,
  imjangPathsForTxRegionNames,
  profilePaths,
  promptPathsForTags,
  PUBLIC_NOTE_LIST_PATHS,
} from "@/lib/town/changed-town-paths";
import { TOWN_DATA_CACHE_TAGS } from "@/lib/town/cache-tags";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* ── [1010] 동네·커뮤니티·Q&A·노트·프로필 축의 "지금 비워라" 창구 ──────────────
 *
 * 단지 축의 lib/complex/complex-invalidate.ts 와 같은 자리다. 라우트 TTL 을 하루~7일로
 * 늘리는 대신, 화면을 바꾸는 쓰기 지점에서 **그 화면만** 즉시 비운다(1010 브리프 원칙 1·3:
 * 사람이 쓴 글·댓글·노트는 쓰는 즉시 보여야 한다).
 *
 * 재검증 실패가 쓰기 결과를 되돌리면 안 되므로 전부 삼킨다 — invalidatePathList 가 이미
 * 경로마다 삼키지만, 요청 밖(크론)에서 부르는 자리가 생겨도 안전하도록 호출도 감싼다.
 * 실패해도 TTL 이 안전망으로 남는다.
 * ──────────────────────────────────────────────────────────────────────────── */

const EMPTY: InvalidateStats = { requested: 0, revalidated: 0, truncated: false };

function safe(run: () => InvalidateStats, label: string): InvalidateStats {
  try {
    return run();
  } catch (e) {
    logger.warn("[town-invalidate] 재검증 실패(무시)", label, e);
    return EMPTY;
  }
}

/**
 * 공개 임장노트가 바뀌었다 — 그 노트가 실리는 **목록 화면과 지역 임장 가이드**를 비운다.
 *
 * 부르는 곳: 공개 노트 생성 · 공개↔비공개 전환 · 공개 노트 수정 · 삭제
 * (app/api/inspection/notes/**). 홈·동네 피드·지역 허브·단지 허브는 각각 전용 헬퍼가
 * 이미 맡고 있어 여기서 겹쳐 부르지 않는다.
 *
 * regions 에는 **바뀌기 전후 지역 표기를 모두** 넘긴다 — 수정으로 지역이 바뀌면 옛 지역
 * 가이드에서도 그 노트가 빠져야 한다.
 */
export function invalidatePublicNoteRoutes(
  regions: Iterable<string | null | undefined> = [],
): InvalidateStats {
  const paths = [...PUBLIC_NOTE_LIST_PATHS];
  for (const r of regions) paths.push(...imjangPathsForNoteRegion(r));
  return safe(() => invalidatePathList(paths, { label: "public-note" }), "public-note");
}

/**
 * 공개 프로필(`/u/{handle}`)을 비운다 — 그 사람의 공개 노트 그리드·팔로워 수·프로필 사진이
 * 서버 렌더에 실린다(app/u/[handle]/page.tsx).
 *
 * 주소를 만들려면 profiles.handle·full_name 이 필요해 조회가 한 번 든다. 쓰기 응답을
 * 볼모로 잡지 않도록 호출부는 await 하지 않아도 된다(실패는 여기서 삼킨다).
 * 서비스 키가 없으면(로컬·미설정) 조용히 아무것도 하지 않는다 — 비울 캐시도 없다.
 */
export async function invalidateProfileForEmail(
  email: string | null | undefined,
): Promise<InvalidateStats> {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean) return EMPTY;
  try {
    const sb = getServiceSupabase();
    if (!sb) return EMPTY;
    const { data, error } = await sb
      .from("profiles")
      .select("handle, full_name")
      .eq("email", clean)
      .limit(1);
    if (error) {
      logger.warn("[town-invalidate] 프로필 주소 조회 실패(무시)", error.message);
      return EMPTY;
    }
    const row = (data ?? [])[0] as { handle?: string | null; full_name?: string | null } | undefined;
    if (!row) return EMPTY;
    const paths = profilePaths([row.handle, row.full_name]);
    if (paths.length === 0) return EMPTY;
    return invalidatePathList(paths, { label: "profile" });
  } catch (e) {
    logger.warn("[town-invalidate] 프로필 재검증 실패(무시)", e);
    return EMPTY;
  }
}

/**
 * 뉴스·이웃 글이 담기는 **공용 데이터 캐시**를 비운다(태그).
 *
 * 왜 태그인가: 동네 글 병합 목록(related-town-posts-v1)과 주간 다이제스트
 * (newui-weekly-digest-v2)는 unstable_cache 라, 그 TTL 이 이 캐시를 읽는 라우트의
 * revalidate 를 끌어내린다(lib/town/cache-tags.ts 주석의 실측). 라우트 TTL 을 올리려면
 * 데이터 캐시 TTL 도 같이 올려야 하고, 올린 만큼은 여기서 비워야 한다.
 * 태그 "news" 는 건드리지 않는다 — 지역 축 캐시가 같이 달려 있다(SOURCE_MAP.news 주석).
 */
export function invalidateTownDataCaches(): void {
  try {
    for (const tag of TOWN_DATA_CACHE_TAGS) revalidateTag(tag);
  } catch (e) {
    logger.warn("[town-invalidate] 동네 데이터 캐시 태그 비움 실패(무시)", e);
  }
}

/**
 * 뉴스 주제 허브 20곳(`/town/news/tag/{slug}`) + 동네 데이터 캐시를 비운다.
 *
 * 20장뿐이라 라우트 단위(page)로 한 번에 비운다 — 지역 축처럼 셀을 골라야 할 만큼
 * 장수가 많지 않다(지역 축은 1,403셀이라 골라 비운다).
 * 부르는 곳: 뉴스 적재 재검증 크론 · 뉴스 성격의 글을 싣는 크론 3곳.
 */
export function invalidateNewsHubs(): void {
  invalidateTownDataCaches();
  try {
    revalidatePath("/town/news/tag/[tag]", "page");
  } catch (e) {
    logger.warn("[town-invalidate] 뉴스 주제 허브 재검증 실패(무시)", e);
  }
}

/**
 * 이웃 글이 쌓이는 글감 스레드(`/town/prompt/{idx}`)를 비운다 — 글의 태그에서 찾는다.
 * 태그가 없으면 아무것도 하지 않는다(14장을 통째로 비우지 않는다).
 */
export function invalidatePromptThreads(tags: Iterable<string> | null | undefined): InvalidateStats {
  const paths = promptPathsForTags(tags);
  if (paths.length === 0) return EMPTY;
  return safe(() => invalidatePathList(paths, { label: "town-prompt" }), "town-prompt");
}

/**
 * 위를 응답 뒤에 돌린다 — 조회가 한 번 들어 쓰기 응답을 붙잡지 않기 위해서다.
 *
 * 그냥 버려둔 Promise 는 안 끝날 수 있다(Vercel 은 응답이 끝나면 함수를 얼릴 수 있다).
 * after() 가 waitUntil 로 완료를 보장한다 — lib/inspection/public-notes-cached.ts 의
 * persistInBackground 와 같은 패턴이다. after() 를 쓸 수 없는 자리(빌드 프리렌더 등)에서는
 * 그때만 버려둔다(헬퍼가 스스로 실패를 삼킨다).
 */
export function scheduleProfileInvalidation(email: string | null | undefined): void {
  const task = invalidateProfileForEmail(email);
  try {
    after(task);
  } catch {
    void task;
  }
}

/**
 * 실거래가 적재된 지역의 임장 가이드(`/imjang/{slug}`)와 인덱스(`/imjang`)를 비운다.
 *
 * 왜 여기가 필요한가: 이 두 화면은 실거래만으로 지역 목록·단지 순위를 그리는데,
 * lib/cache/invalidate.ts 의 SOURCE_MAP.molit 에는 `/imjang` 이 없었다. TTL 을 하루에서
 * 7일로 늘리려면(크롤러 재방문 ≈2.2일) 적재 직후의 비움이 신선도를 맡아야 한다.
 * 바뀐 지역만 넘긴다 — 라우트 전체를 비우면 하루 1회 전량 재렌더로 수렴해
 * 지금의 하루 TTL 과 같아진다(지역 축 changed-region-paths.ts 의 같은 판단).
 */
export function invalidateImjangForTxRegions(names: Iterable<string>): InvalidateStats {
  const paths = imjangPathsForTxRegionNames(names);
  if (paths.length === 0) return EMPTY;
  return safe(() => invalidatePathList(paths, { budget: 400, label: "imjang" }), "imjang");
}

/** 전문가 목록·상세를 비운다(등록 승인·수정·삭제·후기·상담 답변). */
export function invalidateExpertRoutes(id?: string | null): InvalidateStats {
  return safe(() => invalidatePathList(expertPaths(id), { label: "expert" }), "expert");
}

/**
 * 임장 모임 목록(`/town/groups`)을 비운다.
 * 모임 생성·정원 변화(참여/취소)·24시간 채팅 활성도 배지가 모두 이 한 화면을 바꾼다.
 */
export function invalidateGroupRoutes(): InvalidateStats {
  return safe(() => invalidatePathList(["/town/groups"], { label: "town-group" }), "town-group");
}

/**
 * 노트 템플릿 목록·상세를 비운다 — 목록 카드에 "N회 사용"(use_count)이 실린다
 * (app/notes/templates/TemplateBrowser.tsx). 노트 저장이 그 수를 올린다.
 */
export function invalidateNoteTemplateRoutes(id?: string | null): InvalidateStats {
  const clean = String(id ?? "").trim();
  const paths = clean ? ["/notes/templates", `/notes/templates/${clean}`] : ["/notes/templates"];
  return safe(() => invalidatePathList(paths, { label: "note-template" }), "note-template");
}
