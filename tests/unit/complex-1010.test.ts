/* [1010] 단지 축 — ISR TTL 6시간 → 7일로 넓히면서 **비움**이 신선도를 맡게 된 자리의 회귀 테스트.
 *
 * 고정하는 규칙 두 가지:
 *  1) 적재가 "이번에 실제로 바꾼 단지" 집합을 모으는 규칙 — 중복 제거·순서 보존·상한
 *     (lib/market/touched-complexes.ts). 상한이 없으면 크론 응답과 메모리가 이 목록을 따라 큰다.
 *  2) 그 집합을 무효화에 넘길 **id 표기** 규칙 (lib/complex/complex-cache-paths.ts).
 *     허브는 `/complex/{슬러그}.{base64id}` 로, 임베드는 `/embed/complex/{base64id}` 로
 *     캐시된다 — 순수 id 하나만 넘기면 허브가 안 비워진다(미들웨어가 308 하는 주소라
 *     그쪽엔 ISR 사본이 없다). 이 테스트가 그 사고를 다시 잡는다.
 *
 * 서버 전용 의존(supabase·next/cache)이 붙은 모듈은 이 러너에서 불러올 수 없으므로,
 * 검증 대상은 일부러 순수 모듈로 갈라 두었다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createTouchedComplexSink, TOUCHED_COMPLEX_CAP } from "../../lib/market/touched-complexes.ts";
import {
  complexCacheIds,
  complexCacheIdsFromNames,
} from "../../lib/complex/complex-cache-paths.ts";
import {
  complexHrefFromNames,
  decodeNameIdSafe,
  COMPLEX_ID_SEP,
} from "../../lib/seo/complex-slug.ts";

/* lib/complex/complex-store.ts 의 encodeComplexId 와 **같은 식**을 한 줄로 다시 쓴다.
   그 파일은 supabase(server-only)를 딸려 와 여기서 불러올 수 없는데, 두 구현이 갈라지면
   무효화 경로가 통째로 빗나가므로 등치를 테스트로 잡아 둔다. */
function encodeComplexIdLikeStore(region: string, name: string): string {
  return Buffer.from(`${region}${COMPLEX_ID_SEP}${name}`, "utf8").toString("base64url");
}

/* ────────────────────────── 1) 적재가 모으는 "바뀐 단지" 집합 ────────────────────────── */

test("touched sink — 같은 단지를 여러 행에서 봐도 한 번만, 적재 순서 그대로", () => {
  const sink = createTouchedComplexSink();
  sink.note("서울 강남구", "은마");
  sink.note("서울 강남구", "은마"); // 같은 단지의 다른 거래 행
  sink.note("서울 송파구", "헬리오시티");
  sink.note("서울 강남구", "래미안대치팰리스");
  assert.deepEqual(sink.list(), [
    { region: "서울 강남구", name: "은마" },
    { region: "서울 송파구", name: "헬리오시티" },
    { region: "서울 강남구", name: "래미안대치팰리스" },
  ]);
  assert.equal(sink.truncated(), false);
});

test("touched sink — 같은 단지명이라도 지역이 다르면 다른 단지다", () => {
  const sink = createTouchedComplexSink();
  sink.note("서울 중구", "삼성래미안");
  sink.note("부산 중구", "삼성래미안");
  assert.equal(sink.list().length, 2);
});

test("touched sink — 앞뒤 공백은 다듬고, 빈 값은 세지 않는다", () => {
  const sink = createTouchedComplexSink();
  sink.note("  서울 강남구 ", " 은마 ");
  sink.note("", "은마");
  sink.note("서울 강남구", "   ");
  assert.deepEqual(sink.list(), [{ region: "서울 강남구", name: "은마" }]);
});

test("touched sink — 상한을 넘으면 더 담지 않고 truncated 를 세운다(메모리·응답 보호)", () => {
  const sink = createTouchedComplexSink(3);
  for (let i = 0; i < 10; i += 1) sink.note("서울 강남구", `단지${i}`);
  assert.equal(sink.list().length, 3);
  assert.equal(sink.truncated(), true);
  /* 상한 안이면 표식은 서지 않는다 — "잘랐다"와 "다 담았다"를 섞지 않는다 */
  const small = createTouchedComplexSink(3);
  small.note("서울 강남구", "은마");
  assert.equal(small.truncated(), false);
});

