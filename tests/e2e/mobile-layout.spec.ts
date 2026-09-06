import { test, expect, type Page } from "@playwright/test";

/**
 * [968 · 50] 모바일 레이아웃 회귀 게이트 — playwright.config.ts 의 `mobile` 프로젝트
 * (devices["Pixel 5"]: 393×851 · 터치 · 모바일 UA)에서만 돈다(testMatch: mobile-*.spec.ts).
 *
 * 두 가지만 본다. 둘 다 "기능이 아니라 형태"의 회귀라 스모크가 잡지 못하던 것이다:
 *   (a) 가로 오버플로 — 문서 폭이 뷰포트보다 넓으면 화면이 옆으로 흔들리고 고정 요소가
 *       잘린다. 표·긴 URL·min-width 카드 하나가 새어 나와도 페이지 전체가 그렇게 된다.
 *   (b) 하단 탭바 터치 타깃 — 탭바의 모든 <a>/<button> 이 44×44 이상. 원(＋)은 음수
 *       마진으로 링크 상자 위로 솟아 있어 링크 자체의 rect 는 44 미만일 수 있다 —
 *       누르면 링크가 반응하는 영역은 자손까지 포함한 합집합이므로 그걸 잰다.
 *
 * 원칙(스모크와 같다): DB 실데이터에 의존하는 단언 금지 — 빈 상태로 degrade 한 화면에서도
 * 껍데기(셸·탭바)는 같은 규칙을 지켜야 한다. 기준 URL·서버 기동은 e2e.yml 이 그대로 맡는다.
 */

const TABBAR = 'nav[aria-label="하단 내비게이션"]';
const MIN_TARGET = 44;

/** 탭바가 있는 화면(PageShell)과 없는 화면(/login) — 없는 곳에서 (b) 를 건너뛰되 그 사실을 명시 */
const ROUTES: Array<{ path: string; name: string; tabbar: boolean }> = [
  { path: "/", name: "홈", tabbar: true },
  { path: "/notes", name: "임장노트 목록", tabbar: true },
  { path: "/town", name: "동네이야기", tabbar: true },
  { path: "/subscription", name: "구독", tabbar: true },
  { path: "/login", name: "로그인", tabbar: false },
];

async function open(page: Page, path: string) {
  /* 모션은 끈다 — 진입 애니메이션 도중(transform 진행 중)에 rect 를 읽으면 값이 흔들린다. */
  await page.emulateMedia({ reducedMotion: "reduce" });
  /* 쿠키 동의는 결정된 상태로 시작한다(a11y·install-prompt 스위트와 같은 키). 이 스위트의
     대상은 셸이지 배너가 아니고, 결정 전 배너는 릴리스마다 위치가 달라 rect 비교를 흐린다. */
  await page.addInitScript(() => {
    localStorage.setItem(
      "nz_cookie_consent",
      JSON.stringify({ analytics: false, decidedAt: new Date().toISOString() }),
    );
    localStorage.setItem("nuguzip:beta-notice-v1", new Date().toISOString());
  });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main, body").first()).toBeVisible({ timeout: 15_000 });
  /* 스타일이 붙기 전에 재면 모든 링크가 인라인 텍스트라 44px 미만으로 나온다(거짓 빨강).
     a11y 스위트의 assertStylesLoaded 와 같은 이유·같은 판정(:root 토큰이 비어 있지 않음). */
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--text-3").trim(),
        ),
      { timeout: 10_000, message: "globals.css 가 적용되지 않았습니다 — 레이아웃 측정이 무의미합니다." },
    )
    .not.toBe("");
}

for (const route of ROUTES) {
  test(`모바일 레이아웃: ${route.name} (${route.path}) — 가로 오버플로 없음`, async ({ page }) => {
    await open(page, route.path);
    /* 폭은 정착한 뒤에 한 번 잰다 — load 뒤 폰트까지 붙고(document.fonts.ready) 한 프레임
       더 지난 값. 폴링으로 "한 번이라도 맞으면 통과"가 되면 늦게 새어 나오는 요소를 놓친다. */
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(300);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      scrollWidth,
      `${route.path}: 문서 폭 ${scrollWidth}px > 뷰포트 ${innerWidth}px — 가로로 새어 나온 요소가 있습니다`,
    ).toBeLessThanOrEqual(innerWidth + 1);
  });

  test(`모바일 레이아웃: ${route.name} (${route.path}) — 하단 탭바 터치 타깃 ≥ 44×44`, async ({
    page,
  }) => {
    await open(page, route.path);
    const tabbar = page.locator(TABBAR);
    if (!route.tabbar) {
      /* 탭바가 없는 화면임을 단언한다 — 나중에 생기면 목록을 고쳐 검사 대상에 넣으라는 신호 */
      await expect(tabbar).toHaveCount(0);
      return;
    }
    await expect(tabbar).toBeVisible({ timeout: 15_000 });

    const targets = await page.evaluate(
      ({ sel, min }) => {
        const nav = document.querySelector(sel);
        if (!nav) return [];
        const out: Array<{ label: string; w: number; h: number; visible: boolean }> = [];
        for (const el of nav.querySelectorAll<HTMLElement>("a, button")) {
          const cs = getComputedStyle(el);
          const own = el.getBoundingClientRect();
          const visible =
            cs.display !== "none" && cs.visibility !== "hidden" && own.width > 0 && own.height > 0;
          if (!visible) {
            out.push({ label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", w: 0, h: 0, visible });
            continue;
          }
          /* 자손까지 포함한 합집합 — 음수 마진으로 상자 밖으로 솟은 원도 누르면 링크다 */
          let left = own.left;
          let top = own.top;
          let right = own.right;
          let bottom = own.bottom;
          for (const child of el.querySelectorAll<HTMLElement>("*")) {
            const r = child.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            left = Math.min(left, r.left);
            top = Math.min(top, r.top);
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
          }
          out.push({
            label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
            w: Math.round((right - left) * 10) / 10,
            h: Math.round((bottom - top) * 10) / 10,
            visible,
          });
        }
        return out.filter((t) => t.visible || t.w < min || t.h < min);
      },
      { sel: TABBAR, min: MIN_TARGET },
    );

    /* 탭 5개(홈·지도·기록·동네·마이)가 전부 보여야 검사가 의미 있다 — 0개면 빈 검사다 */
    const visibleTargets = targets.filter((t) => t.visible);
    expect(visibleTargets.length, `${route.path}: 탭바에 보이는 링크가 없습니다`).toBeGreaterThanOrEqual(5);

    const small = visibleTargets.filter((t) => t.w < MIN_TARGET || t.h < MIN_TARGET);
    expect(
      small,
      small.length === 0
        ? ""
        : `\n${route.path} 탭바 터치 타깃 미달(${MIN_TARGET}px):\n${small
            .map((t) => `  ${t.label || "(이름 없음)"} — ${t.w}×${t.h}`)
            .join("\n")}\n`,
    ).toEqual([]);
  });
}
