import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV } from "../../app/components/nav-data.ts";
import {
  PAYMENT_METHODS_PATH,
  REVIEW_CHECKOUT_PATH,
} from "../../lib/payments/payment-methods.ts";
import { TOWN_TAB_EXTRA_PREFIXES, tabBarActive } from "../../lib/client/shell-gates.ts";
import { TOWN_CATEGORY_LINKS } from "../../lib/town/category-links.ts";

/* [1003] 결제 진입로 + 동네 메뉴 — 셸 내비의 **사실**을 잠근다.
 *
 * 왜 이 테스트가 생겼나:
 *  ① 2026-09 토스 도메인 심사가 두 번 반려됐다("홈페이지 내 결제수단 신용/체크카드가
 *     확인되지 않습니다"). 2026-09-16 13:57 KST 심사 세션 실측은 `/` → `/subscription`
 *     (13.5초) → `/` 이탈이고 `/subscription/checkout` 페이지뷰는 0건이었다. 원인 중
 *     하나가 GNB 에 요금제·결제 진입점이 아예 없었던 것(푸터 한 줄이 전부)이다.
 *     NAV 는 데스크탑 GNB·모바일 전체 메뉴·좌측 내비가 공유하는 단일 데이터라,
 *     여기서 요금제 대분류가 사라지면 세 표면이 한꺼번에 사라진다.
 *  ② 소유자 지시 2026-09-17 "메뉴에서 동네이야기가 사라졌어" — 991 에서 모바일 탭바의
 *     '동네'를 '분석'으로 바꾼 것이 원인이었다. 탭이 켜지는 경로 목록은 동네이야기
 *     카테고리(lib/town/category-links)와 어긋나면 안 된다.
 *
 * app/components/nav-data.ts 는 JSX 도 "use client" 도 없는 순수 데이터 모듈이라
 * 그대로 import 해서 검사한다(파일을 fs 로 읽어 정규식으로 보는 것보다 정확하다).
 */

/** 라벨→항목. 대분류를 이름으로 찾을 때만 쓴다. */
function group(label: string) {
  const g = NAV.find((n) => n.label === label);
  assert.ok(g, `NAV 에 "${label}" 대분류가 없습니다`);
  return g;
}

test("[1003] NAV 에 요금제 대분류가 있고, 카드 결제창 직행 링크를 품는다", () => {
  const pricing = group("요금제");
  assert.equal(pricing.href, "/subscription");

  const hrefs = (pricing.children ?? []).map((c) => c.href);
  /* 심사가 확인하는 두 목적지 — 경로는 lib/payments/payment-methods 가 단일 출처다.
     (nav-data 는 순수 데이터 모듈이라 import 하지 않고 여기서 일치를 잠근다.) */
  assert.ok(
    hrefs.includes(REVIEW_CHECKOUT_PATH),
    `요금제 하위에 결제창 직행(${REVIEW_CHECKOUT_PATH})이 없습니다: ${hrefs.join(" · ")}`,
  );
  assert.ok(
    hrefs.includes(PAYMENT_METHODS_PATH),
    `요금제 하위에 결제 수단 안내(${PAYMENT_METHODS_PATH})가 없습니다: ${hrefs.join(" · ")}`,
  );
  assert.ok(hrefs.includes("/subscription"), "요금제 하위에 요금제 화면 자신이 없습니다");

  /* 결제창 직행은 tier·billing 쿼리를 그대로 들고 가야 한다 — 쿼리가 빠지면
     체크아웃이 어떤 상품인지 모른 채 열린다(주간권 1회 결제). */
  assert.match(REVIEW_CHECKOUT_PATH, /^\/subscription\/checkout\?tier=pro&billing=weekly$/);
});

test("[1003] NAV 의 모든 href 는 내부 절대경로다", () => {
  /* 외부 주소(https://…)·상대경로·프로토콜 상대(//evil.com)·역슬래시 우회(/\evil.com)를
     막는다. 판정 규칙은 lib/safe-path 의 INTERNAL_PATH 와 같다. */
  const internal = /^\/(?:[^/\\]|$)/;
  for (const item of NAV) {
    assert.match(item.href, internal, `대분류 "${item.label}" 의 href`);
    for (const c of item.children ?? []) {
      assert.match(c.href, internal, `"${item.label} › ${c.label}" 의 href`);
    }
  }
});

test("[1003] 동네 대분류에 동네이야기(/town)가 남아 있다", () => {
  const town = group("동네");
  assert.equal(town.href, "/town");
  const children = town.children ?? [];
  const story = children.find((c) => c.href === "/town");
  assert.ok(story, "동네 하위에 /town(동네이야기)이 없습니다");
  assert.equal(story.label, "동네이야기");
  /* 996 에서 나란히 둔 넷 — 하나라도 빠지면 그 카테고리는 메뉴에서 사라진다 */
  for (const href of ["/town/news", "/town", "/apply", "/redevelopment"]) {
    assert.ok(
      children.some((c) => c.href === href),
      `동네 하위에 ${href} 가 없습니다`,
    );
  }
});

test("[1003] NAV 라벨은 대분류·하위 통틀어 중복이 없다", () => {
  /* 같은 이름이 두 곳에 있으면 "아까 그 메뉴"가 어디였는지 말할 수 없게 된다.
     모바일 전체 메뉴는 shortLabel 로 그리므로 그것도 함께 본다. */
  const seen = new Map<string, string>();
  const claim = (label: string, where: string) => {
    const prev = seen.get(label);
    assert.equal(prev, undefined, `라벨 "${label}" 이 ${prev} 와 ${where} 에 중복됩니다`);
    seen.set(label, where);
  };
  for (const item of NAV) {
    claim(item.label, `대분류(${item.label})`);
    for (const c of item.children ?? []) {
      claim(c.label, `${item.label} › ${c.label}`);
      if (c.shortLabel && c.shortLabel !== c.label) {
        claim(c.shortLabel, `${item.label} › ${c.label}(shortLabel)`);
      }
    }
  }
});

test("[1003] 탭바 '동네' 탭의 추가 경로는 동네이야기 카테고리와 같다", () => {
  /* TOWN_TAB_EXTRA_PREFIXES 는 카탈로그(TOWN_CATEGORY_LINKS)를 셸 번들로 끌고 들어가지
     않으려고 prefix 만 복제한 목록이다 — 복제본이 원본과 갈라지면 탭이 꺼진 채로 남는다.
     원본에서 /town 밖 경로만 추려 그대로 같은지 본다. */
  const outside = TOWN_CATEGORY_LINKS.map((l) => l.href).filter(
    (h) => h !== "/town" && !h.startsWith("/town/"),
  );
  assert.deepEqual([...TOWN_TAB_EXTRA_PREFIXES].sort(), [...outside].sort());
  assert.ok(outside.length > 0, "카테고리가 전부 /town 아래면 이 목록은 필요 없다");
});

test("[1003] 동네 탭은 /town 과 카테고리 경로에서 켜지고, 남의 경로에서는 안 켜진다", () => {
  const on = (p: string) => tabBarActive("/town", p, TOWN_TAB_EXTRA_PREFIXES);
  for (const p of [
    "/town",
    "/town/news",
    "/apply",
    "/apply/calendar",
    "/auctions",
    "/supply",
    "/redevelopment",
  ]) {
    assert.equal(on(p), true, `${p} 에서 동네 탭이 켜져야 한다`);
  }
  for (const p of ["/", "/analysis", "/map", "/townhouse", "/applyhome"]) {
    assert.equal(on(p), false, `${p} 에서 동네 탭이 켜지면 안 된다(prefix 는 세그먼트 단위)`);
  }
});
