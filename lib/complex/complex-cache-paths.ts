import {
  complexHrefFromId,
  complexHrefFromNames,
  pureIdFromParam,
} from "@/lib/seo/complex-slug";

/* ── [1010] 단지 화면을 비울 때 **어떤 id 표기를 넘겨야 하는가** ─────────────────
   lib/cache/invalidate.ts 의 invalidateComplexIds(ids) 는 id 하나마다
   `/complex/{id}` 와 `/embed/complex/{id}` 를 비운다. 그런데 이 두 라우트는 **서로 다른
   id 표기로 캐시돼 있다.**

   · 단지 허브: [#51] 한글 슬러그 전환 이후 정규 주소가 `/complex/{슬러그}.{base64id}` 다
     (complex-store 의 complexCanonicalPathFromNames — 사이트맵 25,310개와 generateMetadata
     canonical 이 모두 이 문자열). 순수 id 주소(`/complex/{base64id}`)로 오면 미들웨어가
     308 로 정규 주소에 보내므로 그 주소에는 ISR 사본이 아예 없다. 즉
     `invalidateComplexIds([순수id])` 만으로는 **허브가 안 비워진다.**
   · 임베드: 슬러그 정규화 대상이 아니다(middleware.ts 는 `/complex/` 1세그먼트만 본다).
     EmbedSnippet 이 순수 id 로 주소를 만들므로 `/embed/complex/{순수id}` 가 실제 사본이다.
     다만 /widget 의 parseWidgetTarget 은 붙여넣은 정규 주소에서 장식 파라미터를 그대로
     뽑으므로 `/embed/complex/{장식}` 사본도 생길 수 있다.

   그래서 **두 표기를 모두** 넘긴다(단지당 최대 4경로, 그중 2개가 실제 사본이다).
   중복 제거는 invalidatePathList 가 한다. kapt id(`kapt.{코드}`)는 슬러그를 붙이지 않으므로
   두 표기가 같고 집합이 1개로 접힌다.

   이 모듈은 **순수**다(next/cache·supabase 를 import 하지 않는다) — 규칙을 단위 테스트로
   고정하기 위해서다(tests/unit/complex-1010.test.ts). 무효화 호출은 complex-invalidate.ts.

   ※ 통합자에게: invalidate.ts 가 (지역, 단지명) → 정규 경로를 직접 알면 경로 수가 절반이
     되고 상한(REVALIDATE_BUDGET)을 두 배로 쓸 수 있다. 그 파일을 고치지 않기로 한 약속을
     지키려고 여기서 표기를 만들어 넘긴다.
   ──────────────────────────────────────────────────────────────────────────── */

const COMPLEX_PREFIX = "/complex/";

/** 장식 파라미터(percent-encoded) + 순수 id — 중복은 접는다. 순서: 허브 사본이 먼저. */
function idsFromHref(href: string): string[] {
  if (!href.startsWith(COMPLEX_PREFIX)) return [];
  const decorated = href.slice(COMPLEX_PREFIX.length);
  if (!decorated) return [];
  /* base64url 문자셋에도, percent-encoding 에도 "." 이 없다 — 마지막 "." 뒤가 항상 순수 id 다
     (kapt.* 는 pureIdFromParam 이 그대로 통과시킨다). */
  const pure = pureIdFromParam(decorated);
  return pure && pure !== decorated ? [decorated, pure] : [decorated];
}

/**
 * 단지 id 하나 → invalidateComplexIds 에 넘길 id 표기 목록.
 * 입력은 순수 base64url id · kapt id · 장식 파라미터 아무거나 받는다(멱등).
 */
export function complexCacheIds(rawId: string | null | undefined): string[] {
  const raw = typeof rawId === "string" ? rawId.trim() : "";
  if (!raw) return [];
  return idsFromHref(complexHrefFromId(raw));
}

/**
 * (region_name, complex_name) → 같은 목록.
 * 실거래 행·매물처럼 id 가 아니라 이름만 아는 쓰기 지점에서 쓴다.
 * complexHrefFromNames 는 complex-store 의 encodeComplexId 와 **같은 base64url** 을 만든다.
 */
export function complexCacheIdsFromNames(
  region: string | null | undefined,
  name: string | null | undefined,
): string[] {
  const r = typeof region === "string" ? region.trim() : "";
  const n = typeof name === "string" ? name.trim() : "";
  if (!r || !n) return [];
  return idsFromHref(complexHrefFromNames(r, n));
}
