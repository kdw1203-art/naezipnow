import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backToTopLane,
  consentBannerBottom,
  consentBodyClasses,
  isMapPath,
  loginReturnHref,
  tabBarActive,
} from "../../lib/client/shell-gates.ts";
import { TOWN_CATEGORY_LINKS } from "../../lib/town/category-links.ts";

/* [970 · A-15 · C-29 · B-08 · B-09 · A-39 · A-20] 셸 경로 판정 — 브라우저 없이 검증 가능한 순수 함수. */

test("consentBodyClasses — 배너 표식은 늘, 아래 여백(pad)은 /map 을 빼고", () => {
  assert.deepEqual([...consentBodyClasses("/")], ["nz-consent-open", "nz-consent-pad"]);
  assert.deepEqual([...consentBodyClasses("/subscription")], ["nz-consent-open", "nz-consent-pad"]);
  assert.deepEqual([...consentBodyClasses("/map")], ["nz-consent-open"]);
  assert.deepEqual([...consentBodyClasses("/map/x")], ["nz-consent-open"]);
  assert.deepEqual([...consentBodyClasses("/mapping")], ["nz-consent-open", "nz-consent-pad"], "prefix 는 세그먼트 단위");
  assert.equal(isMapPath("/map"), true);
  assert.equal(isMapPath("/mapping"), false);
  /* 기존 판정과 같은 경계를 쓴다 */
  assert.equal(consentBannerBottom("/map/x"), "calc(var(--nz-map-bottom-lane) + 8px)");
});

test("loginReturnHref — 지금 화면(경로+쿼리)으로 돌아오는 callbackUrl 을 싣는다", () => {
  assert.equal(loginReturnHref("/subscription", ""), "/login?callbackUrl=%2Fsubscription");
  assert.equal(
    loginReturnHref("/town/news", "?region=서울"),
    `/login?callbackUrl=${encodeURIComponent("/town/news?region=서울")}`,
  );
  assert.equal(loginReturnHref("/notes/abc", "q=1"), "/login?callbackUrl=%2Fnotes%2Fabc%3Fq%3D1", "물음표 없는 쿼리도 받는다");
  assert.equal(loginReturnHref("/notes", "?"), "/login?callbackUrl=%2Fnotes", "빈 쿼리는 싣지 않는다");
});

test("loginReturnHref — 홈·인증 화면에서는 맨 /login", () => {
  assert.equal(loginReturnHref("/", "?utm=1"), "/login");
  for (const p of ["/login", "/login/", "/signup", "/logout", "/forgot-password", "/reset-password/x"]) {
    assert.equal(loginReturnHref(p, "?callbackUrl=%2Fmy"), "/login", p);
  }
  assert.equal(loginReturnHref("", ""), "/login", "빈 경로도 안전");
  assert.equal(loginReturnHref("/logs", ""), "/login?callbackUrl=%2Flogs", "prefix 는 세그먼트 단위(/logout 과 다르다)");
});

test("tabBarActive — 홈은 정확 일치, 나머지는 세그먼트 prefix", () => {
  assert.equal(tabBarActive("/", "/"), true);
  assert.equal(tabBarActive("/", "/map"), false);
  assert.equal(tabBarActive("/map", "/map"), true);
  assert.equal(tabBarActive("/map", "/map/x"), true);
  assert.equal(tabBarActive("/map", "/mapping"), false, "prefix 는 세그먼트 단위");
  assert.equal(tabBarActive("/my", "/my/points"), true);
});

test("tabBarActive — 동네 탭은 동네이야기 카테고리 경로 전부에서 켜진다", () => {
  const hrefs = TOWN_CATEGORY_LINKS.map((l) => l.href);
  assert.equal(tabBarActive("/town", "/town", hrefs), true);
  assert.equal(tabBarActive("/town", "/town/news/abc", hrefs), true);
  for (const h of hrefs) {
    assert.equal(tabBarActive("/town", h, hrefs), true, h);
    assert.equal(tabBarActive("/town", `${h}/detail`, hrefs), true, `${h}/detail`);
  }
  assert.equal(tabBarActive("/town", "/apply", hrefs), true, "app/town 밖의 카테고리(/apply)도");
  assert.equal(tabBarActive("/town", "/applyx", hrefs), false);
  assert.equal(tabBarActive("/town", "/qna", []), false, "목록이 없으면 /town 접두만");
  assert.equal(tabBarActive("/my", "/qna", hrefs), false, "다른 탭에는 영향 없음");
});

test("backToTopLane — FAB 가 실제로 있는 /notes·/town 정확 일치만 lifted", () => {
  assert.equal(backToTopLane("/notes"), "lifted");
  assert.equal(backToTopLane("/town"), "lifted");
  assert.equal(backToTopLane("/notes/abc"), "default", "노트 상세엔 FAB 가 없다");
  assert.equal(backToTopLane("/town/news"), "default");
  assert.equal(backToTopLane("/"), "default");
  assert.equal(backToTopLane("/complex/123"), "default", "액션 바는 body 클래스로 CSS 가 판정");
});

test("backToTopLane — 저장 바가 있는 작성·수정 폼은 savebar", () => {
  assert.equal(backToTopLane("/notes/new"), "savebar");
  assert.equal(backToTopLane("/notes/abc-123/edit"), "savebar");
  assert.equal(backToTopLane("/notes/abc/edit/x"), "default");
  assert.equal(backToTopLane("/notes/new/x"), "default");
});