test("touched sink — 상한 뒤에 온 중복은 새로 자리를 차지하지 않는다", () => {
  const sink = createTouchedComplexSink(2);
  sink.note("서울 강남구", "A");
  sink.note("서울 강남구", "B");
  sink.note("서울 강남구", "A"); // 이미 담긴 단지 — 상한과 무관
  assert.equal(sink.truncated(), false);
  sink.note("서울 강남구", "C");
  assert.equal(sink.truncated(), true);
  assert.deepEqual(sink.list().map((c) => c.name), ["A", "B"]);
});

test("기본 상한은 2,000 — 슬라이스 하나(시군구 16곳)를 덮되 응답을 키우지 않는 값", () => {
  assert.equal(TOUCHED_COMPLEX_CAP, 2_000);
});

/* ────────────────────────── 2) 무효화에 넘길 id 표기 ────────────────────────── */

test("이름 → id 표기: 허브의 **정규 주소**와 임베드의 **순수 id** 를 모두 낸다", () => {
  const region = "서울 강남구";
  const name = "은마";
  const ids = complexCacheIdsFromNames(region, name);

  const pure = encodeComplexIdLikeStore(region, name);
  // 임베드 사본의 키(순수 id)가 반드시 들어 있어야 한다
  assert.ok(ids.includes(pure), `순수 id 누락: ${JSON.stringify(ids)}`);

  // 허브 사본의 키 = 사이트맵·canonical 이 내는 바로 그 경로
  const canonical = complexHrefFromNames(region, name);
  assert.ok(
    ids.some((id) => `/complex/${id}` === canonical),
    `정규 주소 누락: ${canonical} vs ${JSON.stringify(ids)}`,
  );

  /* 이 테스트의 핵심 — 순수 id 만 넘기면 허브는 안 비워진다(그 주소는 308 이다).
     두 표기가 실제로 다르다는 사실을 못 박아 둔다. */
  assert.notEqual(`/complex/${pure}`, canonical);
});

test("id 왕복 — 장식 파라미터 안의 꼬리 id 가 원래 (지역, 단지명)으로 되돌아온다", () => {
  const region = "경기 성남시 분당구";
  const name = "파크뷰";
  const ids = complexCacheIdsFromNames(region, name);
  const pure = encodeComplexIdLikeStore(region, name);
  assert.deepEqual(decodeNameIdSafe(pure), { region, name });
  assert.ok(ids.includes(pure));
});

test("id 표기는 멱등 — 순수 id·장식 파라미터·둘 중 무엇을 넣어도 같은 집합", () => {
  const region = "서울 송파구";
  const name = "헬리오시티";
  const fromNames = complexCacheIdsFromNames(region, name);
  const pure = encodeComplexIdLikeStore(region, name);
  const decorated = complexHrefFromNames(region, name).slice("/complex/".length);

  assert.deepEqual(complexCacheIds(pure), fromNames);
  assert.deepEqual(complexCacheIds(decorated), fromNames);
});

test("kapt id 는 슬러그가 붙지 않는다 — 표기가 하나로 접힌다(경로 낭비 없음)", () => {
  assert.deepEqual(complexCacheIds("kapt.A10027336"), ["kapt.A10027336"]);
});

test("빈 값·해석 불가 id 는 아무것도 비우지 않는다(모르는 단지를 찍지 않는다)", () => {
  assert.deepEqual(complexCacheIds(""), []);
  assert.deepEqual(complexCacheIds(null), []);
  assert.deepEqual(complexCacheIds(undefined), []);
  assert.deepEqual(complexCacheIdsFromNames("서울 강남구", ""), []);
  assert.deepEqual(complexCacheIdsFromNames("", "은마"), []);
});

test("장식 파라미터는 실제 요청 경로와 같은 표기(percent-encoded)여야 한다", () => {
  /* revalidatePath 는 렌더 때 남은 경로 태그와 **문자열로** 맞춰진다. 그 태그는
     new URL(...).pathname, 즉 percent-encoded 형태다 — 한글을 날것으로 넘기면 빗나간다. */
  const ids = complexCacheIdsFromNames("서울 강남구", "은마");
  const decorated = ids[0];
  assert.ok(!/[^\x21-\x7e]/.test(decorated), `ASCII 가 아닌 문자가 남았다: ${decorated}`);
  assert.ok(decorated.includes("%"), "한글 슬러그가 인코딩되지 않았다");
  assert.equal(decodeURIComponent(decorated).split(".").pop(), ids[1]);
});
